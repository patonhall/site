/* Adds .garage--spin (the CSS keyframe animation in site.css) on a
   visitor's first page load only, then remembers it in localStorage so
   later navigations — this is a multi-page site, not an SPA, so every
   link click is a fresh document load — don't replay it. */
(function () {
  'use strict';

  var STORAGE_KEY = 'patonhall:garage-spin-seen';

  function alreadySpun() {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch (err) {
      // Storage blocked (private browsing, disabled cookies, etc.) — treat
      // as already seen so the spin just never fires, rather than firing
      // on every load because we can't remember it fired before.
      return true;
    }
  }

  function markSpun() {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch (err) {
      // Nothing to do if storage isn't available.
    }
  }

  function init() {
    if (alreadySpun()) return;
    var garage = document.querySelector('.garage');
    if (!garage) return;
    garage.classList.add('garage--spin');
    markSpun();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
