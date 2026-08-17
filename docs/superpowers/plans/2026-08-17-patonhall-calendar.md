# Paton Hall Calendar — Admin Add-Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin who has cloned the repo add Calendar events through a local
write-capable server and a simple form, and have those events render live on the
public `calendar.html` agenda.

**Architecture:** Events live in one committed JSON file, `assets/data/events.json`.
A new stdlib-only `admin_server.py` serves the static site exactly like
`python3 -m http.server` plus one write endpoint, `POST /api/events`, used by a new
unlinked admin page (`admin-events.html`). `calendar.html` fetches the same JSON file
at runtime and renders a 14-day agenda with click-to-select event detail — computed
from the browser's clock on every load, since GitHub Pages has no backend to keep a
baked-in "today" current.

**Tech Stack:** Python 3 stdlib only (`http.server`, `json`, `secrets`, `datetime`,
`tempfile`, `unittest`) for the server and its tests. Vanilla ES5-compatible
JavaScript for the browser side, matching `assets/js/sketch.js`'s existing style. No
new dependencies, no bundler, no test framework beyond what Python already ships
with.

**Spec:** `docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`

## Global Constraints

- No new dependencies. Server-side: Python stdlib only. Client-side: vanilla JS, no
  framework, no build step.
- `assets/data/events.json` is the single source of truth: a plain JSON array,
  git-diffable, human-readable. It must end this plan as `[]` — no seed/migrated
  event (per spec §2, §9).
- The `location` field holds the A–I letter directly. There is no separate `space`
  field (per spec §2, §5).
- `admin_server.py` has no authentication — the trust boundary is "runs only on a
  machine belonging to someone who already has git push access" (per spec §3).
- Nothing may fake success. A write that didn't happen or a fetch that failed must
  show the real error, not a fake confirmation (per spec §4, §6).
- `calendar.js` must compute "today" from the browser's clock at every page load,
  never bake it at build time (per spec §6).
- The public "Book Space" nav link (`src/calendar.html`'s `cal__actions`) is
  untouched — stays a disabled placeholder (per spec §9).
- `python3 build.py --check` must pass after any `src/*.html` change.
- No test framework is introduced. Python's built-in `unittest` (already part of the
  standard library) covers the server-side logic; the browser-side pages are
  verified manually (per spec §8) — this repo has no JS test runner and adding one
  is out of scope.

---

### Task 1: Events data store and shared space list

Establishes the two static foundation files every later task reads from: the empty
events store and the shared A–I space list (so adding real names later is a
one-file edit, per spec §5).

**Files:**
- Create: `assets/data/events.json`
- Create: `assets/js/spaces.js`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `assets/data/events.json` (a JSON array, initially empty), read/written
  by Task 2/3's `load_events`/`save_events` and read by Task 5's `calendar.js`.
  `window.PATON_SPACES` (array of `{id, label}` for `"A"`..`"I"`, all labels `""`
  for now) and `window.PatonSpaceText(id)` (returns `id` alone, or `id + " — " +
  label` once a label exists), consumed by Task 4's `admin-events.js` and Task 5's
  `calendar.js`.

- [ ] **Step 1: Create the empty events store**

```json
[]
```

Save as `assets/data/events.json`.

- [ ] **Step 2: Create the shared space list**

```js
/* Shared A-I space list. Labels are blank until real one/two-word names are
   assigned; both admin-events.html and calendar.html read this same list,
   so adding names later is a one-file edit. */
window.PATON_SPACES = [
  { id: 'A', label: '' },
  { id: 'B', label: '' },
  { id: 'C', label: '' },
  { id: 'D', label: '' },
  { id: 'E', label: '' },
  { id: 'F', label: '' },
  { id: 'G', label: '' },
  { id: 'H', label: '' },
  { id: 'I', label: '' }
];

/* "A" alone until a label exists, then "A — <label>". */
window.PatonSpaceText = function (id) {
  var space = window.PATON_SPACES.filter(function (s) { return s.id === id; })[0];
  if (!space) return id;
  return space.label ? space.id + ' — ' + space.label : space.id;
};
```

