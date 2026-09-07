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
  var languageSelect = $('language-select');
  var aboutText = $('about-text');
  var APP_VERSION = '1.3.2';

  function t(key, vars) {
    try {
      if (typeof window.I18N !== 'undefined') return window.I18N.t(key, vars);
    } catch (e) {}
    return key;
  }

  // ---------- State ----------
  var uiState = 'idle';
  var capturing = false;
  var captureTimer = null;
  var errorTimer = null;
  var history = [];

  // ---------- Init ----------
  function init() {
    browser.storage.local.get(['history', 'apiToken', 'recordingLength', 'lastResult', 'lang'])
      .then(function (data) {
        applyLang(data.lang || 'en');
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
          showResult(data.lastResult.song, backendLabel(data.lastResult.backend));
        }
        return browser.storage.local.remove('lastResult');
      })
      .catch(function (err) {
        console.error('SoundSniff init error:', err);
      });

    setState('idle');
  }

  function applyLang(lang) {
    try {
      if (typeof window.I18N !== 'undefined') window.I18N.setLang(lang);
    } catch (e) {}
    if (languageSelect) languageSelect.value = (lang === 'tr') ? 'tr' : 'en';
    if (aboutText) aboutText.textContent = t('about', { v: APP_VERSION });
    // O anki durum metnini yeni dilde tazele
    refreshStatusText();
    renderHistory();
  }

  function refreshStatusText() {
    var map = {
      idle: 'status_idle', listening: 'status_listening', working: 'status_working',
      result: 'status_found', noresult: 'status_noresult', error: 'status_error'
    };
    if (map[uiState]) statusText.textContent = t(map[uiState]);
  }

  function backendLabel(code) {
    return t(code === 'songfinder' ? 'backend_sf' : 'backend_audd');
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

  if (languageSelect) {
    languageSelect.addEventListener('change', function () {
      var lang = (languageSelect.value === 'tr') ? 'tr' : 'en';
      browser.storage.local.set({ lang: lang }).catch(function () {});
      applyLang(lang);
    });
  }

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
  var STATE_KEYS = {
    idle: 'status_idle', listening: 'status_listening', working: 'status_working',
    result: 'status_found', noresult: 'status_noresult', error: 'status_error'
  };

  function setState(next, detail) {
    uiState = next;
    app.setAttribute('data-state', next);

    statusText.textContent = (detail && detail.status) || t(STATE_KEYS[next] || 'status_idle');
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
          setState('error', { status: t('un_bg') });
        });
    } catch (e) {
      capturing = false;
      setState('error', { status: t('un_bg') });
      return;
    }
    captureTimer = setTimeout(function () {
      if (capturing) {
        capturing = false;
        setState('error', { status: t('un_timeout') });
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

  function clearChildren(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function resetResultView() {
    songArtist.textContent = '';
    songTitle.textContent = '';
    songMeta.textContent = '';
    clearChildren(songLinks);
    songLinks.classList.add('hidden');
    btnRetry.classList.add('hidden');
    setArtwork(null);
  }

  // ---------- Background mesajları ----------
  var UNAVAILABLE_KEYS = {
    'no-media': 'un_no_media', 'paused': 'un_paused', 'silent': 'un_silent',
    'busy': 'un_busy', 'restricted': 'un_restricted', 'no-tab': 'un_no_tab',
    'reload': 'un_reload', 'unsupported': 'un_unsupported', 'error': 'un_error'
  };

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.cmd) return undefined;
    if (msg.cmd === 'capture-started') {
      setState('listening');
    } else if (msg.cmd === 'recognizing') {
      setState('working');
    } else if (msg.cmd === 'capture-unavailable') {
      capturing = false;
      setState('error', { status: t(UNAVAILABLE_KEYS[msg.reason] || 'un_error') });
    } else if (msg.cmd === 'result') {
      capturing = false;
      if (msg.song) {
        showResult(msg.song, backendLabel(msg.backend));
        refreshHistoryFromStorage();
      }
    } else if (msg.cmd === 'no-result') {
      capturing = false;
      setState('noresult', { status: t('status_noresult') });
    } else if (msg.cmd === 'error') {
      capturing = false;
      setState('error', { status: msg.key ? t('err_' + msg.key) : (msg.text || t('status_error')) });
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
  function showResult(song, backendText) {
    songArtist.textContent = song.artist || t('unknown_artist');
    songTitle.textContent = song.title || t('unknown_song');
    songMeta.textContent = [song.album].filter(Boolean).join(' · ');
    setArtwork(song.artwork);
    renderLinks(song);
    setState('result', { status: t('status_found'), backend: backendText });
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
    clearChildren(songLinks);
    var url = isSafeUrl(song.link) ? song.link : '';
    if (!url) {
      var q = encodeURIComponent(((song.artist || '') + ' ' + (song.title || '')).trim());
      if (q) url = 'https://www.google.com/search?q=' + q;
    }
    if (url) {
      var a = document.createElement('a');
      a.className = 'link-btn primary';
      a.textContent = t('open_song');
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
  function slot(root, name) {
    return root.querySelector('[data-slot="' + name + '"]');
  }

  function renderHistory() {
    clearChildren(historyList);
    if (!history.length) {
      var tpl = $('tpl-empty-history');
      var empty = tpl.content.cloneNode(true);
      slot(empty, 'title').textContent = t('history_empty_t');
      slot(empty, 'sub').textContent = t('history_empty_s');
      historyList.appendChild(empty);
      return;
    }

    var itemTpl = $('tpl-history-item');
    history.forEach(function (item, i) {
      var frag = itemTpl.content.cloneNode(true);
      var row = frag.querySelector('.history-item');
      row.setAttribute('data-index', String(i));

      var cover = slot(frag, 'cover');
      if (isSafeUrl(item.artwork)) {
        clearChildren(cover);
        var img = document.createElement('img');
        img.setAttribute('src', item.artwork);
        img.setAttribute('alt', '');
        img.setAttribute('loading', 'lazy');
        cover.appendChild(img);
      }

      slot(frag, 'title').textContent = item.title || '';
      slot(frag, 'artist').textContent = item.artist || '';
      slot(frag, 'time').textContent = formatTime(item.timestamp);

      var del = slot(frag, 'delete');
      del.setAttribute('data-index', String(i));
      del.setAttribute('title', t('remove'));

      row.addEventListener('click', function (e) {
        if (e.target.closest('.history-delete')) return;
        if (history[i] && isSafeUrl(history[i].link)) {
          browser.tabs.create({ url: history[i].link });
        }
      });
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        history.splice(i, 1);
        browser.storage.local.set({ history: history });
        renderHistory();
      });

      historyList.appendChild(frag);
    });
  }

  // ---------- Helpers ----------
  function formatTime(ts) {
    var time = Number(ts);
    if (!time) return '';
    var diff = Date.now() - time;
    if (diff < 60000) return t('t_now');
    if (diff < 3600000) return t('t_min', { n: Math.floor(diff / 60000) });
    if (diff < 86400000) return t('t_hr', { n: Math.floor(diff / 3600000) });
    return new Date(time).toLocaleDateString();
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
