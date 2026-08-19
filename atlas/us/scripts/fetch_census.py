#!/usr/bin/env python3
"""Capture US Census County Business Patterns for Erie and Niagara counties, NY.

Writes atlas/data/us-cbp-<year>.json. Standard library only.

This is the one source that could put Hamilton, Niagara Region and the two
American counties on a comparable NAICS footing -- the Niagara NEI also
carries NAICS codes. It is TABULAR, not geospatial: establishment and
employment counts per county per NAICS code, with no geometry. It informs
classification weighting and validates other layers; it does not become a map
layer of its own, and nothing here should be rendered as a point.

CBP is published annually and is small (a few thousand rows for two counties),
so this is a capture-once script rather than a recurring fetch. Once the output
is committed the API key is not needed again until a newer vintage is wanted.

    export CENSUS_API_KEY=...        # free: api.census.gov/data/key_signup.html
    python3 fetch_census.py [--year 2022]

The key is read from the environment and never written to disk. This
repository is public; a committed key would be scraped within minutes.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', '..', 'data')

COUNTIES = {
    '029': 'Erie',
    '063': 'Niagara',
}
STATE = '36'          # New York
FIELDS = ['NAME', 'NAICS2017', 'NAICS2017_LABEL', 'ESTAB', 'EMP', 'PAYANN']

SOURCE = {
    'name': 'US Census County Business Patterns',
    'organization': 'US Census Bureau',
    'url': 'https://www.census.gov/programs-surveys/cbp.html',
    'license': 'US Government public domain',
    'attribution': 'US Census Bureau, County Business Patterns',
}


def fetch(year, fips, key):
    query = urllib.parse.urlencode({
        'get': ','.join(FIELDS),
        'for': 'county:%s' % fips,
        'in': 'state:%s' % STATE,
        'key': key,
    })
    url = 'https://api.census.gov/data/%s/cbp?%s' % (year, query)

    request = urllib.request.Request(
        url, headers={'User-Agent': 'HamiltonNiagaraIndustrialAtlas/0.1'})
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            body = response.read().decode('utf-8')
    except urllib.error.HTTPError as err:
        raise SystemExit('fetch_census: HTTP %d for county %s' % (err.code, fips))
    except urllib.error.URLError as err:
        raise SystemExit('fetch_census: could not reach the Census API (%s)' % err.reason)

    # A bad or missing key comes back as an HTML page, not JSON or an error
    # status -- so this must be checked, or an auth problem looks exactly like
    # a county with no businesses.
    if not body.lstrip().startswith('['):
        raise SystemExit('fetch_census: the API did not return JSON. This is '
                         'almost always a missing or rejected CENSUS_API_KEY.')

    rows = json.loads(body)
    header, records = rows[0], rows[1:]
    return [dict(zip(header, r)) for r in records]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--year', default='2022')
    args = parser.parse_args()

    key = os.environ.get('CENSUS_API_KEY')
    if not key:
        sys.exit('fetch_census: CENSUS_API_KEY is not set.\n'
                 '  Get one free at https://api.census.gov/data/key_signup.html\n'
                 '  then: export CENSUS_API_KEY=...')

    out = {
        'atlas': {
            'kind': 'table',
            'note': 'Tabular, not geospatial. Counts per county per NAICS code; '
                    'no geometry. Not to be rendered as map features.',
            'year': args.year,
            'source': SOURCE,
            'freshness': 'UPDATED ANNUALLY',
            'retrieved_at': date.today().isoformat(),
            'coverage': 'Erie County (36029) and Niagara County (36063), New York',
        },
        'counties': {},
    }

    for fips, name in sorted(COUNTIES.items()):
        records = fetch(args.year, fips, key)
        industrial = [r for r in records
                      if str(r.get('NAICS2017', '')).startswith(('31', '32', '33'))]
        total = [r for r in records if r.get('NAICS2017') == '00']
        out['counties'][fips] = {
            'name': name,
            'fips': STATE + fips,
            'naics_rows': len(records),
            'manufacturing_rows': len(industrial),
            'establishments_all_industries': total[0]['ESTAB'] if total else None,
            'employees_all_industries': total[0]['EMP'] if total else None,
            'rows': records,
        }
        print('  %-8s %5d NAICS rows, %4d manufacturing, %s establishments'
              % (name, len(records), len(industrial),
                 total[0]['ESTAB'] if total else '?'))

    path = os.path.join(DATA_DIR, 'us-cbp-%s.json' % args.year)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(out, handle, ensure_ascii=False, indent=1)
        handle.write('\n')

    print('fetch_census: wrote %s (%.0f KB)'
          % (os.path.relpath(path, HERE), os.path.getsize(path) / 1024.0))
    return 0


if __name__ == '__main__':
    sys.exit(main())