Save as `assets/js/spaces.js`.

- [ ] **Step 3: Verify both files**

Run: `python3 -c "import json; assert json.load(open('assets/data/events.json')) == []"`
Expected: no output, exit code 0.

Open `assets/js/spaces.js` in a browser console (or `node --check assets/js/spaces.js`
if Node is installed) to confirm it parses with no syntax errors. There is nothing
to wire it into yet — Tasks 4 and 5 consume it.

- [ ] **Step 4: Commit**

```bash
git add assets/data/events.json assets/js/spaces.js
git commit -m "Add the events data store and shared A-I space list"
```

---

### Task 2: Server-side event logic (validation, uid, atomic file I/O)

The pure, testable core of the write server: turning a raw form payload into a
validated event record, and reading/writing `events.json` without ever leaving it
truncated. Built and unit-tested before any HTTP plumbing exists.

**Files:**
- Create: `admin_server.py`
- Create: `tests/__init__.py`
- Create: `tests/test_admin_server.py`

**Interfaces:**
- Consumes: nothing new (Python stdlib only).
- Produces (in `admin_server.py`): `VALID_LOCATIONS` (a `set` of `'A'`..`'I'`),
  `parse_iso(value) -> datetime | None`, `validate_event(payload: dict) -> list[str]`
  (empty list means valid), `generate_uid(existing_uids: set[str], now:
  datetime | None = None) -> str`, `load_events(path: str) -> list[dict]`,
  `save_events(path: str, events: list[dict]) -> None`. Consumed by Task 3's HTTP
  handler.

- [ ] **Step 1: Write the failing tests**

Create an empty `tests/__init__.py` first, so `unittest discover` reliably treats
`tests/` as a package and resolves the `import admin_server` below against the repo
root regardless of Python version:

```python
```

Save as `tests/__init__.py` (empty file).

```python
import os
import tempfile
import unittest
from datetime import datetime

import admin_server


class GenerateUidTests(unittest.TestCase):
    def test_format(self):
        uid = admin_server.generate_uid(set())
        self.assertRegex(uid, r'^\d{8}T\d{6}-[0-9a-f]{4}$')

    def test_avoids_collision(self):
        now = datetime(2026, 8, 17, 14, 30, 22)
        first = admin_server.generate_uid(set(), now=now)
        second = admin_server.generate_uid({first}, now=now)
        self.assertNotEqual(first, second)


class ValidateEventTests(unittest.TestCase):
    def valid_payload(self):
        return {
            'title': 'Build Night',
            'location': 'C',
            'start': '2026-09-01T18:00',
            'end': '2026-09-01T21:00',
            'allDay': False,
            'description': 'Open bench time.',
        }

    def test_valid_payload_has_no_errors(self):
        self.assertEqual(admin_server.validate_event(self.valid_payload()), [])

    def test_missing_title(self):
        payload = self.valid_payload()
        payload['title'] = '   '
        self.assertIn('title is required', admin_server.validate_event(payload))

    def test_bad_location(self):
        payload = self.valid_payload()
        payload['location'] = 'Z'
        self.assertIn('location must be one of A-I', admin_server.validate_event(payload))

    def test_end_before_start(self):
        payload = self.valid_payload()
        payload['start'] = '2026-09-01T21:00'
        payload['end'] = '2026-09-01T18:00'
        self.assertIn('end must not be before start', admin_server.validate_event(payload))

    def test_bad_date_format(self):
        payload = self.valid_payload()
        payload['start'] = 'not-a-date'
        self.assertIn('start must be a valid ISO 8601 date/time',
                       admin_server.validate_event(payload))


class SaveLoadEventsTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_events(path, [{'uid': 'x'}])
            self.assertEqual(admin_server.load_events(path), [{'uid': 'x'}])

    def test_load_missing_file_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'missing.json')
            self.assertEqual(admin_server.load_events(path), [])

    def test_save_is_atomic_no_leftover_tmp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_events(path, [])
            leftovers = [f for f in os.listdir(tmp) if f != 'events.json']
            self.assertEqual(leftovers, [])


if __name__ == '__main__':
    unittest.main()
```

