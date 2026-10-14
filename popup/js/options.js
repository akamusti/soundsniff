(function () {
  'use strict';

  var tokenInput = document.getElementById('token');
  var lengthInput = document.getElementById('length');
  var lengthVal = document.getElementById('length-val');
  var saveBtn = document.getElementById('save');
  var langSelect = document.getElementById('lang');
  var autostartInput = document.getElementById('autostart');
  var autolistenInput = document.getElementById('autolisten');
  var autolistenBudget = document.getElementById('autolisten-budget');
  var autolistenBudgetVal = document.getElementById('autolisten-budget-val');
  var autolistenBudgetNote = document.getElementById('autolisten-budget-note');

  if (!tokenInput || !lengthInput || !lengthVal || !saveBtn) {
    return;
  }

  function applyLang(lang) {
    try {
      if (typeof window.I18N !== 'undefined') window.I18N.setLang(lang);
    } catch (e) {}
    if (langSelect) langSelect.value = (lang === 'tr') ? 'tr' : 'en';
    renderAuto(lastAuto);
  }

  var lastAuto = null;

  browser.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.cmd === 'auto-listen-state') {
      lastAuto = msg.state;
      renderAuto(lastAuto);
    }
    return undefined;
  });

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

  browser.storage.local.get(['apiToken', 'recordingLength', 'lang', 'autoStart', 'autoListen']).then(function (data) {
    if (data.apiToken) tokenInput.value = data.apiToken;
    if (data.recordingLength) {
      lengthInput.value = data.recordingLength;
      lengthVal.textContent = data.recordingLength + 's';
    }
    if (autostartInput) autostartInput.checked = (typeof data.autoStart === 'undefined') ? true : !!data.autoStart;
    renderAuto(data.autoListen);
    lastAuto = data.autoListen;
    applyLang(data.lang || 'en');
  }).catch(function (err) { console.error('SoundSniff options load error:', err); });

  function t(key, vars) {
    try {
      if (typeof window.I18N !== 'undefined') return window.I18N.t(key, vars);
    } catch (e) {}
    return key;
  }

  function renderAuto(raw) {
    var s = (raw && typeof raw === 'object') ? raw : {};
    var budget = parseInt(s.budget, 10);
    if (!(budget >= 3 && budget <= 60)) budget = 10;
    if (autolistenInput) autolistenInput.checked = !!s.enabled;
    if (autolistenBudget) autolistenBudget.value = String(budget);
    if (autolistenBudgetVal) autolistenBudgetVal.textContent = String(budget);
    if (autolistenBudgetNote) {
      autolistenBudgetNote.textContent = t('auto_budget_val', { used: parseInt(s.used, 10) || 0, max: budget });
    }
  }

  if (autolistenInput) {
    autolistenInput.addEventListener('change', function () {
      send('auto-listen-' + (this.checked ? 'start' : 'stop'));
    });
  }

  if (autolistenBudget) {
    autolistenBudget.addEventListener('input', function () {
      if (autolistenBudgetVal) autolistenBudgetVal.textContent = this.value;
    });
    autolistenBudget.addEventListener('change', function () {
      send('auto-listen-budget', { value: parseInt(this.value, 10) });
    });
  }

  function send(cmd, extra) {
    var payload = { cmd: cmd };
    if (extra) for (var k in extra) payload[k] = extra[k];
    try { browser.runtime.sendMessage(payload).catch(function () {}); } catch (e) {}
  }

  saveBtn.addEventListener('click', function () {
    var payload = {
      apiToken: tokenInput.value.trim(),
      recordingLength: parseInt(lengthInput.value, 10) || 10,
      autoStart: autostartInput ? !!autostartInput.checked : true
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
