#!/usr/bin/env python3
"""Pull New York State layers for Erie and Niagara counties into GeoJSON.

Writes atlas/data/us-*.geojson. Standard library only.

These are the layers that have no Ontario counterpart, and they are the reason
the American side of the atlas needs its own controls rather than a mirror of
the Canadian ones:

  * industrial PARCELS with property class, floor area and assessment --
    Ontario's equivalent (MPAC) is fee-based and withholds this
  * state-designated BROWNFIELD opportunity areas -- Ontario side has only an
    OpenStreetMap proxy
  * regulated FACILITY registries -- a permit is positive evidence that a
    specific industrial process happens at a location, which is a stronger
    claim than "this building looks industrial"

Filtering is done with a bounding-box spatial query rather than an attribute
filter wherever possible, because the county field is named differently in
every one of these services and a spatial filter cannot be wrong about
geography.

Usage:
    python3 fetch_nys.py [--refresh] [--layer parcels|brownfield|facilities]
"""

import argparse
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', '..', 'data')
CACHE_DIR = os.path.join(HERE, '.cache')
USER_AGENT = 'HamiltonNiagaraIndustrialAtlas/0.1 (+https://github.com/patonhall/site)'

# Erie and Niagara counties, New York: xmin, ymin, xmax, ymax.
WNY_BBOX = (-79.15, 42.40, -78.40, 43.40)

PARCELS_URL = ('https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/'
               'services/NYS_Tax_Parcels_Public/FeatureServer/1')
# Niagara County is absent from the state parcel set (only 38 of 62 counties
# take part), so it comes from the county's own server. Richer in one respect:
# it carries ZoneCode, which the state layer has no equivalent of.
NIAGARA_PARCELS_URL = ('https://gis.niagaracounty.com/arcgis/rest/services/'
                       'NC_GIS/NC_GIS/FeatureServer/4')

# New York property classes that make up the industrial economy, not just the
# 700 series. Measured on Erie County: the 700s hold 1,159 parcels while class
# 449 alone holds 1,802. Restricting to 700-799 shows manufacturing and hides
# most of the freight economy, which in a port-and-rail region is the larger
# half. 340 is here because vacant industrial land is exactly what an operator
# looking for somewhere to build needs to see (brief section 13).
PARCEL_CLASSES = {
    340: ('VACANT INDUSTRIAL', 'Vacant industrial land'),
    441: ('LOGISTICS', 'Fuel storage and distribution'),
    442: ('WAREHOUSING', 'Mini warehouse / self storage'),
    443: ('FOOD', 'Grain and feed elevators, mills'),
    444: ('WOOD', 'Lumber yards'),
    446: ('WAREHOUSING', 'Cold storage'),
    447: ('LOGISTICS', 'Truck terminal'),
    448: ('MARITIME', 'Piers, wharves, docks'),
    449: ('WAREHOUSING', 'Storage, warehouse and distribution'),
    842: ('RAIL', 'Ceiling railroad'),
    843: ('RAIL', 'Non-ceiling railroad'),
    844: ('ENERGY', 'Gas and oil pipelines'),
    872: ('ENERGY', 'Electric substation'),
    873: ('ENERGY', 'Gas measuring station'),
    874: ('ENERGY', 'Electric power generation'),
    882: ('ENERGY', 'Electric transmission'),
}

# One SQL predicate shared by both counties.
PARCEL_WHERE = ('(%%s >= 700 AND %%s < 800) OR %%s IN (%s)'
                % ','.join(str(c) for c in sorted(PARCEL_CLASSES)))


def parcel_categories(code):
    """Atlas categories for a NY property class. The 700 series is production;
    everything else in PARCEL_CLASSES is named explicitly so the map can say
    what kind of industrial land a parcel is, not merely that it is some."""
    try:
        code = int(code)
    except (TypeError, ValueError):
        return ['INDUSTRIAL PARCEL']
    if 700 <= code < 800:
        return ['INDUSTRIAL PARCEL', 'MANUFACTURING']
    if code in PARCEL_CLASSES:
        return ['INDUSTRIAL PARCEL', PARCEL_CLASSES[code][0]]
    return ['INDUSTRIAL PARCEL']
BOA_URL = ('https://services2.arcgis.com/okXm0pb6aWH6XOGI/arcgis/rest/'
           'services/BOA_Designations_November2021_Polygons/FeatureServer/0')
DEC_ROOT = 'https://services6.arcgis.com/DZHaqZm9cxOD4CWM/arcgis/rest/services'

