/* Toggles the hamburger menu button — currently only visible on the
   Calendar page at mobile widths (see .page-calendar .nav-toggle in
   site.css); the button and this listener exist sitewide but stay inert
   everywhere else since the button itself is hidden there. */
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
