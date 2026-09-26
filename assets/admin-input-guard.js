/* Normalize numeric administrator input before existing validators run.
 * This is not authentication: all original password and repository checks remain.
 * No password, token or authorization is stored here. */
(function () {
  'use strict';
  if (window.SoilAdminInput) return;
  var ids = ['adm-pass','ref-upload-pass','credPass','delete-pass','wr-auth-password'];
  function normalize(value) {
    return String(value == null ? '' : value)
      .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  }
  function prepare(input) {
    if (!input || ids.indexOf(input.id) < 0) return;
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
  }
  function normalizeInForm(event) {
    var target = event.target;
    if (!target || !target.closest) return;
    var form = target.closest('#soilAdminImport,#soilReferenceUpload,#soilCredentialModal,.delete-mask,.wr-auth');
    if (!form) return;
    ids.forEach(function (id) {
      var input = form.querySelector('#' + id);
      if (!input) return;
      prepare(input);
      var value = normalize(input.value);
      if (input.value !== value) input.value = value;
    });
  }
  document.addEventListener('click', normalizeInForm, true);
  document.addEventListener('submit', normalizeInForm, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Enter') normalizeInForm(e); }, true);
  document.addEventListener('focusin', function (e) { prepare(e.target); }, true);
  window.SoilAdminInput = {normalize:normalize};
})();
