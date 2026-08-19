/* Application state for the Industrial Atlas: which layers exist, which are
   on, fetching them, and rendering the detail panel. Geographic rendering is
   map.js.

   Layers are fetched lazily, on first activation, rather than all at load.
   The generated data is ~16 MB across eight files and most sessions will
   never open all of them; loading rail and truck routes up front would cost
   every visitor 5 MB to look at employment land.

   Nothing here fabricates. A layer that fails to load says so on its own row
   and stays off — it never silently renders as empty, which would read as
   "there is no industry here". */
(function () {
  'use strict';

  /* The single source of truth for what the atlas shows. The toggle list, the
     map styling and the credits are all generated from this, so they cannot
     drift apart. `colour` is duplicated into CSS via the swatch variable. */
  var LAYERS = [
    {
      id: 'ham-employment',
      region: 'ONT',
      file: 'data/hamilton-employment-land.geojson',
      label: 'Employment lands',
      group: 'LAND & PLANNING',
      source: 'City of Hamilton',
      freshness: 'UPDATED ANNUALLY',
      colour: '#e8a33d',
      weight: 1.6,
      fillOpacity: 0.2,
      on: true,
    },
    {
      id: 'ham-zoning',
      region: 'ONT',
      file: 'data/hamilton-zoning-industrial.geojson',
      label: 'Industrial zoning',
      group: 'LAND & PLANNING',
      source: 'City of Hamilton',
      freshness: 'UPDATED ANNUALLY',
      colour: '#c98a2e',
      weight: 1,
      fillOpacity: 0.16,
      on: false,
    },
    {
      id: 'osm-land',
      region: 'BOTH',
      file: 'data/osm-land.geojson',
      label: 'Industrial land',
      group: 'LAND & PLANNING',
      source: 'OpenStreetMap',
      freshness: 'RECENT',
      colour: '#4fc3d9',
      weight: 1,
      fillOpacity: 0.14,
      on: true,
    },
    {
      id: 'osm-disused',
      region: 'BOTH',
      file: 'data/osm-disused.geojson',
      label: 'Brownfield & recorded disused',
      group: 'LAND & PLANNING',
      source: 'OpenStreetMap',
      freshness: 'RECENT',
      colour: '#b18cf0',
      weight: 1.2,
      fillOpacity: 0.18,
      dash: '3 2',
      on: false,
    },
    {
      id: 'us-parcels',
      file: 'data/us-industrial-parcels.geojson',
      label: 'Industrial parcels',
      group: 'LAND & PLANNING',
      region: 'WNY',
      source: 'NYS GIS + Niagara Co.',
      freshness: 'UPDATED ANNUALLY',
      colour: '#e8a33d',
      weight: 1.4,
      fillOpacity: 0.22,
      on: true,
    },
    {
      id: 'us-brownfield',
      file: 'data/us-brownfield.geojson',
      label: 'Brownfield opportunity areas',
      group: 'LAND & PLANNING',
      region: 'WNY',
      source: 'NYS Dept of State',
      freshness: 'HISTORICAL',
      colour: '#b18cf0',
      weight: 1.4,
      fillOpacity: 0.2,
      on: false,
    },
    {
      id: 'us-facilities',
      file: 'data/us-facilities.geojson',
      label: 'Regulated facilities',
      group: 'PLACES',
      region: 'WNY',
      source: 'NYS DEC',
      freshness: 'UPDATED ANNUALLY',
      colour: '#9ae66e',
      on: false,
    },
    {
      id: 'osm-places',
      region: 'BOTH',
      file: 'data/osm-places.geojson',
      label: 'Industrial places',
      group: 'PLACES',
      source: 'OpenStreetMap',
      freshness: 'RECENT',
      colour: '#7fe0f0',
      on: true,
    },
    {
      id: 'osm-rail',
      region: 'BOTH',
      file: 'data/osm-rail.geojson',
      label: 'Rail network',
      group: 'INFRASTRUCTURE',
      source: 'OpenStreetMap',
      freshness: 'RECENT',
      colour: '#f05e5e',
      weight: 1.5,
      fillOpacity: 0,
      on: false,
    },
    {
      id: 'ham-rail',
      region: 'ONT',
      file: 'data/hamilton-rail.geojson',
      label: 'Rail (Hamilton GIS)',
      group: 'INFRASTRUCTURE',
      source: 'City of Hamilton',
      freshness: 'UPDATED ANNUALLY',
      colour: '#f0956e',
      weight: 1.4,
      fillOpacity: 0,
      on: false,
    },
    {
      id: 'ham-truck',
      region: 'ONT',
      file: 'data/hamilton-truck-routes.geojson',
      label: 'Truck routes',
      group: 'INFRASTRUCTURE',
      source: 'City of Hamilton',
      freshness: 'UPDATED ANNUALLY',
      colour: '#7d86a0',
      weight: 1.2,
      fillOpacity: 0,
      dash: '4 3',
      on: false,
    },
  ];

  /* The two sides of the map. OSM spans the border, so its layers are filed
     as BOTH and appear under either tab -- sharing one Leaflet layer and one
     checkbox state, because they genuinely are one dataset. Splitting them by
     longitude at ingestion would double the files to describe the same
     features. */
  var REGIONS = [
    {
      id: 'ONT', label: 'ONT',
      title: 'Ontario — Hamilton, Burlington, Niagara',
      bounds: [[42.80, -80.30], [43.55, -78.95]],
      /* Each side gets its own coverage note, because what is published --
         and what is therefore missing -- differs completely by country. A
         single generic caveat would understate both. */
      note: 'Hamilton publishes land, zoning and infrastructure but no business '
          + 'inventory. Niagara Region publishes 98,065 business records that '
          + 'are not loaded yet. Parcel data is not public in Ontario: MPAC '
          + 'charges for it. Outside Hamilton, everything here is '
          + 'OpenStreetMap.',
    },
    {
      id: 'WNY', label: 'WNY',
      title: 'Western New York — Erie and Niagara counties',
      bounds: [[42.40, -79.15], [43.40, -78.40]],
      note: 'New York publishes parcels free, so industrial sites here carry '
          + 'property class, floor area and assessment — detail the Ontario '
          + 'side cannot have. Parcels are Erie County only: Niagara County NY '
          + 'is not in the state dataset. Owner names are removed at '
          + 'ingestion.',
    },
  ];

  var activeRegion = 'ONT';

  var FRESH_CLASS = {
    'RECENT': 'fresh--recent',
    'UPDATED ANNUALLY': 'fresh--annual',
    'STATIC': 'fresh--static',
  };

  var loaded = {};    /* id -> { layer, meta } */
  var pending = 0;

  function byId(id) { return document.getElementById(id); }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function setBusy(delta) {
    pending += delta;
    byId('loading').hidden = pending <= 0;
  }

  /* --- detail panel ------------------------------------------------------- */

  function kvTable(obj, limit) {
    var table = el('table', 'kv');
    var count = 0;
    Object.keys(obj).forEach(function (key) {
      var value = obj[key];
      if (value === null || value === '' || value === undefined) return;
      if (limit && count >= limit) return;
      count++;
      var row = document.createElement('tr');
      row.appendChild(el('th', '', key));
      row.appendChild(el('td', '', String(value)));
      table.appendChild(row);
    });
    return count ? table : null;
  }

  function showDetail(feature, meta) {
    var panel = byId('detail');
    var props = feature.properties || {};
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    panel.appendChild(el('h2', 'detail__title', props.name || 'Unnamed feature'));
    panel.appendChild(el('p', 'detail__kind',
      (props.layer || '') + (meta.dataset ? ' · ' + meta.dataset : '')));

    if (props.categories && props.categories.length) {
      panel.appendChild(el('h3', '', 'Classification'));
      var tags = el('div', 'tags');
      props.categories.forEach(function (c) { tags.appendChild(el('span', 'tag', c)); });
      panel.appendChild(tags);
    }

    /* Provenance is shown for every feature, always. It is the difference
       between an atlas and a picture (brief section 6). */
    var source = props.source || {};
    panel.appendChild(el('h3', '', 'Source'));
    var prov = el('div', 'provenance');
    prov.appendChild(el('p', '', source.name || meta.source || 'unknown'));
    if (source.dataset) prov.appendChild(el('p', '', source.dataset));
    if (source.source_modified) {
      prov.appendChild(el('p', '', 'Source updated ' + source.source_modified.slice(0, 10)));
    }
    if (source.retrieved_at) {
      prov.appendChild(el('p', '', 'Retrieved ' + source.retrieved_at));
    }
    if (props.freshness) {
      var badge = el('span', 'fresh ' + (FRESH_CLASS[props.freshness] || ''), props.freshness);
      var wrap = el('p', '');
      wrap.appendChild(badge);
      prov.appendChild(wrap);
    }
    if (source.license) prov.appendChild(el('p', '', source.license));
    if (source.url) {
      var link = el('a', '', 'View at source');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      var p = el('p', '');
      p.appendChild(link);
      prov.appendChild(p);
    }
    panel.appendChild(prov);

    /* Original attributes, verbatim. The normalization above is an
       interpretation; a user checking our work needs what the source said. */
    var raw = props.osm_tags || props.attributes;
    if (raw) {
      panel.appendChild(el('h3', '', 'Source attributes'));
      var table = kvTable(raw, 40);
      if (table) panel.appendChild(table);
    }
  }

  /* --- layers ------------------------------------------------------------- */

  function activate(spec, row) {
    if (loaded[spec.id]) {
      window.AtlasMap.add(loaded[spec.id].layer);
      return;
    }

    row.classList.add('is-loading');
    row.classList.remove('is-failed');
    setBusy(1);

    fetch(spec.file)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (collection) {
        var layer = window.AtlasMap.buildLayer(spec, collection, showDetail);
        loaded[spec.id] = { layer: layer, meta: collection.atlas || {} };
        row.classList.remove('is-loading');

        var count = (collection.atlas || {}).feature_count;
        if (count !== undefined) {
          var meta = row.querySelector('.layer__count');
          if (meta) meta.textContent = count.toLocaleString() + ' features';
        }

        /* Only draw if the box is still ticked — a slow layer that the user
           switched off mid-fetch must not reappear. */
        if (row.querySelector('input').checked) window.AtlasMap.add(layer);
      })
      .catch(function () {
        row.classList.remove('is-loading');
        row.classList.add('is-failed');
        row.querySelector('input').checked = false;
      })
      .then(function () { setBusy(-1); });
  }

  function inRegion(spec) {
    return spec.region === 'BOTH' || spec.region === activeRegion;
  }

  /* Rows are built once and shown or hidden by region rather than rebuilt on
     every tab switch -- rebuilding would drop the checkbox state and the
     feature counts already fetched. */
  function applyRegion(move) {
    var container = byId('layers');
    var rows = container.querySelectorAll('[data-region]');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i].getAttribute('data-region');
      rows[i].hidden = !(r === 'BOTH' || r === activeRegion || r === 'ALL');
    }
    var tabs = document.querySelectorAll('.regions__tab');
    for (var j = 0; j < tabs.length; j++) {
      var on = tabs[j].getAttribute('data-region') === activeRegion;
      tabs[j].classList.toggle('is-current', on);
      tabs[j].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    /* Group headings with nothing visible under them would read as empty
       sections. */
    var heads = container.querySelectorAll('.layers__group');
    for (var k = 0; k < heads.length; k++) {
      var node = heads[k].nextElementSibling;
      var any = false;
      while (node && !node.classList.contains('layers__group')) {
        if (!node.hidden) { any = true; break; }
        node = node.nextElementSibling;
      }
      heads[k].hidden = !any;
    }
    var note = byId('region-note');
    if (note) {
      var current = REGIONS.filter(function (x) { return x.id === activeRegion; })[0];
      note.textContent = current ? current.note : '';
    }
    if (move) {
      var region = REGIONS.filter(function (x) { return x.id === activeRegion; })[0];
      if (region && window.AtlasMap.instance) {
        window.AtlasMap.instance.fitBounds(region.bounds, { padding: [20, 20] });
      }
    }
  }

  function buildTabs() {
    var strip = el('div', 'regions');
    strip.setAttribute('role', 'tablist');
    REGIONS.forEach(function (region) {
      var tab = el('button', 'regions__tab', region.label);
      tab.type = 'button';
      tab.title = region.title;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('data-region', region.id);
      tab.addEventListener('click', function () {
        activeRegion = region.id;
        applyRegion(true);
      });
      strip.appendChild(tab);
    });
    byId('layers').parentNode.insertBefore(strip, byId('layers'));
  }

  function buildSwitches() {
    var container = byId('layers');
    var groups = [];
    LAYERS.forEach(function (spec) {
      if (groups.indexOf(spec.group) === -1) groups.push(spec.group);
    });

    groups.forEach(function (group) {
      container.appendChild(el('div', 'layers__group', group));

      LAYERS.filter(function (s) { return s.group === group; }).forEach(function (spec) {
        var row = el('label', 'layer');
        row.style.setProperty('--swatch', spec.colour);
        row.setAttribute('data-region', spec.region || 'BOTH');

        var box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!spec.on;
        row.appendChild(box);

        var body = el('div', '');
        body.appendChild(el('span', 'layer__name', spec.label));

        var meta = el('span', 'layer__meta');
        meta.appendChild(el('span', 'layer__count', spec.source));
        meta.appendChild(document.createTextNode(' · '));
        meta.appendChild(el('span', 'fresh ' + (FRESH_CLASS[spec.freshness] || ''),
                            spec.freshness));
        if (spec.region === 'BOTH') {
          meta.appendChild(document.createTextNode(' · '));
          meta.appendChild(el('span', 'layer__both', 'both sides'));
        }
        body.appendChild(meta);
        row.appendChild(body);

        box.addEventListener('change', function () {
          if (box.checked) {
            activate(spec, row);
          } else if (loaded[spec.id]) {
            window.AtlasMap.remove(loaded[spec.id].layer);
          }
        });

        container.appendChild(row);
        if (spec.on) activate(spec, row);
      });
    });
  }

  /* Attribution for every source that can appear, listed whether or not its
     layer happens to be switched on. Both licences require it, and ODbL
     additionally carries share-alike on anything derived from OSM. */
  function buildCredits() {
    var credits = byId('credits');
    credits.appendChild(el('p', '',
      'Industrial data: OpenStreetMap contributors (ODbL 1.0); '
      + 'City of Hamilton Open Data Licence.'));
    credits.appendChild(el('p', '',
      'Coverage: Hamilton, Burlington and the Niagara Peninsula. '
      + 'Sources and retrieval dates are shown per feature.'));
  }

  function init() {
    if (typeof L === 'undefined') {
      byId('loading').hidden = false;
      byId('loading').textContent = 'Map library failed to load';
      return;
    }
    window.AtlasMap.init('map');
    window.AtlasMap.instance.on('click', function () {
      var panel = byId('detail');
      while (panel.firstChild) panel.removeChild(panel.firstChild);
      panel.appendChild(el('p', 'detail__empty',
        'Select anything on the map to see what it is and where the '
        + 'information came from.'));
    });
    buildTabs();
    buildSwitches();
    applyRegion(false);
    buildCredits();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
