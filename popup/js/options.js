(function () {
  'use strict';

  var tokenInput = document.getElementById('token');
  var lengthInput = document.getElementById('length');
  var lengthVal = document.getElementById('length-val');
  var saveBtn = document.getElementById('save');
  var langSelect = document.getElementById('lang');

  if (!tokenInput || !lengthInput || !lengthVal || !saveBtn) {
    return;
  }

  function applyLang(lang) {
    try {
      if (typeof window.I18N !== 'undefined') window.I18N.setLang(lang);
    } catch (e) {}
    if (langSelect) langSelect.value = (lang === 'tr') ? 'tr' : 'en';
  }

  lengthInput.addEventListener('input', function () {
    lengthVal.textContent = lengthInput.value + 's';
  });

  if (langSelect) {
    langSelect.addEventListener('change', function () {
      var lang = (langSelect.value === 'tr') ? 'tr' : 'en';
      browser.storage.local.set({ lang: lang }).catch(function () {});
      applyLang(lang);
    });
  }

  browser.storage.local.get(['apiToken', 'recordingLength', 'lang']).then(function (data) {
    if (data.apiToken) tokenInput.value = data.apiToken;
    if (data.recordingLength) {
      lengthInput.value = data.recordingLength;
      lengthVal.textContent = data.recordingLength + 's';
    }
    applyLang(data.lang || 'en');
  }).catch(function (err) { console.error('SoundSniff options load error:', err); });

  saveBtn.addEventListener('click', function () {
    var payload = {
      apiToken: tokenInput.value.trim(),
      recordingLength: parseInt(lengthInput.value, 10) || 10
    };
    if (langSelect) payload.lang = (langSelect.value === 'tr') ? 'tr' : 'en';
    browser.storage.local.set(payload).then(function () {
      try {
        var label = (typeof window.I18N !== 'undefined') ? window.I18N.t('settings_saved') : 'Saved!';
        var original = saveBtn.textContent;
        saveBtn.textContent = label;
        setTimeout(function () { saveBtn.textContent = original; applyLang(payload.lang || 'en'); }, 1500);
      } catch (e) {}
    }).catch(function (err) { console.error('SoundSniff options save error:', err); });
  });
})();