Save as `tests/test_admin_server.py`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: `ModuleNotFoundError: No module named 'admin_server'` (the file doesn't
exist yet).

- [ ] **Step 3: Write the minimal implementation**

```python
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
```

Save as `admin_server.py` in the repo root.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: all 8 tests pass (`OK`).

- [ ] **Step 5: Commit**

```bash
git add admin_server.py tests/__init__.py tests/test_admin_server.py
git commit -m "Add validation, uid generation, and atomic file I/O for events"
```

---

### Task 3: Write server HTTP handler

Wires Task 2's pure functions into a running server: static file serving plus
`POST /api/events`. Verified manually — spinning up a real `HTTPServer` in a test
would be integration-test territory the spec explicitly doesn't ask for; a live
curl check is simpler and just as conclusive for a single-file dev tool.

**Files:**
- Modify: `admin_server.py` (append to the file created in Task 2)

**Interfaces:**
- Consumes: Task 2's `validate_event`, `generate_uid`, `load_events`, `save_events`.
- Produces: a running `POST /api/events` endpoint (request body: JSON with `title`,
  `location`, `allDay`, `start`, `end`, `description`; response: `201` with the
  created event JSON, or `400`/`404` with `{"error": "..."}`), consumed by Task 4's
  `admin-events.js` via `fetch`.

- [ ] **Step 1: Append the HTTP handler and entry point**

Add these imports to the top of `admin_server.py`, alongside the existing ones:

```python
import http.server
import sys
```

Then append to the end of `admin_server.py`:

```python
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
```

- [ ] **Step 2: Confirm the unit tests still pass**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: all 8 tests still pass — this step only added code after the functions
Task 2 already tested, so nothing here should regress them.

- [ ] **Step 3: Manually verify the running server**

Run: `python3 admin_server.py 8018` (a scratch port, so it doesn't collide with a
`python3 -m http.server 8017` you might already have running) and leave it running
in one terminal.

In another terminal:

```bash
curl -i http://localhost:8018/ | head -5
```
Expected: `HTTP/1.0 200 OK` and the site's HTML — confirms static serving still
works.

```bash
curl -i -X POST http://localhost:8018/api/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Event","location":"C","allDay":false,"start":"2026-09-01T18:00","end":"2026-09-01T21:00","description":"curl check"}'
```
Expected: `HTTP/1.0 201 Created` with a JSON body containing a `uid`. Then:

```bash
cat assets/data/events.json
```
Expected: the array now contains that one event.

```bash
curl -i -X POST http://localhost:8018/api/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"","location":"Z","allDay":false,"start":"bad","end":"bad"}'
```
Expected: `HTTP/1.0 400 Bad Request` with an `error` string mentioning all four
problems; `assets/data/events.json` unchanged (still just the one event from
above).

Stop the server (Ctrl+C), then reset the data file so this manual check doesn't
leak into the commit:

```bash
echo '[]' > assets/data/events.json
git diff assets/data/events.json
```
Expected: no diff (back to the Task 1 state).

- [ ] **Step 4: Commit**

```bash
git add admin_server.py
git commit -m "Add the POST /api/events handler and server entry point"
```

---

### Task 4: Admin add-event page

The unlinked form an admin uses to add events. Reuses the existing `.signup-form`
input/label/select styling wholesale (it isn't scoped to the dark subscribe panel —
only `.signup`'s own selectors are — so it drops in on a plain page with no new
grid/input CSS needed).

**Files:**
- Create: `src/admin-events.html`
- Create: `assets/js/admin-events.js`
- Modify: `assets/css/site.css` (extend `.signup-form` to style `textarea`; add a
  small `.form-status` style for the inline result message)

**Interfaces:**
- Consumes: Task 1's `window.PATON_SPACES` / `window.PatonSpaceText`; Task 3's
  `POST /api/events` endpoint.
