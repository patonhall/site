#!/usr/bin/env python3
"""Local write-capable server for Paton Hall's Calendar.

Serves the static site exactly like `python3 -m http.server`, plus one
write endpoint: POST /api/events. Run this instead of the plain http.server
when you need to add events through admin-events.html. Everyone else can
keep using `python3 -m http.server` unchanged — this file only adds to
that behaviour, never replaces it as the site's runtime.

No authentication: the trust boundary is "this only runs on a machine
belonging to someone who already has git push access to the whole repo,"
the same boundary the repo itself relies on.
"""

import http.server
import json
import os
import secrets
import sys
import tempfile
from datetime import datetime

VALID_LOCATIONS = set('ABCDEFGHI')


def parse_iso(value):
    """Parse an ISO 8601 date/time string. Returns None, not an exception,
    on anything that doesn't parse — callers turn that into a validation
    error rather than a crash."""
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def validate_event(payload):
    """Validate a raw event payload from the admin form. Returns a list of
    error strings; an empty list means the payload is valid."""
    errors = []

    title = payload.get('title', '')
    if not isinstance(title, str) or not title.strip():
        errors.append('title is required')

    location = payload.get('location', '')
    if location not in VALID_LOCATIONS:
        errors.append('location must be one of A-I')

    all_day = payload.get('allDay', False)
    if not isinstance(all_day, bool):
        errors.append('allDay must be true or false')

    description = payload.get('description', '')
    if not isinstance(description, str):
        errors.append('description must be text')

    start_dt = parse_iso(payload.get('start', ''))
    end_dt = parse_iso(payload.get('end', ''))
    if start_dt is None:
        errors.append('start must be a valid ISO 8601 date/time')
    if end_dt is None:
        errors.append('end must be a valid ISO 8601 date/time')
    if start_dt is not None and end_dt is not None and end_dt < start_dt:
        errors.append('end must not be before start')

    return errors


def generate_uid(existing_uids, now=None):
    """A timestamp plus 4 random hex chars. Retries on collision against
    existing_uids, which in practice never happens — this is a cheap
    safety net, not a real concurrency mechanism."""
    now = now or datetime.utcnow()
    stamp = now.strftime('%Y%m%dT%H%M%S')
    for _ in range(5):
        candidate = stamp + '-' + secrets.token_hex(2)
        if candidate not in existing_uids:
            return candidate
    raise RuntimeError('could not generate a unique event id')


def load_events(path):
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_events(path, events):
    """Write the whole events list back atomically: write to a temp file in
    the same directory, then os.replace() over the real path. A crash or
    Ctrl-C mid-write can then never leave events.json truncated."""
    directory = os.path.dirname(path) or '.'
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix='.events-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(events, f, indent=2)
            f.write('\n')
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


EVENTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'assets', 'data', 'events.json')


class AdminRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Static file serving (inherited) plus POST /api/events."""

    def do_POST(self):
        if self.path != '/api/events':
            self.send_error(404, 'Not found')
            return

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b''
        try:
            payload = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {'error': 'request body must be valid JSON'})
            return

        errors = validate_event(payload)
        if errors:
            self._send_json(400, {'error': '; '.join(errors)})
            return

        events = load_events(EVENTS_PATH)
        uid = generate_uid({e['uid'] for e in events})
        event = {
            'uid': uid,
            'title': payload['title'].strip(),
            'start': payload['start'],
            'end': payload['end'],
            'allDay': bool(payload.get('allDay', False)),
            'location': payload['location'],
            'description': payload.get('description', ''),
            'created': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'),
        }
        events.append(event)
        save_events(EVENTS_PATH, events)
        self._send_json(201, event)

    def _send_json(self, status, body):
        data = json.dumps(body).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8017
    root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(root)
    server = http.server.HTTPServer(('', port), AdminRequestHandler)
    print('Serving %s with write access at http://localhost:%d/  (Ctrl+C to stop)'
          % (root, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
