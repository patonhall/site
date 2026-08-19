#!/usr/bin/env python3
"""Pull City of Hamilton open data layers into normalized GeoJSON.

Writes into atlas/data/. Standard library only.

Layers are resolved BY NAME through the portal's DCAT catalogue rather than by
the numeric index in a FeatureServer URL. Those indices are assigned by the
publisher and have been observed to change; a hard-coded `/FeatureServer/2`
silently starts returning a different dataset when that happens, which is the
worst kind of failure -- the pipeline keeps working and the map starts lying.
See ../DATA-SOURCES.md.

Licence: City of Hamilton Open Data Licence. Attribution required.
https://www.hamilton.ca/city-initiatives/strategies-actions/open-data-licence-terms-and-conditions

Usage:
    python3 fetch_hamilton.py [--refresh] [--layer "Employment Lands"]
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import re
import urllib.request
from datetime import date

DCAT_URL = 'https://open.hamilton.ca/api/feed/dcat-us/1.1.json'
USER_AGENT = 'HamiltonNiagaraIndustrialAtlas/0.1 (+https://github.com/patonhall/site)'

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', 'data')
CACHE_DIR = os.path.join(HERE, '.cache')

SOURCE = {
    'name': 'City of Hamilton Open Data',
    'url': 'https://open.hamilton.ca',
    'license': 'City of Hamilton Open Data Licence',
    'license_url': 'https://www.hamilton.ca/city-initiatives/strategies-actions/'
                   'open-data-licence-terms-and-conditions',
    'attribution': 'Contains information licensed under the City of Hamilton Open Data Licence',
}

# Dataset title in the catalogue -> how the atlas files it.
# Deliberately short: Buildings (214,293 features) is left out of this first
# pass because it needs splitting into tiles before a browser should be asked
# to load it. It is a Layer-2 job, not a Layer-1 one.
WANTED = {
    'Employment Lands': {
        'slug': 'employment-land',
        'layer': 'land',
        'categories': ['EMPLOYMENT LAND'],
        'freshness': 'UPDATED ANNUALLY',
    },
    'Zoning By-law Boundary': {
        'slug': 'zoning-industrial',
        'layer': 'planning',
        'categories': ['ZONING'],
        'freshness': 'UPDATED ANNUALLY',
        # All 11,906 zoning polygons with every attribute is a 71 MB file --
        # more than a browser should be asked to parse, and 96% of it is
        # residential, rural and conservation land the atlas has no use for.
        # Filter to the industrial and employment zones at ingestion, which is
        # both smaller and more honest about what this layer is.
        'filter_field': 'ZONING_DESC',
        'filter_pattern': r'industr|employ|manufact|business park|airport',
        'keep_fields': ['ZONING_CODE', 'ZONING_DESC', 'COMMUNITY',
                        'PARENT_BY_LAW_NUMBER', 'BY_LAW_URL', 'URBAN_RURAL_SETTLE'],
        'name_field': 'ZONING_DESC',
    },
    'Railways': {
        'slug': 'rail',
        'layer': 'rail',
        'categories': ['RAIL'],
        'freshness': 'UPDATED ANNUALLY',
    },
    'Truck Route Network': {
        'slug': 'truck-routes',
        'layer': 'road',
        'categories': ['TRUCK ROUTE'],
        'freshness': 'UPDATED ANNUALLY',
    },
}


def get_json(url, cache_path, refresh=False):
    if cache_path and os.path.exists(cache_path) and not refresh:
        with open(cache_path, 'r', encoding='utf-8') as handle:
            return json.load(handle)

    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as err:
        raise SystemExit('fetch_hamilton: HTTP %d for %s' % (err.code, url))
    except urllib.error.URLError as err:
        raise SystemExit('fetch_hamilton: could not reach %s (%s)' % (url, err.reason))

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle)
    return payload


def resolve_layers(catalogue):
    """Map wanted dataset titles to their live FeatureServer URLs.

    A title that is no longer in the catalogue is reported loudly and skipped.
    Silently writing an empty layer would look like "Hamilton has no employment
    land", which is a factual claim this script is in no position to make.
    """
    found = {}
    for dataset in catalogue.get('dataset', []):
        title = dataset.get('title')
        if title not in WANTED:
            continue
        for dist in dataset.get('distribution', []) or []:
            fmt = dist.get('format') or ''
            if 'GeoServices' in fmt and dist.get('accessURL'):
                found[title] = {
                    'url': dist['accessURL'],
                    'modified': dataset.get('modified', ''),
                    'publisher': (dataset.get('publisher') or {}).get('name', ''),
                }
                break

    for title in WANTED:
        if title not in found:
            print('  WARNING: "%s" not found in the catalogue -- skipped, not '
                  'written as empty' % title)
    return found


def fetch_features(service_url, refresh):
    """ArcGIS FeatureServer -> GeoJSON, paging until the server stops
    flagging more. `exceededTransferLimit` is the only reliable signal; the
    max record count is per-service and not always advertised."""
    features = []
    offset = 0
    page = 2000

    while True:
        query = urllib.parse.urlencode({
            'where': '1=1',
            'outFields': '*',
            'outSR': '4326',
            'f': 'geojson',
            'resultOffset': offset,
            'resultRecordCount': page,
        })
        url = '%s/query?%s' % (service_url.rstrip('/'), query)
        cache = os.path.join(CACHE_DIR, 'ham-%s.json'
                             % urllib.parse.quote(service_url + str(offset), safe=''))
        payload = get_json(url, cache, refresh)

        batch = payload.get('features', [])
        features.extend(batch)

        if not payload.get('properties', {}).get('exceededTransferLimit') and \
           not payload.get('exceededTransferLimit'):
            break
        if not batch:
            break
        offset += len(batch)

    return features


def normalize(features, title, spec, meta, retrieved):
    out = []
    pattern = re.compile(spec['filter_pattern'], re.I) if spec.get('filter_pattern') else None
    keep = spec.get('keep_fields')

    for index, feature in enumerate(features):
        if not feature.get('geometry'):
            continue
        props = feature.get('properties') or {}

        if pattern and not pattern.search(str(props.get(spec['filter_field']) or '')):
            continue

        # Captured BEFORE keep_fields trims the attributes: OBJECTID is the
        # publisher's own identifier and data quality rule 4 says to preserve
        # it. Falling back to a positional index would produce ids that shift
        # whenever the filter matches a different number of rows.
        source_id = str(props.get('OBJECTID') or props.get('objectid') or index)

        if keep:
            props = {k: props[k] for k in keep if k in props}
        out.append({
            'type': 'Feature',
            'geometry': feature['geometry'],
            'properties': {
                'id': 'hamilton-%s-%s' % (spec['slug'], source_id),
                'name': (props.get(spec.get('name_field') or '')
                         or props.get('NAME') or props.get('Name') or title),
                'layer': spec['layer'],
                'categories': list(spec['categories']),
                'freshness': spec['freshness'],
                'source': dict(SOURCE,
                               dataset=title,
                               source_id=source_id,
                               url=meta['url'],
                               source_modified=meta.get('modified', ''),
                               retrieved_at=retrieved),
                # Originals kept verbatim: the normalization above is an
                # interpretation and must not be the only surviving record.
                'attributes': props,
            },
        })
    return out


def write_geojson(path, features, spec, title, meta, retrieved):
    collection = {
        'type': 'FeatureCollection',
        'atlas': {
            'layer': spec['layer'],
            'dataset': title,
            'source': SOURCE['name'],
            'license': SOURCE['license'],
            'attribution': SOURCE['attribution'],
            'freshness': spec['freshness'],
            'source_modified': meta.get('modified', ''),
            'retrieved_at': retrieved,
            'coverage': 'City of Hamilton',
            'filtered': spec.get('filter_pattern') or None,
            'feature_count': len(features),
        },
        'features': features,
    }
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(collection, handle, ensure_ascii=False)
        handle.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--layer', help='fetch only this catalogue title')
    args = parser.parse_args()

    retrieved = date.today().isoformat()
    print('fetch_hamilton: reading catalogue')
    catalogue = get_json(DCAT_URL, os.path.join(CACHE_DIR, 'ham-dcat.json'), args.refresh)
    resolved = resolve_layers(catalogue)

    total = 0
    for title, meta in sorted(resolved.items()):
        if args.layer and title != args.layer:
            continue
        spec = WANTED[title]
        print('  %s' % title)
        print('    resolved to %s' % meta['url'])
        features = fetch_features(meta['url'], args.refresh)
        normalized = normalize(features, title, spec, meta, retrieved)
        path = os.path.join(DATA_DIR, 'hamilton-%s.geojson' % spec['slug'])
        write_geojson(path, normalized, spec, title, meta, retrieved)
        print('    %d features, %.0f KB, source modified %s'
              % (len(normalized), os.path.getsize(path) / 1024.0,
                 (meta.get('modified') or 'unknown')[:10]))
        total += len(normalized)

    print('fetch_hamilton: %d features written to atlas/data/' % total)
    return 0


if __name__ == '__main__':
    sys.exit(main())
