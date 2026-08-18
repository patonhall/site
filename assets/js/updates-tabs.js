/* Turns the Updates page's two column headings into a tab switcher below the
   mobile breakpoint.

   Desktop shows both streams side by side and needs nothing from this file.
   Stacked on a phone, the second stream sits under however many posts the
   first one happens to have, which is a good way to never see it -- so here
   the two headings become tabs and exactly one column shows at a time.

   The tab strip is built in script rather than shipped in the HTML because it
   is meaningless without JS: with scripting off both columns simply stack and
   remain fully readable, which is the correct fallback. Nothing is hidden
   until this file has run and added .updates--tabbed. */
(function () {
  'use strict';

  var BREAKPOINT = '(max-width: 959px)';

  function init() {
    var wrap = document.getElementById('updates');
    if (!wrap) return;

    var columns = [].slice.call(wrap.querySelectorAll('.updates__col'));
    if (columns.length < 2) return;

    var strip = document.createElement('div');
    strip.className = 'updates__tabs';
    strip.setAttribute('role', 'tablist');

    var buttons = columns.map(function (column, index) {
      var heading = column.querySelector('.updates__head');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'updates__tab';
      button.setAttribute('role', 'tab');
      /* The heading's own text, minus the " — LINK" affordance, which is a
         destination rather than part of the stream's name. */
      button.textContent = (heading ? heading.textContent : 'Posts')
        .replace(/\s*—\s*LINK\s*$/, '').trim();
      button.addEventListener('click', function () { select(index); });
      strip.appendChild(button);
      return button;
    });

    function select(active) {
      columns.forEach(function (column, index) {
        column.classList.toggle('is-active', index === active);
      });
      buttons.forEach(function (button, index) {
        var on = index === active;
        button.classList.toggle('is-current', on);
        button.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    wrap.insertBefore(strip, wrap.firstChild);

    /* .updates--tabbed is what the stylesheet keys the hiding off, so the
       columns only ever collapse to one once a tab exists to reach the
       other. Re-evaluated on breakpoint change so a rotated phone or a
       resized window lands in a consistent state rather than showing one
       column with no way back. */
    var query = window.matchMedia(BREAKPOINT);

    function apply() {
      if (query.matches) {
        wrap.classList.add('updates--tabbed');
        select(0);
      } else {
        wrap.classList.remove('updates--tabbed');
        columns.forEach(function (column) { column.classList.remove('is-active'); });
      }
    }

    apply();
    if (query.addEventListener) {
      query.addEventListener('change', apply);
    } else if (query.addListener) {
      query.addListener(apply);   /* Safari < 14 */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