# One combined "regulated industrial facilities" layer rather than a dozen
# switches. Each feature keeps the register it came from, so the detail panel
# can still say exactly which permit this is.
DEC_REGISTRIES = [
    ('Air Facility Registrations', 'Air_Facility_Registrations/FeatureServer/0', 'AIR'),
    ('Chemical Bulk Storage', 'Chemical_Bulk_Storage_Facility/FeatureServer/0', 'CHEMICAL'),
    ('Petroleum Bulk Storage', 'Petroleum_Bulk_Storage_Facility/FeatureServer/1', 'ENERGY'),
    ('Major Oil Storage', 'Major_Oil_Storage_Facility/FeatureServer/1', 'ENERGY'),
    ('Hazardous Waste TSDFs',
     'Hazardous_Waste_Treatment__Storage_and_Disposal_Facilities_TSDFs/FeatureServer/2',
     'RECYCLING'),
    ('Combustion Facilities', 'Combustion_Facilities/FeatureServer/14', 'ENERGY'),
    ('Recyclables Handling', 'Recyclables_Handling_and_Recovery_Facilities/FeatureServer/16',
     'RECYCLING'),
    ('Vehicle Dismantling', 'Vehicle_Dismantling_Facilities/FeatureServer/17', 'RECYCLING'),
    ('Remediation Parcels', 'Remediation_Parcels/FeatureServer/0', 'BROWNFIELD'),
    ('Air State Facility Permits', 'Air_State_Facility_Permits_ASF/FeatureServer/0', 'AIR'),
    ('Regulated Transfer Facilities', 'Regulated_Transfer_Facilities/FeatureServer/13', 'RECYCLING'),
    ('Waste Tire Handling', 'Waste_Tire_Handling_and_Recovery_Facilities/FeatureServer/18', 'RECYCLING'),
    ('Wastewater Facilities', 'Wastewater_Facility/FeatureServer/0', 'UTILITY'),
]

NY_SOURCE = {
    'name': 'New York State GIS',
    'url': 'https://data.gis.ny.gov',
    'license': 'Open, attribution',
    'attribution': 'New York State GIS Program Office',
}

# Fields deliberately dropped from parcels. PRIMARY_OWNER and the mailing
# address name identifiable people and companies; publishing them at property
# level is a claim about individuals, not a map feature. See the constraint
# section in ../DATA-SOURCES.md.
PARCEL_DROP = {
    'PRIMARY_OWNER', 'ADD_OWNER', 'MAIL_ADDR', 'PO_BOX', 'MAIL_CITY',
    'MAIL_STATE', 'MAIL_ZIP', 'ADD_MAIL_ADDR', 'ADD_MAIL_PO_BOX',
    'ADD_MAIL_CITY', 'ADD_MAIL_STATE', 'ADD_MAIL_ZIP', 'NBR_KITCHENS',
    'NBR_FULL_BATHS', 'NBR_BEDROOMS', 'SQFT_LIVING', 'BOOK', 'PAGE',
    # Niagara County's own field names for the same personal data.
    'OwnrName', 'own_street_address', 'own_city_state_zip', 'OwnerID',
    'Book', 'Page',
}


def get(url, cache_path, refresh=False):
    if cache_path and os.path.exists(cache_path) and not refresh:
        with open(cache_path, 'r', encoding='utf-8') as handle:
            return json.load(handle)

    request = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    payload = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=180) as response:
                payload = json.loads(response.read().decode('utf-8'))
            break
        except urllib.error.HTTPError as err:
            if attempt < 3:
                time.sleep(4 * attempt)
                continue
            raise SystemExit('fetch_nys: HTTP %d for %s' % (err.code, url[:110]))
        except urllib.error.URLError as err:
            raise SystemExit('fetch_nys: could not reach %s (%s)' % (url[:110], err.reason))

    if payload is None:
        raise SystemExit('fetch_nys: no response from %s' % url[:110])

    if cache_path:
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'w', encoding='utf-8') as handle:
            json.dump(payload, handle)
    return payload


