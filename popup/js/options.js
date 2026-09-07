(function () {
  'use strict';

  const tokenInput = document.getElementById('token');
  const lengthInput = document.getElementById('length');
  const lengthVal = document.getElementById('length-val');
  const saveBtn = document.getElementById('save');

  if (!tokenInput || !lengthInput || !lengthVal || !saveBtn) {
    return;
  }

  lengthInput.addEventListener('input', () => {
    lengthVal.textContent = lengthInput.value + 's';
  });

  browser.storage.local.get(['apiToken', 'recordingLength']).then(data => {
    if (data.apiToken) tokenInput.value = data.apiToken;
    if (data.recordingLength) {
      lengthInput.value = data.recordingLength;
      lengthVal.textContent = data.recordingLength + 's';
    }
  }).catch(err => console.error('SoundSniff options load error:', err));

  saveBtn.addEventListener('click', () => {
    browser.storage.local.set({
      apiToken: tokenInput.value.trim(),
      recordingLength: parseInt(lengthInput.value, 10) || 10
    }).then(() => {
      saveBtn.textContent = 'Saved!';
      setTimeout(() => { saveBtn.textContent = 'Save Settings'; }, 1500);
    }).catch(err => console.error('SoundSniff options save error:', err));
  });
})();