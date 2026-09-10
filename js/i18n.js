/* SoundSniff i18n — default English, optional Turkish.
   Elements: data-i18n="key" (text), data-i18n-ph="key" (placeholder),
   data-i18n-title="key" (title attr). JS: I18N.t('key', {n: 5}). */
var I18N = (function () {
  'use strict';

  var dict = {
    en: {
      subtitle: 'Recognize music in your tab',
      listen_title: 'Recognize music in the tab',
      mic_title: 'Listen with microphone (opens in a new tab)',
      status_idle: 'Tap to recognize',
      status_listening: 'Listening to tab…',
      status_working: 'Identifying…',
      status_working2: 'Trying second source…',
      status_found: 'Found',
      status_noresult: 'No match',
      status_error: 'Error',
      retry: 'Try again',
      unknown_artist: 'Unknown artist',
      unknown_song: 'Unknown song',
      open_song: 'Open song',
      search_web: 'Search web',
      backend_audd: 'Found via AudD',
      backend_sf: 'Found via SongFinder',
      nav_history: 'History',
      nav_settings: 'Settings',
      back: 'Back',
      remove: 'Remove',
      history_empty_t: 'No songs recognized yet',
      history_empty_s: "Press listen and we'll find what's playing",
      settings_saved: 'Saved',
      lang_label: 'Language',
      token_label: 'AudD API key',
      token_opt: '(optional)',
      token_desc: 'Leave empty to use the free quota. For more recognitions, get a free key at dashboard.audd.io and paste it here.',
      token_ph: 'Can be left empty',
      reclen_label: 'Recording length',
      reclen_desc: 'Longer recordings usually give more accurate results.',
      autostart_label: 'Auto-listen on open',
      autostart_desc: 'Start recognizing as soon as the popup opens. Only runs after you click the toolbar button — never in the background.',
      hist_label: 'History',
      hist_clear: 'Clear history',
      about: 'SoundSniff {v} · Recognition: AudD + SongFinder',
      t_now: 'just now',
      t_min: '{n} min ago',
      t_hr: '{n} h ago',
      un_no_media: 'No audio playing in this tab. Switch to a tab with music or listen with the microphone.',
      un_paused: 'Media in the tab looks paused. Press play and try again.',
      un_silent: 'Could not grab audio from the tab (may be protected content). Try microphone listening.',
      un_busy: 'A recording is already in progress, wait for it to finish.',
      un_restricted: "Can't capture on this page. Switch to a tab playing music.",
      un_no_tab: 'No active tab found.',
      un_reload: 'Reload the page and try again.',
      un_unsupported: 'Recording is not supported in this tab. Try microphone listening.',
      un_error: 'Could not record, try again.',
      un_timeout: 'Timed out. Try again.',
      un_bg: "Could not reach the extension background.",
      err_capture: 'Could not capture audio, try again.',
      err_service: 'Recognition service failed to load.',
      err_network: 'Connection error. Check the internet and try again.',
      opt_title: 'SoundSniff Settings',
      opt_save: 'Save Settings',
      rec_subtitle: 'Microphone listening',
      rec_hint: 'On first open, allow the microphone prompt in the address bar. If "Remember this decision" is checked, you won\'t be asked again.',
      rec_close: 'Close tab',
      rec_prep: 'Getting ready…',
      rec_wait_mic: 'Waiting for microphone permission…',
      rec_listening: 'Listening… ({s}s)',
      rec_working: 'Identifying…',
      rec_found: 'Found',
      rec_noresult: 'No match found. Get closer to the music and try again.',
      rec_denied: 'Microphone permission denied. Click the icon in the address bar to allow it, then reload the tab.',
      rec_nomic: 'No microphone found.',
      rec_micbusy: 'Microphone is used by another app.',
      rec_startfail: 'Could not start recording.',
      rec_recerr: 'Error during recording.',
      rec_nosound: 'No audio recorded.',
      rec_neterr: 'Connection error. Check the internet and try again.',
      rec_noservice: 'Recognition service failed to load.',
      rec_nogum: 'This browser does not support microphone recording.'
    },
    tr: {
      subtitle: 'Sekmedeki müziği tanı',
      listen_title: 'Sekmedeki müziği tanı',
      mic_title: 'Mikrofonla dinle (yeni sekmede açılır)',
      status_idle: 'Tanımak için dokun',
      status_listening: 'Sekme dinleniyor…',
      status_working: 'Tanımlanıyor…',
      status_working2: 'İkinci kaynak deneniyor…',
      status_found: 'Bulundu',
      status_noresult: 'Eşleşme yok',
      status_error: 'Hata',
      retry: 'Tekrar dene',
      unknown_artist: 'Bilinmeyen sanatçı',
      unknown_song: 'Bilinmeyen şarkı',
      open_song: 'Şarkıyı aç',
      search_web: 'Web’de ara',
      backend_audd: 'AudD ile bulundu',
      backend_sf: 'SongFinder ile bulundu',
      nav_history: 'Geçmiş',
      nav_settings: 'Ayarlar',
      back: 'Geri',
      remove: 'Kaldır',
      history_empty_t: 'Henüz şarkı tanınmadı',
      history_empty_s: 'Dinle düğmesine bas, çalan müziği bulalım',
      settings_saved: 'Kaydedildi',
      lang_label: 'Dil',
      token_label: 'AudD API anahtarı',
      token_opt: '(isteğe bağlı)',
      token_desc: 'Boş bırakırsan ücretsiz kotayla çalışır. Daha fazla tanıma için dashboard.audd.io adresinden ücretsiz anahtar alıp buraya yapıştırabilirsin.',
      token_ph: 'Boş bırakılabilir',
      reclen_label: 'Kayıt süresi',
      reclen_desc: 'Uzun kayıtlar genelde daha isabetli sonuç verir.',
      autostart_label: 'Açılınca otomatik dinle',
      autostart_desc: 'Popup açılır açılmaz tanımaya başla. Yalnızca araç çubuğu düğmesine bastığında çalışır — arka planda asla kayıt yapmaz.',
      hist_label: 'Geçmiş',
      hist_clear: 'Geçmişi temizle',
      about: 'SoundSniff {v} · Tanıma: AudD + SongFinder',
      t_now: 'az önce',
      t_min: '{n} dk önce',
      t_hr: '{n} sa önce',
      un_no_media: 'Bu sekmede çalan ses bulunamadı. Müzik çalan sekmeye geç ya da mikrofonla dinle.',
      un_paused: 'Sekmedeki medya duraklatılmış görünüyor. Oynatıp tekrar dene.',
      un_silent: 'Sekmeden ses alınamadı (korumalı içerik olabilir). Mikrofonla dinlemeyi dene.',
      un_busy: 'Zaten bir kayıt sürüyor, bitmesini bekle.',
      un_restricted: 'Bu sayfada yakalama yapılamaz. Müzik çalan bir sekmeye geç.',
      un_no_tab: 'Aktif sekme bulunamadı.',
      un_reload: 'Sayfayı yenileyip tekrar dene.',
      un_unsupported: 'Bu sekmede kayıt desteklenmiyor. Mikrofonla dinlemeyi dene.',
      un_error: 'Kayıt alınamadı, tekrar dene.',
      un_timeout: 'Zaman aşımı. Tekrar dene.',
      un_bg: 'Eklenti arka planına ulaşılamadı.',
      err_capture: 'Kayıt alınamadı, tekrar dene.',
      err_service: 'Tanıma servisi yüklenemedi.',
      err_network: 'Bağlantı hatası. İnterneti kontrol edip tekrar dene.',
      opt_title: 'SoundSniff Ayarları',
      opt_save: 'Ayarları Kaydet',
      rec_subtitle: 'Mikrofonla dinleme',
      rec_hint: 'İlk açılışta adres çubuğundaki mikrofon isteğine izin ver. "Kararımı hatırla" seçiliyse bir daha sorulmaz.',
      rec_close: 'Sekmeyi kapat',
      rec_prep: 'Hazırlanıyor…',
      rec_wait_mic: 'Mikrofon izni bekleniyor…',
      rec_listening: 'Dinleniyor… ({s} sn)',
      rec_working: 'Tanımlanıyor…',
      rec_found: 'Bulundu',
      rec_noresult: 'Eşleşme bulunamadı. Müziğe yaklaşıp tekrar dene.',
      rec_denied: 'Mikrofon izni verilmedi. Adres çubuğundaki ikona tıklayıp izin ver, sonra sekmeyi yenile.',
      rec_nomic: 'Mikrofon bulunamadı.',
      rec_micbusy: 'Mikrofon başka uygulama tarafından kullanılıyor.',
      rec_startfail: 'Kayıt başlatılamadı.',
      rec_recerr: 'Kayıt sırasında hata oldu.',
      rec_nosound: 'Ses kaydedilemedi.',
      rec_neterr: 'Bağlantı hatası. İnterneti kontrol edip tekrar dene.',
      rec_noservice: 'Tanıma servisi yüklenemedi.',
      rec_nogum: 'Bu tarayıcı mikrofon kaydını desteklemiyor.'
    }
  };

  var current = 'en';

  function t(key, vars) {
    var s = (dict[current] && dict[current][key] !== undefined)
      ? dict[current][key]
      : (dict.en[key] !== undefined ? dict.en[key] : key);
    if (vars) {
      for (var k in vars) {
        if (Object.prototype.hasOwnProperty.call(vars, k)) {
          s = s.split('{' + k + '}').join(String(vars[k]));
        }
      }
    }
    return s;
  }

  function apply() {
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var phs = document.querySelectorAll('[data-i18n-ph]');
    for (var j = 0; j < phs.length; j++) {
      phs[j].setAttribute('placeholder', t(phs[j].getAttribute('data-i18n-ph')));
    }
    var tis = document.querySelectorAll('[data-i18n-title]');
    for (var k = 0; k < tis.length; k++) {
      tis[k].setAttribute('title', t(tis[k].getAttribute('data-i18n-title')));
    }
    try { document.documentElement.lang = current; } catch (e) {}
  }

  function setLang(lang) {
    current = (lang === 'tr') ? 'tr' : 'en';
    apply();
  }

  function getLang() { return current; }

  return { t: t, setLang: setLang, getLang: getLang, apply: apply };
})();
