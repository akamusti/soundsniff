# SoundSniff

Firefox (ve forkları) için Shazam tarzı müzik tanıma eklentisi. Mikrofonla dinler, şarkıyı bulur. Kayıt yok, API anahtarı zorunluluğu yok.

Firefox (and forks) Shazam-style music recognition add-on. Listens via microphone, finds the song. No sign-up, no API key required.

## Kurulum / Install

1. `about:debugging#/runtime/this-firefox` aç / Open `about:debugging#/runtime/this-firefox`
2. "Geçici Eklenti Yükle / Load Temporary Add-on" → `manifest.json` dosyasını seç / select `manifest.json`

## Kullanım / Usage

- Müzik çalan sekmedeyken turuncu düğmeye bas, 5–30 sn dinlesin (izin istemez) / On the tab playing music, press the orange button, it listens 5–30s (no permission needed)
- Odadaki ses için mikrofon düğmesi ayrı sekme açar, izin orda verilir / For room audio the mic button opens a separate tab where permission works
- Sonuç: sanatçı, şarkı, kapak, dinleme bağlantısı / Result: artist, title, artwork, listen link
- Sonuçlar Geçmiş'te saklanır (50 adet) / Results are kept in History (50)

## Nasıl çalışır / How it works

1. **AudD** ile tanır (anahtarsız ücretsiz kota dahil) / Recognizes via **AudD** (free quota, no key needed)
2. Bulunamazsa **SongFinder** denenir / Falls back to **SongFinder**
3. İstersen `dashboard.audd.io` adresinden ücretsiz anahtar alıp Ayarlar'a girebilirsin / Optionally paste your free key from `dashboard.audd.io` in Settings

## Gizlilik / Privacy

- Ses yalnızca tanıma için gönderilir, saklanmaz / Audio is sent only for recognition, never stored
- Telemetri yok, hesap yok / No telemetry, no accounts
- En dar izinler: yalnızca `storage` / Least privilege: `storage` only