def query(service_url, where='1=1', bbox=None, refresh=False):
    """Paged ArcGIS query returning GeoJSON features."""
    features = []
    offset = 0

    while True:
        params = {
            'where': where,
            'outFields': '*',
            'outSR': '4326',
            'f': 'geojson',
            'resultOffset': offset,
            'resultRecordCount': 1000,
        }
        if bbox:
            params.update({
                'geometry': '%s,%s,%s,%s' % bbox,
                'geometryType': 'esriGeometryEnvelope',
                'inSR': '4326',
                'spatialRel': 'esriSpatialRelIntersects',
            })
        url = '%s/query?%s' % (service_url.rstrip('/'), urllib.parse.urlencode(params))
        # Key on the WHOLE request, not just the service and offset. Keying on
        # the service alone meant a widened `where` clause silently returned
        # the previous, narrower cached result -- the pipeline kept working
        # and the map quietly stayed wrong.
        cache = os.path.join(CACHE_DIR, 'nys-%s-%s.json' % (
            urllib.parse.quote(service_url, safe='')[-80:],
            hashlib.sha1(url.encode('utf-8')).hexdigest()[:12]))
        payload = get(url, cache, refresh)

        if 'error' in payload:
            print('    service error: %s' % str(payload['error'])[:150])
            break

        batch = payload.get('features', [])
        features.extend(batch)
        more = (payload.get('properties', {}) or {}).get('exceededTransferLimit') \
            or payload.get('exceededTransferLimit')
        if not more or not batch:
            break
        offset += len(batch)

    return features


def feature(geometry, props, fid, name, layer, categories, freshness, source):
    return {
        'type': 'Feature',
        'geometry': geometry,
        'properties': {
            'id': fid,
            'name': name,
            'layer': layer,
            'categories': categories,
            'freshness': freshness,
            'source': source,
            'attributes': props,
        },
    }


def write(path, features, meta):
    collection = {'type': 'FeatureCollection', 'atlas': meta, 'features': features}
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(collection, handle, ensure_ascii=False)
        handle.write('\n')
    print('    %d features, %.0f KB' % (len(features), os.path.getsize(path) / 1024.0))


def do_parcels(retrieved, refresh):
    """Erie (state dataset) and Niagara (county server) in one layer.

    Two publishers, two schemas, one concept -- so they share a switch on the
    map and each feature carries its own source block. Splitting them into two
    layers would ask the reader to know which county publishes where, which is
    exactly the kind of institutional detail the map should absorb.
    """
    out = []

    print('  Erie County parcels (industrial economy classes)')
    where = PARCEL_WHERE % ('PROP_CLASS', 'PROP_CLASS', 'PROP_CLASS')
    for f in query(PARCELS_URL, where="COUNTY_NAME='Erie' AND (%s)" % where,
                   refresh=refresh):
        if not f.get('geometry'):
            continue
        props = {k: v for k, v in (f.get('properties') or {}).items()
                 if k not in PARCEL_DROP and v not in (None, '')}
        oid = props.get('OBJECTID') or props.get('PRINT_KEY') or len(out)
        out.append(feature(
            f['geometry'], props, 'us-nys-parcel-%s' % oid,
            props.get('PARCEL_ADDR') or props.get('MUNI_NAME') or 'Industrial parcel',
            'land', parcel_categories(props.get('PROP_CLASS')), 'UPDATED ANNUALLY',
            dict(NY_SOURCE, dataset='NYS Tax Parcels Public', county='Erie',
                 source_id=str(oid), url=PARCELS_URL, retrieved_at=retrieved)))
    print('    Erie: %d' % len(out))

    print('  Niagara County parcels (county GIS)')
    before = len(out)
    where = PARCEL_WHERE % ('PropClsite', 'PropClsite', 'PropClsite')
    for f in query(NIAGARA_PARCELS_URL, where=where, refresh=refresh):
        if not f.get('geometry'):
            continue
        props = {k: v for k, v in (f.get('properties') or {}).items()
                 if k not in PARCEL_DROP and v not in (None, '')}
        oid = props.get('OBJECTID_1') or props.get('ParcelId') or len(out)
        street = ' '.join(str(props.get(k, '')) for k in ('PrclNumb', 'PrclStreet')).strip()
        out.append(feature(
            f['geometry'], props, 'us-niagara-parcel-%s' % oid,
            street or props.get('PrclMuni') or 'Industrial parcel',
            'land', parcel_categories(props.get('PropClsite')), 'UPDATED ANNUALLY',
            dict(name='Niagara County GIS', organization='Niagara County, New York',
                 dataset='NC_GIS Parcel', county='Niagara',
                 license='Open, attribution', attribution='Niagara County, New York',
                 source_id=str(oid), url=NIAGARA_PARCELS_URL,
                 retrieved_at=retrieved)))
    print('    Niagara: %d' % (len(out) - before))

    write(os.path.join(DATA_DIR, 'us-industrial-parcels.geojson'), out, {
        'layer': 'land', 'dataset': 'Industrial-economy parcels',
        'source': 'NYS Tax Parcels Public (Erie); Niagara County GIS (Niagara)',
        'license': 'Open, attribution',
        'attribution': 'New York State GIS Program Office; Niagara County, New York',
        'freshness': 'UPDATED ANNUALLY',
        'coverage': 'Erie and Niagara counties, NY',
        'retrieved_at': retrieved, 'feature_count': len(out),
        'classes': 'NY property class 700-799 plus %s'
                   % ', '.join(str(c) for c in sorted(PARCEL_CLASSES)),
        'note': 'Owner names, mailing addresses and residential detail removed '
                'at ingestion.',
    })


