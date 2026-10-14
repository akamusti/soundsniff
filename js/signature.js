/* SoundSniff signature — Shazam (Wang 2003) tarzı yerel ses parmakizi.

   Amacımız şarkıyı tanımak değil; tanımı AudD/SongFinder zaten yapıyor.
   Amaç şu soruyu API çağrısı yapmadan cevaplamak: "ses değişti mi?"

   Yöntem Wang 2003'ün ("An Industrial-Strength Audio Search Algorithm",
   Shazam mühendislerinin kendi makalesi) 1 boyutlu hâli:

     1. Her FFT karesinden logaritmik bantların enerji zirveleri çıkarılır
        (6 bant + bant içi en yüksek bin, Wang'in tarif ettiği düzen).
        5 kHz üstü atılır; Shazam da 8-11 kHz'e indirger, üstü işe yaramaz.
     2. İki imza arasında eşleşen kare çiftleri için "offset" (i-j)
        histogramı kurulur.
     3. Skor = EN BÜYÜK HİSTOGRAM TEPESİ. Wang 2003 bölüm 2.4 tam olarak
        bunu söyler: "skor, en büyük histogram tepesinin boyutudur."

   Neden histogram? İki kayıt aynı şarkının farklı anlarını içerebilir;
   sabit bir hizalama yoktur. Doğru hizalama histogramda tepe olarak ortaya
   çıkar, rastlantısal çakışmalar dağılır. Aynı şarkının iki farklı
   versiyonunu (remaster/canlı) ayıran da budur: farklı olan kareler tepe
   yapmaz, yani skor düşer.

   Bu modül tarayıcı API'sine bağımlı değildir; node altında test edilir. */
