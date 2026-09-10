# SoundSniff

**[English](README.md)**

Firefox (ve forkları) için Shazam tarzı müzik tanıma eklentisi. Sekmede çalan şarkıyı bulur. Kayıt yok, API anahtarı zorunluluğu yok.

## Kurulum

1. `about:debugging#/runtime/this-firefox` adresini aç
2. "Geçici Eklenti Yükle" → `manifest.json` dosyasını seç

## Kullanım

- Araç çubuğu düğmesine bas: Shazam gibi otomatik dinlemeye başlar, ikinci kez basman gerekmez. İstersen Ayarlar → "Açılınca otomatik dinle" seçeneğinden kapatabilirsin.
- Müzik çalan sekmede 5–30 sn dinler, izin penceresi çıkmaz.
- Odadaki ses için mikrofon düğmesi ayrı sekme açar, izin orada verilir.
- Sonuç: sanatçı, şarkı, kapak, dinleme bağlantısı.
- Sonuçlar Geçmiş'te saklanır (50 adet).
- Varsayılan dil İngilizce; Ayarlar'dan Türkçe'ye geçilebilir.

## Nasıl çalışır

1. **AudD** ile tanır (anahtarsız ücretsiz kota dahil).
2. Bulunamazsa **SongFinder** denenir.
3. İstersen `dashboard.audd.io` adresinden ücretsiz anahtar alıp Ayarlar'a girebilirsin.

## Gizlilik

- Ses yalnızca tanıma için gönderilir, saklanmaz.
- Otomatik dinleme yalnızca araç çubuğuna bastığında çalışır; arka planda asla kayıt yapmaz.
- Telemetri yok, hesap yok.
- En dar izinler: yalnızca `storage`, `activeTab` ve `scripting`.
