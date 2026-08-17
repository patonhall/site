# Training Course Listing & Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Training's static reference table with a live, admin-created
course list (Title/Dates/Cost/registration status), a category filter on the
public page (ALL by default), and an unlinked admin course-creation page —
extending the Calendar's existing `admin_server.py` rather than duplicating it.

**Architecture:** Two new JSON data files (`courses.json`, `course-categories.json`)
alongside the Calendar's `events.json`. `admin_server.py` gains a second write
endpoint, `POST /api/courses`, built on the same validate → assign uid → atomic
write pattern as `POST /api/events`; its generic file-I/O helpers are renamed
from `load_events`/`save_events` to `load_items`/`save_items` since they're
about to serve two different resources. `training.html` fetches both JSON
files at runtime and renders a filterable table client-side — courses whose
`endDate` has passed are excluded, so the public page never shows a stale
schedule.

**Tech Stack:** Python 3 stdlib only (extends the existing `admin_server.py`;
no new dependencies). Vanilla ES5-compatible JavaScript, matching
`assets/js/calendar.js`'s existing style. No new test framework — Python's
stdlib `unittest` (already in use) gains more cases in the existing
`tests/test_admin_server.py`.

**Spec:** `docs/superpowers/specs/2026-08-17-patonhall-training-design.md`

## Global Constraints

- No new dependencies. Server-side: Python stdlib only. Client-side: vanilla
  JS, no framework, no build step.
- `assets/data/courses.json` ends this plan as `[]` — no seed/migrated data.
  `assets/data/course-categories.json` ends this plan seeded with exactly
  `["EPTAC (Electronics Specialists)", "Linux Servers & Systems", "Microcontrollers"]`
  — the three names already in the static sidebar today.
- `admin_server.py` is extended, never duplicated. `load_events`/`save_events`
  are renamed to `load_items`/`save_items` (both the existing event call site
  and the new course/category call sites use the renamed functions) — they
  were already generic JSON-list I/O, only the names were event-specific.
  `generate_uid` is reused as-is for courses; it was never event-specific in
  its implementation.
- `category`/`newCategory` precedence: if a course payload's `newCategory` is
  a non-empty string, the server creates that category (if it doesn't already
  exist in `course-categories.json`) and uses it, taking priority over
  whatever is in `category` — the server does not trust the client to send
  only one of the two.
- `registrationMode` is exactly `"capacity"` or `"door"`. In `"capacity"`
  mode, `seatsTotal` (positive integer) and `seatsFilled` (`0 ≤ seatsFilled ≤
  seatsTotal`) are required. In `"door"` mode neither is required.
- No authentication on `admin_server.py` — same trust boundary as the
  Calendar: only runs on a machine belonging to someone who already has git
  push access to the whole repo.
- Nothing may fake success. A write that didn't happen or a fetch that failed
  must show the real error, not a fake confirmation (same rule
  `admin-events.js` already follows).
- `training.html`'s course list is fetched and rendered client-side at every
  page load, never baked at build time, and excludes any course whose
  `endDate` has already passed — a "what's coming up" list that includes
  finished courses misrepresents the schedule.
- Creation-only: no edit/delete UI for courses or categories. Updating
  `seatsFilled` over time means hand-editing `courses.json`, the same escape
  hatch the Calendar spec already blesses for `events.json`.
- No per-course detail pages or links in this pass. `course-ipc-a-610.html`
  stays on disk untouched, simply unlinked from the new table.
- `python3 build.py --check` must pass after any `src/*.html` change.

---

### Task 1: Course data store and category list

Establishes the two static foundation files Tasks 2–5 read from and write to.

**Files:**
- Create: `assets/data/courses.json`
- Create: `assets/data/course-categories.json`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `assets/data/courses.json` (JSON array, initially empty) and
  `assets/data/course-categories.json` (JSON array of strings, seeded with 3
  names) — both read/written by Task 3's `load_items`/`save_items` at
  `COURSES_PATH`/`CATEGORIES_PATH`, and read by Task 5's `courses.js`.

- [ ] **Step 1: Create the empty course store**

```json
[]
```

Save as `assets/data/courses.json`.

- [ ] **Step 2: Create the seeded category list**

```json
["EPTAC (Electronics Specialists)", "Linux Servers & Systems", "Microcontrollers"]
```

Save as `assets/data/course-categories.json`.

- [ ] **Step 3: Verify both files**

