/* Handles training-signup.html: submits the request to the Training
   sign-up Google Form in the background and shows an inline confirmation.
   Every field here has a native `name`, so a visitor with JS disabled can
   submit the form exactly as-is — this script only upgrades the
   experience, it isn't required for the submission to work. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function setStatus(message, kind) {
    var status = byId('ts-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Submitting…', '');

    var form = byId('training-signup-form');
    fetch(form.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
      .then(function () {
        setStatus('Thanks — we’ll be in touch once a course is scheduled.', 'success');
        form.reset();
      })
      .catch(function () {
        setStatus('Could not submit automatically. Check your connection and try again.', 'error');
      });
  }

  function init() {
    byId('training-signup-form').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
