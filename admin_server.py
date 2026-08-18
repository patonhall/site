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


VALID_REGISTRATION_MODES = {'capacity', 'door'}


def parse_date(value):
    """Parse a YYYY-MM-DD date string. Returns None, not an exception, on
    anything that doesn't parse."""
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.strptime(value, '%Y-%m-%d')
    except ValueError:
        return None


def validate_course(payload):
    """Validate a raw course payload from the admin form. Returns a list of
    error strings; an empty list means the payload is valid."""
    errors = []

    title = payload.get('title', '')
    if not isinstance(title, str) or not title.strip():
        errors.append('title is required')

    category = payload.get('category', '')
    new_category = payload.get('newCategory', '')
    has_category = isinstance(category, str) and bool(category.strip())
    has_new_category = isinstance(new_category, str) and bool(new_category.strip())
    if not has_category and not has_new_category:
        errors.append('category is required')

    cost = payload.get('cost', '')
    if not isinstance(cost, str) or not cost.strip():
        errors.append('cost is required')

    # Optional: a course scheduled in a hurry can be saved without one, and
    # the Training table simply shows no expander for it. Markdown, rendered
    # by assets/js/markdown.js exactly as post bodies are.
    description = payload.get('description', '')
    if not isinstance(description, str):
        errors.append('description must be text')

    start_dt = parse_date(payload.get('startDate', ''))
    end_dt = parse_date(payload.get('endDate', ''))
    if start_dt is None:
        errors.append('startDate must be a valid date (YYYY-MM-DD)')
    if end_dt is None:
        errors.append('endDate must be a valid date (YYYY-MM-DD)')
    if start_dt is not None and end_dt is not None and end_dt < start_dt:
        errors.append('endDate must not be before startDate')

    mode = payload.get('registrationMode', '')
    if mode not in VALID_REGISTRATION_MODES:
        errors.append('registrationMode must be "capacity" or "door"')
    elif mode == 'capacity':
        seats_total = payload.get('seatsTotal')
        seats_filled = payload.get('seatsFilled')
        total_ok = isinstance(seats_total, int) and not isinstance(seats_total, bool) and seats_total > 0
        filled_ok = isinstance(seats_filled, int) and not isinstance(seats_filled, bool) and seats_filled >= 0
        if not total_ok:
            errors.append('seatsTotal must be a positive integer')
        if not filled_ok:
            errors.append('seatsFilled must be a non-negative integer')
        if total_ok and filled_ok and seats_filled > seats_total:
            errors.append('seatsFilled must not exceed seatsTotal')

    return errors


def validate_post(payload):
    """Validate a raw Updates post payload from the admin form. Returns a
    list of error strings; an empty list means the payload is valid."""
    errors = []

    title = payload.get('title', '')
    if not isinstance(title, str) or not title.strip():
        errors.append('title is required')

    author = payload.get('author', '')
    if not isinstance(author, str) or not author.strip():
        errors.append('author is required')

    body = payload.get('body', '')
    if not isinstance(body, str) or not body.strip():
        errors.append('body is required')

    if parse_date(payload.get('date', '')) is None:
        errors.append('date must be a valid date (YYYY-MM-DD)')

    topics = payload.get('topics', [])
    if not isinstance(topics, list) or not all(isinstance(t, str) and t.strip() for t in topics):
        errors.append('topics must be a list of non-empty strings')

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


def resolve_category(payload, categories_path):
    """Resolve which category name a course payload should use. A non-empty
    newCategory always wins over category; if it isn't already present in
    the categories file, it's appended and the file is saved. Returns the
    resolved category name (stripped)."""
    new_category = payload.get('newCategory', '')
    if isinstance(new_category, str) and new_category.strip():
        category = new_category.strip()
        categories = load_items(categories_path)
        if category not in categories:
            categories.append(category)
            save_items(categories_path, categories)
        return category
    return payload['category'].strip()


def load_items(path):
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_items(path, items):
    """Write the whole list back atomically: write to a temp file in the
    same directory, then os.replace() over the real path. A crash or
    Ctrl-C mid-write can then never leave the file truncated."""
    directory = os.path.dirname(path) or '.'
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix='.items-', suffix='.tmp')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(items, f, indent=2)
            f.write('\n')
        os.replace(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'data')
