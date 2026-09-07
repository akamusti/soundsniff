/* SoundSniff ortak tanıma modülü — background ve recorder sekmesi kullanır.
   DOM'a dokunmaz; sadece fetch + FormData. */
(function (global) {
  'use strict';

  var DEFAULT_TOKEN = 'test';

  function getToken() {
    return browser.storage.local.get(['apiToken']).then(function (data) {
      var t = ((data && data.apiToken) || '').trim();
      return t || DEFAULT_TOKEN;
    });
  }

  function recognizeWithAudd(blob, fileName) {
    return getToken().then(function (token) {
      var form = new FormData();
      form.append('file', blob, fileName || 'recording.webm');
      form.append('api_token', token);
      form.append('return', 'spotify,apple_music,deezer');

      return fetch('https://api.audd.io/', { method: 'POST', body: form })
        .then(function (res) { return res.json(); })
        .then(function (json) {
          if (json && json.status === 'success' && json.result) {
            return { matched: true, song: normalizeAudd(json.result) };
          }
          return { matched: false };
        })
        .catch(function (err) {
          console.error('AudD error:', err);
          return { matched: false };
        });
    });
  }

  function recognizeWithSongFinder(blob, fileName) {
    var form = new FormData();
    form.append('file', blob, fileName || 'recording.webm');
    form.append('source', 'cli');
    return fetch('https://songfinder.dev/api/music/recognize', {
      method: 'POST',
      body: form,
      headers: { 'X-SongFinder-Client': 'cli' }
    }).then(function (res) {
      if (res.status === 429) return { matched: false, limited: true };
      return res.json().then(function (payload) {
        if (payload && payload.code === 0 && payload.data && payload.data.matched) {
          var d = payload.data;
          return {
            matched: true,
            song: {
              artist: d.artist || '', title: d.title || '', album: d.album || '',
              link: d.songLink || d.spotifyUrl || d.appleMusicUrl || '',
              artwork: d.artworkUrl || '', extra: ''
            }
          };
        }
        return { matched: false };
      });
    }).catch(function (err) {
      console.error('SongFinder error:', err);
      return { matched: false };
    });
  }

  function recognizeBlob(blob, fileName) {
    return recognizeWithAudd(blob, fileName).then(function (r) {
      if (r.matched) return { matched: true, song: r.song, backend: 'AudD' };
      return recognizeWithSongFinder(blob, fileName).then(function (r2) {
        if (r2.matched) return { matched: true, song: r2.song, backend: 'SongFinder' };
        return { matched: false };
      });
    });
  }

  function normalizeAudd(r) {
    var artist = r.artist || '';
    var title = r.title || '';
    var album = r.album || '';
    var link = r.song_link || '';
    var artwork = '';
    var bits = [];

    try {
      if (r.spotify && r.spotify.album && r.spotify.album.images && r.spotify.album.images.length) {
        artwork = r.spotify.album.images[0].url || '';
        if (!link && r.spotify.external_urls && r.spotify.external_urls.spotify) {
          link = r.spotify.external_urls.spotify;
        }
      }
      if (!artwork && r.apple_music && r.apple_music.artwork && r.apple_music.artwork.url) {
        artwork = String(r.apple_music.artwork.url).replace('{w}x{h}', '300x300');
        if (!link && r.apple_music.url) link = r.apple_music.url;
      }
      if (!artwork && r.deezer) {
        artwork = r.deezer.cover_medium || r.deezer.cover || '';
        if (!link && r.deezer.link) link = r.deezer.link;
      }
      if (r.release_date) bits.push(String(r.release_date).slice(0, 4));
      if (r.label) bits.push(r.label);
    } catch (e) { /* ignore */ }

    return { artist: artist, title: title, album: album, link: link, artwork: artwork, extra: bits.join(' · ') };
  }

  function isSafeUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      var p = new URL(url);
      return p.protocol === 'http:' || p.protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  global.SoundSniffRecognize = {
    recognizeBlob: recognizeBlob,
    recognizeWithAudd: recognizeWithAudd,
    recognizeWithSongFinder: recognizeWithSongFinder,
    normalizeAudd: normalizeAudd,
    isSafeUrl: isSafeUrl
  };
})(typeof window !== 'undefined' ? window : this);
