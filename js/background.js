/* SoundSniff background — sekme yakalamayı yönetir, tanımayı yapar,
   sonucu storage + popup'a iletir. Sürekli dinleme döngüsünü de besler. */
(function () {
  'use strict';

  var MAX_HISTORY = 50;
  var MAX_AUDIO_BYTES = 8 * 1024 * 1024;

  // Otomatik (arka plan) yakalamalar için bekleyen çözümleyiciler.
  // Popup kapalıyken de sonucu alabilmek için mesaj yanıtı beklenmiyor,
  // kimliğe göre eşleştiriliyor.
  var pendingAuto = {};

  var auto = (typeof window !== 'undefined' && window.SoundSniffAutoListen) || null;
  var api = (typeof window !== 'undefined' && window.SoundSniffRecognize) || null;
  var sigApi = (typeof window !== 'undefined' && window.SoundSniffSignature) || null;

  // Ses durumu, autoListen'in kendi durumundan AYRI bir anahtarda tutulur.
  // Aynı nesneyi iki yazici paylasmak onceki bir hatayi geri getirirdi:
  // birinin sayacini digerinin yazimi ezebilir.
  var AUDIO_KEY = 'audioState';
  // Periyodik dogrulama: imza ayni dese bile her N kontrolde bir kez API'ye
  // sorulur. Yanlis "same" veren bir cift, etkisini en fazla bir sonraki
  // parcaya kadar gosterir; kotanin kirliligi bu yuzden sinirli kalir.
  var VERIFY_EVERY = 5;

  // ---------- Kurulum ----------

  browser.runtime.onInstalled.addListener(function () {
    browser.storage.local.get(['history', 'recordingLength', 'autoStart']).then(function (data) {
      var patch = {};
      if (!Array.isArray(data.history)) patch.history = [];
      if (!(parseInt(data.recordingLength, 10) >= 5)) patch.recordingLength = 10;
      if (typeof data.autoStart === 'undefined') patch.autoStart = true;
      if (Object.keys(patch).length) return browser.storage.local.set(patch);
      return null;
    }).catch(function (err) {
      console.error('SoundSniff init error:', err);
    });
  });

  // Tarayıcı yeniden başladığında açık kalmış sürekli dinlemeyi canlandır.
  browser.runtime.onStartup.addListener(function () {
    if (!auto) return;
    auto.getState().then(function (s) {
      if (s.enabled) auto.start();
    }).catch(function () {});
  });

  if (auto) {
    auto.init({
      getDurationSec: function () { return getDurationSec(); },
      capture: function (secs, expectedKey) { return captureForAuto(secs, expectedKey); },
      onNewTrack: function (song, backend) {
        notify({ cmd: 'result', song: song, backend: backend });
      }
    });
  }

  // ---------- Yardımcılar ----------

  function notify(payload) {
    try {
      browser.runtime.sendMessage(payload).catch(function () {});
    } catch (e) { /* popup kapalı olabilir */ }
  }

  function getDurationSec() {
    return browser.storage.local.get(['recordingLength']).then(function (d) {
      var len = parseInt(d.recordingLength, 10);
      return (len >= 5 && len <= 30) ? len : 10;
    }).catch(function () { return 10; });
  }

  function countRequest() {
    if (auto) auto.bumpRequest(1);
  }

  function songKey(song) {
    var a = String((song && song.artist) || '').trim().toLowerCase();
    var t = String((song && song.title) || '').trim().toLowerCase();
    return a + '|' + t;
  }

  function loadAudioState() {
    return browser.storage.local.get([AUDIO_KEY]).then(function (d) {
      var s = (d && d[AUDIO_KEY]) || {};
      return {
        signature: s.signature || null,
        confirmedKey: s.confirmedKey || '',
        sinceVerify: parseInt(s.sinceVerify, 10) || 0,
        skipped: parseInt(s.skipped, 10) || 0
      };
    }).catch(function () {
      return { signature: null, confirmedKey: '', sinceVerify: 0, skipped: 0 };
    });
  }

  function saveAudioState(s) {
    return browser.storage.local.set({ audioState: s }).catch(function () {});
  }

  /* Arka plan döngüsünde tanıma isteğini harcamadan önce soruya bak:
     bu ses, bir önceki kabul edilmiş kayıttan farklı mı?

     Döner: true -> atla (hiçbir istek gönderilmedi, kota harcanmadı)
            false -> tanımayı sürdür                                       */
  function shouldSkipRecognition(signature) {
    if (!sigApi || !signature) return Promise.resolve(false);
    return loadAudioState().then(function (st) {
      if (!st.signature) return false;

      var verdict = sigApi.compare(st.signature, signature);
      var since = st.sinceVerify + 1;
      var due = since >= VERIFY_EVERY;

      // Her durumda referans imzayı tazele: ayni parça penceresi kaydıkça
      // karşılaştırma tabanı da ilerlesin.
      st.signature = signature;

      if (verdict === 'same' && !due) {
        st.sinceVerify = since;
        st.skipped = (st.skipped + 1) || 1;
        return saveAudioState(st).then(function () { return true; });
      }

      st.sinceVerify = 0;
      return saveAudioState(st).then(function () { return false; });
    }).catch(function () { return false; });
  }

  function rememberAudio(signature, key) {
    if (!sigApi || !signature) return Promise.resolve();
    return loadAudioState().then(function (st) {
      st.signature = signature;
      st.confirmedKey = key || '';
      st.sinceVerify = 0;
      return saveAudioState(st);
    }).catch(function () {});
  }

  function resolveAuto(id, value) {
    if (!id || typeof id !== 'string') return;
    var fn = pendingAuto[id];
    if (!fn) return;
    fn(value);
  }

  function waitForAuto(id, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        finish({ ok: false, reason: 'error' });
      }, timeoutMs);
      function finish(value) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        delete pendingAuto[id];
        resolve(value);
      }
      pendingAuto[id] = finish;
    });
  }

  // ---------- Mesaj yönlendirme ----------

  browser.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || !msg.cmd) return undefined;
    if (msg.cmd === 'capture-tab') {
      handleCaptureTab(Number(msg.durationSec) || 10);
      return undefined;
    }
    if (msg.cmd === 'auto-listen-toggle' && auto) {
      auto.toggle();
      return undefined;
    }
    if (msg.cmd === 'auto-listen-start' && auto) {
      auto.start();
      return undefined;
    }
    if (msg.cmd === 'auto-listen-stop' && auto) {
      auto.stop();
      return undefined;
    }
    if (msg.cmd === 'auto-listen-budget' && auto) {
      auto.setBudget(msg.value);
      return undefined;
    }
    if (msg.cmd === 'mic-request') {
      // Mikrofon sekmesi kendi tanımasını yapar ama kotadan geçer.
      countRequest();
      return undefined;
    }
    if (msg.cmd === 'soundsniff-audio' && sender && sender.tab) {
      handleAudio(msg);
      return undefined;
    }
    if (msg.cmd === 'soundsniff-capture-failed' && sender && sender.tab) {
      resolveAuto(msg.id, { ok: false, reason: msg.reason || 'error' });
      notify({ cmd: 'capture-unavailable', reason: msg.reason || 'error' });
      return undefined;
    }
    return undefined;
  });

  // ---------- Elle (popup) yakalama ----------

  function handleCaptureTab(durationSec) {
    var secs = Math.min(30, Math.max(5, durationSec));
    browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || typeof tab.id === 'undefined') {
        notify({ cmd: 'capture-unavailable', reason: 'no-tab' });
        return;
      }
      var url = tab.url || '';
      if (url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        notify({ cmd: 'capture-unavailable', reason: 'restricted' });
        return;
      }
      sendCapture(tab.id, secs).catch(function () {
        // Content script henüz enjekte olmamış olabilir (sayfa kurulumdan beri açık)
        injectAndRetry(tab.id, secs);
      });
    }).catch(function () {
      notify({ cmd: 'capture-unavailable', reason: 'no-tab' });
    });
  }

  function sendCapture(tabId, secs, id, expectedKey) {
    var payload = { cmd: 'soundsniff-capture', durationMs: secs * 1000 };
    if (id) {
      payload.id = id;
      payload.expectedKey = expectedKey || '';
    }
    return browser.tabs.sendMessage(tabId, payload).then(function (ack) {
      if (!ack || !ack.started) throw new Error('no-ack');
      if (!id) notify({ cmd: 'capture-started' });
    });
  }

  function injectAndRetry(tabId, secs, id, expectedKey) {
    if (!browser.scripting || !browser.scripting.executeScript) {
      if (id) resolveAuto(id, { ok: false, reason: 'reload' });
      else notify({ cmd: 'capture-unavailable', reason: 'reload' });
      return;
    }
    browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ['js/content.js']
    }).then(function () {
      return sendCapture(tabId, secs, id, expectedKey);
    }).catch(function () {
      if (id) resolveAuto(id, { ok: false, reason: 'reload' });
      else notify({ cmd: 'capture-unavailable', reason: 'reload' });
    });
  }

  // ---------- Otomatik (sürekli dinleme) yakalama ----------

  function captureForAuto(secs, expectedKey) {
    return browser.tabs.query({ active: true, currentWindow: true }).then(function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || typeof tab.id === 'undefined') return { ok: false, reason: 'no-tab' };

      var url = tab.url || '';
      // Arka planda 'tabs' izni yok; URL görünmüyorsa denemeyi yap,
      // kararı content script versin (medya yoksa 'no-media' döner).
      if (url && url.indexOf('http://') !== 0 && url.indexOf('https://') !== 0) {
        return { ok: false, reason: 'restricted' };
      }

      var id = 'auto-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
      var timeout = Math.min(90000, (secs * 1000) + 25000);
      var waiter = waitForAuto(id, timeout);

      return sendCapture(tab.id, secs, id, expectedKey).catch(function () {
        // Content script enjekte edilmemiş olabilir.
        injectAndRetry(tab.id, secs, id, expectedKey);
      }).then(function () {
        // waiter kendi zaman aşımıyla daima çözülür.
        return waiter;
      }).catch(function () {
        resolveAuto(id, { ok: false, reason: 'error' });
        return { ok: false, reason: 'error' };
      });
    }).catch(function () {
      return { ok: false, reason: 'no-tab' };
    });
  }

  // ---------- Tanıma ----------

  function handleAudio(msg) {
    var autoId = (msg.id && typeof msg.id === 'string') ? msg.id : '';
    var buf = msg.buffer;
    if (!buf || !buf.byteLength || buf.byteLength > MAX_AUDIO_BYTES) {
      if (autoId) resolveAuto(autoId, { ok: false, reason: 'error' });
      else notify({ cmd: 'error', key: 'capture' });
      return;
    }
    if (!autoId) notify({ cmd: 'recognizing' });

    var blob;
    try {
      blob = new Blob([buf], { type: msg.mime || 'audio/webm' });
    } catch (e) {
      if (autoId) resolveAuto(autoId, { ok: false, reason: 'error' });
      else notify({ cmd: 'error', key: 'capture' });
      return;
    }

    if (!api) {
      if (autoId) resolveAuto(autoId, { ok: false, reason: 'error' });
      else notify({ cmd: 'error', key: 'service' });
      return;
    }

    // Arka plan döngüsünde ilk kapı yerel imza: ses aynıysa hiçbir istek
    // gönderilmez. Elle yapılan dinlemede bu eleme uygulanmaz — kullanıcı
    // düğmeye bastığında istek göndermek onun niyetidir.
    if (autoId && msg.signature) {
      shouldSkipRecognition(msg.signature).then(function (skip) {
        if (skip) {
          resolveAuto(autoId, { ok: true, matched: false, sameAudio: true });
          return;
        }
        countRequest();
        runRecognition(blob, msg, autoId);
      }).catch(function () {
        countRequest();
        runRecognition(blob, msg, autoId);
      });
      return;
    }

    countRequest();
    runRecognition(blob, msg, autoId);
  }

  function runRecognition(blob, msg, autoId) {
    api.recognizeBlob(blob, msg.name || 'capture.webm').then(function (r) {
      if (!r || !r.matched) {
        if (autoId) resolveAuto(autoId, { ok: true, matched: false, limited: !!r.limited });
        else notify({ cmd: 'no-result' });
        return;
      }

      var key = songKey(r.song);

      // Aynı şarkı hâlâ çalıyor: geçmişe yeniden yazma, popup'ı zıplatma.
      if (autoId && msg.expectedKey && key === msg.expectedKey) {
        rememberAudio(msg.signature, key);
        resolveAuto(autoId, { ok: true, matched: true, unchanged: true, key: key, song: r.song });
        return;
      }

      var backend = r.backend === 'SongFinder' ? 'songfinder' : 'audd';
      saveMatch(r.song, backend, !!autoId);
      rememberAudio(msg.signature, key);
      if (autoId) {
        resolveAuto(autoId, { ok: true, matched: true, unchanged: false, key: key, song: r.song, backend: backend });
      }
    }).catch(function (err) {
      console.error('SoundSniff recognize error:', err);
      if (autoId) resolveAuto(autoId, { ok: false, reason: 'error' });
      else notify({ cmd: 'error', key: 'network' });
    });
  }

  // ---------- Geçmiş ----------

  function cleanLinks(links, safe) {
    var out = { spotify: '', apple: '', deezer: '', youtube: '' };
    if (!links) return out;
    ['spotify', 'apple', 'deezer', 'youtube'].forEach(function (k) {
      var v = links[k];
      if (typeof v === 'string' && safe(v)) out[k] = v.slice(0, 500);
    });
    return out;
  }

  /* silent=true: otomatik döngüden geldiyse popup'a anlık bildirim gönderme;
     auto-listen kendi durum yayınını yapar. */
  function saveMatch(song, backend, silent) {
    var safe = api ? api.isSafeUrl : function () { return false; };
    var entry = {
      artist: String(song.artist || '').slice(0, 200),
      title: String(song.title || '').slice(0, 200),
      album: String(song.album || '').slice(0, 200),
      link: safe(song.link) ? song.link : '',
      artwork: safe(song.artwork) ? song.artwork : '',
      links: cleanLinks(song.links, safe),
      timestamp: Date.now()
    };
    browser.storage.local.get(['history']).then(function (data) {
      var h = Array.isArray(data.history) ? data.history : [];
      h = h.filter(function (x) {
        return !(x.artist === entry.artist && x.title === entry.title);
      });
      h.unshift(entry);
      h = h.slice(0, MAX_HISTORY);
      return browser.storage.local.set({
        history: h,
        lastResult: { song: entry, backend: backend, at: Date.now() }
      });
    }).then(function () {
      if (!silent) notify({ cmd: 'result', song: entry, backend: backend });
    }).catch(function (err) {
      console.error('SoundSniff save error:', err);
      if (!silent) notify({ cmd: 'result', song: entry, backend: backend });
    });
  }
})();