- Produces: the built `admin-events.html` (not linked from the nav or consumed by
  any other task — reached by typing the URL directly on a local admin server).

- [ ] **Step 1: Extend the shared form CSS**

In `assets/css/site.css`, find:

```css
.signup-form input,
.signup-form select {
```

Change to:

```css
.signup-form input,
.signup-form select,
.signup-form textarea {
```

(The rest of that rule block — background, border, padding, etc. — is unchanged;
this just adds `textarea` to the same selector list so the admin form's
description field picks up matching styling.)

Then add this new block right after the existing `.signup .fineprint a { color:
#cfe0ee; }` rule, before the `/* --- Responsive stubs --- */` comment:

```css
/* --- Inline form result messages (admin add-event form) ------------------ */

.form-status {
  margin: 14px 0 0;
  font-family: var(--font-mono);
  font-size: 15px;
}

.form-status.is-error   { color: #c92a2a; }
.form-status.is-success { color: var(--green-7); }
```

- [ ] **Step 2: Create the page content**

```html
<!--
title: Add Event — Paton Hall (admin)
class: page-inner
desc: Internal tool for adding Calendar events. Requires admin_server.py running locally.
-->
  <main class="main">
    <h1 class="page-title">Add Event</h1>

    <p>Internal tool, not linked from the site. Only works when
    <code>admin_server.py</code> is running on this machine — submitting from the
    live site fails, on purpose, rather than pretend to save anything.</p>

    <hr class="rule">

    <form id="admin-form" class="signup-form">
      <div class="full">
        <label for="admin-title">Title</label>
        <input id="admin-title" type="text" name="title" required>
      </div>

      <div>
        <label for="admin-start-date">Start date</label>
        <input id="admin-start-date" type="date" name="startDate" required>
      </div>
      <div id="admin-start-time-row">
        <label for="admin-start-time">Start time</label>
        <input id="admin-start-time" type="time" name="startTime" required>
      </div>

      <div>
        <label for="admin-end-date">End date</label>
        <input id="admin-end-date" type="date" name="endDate" required>
      </div>
      <div id="admin-end-time-row">
        <label for="admin-end-time">End time</label>
        <input id="admin-end-time" type="time" name="endTime" required>
      </div>

      <div class="full">
        <label for="admin-allday">All day</label>
        <input id="admin-allday" type="checkbox" name="allDay">
      </div>

      <div class="full">
        <label for="admin-location">Location</label>
        <select id="admin-location" name="location" required></select>
      </div>

      <div class="full">
        <label for="admin-description">Description</label>
        <textarea id="admin-description" name="description" rows="4"></textarea>
      </div>

      <div class="full">
        <button type="submit">Save event</button>
      </div>
    </form>

    <p id="admin-status" class="form-status" role="status"></p>
  </main>

  <script src="assets/js/spaces.js" defer></script>
  <script src="assets/js/admin-events.js" defer></script>
```

Save as `src/admin-events.html`.

- [ ] **Step 3: Create the form handler script**

