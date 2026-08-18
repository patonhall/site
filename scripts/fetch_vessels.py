#!/usr/bin/env python3
"""Collect AIS vessel positions near Hamilton into a data file.

Run by .github/workflows/vessels.yml. Writes assets/data/vessels.json, which
assets/js/ships.js reads at page load like every other data file on this site.

Why build time rather than the browser: aisstream.io is a WebSocket service
that authenticates with an API key in the subscribe frame. A static page
cannot hold that key -- anything shipped to the browser is public -- so the
key lives in Actions secrets and only the resulting positions reach the repo.
Same reasoning as scripts/fetch_kit_posts.py, different cause.

Not standard library only, unlike the other scripts here: it needs
`websockets`. The workflow pip-installs it. There is no stdlib WebSocket
client and hand-rolling the framing to avoid one dependency would be worse.

Protocol verified live against the service, not taken from documentation:
subscribe with {APIKey, BoundingBoxes, FilterMessageTypes}, then read JSON
frames carrying MessageType, MetaData (MMSI, ShipName, latitude, longitude,
time_utc) and Message.<type>. ShipStaticData adds type and destination but
arrives only every few minutes per vessel, so it is merged opportunistically
and never waited for.

Coverage is terrestrial and crowd-sourced. A vessel out of receiver range is
simply absent -- this file is "what we heard", never "what is there", and the
page says so.
"""

import asyncio
import json
import math
import os
import sys
from datetime import datetime, timezone

try:
    import websockets
except ImportError:
    sys.exit("fetch_vessels: the `websockets` package is required "
             "(pip install websockets)")

ENDPOINT = 'wss://stream.aisstream.io/v0/stream'

# Western Lake Ontario: Hamilton Harbour and Burlington Bay, out far enough
# to catch a laker on approach rather than only once it is already alongside.
BOUNDING_BOX = [[[43.10, -80.05], [43.65, -79.10]]]

# Middle of Hamilton Harbour, used only to rank vessels by how close they are.
HAMILTON = (43.2900, -79.8500)

COLLECT_SECONDS = 110

OUT_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..',
    'assets', 'data', 'vessels.json')

# AIS navigational status codes. Anything unlisted is reported as a bare code
# rather than guessed at.
NAV_STATUS = {
    0: 'Under way', 1: 'At anchor', 2: 'Not under command',
    3: 'Restricted manoeuvrability', 4: 'Constrained by draught',
    5: 'Moored', 6: 'Aground', 7: 'Fishing', 8: 'Under sail',
    15: 'Undefined',
}


def ship_type(code):
    """Coarse bucket for an AIS ship-type code.

    Deliberately coarse: the full table distinguishes cargo carrying dangerous
    goods category A from category B, which is meaningless on a public board
    and wrong often enough (many vessels report a stale or generic code) that
    precision here would be false precision.
    """
    if code is None:
        return ''
    if 70 <= code <= 79:
        return 'Cargo'
    if 80 <= code <= 89:
        return 'Tanker'
    if 60 <= code <= 69:
        return 'Passenger'
    if 50 <= code <= 59:
        return 'Service'
    if code in (31, 32, 52):
        return 'Tug'
    if code == 30:
        return 'Fishing'
    if code in (36, 37):
        return 'Pleasure'
    if 40 <= code <= 49:
        return 'High-speed'
    return ''


def distance_km(lat, lon):
    """Great-circle distance from the middle of Hamilton Harbour."""
    r = 6371.0
    dlat = math.radians(lat - HAMILTON[0])
    dlon = math.radians(lon - HAMILTON[1])
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(HAMILTON[0])) * math.cos(math.radians(lat))
         * math.sin(dlon / 2) ** 2)
    return round(2 * r * math.asin(math.sqrt(a)), 1)


def clean_time(value):
    """aisstream stamps look like '2026-08-18 19:10:15.944705714 +0000 UTC'."""
    return (value or '')[:16]


async def collect():
    key = os.environ.get('AISSTREAM_API_KEY')
    if not key:
        sys.exit('fetch_vessels: AISSTREAM_API_KEY is not set. In CI this comes '
                 'from an Actions secret; set it with `gh secret set '
                 'AISSTREAM_API_KEY`.')

    subscribe = {
        'APIKey': key,
        'BoundingBoxes': BOUNDING_BOX,
        'FilterMessageTypes': ['PositionReport', 'ShipStaticData'],
    }

    vessels = {}
    try:
        async with websockets.connect(ENDPOINT) as ws:
            await ws.send(json.dumps(subscribe))
            try:
                async with asyncio.timeout(COLLECT_SECONDS):
                    async for raw in ws:
                        message = json.loads(raw)
                        # The service reports a bad key as a normal frame, not
                        # a connection failure, so this must be checked or an
                        # auth problem looks exactly like a quiet harbour.
                        if 'error' in message or 'Error' in message:
                            sys.exit('fetch_vessels: service returned an error '
                                     '(check the API key): %s' % raw[:200])
                        absorb(vessels, message)
            except (asyncio.TimeoutError, TimeoutError):
                pass
    except OSError as err:
        sys.exit('fetch_vessels: could not reach %s (%s)' % (ENDPOINT, err))

    return vessels


def absorb(vessels, message):
    meta = message.get('MetaData') or {}
    mmsi = meta.get('MMSI')
    if not mmsi:
        return

    record = vessels.setdefault(mmsi, {'mmsi': mmsi, 'name': '', 'type': ''})

    name = (meta.get('ShipName') or '').strip()
    if name:
        record['name'] = name

    kind = message.get('MessageType')
    if kind == 'PositionReport':
        report = (message.get('Message') or {}).get('PositionReport') or {}
        lat, lon = meta.get('latitude'), meta.get('longitude')
        if lat is None or lon is None:
            return
        record['lat'] = round(lat, 5)
        record['lon'] = round(lon, 5)
        record['km'] = distance_km(lat, lon)
        record['seen'] = clean_time(meta.get('time_utc'))
        sog = report.get('Sog')
        # 102.3 is the AIS "speed not available" sentinel.
        record['sog'] = round(sog, 1) if isinstance(sog, (int, float)) and sog < 102 else None
        nav = report.get('NavigationalStatus')
        record['status'] = NAV_STATUS.get(nav, '') if isinstance(nav, int) else ''
    elif kind == 'ShipStaticData':
        static = (message.get('Message') or {}).get('ShipStaticData') or {}
        record['type'] = ship_type(static.get('Type'))
        destination = (static.get('Destination') or '').strip()
        if destination:
            record['destination'] = destination


def main():
    vessels = asyncio.run(collect())

    # Only vessels we actually got a position for. A ShipStaticData frame
    # alone tells us a vessel exists somewhere but not where, and a row with
    # no position on a position board is noise.
    located = [v for v in vessels.values() if 'lat' in v]
    located.sort(key=lambda v: v['km'])

    doc = {
        'updated': datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M'),
        'sourceName': 'aisstream.io (terrestrial AIS)',
        'sourceUrl': 'https://aisstream.io/',
        'windowSeconds': COLLECT_SECONDS,
        'vessels': located,
    }

    with open(OUT_PATH, 'w', encoding='utf-8') as handle:
        json.dump(doc, handle, indent=2, ensure_ascii=True)
        handle.write('\n')

    print('fetch_vessels: wrote %d vessels' % len(located))


if __name__ == '__main__':
    main()
