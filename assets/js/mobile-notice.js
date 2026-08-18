/* Lets a visitor permanently dismiss the mobile "View site on desktop"
   notice (see src/_shell.html and the .mobile-notice rules in site.css).
   Dismissal is remembered in localStorage — same mechanism as
   assets/js/garage-spin.js — so it stays hidden across every page, not
   just the one it was dismissed on. */
(function () {
  'use strict';

  var STORAGE_KEY = 'patonhall:mobile-notice-dismissed';

  function isDismissed() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      // Storage blocked — nothing we can remember, so leave the notice
      // showing rather than guessing.
      return false;
    }
  }

  function markDismissed() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (err) {
      // Nothing to do if storage isn't available — the notice will just
      // reappear next load, same as if it were never dismissible.
    }
  }

  function init() {
    var notice = document.getElementById('mobile-notice');
    if (!notice) return;

    if (isDismissed()) {
      notice.style.display = 'none';
      return;
    }

    var closeBtn = document.getElementById('mobile-notice-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        notice.style.display = 'none';
        markDismissed();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