```js
/* Handles admin-events.html: populates the Location dropdown from the
   shared space list, toggles the time inputs for all-day events, and
   submits new events to admin_server.py's write endpoint. Never reports
   success it didn't get — a failed or unreachable request shows the real
   error, not a fake confirmation. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function populateLocations() {
    var select = byId('admin-location');
    window.PATON_SPACES.forEach(function (space) {
      var option = document.createElement('option');
      option.value = space.id;
      option.textContent = window.PatonSpaceText(space.id);
      select.appendChild(option);
    });
  }

  function toggleAllDay() {
    var allDay = byId('admin-allday').checked;
    byId('admin-start-time-row').style.display = allDay ? 'none' : '';
    byId('admin-end-time-row').style.display = allDay ? 'none' : '';
    byId('admin-start-time').required = !allDay;
    byId('admin-end-time').required = !allDay;
  }

  function isoFrom(dateVal, timeVal) {
    return dateVal + 'T' + timeVal;
  }

  function buildPayload() {
    var allDay = byId('admin-allday').checked;
    var startDate = byId('admin-start-date').value;
    var endDate = byId('admin-end-date').value || startDate;
    var start, end;
    if (allDay) {
      start = isoFrom(startDate, '00:00');
      end = isoFrom(endDate, '23:59');
    } else {
      start = isoFrom(startDate, byId('admin-start-time').value);
      end = isoFrom(endDate, byId('admin-end-time').value);
    }
    return {
      title: byId('admin-title').value,
      location: byId('admin-location').value,
      allDay: allDay,
      start: start,
      end: end,
      description: byId('admin-description').value
    };
  }

  function setStatus(message, kind) {
    var status = byId('admin-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Saving…', '');

    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPayload())
    }).then(function (response) {
      return response.json().then(function (body) {
        return { ok: response.ok, body: body };
      });
    }).then(function (result) {
      if (result.ok) {
        setStatus('Saved: ' + result.body.title + ' (' + result.body.uid + ')', 'success');
        byId('admin-form').reset();
        toggleAllDay();
      } else {
        setStatus('Not saved: ' + result.body.error, 'error');
      }
    }).catch(function () {
      setStatus('Could not reach the local write server. Run "python3 admin_server.py" and try again.', 'error');
    });
  }

  function init() {
    populateLocations();
    toggleAllDay();
    byId('admin-allday').addEventListener('change', toggleAllDay);
    byId('admin-form').addEventListener('submit', onSubmit);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Save as `assets/js/admin-events.js`.

- [ ] **Step 4: Build and verify `--check` passes**

Run: `python3 build.py`
Expected: output lists `admin-events.html` as newly written (plus `calendar.html`
untouched at this point — that's Task 5).

Run: `python3 build.py --check`
Expected: `up to date (15 pages)`.

- [ ] **Step 5: Manually verify in a browser**

With `python3 admin_server.py 8018` running (from Task 3, or start it again):

1. Open `http://localhost:8018/admin-events.html`. Confirm the Location dropdown
   shows options A through I.
2. Submit a valid event (any title, a space, a date/time range). Confirm the status
   message shows "Saved: ... (uid)" and the form clears.
3. Check `curl -s http://localhost:8018/../assets/data/events.json` or just open
   `assets/data/events.json` in an editor — confirm the event is there.
4. Check the **All day** box, confirm the time fields hide, submit, and confirm in
   `events.json` that `start` ends in `T00:00` and `end` ends in `T23:59`.
5. Leave Title empty and submit. Confirm an inline "Not saved: title is required"
   message appears (server-side validation — nothing client-side blocks it, by
   design, so the error path is genuinely exercised).
6. Stop `admin_server.py` (Ctrl+C) and submit again. Confirm the "Could not reach
   the local write server" message appears.

Leave the two or three test events in `assets/data/events.json` for now — Task 5
needs sample data to verify the agenda against. It gets reset to `[]` at the end of
Task 5.

- [ ] **Step 6: Commit**

```bash
git add src/admin-events.html assets/js/admin-events.js assets/css/site.css admin-events.html
git commit -m "Add the admin add-event page and its form handler"
```

