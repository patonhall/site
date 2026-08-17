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

import json
import os
import secrets
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