Run: `python3 -c "import json; assert json.load(open('assets/data/courses.json')) == []"`
Run: `python3 -c "import json; cats = json.load(open('assets/data/course-categories.json')); assert cats == ['EPTAC (Electronics Specialists)', 'Linux Servers & Systems', 'Microcontrollers']"`
Expected: no output, exit code 0, for both.

- [ ] **Step 4: Commit**

```bash
git add assets/data/courses.json assets/data/course-categories.json
git commit -m "Add the course data store and seeded category list"
```

---

### Task 2: Server-side course logic (rename, validate_course, tests)

Renames the Calendar's generic-but-event-named file-I/O helpers so courses can
reuse them, then adds course validation with the same TDD rigor as the
Calendar's `validate_event`. Pure logic only — no HTTP handler yet (Task 3).

**Files:**
- Modify: `admin_server.py`
- Modify: `tests/test_admin_server.py`

**Interfaces:**
- Consumes: nothing new.
- Produces (in `admin_server.py`): `load_items(path) -> list`,
  `save_items(path, items) -> None` (renamed from `load_events`/`save_events`;
  same signatures and behavior, generic name), `VALID_REGISTRATION_MODES`
  (`{'capacity', 'door'}`), `parse_date(value) -> datetime | None` (parses
  `YYYY-MM-DD`), `validate_course(payload: dict) -> list[str]` (empty list
  means valid). Consumed by Task 3's HTTP handler.

- [ ] **Step 1: Rename the file-I/O helpers**

In `admin_server.py`, find:

```python
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

Replace with:

```python
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
```

Then find the event-handling call sites later in the same file (inside
`do_POST`):

```python
        events = load_events(EVENTS_PATH)
        uid = generate_uid({e['uid'] for e in events})
```

Replace with:

```python
        events = load_items(EVENTS_PATH)
        uid = generate_uid({e['uid'] for e in events})
```

And find:

```python
        events.append(event)
        save_events(EVENTS_PATH, events)
        self._send_json(201, event)
```

Replace with:

```python
        events.append(event)
        save_items(EVENTS_PATH, events)
        self._send_json(201, event)
```

- [ ] **Step 2: Update the existing tests for the renamed functions**

In `tests/test_admin_server.py`, find:

```python
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
```

Replace with:

```python
class SaveLoadItemsTests(unittest.TestCase):
    def test_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_items(path, [{'uid': 'x'}])
            self.assertEqual(admin_server.load_items(path), [{'uid': 'x'}])

    def test_load_missing_file_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'missing.json')
            self.assertEqual(admin_server.load_items(path), [])

    def test_save_is_atomic_no_leftover_tmp_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'events.json')
            admin_server.save_items(path, [])
            leftovers = [f for f in os.listdir(tmp) if f != 'events.json']
            self.assertEqual(leftovers, [])
```

- [ ] **Step 3: Run the tests to confirm the rename didn't break anything**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: all 10 existing tests still pass (`OK`) — this step is a pure
rename, nothing here should change behavior.

- [ ] **Step 4: Write the failing tests for `validate_course`**

Append to `tests/test_admin_server.py` (after the `SaveLoadItemsTests` class,
before the `if __name__ == '__main__':` line):

```python
class ValidateCourseTests(unittest.TestCase):
    def valid_payload(self):
        return {
            'title': 'IPC-A-610 Specialist',
            'category': 'EPTAC (Electronics Specialists)',
            'startDate': '2026-10-20',
            'endDate': '2026-10-23',
            'cost': '$500',
            'registrationMode': 'capacity',
            'seatsTotal': 26,
            'seatsFilled': 22,
        }

    def test_valid_capacity_payload_has_no_errors(self):
        self.assertEqual(admin_server.validate_course(self.valid_payload()), [])

    def test_valid_door_payload_has_no_errors(self):
        payload = self.valid_payload()
        payload['registrationMode'] = 'door'
        del payload['seatsTotal']
        del payload['seatsFilled']
        self.assertEqual(admin_server.validate_course(payload), [])

    def test_missing_title(self):
        payload = self.valid_payload()
        payload['title'] = '   '
        self.assertIn('title is required', admin_server.validate_course(payload))

    def test_missing_category_and_no_new_category(self):
        payload = self.valid_payload()
        payload['category'] = ''
        self.assertIn('category is required', admin_server.validate_course(payload))

    def test_missing_category_but_new_category_present_is_valid(self):
        payload = self.valid_payload()
        payload['category'] = ''
        payload['newCategory'] = 'Woodworking'
        self.assertEqual(admin_server.validate_course(payload), [])

    def test_end_before_start(self):
        payload = self.valid_payload()
        payload['startDate'] = '2026-10-23'
        payload['endDate'] = '2026-10-20'
        self.assertIn('endDate must not be before startDate',
                       admin_server.validate_course(payload))

    def test_bad_date_format(self):
        payload = self.valid_payload()
        payload['startDate'] = 'not-a-date'
        self.assertIn('startDate must be a valid date (YYYY-MM-DD)',
                       admin_server.validate_course(payload))

    def test_missing_cost(self):
        payload = self.valid_payload()
        payload['cost'] = ''
        self.assertIn('cost is required', admin_server.validate_course(payload))

    def test_bad_registration_mode(self):
        payload = self.valid_payload()
        payload['registrationMode'] = 'whenever'
        self.assertIn('registrationMode must be "capacity" or "door"',
                       admin_server.validate_course(payload))

    def test_capacity_mode_requires_positive_seats_total(self):
        payload = self.valid_payload()
        payload['seatsTotal'] = 0
        self.assertIn('seatsTotal must be a positive integer',
                       admin_server.validate_course(payload))

    def test_capacity_mode_seats_filled_cannot_exceed_total(self):
        payload = self.valid_payload()
        payload['seatsFilled'] = 30
        self.assertIn('seatsFilled must not exceed seatsTotal',
                       admin_server.validate_course(payload))
