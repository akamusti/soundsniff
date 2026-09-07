(function () {
  'use strict';

  var MAX_HISTORY = 50;
  var CAPTURE_TIMEOUT_MS = 100000;

  // ---------- DOM ----------
  function $(id) { return document.getElementById(id); }

  var app = $('app');
  var btnListen = $('btn-listen');
  var btnMic = $('btn-mic');
  var btnHistory = $('btn-history');
  var btnSettings = $('btn-settings');
  var btnBackHistory = $('btn-back-history');
  var btnBackSettings = $('btn-back-settings');
  var btnClearHistory = $('btn-clear-history');
  var btnClearHistorySettings = $('btn-clear-history-settings');

  var screenMain = $('screen-main');
  var screenHistory = $('screen-history');
  var screenSettings = $('screen-settings');

  var statusText = $('status-text');
  var statusDot = $('status-dot');
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
  var uiState = 'idle';
  var capturing = false;
  var captureTimer = null;
  var errorTimer = null;
  var history = [];

  // ---------- Init ----------
  function init() {
    browser.storage.local.get(['history', 'apiToken', 'recordingLength', 'lastResult'])
      .then(function (data) {
        if (Array.isArray(data.history)) history = data.history.slice(0, MAX_HISTORY);
        if (data.apiToken) apiTokenInput.value = data.apiToken;
        var len = parseInt(data.recordingLength, 10);
        if (len >= 5 && len <= 30) {
          recordingLength.value = String(len);
          recordingLengthValue.textContent = len + 's';
        }
        renderHistory();
        // Arka planda biten iş varsa göster (örn. sekme kapalıyken)
        if (data.lastResult && data.lastResult.song &&
            (Date.now() - Number(data.lastResult.at || 0)) < 10 * 60 * 1000) {
          showResult(data.lastResult.song, data.lastResult.backendLabel || '');
        }
        return browser.storage.local.remove('lastResult');
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
    idle: 'Tanımak için dokun',
    listening: 'Sekme dinleniyor…',
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

    var live = (next === 'listening' || next === 'working' || next === 'result');
    statusDot.classList.toggle('live', live);
    btnListen.classList.toggle('busy', next === 'listening' || next === 'working');
    disc.classList.toggle('spinning', live);
    eq.classList.toggle('on', next === 'listening' || next === 'working');

    if (next === 'noresult' || next === 'error') {
      btnRetry.classList.remove('hidden');
    } else {
      btnRetry.classList.add('hidden');
    }

    if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
    if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
    if (next === 'error') {
      errorTimer = setTimeout(function () {
        if (uiState === 'error') { capturing = false; setState('idle'); }
      }, 6000);
    }
  }

  // ---------- Capture (sekme sesi — izin istemez) ----------
  function getDurationSec() {
    var len = parseInt(recordingLength.value, 10);
    return (len >= 5 && len <= 30) ? len : 10;
  }

  function startCapture() {
    if (capturing || uiState === 'working') return;
    capturing = true;
    resetResultView();
    setState('listening');
    try {
      browser.runtime.sendMessage({ cmd: 'capture-tab', durationSec: getDurationSec() })
        .catch(function () {
          capturing = false;
          setState('error', { status: 'Eklenti arka planına ulaşılamadı.' });
        });
    } catch (e) {
      capturing = false;
      setState('error', { status: 'Eklenti arka planına ulaşılamadı.' });
      return;
    }
    captureTimer = setTimeout(function () {
      if (capturing) {
        capturing = false;
        setState('error', { status: 'Zaman aşımı. Tekrar dene.' });
      }
    }, CAPTURE_TIMEOUT_MS);
  }

  btnListen.addEventListener('click', function () {
    if (capturing) return;
    startCapture();
  });

  btnRetry.addEventListener('click', function () {
    if (capturing) return;
    startCapture();
  });

  // ---------- Mikrofon (ayrı sekmede — izin penceresi çalışır) ----------
  btnMic.addEventListener('click', function () {
    browser.tabs.create({ url: browser.runtime.getURL('popup/recorder.html') });
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

  // ---------- Background mesajları ----------
  var UNAVAILABLE_MSGS = {
    'no-media': 'Bu sekmede çalan ses bulunamadı. Müzik çalan sekmeye geç ya da mikrofonla dinle.',
    'paused': 'Sekmedeki medya duraklatılmış görünüyor. Oynatıp tekrar dene.',
    'silent': 'Sekmeden ses alınamadı (korumalı içerik olabilir). Mikrofonla dinlemeyi dene.',
    'hooked': 'Sekme sesi başka şekilde yakalanmış. Sayfayı yenileyip tekrar dene.',
    'busy': 'Zaten bir kayıt sürüyor, bitmesini bekle.',
    'restricted': 'Bu sayfada yakalama yapılamaz. Müzik çalan bir sekmeye geç.',
    'no-tab': 'Aktif sekme bulunamadı.',
    'reload': 'Sayfayı yenileyip tekrar dene.',
    'unsupported': 'Bu sekmede kayıt desteklenmiyor. Mikrofonla dinlemeyi dene.',
    'error': 'Kayıt alınamadı, tekrar dene.'
  };

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.cmd) return undefined;
    if (msg.cmd === 'capture-started') {
      setState('listening');
    } else if (msg.cmd === 'recognizing') {
      setState('working');
    } else if (msg.cmd === 'capture-unavailable') {
      capturing = false;
      setState('error', { status: UNAVAILABLE_MSGS[msg.reason] || UNAVAILABLE_MSGS.error });
    } else if (msg.cmd === 'result') {
      capturing = false;
      if (msg.song) {
        showResult(msg.song, msg.backendLabel || '');
        refreshHistoryFromStorage();
      }
    } else if (msg.cmd === 'no-result') {
      capturing = false;
      setState('noresult', { status: 'Eşleşme bulunamadı' });
    } else if (msg.cmd === 'error') {
      capturing = false;
      setState('error', { status: msg.text || 'Hata oldu.' });
    } else if (msg.cmd === 'mic-result') {
      refreshHistoryFromStorage();
    }
    return undefined;
  });

  function refreshHistoryFromStorage() {
    browser.storage.local.get(['history']).then(function (data) {
      if (Array.isArray(data.history)) {
        history = data.history.slice(0, MAX_HISTORY);
        renderHistory();
      }
    }).catch(function () {});
  }

  // ---------- Sonuç ----------
  function showResult(song, backendLabel) {
    songArtist.textContent = song.artist || 'Bilinmeyen sanatçı';
    songTitle.textContent = song.title || 'Bilinmeyen şarkı';
    songMeta.textContent = [song.album].filter(Boolean).join(' · ');
    setArtwork(song.artwork);
    renderLinks(song);
    setState('result', { status: 'Bulundu', backend: backendLabel });
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

  function renderLinks(song) {
    songLinks.innerHTML = '';
    var url = isSafeUrl(song.link) ? song.link : '';
    if (!url) {
      var q = encodeURIComponent(((song.artist || '') + ' ' + (song.title || '')).trim());
      if (q) url = 'https://www.google.com/search?q=' + q;
    }
    if (url) {
      var a = document.createElement('a');
      a.className = 'link-btn primary';
      a.textContent = 'Şarkıyı aç';
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        browser.tabs.create({ url: url });
      });
      songLinks.appendChild(a);
    }
    songLinks.classList.remove('hidden');
  }

  // ---------- History ----------
  function renderHistory() {
    if (!history.length) {
      historyList.innerHTML =
        '<div class="empty-history">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">' +
        '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>' +
        '<span>Henüz şarkı tanınmadı</span>' +
        '<small>Dinle düğmesine bas, çalan müziği bulalım</small>' +
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