(function (global) {
  'use strict';

  // ---------- Ayarlar ----------
  var MAX_HZ = 5500;          // Shazam 8-11 kHz'e iner; biz 5.5 kHz ile yetiniriz
  var FRAME_MS = 100;         // 10 kare/sn
  var MAX_FRAMES = 400;       // 40 snlik kayıtta tavan
  var MIN_OVERLAP = 8;        // çok kısa imzaları kıyaslama
  var MAX_BANDS = 16;
  var MIN_BANDS = 6;
  var BAND_RATIO = 1.35;      // bant kenarlarinin cogalma orani
  var SILENCE_FLOOR = 3;      // 15 uzerinden; alti sessizlik sayilir
  var PEAK_RATIO = 0.25;      // kare icin: en guclu tepenin %25'i alti "yok"
  var MIN_PEAKS_PER_FRAME = 3; // kare basina bu kadar tepeden azi imza disi
  var ABSENT = -1;            // bantta tepe yok

  // Tolerans: normalize bin (0-255) uzerinde. Genlik imzadan ciktigi icin
  // burasi sikilastirilabilir; Shazam'in 1024 bin cozunurlugu cok daha
  // keskin bir ayrim yapar.
  var BIN_TOL = 6;            // ~= ±130 Hz
  var MIN_COMMON_BANDS = 4;   // karsilastirilabilir kare icin ortak tepe tabani

  // Karar eşikleri. Arada kalan durum belirsiz sayılır ve muhafazakâr
  // olarak "API'ye sor" yoluna düşer: yanlışlıkla atlamaktansa fazladan
  // bir istek atmak yeğdir, çünkü atlanan şarkı kullanıcıya hiç ulaşmaz.
  var SAME_THRESHOLD = 0.75;
  var CHANGE_THRESHOLD = 0.50;

  // ---------- Bant kurulumu ----------
  // Bant kenarları logaritmik olarak ölçeklenir. Wang 2003 bantları iki
  // katı büyüyen sınırlarla tarif ediyor (0-10, 10-20, 20-40...); doğrudan
  // ikili ölçek düşük frekansta çok kaba kalıyor ve iki farklı şarkı aynı
  // tepe binlerine düşüyor. 1.35 çarpanı hem kaba hem de sık bantları bırakır.
  function buildBands(usableBins) {
    var edges = [];
    var v = 2;
    while (v < usableBins && edges.length < MAX_BANDS) {
      edges.push(v);
      v = Math.max(v + 1, Math.round(v * BAND_RATIO));
    }
    edges.push(usableBins);

    var bands = [];
    for (var i = 0; i < edges.length - 1; i++) {
      var lo = edges[i];
      var hi = edges[i + 1];
      if (hi - lo < 1) continue;
      bands.push({ lo: lo, hi: hi });
    }
    return bands.length >= MIN_BANDS ? bands : null;
  }

  function usableBinsFor(sampleRate, fftSize) {
    var nyquist = (sampleRate || 44100) / 2;
    var binHz = nyquist / (fftSize / 2);
    var n = Math.floor(MAX_HZ / binHz);
    // En az 8 bant çıkacak kadar geniş olmalı.
    var cap = (fftSize / 2) - 1;
    if (n > cap) n = cap;
    return n;
  }

  /* Bir FFT karesinden bant tepeleri. Wang 2003'te genlik bileşeni
     imzadan tamamen cikarilir ("this reduction has the advantage that it is
     fairly insensitive to EQ"); biz de aynisini yapiyoruz. Boylece ses
     seviyesi, kazanc ve EQ degisimi imzayi hic etkilemez — bu, hoparlor
     seviyesiyle oynayan bir kullanici icin kritik.

     Dondurulmus, yalnizca ZAMAN-FREKANS koordinatlari kalir:
       >= 0 : o bantta bir tepe var, degeri normalize bin (0-255)
       -1   : o bantta belirgin tepe yok (sesin olmadigi ya da cok zayif) */
  function build(frames, opts) {
    opts = opts || {};
    var sampleRate = opts.sampleRate || 44100;
    var fftSize = opts.fftSize || 2048;

    var usable = usableBinsFor(sampleRate, fftSize);
    var bands = buildBands(usable);
    if (!bands) return null;

    var out = [];
    var limit = Math.min(frames.length, MAX_FRAMES);
    var kept = 0;
    var peaks = 0;

    for (var f = 0; f < limit; f++) {
      var frame = frames[f];
      if (!frame || frame.length < 2) continue;

      var loudest = 0;
      for (var s = 0; s < frame.length; s++) {
        if (frame[s] > loudest) loudest = frame[s];
      }
      if (loudest < SILENCE_FLOOR * 17) continue;

      // "Belirgin tepe" esigi kareye gore: en guclu tepenin altindaki
      // zayif tepsiler temal sayilir. Boylece imza genlikten bagimsiz kalir.
      var floor = loudest * PEAK_RATIO;

      for (var b = 0; b < bands.length; b++) {
        var lo = bands[b].lo;
        var hi = Math.min(bands[b].hi, frame.length);
        var maxV = -1;
        var maxI = lo;
        for (var i = lo; i < hi; i++) {
          if (frame[i] > maxV) { maxV = frame[i]; maxI = i; }
        }
        if (maxV <= floor || maxV <= 0) {
          out.push(ABSENT);
        } else {
          var normBin = Math.round((maxI / usable) * 255);
          if (normBin > 255) normBin = 255;
          out.push(normBin);
          peaks++;
        }
      }
      kept++;
    }

    if (!out.length || !kept) return null;
    // Tepe yoksa imza anlamsiz; sessizlik gibi degerlendirilir.
    if (peaks < kept * MIN_PEAKS_PER_FRAME) return null;
    return { data: out, bands: bands.length, count: kept };
  }

  // ---------- Karşılaştırma ----------

  /* Tek bir kare çifti: iki karede de tepe bulunan bantlardan kaçı aynı
     bin aralığında? 0..1. Ortak tepe çok azsa çift sayılmaz. */
  function frameHit(dataA, dataB, stride, ai, bj) {
    var hits = 0;
    var common = 0;
    for (var i = 0; i < stride; i++) {
      var a = dataA[ai + i];
      var b = dataB[bj + i];
      if (a === ABSENT || b === ABSENT) continue;
      common++;
      var d = a - b;
      if (d < 0) d = -d;
      if (d <= BIN_TOL) hits++;
    }
    if (common < MIN_COMMON_BANDS) return 0;
    return hits / common;
  }

  /* İki imza arasındaki benzerlik: 0 (ilgisiz) .. 1 (aynı ses).
     Offset histogramının en büyük tepesi. */
  function similarity(a, b) {
    if (!a || !b || !a.data || !b.data) return 0;
    if (a.bands !== b.bands) return 0;
    var stride = a.bands;
    var na = a.count;
    var nb = b.count;
    if (!na || !nb) return 0;
    if (na < MIN_OVERLAP || nb < MIN_OVERLAP) return 0;

    var hist = {};
    var best = 0;
    var frameThresh = 0.6; // kare başına bu oranın üstü sayılır

    for (var i = 0; i < na; i++) {
      var ai = i * stride;
      for (var j = 0; j < nb; j++) {
        var bj = j * stride;
        if (frameHit(a.data, b.data, stride, ai, bj) < frameThresh) continue;
        var off = i - j;
        hist[off] = (hist[off] || 0) + 1;
        if (hist[off] > best) best = hist[off];
      }
    }

    var denom = na < nb ? na : nb;
    return best / denom;
  }

  function compare(a, b) {
    var score = similarity(a, b);
    if (score >= SAME_THRESHOLD) return 'same';
    if (score < CHANGE_THRESHOLD) return 'changed';
    return 'unknown';
  }

  global.SoundSniffSignature = {
    build: build,
    similarity: similarity,
    compare: compare,
    buildBands: buildBands,
    usableBinsFor: usableBinsFor,
    FRAME_MS: FRAME_MS,
    SAME_THRESHOLD: SAME_THRESHOLD,
    CHANGE_THRESHOLD: CHANGE_THRESHOLD
  };
})(typeof window !== 'undefined' ? window : this);