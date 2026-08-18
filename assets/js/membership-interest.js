/* Handles the Membership page's simple name/email interest form: submits
   to the membership-interest Google Form in the background. Every field
   has a native `name`, so a visitor with JS disabled can still submit —
   this script only upgrades the experience. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function setStatus(message, kind) {
    var status = byId('mi-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Submitting…', '');

    var form = byId('membership-interest-form');
    fetch(form.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
      .then(function () {
        setStatus("Thanks — we'll follow up by email.", 'success');
        form.reset();
      })
      .catch(function () {
        setStatus('Could not submit automatically. Check your connection and try again.', 'error');
      });
  }

  function init() {
    var form = byId('membership-interest-form');
    if (!form) return;
    form.addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
