/* Renders the Ships page's vessel list from assets/data/vessels.json.

   Same contract as courses.js: never show stale or fabricated data. A fetch
   failure or disabled JS leaves a plain "unavailable" message rather than an
   empty table that reads as "no ships today".

   The one addition over courses.js is the sample banner. During the beta the
   data file holds a hand-taken snapshot, not a live feed, and a shipping
   board that silently shows hours-old positions as current is worse than one
   that shows nothing. So `sample: true` in the JSON forces a visible notice,
   and the "updated" stamp is always rendered — a reader can tell how old the
   board is without trusting us to have refreshed it. */
(function () {
  'use strict';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  /* "2026-08-18 19:10" (UTC) -> "19:10" when it is today in UTC, else
     "Aug 18, 19:10". AIS stamps are UTC and are shown as UTC, labelled as
     such in the table head -- converting to the visitor's zone would be
     friendlier but silently wrong for anyone comparing against a marine
     radio or another AIS board, which are universally UTC. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatStamp(value, todayIso) {
    if (!value) return '—';
    var parts = value.split(' ');
    if (parts.length !== 2) return value;
    if (parts[0] === todayIso) return parts[1];
    var d = parts[0].split('-');
    if (d.length !== 3) return value;
    return MONTHS[Number(d[1]) - 1] + ' ' + Number(d[2]) + ', ' + parts[1];
  }

  function todayIso() {
    var now = new Date();
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function message(tbody, text) {
    clear(tbody);
    var row = document.createElement('tr');
    var cell = el('td', '', text);
    cell.colSpan = 6;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function render(doc) {
    var tbody = document.getElementById('ships-tbody');
    var vessels = doc.vessels || [];

    if (!vessels.length) {
      message(tbody, 'No vessels heard in range during the last collection window.');
      return;
    }

    var today = todayIso();
    clear(tbody);
    vessels.forEach(function (v) {
      var tr = document.createElement('tr');
      /* An unnamed vessel is normal: a position report carries no name, so a
         vessel first heard mid-window shows its MMSI until its static frame
         arrives. Better than hiding it. */
      tr.appendChild(el('td', 'ships__name', v.name || String(v.mmsi)));
      tr.appendChild(el('td', '', v.type || '—'));
      tr.appendChild(el('td', '', v.status || '—'));
      tr.appendChild(el('td', '', v.sog === null || v.sog === undefined
        ? '—' : v.sog.toFixed(1) + ' kn'));
      tr.appendChild(el('td', '', typeof v.km === 'number' ? v.km + ' km' : '—'));
      tr.appendChild(el('td', '', formatStamp(v.seen, today)));
      tbody.appendChild(tr);
    });
  }

  function renderMeta(doc) {
    var meta = document.getElementById('ships-meta');
    if (!meta) return;

    clear(meta);
    if (doc.sample) {
      meta.appendChild(el('strong', '', 'Sample data — not live. '));
    }
    meta.appendChild(document.createTextNode(
      'Last collected ' + (doc.updated || 'at an unknown time') + ' UTC'
      + (doc.windowSeconds ? ' over ' + doc.windowSeconds + 's of listening' : '')
      + '. Source: '));

    var link = el('a', '', doc.sourceName || 'source');
    link.href = doc.sourceUrl || '#';
    link.rel = 'noopener';
    link.target = '_blank';
    meta.appendChild(link);
    meta.appendChild(document.createTextNode('.'));
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /* Equirectangular, with the usual cos(lat) correction on x so the harbour
     is not stretched east-west. Good to a few metres over a 15km box, which
     is far beyond what a schematic at this size can express anyway. */
  function plot(vessels) {
    var svg = document.getElementById('ships-map');
    var marks = document.getElementById('ships-map-marks');
    if (!svg || !marks) return;

    var latMin = parseFloat(svg.getAttribute('data-lat-min'));
    var latMax = parseFloat(svg.getAttribute('data-lat-max'));
    var lonMin = parseFloat(svg.getAttribute('data-lon-min'));
    var lonMax = parseFloat(svg.getAttribute('data-lon-max'));
    var box = svg.getAttribute('viewBox').split(/\s+/);
    var width = parseFloat(box[2]);
    var height = parseFloat(box[3]);

    clear(marks);
    vessels.forEach(function (v) {
      if (typeof v.lat !== 'number' || typeof v.lon !== 'number') return;
      if (v.lat < latMin || v.lat > latMax || v.lon < lonMin || v.lon > lonMax) return;

      var x = (v.lon - lonMin) / (lonMax - lonMin) * width;
      var y = (latMax - v.lat) / (latMax - latMin) * height;

      var dot = document.createElementNS(SVG_NS, 'circle');
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      dot.setAttribute('r', '4.5');
      /* Moving vessels read as filled, stationary ones as hollow -- the one
         distinction worth making at this size. */
      dot.setAttribute('class', 'ships__dot'
        + (v.sog && v.sog > 0.5 ? ' ships__dot--moving' : ''));

      var label = document.createElementNS(SVG_NS, 'title');
      label.textContent = (v.name || String(v.mmsi))
        + (v.sog ? ' — ' + v.sog.toFixed(1) + ' kn' : '');
      dot.appendChild(label);
      marks.appendChild(dot);
    });
  }

  function init() {
    var tbody = document.getElementById('ships-tbody');
    if (!tbody) return;

    fetch('assets/data/vessels.json')
      .then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then(function (doc) {
        render(doc);
        renderMeta(doc);
        plot(doc.vessels || []);
      })
      .catch(function () {
        message(tbody, 'Vessel list unavailable.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