```

- [ ] **Step 5: Run the tests to verify the new ones fail**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: the 10 renamed tests still pass; the 11 new `ValidateCourseTests`
fail with `AttributeError: module 'admin_server' has no attribute
'validate_course'`.

- [ ] **Step 6: Implement `validate_course`**

In `admin_server.py`, find:

```python
def generate_uid(existing_uids, now=None):
```

Insert immediately before it:

```python
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

```

(The blank line at the end keeps a clean separation before `generate_uid`.)

- [ ] **Step 7: Run the tests to verify everything passes**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: 21 tests total, all pass (`OK`).

- [ ] **Step 8: Commit**

```bash
git add admin_server.py tests/test_admin_server.py
git commit -m "Rename event I/O helpers to be generic and add course validation"
```

---

### Task 3: `POST /api/courses` handler and category creation

Wires Task 2's `validate_course` into a running endpoint, alongside a
refactored (but behaviorally identical) event handler, plus the
`newCategory` creation flow.

**Files:**
- Modify: `admin_server.py`

**Interfaces:**
- Consumes: Task 2's `load_items`, `save_items`, `validate_course`,
  `VALID_REGISTRATION_MODES`; the existing `validate_event`, `generate_uid`.
- Produces: `POST /api/courses` (request body: JSON with `title`, `category`
  and/or `newCategory`, `startDate`, `endDate`, `cost`, `registrationMode`,
  and — in capacity mode — `seatsTotal`/`seatsFilled`; response: `201` with
  the created course JSON, or `400`/`404` with `{"error": "..."}`), consumed
  by Task 4's `admin-courses.js`. `POST /api/events`'s behavior and response
  contract are unchanged — this task only restructures its implementation.

- [ ] **Step 1: Replace the path constant and do_POST method**

In `admin_server.py`, find:

```python
EVENTS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                            'assets', 'data', 'events.json')
```

Replace with:

```python
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'assets', 'data')
EVENTS_PATH = os.path.join(DATA_DIR, 'events.json')
COURSES_PATH = os.path.join(DATA_DIR, 'courses.json')
CATEGORIES_PATH = os.path.join(DATA_DIR, 'course-categories.json')
```

Then find the entire `do_POST` method:

```python
    def do_POST(self):
        if self.path != '/api/events':
            self._send_json(404, {'error': 'not found'})
            return

        length = int(self.headers.get('Content-Length', 0))
        raw = self.rfile.read(length) if length else b''
        try:
            payload = json.loads(raw.decode('utf-8'))
        except (ValueError, UnicodeDecodeError):
            self._send_json(400, {'error': 'request body must be valid JSON'})
            return

        if not isinstance(payload, dict):
            self._send_json(400, {'error': 'request body must be a JSON object'})
            return

        errors = validate_event(payload)
        if errors:
            self._send_json(400, {'error': '; '.join(errors)})
            return

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
        self._send_json(201, event)
