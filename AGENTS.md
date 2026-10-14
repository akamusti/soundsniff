# AGENTS.md — SoundSniff

Operating manual for AI agents (and humans) working in this repository.
This file is the source of truth for how changes are made here. Read it fully
before touching any file.

---

## 1. What this project is

SoundSniff is a **Firefox WebExtension (Manifest V3)** that identifies the music
playing in the current tab, Shazam-style. It is **not** a local fingerprinting
engine — it captures a short recording and delegates identification to two
third-party HTTP services.

| Provider | Endpoint | Auth | Notes |
|---|---|---|---|
| AudD | `https://api.audd.io/` | `api_token` form field | Free tier is **~10 requests/day** |
| SongFinder | `https://songfinder.dev/api/music/recognize` | none (uses `X-SongFinder-Client: cli`) | Falls back when AudD misses; returns HTTP 429 when limited |

Recognition order is **AudD first, SongFinder second** (see `recognizeBlob` in
`js/recognize.js`). AudD is preferred because it returns richer metadata
(release date, label, per-provider links).

**The quota is the single hardest constraint in this codebase.** Any feature that
adds automatic recognition requests must be quota-aware. See §6.

---

## 2. Repository layout

```
manifest.json        MV3 manifest. Version bump lives here.
js/i18n.js           Dictionary of every user-facing string, EN + TR.
                     MUST stay in sync — see §4.
js/recognize.js      Shared recognition module (fetch + FormData only, no DOM).
js/background.js     Event page. Owns capture orchestration, history, matching.
js/content.js        Content script. Taps <audio>/<video> via captureStream().
popup/popup.html     Main popup shell (3 screens: main / history / settings).
popup/js/popup.js    Popup controller, state machine, rendering.
popup/recorder.html  Microphone listening page (needs a real tab for getUserMedia).
popup/js/recorder.js Microphone recorder + recognition.
popup/options.html   Standalone settings page (options_ui).
popup/js/options.js  Settings page controller.
popup/css/popup.css  All styles.
icons/               PNG icons 16/32/48/96/128.
```

### Data flow

```
popup.js  --{cmd:'capture-tab'}-->  background.js
background.js  --{cmd:'soundsniff-capture'}-->  content.js   (activeTab, same tab)
content.js  --{cmd:'soundsniff-audio', buffer}>--  background.js
background.js  --recognizeBlob()-->  recognize.js  --HTTP--> AudD / SongFinder
background.js  --storage(history, lastResult)-->  popup.js renders result
```

The audio buffer crosses the message boundary as an **ArrayBuffer**. `background.js`
rejects buffers larger than **8 MB**.

---

## 3. Hard rules — do not violate

These are correctness and security invariants. Breaking them breaks the extension,
the store review, or the user's data.

1. **Never mutate the page's audio path.** `js/content.js` must not use
   `createMediaElementSource` on the page's own elements. Tap with `captureStream()`
   only. Using the media-element source reroutes the page's audio and leaves the tab
   silent until reload — this was a real bug, fixed in v1.2.0. Do not regress it.
2. **Every URL that reaches the DOM goes through `isSafeUrl()`** (`http:`/`https:` only).
   This is the XSS guard for artwork, links, and history rows. No exceptions.
3. **No `innerHTML` for untrusted data.** Build DOM with `createElement` /
   `textContent`. The history list and link chips must stay injection-free.
4. **Keep the CSP.** `script-src 'self'` — no inline scripts, no `eval`, no remote
   script. `manifest.json` CSP changes will fail AMO review.
5. **Keep `host_permissions` minimal.** Only `api.audd.io` and `songfinder.dev`.
   Adding a host permission must be justified in the commit message, because it
   changes what the review tells users about data access.
6. **Cap and sanitize everything crossing storage boundaries.** History is capped at
   50 entries, all strings sliced (200 chars for artist/title/album, 500 for URLs).
7. **Never log or store audio.** The buffer exists only in memory for the duration of
   the request. Do not persist it, do not put it in `console.*`.
8. **Silence is a valid outcome, not an error.** DRM-protected media produces a
   silent stream. Report `silent`, do not retry-loop forever.

---

## 4. Localization — the rule everyone forgets

`js/i18n.js` holds **two complete dictionaries** (`en` and `tr`). Adding a user-facing
string means:

1. Add the key to **both** `en` and `tr`.
2. Reference it from HTML with `data-i18n="key"`, `data-i18n-ph`, or `data-i18n-title`.
3. Reference it from JS with `I18N.t('key', {n: 5})` and a `{n}`-style placeholder.
4. Build a Turkish (and only Turkish) sentence naturally — do not transliterate the
   English string.

A key present in `en` but missing in `tr` silently falls back to English. A key present
in neither renders as the raw key name to the user. Treat both as bugs.

Existing **code comments are in Turkish**; that is the established convention in
`js/*.js`. Keep new comments Turkish in those files, and English in files that are
already English-commented. User-facing *strings* are localized via §4, never hardcoded.

---

## 5. Secrets and personal data — mandatory pre-commit check

The user requires this check on **every** completed change, before committing.

### 5.1 Never commit a real secret

- The AudD key the user pastes is stored in `browser.storage.local` **at runtime**.
  There is no `.env` in this repo and there must not be one containing a real key.
- If a change ever needs an API key or token: put it in `.env` (gitignored), load it
  through a small indirection, and commit `.env.example` with placeholder values only.
- Before every commit, run the scan in §5.3 and treat any hit as a blocker.

### 5.2 Things that must never appear in this repo

