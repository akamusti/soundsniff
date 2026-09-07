/* SoundSniff content script — sekmedeki <audio>/<video> öğelerini
   captureStream() ile yakalar. Sayfanın ses yoluna dokunulmaz:
   createMediaElementSource kullanılmaz, bu yüzden kayıt bitince
   sekmenin sesi kesilmez, F5 gerekmez. İzin penceresi gerektirmez. */
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

  function captureStreamOf(el) {
    try {
      if (typeof el.captureStream === 'function') return el.captureStream();
      if (typeof el.mozCaptureStream === 'function') return el.mozCaptureStream();
    } catch (e) { /* korumalı/hatalı öğe */ }
    return null;
  }

  function stopStream(stream) {
    try {
      stream.getTracks().forEach(function (t) {
        try { t.stop(); } catch (e) {}
      });
    } catch (e) {}
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

      if (typeof window.MediaRecorder === 'undefined') {
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      // Her çalan öğeden izmir al, tek akışta birleştir.
      // Öğe kendi çıkışından çalmaya devam eder — sayfa sesi bozulmaz.
      var combined = new MediaStream();
      var tapped = 0;
      playing.forEach(function (el) {
        var s = captureStreamOf(el);
        if (!s) return;
        var tracks = [];
        try { tracks = s.getAudioTracks(); } catch (e) { tracks = []; }
        tracks.forEach(function (t) {
          try { combined.addTrack(t); tapped++; } catch (e) {}
        });
      });
      if (!tapped) { resolve({ ok: false, reason: 'silent' }); return; }

      // Sessizlik tespiti: akışın kopyasına analyser bağla.
      // Bu, öğenin ses yoluna dokunmaz; analiz context'i kapatılabilir.
      var analyser = null;
      var analysisCtx = null;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          analysisCtx = new AC();
          var tap = analysisCtx.createMediaStreamSource(combined);
          analyser = analysisCtx.createAnalyser();
          analyser.fftSize = 2048;
          tap.connect(analyser);
          if (analysisCtx.state === 'suspended') {
            try {
              var p = analysisCtx.resume();
              if (p && p.catch) p.catch(function () {});
            } catch (e) {}
          }
        }
      } catch (e) { analyser = null; analysisCtx = null; }

      var mime = detectMimeType();
      var rec;
      try {
        rec = mime ? new MediaRecorder(combined, { mimeType: mime }) : new MediaRecorder(combined);
      } catch (e) {
        stopStream(combined);
        closeAnalysis();
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }

      var chunks = [];
      var peak = 0;
      var buf = analyser ? new Uint8Array(analyser.fftSize) : null;
      var probe = null;
      if (analyser) {
        probe = setInterval(function () {
          try {
            analyser.getByteTimeDomainData(buf);
            for (var i = 0; i < buf.length; i += 4) {
              var d = Math.abs(buf[i] - 128);
              if (d > peak) peak = d;
            }
          } catch (e) { /* ignore */ }
        }, 250);
      }

      function closeAnalysis() {
        if (probe) { clearInterval(probe); probe = null; }
        if (analysisCtx) {
          try { analysisCtx.close(); } catch (e) {}
          analysisCtx = null;
        }
      }

      function finishOk() {
        closeAnalysis();
        if (!chunks.length) { cleanup(); resolve({ ok: false, reason: 'silent' }); return; }
        var blob = new Blob(chunks, { type: (chunks[0] && chunks[0].type) || mime || 'audio/webm' });
        cleanup();
        if (!blob.size) { resolve({ ok: false, reason: 'silent' }); return; }
        if (analyser && peak < 2) { resolve({ ok: false, reason: 'silent' }); return; } // DRM/sessiz
        blob.arrayBuffer().then(function (ab) {
          if (!ab || !ab.byteLength || ab.byteLength > 8 * 1024 * 1024) {
            resolve({ ok: false, reason: 'error' });
            return;
          }
          resolve({ ok: true, mime: blob.type, name: fileNameFor(blob.type), buffer: ab });
        }).catch(function () { resolve({ ok: false, reason: 'error' }); });
      }

      function cleanup() {
        // Yakalanan izmir kopyaları durdur; öğenin kendi sesi etkilenmez.
        stopStream(combined);
      }

      rec.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = finishOk;
      rec.onerror = function () {
        closeAnalysis();
        cleanup();
        resolve({ ok: false, reason: 'error' });
      };

      try { rec.start(); } catch (e) {
        closeAnalysis();
        cleanup();
        resolve({ ok: false, reason: 'unsupported' });
        return;
      }
      setTimeout(function () {
        try { if (rec.state === 'recording') rec.stop(); } catch (e) {}
      }, durationMs);
    });
  }
})();