```

Replace with:

```python
    def do_POST(self):
        if self.path == '/api/events':
            self._handle_create_event()
        elif self.path == '/api/courses':
            self._handle_create_course()
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

        errors = validate_event(payload)
        if errors:
            self._send_json(400, {'error': '; '.join(errors)})
            return

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
        self._send_json(201, event)

    def _handle_create_course(self):
        payload, error = self._read_json_body()
        if error:
            self._send_json(*error)
            return

        errors = validate_course(payload)
        if errors:
            self._send_json(400, {'error': '; '.join(errors)})
            return

        new_category = payload.get('newCategory', '')
        if isinstance(new_category, str) and new_category.strip():
            category = new_category.strip()
            categories = load_items(CATEGORIES_PATH)
            if category not in categories:
                categories.append(category)
                save_items(CATEGORIES_PATH, categories)
        else:
            category = payload['category'].strip()

        courses = load_items(COURSES_PATH)
        uid = generate_uid({c['uid'] for c in courses})
        course = {
            'uid': uid,
            'title': payload['title'].strip(),
            'category': category,
            'startDate': payload['startDate'],
            'endDate': payload['endDate'],
            'cost': payload['cost'].strip(),
            'registrationMode': payload['registrationMode'],
            'created': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%S'),
        }
        if payload['registrationMode'] == 'capacity':
            course['seatsTotal'] = payload['seatsTotal']
            course['seatsFilled'] = payload['seatsFilled']

        courses.append(course)
        save_items(COURSES_PATH, courses)
        self._send_json(201, course)
```

- [ ] **Step 2: Confirm the unit tests still pass**

Run: `python3 -m unittest discover -s tests -t . -v`
Expected: all 21 tests still pass — this step only restructured HTTP
plumbing around functions Task 2 already tested.

- [ ] **Step 3: Manually verify the running server**

Run: `python3 admin_server.py 8018` (a scratch port) and leave it running in
one terminal. In another terminal:

```bash
curl -i http://localhost:8018/ | head -5
```
Expected: `HTTP/1.0 200 OK` and the site's HTML — confirms the `do_POST`
refactor didn't disturb GET/static serving.

```bash
curl -i -X POST http://localhost:8018/api/events \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Event","location":"C","allDay":false,"start":"2026-09-01T18:00","end":"2026-09-01T21:00","description":"regression check"}'
```
Expected: `HTTP/1.0 201 Created` with a JSON body containing a `uid` —
confirms `POST /api/events` still behaves identically after the refactor.

```bash
curl -i -X POST http://localhost:8018/api/courses \
  -H 'Content-Type: application/json' \
  -d '{"title":"Test Course","category":"EPTAC (Electronics Specialists)","startDate":"2026-11-01","endDate":"2026-11-04","cost":"$500","registrationMode":"capacity","seatsTotal":20,"seatsFilled":5}'
```
Expected: `HTTP/1.0 201 Created` with a JSON body containing a `uid`. Then:

```bash
cat assets/data/courses.json
```
Expected: the array now contains that one course.

```bash
curl -i -X POST http://localhost:8018/api/courses \
  -H 'Content-Type: application/json' \
  -d '{"title":"Woodworking Night","newCategory":"Woodworking","startDate":"2026-11-10","endDate":"2026-11-10","cost":"Free","registrationMode":"door"}'
```
Expected: `HTTP/1.0 201 Created`. Then:

```bash
cat assets/data/course-categories.json
```
Expected: the array now includes `"Woodworking"` alongside the original 3
names.

```bash
curl -i -X POST http://localhost:8018/api/courses \
  -H 'Content-Type: application/json' \
  -d '{"title":"","category":"","startDate":"bad","endDate":"bad","cost":"","registrationMode":"whenever"}'