def do_brownfield(retrieved, refresh):
    print('  brownfield opportunity areas')
    raw = query(BOA_URL, bbox=WNY_BBOX, refresh=refresh)
    out = []
    for f in raw:
        if not f.get('geometry'):
            continue
        props = {k: v for k, v in (f.get('properties') or {}).items() if v not in (None, '')}
        oid = props.get('OBJECTID') or len(out)
        name = (props.get('BOA_Name') or props.get('NAME') or props.get('Name')
                or 'Brownfield Opportunity Area')
        out.append(feature(
            f['geometry'], props, 'us-nys-boa-%s' % oid, name,
            'planning', ['BROWNFIELD'], 'HISTORICAL',
            dict(NY_SOURCE, dataset='Designated Brownfield Opportunity Areas',
                 organization='NYS Department of State', source_id=str(oid),
                 url=BOA_URL, source_modified='2021-11', retrieved_at=retrieved)))
    write(os.path.join(DATA_DIR, 'us-brownfield.geojson'), out, {
        'layer': 'planning', 'dataset': 'Designated Brownfield Opportunity Areas',
        'source': 'NYS Department of State', 'license': NY_SOURCE['license'],
        'attribution': 'NYS Department of State', 'freshness': 'HISTORICAL',
        'coverage': 'Erie and Niagara counties, NY',
        'retrieved_at': retrieved, 'feature_count': len(out),
        'note': 'November 2021 designation snapshot, not a live register.',
    })


def do_facilities(retrieved, refresh):
    print('  regulated industrial facilities (DEC registries)')
    out = []
    for label, path, category in DEC_REGISTRIES:
        url = '%s/%s' % (DEC_ROOT, path)
        raw = query(url, bbox=WNY_BBOX, refresh=refresh)
        print('    %-26s %4d' % (label, len(raw)))
        for f in raw:
            if not f.get('geometry'):
                continue
            props = {k: v for k, v in (f.get('properties') or {}).items()
                     if v not in (None, '')}
            oid = props.get('OBJECTID') or len(out)
            name = next((props[k] for k in ('FACILITY_NAME', 'Facility_Name', 'NAME',
                                            'Name', 'FAC_NAME', 'SITE_NAME')
                         if props.get(k)), label)
            out.append(feature(
                f['geometry'], props,
                'us-dec-%s-%s' % (path.split('/')[0][:18].lower(), oid),
                name, 'place', ['REGULATED FACILITY', category], 'UPDATED ANNUALLY',
                dict(NY_SOURCE, dataset=label,
                     organization='NYS Department of Environmental Conservation',
                     registry=label, source_id=str(oid), url=url,
                     retrieved_at=retrieved)))
        time.sleep(1)

    write(os.path.join(DATA_DIR, 'us-facilities.geojson'), out, {
        'layer': 'place', 'dataset': 'NYS DEC regulated facility registries',
        'source': 'NYS Department of Environmental Conservation',
        'license': NY_SOURCE['license'],
        'attribution': 'NYS Department of Environmental Conservation',
        'freshness': 'UPDATED ANNUALLY', 'coverage': 'Erie and Niagara counties, NY',
        'retrieved_at': retrieved, 'feature_count': len(out),
        'registries': [r[0] for r in DEC_REGISTRIES],
        'note': 'A permit is evidence that a specific industrial process occurs '
                'at a location, not that a business is currently trading.',
    })


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--layer', choices=('parcels', 'brownfield', 'facilities'))
    args = parser.parse_args()

    retrieved = date.today().isoformat()
    print('fetch_nys: Erie and Niagara counties, New York')

    jobs = {'parcels': do_parcels, 'brownfield': do_brownfield, 'facilities': do_facilities}
    for name in ([args.layer] if args.layer else ['parcels', 'brownfield', 'facilities']):
        jobs[name](retrieved, args.refresh)
    return 0


if __name__ == '__main__':
    sys.exit(main())
