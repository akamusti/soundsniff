# SoundSniff

**[Türkçe](README.tr.md)**

Shazam-style music recognition add-on for Firefox (and forks). Finds the song playing in your tab. No sign-up, no API key required.

## Install

1. Open `about:debugging#/runtime/this-firefox`
2. "Load Temporary Add-on" → select `manifest.json`

## Usage

- Click the toolbar button: it starts listening automatically (Shazam-style, no second click needed). Disable in Settings → "Auto-listen on open" if you prefer manual.
- On a tab playing music, it listens 5–30s — no permission prompt needed.
- For room audio, the mic button opens a separate tab where the permission works.
- Result: artist, title, artwork, listen link.
- Results are kept in History (50 entries).
- Default language is English; switch to Turkish in Settings.

## How it works

1. Recognizes via **AudD** (free quota included, no key needed).
2. Falls back to **SongFinder** when nothing matches.
3. Optionally paste your free key from `dashboard.audd.io` in Settings for more recognitions.

## Privacy

- Audio is sent only for recognition, never stored.
- Auto-listen runs only after you click the toolbar button; never records in the background.
- No telemetry, no accounts.
- Least privilege: `storage`, `activeTab` and `scripting` only.
