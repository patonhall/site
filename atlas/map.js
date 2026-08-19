/* Leaflet concerns for the Industrial Atlas: the map object, basemap, layer
   construction and styling. Knows nothing about which layers exist or what
   the panels say — app.js owns that. Exposed as window.AtlasMap.

   Kept separate from app.js on the same reasoning the reference project
   splits them: the geographic rendering and the application state change for
   different reasons and at different rates. */
(function () {
  'use strict';

  var VIEW = { center: [43.15, -79.55], zoom: 10 };

  /* Wide enough to hold the whole study area plus context, so a user cannot
     pan off into empty ocean and lose the region entirely. */
  var MAX_BOUNDS = L.latLngBounds([42.4, -81.2], [44.0, -78.2]);

  var map = null;

  function init(elementId) {
    map = L.map(elementId, {
      center: VIEW.center,
      zoom: VIEW.zoom,
      minZoom: 8,
      maxBounds: MAX_BOUNDS,
      maxBoundsViscosity: 0.7,
      zoomControl: true,
      attributionControl: true,
    });

    /* CARTO dark. A muted basemap is a working decision, not a style one:
       the atlas needs land, rail and buildings to each hold a distinct value,
       and a standard colour basemap spends all its contrast on roads and
       retail labels that are not what this map is about. */
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> '
                 + 'contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    return map;
  }

  /* Per-layer Leaflet options. Weight and opacity carry the hierarchy the
     brief asks for: land sits underneath as fill, rail reads brightest,
     points sit on top. */
  function styleFor(spec) {
    return function () {
      return {
        color: spec.colour,
        weight: spec.weight || 1,
        opacity: spec.opacity || 0.9,
        fillColor: spec.colour,
        fillOpacity: spec.fillOpacity === undefined ? 0.14 : spec.fillOpacity,
        dashArray: spec.dash || null,
      };
    };
  }

  function pointFor(spec) {
    return function (feature, latlng) {
      return L.circleMarker(latlng, {
        radius: 4,
        color: spec.colour,
        weight: 1.4,
        opacity: 0.95,
        fillColor: spec.colour,
        fillOpacity: 0.45,
      });
    };
  }

  /* Builds a Leaflet layer from a parsed GeoJSON collection. onSelect is
     called with (feature, collectionMeta) — map.js does not decide what a
     selection means, it only reports one. */
  function buildLayer(spec, collection, onSelect) {
    var meta = collection.atlas || {};

    return L.geoJSON(collection, {
      style: styleFor(spec),
      pointToLayer: pointFor(spec),
      onEachFeature: function (feature, layer) {
        layer.on('click', function (event) {
          L.DomEvent.stopPropagation(event);
          onSelect(feature, meta);
        });
        var name = feature.properties && feature.properties.name;
        if (name) layer.bindTooltip(name, { direction: 'top', opacity: 0.9 });
      },
    });
  }

  function add(layer) { if (map && layer) layer.addTo(map); }
  function remove(layer) { if (map && layer && map.hasLayer(layer)) map.removeLayer(layer); }

  function focus(layer) {
    if (!map || !layer) return;
    try {
      var bounds = layer.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
    } catch (err) {
      /* A layer with only points and no extent is not an error worth
         interrupting the user for. */
    }
  }

  window.AtlasMap = {
    init: init,
    buildLayer: buildLayer,
    add: add,
    remove: remove,
    focus: focus,
    get instance() { return map; },
  };
})();
