/* SoundSniff mikrofon sekmesi — gerçek sekmede açıldığı için Firefox
   mikrofon izin penceresi burada düzgün çalışır. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  var app = $('app');
  var statusText = $('status-text');
  var statusDot = $('status-dot');
  var disc = $('disc');
  var eq = $('eq');
  var songArtist = $('song-artist');
  var songTitle = $('song-title');
  var songMeta = $('song-meta');
  var songLinks = $('song-links');

  $('btn-close').addEventListener('click', function () { window.close(); });

  function setState(next, text) {
    app.setAttribute('data-state', next);
    if (text) statusText.textContent = text;
    var live = (next === 'listening' || next === 'working' || next === 'result');
    statusDot.classList.toggle('live', live);
    disc.classList.toggle('spinning', live);
    eq.classList.toggle('on', next === 'listening' || next === 'working');
  }

  function detectMimeType() {
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (var i = 0; i < types.length; i++) {
      try {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) return types[i];
      } catch (e) {}
    }
    return '';
  }

  browser.storage.local.get(['recordingLength']).then(function (data) {
    var secs = parseInt(data.recordingLength, 10);
    if (!(secs >= 5 && secs <= 30)) secs = 10;
    start(secs);
  }).catch(function () { start(10); });

  function start(secs) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error', 'Bu tarayıcı mikrofon kaydını desteklemiyor.');
      return;
    }
    setState('listening', 'Mikrofon izni bekleniyor…');
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      setState('listening', 'Dinleniyor… (' + secs + ' sn)');
      var chunks = [];
      var mime = detectMimeType();
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setState('error', 'Kayıt başlatılamadı.');
        return;
      }
      rec.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (!chunks.length) {
          setState('error', 'Ses kaydedilemedi.');
          return;
        }
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
        recognize(blob);
      };
      rec.onerror = function () {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        setState('error', 'Kayıt sırasında hata oldu.');
      };
      try { rec.start(); } catch (e) {
        setState('error', 'Kayıt başlatılamadı.');
        return;
      }
      setTimeout(function () {
        try { if (rec.state === 'recording') rec.stop(); } catch (e) {}
      }, secs * 1000);
    }).catch(function (err) {
      var msg = 'Mikrofon izni verilmedi. Adres çubuğundaki ikona tıklayıp izin ver, sonra sekmeyi yenile.';
      if (err && err.name === 'NotFoundError') msg = 'Mikrofon bulunamadı.';
      else if (err && err.name === 'NotReadableError') msg = 'Mikrofon başka uygulama tarafından kullanılıyor.';
      setState('error', msg);
    });
  }

  function recognize(blob) {
    setState('working', 'Tanımlanıyor…');
    var api = window.SoundSniffRecognize;
    if (!api) {
      setState('error', 'Tanıma servisi yüklenemedi.');
      return;
    }
    var name = (blob.type || '').indexOf('ogg') !== -1 ? 'mic.ogg' : 'mic.webm';
    api.recognizeBlob(blob, name).then(function (r) {
      if (!r.matched) {
        setState('noresult', 'Eşleşme bulunamadı. Müziğe yaklaşıp tekrar dene.');
        return;
      }
      showResult(r.song);
      saveMatch(r.song, r.backend === 'SongFinder' ? 'SongFinder ile bulundu' : 'AudD ile bulundu');
    }).catch(function (err) {
      console.error('SoundSniff mic recognize error:', err);
      setState('error', 'Bağlantı hatası. İnterneti kontrol edip tekrar dene.');
    });
  }

  function showResult(song) {
    songArtist.textContent = song.artist || 'Bilinmeyen sanatçı';
    songTitle.textContent = song.title || 'Bilinmeyen şarkı';
    songMeta.textContent = [song.album, song.extra].filter(Boolean).join(' · ');
    songLinks.innerHTML = '';
    if (api_safe(song.link)) {
      var a = document.createElement('a');
      a.className = 'link-btn primary';
      a.textContent = 'Şarkıyı aç';
      a.href = song.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      songLinks.appendChild(a);
      songLinks.classList.remove('hidden');
    }
    setState('result', 'Bulundu');
    try {
      browser.runtime.sendMessage({ cmd: 'mic-result' }).catch(function () {});
    } catch (e) {}
  }

  function api_safe(url) {
    return window.SoundSniffRecognize && window.SoundSniffRecognize.isSafeUrl(url);
  }

  function saveMatch(song, backendLabel) {
    var safe = window.SoundSniffRecognize.isSafeUrl;
    var entry = {
      artist: String(song.artist || '').slice(0, 200),
      title: String(song.title || '').slice(0, 200),
      album: String(song.album || '').slice(0, 200),
      link: safe(song.link) ? song.link : '',
      artwork: safe(song.artwork) ? song.artwork : '',
      timestamp: Date.now()
    };
    browser.storage.local.get(['history']).then(function (data) {
      var h = Array.isArray(data.history) ? data.history : [];
      h = h.filter(function (x) { return !(x.artist === entry.artist && x.title === entry.title); });
      h.unshift(entry);
      h = h.slice(0, 50);
      return browser.storage.local.set({
        history: h,
        lastResult: { song: entry, backendLabel: backendLabel, at: Date.now() }
      });
    }).catch(function (err) { console.error('SoundSniff mic save error:', err); });
  }
})();