- Real AudD / API keys, tokens, passwords, cookies, session IDs
- Personal data: names, e-mail addresses, phone numbers, home paths, machine names,
  real listening history, real IP addresses
- Absolute local filesystem paths in committed code or docs
- Attribution to a person other than the project owner (`akamusti`)

### 5.3 The scan

```sh
git diff --cached | grep -nEi '(api[_-]?key|api[_-]?token|secret|password|passwd|bearer|authorization|private[_-]?key|BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-|gh[pousr]_|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{16,})'
git diff --cached | grep -nEi '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
git diff --cached | grep -nE '/home/|/Users/|C:\\\\'
```

Review every hit manually. A hit on `apiToken` as a *field name* is expected and fine;
a hit on a long literal value is not. If you find a real secret that was already
committed, say so loudly and rotate it — do not quietly amend history.

---

## 6. Rate limiting and quota — non-negotiable for automatic features

AudD's free tier is roughly **10 recognitions per day**. SongFinder returns HTTP 429.
A naive "recognize every 5 seconds" loop will exhaust the user's quota in under a
minute, and they will have no idea why.

Any automatic/continuous recognition feature **must**:

- Enforce a **minimum gap** between requests (no request before the previous one resolves).
- Enforce a **session and daily request budget**, persisted in storage.
- **Back off** exponentially on 429 / repeated no-match, never hammer.
- **Auto-stop** when the tab has no playing media, when the page is restricted, or
  after N consecutive failures.
- **Stop immediately** when the user turns it off, and survive popup closure (the popup
  closing must not be the only thing that ends a background job).
- Show the user what it is doing and let them stop it at any time.

Shazam-style *continuous* listening is a product feature, not a licence to spend the
user's quota. Default it **off**, require explicit opt-in, and document the cost in the
settings description.

### MV3 event-page constraint

Firefox MV3 background pages are **event pages**: they are suspended when idle and
`setTimeout` chains do **not** survive. Anything that must run across suspension has to
be driven by `browser.alarms` with state persisted in `browser.storage.local`. Assume
any in-memory variable is lost between two steps of a long-running loop, and that the
same message handler may be entered twice — **make the loop idempotent and guarded by a
persisted "running" flag**.

---

## 7. Versioning

Every user-visible change bumps the version. Semver, `MAJOR.MINOR.PATCH`, and the
version appears in **three** places that must agree:

1. `manifest.json` → `version`
2. `popup/js/popup.js` → `var APP_VERSION = '...'`
3. Any version string rendered in `popup/popup.html` or `popup/options.html`

Convention in this repo: `Minor` = new feature, `Patch` = bug fix or layout fix.
The version is also appended to the commit subject, e.g.
`Add continuous auto-listen (v1.7.0)`.

---

## 8. Git workflow

- Branch: `master`. Commit directly unless asked otherwise.
- `master` may have commits that your local clone has not fetched yet. Run
  `git fetch origin` and rebase onto `origin/master` before pushing; a plain
  `git push` will fail with "refusing to merge unrelated histories" otherwise.
  Rebase rather than merge — this history is linear by convention.
- **Commit messages are in English.** Subject line is imperative, ≤ 72 chars, and ends
  with the version: `Add continuous auto-listen (v1.7.0)`.
- Body explains *why*, not *what*. Wrap at 72 chars.
- One logical change per commit. Do not mix a feature with unrelated reformatting.
- Do not commit build artifacts, `.DS_Store`, `node_modules`, or editor configs.
- `git add` specific paths; never `git add -A` blindly. Verify with `git status`
  before committing — the working tree contains user work you must not clobber.
- Push to `origin master` after a successful pre-commit check (§5.3).
- Conversation with the **user is in Turkish**. Commits, docs, and code are not.

---

## 9. Firefox / AMO store requirements

These are enforced by the store and will fail review if violated.

- `manifest.json` → `browser_specific_settings.gecko.id` is stable; never change it,
  or every existing user loses their install and history.
- `strict_min_version` currently `142.0` (required for
  `data_collection_permissions`). Raising it drops users — justify it in the commit.
- `data_collection_permissions.required: ["none"]` is a **factual claim**. Recognition
  audio is sent to AudD and SongFinder, so "none" must keep referring to *data
  collected by the developer*. Do not weaken or misstate it.
- No remote code, no `eval`, no CDN scripts, no native messaging binaries.
- Every new permission needs a stated reason in the commit body. Reviewers ask.

---

## 10. Before you call a change done

Work through this list every time:

1. **Static check.** No syntax errors. Run `node --check` on each modified `.js`.
2. **Manifest check.** Valid JSON, version bumped consistently across all locations.
3. **i18n check.** Every new key present in `en` **and** `tr`. No raw keys visible.
4. **Security check.** New URLs pass `isSafeUrl`. No `innerHTML` with data. No new
   permissions or host permissions without justification.
5. **Secret scan.** §5.3, all three commands, reviewed line by line.
6. **Quota check.** Any new automatic request path respects §6.
7. **Manual test plan.** Write it down in the commit body or the PR:
   - Fresh install, first run.
   - A tab with music playing, a paused tab, a tab with no media, a `file://` or
     store-restricted tab, a DRM/muted tab.
   - Popup closed mid-recognition.
   - Keyboard-only navigation of every new control.
   - Both languages, including long strings (layout must not break).
8. **README.** User-visible features are documented in `README.md` and `README.tr.md`.
   Keep the two in sync.

---

## 11. Tone of voice

SoundSniff is a small, friendly, free tool. The README and UI copy are plain and
confident — no marketing hype, no exclamation marks, no emoji in the UI. Match that.