# SoundSniff

**[English](README.md)**

Firefox (ve forkları) için Shazam tarzı müzik tanıma eklentisi. Sekmede çalan şarkıyı bulur. Kayıt yok, API anahtarı zorunluluğu yok.

## Kurulum

- Firefox Eklentileri: https://addons.mozilla.org/en-US/firefox/addon/soundsniff/
- Ya da elle:
  1. `about:debugging#/runtime/this-firefox` adresini aç
  2. "Geçici Eklenti Yükle" → `manifest.json` dosyasını seç

## Kullanım

- Araç çubuğu düğmesine bas: Shazam gibi otomatik dinlemeye başlar, ikinci kez basman gerekmez. İstersen Ayarlar → "Açılınca otomatik dinle" seçeneğinden kapatabilirsin.
- Müzik çalan sekmede 5–30 sn dinler, izin penceresi çıkmaz.
- Odadaki ses için mikrofon düğmesi ayrı sekme açar, izin orada verilir.
- Sonuç: sanatçı, şarkı, kapak, dinleme bağlantıları (Spotify, Apple Music, Deezer, YouTube).
- Sonuçlar Geçmiş'te saklanır (50 adet).
- Varsayılan dil İngilizce; Ayarlar'dan Türkçe'ye geçilebilir.

## Sürekli dinleme (isteğe bağlı)

Shazam'ın ayırt eden davranışı: bir kez başlatırsın, uygulama arka planda
tanımaya devam eder ve şarkı değişince kendiliğinden geçiş yapar. SoundSniff
bunu yapabiliyor.

- Mikrofon düğmesinin yanındaki döngü düğmesiyle ya da Ayarlar'dan açılır.
- **Varsayılan kapalı.** Yalnızca sen açtığında arka planda kayıt yapar.
- Yaklaşık 20–45 saniyede bir kontrol eder, ama önce sesi **yerelde** karşılaştırır.
  Ses değişmediyse **hiç tanıma isteği gönderilmez, kotadan da düşülmez**. Yalnızca
  gerçek bir değişiklik isteye mal olur; böylece sürekli dinleme, her kontrolde bir
  istek yerine **şarkı başına yaklaşık bir istek** demektir.
- Beş değişmeyen kontrolün birinde yine de istek gönderilir; spektral olarak
  benzeyen iki parça birbirini uzun süre gizleyemez. Yerelde yanıtlanan kontrol
  sayısı Ayarlar'da gösterilir.
- Yeni şarkı çaldığında anında Geçmiş'e eklenir.
- Sekmede müzik yoksa, üst üste eşleşme bulunamazsa ya da tanıma servisi istek
  sınırına takılırsa kendiliğinden duraklar.
- Her kontrol günlük kotandan bir tanıma harcar; bu yüzden Ayarlar →
  "Günlük tanıma sınırı" değerinde (varsayılan 10) kendiliğinden durur. Elle
  yapılan dinleme bu sınırla asla engellenmez.
- İstediğin an popup'daki Durdur düğmesiyle kapatabilirsin.

## Nasıl çalışır

1. **AudD** ile tanır (anahtarsız ücretsiz kota dahil).
2. Bulunamazsa **SongFinder** denenir.
3. İstersen `dashboard.audd.io` adresinden ücretsiz anahtar alıp Ayarlar'a girebilirsin.

## Gizlilik

- Ses yalnızca tanıma için gönderilir, saklanmaz.
- "Açılınca otomatik dinle" yalnızca araç çubuğuna bastığında çalışır.
- Sürekli dinleme isteğe bağlıdır ve **popup açık değilken kayıt yapan tek
  moddur**. Açıkken, aktif sekmeden 20–45 saniyede bir kısa bir örnek alınıp
  tanıma için AudD ve SongFinder'a gönderilir. Günlük sınıra ulaşınca kendiliğinden
  durur ve tek tıkla kapatılır.
- Telemetri yok, hesap yok.
- En dar izinler: yalnızca `storage`, `activeTab`, `scripting` ve `alarms`.
  `alarms`, Firefox arka plan sayfasını askıya aldığında sürekli döngünün
  hayatta kalabilmesi için gerekli; kendi kontrollerinden başka bir şey
  planlamaz.