```
Expected: `HTTP/1.0 400 Bad Request` with an `error` string listing all the
problems; `assets/data/courses.json` and `course-categories.json` unchanged
from the previous checks.

Stop the server (Ctrl+C), then reset both data files so this manual check
doesn't leak into the commit:

```bash
echo '[]' > assets/data/events.json
echo '[]' > assets/data/courses.json
echo '["EPTAC (Electronics Specialists)", "Linux Servers & Systems", "Microcontrollers"]' > assets/data/course-categories.json
git diff assets/data/events.json assets/data/courses.json assets/data/course-categories.json
```
Expected: no diff.

- [ ] **Step 4: Commit**

```bash
git add admin_server.py
git commit -m "Add the POST /api/courses handler and new-category creation"
```

---

### Task 4: Admin course-creation page

The unlinked form an admin uses to add courses. Reuses `.signup-form` and the
`.page-inner` contrast/checkbox overrides already added during the Calendar
work — no new CSS is needed.

**Files:**
- Create: `src/admin-courses.html`
- Create: `assets/js/admin-courses.js`

**Interfaces:**
- Consumes: Task 3's `POST /api/courses` endpoint; `assets/data/course-categories.json` (fetched at runtime, not baked in — unlike the Calendar's static `spaces.js`, this list grows at runtime via `newCategory`).
- Produces: the built `admin-courses.html` (not linked from the nav or
  consumed by any other task — reached by typing the URL directly on a local
  admin server).

- [ ] **Step 1: Create the page content**

```html
<!--
title: Add Course — Paton Hall (admin)
class: page-inner
desc: Internal tool for adding Training courses. Requires admin_server.py running locally.
-->
  <main class="main">
    <h1 class="page-title">Add Course</h1>

    <p>Internal tool, not linked from the site. Only works when
    <code>admin_server.py</code> is running on this machine — submitting from the
    live site fails, on purpose, rather than pretend to save anything.</p>

    <hr class="rule">

    <form id="course-form" class="signup-form">
      <div class="full">
        <label for="course-title">Title</label>
        <input id="course-title" type="text" name="title" required>
      </div>

      <div>
        <label for="course-category">Category</label>
        <select id="course-category" name="category"></select>
      </div>
      <div>
        <label for="course-new-category">Or add a new category</label>
        <input id="course-new-category" type="text" name="newCategory">
      </div>

      <div>
        <label for="course-start-date">Start date</label>
        <input id="course-start-date" type="date" name="startDate" required>
      </div>
      <div>
        <label for="course-end-date">End date</label>
        <input id="course-end-date" type="date" name="endDate" required>
      </div>

      <div>
        <label for="course-cost">Cost</label>
        <input id="course-cost" type="text" name="cost" placeholder="$500" required>
      </div>
      <div>
        <label for="course-registration-mode">Registration</label>
        <select id="course-registration-mode" name="registrationMode">
          <option value="capacity">Capacity-tracked</option>
          <option value="door">Register at door</option>
        </select>
      </div>

      <div id="course-seats-total-row">
        <label for="course-seats-total">Total seats</label>
        <input id="course-seats-total" type="number" name="seatsTotal" min="1" step="1">
      </div>
      <div id="course-seats-filled-row">
        <label for="course-seats-filled">Filled seats</label>
        <input id="course-seats-filled" type="number" name="seatsFilled" min="0" step="1">
      </div>

      <div class="full">
        <button type="submit">Save course</button>
      </div>
    </form>

    <p id="course-status" class="form-status" role="status"></p>
  </main>

  <script src="assets/js/admin-courses.js" defer></script>
```

Save as `src/admin-courses.html`.

- [ ] **Step 2: Create the form handler script**

```js
/* Handles admin-courses.html: populates the Category dropdown from
   course-categories.json, toggles the seat-count fields for capacity-mode
   registration, and submits new courses to admin_server.py's write
   endpoint. Never reports success it didn't get. */