EVENTS_PATH = os.path.join(DATA_DIR, 'events.json')
COURSES_PATH = os.path.join(DATA_DIR, 'courses.json')
CATEGORIES_PATH = os.path.join(DATA_DIR, 'course-categories.json')
POSTS_PATH = os.path.join(DATA_DIR, 'posts.json')


def create_event(payload):
    """Validate, construct, and persist a new event from a raw payload.
    Raises ValueError (joined error messages) if the payload is invalid.
    Returns the created event dict. Shared by the HTTP handler and
    scripts/approve_request.py, so both write identically-shaped records."""
    errors = validate_event(payload)
    if errors:
        raise ValueError('; '.join(errors))

    events = load_items(EVENTS_PATH)
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
    save_items(EVENTS_PATH, events)
    return event


def create_course(payload):
    """Validate, construct, and persist a new course from a raw payload.
    Raises ValueError (joined error messages) if the payload is invalid.
    Returns the created course dict. Shared by the HTTP handler and
    scripts/approve_request.py, so both write identically-shaped records."""
    errors = validate_course(payload)
    if errors:
        raise ValueError('; '.join(errors))

    category = resolve_category(payload, CATEGORIES_PATH)

    courses = load_items(COURSES_PATH)
    uid = generate_uid({c['uid'] for c in courses})
    course = {
        'uid': uid,
        'title': payload['title'].strip(),
        'category': category,
        'startDate': payload['startDate'],
        'endDate': payload['endDate'],
        'cost': payload['cost'].strip(),
        'description': payload.get('description', '').strip(),
        'registrationMode': payload['registrationMode'],
        'created': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'),
    }
    if payload['registrationMode'] == 'capacity':
        course['seatsTotal'] = payload['seatsTotal']
        course['seatsFilled'] = payload['seatsFilled']

    courses.append(course)
    save_items(COURSES_PATH, courses)
    return course


class AdminRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Static file serving (inherited) plus POST /api/events."""

    def do_POST(self):
        if self.path == '/api/events':
            self._handle_create_event()
        elif self.path == '/api/courses':
            self._handle_create_course()
        elif self.path == '/api/posts':
            self._handle_create_post()
        else:
            self._send_json(404, {'error': 'not found'})

    def _read_json_body(self):
        """Reads and parses the request body. Returns (payload, None) on
        success, or (None, (status, body)) if the body isn't valid JSON or
        isn't a JSON object."""
        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b''
        try:
            payload = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            return None, (400, {'error': 'request body must be valid JSON'})
        if not isinstance(payload, dict):
            return None, (400, {'error': 'request body must be a JSON object'})
        return payload, None

    def _handle_create_event(self):
        payload, error = self._read_json_body()
        if error:
            self._send_json(*error)
            return
        try:
            event = create_event(payload)
        except ValueError as e:
            self._send_json(400, {'error': str(e)})
            return
        self._send_json(201, event)

    def _handle_create_course(self):
        payload, error = self._read_json_body()
        if error:
            self._send_json(*error)
            return
        try:
            course = create_course(payload)
        except ValueError as e:
            self._send_json(400, {'error': str(e)})
            return
        self._send_json(201, course)

    def _handle_create_post(self):
        payload, error = self._read_json_body()
        if error:
            self._send_json(*error)
            return

        errors = validate_post(payload)
        if errors:
            self._send_json(400, {'error': '; '.join(errors)})
            return

        posts = load_items(POSTS_PATH)
        uid = generate_uid({p['uid'] for p in posts})
        topics = [t.strip() for t in payload.get('topics', []) if isinstance(t, str) and t.strip()]
        post = {
            'uid': uid,
            'title': payload['title'].strip(),
            'date': payload['date'],
            'author': payload['author'].strip(),
            'topics': topics,
            'body': payload['body'].strip(),
            'created': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'),
        }
        posts.append(post)
        save_items(POSTS_PATH, posts)
        self._send_json(201, post)

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
    server = http.server.HTTPServer(('127.0.0.1', port), AdminRequestHandler)
    print('Serving %s with write access at http://localhost:%d/  (Ctrl+C to stop)'
          % (root, port))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
