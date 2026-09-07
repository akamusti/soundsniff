(function () {
  'use strict';

  browser.runtime.onInstalled.addListener(async () => {
    try {
      const data = await browser.storage.local.get(['history', 'recordingLength']);
      if (!data.history) {
        await browser.storage.local.set({ history: [] });
      }
      if (!data.recordingLength) {
        await browser.storage.local.set({ recordingLength: 10 });
      }
    } catch (err) {
      console.error('SoundSniff init error:', err);
    }
  });
})();