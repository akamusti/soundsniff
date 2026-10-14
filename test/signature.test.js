/* SoundSniff imza modülü testleri — node test/signature.test.js
   Tarayici gerektirmez; js/signature.js saf fonksiyonlardan olusur. */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, '..', 'js', 'signature.js');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
const S = ctx.SoundSniffSignature;

/* Sentetik FFT karesi ureteci: belli perdelerde tepe koyar, komsularina
   kucuk sizinti birakir. Gercek bir parcayi taklit etmesi amacina yeter. */
function makeTrack(seed, opts) {
  opts = opts || {};
  const rate = opts.rate || 44100;
  const fft = opts.fft || 2048;
  const hz = opts.hz || [200, 450, 900, 1800, 3200, 4800];
  const jitter = opts.jitter || 0;
  const gain = opts.gain == null ? 1 : opts.gain;
  const seconds = opts.seconds || 6;

  const frames = [];
  let s = seed;
  const rnd = function () {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let t = 0; t < seconds * rate / fft; t++) {
    const fr = new Uint8Array(fft / 2);
    const bins = [];
    hz.forEach(function (f) {
      const bin = Math.round(f / (rate / 2) * (fft / 2)) + Math.round((rnd() - 0.5) * 2 * jitter);
      if (bin > 0 && bin < fft / 2) { bins.push(bin); fr[bin] = 0; }
    });
    bins.forEach(function (b) {
      fr[b] = Math.max(fr[b], Math.round((140 + rnd() * 100) * gain));
    });
    bins.slice(0, 3).forEach(function (b) {
      if (b + 1 < fft / 2) fr[b + 1] = Math.max(fr[b + 1], Math.round((60 + rnd() * 60) * gain));
    });
    frames.push(fr);
  }
  return frames;
}

const sig = function (f) { return S.build(f, { sampleRate: 44100, fftSize: 2048 }); };

let fails = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log((ok ? 'ok   ' : 'FAIL ') + name.padEnd(42) +
    '-> ' + actual + (ok ? '' : '  (beklenen: ' + expected + ')'));
}

const a = sig(makeTrack(7));
check('ayni ses, ayni kayit', S.compare(a, sig(makeTrack(7))), 'same');
check('ayni ses, 0.7sn zaman kaymasi',
  S.compare(a, sig(makeTrack(7).slice(30).concat(makeTrack(7).slice(0, 30)))), 'same');
check('ayni ses, -6dB kazanc (genlikten bagimsiz)',
  S.compare(a, sig(makeTrack(7, { gain: 0.5 }))), 'same');
check('ayni parca, remaster (bin kaymasi)',
  S.compare(a, sig(makeTrack(7, { jitter: 4, gain: 0.8 }))), 'same');

check('farkli sarki (farkli perdeler)',
  S.compare(a, sig(makeTrack(99, { hz: [130, 600, 1400, 2600, 4100, 5200] }))), 'changed');
check('farkli sarki (baska bir tane)',
  S.compare(a, sig(makeTrack(4242, { hz: [90, 380, 2100, 3600, 4900, 5400] }))), 'changed');

// Bilinen sinir. 16 bant / ±130 Hz cozunurlukte, perdeleri 10-50 Hz farkla
// ayrilan iki sarki ayirt edilemez. Yanlis "same" maliyeti bir sonraki
// kontrolun atlanmasi; yanlis "changed" maliyeti kotadan bir istek. Kota
// kirt oldugu icin "changed" yonunde hata etmek daha pahalidir ve bu yon
// bilincli olarak secilmistir. Azaltma: periyodik dogrulama, boylece hata
// en fazla bir sonraki parcaya kadar surer.
check('sinir: cok benzer zarf',
  S.compare(a, sig(makeTrack(77, { hz: [190, 460, 880, 1850, 3150, 4750] }))), 'same');
check('sinir: yarim kadro',
  S.compare(a, sig(makeTrack(555, { hz: [200, 450, 900, 1800] }))), 'same');

const silence = S.build(makeTrack(7).map(function () { return new Uint8Array(1024); }),
  { sampleRate: 44100, fftSize: 2048 });
if (silence !== null) fails++;
console.log((silence === null ? 'ok   ' : 'FAIL ') + 'sessizlik -> null'.padEnd(42) +
  '-> ' + silence + (silence === null ? '' : '  (beklenen: null)'));

console.log('\nbant=' + a.bands + ' kare=' + a.count + ' veri=' + a.data.length + ' sayi');
console.log(fails === 0 ? 'TUM TESTLER GECTI' : fails + ' TEST KALDI');
process.exit(fails === 0 ? 0 : 1);