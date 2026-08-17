# Paton Hall — Calendar Design

**Date:** 2026-08-17
**Scope:** A simple, admin-only way to add events to the Calendar page, and live
rendering of those events on `calendar.html`. Not in scope: the public "Book Space"
flow (stays a disabled placeholder; will link to an external form later), sign-in,
3-Day/Week/Month views, and booking-conflict validation.
**Deploy target:** GitHub Pages, static, no server at runtime. The write capability
runs only on an admin's own machine.

---

## 1. Goal

Replace the calendar's single hardcoded sample event with a real, if small,
mechanism: an admin who has cloned the repo can run a local server, add events
through a simple form, and have those events show up on the live agenda view once
committed and pushed. Not a booking system — a data-entry tool for admins, sized to
"a few people occasionally," not "many people concurrently."

---

## 2. Data model

One file, `assets/data/events.json` — a plain JSON array of event objects. Chosen
over SQLite because it is git-diffable, human-readable, and needs zero dependencies,
matching how every other asset in this repo is committed static output.

```json
[
  {
    "uid": "20260817T143022-a1b2",
    "title": "EPTAC Course (IPC-A-610 Specialist)",
    "start": "2026-10-20T11:30",
    "end": "2026-10-20T17:00",
    "allDay": false,
    "location": "B",
    "description": "4-day lectured course...",
    "created": "2026-08-17T14:30:22"
  }
]
```

Fields mirror Google Calendar's quick-create dialog: title, start, end, all-day,
location, description. There is no separate "space" field — the **Location** field
holds the A–I space letter directly (see §5). This keeps the schema exactly what a
real Google Calendar event looks like, so if this data is ever synced into actual
Google Calendar, the space assignment is already sitting in the field that survives
the trip, with no custom mapping required.

`uid` is generated server-side: `<UTC timestamp, compact ISO> + "-" + <4 random hex
chars>` (Python's `secrets.token_hex(2)`). On the practically-impossible event of a
collision against existing uids in the file, the server regenerates the suffix and
retries (a handful of attempts, then a 500) — simple, not gold-plated, appropriate
for a mechanism nobody is hitting concurrently.

The empty state is `[]` — no seed/migrated event.

---

## 3. Admin write server

New `admin_server.py` at the repo root. Stdlib only (`http.server`, `json`, `secrets`,
`datetime`, `os`) — no new dependencies, matching `build.py`'s existing style.

- Serves static files exactly like `python3 -m http.server` (admins run this
  *instead of* that command when they want write access; everyone else keeps using
  plain `http.server` unchanged).
- `POST /api/events` — reads a JSON body, validates:
  - `title` non-empty
  - `location` is one of `A`–`I`
  - `start` parses as ISO 8601; `end` parses and is `>= start`
  - `allDay` boolean, `description` optional string
  - On failure: `400` with a JSON `{"error": "..."}` body.
  - On success: assigns `uid` + `created`, appends to the in-memory list, writes the
    whole file back **atomically** — write to a temp file in the same directory,
    then `os.replace()` — so a crash or Ctrl-C mid-write can never leave
    `events.json` truncated or corrupt. Returns `201` with the created event.
- No authentication. The trust boundary is "this process only runs on a machine
  belonging to someone who already has git push access to the whole site" — the
  same boundary the repo itself already relies on.
- `http.server`'s default handler processes one request at a time, so within a
  single running instance there is no real write race to guard against; the uid
  retry above is the only concurrency concern worth handling, and only because it's
  free to handle.

---

## 4. Admin add-event page

New `admin-events.html`, built through the normal `build.py` pipeline like every
other page (front matter, shared shell) but with `nav: ""` — it does not appear in
the shared rail and nothing else links to it. An admin reaches it by typing the URL
directly on their local server.

Fields, in order: Title, Start date, Start time, End date, End time, All-day
(checkbox — when checked, hides the time inputs), Location (dropdown, A–I, sourced
from `assets/js/spaces.js`), Description (textarea).

Submits via `fetch` to `/api/events` on the same origin. On success, shows the
created event's uid inline and clears the form. On failure — network error (no
`admin_server.py` running, e.g. viewed on the live GitHub Pages site) or a `400`
from validation — shows the real error inline. It never reports success it didn't
get, matching the standing rule elsewhere in this codebase (the subscribe form) that
a form must not fake success.

---

## 5. Space labels

New `assets/js/spaces.js`:

```js
window.PATON_SPACES = [
  { id: 'A', label: '' },
  { id: 'B', label: '' },
  // ... through I
];
```

Consumed by both `admin-events.html` (populates the Location dropdown as "A", "B",
… until labels exist, then "A — <label>") and `calendar.js` (renders the same
lookup when displaying an event's location). Adding the one/two-word names later is
a one-file edit, the same trick `_shell.html` already uses for nav items.

---

## 6. Calendar rendering

New `assets/js/calendar.js`, loaded only on `calendar.html`. A build-time bake was
considered and rejected: the agenda must reflect the real "today" on every page
load, which a committed static HTML snapshot cannot do without a rebuild+deploy
every single day.

On load:

1. `fetch('assets/data/events.json')`.
2. Compute "today" from the browser's clock. Bucket events into today + the next 13
   days (a 14-day rolling window).
3. Render one `<h2 class="cal__day">` + `<ul class="cal__events">` per day with at
   least one event; render each event's time range and title.
4. Clicking an event updates `.cal__detail` (title, time range, location,
   description) without a page reload. Nothing is selected by default until the
   visitor clicks one — matches "no fake state" the same way the write path does.
5. If the fetch fails, or JS never runs, the agenda area shows a plain static
   message ("Calendar unavailable") instead of stale or fabricated data — the same
   "degrade honestly" principle `sketch.js` uses for borders, applied to data
   instead of drawing.

The existing `cal__actions` / `cal__views` controls (Book Space, Logout, 3-Day,
Week, Month) are untouched — still inert placeholders, as they are today.

---

## 7. File layout

| Path | Change |
|---|---|
| `assets/data/events.json` | New. `[]` initially. |
| `admin_server.py` | New. Stdlib static server + write API. |
| `src/admin-events.html` | New. Unlinked admin form page. |
| `assets/js/spaces.js` | New. Shared A–I list. |
| `assets/js/calendar.js` | New. Fetch + render + click-to-select. |
| `src/calendar.html` | Edited. Loads `spaces.js` + `calendar.js`; agenda/detail markup becomes render targets instead of hardcoded content. |
| `README.md` | Edited. Documents `admin_server.py` as the write-capable alternative to `python3 -m http.server`, and the events data file. |

---

## 8. Testing

No test framework exists in this repo (it's static HTML/CSS/JS with a Python build
script) and none is being introduced. Verification is manual:

- `admin_server.py`: start it, submit valid and invalid events via `admin-events.html`,
  confirm `events.json` updates atomically and validation errors surface inline.
  Confirm plain `python3 -m http.server` still works unchanged for everyone else.
- `calendar.js`: with a handful of events spread across the 14-day window (including
  today, an all-day event, and one outside the window), confirm correct bucketing,
  click-to-select, and the no-JS / fetch-failure fallback (test by renaming
  `events.json` temporarily).
- `python3 build.py --check` must pass after `admin-events.html` and `calendar.html`
  changes are built.

---

## 9. Out of scope

- The public "Book Space" link — stays exactly as it is today (disabled
  placeholder); will point at an external form later.
- Authentication on `admin_server.py`.
- Booking-conflict / overlap validation.
- 3-Day, Week, Month views; sign-in.
- Editing or deleting events once added (an admin can hand-edit `events.json` and
  commit if needed — no UI for it yet).
