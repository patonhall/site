/* Handles the Membership page's simple name/email interest form: submits
   to the membership-interest Google Form in the background. Every field
   has a native `name`, so a visitor with JS disabled can still submit —
   this script only upgrades the experience.

   Also wires the per-tier "LINK"s next to Bench/Shop/Keyholder/Founder/
   Patron/Champion: clicking one sets a hidden Tier field before the native
   #membership-interest anchor jump scrolls the visitor down, and updates
   the subhead so the selection is visible rather than an invisible
   hidden-field write (the homepage signup form had exactly that bug with
   its hidden Interest select before it was fixed). */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function onTierLinkClick(event) {
    var tier = event.currentTarget.getAttribute('data-tier');
    var tierField = byId('mi-tier');
    var subhead = byId('mi-subhead');
    if (tierField) tierField.value = tier;
    if (subhead) {
      subhead.textContent = "Leave your name and email — we'll follow up about " + tier + '.';
    }
  }

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

    var tierLinks = document.querySelectorAll('.tier-link');
    for (var i = 0; i < tierLinks.length; i++) {
      tierLinks[i].addEventListener('click', onTierLinkClick);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