(function () {
  'use strict';

  function byId(id) { return document.getElementById(id); }

  function populateCategories(categories) {
    var select = byId('course-category');
    categories.forEach(function (name) {
      var option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }

  function toggleRegistrationMode() {
    var isCapacity = byId('course-registration-mode').value === 'capacity';
    byId('course-seats-total-row').style.display = isCapacity ? '' : 'none';
    byId('course-seats-filled-row').style.display = isCapacity ? '' : 'none';
  }

  function buildPayload() {
    var payload = {
      title: byId('course-title').value,
      category: byId('course-category').value,
      newCategory: byId('course-new-category').value,
      startDate: byId('course-start-date').value,
      endDate: byId('course-end-date').value,
      cost: byId('course-cost').value,
      registrationMode: byId('course-registration-mode').value
    };
    if (payload.registrationMode === 'capacity') {
      payload.seatsTotal = parseInt(byId('course-seats-total').value, 10);
      payload.seatsFilled = parseInt(byId('course-seats-filled').value, 10);
    }
    return payload;
  }

  function setStatus(message, kind) {
    var status = byId('course-status');
    status.textContent = message;
    status.className = 'form-status' + (kind ? ' is-' + kind : '');
  }

  function onSubmit(event) {
    event.preventDefault();
    setStatus('Saving…', '');

    fetch('/api/courses', {
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
        byId('course-form').reset();
        toggleRegistrationMode();
      } else {
        setStatus('Not saved: ' + result.body.error, 'error');
      }
    }).catch(function () {
      setStatus('Could not reach the local write server. Run "python3 admin_server.py" and try again.', 'error');
    });
  }

  function init() {
    toggleRegistrationMode();
    byId('course-registration-mode').addEventListener('change', toggleRegistrationMode);
    byId('course-form').addEventListener('submit', onSubmit);

    fetch('assets/data/course-categories.json')
      .then(function (response) { return response.json(); })
      .then(populateCategories)
      .catch(function () {
        setStatus('Could not load categories — is admin_server.py running?', 'error');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Save as `assets/js/admin-courses.js`.

- [ ] **Step 3: Build and verify `--check` passes**

Run: `python3 build.py && python3 build.py --check`
Expected: `up to date (16 pages)`.

- [ ] **Step 4: Manually verify**

With `python3 admin_server.py 8018` running:

1. Open `http://localhost:8018/admin-courses.html` (or, absent a browser
   tool, confirm via `curl -s http://localhost:8018/admin-courses.html` that
   the page is served, and read the JS carefully for correctness — the
   Calendar work in this same repo established that no Chromium/browser
   automation tool is available in this environment; don't spend time
   re-discovering that, note it honestly instead).
2. `curl -s http://localhost:8018/assets/data/course-categories.json` —
   confirm the 3 seeded categories are returned, which is what
   `populateCategories` would render into the dropdown.
3. Submit a valid course via curl (as in Task 3 Step 3) and via the browser
   if available; confirm `course-status` shows "Saved: ... (uid)" and
   `courses.json` updates.
4. Submit with `newCategory` set and `category` empty; confirm the new
   category appears in `course-categories.json`.
5. Toggle registration mode in the HTML/JS by inspection: confirm
   `toggleRegistrationMode` hides the seat fields when `door` is selected.
6. Stop `admin_server.py` and confirm a submission attempt shows "Could not
   reach the local write server."

Reset the data files afterward exactly as in Task 3 Step 3's reset, since
Task 5 needs `courses.json` to still end this plan at `[]` for its own
verification — but Task 5 needs some test data during its own manual check,
so leave 1–2 test courses in `courses.json` for Task 5 to use, matching how
the Calendar's Task 4 left test events for its Task 5. Do reset
`course-categories.json` back to exactly the 3 seeded names if any stray
test categories (like a leftover "Woodworking") were added during this
task's verification — verify with `git diff assets/data/course-categories.json`
showing no diff.

- [ ] **Step 5: Commit**

```bash
git add src/admin-courses.html assets/js/admin-courses.js admin-courses.html
git commit -m "Add the admin course-creation page and its form handler"
```

(`assets/data/courses.json` is deliberately left with test data, uncommitted,
for Task 5 — same pattern as the Calendar's Task 4/5 handoff.)

---

### Task 5: Live Training course list and category filter

Replaces `training.html`'s static reference table with a live render from
`courses.json`, filterable by `course-categories.json`, with an ALL default.

**Files:**
- Modify: `src/training.html`
- Create: `assets/js/courses.js`

**Interfaces:**
- Consumes: `assets/data/courses.json`, `assets/data/course-categories.json`
  as written by Tasks 3/4's flow.
- Produces: the built `training.html` with `#courses-tbody`, `#course-filters`
  render targets, and `assets/js/courses.js`. Not consumed by any other task.

- [ ] **Step 1: Replace the page content**

Replace the entire content of `src/training.html` with:

```html
<!--
title: Training — Paton Hall
nav: training
class: page-inner
desc: Certified courses and workshops at Paton Hall — IPC and J-STD electronics standards, Linux systems, and microcontrollers.
-->
  <main class="main">
    <h1 class="page-title">Training</h1>

    <p>The Hall partners with organizations and certified instructors to offer courses and
    workshops in topics ranging from electronics assembly and repair, to industrial machinery
    operation, robotics development, software and control systems, Linux administration, and
    other in-demand subjects.</p>

    <hr class="rule">

    <table class="courses" id="courses-table">
      <thead>
        <tr><th>Course</th><th>Dates</th><th>Cost</th><th></th></tr>
      </thead>
      <tbody id="courses-tbody">
        <tr><td colspan="4">Loading&hellip;</td></tr>
      </tbody>
    </table>

    <p class="colophon">Paton Hall Inc. is a Canadian corporation run by and for its local
    membership.</p>
  </main>

  <aside class="aside aside--flush">
    <ul class="subnav" id="course-filters">
      <li><a href="#" class="is-current" data-category="">ALL</a></li>
    </ul>
  </aside>

  <script src="assets/js/courses.js" defer></script>
```

This drops the old static 12-row reference table and its `<ul class="topic-list">`
sidebar entirely, replacing both with render targets. `.subnav` (not
`.topic-list`) is used for the sidebar because it already carries the
clickable-link/current-state CSS (`text-decoration` + `.is-current`
underline) this filter needs — `.topic-list` was only ever plain text before,
so reusing it would need new CSS; `.subnav` needs none.

- [ ] **Step 2: Create the rendering script**

```js
/* Renders Training's live course list + category filter from
   assets/data/courses.json and assets/data/course-categories.json.
   Past courses (endDate before today) are excluded — a "what's coming up"
   list that includes finished courses would misrepresent the schedule.
   Never shows stale or fabricated data: a fetch failure or disabled JS
   shows a plain "unavailable" message instead. */
(function () {
  'use strict';

  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul',
                      'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var allCourses = [];
  var activeCategory = '';

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function parseDateOnly(value) {
    var parts = value.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  function formatDate(date) {
    return MONTH_NAMES[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear();
  }

  function formatDateRange(course) {
    var start = parseDateOnly(course.startDate);
    var end = parseDateOnly(course.endDate);
    if (course.startDate === course.endDate) {
      return formatDate(start);
    }
    if (start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()) {
      return MONTH_NAMES[start.getMonth()] + ' ' + start.getDate() + '–' + end.getDate()
        + ', ' + start.getFullYear();
    }
    return formatDate(start) + ' – ' + formatDate(end);
  }

  function indicatorFor(course) {
    if (course.registrationMode === 'door') {
      return '🚪 Register at Door';
    }
    if (course.seatsFilled >= course.seatsTotal) {
      return '🔴 Closed ' + course.seatsFilled + '/' + course.seatsTotal;
    }
    return '🟢 Open ' + course.seatsFilled + '/' + course.seatsTotal;
  }

  function renderTable() {
    var tbody = document.getElementById('courses-tbody');
    tbody.innerHTML = '';

    var visible = activeCategory
      ? allCourses.filter(function (c) { return c.category === activeCategory; })
      : allCourses;

    if (!visible.length) {
      var row = document.createElement('tr');
      var cell = el('td', '', 'No courses' + (activeCategory ? ' in this category.' : ' scheduled yet.'));
      cell.colSpan = 4;
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    visible.forEach(function (course) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', '', course.title));
      tr.appendChild(el('td', '', formatDateRange(course)));
      tr.appendChild(el('td', '', course.cost));
      tr.appendChild(el('td', '', indicatorFor(course)));
      tbody.appendChild(tr);
    });
  }

  function renderFilters(categories) {
    var list = document.getElementById('course-filters');
    categories.forEach(function (name) {
      var li = document.createElement('li');
      var link = el('a', '', name);
      link.href = '#';
      link.setAttribute('data-category', name);
      li.appendChild(link);
      list.appendChild(li);
    });

    list.addEventListener('click', function (evt) {
      var link = evt.target.closest('a');
      if (!link) return;
      evt.preventDefault();
      activeCategory = link.getAttribute('data-category');
      list.querySelectorAll('a').forEach(function (a) {
        a.classList.toggle('is-current', a === link);
      });
      renderTable();
    });
  }

  function showUnavailable() {
    var tbody = document.getElementById('courses-tbody');
    tbody.innerHTML = '';
    var row = document.createElement('tr');
    var cell = el('td', '', 'Course list unavailable.');
    cell.colSpan = 4;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function init() {
    var tbody = document.getElementById('courses-tbody');
    var filters = document.getElementById('course-filters');
    if (!tbody || !filters) return;

    Promise.all([
      fetch('assets/data/courses.json').then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      }),
      fetch('assets/data/course-categories.json').then(function (r) {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
    ]).then(function (results) {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      allCourses = results[0]
        .filter(function (c) { return parseDateOnly(c.endDate) >= today; })
        .sort(function (a, b) { return parseDateOnly(a.startDate) - parseDateOnly(b.startDate); });
      renderFilters(results[1]);
      renderTable();
    }).catch(function () {
      showUnavailable();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

Save as `assets/js/courses.js`.

- [ ] **Step 3: Build and verify `--check` passes**

Run: `python3 build.py && python3 build.py --check`
Expected: `up to date (16 pages)`.

- [ ] **Step 4: Manually verify**

Using the test course(s) Task 4 left in `courses.json` (plus, via
`admin-courses.html` or a direct curl `POST /api/courses` as in Task 3 Step
3, add: one course ending yesterday, one starting next week, and one in a
category not among the 3 seeded names — e.g. via `newCategory`), confirm by
reading the fetched JSON and tracing `courses.js`'s logic by hand (same
environment constraint as Task 4 — no browser tool; verify via curl + careful
code reading, honestly labeled in your report):

1. The past (ended-yesterday) course is excluded from `allCourses` after the
   filter in `init()`.
2. The sidebar shows "ALL" plus one link per category from
   `course-categories.json`, including the newly created one.
3. Clicking (or, absent a browser, tracing the click handler by hand against
   a specific category) filters `renderTable()`'s output to only that
   category's courses.
4. The indicator column renders correctly for a capacity course under and at
   its total (Open vs Closed) and for a door-mode course.
5. Renaming `assets/data/courses.json` temporarily and reloading shows
   "Course list unavailable." rather than a blank or broken table; rename it
   back afterward.

- [ ] **Step 5: Reset the data files**

```bash
echo '[]' > assets/data/courses.json
echo '["EPTAC (Electronics Specialists)", "Linux Servers & Systems", "Microcontrollers"]' > assets/data/course-categories.json
git diff assets/data/courses.json assets/data/course-categories.json
```
Expected: no diff against Task 1's committed versions.

- [ ] **Step 6: Commit**

```bash
python3 build.py
git add src/training.html training.html assets/js/courses.js
git commit -m "Render the Training course list and category filter live from courses.json"
```

---

### Task 6: Documentation

Brings `README.md` up to date with the new files and the Training scope
change, and does the final end-to-end build verification.

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: every file created in Tasks 1–5, for accuracy.
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Add rows to the Structure table**

In `README.md`'s `## Structure` table, after the Calendar-related rows added
by the previous plan (`tests/test_admin_server.py` row), add:

```markdown
| `assets/data/course-categories.json` | Training category names; admin-writable via `admin-courses.html`, read by both the admin form and `training.html` |
| `assets/data/courses.json` | Scheduled Training courses; written by `admin_server.py`, read at runtime by `training.html` |
| `assets/js/courses.js` | Renders Training's live course list and category filter from `courses.json` |
| `assets/js/admin-courses.js` | Handles `admin-courses.html`'s form and its `POST /api/courses` submission |
```

- [ ] **Step 2: Update the Scope section**

Find:

```markdown
- **Training** lists the courses. Enrolment and sign-up are not built.
```

Replace with:

```markdown
- **Training** renders a live course list from `assets/data/courses.json`,
  filterable by category via the sidebar (ALL by default, matching
  `assets/data/course-categories.json`). Adding courses requires running
  `admin_server.py` locally (see Running locally) via `admin-courses.html`;
  there is no public self-service registration — seat counts are updated by
  hand as people register through other channels.
```

- [ ] **Step 3: Update the Open items section**

Find:

```markdown
- **Training sign-up** — enrolment for the listed courses.
```

Replace with:

```markdown
- **Training sign-up** — no public self-service registration; an admin
  updates `seatsFilled` in `assets/data/courses.json` by hand as people
  register elsewhere. Adding and listing courses is built; see
  `docs/superpowers/specs/2026-08-17-patonhall-training-design.md`.
```

- [ ] **Step 4: Final verification**

```bash
python3 build.py --check
python3 -m unittest discover -s tests -t . -v
python3 -c "import json; assert json.load(open('assets/data/courses.json')) == []"
python3 -c "import json; cats = json.load(open('assets/data/course-categories.json')); assert cats == ['EPTAC (Electronics Specialists)', 'Linux Servers & Systems', 'Microcontrollers']"
git status
```

Expected: `up to date (16 pages)`; 21 unit tests pass; no assertion errors;
`git status` shows only `README.md` unstaged (everything else already
committed in Tasks 1–5).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "Document the Training course list, category filter, and admin creation page"
```
