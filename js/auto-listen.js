/* SoundSniff auto-listen — Shazam benzeri sürekli arka plan dinleme.

   Shazam'i ayirt eden davranis: kullanici bir kez baslatir, uygulama arka
   planda dinlemeye devam eder ve sarki degistiginde kendiliginden gecer.
   Bu modul o davranisi, kota dostu bir donguyle taklit eder.

   MV3 event page askiya alinabilir: setTimeout zinciri kaybolur. Dongu hem
   kisa setTimeout hem browser.alarms ile beslenir; alarm askiya alinmis sayfayi
   geri getirip donguyu yeniden baslatir. Bu yuzden butun dongu durumu
   storage'da tutulur, hicbir adim yalnizca bellege guvenmez. */
(function (global) {
  'use strict';

  var ALARM_NAME = 'soundsniff-auto-listen';
  var STALE_MS = 90000;             // bu surede pompa olmadiysa dongu olmus demektir
  var GAP_MATCH_MS = 20000;         // eslesme sonrasi bekleme (sonraki sarki arayisi)
  var GAP_MISS_MS = 45000;          // eslesme bulunamayinca bekleme
  var GAP_CAPTURE_FAIL_MS = 30000;  // sekmede medya yoksa bekleme
  var GAP_PAUSED_MS = 1800000;      // duraklatildiginda tekrar deneme (30 dk)
  var MAX_MISSES = 5;
  var MAX_CAPTURE_FAILS = 3;
  var MIN_BUDGET = 3;
  var MAX_BUDGET = 60;
  var DEFAULT_BUDGET = 10;

  var STATE_KEY = 'autoListen';

  var provider = null;   // background.js tarafindan verilir
  var pumpTimer = null;
  var pumping = false;
  var listeners = [];

  // ---------- Yardimcilar ----------

  function today() { return new Date().toISOString().slice(0, 10); }

  function clampBudget(n) {
    n = parseInt(n, 10);
    if (!(n >= MIN_BUDGET && n <= MAX_BUDGET)) return DEFAULT_BUDGET;
    return n;
  }

  function defaults() {
    return {
      enabled: false,
      status: 'off',       // off | waiting | listening | paused
      reason: '',          // quota | no-media | no-match | limited | capture | stable
      day: today(),
      used: 0,
      budget: DEFAULT_BUDGET,
      misses: 0,
      captureFails: 0,
      currentKey: '',
      currentArtist: '',
      currentTitle: '',
      found: 0,
      lastPump: 0,
      resumeAt: 0
    };
  }

  function normalize(raw) {
    var s = (raw && typeof raw === 'object') ? raw : {};
    var base = defaults();
    for (var k in base) {
      if (Object.prototype.hasOwnProperty.call(base, k) && !(k in s)) s[k] = base[k];
    }
    // Yeni gün: sayaci sifirla. Kotanin gunluk oldugu varsayimi budur.
    if (s.day !== today()) {
      s.day = today();
      s.used = 0;
      s.status = s.enabled ? 'waiting' : 'off';
      s.reason = '';
    }
    s.budget = clampBudget(s.budget);
    s.used = Math.max(0, parseInt(s.used, 10) || 0);
    s.misses = Math.max(0, parseInt(s.misses, 10) || 0);
    s.captureFails = Math.max(0, parseInt(s.captureFails, 10) || 0);
    s.found = Math.max(0, parseInt(s.found, 10) || 0);
    return s;
  }

  function load() {
    return browser.storage.local.get([STATE_KEY]).then(function (d) {
      return normalize(d && d[STATE_KEY]);
    }).catch(function (err) {
      console.error('SoundSniff autoListen load error:', err);
      return defaults();
    });
  }

  function save(s) {
    return browser.storage.local.set({ autoListen: s }).then(function () {
      emit(s);
      return s;
    }).catch(function (err) {
      console.error('SoundSniff autoListen save error:', err);
      return s;
    });
  }

  function emit(s) {
    var snap = publicState(s);
    listeners.forEach(function (fn) {
      try { fn(snap); } catch (e) { /* abone hatasi donguyu bozmasin */ }
    });
    try {
      browser.runtime.sendMessage({ cmd: 'auto-listen-state', state: snap }).catch(function () {});
    } catch (e) { /* popup kapali */ }
  }

  function publicState(s) {
    return {
      enabled: !!s.enabled,
      status: s.status,
      reason: s.reason,
      used: s.used,
      budget: s.budget,
      found: s.found,
      artist: s.currentArtist || '',
      title: s.currentTitle || ''
    };
  }

  function clearTimer() {
    if (pumpTimer) { clearTimeout(pumpTimer); pumpTimer = null; }
  }

  function schedule(ms) {
    clearTimer();
    if (!provider) return;
    pumpTimer = setTimeout(pump, ms);
  }

  // ---------- Alarm (askiya alinma korumasi) ----------

  function syncAlarm() {
    try {
      if (!browser.alarms || !browser.alarms.create) return;
      browser.alarms.clear(ALARM_NAME).catch(function () {});
      browser.alarms.onAlarm.removeListener(onAlarm);
      browser.alarms.onAlarm.addListener(onAlarm);
    } catch (e) { /* alarms izni yoksa sadece setTimeout calisir */ }
  }

  function enableAlarm() {
    try {
      if (!browser.alarms || !browser.alarms.create) return;
      browser.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
    } catch (e) { /* yoksa dongu yalnizca setTimeout'a dayanir */ }
  }

  function disableAlarm() {
    try {
      if (!browser.alarms || !browser.alarms.clear) return;
      browser.alarms.clear(ALARM_NAME).catch(function () {});
    } catch (e) { /* yoksay */ }
  }

  function onAlarm(alarm) {
    if (!alarm || alarm.name !== ALARM_NAME) return;
    if (!provider) return;
    load().then(function (s) {
      if (!s.enabled) return;
      if (s.status === 'paused') {
        // Duraklatma suresi dolmadan uyanma: kotayi zlamak.
        if (Date.now() < (s.resumeAt || 0)) return;
        clearTimer();
        pump();
        return;
      }
      if (Date.now() - (s.lastPump || 0) < STALE_MS) return; // zaten yasiyor
      clearTimer();
      pump();
    }).catch(function () {});
  }

  // ---------- Genel API ----------

  function init(p) {
    provider = p || null;
    if (!provider) return Promise.resolve();
    syncAlarm();
    return load().then(function (s) {
      // Kurulumda acik kalmis donguyu tazele.
      if (s.enabled) { enableAlarm(); schedule(1500); }
    }).catch(function () {});
  }

  function start() {
    return load().then(function (s) {
      s.enabled = true;
      s.status = 'waiting';
      s.reason = '';
      s.misses = 0;
      s.captureFails = 0;
      s.resumeAt = 0;
      enableAlarm();
      return save(s);
    }).then(function () {
      schedule(300);
    }).catch(function (err) {
      console.error('SoundSniff autoListen start error:', err);
    });
  }

  function stop() {
    return load().then(function (s) {
      s.enabled = false;
      s.status = 'off';
      s.reason = '';
      s.misses = 0;
      s.captureFails = 0;
      s.currentKey = '';
      s.currentArtist = '';
      s.currentTitle = '';
      s.resumeAt = 0;
      clearTimer();
      disableAlarm();
      return save(s);
    }).catch(function (err) {
      console.error('SoundSniff autoListen stop error:', err);
    });
  }

  function toggle() {
    return load().then(function (s) {
      return s.enabled ? stop() : start();
    });
  }

  function setBudget(n) {
    return load().then(function (s) {
      s.budget = clampBudget(n);
      return save(s);
    }).catch(function () {});
  }

  /* Her tanima istegini say. Elle yapilan dinlemeler de kotadan gecer;
     kotanin gosterilmesi dogru olmali. Kota yalnizca otomatik donguyu
     durdurur, elle baslatilan dinlemeyi engellemez. */
  function bumpRequest(count) {
    return load().then(function (s) {
      s.used += (count || 1);
      return save(s);
    }).catch(function () {});
  }

  function getState() {
    return load().then(publicState);
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    };
  }

  // ---------- Dongu ----------

  function shouldPump(s) {
    if (!s.enabled) return false;
    if (s.status === 'paused') return Date.now() >= (s.resumeAt || 0);
    return Date.now() - (s.lastPump || 0) > STALE_MS;
  }

  function pump() {
    if (!provider || pumping) return;
    load().then(function (s) {
      if (!s.enabled) return;
      if (s.used >= s.budget) {
        // Kota bitti: donguyu durdur, cok gec olmadan tekrar dene.
        s.status = 'paused';
        s.reason = 'quota';
        s.resumeAt = Date.now() + GAP_PAUSED_MS;
        clearTimer();
        return save(s).then(function () { schedule(GAP_PAUSED_MS); });
      }
      if (s.status === 'paused' && Date.now() < (s.resumeAt || 0)) {
        clearTimer();
        return schedule(Math.max(1000, (s.resumeAt || 0) - Date.now()));
      }
      if (pumping) return;
      pumping = true;
      run(s).catch(function (err) {
        console.error('SoundSniff autoListen cycle error:', err);
      }).then(function () {
        pumping = false;
      });
    }).catch(function () {});
  }

  function run(s) {
    var secs = typeof provider.getDurationSec === 'function' ? provider.getDurationSec() : 10;
    s.lastPump = Date.now();
    if (s.status !== 'listening') { s.status = 'waiting'; s.reason = 'capture'; }
    return save(s).then(function () {
      return provider.capture(secs, s.currentKey || '');
    }).then(function (res) {
      // Tanıma sırasında background kota sayacını güncelledi. Karar vermeden
      // önce taze durum okumazsak bu turda artırdığımız sayacı ezer ve kota
      // koruması hiç çalışmaz.
      return load().then(function (fresh) {
        fresh.lastPump = s.lastPump;
        return handleResult(fresh, res);
      });
    }).catch(function (err) {
      console.error('SoundSniff autoListen run error:', err);
      s.captureFails = (s.captureFails || 0) + 1;
      return scheduleState(s, 'waiting', 'capture', GAP_CAPTURE_FAIL_MS);
    });
  }

  function scheduleState(s, status, reason, delay) {
    s.status = status;
    s.reason = reason;
    return save(s).then(function () { schedule(delay); });
  }

  function pauseAndSchedule(s, reason, delay) {
    s.status = 'paused';
    s.reason = reason;
    s.resumeAt = Date.now() + (delay || GAP_PAUSED_MS);
    return save(s).then(function () { schedule(delay); });
  }

  function handleResult(s, res) {
    // Kullanıcı yakalamayı sürerken durdurmuş olabilir: tur bitmiş sayma,
    // açık kalınmış durumu geri getirme.
    if (!s.enabled) {
      clearTimer();
      disableAlarm();
      return;
    }

    // Yakalama basarisiz: hicbir tanima istegi gonderilmedi, kota harcanmadi.
    if (!res || !res.ok) {
      s.misses = 0;
      s.captureFails = (s.captureFails || 0) + 1;
      if (s.captureFails >= MAX_CAPTURE_FAILS) {
        // Sekmede medya yok, sayfa kisitli ya da korumali icerik.
        return pauseAndSchedule(s, 'no-media', GAP_CAPTURE_FAIL_MS);
      }
      return scheduleState(s, 'waiting', 'capture', GAP_CAPTURE_FAIL_MS);
    }

    // Yakalama basarili -> background bir tanima istegi harcadi.
    s.captureFails = 0;

    if (res.limited) {
      return pauseAndSchedule(s, 'limited', GAP_MISS_MS);
    }

    if (!res.matched) {
      s.misses = (s.misses || 0) + 1;
      // Eminligimiz kalmadi: mevcut sarki kilidini kaldir ki degisiklik
      // yeniden dogrulanabilsin.
      s.currentKey = '';
      if (s.misses >= MAX_MISSES) {
        return pauseAndSchedule(s, 'no-match', GAP_MISS_MS);
      }
      return scheduleState(s, 'waiting', 'no-match', GAP_MISS_MS);
    }

    s.misses = 0;

    // Ayni sarki hala caliyor: gecmise yazma, bildirim gonderme, sadece izle.
    // expectedKey zaten background'da karsilastiriliyor; anahtar karsilastirmasi
    // da burada yapilir ki saglayici 'unchanged' bayragini atlamsa bile ayni
    // sarki gecmise iki kez girip cikmasin.
    if (res.unchanged || (s.currentKey && res.key && res.key === s.currentKey)) {
      if (!s.currentKey && res.key) s.currentKey = res.key;
      if (!s.currentArtist && res.song) {
        s.currentArtist = String(res.song.artist || '').slice(0, 200);
        s.currentTitle = String(res.song.title || '').slice(0, 200);
      }
      s.status = 'listening';
      s.reason = 'stable';
      return save(s).then(function () { schedule(GAP_MATCH_MS); });
    }

    s.found = (s.found || 0) + 1;
    var song = res.song || {};
    s.currentKey = res.key || '';
    s.currentArtist = String(song.artist || '').slice(0, 200);
    s.currentTitle = String(song.title || '').slice(0, 200);
    s.status = 'listening';
    s.reason = '';
    // Yeni parça bulundu: popup aciksa sonucu goster, gecmisi tazele.
    try {
      if (typeof provider.onNewTrack === 'function') provider.onNewTrack(song, res.backend);
    } catch (e) { /* gosterim hatasi donguyu bozmasin */ }
    return save(s).then(function () { schedule(GAP_MATCH_MS); });
  }

  global.SoundSniffAutoListen = {
    init: init,
    start: start,
    stop: stop,
    toggle: toggle,
    setBudget: setBudget,
    bumpRequest: bumpRequest,
    getState: getState,
    subscribe: subscribe
  };
})(typeof window !== 'undefined' ? window : this);