(`assets/data/events.json` is deliberately left uncommitted here — it still has
Step 5's manual test events in it, cleaned up in Task 5.)

---

### Task 5: Live Calendar agenda rendering

Replaces `calendar.html`'s hardcoded sample agenda with a live render from
`events.json`: a 14-day window, click-to-select detail, and an honest fallback if
the fetch fails or JS never runs.

**Files:**
- Modify: `src/calendar.html`
- Create: `assets/js/calendar.js`
- Modify: `assets/css/site.css` (drop the now-unused `.is-empty` rule, add
  `.cal__empty` and a pointer/hover style for clickable agenda rows)

**Interfaces:**
- Consumes: Task 1's `window.PATON_SPACES` / `window.PatonSpaceText`;
  `assets/data/events.json` as written by Tasks 3/4's flow.
- Produces: the built `calendar.html` with `#cal-agenda`, `#cal-detail`, and
  `#cal-today` render targets, and `assets/js/calendar.js`. Not consumed by any
  other task.

- [ ] **Step 1: Update the Calendar CSS**

In `assets/css/site.css`, remove this now-dead rule (nothing will carry the
`is-empty` class once rendering is dynamic — the static filler rows it targeted are
gone):

```css
.cal__events li.is-empty { color: transparent; }
```

In its place, add:

```css
.cal__events li { cursor: pointer; }
.cal__events li:hover,
.cal__events li:focus-visible { background: #f1f3f1; outline: none; }

.cal__empty {
  font-family: var(--font-mono);
  font-size: 15px;
  color: #55524d;
}
```

- [ ] **Step 2: Replace the static agenda markup**

Replace the entire content of `src/calendar.html` with:

```html
<!--
title: Calendar — Paton Hall
nav: calendar
class: page-calendar
desc: What is on at Paton Hall — courses, build nights, talks and bookings.
-->
  <!-- Agenda view, rendered from assets/data/events.json by calendar.js. View
       switching, space booking and sign-in are a separate piece of work; those
       controls stay inert placeholders. -->
  <div class="cal">

    <header class="cal__bar">
      <div class="cal__actions">
        <a href="#" aria-disabled="true">Book Space</a><!-- TODO: Calendar app -->
        <a href="#" aria-disabled="true">Logout</a><!-- TODO: Calendar app -->
      </div>
      <div class="cal__views">
        <a href="#" class="is-current" aria-current="page">Agenda</a>
        <a href="#" aria-disabled="true">3-Day</a>
        <a href="#" aria-disabled="true">Week</a>
        <a href="#" aria-disabled="true">Month</a>
      </div>
      <div class="cal__today" id="cal-today">Tuesday October 20th 2026 <span aria-hidden="true">☀</span></div>
    </header>

    <div class="cal__body">
      <section class="cal__agenda" id="cal-agenda">
        <p class="cal__empty">Loading&hellip;</p>
      </section>

      <section class="cal__detail" id="cal-detail">
        <p class="cal__empty">Select an event to see its details.</p>
      </section>
    </div>

  </div>

  <script src="assets/js/spaces.js" defer></script>
  <script src="assets/js/calendar.js" defer></script>
```

This keeps the public "Book Space" line byte-for-byte identical to what it was
(same `href="#"`, same `aria-disabled="true"`, same TODO comment) — untouched per
the Global Constraints.

- [ ] **Step 3: Create the rendering script**

```js
/* Renders the Calendar's agenda + detail pane from assets/data/events.json.
   Computed from the browser's clock at every load — a build-time bake
   can't keep "today" current without a rebuild+deploy every single day.
   Never shows stale or fabricated data: a fetch failure or disabled JS
   shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var WINDOW_DAYS = 14;
  var DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                      'August', 'September', 'October', 'November', 'December'];

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function dayKey(date) {
    return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
  }

  function dayHeading(date) {
    return DAY_NAMES[date.getDay()] + ' ' + MONTH_NAMES[date.getMonth()] + ' ' + date.getDate();
  }

  function ordinal(n) {
    var suffixes = ['th', 'st', 'nd', 'rd'];
    var v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  function formatTime(date) {
    var hours = date.getHours();
    var minutes = date.getMinutes();
    var period = hours >= 12 ? 'pm' : 'am';
    var h = hours % 12;
    if (h === 0) h = 12;
    var m = minutes < 10 ? '0' + minutes : String(minutes);
    return minutes === 0 ? h + period : h + ':' + m + period;
  }

  function timeRange(event) {
    if (event.allDay) return 'All day';
    return formatTime(new Date(event.start)) + '–' + formatTime(new Date(event.end));
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function spaceText(id) {
    return window.PatonSpaceText ? window.PatonSpaceText(id) : id;
  }

  function updateTodayHeading() {
    var heading = document.getElementById('cal-today');
    if (!heading) return;
    var today = new Date();
    var sun = heading.querySelector('span');
    heading.textContent = DAY_NAMES[today.getDay()] + ' ' + MONTH_NAMES[today.getMonth()]
      + ' ' + ordinal(today.getDate()) + ' ' + today.getFullYear() + ' ';
    if (sun) heading.appendChild(sun);
  }

  function renderDetail(container, event) {
    container.innerHTML = '';
    if (!event) {
      container.appendChild(el('p', 'cal__empty', 'Select an event to see its details.'));
      return;
    }

    container.appendChild(el('h2', 'cal__detail-title', event.title));
    container.appendChild(el('p', '', timeRange(event)));

    var location = el('p', '', null);
    var locationLabel = el('span', 'cal__label', 'Location: ');
    location.appendChild(locationLabel);
    location.appendChild(document.createTextNode(spaceText(event.location)));
    container.appendChild(location);

    if (event.description) {
      container.appendChild(el('p', '', null));
      container.lastChild.appendChild(el('span', 'cal__label', 'Description:'));
      container.appendChild(el('p', '', event.description));
    }
  }

  function renderAgenda(agendaEl, detailEl, days) {
    agendaEl.innerHTML = '';
    var hasAny = false;

    days.forEach(function (day) {
      if (!day.events.length) return;
      hasAny = true;

      agendaEl.appendChild(el('h2', 'cal__day', dayHeading(day.date)));
      var list = el('ul', 'cal__events', null);

      day.events.forEach(function (event) {
        var item = document.createElement('li');
        item.tabIndex = 0;
        item.textContent = timeRange(event) + ' — ' + event.title;
        item.addEventListener('click', function () { renderDetail(detailEl, event); });
        item.addEventListener('keydown', function (evt) {
          if (evt.key === 'Enter' || evt.key === ' ') renderDetail(detailEl, event);
        });
        list.appendChild(item);
      });

      agendaEl.appendChild(list);
    });

    if (!hasAny) {
      agendaEl.appendChild(el('p', 'cal__empty',
        'Nothing on the calendar for the next ' + WINDOW_DAYS + ' days.'));
    }
  }

  function bucketEvents(events, today) {
    var windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

    var byDay = {};
    var days = [];
    for (var i = 0; i < WINDOW_DAYS; i++) {
      var date = new Date(today);
      date.setDate(date.getDate() + i);
      var key = dayKey(date);
      byDay[key] = { date: date, events: [] };
      days.push(byDay[key]);
    }

    events.forEach(function (event) {
      var start = new Date(event.start);
      if (start < today || start >= windowEnd) return;
      var bucket = byDay[dayKey(startOfDay(start))];
      if (bucket) bucket.events.push(event);
    });

    days.forEach(function (day) {
      day.events.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    });

    return days;
  }

  function init() {
    var agendaEl = document.getElementById('cal-agenda');
    var detailEl = document.getElementById('cal-detail');
    if (!agendaEl || !detailEl) return;

    updateTodayHeading();

    fetch('assets/data/events.json')
      .then(function (response) {
        if (!response.ok) throw new Error('bad response');
        return response.json();
      })
      .then(function (events) {
        var today = startOfDay(new Date());
        renderAgenda(agendaEl, detailEl, bucketEvents(events, today));
        renderDetail(detailEl, null);
      })
      .catch(function () {
        agendaEl.innerHTML = '';
        agendaEl.appendChild(el('p', 'cal__empty', 'Calendar unavailable.'));
        renderDetail(detailEl, null);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Save as `assets/js/calendar.js`.

- [ ] **Step 4: Build and verify `--check` passes**

Run: `python3 build.py && python3 build.py --check`
Expected: `up to date (15 pages)`.

- [ ] **Step 5: Manually verify in a browser**

Start (or reuse) `python3 admin_server.py 8018`. Through `admin-events.html`, add:

- one event starting later today
- one all-day event tomorrow
- one event 20 days from today (outside the 14-day window)

Open `http://localhost:8018/calendar.html` and confirm:

1. `.cal__today` shows the real current date, not "Tuesday October 20th 2026".
2. Today's and tomorrow's events appear, correctly grouped under day headings;
   the all-day event shows "All day" instead of a time range.
3. The 20-days-out event does **not** appear anywhere.
4. Clicking an agenda entry populates the right-hand detail pane with its title,
   time, location (as "A" — no label yet), and description; nothing is selected by
   default on page load.
5. Rename `assets/data/events.json` temporarily (e.g. to `events.json.bak`), reload
   the page, and confirm the agenda shows "Calendar unavailable" rather than a blank
   or broken layout. Rename it back afterward.

- [ ] **Step 6: Reset the events data file**

The manual verification in this task and Task 4 left test events in
`assets/data/events.json`. The spec requires it to start empty:

```bash
echo '[]' > assets/data/events.json
git diff assets/data/events.json
```
Expected: no diff against Task 1's committed version.

- [ ] **Step 7: Commit**

```bash
python3 build.py
git add src/calendar.html calendar.html assets/js/calendar.js assets/css/site.css
git commit -m "Render the Calendar agenda and detail pane live from events.json"
```

---

### Task 6: Documentation

Brings `README.md` up to date with the new local workflow and files, and does the
final end-to-end build verification.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: every file created in Tasks 1–5, for accuracy.
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Update "Running locally"**

In `README.md`, after:

```
Then open <http://localhost:8017>.
```

add:

```markdown

To add Calendar events, run `python3 admin_server.py` instead of the plain
`http.server` command above — it serves the site identically, plus a local write
endpoint at `/api/events` that `admin-events.html` (unlinked; visit it directly)
uses to append to `assets/data/events.json`. Nobody else's workflow changes —
anyone not adding events keeps using plain `http.server`.
```

- [ ] **Step 2: Add rows to the Structure table**

In the `## Structure` table, after the `assets/js/sketch.js` row, add:

```markdown
| `admin_server.py` | Local write-capable dev server — static files plus `POST /api/events` |
| `assets/data/events.json` | Calendar events; written by `admin_server.py`, read at runtime by `calendar.html` |
| `assets/js/spaces.js` | Shared A–I space list, used by the admin form and the Calendar |
| `assets/js/calendar.js` | Renders the Calendar's agenda and detail pane from `events.json` |
| `assets/js/admin-events.js` | Handles `admin-events.html`'s form and its `POST /api/events` submission |
| `tests/test_admin_server.py` | Unit tests for `admin_server.py`'s validation, uid generation, and file I/O |
```

- [ ] **Step 3: Update the Scope section**

Replace:

```markdown
- **Calendar** renders the agenda view. View switching (3-Day/Week/Month),
  space booking and sign-in are inert placeholders.
```

with:

```markdown
- **Calendar** renders a live 14-day agenda from `assets/data/events.json`, with
  click-to-select event detail. Adding events requires running `admin_server.py`
  locally (see Running locally); there is no public booking flow yet. View
  switching (3-Day/Week/Month), space booking and sign-in are still inert
  placeholders.
```

- [ ] **Step 4: Update the Open items section**

Replace:

```markdown
- **Calendar application** — view switching, booking and sign-in.
```

with:

```markdown
- **Calendar application** — view switching, booking and sign-in. Adding events
  and viewing the live agenda are built; see
  `docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`.
```

And replace:

```markdown
- **Status bar** — shows what is on at the hub and opens the Calendar when
  clicked. The event text is static for now; it becomes data-driven when the
  Calendar is built.
```

with:

```markdown
- **Status bar** — shows what is on at the hub and opens the Calendar when
  clicked. The event text is still static; wiring it to
  `assets/data/events.json` is future work, separate from the Calendar agenda
  itself.
```

- [ ] **Step 5: Final verification**

```bash
python3 build.py --check
python3 -m unittest discover -s tests -t . -v
python3 -c "import json; assert json.load(open('assets/data/events.json')) == []"
git status
```

Expected: `up to date (15 pages)`; all unit tests pass; no assertion error; `git
status` shows only `README.md` unstaged (everything else already committed in
Tasks 1–5).

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "Document the admin_server.py write path and Calendar data files"
```
