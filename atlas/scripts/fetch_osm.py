#!/usr/bin/env python3
"""Pull industrial features for Hamilton-Niagara from OpenStreetMap.

Writes normalized GeoJSON into atlas/data/. Standard library only, matching
the ingestion scripts in the parent site.

Why OSM first: it is the only source in sources.json that covers the whole
study area under one schema. Hamilton's open data stops at the city line and
Niagara's NEI stops at the regional one, so anything that crosses a boundary
-- a rail corridor, the Welland Canal, the harbour -- only exists end to end
here. See ../DATA-SOURCES.md.

Licence: ODbL 1.0. Attribution is required and share-alike applies to derived
data, so every feature carries its source block rather than the obligation
living in a footnote somewhere.

Overpass is a shared free service. This script:
  - runs ONE query per layer, not one per feature
  - caches raw responses in .cache/ and reuses them unless --refresh is given
  - sets a descriptive User-Agent so the operators can identify the traffic
  - backs off and retries on 429/504 rather than hammering

Usage:
    python3 fetch_osm.py [--refresh] [--layer places|land|rail|disused]
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

ENDPOINT = 'https://overpass-api.de/api/interpreter'
USER_AGENT = 'HamiltonNiagaraIndustrialAtlas/0.1 (+https://github.com/patonhall/site)'

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', 'data')
CACHE_DIR = os.path.join(HERE, '.cache')

# Hamilton-Niagara-Buffalo study area, both sides of the border.
#
# The eastern edge was -78.90 in the first pass, which cut through Buffalo at
# -78.88 -- the American side was blank in the one source that already covers
# it. Now extended east to -78.40 (past Erie and Niagara counties NY) and
# south to 42.40 (southern Erie County), while keeping Burlington and the
# Hamilton harbour at the north-west.
#
# Wider than the municipalities themselves on purpose: the industrial system
# does not stop at a boundary, and neither should the data (brief section 3).
BBOX = (42.40, -80.30, 43.55, -78.40)   # south, west, north, east

SOURCE = {
    'name': 'OpenStreetMap via Overpass',
    'url': 'https://www.openstreetmap.org/',
    'license': 'ODbL 1.0',
    'license_url': 'https://opendatacommons.org/licenses/odbl/1-0/',
    'attribution': '© OpenStreetMap contributors',
}

# OSM tag -> atlas classification (brief section 9). Deliberately coarse and
# explicit: a lookup that can be read and corrected beats clever inference.
PLACE_KINDS = {
    'factory': 'MANUFACTURING',
    'industrial': 'MANUFACTURING',
    'works': 'MANUFACTURING',
    'warehouse': 'WAREHOUSING',
    'foundry': 'METAL',
    'metal_construction': 'METAL',
    'steelwork': 'STEEL',
    'machine_shop': 'MACHINING',
    'engineering': 'ENGINEERING',
    'electronics': 'ELECTRONICS',
    'brewery': 'FOOD',
    'bakery': 'FOOD',
    'food': 'FOOD',
    'chemical': 'CHEMICAL',
    'plastics': 'PLASTICS',
    'sawmill': 'WOOD',
    'carpenter': 'WOOD',
    'joiner': 'WOOD',
    'boatbuilder': 'MARITIME',
    'shipyard': 'MARITIME',
    'scrap_yard': 'RECYCLING',
    'recycling': 'RECYCLING',
    'depot': 'LOGISTICS',
    'distributor': 'LOGISTICS',
    'port': 'MARITIME',
    'quarry': 'CONSTRUCTION',
    'builder': 'CONSTRUCTION',
    'blacksmith': 'FABRICATION',
    'welder': 'FABRICATION',
    'metalworker': 'FABRICATION',
    'hackerspace': 'MAKER',
    'workshop': 'MAKER',
}


def build_query(layer):
    """Overpass QL per layer. `out center` on areal features gives one point
    per feature for the places layer; the land and rail layers need real
    geometry, so they ask for it explicitly."""
    s, w, n, e = BBOX
    box = '%s,%s,%s,%s' % (s, w, n, e)

    if layer == 'places':
        # Discrete industrial premises: a building, a works, a craft address.
        return f'''[out:json][timeout:180];
(
  nwr["building"~"^(industrial|warehouse|factory)$"]({box});
  nwr["man_made"="works"]({box});
  nwr["industrial"]({box});
  nwr["craft"]({box});
  nwr["shop"="trade"]({box});
);
out center tags;'''

    if layer == 'land':
        # Designated industrial ground, as polygons.
        return f'''[out:json][timeout:180];
(
  way["landuse"~"^(industrial|port|depot|quarry)$"]({box});
  relation["landuse"~"^(industrial|port|depot|quarry)$"]({box});
);
out geom tags;'''

    if layer == 'disused':
        # Industrial fabric recorded as no longer in use. OSM's lifecycle
        # prefixes (`disused:`, `abandoned:`) are the community convention for
        # this and are the one widely-available signal for industrial underuse
        # -- the rating-list and brownfield-register recipes used elsewhere are
        # UK-specific and have no Ontario equivalent (see DATA-SOURCES.md on
        # MPAC).
        #
        # This layer states only what OSM records, dated. It is an OBSERVATION
        # OF A MAP, not a finding about a property or its owner, and nothing
        # downstream may promote it into a judgement like "underutilized"
        # without the safeguards noted in DATA-SOURCES.md.
        return f'''[out:json][timeout:180];
(
  nwr["abandoned:building"]({box});
  nwr["disused:building"]({box});
  nwr["building"~"^(abandoned|ruins|disused)$"]({box});
  nwr["abandoned:man_made"="works"]({box});
  nwr["disused:man_made"="works"]({box});
  nwr["abandoned:industrial"]({box});
  nwr["disused:industrial"]({box});
  nwr["abandoned:landuse"]({box});
  nwr["disused:landuse"]({box});
  way["landuse"="brownfield"]({box});
  relation["landuse"="brownfield"]({box});
);
out geom tags;'''

    if layer == 'rail':
        # Corridors and yards. Excludes tram/subway/disused, which are not
        # freight infrastructure and would clutter the corridor picture.
        return f'''[out:json][timeout:180];
(
  way["railway"~"^(rail|yard|siding|spur|industrial)$"]({box});
);
out geom tags;'''

    raise SystemExit('fetch_osm: unknown layer %r' % layer)


def overpass(query, cache_path, refresh=False):
    """One request, cached. Retries with backoff on the codes Overpass uses
    to say "busy" rather than "wrong"."""
    if os.path.exists(cache_path) and not refresh:
        print('  cache hit: %s' % os.path.relpath(cache_path, HERE))
        with open(cache_path, 'r', encoding='utf-8') as handle:
            return json.load(handle)

    request = urllib.request.Request(
        ENDPOINT,
        data=urllib.parse.urlencode({'data': query}).encode('utf-8'),
        headers={'User-Agent': USER_AGENT},
    )

    delay = 5
    for attempt in range(1, 5):
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                payload = json.loads(response.read().decode('utf-8'))
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            with open(cache_path, 'w', encoding='utf-8') as handle:
                json.dump(payload, handle)
            return payload
        except urllib.error.HTTPError as err:
            if err.code in (429, 504) and attempt < 4:
                print('  overpass busy (HTTP %d), waiting %ds' % (err.code, delay))
                time.sleep(delay)
                delay *= 2
                continue
            raise SystemExit('fetch_osm: Overpass returned HTTP %d: %s'
                             % (err.code, err.read()[:300].decode('utf-8', 'replace')))
        except urllib.error.URLError as err:
            raise SystemExit('fetch_osm: could not reach Overpass (%s)' % err.reason)

    raise SystemExit('fetch_osm: Overpass stayed busy after 4 attempts')


def classify(tags):
    """Atlas categories for a feature. Multiple are allowed (brief section 9);
    an unclassifiable industrial feature keeps INDUSTRIAL rather than being
    dropped or guessed at."""
    found = []
    for key in ('craft', 'industrial', 'man_made', 'building', 'landuse', 'shop'):
        value = tags.get(key)
        if value and value in PLACE_KINDS:
            kind = PLACE_KINDS[value]
            if kind not in found:
                found.append(kind)

    # Lifecycle prefixes mark the feature as recorded-disused. Kept as its own
    # category rather than folded into the others so it can never be silently
    # counted as active industry.
    lifecycle = any(k.startswith('disused:') or k.startswith('abandoned:') for k in tags)
    if lifecycle or tags.get('building') in ('abandoned', 'ruins', 'disused'):
        if 'DISUSED (RECORDED)' not in found:
            found.insert(0, 'DISUSED (RECORDED)')
    if tags.get('landuse') == 'brownfield' and 'BROWNFIELD' not in found:
        found.insert(0, 'BROWNFIELD')

    name = (tags.get('name') or '').lower()
    for word, kind in (('steel', 'STEEL'), ('machine', 'MACHINING'),
                       ('fabricat', 'FABRICATION'), ('weld', 'FABRICATION'),
                       ('logistic', 'LOGISTICS'), ('recycl', 'RECYCLING')):
        if word in name and kind not in found:
            found.append(kind)

    return found or ['INDUSTRIAL']


def geometry_for(element):
    """OSM element -> GeoJSON geometry. `out center` gives ways a center; `out
    geom` gives them a node list. Neither is guaranteed, so a feature without
    usable geometry is skipped rather than placed at a made-up coordinate
    (data quality rule 16)."""
    if element['type'] == 'node':
        return {'type': 'Point', 'coordinates': [element['lon'], element['lat']]}

    geom = element.get('geometry')
    if geom:
        coords = [[p['lon'], p['lat']] for p in geom]
        if len(coords) < 2:
            return None
        closed = coords[0] == coords[-1] and len(coords) >= 4
        if closed:
            return {'type': 'Polygon', 'coordinates': [coords]}
        return {'type': 'LineString', 'coordinates': coords}

    center = element.get('center')
    if center:
        return {'type': 'Point', 'coordinates': [center['lon'], center['lat']]}

    return None


def to_feature(element, layer, retrieved):
    geometry = geometry_for(element)
    if geometry is None:
        return None

    tags = element.get('tags') or {}
    osm_id = '%s/%s' % (element['type'], element['id'])

    properties = {
        'id': 'osm-%s-%s' % (element['type'], element['id']),
        'name': tags.get('name') or tags.get('operator') or '',
        'layer': layer,
        'categories': classify(tags),
        'freshness': 'RECENT',
        'source': dict(SOURCE, source_id=osm_id, retrieved_at=retrieved,
                       url='https://www.openstreetmap.org/%s' % osm_id),
        # Originals kept verbatim (brief section 6): the classification above
        # is an interpretation, and an interpretation must never be the only
        # surviving record of what the source actually said.
        'osm_tags': tags,
    }

    if layer == 'rail':
        properties['operator'] = tags.get('operator', '')
        properties['railway'] = tags.get('railway', '')
        properties['usage'] = tags.get('usage', '')

    return {'type': 'Feature', 'geometry': geometry, 'properties': properties}


def write_geojson(path, features, layer, retrieved):
    collection = {
        'type': 'FeatureCollection',
        'atlas': {
            'layer': layer,
            'source': SOURCE['name'],
            'license': SOURCE['license'],
            'attribution': SOURCE['attribution'],
            'freshness': 'RECENT',
            'retrieved_at': retrieved,
            'bbox': list(BBOX),
            'feature_count': len(features),
        },
        'features': features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(collection, handle, ensure_ascii=False)
        handle.write('\n')


def run(layer, refresh):
    retrieved = date.today().isoformat()
    print('fetch_osm: %s' % layer)

    payload = overpass(build_query(layer),
                       os.path.join(CACHE_DIR, 'osm-%s.json' % layer),
                       refresh=refresh)

    elements = payload.get('elements', [])
    features = []
    skipped = 0
    for element in elements:
        feature = to_feature(element, layer, retrieved)
        if feature is None:
            skipped += 1
            continue
        features.append(feature)

    out_path = os.path.join(DATA_DIR, 'osm-%s.geojson' % layer)
    write_geojson(out_path, features, layer, retrieved)

    size = os.path.getsize(out_path) / 1024.0
    print('  %d elements -> %d features (%d skipped, no geometry), %.0f KB'
          % (len(elements), len(features), skipped, size))
    return len(features)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true',
                        help='ignore the local cache and re-query Overpass')
    parser.add_argument('--layer', choices=('places', 'land', 'rail', 'disused'),
                        help='fetch only this layer (default: all four)')
    args = parser.parse_args()

    layers = [args.layer] if args.layer else ['places', 'land', 'rail', 'disused']
    total = 0
    for index, layer in enumerate(layers):
        if index:
            time.sleep(3)      # courtesy gap between Overpass queries
        total += run(layer, args.refresh)
    print('fetch_osm: %d features written to atlas/data/' % total)
    return 0


if __name__ == '__main__':
    sys.exit(main())
