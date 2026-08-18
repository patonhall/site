/* Toggles the hamburger menu button — visible at mobile widths on
   .page-navmenu pages (the Calendar and individual posts; see
   .page-navmenu .nav-toggle in site.css). The button and this listener
   exist sitewide but stay inert elsewhere, since the button itself is
   hidden there. */
(function () {
  'use strict';

  function init() {
    var toggle = document.getElementById('nav-toggle');
    var rail = document.querySelector('.rail');
    if (!toggle || !rail) return;

    toggle.addEventListener('click', function () {
      var isOpen = rail.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
