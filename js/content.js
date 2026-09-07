/* SoundSniff content script — sekmedeki <audio>/<video> öğelerini
   Web Audio API ile yakalar, izin penceresi gerektirmez. */
(function () {
  'use strict';

  var MIN_MS = 5000;
  var MAX_MS = 30000;
  var busy = false;

  browser.runtime.onMessage.addListener(function (msg) {
    if (!msg || msg.cmd !== 'soundsniff-capture') return undefined;
    if (busy) return Promise.resolve({ ok: false, reason: 'busy' });
    busy = true;
    var dur = Math.min(MAX_MS, Math.max(MIN_MS, Number(msg.durationMs) || 10000));
    // Hemen ack dön, kayıt bitince ayrı mesajla gönder (uzun ömürlü kanal riski yok)
    capture(dur).then(function (res) {
      busy = false;
      if (res && res.ok) {
        browser.runtime.sendMessage({
          cmd: 'soundsniff-audio',
          mime: res.mime,
          name: res.name,
          buffer: res.buffer
        }).catch(function () { /* popup/background kapalıysa sorun değil */ });
      } else {
        browser.runtime.sendMessage({
          cmd: 'soundsniff-capture-failed',
          reason: (res && res.reason) || 'unknown'
        }).catch(function () {});
      }
    }).catch(function () {
      busy = false;
      browser.runtime.sendMessage({ cmd: 'soundsniff-capture-failed', reason: 'error' })
        .catch(function () {});
    });
    return Promise.resolve({ ok: true, started: true });
  });

  function detectMimeType() {
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (var i = 0; i < types.length; i++) {
      try {
        if (typeof window.MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(types[i])) {
          return types[i];
        }
      } catch (e) { /* ignore */ }
    }
    return '';
  }

  function fileNameFor(mime) {
    if (mime.indexOf('ogg') !== -1) return 'capture.ogg';
    return 'capture.webm';
  }

  function capture(durationMs) {
    return new Promise(function (resolve) {
      var els = Array.prototype.slice.call(document.querySelectorAll('audio, video'));
      if (!els.length) { resolve({ ok: false, reason: 'no-media' }); return; }

      var playing = els.filter(function (el) {
        try { return !el.paused && !el.ended && el.readyState >= 2; }
        catch (e) { return false; }
      });
      if (!playing.length) { resolve({ ok: false, reason: 'paused' }); return; }

      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || typeof window.MediaRecorder === 'undefined') {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      var ctx;
      try { ctx = new AC(); }
      catch (e) { resolve({ ok: false, reason: 'unsupported' }); return; }

      function done(reason) {
        try { ctx.close(); } catch (e) {}
        resolve({ ok: false, reason: reason });
      }

      if (ctx.state === 'suspended') {
        try {
          var p = ctx.resume();
          if (p && p.catch) p.catch(function () {});
        } catch (e) { /* ignore */ }
      }

      var dest;
      var analyser;
      try {
        dest = ctx.createMediaStreamDestination();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
      } catch (e) { done('unsupported'); return; }

      var hooked = 0;
      playing.forEach(function (el) {
        try {
          var src = ctx.createMediaElementSource(el);
          src.connect(ctx.destination); // sayfa sesi kesilmesin
          src.connect(dest);            // kayda gitsin
          src.connect(analyser);        // sessizlik kontrolü
          hooked++;
        } catch (e) { /* bu öğe zaten bağlı ya da korumalı */ }
      });
      if (!hooked) { done('hooked'); return; }

      var mime = detectMimeType();
      var rec;
      try {
        rec = mime ? new MediaRecorder(dest.stream, { mimeType: mime }) : new MediaRecorder(dest.stream);
      } catch (e) { done('unsupported'); return; }

      var chunks = [];
      var peak = 0;
      var buf = new Uint8Array(analyser.fftSize);
      var probe = setInterval(function () {
        try {
          analyser.getByteTimeDomainData(buf);
          for (var i = 0; i < buf.length; i += 4) {
            var d = Math.abs(buf[i] - 128);
            if (d > peak) peak = d;
          }
        } catch (e) { /* ignore */ }
      }, 250);

      rec.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = function () {
        clearInterval(probe);
        try { ctx.close(); } catch (e) {}
        if (!chunks.length) { resolve({ ok: false, reason: 'silent' }); return; }
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || mime || 'audio/webm' });
        if (!blob.size) { resolve({ ok: false, reason: 'silent' }); return; }
        if (peak < 2) { resolve({ ok: false, reason: 'silent' }); return; } // DRM/sessiz
        blob.arrayBuffer().then(function (ab) {
          if (!ab || !ab.byteLength || ab.byteLength > 8 * 1024 * 1024) {
            resolve({ ok: false, reason: 'error' });
            return;
          }
          resolve({ ok: true, mime: blob.type, name: fileNameFor(blob.type), buffer: ab });
        }).catch(function () { resolve({ ok: false, reason: 'error' }); });
      };
      rec.onerror = function () {
        clearInterval(probe);
        try { ctx.close(); } catch (e) {}
        resolve({ ok: false, reason: 'error' });
      };

      try { rec.start(); } catch (e) { done('unsupported'); return; }
      setTimeout(function () {
        try { if (rec.state === 'recording') rec.stop(); } catch (e) {}
      }, durationMs);
    });
  }
})();
