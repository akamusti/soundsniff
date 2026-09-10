/* SoundSniff background — sekme yakalamayı yönetir, tanımayı yapar,
   sonucu storage + popup'a iletir. */
(function () {
  'use strict';

  var MAX_HISTORY = 50;

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

  browser.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg || !msg.cmd) return undefined;
    if (msg.cmd === 'capture-tab') {
      handleCaptureTab(Number(msg.durationSec) || 10);
      return undefined;
    }
    if (msg.cmd === 'soundsniff-audio' && sender && sender.tab) {
      handleAudio(msg);
      return undefined;
    }
    if (msg.cmd === 'soundsniff-capture-failed' && sender && sender.tab) {
      notify({ cmd: 'capture-unavailable', reason: msg.reason || 'error' });
      return undefined;
    }
    return undefined;
  });

  function notify(payload) {
    try {
      browser.runtime.sendMessage(payload).catch(function () {});
    } catch (e) { /* popup kapalı olabilir */ }
  }

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

  function sendCapture(tabId, secs) {
    return browser.tabs.sendMessage(tabId, {
      cmd: 'soundsniff-capture',
      durationMs: secs * 1000
    }).then(function (ack) {
      if (!ack || !ack.started) throw new Error('no-ack');
      notify({ cmd: 'capture-started' });
    });
  }

  function injectAndRetry(tabId, secs) {
    if (!browser.scripting || !browser.scripting.executeScript) {
      notify({ cmd: 'capture-unavailable', reason: 'reload' });
      return;
    }
    browser.scripting.executeScript({
      target: { tabId: tabId },
      files: ['js/content.js']
    }).then(function () {
      return sendCapture(tabId, secs);
    }).catch(function () {
      notify({ cmd: 'capture-unavailable', reason: 'reload' });
    });
  }

  function handleAudio(msg) {
    var buf = msg.buffer;
    if (!buf || !buf.byteLength || buf.byteLength > 8 * 1024 * 1024) {
      notify({ cmd: 'error', key: 'capture' });
      return;
    }
    notify({ cmd: 'recognizing' });
    var blob;
    try {
      blob = new Blob([buf], { type: msg.mime || 'audio/webm' });
    } catch (e) {
      notify({ cmd: 'error', key: 'capture' });
      return;
    }
    var api = (typeof window !== 'undefined' && window.SoundSniffRecognize) || null;
    if (!api) {
      notify({ cmd: 'error', key: 'service' });
      return;
    }
    api.recognizeBlob(blob, msg.name || 'capture.webm').then(function (r) {
      if (r.matched) {
        saveMatch(r.song, r.backend === 'SongFinder' ? 'songfinder' : 'audd');
      } else {
        notify({ cmd: 'no-result' });
      }
    }).catch(function (err) {
      console.error('SoundSniff recognize error:', err);
      notify({ cmd: 'error', key: 'network' });
    });
  }

  function saveMatch(song, backend) {
    var api = (typeof window !== 'undefined' && window.SoundSniffRecognize) || null;
    var safe = api ? api.isSafeUrl : function () { return false; };
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
      notify({ cmd: 'result', song: entry, backend: backend });
    }).catch(function (err) {
      console.error('SoundSniff save error:', err);
      notify({ cmd: 'result', song: entry, backend: backend });
    });
  }
})();
