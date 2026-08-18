/* Turns the Services page into a master-detail view: names on the left,
   one description at a time in the right column.

   The page ships every panel visible and every name as a plain anchor to
   it, so with scripting off it reads as an ordinary document and the links
   still jump to the right place. This file collapses that into one-at-a-time
   only once it has run -- which is why the panels are hidden here rather
   than in the HTML. Nothing becomes unreachable if the script never loads.

   Deep links work: /services.html#svc-tool-room opens on that panel. */
(function () {
  'use strict';

  function init() {
    var detail = document.getElementById('svc-detail');
    if (!detail) return;

    var panels = [].slice.call(detail.querySelectorAll('.svc__panel'));
    var names = [].slice.call(document.querySelectorAll('.svc__name'));
    var hint = document.getElementById('svc-hint');
    if (!panels.length || !names.length) return;

    function show(id) {
      var found = false;
      panels.forEach(function (panel) {
        var on = panel.id === id;
        panel.hidden = !on;
        if (on) found = true;
      });
      names.forEach(function (name) {
        name.classList.toggle('is-current',
          name.getAttribute('href') === '#' + id);
      });
      /* The hint is only ever true before a first choice is made. Once one
         has been, it must not come back -- an empty right column with
         "click a service" beside a highlighted service would read as
         broken. */
      if (hint) hint.hidden = found;
      return found;
    }

    function reset() {
      panels.forEach(function (panel) { panel.hidden = true; });
      names.forEach(function (name) { name.classList.remove('is-current'); });
      if (hint) hint.hidden = false;
    }

    names.forEach(function (name) {
      name.addEventListener('click', function (event) {
        /* preventDefault keeps the page from scroll-jumping to a panel that
           is already in view; the hash is still written so the choice can be
           copied, shared and reloaded. */
        event.preventDefault();
        var id = name.getAttribute('href').slice(1);
        if (show(id) && window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + id);
        }
      });
    });

    /* Honour a hash we were loaded with; otherwise start on the hint. */
    var initial = window.location.hash.slice(1);
    if (!initial || !show(initial)) reset();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
