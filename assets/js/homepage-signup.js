/* Handles the homepage's combined signup form: shows/hides the Interest
   field and changes the submit button's text based on the chosen tier,
   then submits to the homepage-signup Google Form in the background.
   Every field has a native `name`, so a visitor with JS disabled can
   still submit — this script only upgrades the experience. */
(function () {
  'use strict';

  var BUTTON_TEXT = {
    List: 'Put me on the list',
    Member: 'Pre-commit — $50 first month',
    Founder: 'Become a Founder — $1000'
  };

  function byId(id) { return document.getElementById(id); }

  function updateTier() {
    var tier = byId('hs-tier').value;
    byId('hs-interest-row').style.display = tier === 'List' ? '' : 'none';
    byId('hs-submit').textContent = BUTTON_TEXT[tier] || BUTTON_TEXT.List;
  }

  function setStatus(message, kind) {
    var status = byId('hs-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Submitting…', '');

    var form = byId('homepage-signup-form');
    fetch(form.action, { method: 'POST', mode: 'no-cors', body: new FormData(form) })
      .then(function () {
        setStatus("Thanks — we'll follow up by email.", 'success');
        form.reset();
        updateTier();
      })
      .catch(function () {
        setStatus('Could not submit automatically. Check your connection and try again.', 'error');
      });
  }

  function init() {
    updateTier();
    byId('hs-tier').addEventListener('change', updateTier);
    byId('homepage-signup-form').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
