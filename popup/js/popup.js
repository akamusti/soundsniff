(function () {
  'use strict';

  var DEFAULT_TOKEN = 'test';
  var MAX_HISTORY = 50;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }

  var app = $('app');
  var btnListen = $('btn-listen');
  var btnHistory = $('btn-history');
  var btnSettings = $('btn-settings');
  var btnBackHistory = $('btn-back-history');
  var btnBackSettings = $('btn-back-settings');
  var btnClearHistory = $('btn-clear-history');
  var btnClearHistorySettings = $('btn-clear-history-settings');

  var screenMain = $('screen-main');
  var screenHistory = $('screen-history');
  var screenSettings = $('screen-settings');

  var statusPill = $('status-pill');
  var statusDot = $('status-dot');
  var statusText = $('status-text');
  var disc = $('disc');
  var discImg = $('disc-img');
  var discFallback = $('disc-fallback');
  var eq = $('eq');
  var songArtist = $('song-artist');
  var songTitle = $('song-title');
  var songMeta = $('song-meta');
  var songLinks = $('song-links');
  var btnRetry = $('btn-retry');
  var backendNote = $('backend-note');

  var apiTokenInput = $('api-token-input');
  var recordingLength = $('recording-length');
  var recordingLengthValue = $('recording-length-value');
  var historyList = $('history-list');
  var settingsSaved = $('settings-saved');

  // ---------- State ----------
  var uiState = 'idle'; // idle | listening | working | result | noresult | error
  var isRecording = false;
  var mediaRecorder = null;
  var audioChunks = [];
  var recordTimer = null;
  var errorTimer = null;
  var history = [];
  var lastBackend = '';

  // ---------- Init ----------
  function init() {
    browser.storage.local.get(['history', 'apiToken', 'recordingLength'])
      .then(function (data) {
        if (Array.isArray(data.history)) history = data.history.slice(0, MAX_HISTORY);
        if (data.apiToken) apiTokenInput.value = data.apiToken;
        var len = parseInt(data.recordingLength, 10);
        if (len >= 5 && len <= 30) {
          recordingLength.value = String(len);
          recordingLengthValue.textContent = len + 's';
        }
        renderHistory();
      })
      .catch(function (err) {
        console.error('SoundSniff init error:', err);
      });

    setState('idle');
  }

  // ---------- Navigation ----------
  function showScreen(screen) {
    [screenMain, screenHistory, screenSettings].forEach(function (s) {
      s.classList.remove('active');
    });
    screen.classList.add('active');
  }

  btnHistory.addEventListener('click', function () { showScreen(screenHistory); });
  btnSettings.addEventListener('click', function () { showScreen(screenSettings); });
  btnBackHistory.addEventListener('click', function () { showScreen(screenMain); });
  btnBackSettings.addEventListener('click', function () {
    saveSettings();
    showScreen(screenMain);
  });

  // ---------- Settings ----------
  recordingLength.addEventListener('input', function () {
    recordingLengthValue.textContent = this.value + 's';
  });

  recordingLength.addEventListener('change', saveSettings);
  apiTokenInput.addEventListener('change', saveSettings);

  function saveSettings() {
    var len = parseInt(recordingLength.value, 10);
    if (!(len >= 5 && len <= 30)) len = 10;
    browser.storage.local.set({
      apiToken: apiTokenInput.value.trim(),
      recordingLength: len
    }).then(function () {
      settingsSaved.classList.add('show');
      setTimeout(function () { settingsSaved.classList.remove('show'); }, 1600);
    }).catch(function (err) {
      console.error('SoundSniff settings error:', err);
    });
  }

  function clearHistory() {
    history = [];
    browser.storage.local.set({ history: [] });
    renderHistory();
  }
  btnClearHistory.addEventListener('click', clearHistory);
  btnClearHistorySettings.addEventListener('click', clearHistory);

  // ---------- State machine ----------
  var STRINGS = {
    idle: 'Dinlemek için dokun',
    listening: 'Dinleniyor…',
    working: 'Tanımlanıyor…',
    result: 'Bulundu',
    noresult: 'Eşleşme yok',
    error: 'Hata'
  };

  function setState(next, detail) {
    uiState = next;
    app.setAttribute('data-state', next);

    statusText.textContent = (detail && detail.status) || STRINGS[next] || '';
    backendNote.textContent = (detail && detail.backend) || '';

    if (next === 'listening' || next === 'working') {
      btnListen.classList.add('busy');
      disc.classList.add('spinning');
      eq.classList.add('on');
    } else {
      btnListen.classList.remove('busy');
      disc.classList.remove('spinning');
      eq.classList.remove('on');
    }

    if (next === 'listening' || next === 'working' || next === 'result') {
      statusDot.classList.add('live');
    } else {
      statusDot.classList.remove('live');
    }

    if (next === 'noresult' || next === 'error') {
      btnRetry.classList.remove('hidden');
    } else {
      btnRetry.classList.add('hidden');
    }

    if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
    if (next === 'error') {
      errorTimer = setTimeout(function () {
        if (uiState === 'error') setState('idle');
      }, 4200);
    }
  }

  // ---------- Recording ----------
  btnListen.addEventListener('click', function () {
    if (isRecording) {
      stopRecording();
    } else if (uiState === 'working') {
      return;
    } else {
      resetResultView();
      startRecording();
    }
  });

  btnRetry.addEventListener('click', function () {
    resetResultView();
    startRecording();
  });

  function resetResultView() {
    songArtist.textContent = '';
    songTitle.textContent = '';
    songMeta.textContent = '';
    songLinks.innerHTML = '';
    songLinks.classList.add('hidden');
    btnRetry.classList.add('hidden');
    setArtwork(null);
  }

  function detectMimeType() {
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (var i = 0; i < types.length; i++) {
      try {
        if (window.MediaRecorder && MediaRecorder.isTypeSupported(types[i])) return types[i];
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  function startRecording() {
    if (typeof navigator === 'undefined' ||
        !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setState('error', { status: 'Bu tarayıcı mikrofon kaydını desteklemiyor.' });
      return;
    }
    if (typeof window.MediaRecorder === 'undefined') {
      setState('error', { status: 'Bu tarayıcı ses kaydını desteklemiyor.' });
      return;
    }

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      audioChunks = [];
      var mimeType = detectMimeType();
      try {
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType: mimeType })
          : new MediaRecorder(stream);
      } catch (err) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setState('error', { status: 'Kayıt başlatılamadı.' });
        return;
      }

      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); });
        processRecording();
      };
      mediaRecorder.onerror = function () {
        try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
        isRecording = false;
        setState('error', { status: 'Kayıt sırasında hata oldu.' });
      };

      try {
        mediaRecorder.start();
      } catch (err) {
        setState('error', { status: 'Kayıt başlatılamadı.' });
        return;
      }

      isRecording = true;
      setState('listening');

      var secs = parseInt(recordingLength.value, 10);
      if (!(secs >= 5 && secs <= 30)) secs = 10;
      if (recordTimer) clearTimeout(recordTimer);
      recordTimer = setTimeout(function () {
        if (isRecording) stopRecording();
      }, secs * 1000);
    }).catch(function (err) {
      var msg = 'Mikrofon izni gerekli. Adres çubuğundaki ikondan izin verip tekrar dene.';
      if (err && err.name === 'NotFoundError') msg = 'Mikrofon bulunamadı.';
      else if (err && err.name === 'NotReadableError') msg = 'Mikrofon başka uygulama tarafından kullanılıyor.';
      setState('error', { status: msg });
    });
  }

  function stopRecording() {
    if (recordTimer) { clearTimeout(recordTimer); recordTimer = null; }
    isRecording = false;
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      try { mediaRecorder.stop(); } catch (e) { /* ignore */ }
    } else {
      setState('idle');
    }
  }

  // ---------- Recognition ----------
  function processRecording() {
    if (!audioChunks.length) {
      setState('error', { status: 'Ses kaydedilemedi, tekrar dene.' });
      return;
    }
    var blob = new Blob(audioChunks, { type: (audioChunks[0] && audioChunks[0].type) || 'audio/webm' });
    audioChunks = [];
    setState('working');

    recognizeWithAudd(blob).then(function (r) {
      if (r.matched) {
        lastBackend = 'AudD';
        return finishMatch(r.song, 'AudD ile bulundu');
      }
      if (r.fatal) {
        setState('error', { status: r.fatal });
        return null;
      }
      setState('working', { status: 'İkinci kaynak deneniyor…' });
      return recognizeWithSongFinder(blob).then(function (r2) {
        if (r2.matched) {
          lastBackend = 'SongFinder';
          finishMatch(r2.song, 'SongFinder ile bulundu');
        } else {
          setState('noresult', { status: 'Eşleşme bulunamadı' });
        }
      });
    }).catch(function (err) {
      console.error('SoundSniff recognize error:', err);
      setState('error', { status: 'Bağlantı hatası. İnterneti kontrol edip tekrar dene.' });
    });
  }

  function getToken() {
    return browser.storage.local.get(['apiToken']).then(function (data) {
      var t = (data.apiToken || '').trim();
      return t || DEFAULT_TOKEN;
    });
  }

  function recognizeWithAudd(blob) {
    return getToken().then(function (token) {
      var form = new FormData();
      form.append('file', blob, 'recording.webm');
      form.append('api_token', token);
      form.append('return', 'spotify,apple_music,deezer');

      return fetch('https://api.audd.io/', { method: 'POST', body: form })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.status === 'success' && json.result) {
            return { matched: true, song: normalizeAudd(json.result) };
          }
          if (json && json.status === 'error' && json.error) {
            var code = json.error.error_code;
            if (code === 901 || code === 900) {
              // Kota/token sorunu: ikinci kaynağa düş
              return { matched: false };
            }
            if (code === 500 || code === 400) return { matched: false };
          }
          return { matched: false };
        })
        .catch(function (err) {
          console.error('AudD error:', err);
          return { matched: false };
        });
    });
  }

  function recognizeWithSongFinder(blob) {
    var form = new FormData();
    form.append('file', blob, 'recording.webm');
    form.append('source', 'cli');
    return fetch('https://songfinder.dev/api/music/recognize', {
      method: 'POST',
      body: form,
      headers: { 'X-SongFinder-Client': 'cli' }
    }).then(function (res) {
      if (res.status === 429) return { matched: false, limited: true };
      return res.json().then(function (payload) {
        if (payload && payload.code === 0 && payload.data && payload.data.matched) {
          var d = payload.data;
          return {
            matched: true,
            song: {
              artist: d.artist || '', title: d.title || '', album: d.album || '',
              link: d.songLink || d.spotifyUrl || d.appleMusicUrl || '',
              artwork: d.artworkUrl || '', extra: ''
            }
          };
        }
        return { matched: false };
      });
    }).catch(function (err) {
      console.error('SongFinder error:', err);
      return { matched: false };
    });
  }

  // ---------- Normalization ----------
  function normalizeAudd(r) {
    var artist = r.artist || '';
    var title = r.title || '';
    var album = r.album || '';
    var link = r.song_link || '';
    var artwork = '';
    var bits = [];

    try {
      if (r.spotify && r.spotify.album && r.spotify.album.images && r.spotify.album.images.length) {
        artwork = r.spotify.album.images[0].url || '';
        if (!link && r.spotify.external_urls && r.spotify.external_urls.spotify) {
          link = r.spotify.external_urls.spotify;
        }
      }
      if (!artwork && r.apple_music && r.apple_music.artwork && r.apple_music.artwork.url) {
        artwork = String(r.apple_music.artwork.url).replace('{w}x{h}', '300x300');
        if (!link && r.apple_music.url) link = r.apple_music.url;
      }
      if (!artwork && r.deezer) {
        artwork = r.deezer.cover_medium || r.deezer.cover || '';
        if (!link && r.deezer.link) link = r.deezer.link;
      }
      if (r.release_date) bits.push(String(r.release_date).slice(0, 4));
      if (r.label) bits.push(r.label);
    } catch (e) { /* ignore */ }

    return { artist: artist, title: title, album: album, link: link, artwork: artwork, extra: bits.join(' · ') };
  }

  function setArtwork(url) {
    if (url && isSafeUrl(url)) {
      discImg.src = url;
      discImg.classList.remove('hidden');
      discFallback.classList.add('hidden');
    } else {
      discImg.removeAttribute('src');
      discImg.classList.add('hidden');
      discFallback.classList.remove('hidden');
    }
  }

  function finishMatch(song, backendLabel) {
    songArtist.textContent = song.artist || 'Bilinmeyen sanatçı';
    songTitle.textContent = song.title || 'Bilinmeyen şarkı';
    songMeta.textContent = [song.album, song.extra].filter(Boolean).join(' · ');
    setArtwork(song.artwork);
    renderLinks(song);
    btnRetry.classList.add('hidden');
    setState('result', { status: 'Bulundu', backend: backendLabel });
    saveToHistory(song);
  }

  function renderLinks(song) {
    songLinks.innerHTML = '';
    var items = [];
    if (isSafeUrl(song.link)) items.push({ label: 'Şarkıyı aç', url: song.link, primary: true });
    if (!items.length) {
      var q = encodeURIComponent(((song.artist || '') + ' ' + (song.title || '')).trim());
      if (q) items.push({ label: 'Web’de ara', url: 'https://www.google.com/search?q=' + q, primary: true });
    }
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.className = 'link-btn' + (it.primary ? ' primary' : '');
      a.textContent = it.label;
      a.href = it.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        browser.tabs.create({ url: it.url });
      });
      songLinks.appendChild(a);
    });
    songLinks.classList.remove('hidden');
  }

  // ---------- History ----------
  function saveToHistory(song) {
    var entry = {
      artist: String(song.artist || '').slice(0, 200),
      title: String(song.title || '').slice(0, 200),
      album: String(song.album || '').slice(0, 200),
      link: isSafeUrl(song.link) ? song.link : '',
      artwork: isSafeUrl(song.artwork) ? song.artwork : '',
      timestamp: Date.now()
    };
    if (!entry.artist && !entry.title) return;
    history = history.filter(function (h) {
      return !(h.artist === entry.artist && h.title === entry.title);
    });
    history.unshift(entry);
    history = history.slice(0, MAX_HISTORY);
    browser.storage.local.set({ history: history });
    renderHistory();
  }

  function renderHistory() {
    if (!history.length) {
      historyList.innerHTML =
        '<div class="empty-history">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
        '<span>Henüz şarkı tanınmadı</span>' +
        '<small>Dinle düğmesine bas, etrafındaki müziği bulalım</small>' +
        '</div>';
      return;
    }
    historyList.innerHTML = history.map(function (item, i) {
      var art = isSafeUrl(item.artwork)
        ? '<img src="' + escapeAttr(item.artwork) + '" alt="" loading="lazy"/>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
          '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
      return (
        '<div class="history-item" data-index="' + i + '">' +
        '<div class="history-cover">' + art + '</div>' +
        '<div class="history-info">' +
        '<div class="history-info-title">' + escapeHtml(item.title) + '</div>' +
        '<div class="history-info-artist">' + escapeHtml(item.artist) + '</div>' +
        '<div class="history-info-time">' + escapeHtml(formatTime(item.timestamp)) + '</div>' +
        '</div>' +
        '<button class="history-delete" data-index="' + i + '" title="Kaldır">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
        '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button></div>'
      );
    }).join('');

    historyList.querySelectorAll('.history-item').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.history-delete')) return;
        var idx = parseInt(el.getAttribute('data-index'), 10);
        if (history[idx] && isSafeUrl(history[idx].link)) {
          browser.tabs.create({ url: history[idx].link });
        }
      });
    });
    historyList.querySelectorAll('.history-delete').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var idx = parseInt(btn.getAttribute('data-index'), 10);
        history.splice(idx, 1);
        browser.storage.local.set({ history: history });
        renderHistory();
      });
    });
  }

  // ---------- Helpers ----------
  function formatTime(ts) {
    var t = Number(ts);
    if (!t) return '';
    var diff = Date.now() - t;
    if (diff < 60000) return 'az önce';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' dk önce';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' sa önce';
    return new Date(t).toLocaleDateString();
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      var p = new URL(url);
      return p.protocol === 'http:' || p.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  init();
})();
