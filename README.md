# SoundSniff

**[Türkçe](README.tr.md)**

Shazam-style music recognition add-on for Firefox (and forks). Finds the song playing in your tab. No sign-up, no API key required.

## Install

- Firefox Add-ons: https://addons.mozilla.org/en-US/firefox/addon/soundsniff/
- Or manually:
  1. Open `about:debugging#/runtime/this-firefox`
  2. "Load Temporary Add-on" → select `manifest.json`

## Usage

- Click the toolbar button: it starts listening automatically (Shazam-style, no second click needed). Disable in Settings → "Auto-listen on open" if you prefer manual.
- On a tab playing music, it listens 5–30s — no permission prompt needed.
- For room audio, the mic button opens a separate tab where the permission works.
- Result: artist, title, artwork, streaming links (Spotify, Apple Music, Deezer, YouTube).
- Results are kept in History (50 entries).
- Default language is English; switch to Turkish in Settings.

## Continuous listening (optional)

Shazam's defining behaviour: start once, and it keeps identifying in the
background and switches by itself when the track changes. SoundSniff can do the
same.

- Turn it on with the loop button next to the microphone, or in Settings.
- **Off by default.** It records in the background only while you have it on.
- It re-checks roughly every 20–45 seconds. If the same track comes back it stays
  quiet and keeps watching; when a new track appears it is added to History
  immediately.
- It pauses itself when there is no music in the tab, when nothing matches
  several times in a row, or when the recognition service rate-limits us.
- Every check costs one recognition from your daily quota, so it stops by itself
  at the limit you set in Settings → "Daily recognition limit" (default 10).
  Manual listening is never blocked by that limit.
- Stop it at any time with the Stop button in the popup.

## How it works

1. Recognizes via **AudD** (free quota included, no key needed).
2. Falls back to **SongFinder** when nothing matches.
3. Optionally paste your free key from `dashboard.audd.io` in Settings for more recognitions.

## Privacy

- Audio is sent only for recognition, never stored.
- Auto-listen on open runs only after you click the toolbar button.
- Continuous listening is opt-in and is the **only** mode that records without
  an open popup. While it is on, a short sample of the active tab is captured
  every 20–45 seconds and sent to AudD and SongFinder for recognition. It stops
  on its own at the daily limit, and one click turns it off.
- No telemetry, no accounts.
- Least privilege: `storage`, `activeTab`, `scripting` and `alarms` only. `alarms`
  exists so the continuous loop can survive Firefox suspending the background
  page; it schedules nothing beyond its own re-checks.
