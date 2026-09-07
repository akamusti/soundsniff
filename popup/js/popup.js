(function () {
  'use strict';

  // DOM
  const btnListen = document.getElementById('btn-listen');
  const btnHistory = document.getElementById('btn-history');
  const btnSettings = document.getElementById('btn-settings');
  const btnBackHistory = document.getElementById('btn-back-history');
  const btnBackSettings = document.getElementById('btn-back-settings');
  const btnClearHistory = document.getElementById('btn-clear-history');
  const btnClearHistorySettings = document.getElementById('btn-clear-history-settings');

  const screenMain = document.getElementById('screen-main');
  const screenHistory = document.getElementById('screen-history');
  const screenSettings = document.getElementById('screen-settings');

  const albumArt = document.getElementById('album-art');
  const songInfo = document.getElementById('song-info');
  const songArtist = document.getElementById('song-artist');
  const songTitle = document.getElementById('song-title');
  const idleMessage = document.getElementById('idle-message');
  const searchingMessage = document.getElementById('searching-message');
  const noResultMessage = document.getElementById('no-result-message');
  const errorMessage = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');

  const apiTokenInput = document.getElementById('api-token-input');
  const recordingLength = document.getElementById('recording-length');
  const recordingLengthValue = document.getElementById('recording-length-value');
  const historyList = document.getElementById('history-list');

  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let history = [];

  // Init
  async function init() {
    const data = await browser.storage.local.get(['history', 'apiToken', 'recordingLength']);

    if (data.history) {
      history = data.history;
    }
    if (data.apiToken) {
      apiTokenInput.value = data.apiToken;
    }
    if (data.recordingLength) {
      recordingLength.value = data.recordingLength;
      recordingLengthValue.textContent = data.recordingLength + 's';
    }

    renderHistory();
  }

  // Screen navigation
  function showScreen(screen) {
    [screenMain, screenHistory, screenSettings].forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
  }

  // Recording length slider
  recordingLength.addEventListener('input', function () {
    recordingLengthValue.textContent = this.value + 's';
  });

  // Navigation
  btnHistory.addEventListener('click', () => {
    showScreen(screenHistory);
  });

  btnSettings.addEventListener('click', () => {
    showScreen(screenSettings);
  });

  btnBackHistory.addEventListener('click', () => {
    showScreen(screenMain);
  });

  btnBackSettings.addEventListener('click', () => {
    saveSettings();
    showScreen(screenMain);
  });

  // Clear history
  btnClearHistory.addEventListener('click', clearHistory);
  btnClearHistorySettings.addEventListener('click', clearHistory);

  function clearHistory() {
    history = [];
    browser.storage.local.set({ history: [] });
    renderHistory();
  }

  // Save settings
  function saveSettings() {
    browser.storage.local.set({
      apiToken: apiTokenInput.value.trim(),
      recordingLength: parseInt(recordingLength.value)
    });
  }

  // Show states
  function showState(state) {
    idleMessage.style.display = 'none';
    searchingMessage.style.display = 'none';
    noResultMessage.style.display = 'none';
    errorMessage.style.display = 'none';

    switch (state) {
      case 'idle':
        idleMessage.style.display = '';
        break;
      case 'searching':
        searchingMessage.style.display = 'flex';
        break;
      case 'no-result':
        noResultMessage.style.display = 'flex';
        break;
      case 'error':
        errorMessage.style.display = 'flex';
        break;
    }
  }

  // Listen button
  btnListen.addEventListener('click', async () => {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  });

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });

      audioChunks = [];
      const mimeType = detectMimeType();
      mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        processRecording();
      };

      mediaRecorder.start();
      isRecording = true;

      btnListen.classList.add('recording');
      albumArt.classList.add('active');
      showState('searching');

      const recordLength = parseInt(recordingLength.value) * 1000;
      setTimeout(() => {
        if (isRecording) {
          stopRecording();
        }
      }, recordLength);

    } catch (err) {
      console.error('Mic error:', err);
      showError('Microphone access denied');
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    isRecording = false;
    btnListen.classList.remove('recording');
  }

  function detectMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  async function processRecording() {
    if (audioChunks.length === 0) {
      showError('No audio recorded');
      return;
    }

    const blob = new Blob(audioChunks, { type: audioChunks[0].type || 'audio/webm' });
    audioChunks = [];

    // Try AudD first, fall back to SongFinder if nothing matched
    const auddResult = await recognizeWithAudd(blob);
    if (auddResult.matched) {
      showResult(auddResult.song);
      saveToHistory(auddResult.song);
      return;
    }

    const sfResult = await recognizeWithSongFinder(blob);
    if (sfResult.matched) {
      showResult(sfResult.song);
      saveToHistory(sfResult.song);
      return;
    }

    showState('no-result');
  }

  // AudD recognition - works out of the box with test token (10 free/day)
  async function recognizeWithAudd(blob) {
    try {
      const data = await browser.storage.local.get(['apiToken']);
      const apiToken = data.apiToken || '';

      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      if (apiToken) {
        formData.append('api_token', apiToken);
      }
      formData.append('return', 'spotify,apple_music,deezer,youtube');

      const response = await fetch('https://api.audd.io/', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.status === 'success' && result.result) {
        return { matched: true, song: result.result };
      }
      return { matched: false };
    } catch (err) {
      console.error('AudD error:', err);
      return { matched: false };
    }
  }

  // SongFinder.dev recognition - free, no API key, falls back when AudD misses
  async function recognizeWithSongFinder(blob) {
    try {
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      formData.append('source', 'cli');

      const response = await fetch('https://songfinder.dev/api/music/recognize', {
        method: 'POST',
        body: formData,
        headers: {
          'X-SongFinder-Client': 'cli'
        }
      });

      if (response.status === 429) {
        console.warn('SongFinder rate limited');
        return { matched: false };
      }

      const payload = await response.json();
      if (payload.code === 0 && payload.data && payload.data.matched) {
        const d = payload.data;
        return {
          matched: true,
          song: {
            artist: d.artist || '',
            title: d.title || '',
            song_link: d.songLink || d.spotifyUrl || d.appleMusicUrl || '',
            album_image: d.artworkUrl || ''
          }
        };
      }
      return { matched: false };
    } catch (err) {
      console.error('SongFinder error:', err);
      return { matched: false };
    }
  }

  function showResult(song) {
    songArtist.textContent = song.artist || 'Unknown Artist';
    songTitle.textContent = song.title || 'Unknown Song';

    if (isSafeUrl(song.song_link)) {
      songInfo.style.cursor = 'pointer';
      songInfo.onclick = () => {
        browser.tabs.create({ url: song.song_link });
      };
    } else {
      songInfo.style.cursor = 'default';
      songInfo.onclick = null;
    }

    // Update album art
    const img = albumArt.querySelector('img');
    if (img) img.remove();
    albumArt.querySelector('.album-art-inner').style.display = '';

    if (isSafeUrl(song.song_link) && song.song_link.includes('youtu')) {
      const videoId = song.song_link.includes('youtu.be/')
        ? song.song_link.split('youtu.be/')[1]
        : song.song_link.split('v=')[1];
      if (videoId) {
        const imgEl = document.createElement('img');
        imgEl.src = `https://i3.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
        imgEl.alt = 'Album Art';
        albumArt.querySelector('.album-art-inner').style.display = 'none';
        albumArt.appendChild(imgEl);
      }
    } else if (song.album_image && isSafeUrl(song.album_image)) {
      const imgEl = document.createElement('img');
      imgEl.src = song.album_image;
      imgEl.alt = 'Album Art';
      albumArt.querySelector('.album-art-inner').style.display = 'none';
      albumArt.appendChild(imgEl);
    }

    showState('idle');
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function showError(msg) {
    errorText.textContent = msg;
    showState('error');
    setTimeout(() => showState('idle'), 3000);
  }

  // History
  function saveToHistory(song) {
    const entry = {
      artist: String(song.artist || '').slice(0, 200),
      title: String(song.title || '').slice(0, 200),
      songLink: isSafeUrl(song.song_link) ? song.song_link : '',
      timestamp: Date.now()
    };

    // Dedup
    history = history.filter(h =>
      !(h.artist === entry.artist && h.title === entry.title)
    );

    history.unshift(entry);
    if (history.length > 50) history = history.slice(0, 50);

    browser.storage.local.set({ history });
    renderHistory();
  }

  function renderHistory() {
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-history">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          <span>No songs identified yet</span>
        </div>
      `;
      return;
    }

    historyList.innerHTML = history.map((item, i) => `
      <div class="history-item" data-index="${i}">
        <div class="history-cover">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
        </div>
        <div class="history-info">
          <div class="history-info-title">${escapeHtml(item.title)}</div>
          <div class="history-info-artist">${escapeHtml(item.artist)}</div>
          <div class="history-info-time">${formatTime(item.timestamp)}</div>
        </div>
        <button class="history-delete" data-index="${i}" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Click to open
    historyList.querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.history-delete')) return;
        const idx = parseInt(el.dataset.index, 10);
        if (history[idx] && isSafeUrl(history[idx].songLink)) {
          browser.tabs.create({ url: history[idx].songLink });
        }
      });
    });

    // Delete buttons
    historyList.querySelectorAll('.history-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.index);
        history.splice(idx, 1);
        browser.storage.local.set({ history });
        renderHistory();
      });
    });
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diff = now - d;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return d.toLocaleDateString();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Message listener for background
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.cmd === 'result') {
      showResult(msg.song);
      saveToHistory(msg.song);
    } else if (msg.cmd === 'no-result') {
      showState('no-result');
    } else if (msg.cmd === 'error') {
      showError(msg.text);
    }
  });

  init();
})();
