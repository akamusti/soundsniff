/* SoundSniff mikrofon sekmesi — gerçek sekmede açıldığı için Firefox
   mikrofon izin penceresi burada düzgün çalışır. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function t(key, vars) {
    try {
      if (typeof window.I18N !== 'undefined') return window.I18N.t(key, vars);
    } catch (e) {}
    return key;
  }

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

  browser.storage.local.get(['recordingLength', 'lang']).then(function (data) {
    try {
      if (typeof window.I18N !== 'undefined') window.I18N.setLang(data.lang || 'en');
    } catch (e) {}
    var secs = parseInt(data.recordingLength, 10);
    if (!(secs >= 5 && secs <= 30)) secs = 10;
    start(secs);
  }).catch(function () { start(10); });

  function start(secs) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error', t('rec_nogum'));
      return;
    }
    setState('listening', t('rec_wait_mic'));
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      setState('listening', t('rec_listening', { s: secs }));
      var chunks = [];
      var mime = detectMimeType();
      var rec;
      try {
        rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch (e) {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        setState('error', t('rec_startfail'));
        return;
      }
      rec.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = function () {
        stream.getTracks().forEach(function (tr) { tr.stop(); });
        if (!chunks.length) {
          setState('error', t('rec_nosound'));
          return;
        }
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || 'audio/webm' });
        recognize(blob);
      };
      rec.onerror = function () {
        try { stream.getTracks().forEach(function (tr) { tr.stop(); }); } catch (e) {}
        setState('error', t('rec_recerr'));
      };
      try { rec.start(); } catch (e) {
        setState('error', t('rec_startfail'));
        return;
      }
      setTimeout(function () {
        try { if (rec.state === 'recording') rec.stop(); } catch (e) {}
      }, secs * 1000);
    }).catch(function (err) {
      var key = 'rec_denied';
      if (err && err.name === 'NotFoundError') key = 'rec_nomic';
      else if (err && err.name === 'NotReadableError') key = 'rec_micbusy';
      setState('error', t(key));
    });
  }

  function recognize(blob) {
    setState('working', t('rec_working'));
    var api = window.SoundSniffRecognize;
    if (!api) {
      setState('error', t('rec_noservice'));
      return;
    }
    var name = (blob.type || '').indexOf('ogg') !== -1 ? 'mic.ogg' : 'mic.webm';
    api.recognizeBlob(blob, name).then(function (r) {
      if (!r.matched) {
        setState('noresult', t('rec_noresult'));
        return;
      }
      showResult(r.song);
      saveMatch(r.song, r.backend === 'SongFinder' ? 'songfinder' : 'audd');
    }).catch(function (err) {
      console.error('SoundSniff mic recognize error:', err);
      setState('error', t('rec_neterr'));
    });
  }

  function showResult(song) {
    songArtist.textContent = song.artist || t('unknown_artist');
    songTitle.textContent = song.title || t('unknown_song');
    songMeta.textContent = [song.album, song.extra].filter(Boolean).join(' · ');
    while (songLinks.firstChild) songLinks.removeChild(songLinks.firstChild);
    if (window.SoundSniffRecognize && window.SoundSniffRecognize.isSafeUrl(song.link)) {
      var a = document.createElement('a');
      a.className = 'link-btn primary';
      a.textContent = t('open_song');
      a.href = song.link;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      songLinks.appendChild(a);
      songLinks.classList.remove('hidden');
    }
    setState('result', t('rec_found'));
    try {
      browser.runtime.sendMessage({ cmd: 'mic-result' }).catch(function () {});
    } catch (e) {}
  }

  function saveMatch(song, backend) {
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
        lastResult: { song: entry, backend: backend, at: Date.now() }
      });
    }).catch(function (err) { console.error('SoundSniff mic save error:', err); });
  }
})();
