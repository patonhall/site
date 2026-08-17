# Paton Hall — Training Course Listing & Creation Design

**Date:** 2026-08-17
**Scope:** Replace Training's static reference table with a live, admin-driven
course list, an admin-only course-creation page, and category filtering on the
public page. Extends `admin_server.py` rather than introducing a second server.
**Deploy target:** GitHub Pages, static, no server at runtime. The write
capability runs only on an admin's own machine — same trust model as the
Calendar's `admin_server.py`.

---

## 1. Goal

`training.html` currently shows a static, hand-written table of 12 certification
standards (IPC-A-610, IPC Designer, J-STD-001, …) with columns Course / Standard /
Duration / Levels — a reference catalog, not a schedule. Replace it with a live
list of actual scheduled course offerings (Title / Dates / Cost / registration
status), created by an admin through a local write-capable form, mirroring the
pattern already built for the Calendar (`docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`).
The existing sidebar topic list (EPTAC, Linux Servers & Systems, Microcontrollers)
becomes a live category filter with an "ALL" default.

Creation-only, same scope discipline as the Calendar: no edit/delete UI, no
public self-service registration. An admin updates a course's seat count over
time by hand-editing `courses.json`, exactly as the Calendar spec already
blesses hand-editing `events.json`.

---

## 2. Data model

Two new files under `assets/data/`, both plain JSON, git-diffable, human-readable
— same rationale as `events.json`.

### `course-categories.json`

A flat array of category name strings. Seeded with the three names already
present in the static sidebar:

```json
["EPTAC (Electronics Specialists)", "Linux Servers & Systems", "Microcontrollers"]
```

Both the admin form's Category dropdown and the public page's sidebar filter
list read this same file, so a category added once appears in both places with
no code change — the same "one shared file" trick `spaces.js` uses for the
Calendar's A–I list, except this one is admin-writable at runtime rather than
hand-edited.

### `courses.json`

Starts as `[]`. Each entry:

```json
{
  "uid": "20260817T143022-a1b2",
  "title": "IPC-A-610 Specialist Certification",
  "category": "EPTAC (Electronics Specialists)",
  "startDate": "2026-10-20",
  "endDate": "2026-10-23",
  "cost": "$500",
  "registrationMode": "capacity",
  "seatsTotal": 26,
  "seatsFilled": 22,
  "created": "2026-08-17T14:30:22"
}
```

- `startDate`/`endDate` are date-only (`YYYY-MM-DD`, no time-of-day) — courses
  don't need minute-level scheduling for a Title/Dates/Cost table.
- `cost` is free text, not a strict number — matches how Membership already
  writes prices ("$500 - $1,000"), so a course can say "$500", "Free", or
  "$50 members / $75 public" without a schema change.
- `registrationMode` is `"capacity"` or `"door"`. In `"capacity"` mode,
  `seatsTotal` (positive integer) and `seatsFilled` (integer, `0 ≤ seatsFilled
  ≤ seatsTotal`) are present. In `"door"` mode, both are omitted — the course
  has no pre-registration cap to track.
- `uid`/`created` are assigned server-side, identical mechanism to the
  Calendar's events (timestamp + random hex, collision-retried).

---

## 3. Server: extend `admin_server.py`, don't duplicate it

`admin_server.py` already does exactly this shape of work for events. Two
refactors while extending it, both genuine improvements rather than incidental
churn:

- **Rename `load_events`/`save_events` to `load_items`/`save_items`.** Their
  implementations were already generic JSON-list I/O with atomic writes — only
  the names were event-specific. Courses need the identical functions; renaming
  once and updating both call sites (events, courses) is cleaner than a second,
  identically-bodied pair of functions under a different name.
- **Reuse `generate_uid` as-is.** It was never event-specific in its
  implementation (timestamp + random hex, checked against a passed-in set) —
  the events code just happened to be its only caller so far.

New endpoint, same shape as `POST /api/events`:

**`POST /api/courses`** — validates the payload:
- `title` non-empty string
- `category` non-empty string, OR a `newCategory` field is present and
  non-empty (see below)
- `startDate`/`endDate` parse as `YYYY-MM-DD`, `endDate ≥ startDate`
- `cost` non-empty string
- `registrationMode` is exactly `"capacity"` or `"door"`
- if `"capacity"`: `seatsTotal` is a positive integer, `seatsFilled` is an
  integer with `0 ≤ seatsFilled ≤ seatsTotal`
- if `"door"`: seat fields are ignored if present, not required

**New-category handling:** if the payload's `newCategory` field is a non-empty
string, the handler loads `course-categories.json`, appends the name if it
isn't already present (and saves), and uses that name as the course's
`category` — taking priority over any value in the `category` field. The
client-side form only ever sends one of the two (see §4), but the server
doesn't trust that and applies this precedence unconditionally.

On success: assigns `uid` + `created`, appends to `courses.json`, atomic save
(same temp-file + `os.replace` pattern as events), returns `201` with the
created course. On validation failure: `400` with `{"error": "..."}`, same
contract as events.

No new authentication, no new binding — this is the same `admin_server.py`
process, still bound to `127.0.0.1` only.

---

## 4. Admin course-creation page

New `admin-courses.html`, unlinked from the shared nav (`nav: ""`), same
pattern as `admin-events.html` — reached by typing the URL directly on a local
admin server.

Fields: Title, Category (a `<select>` populated at runtime from
`course-categories.json`, plus a text input labeled "Or add a new category" —
if the admin types into that field, its value is sent as `newCategory` instead
of the dropdown's `category` value), Start date, End date, Cost (free text),
Registration mode (a toggle: Capacity-tracked / Register at Door — selecting
Capacity-tracked reveals Total seats and Filled seats number inputs, mirroring
how the Calendar form's All-day checkbox reveals/hides its own conditional
fields).

Submits via `fetch` to `/api/courses`. Same "never fake success" rule as
`admin-events.js`: a failed or unreachable request shows the real error inline.

---

## 5. Public `training.html`

The static reference table (`<table class="courses">` with Course/Standard/
Duration/Levels) is removed entirely. In its place, directly below the page
title, blurb, and `<hr class="rule">` (i.e. where the static table sits today):
a live table, same `.courses` class for visual continuity, columns **Title,
Dates, Cost, [indicator]** — no description column.

Rendered by new `assets/js/courses.js`, loaded only on `training.html`:

1. `fetch('assets/data/courses.json')` and `fetch('assets/data/course-categories.json')`.
2. Render the sidebar (`<aside class="aside aside--flush">`, replacing the
   current hardcoded `<ul class="topic-list">`) as clickable filter links:
   **ALL** first, always present, active by default; then one link per
   category from `course-categories.json`, in file order.
3. Render the table body from `courses.json`, filtered to the active category
   (or all courses, under "ALL"). Dates render as a short range (e.g. "Oct
   20–23, 2026"; a single-day course as "Oct 20, 2026").
4. Indicator column, computed per course:
   - `registrationMode: "capacity"`, `seatsFilled < seatsTotal` → 🟢 `Open
     {seatsFilled}/{seatsTotal}`
   - `registrationMode: "capacity"`, `seatsFilled >= seatsTotal` → 🔴 `Closed
     {seatsFilled}/{seatsTotal}`
   - `registrationMode: "door"` → 🚪 `Register at Door`
5. Clicking a sidebar filter re-renders the table client-side (no reload),
   same interaction shape as the Calendar's click-to-select, and updates which
   sidebar link carries `is-current`.
6. If either fetch fails, or JS never runs, the table area shows a plain
   "Course list unavailable" message — never stale or fabricated data, same
   rule the Calendar follows.

Title is plain text, not a link, in this pass — no per-course detail pages are
part of this work. The existing `course-ipc-a-610.html` detail page stays on
disk untouched; it simply has no inbound link from this table anymore (out of
scope to delete or repurpose it here).

---

## 6. File layout

| Path | Change |
|---|---|
| `assets/data/course-categories.json` | New. Seeded with the 3 existing category names. |
| `assets/data/courses.json` | New. `[]` initially. |
| `admin_server.py` | Modified. `load_events`/`save_events` → `load_items`/`save_items` (both call sites updated); new `validate_course`; new `POST /api/courses` handler with new-category creation. |
| `src/admin-courses.html` | New. Unlinked admin form page. |
| `assets/js/admin-courses.js` | New. Form population, conditional fields, submit/error handling. |
| `src/training.html` | Modified. Static table removed; sidebar and table become render targets for `courses.js`. |
| `assets/js/courses.js` | New. Fetch, category filter, table + sidebar rendering. |
| `assets/css/site.css` | Modified as needed for the registration-mode toggle and any new admin-form fields — reuse `.signup-form` and its existing `.page-inner` override (added during the Calendar work) rather than new rules where possible. |
| `README.md` | Modified. Document the two new data files and the admin course-creation page, alongside the existing Calendar entries. |
| `tests/test_admin_server.py` | Modified. Add coverage for `validate_course` and the new-category precedence rule, alongside the existing event tests. |

---

## 7. Testing

Same split as the Calendar: `admin_server.py`'s new pure logic
(`validate_course`, the renamed `load_items`/`save_items`, new-category
creation) gets `unittest` coverage. `admin-courses.html`/`courses.js`'s
browser-side behavior is verified by manual/curl-based checks and careful code
reading, per the same environment constraint noted in the Calendar's plan (no
Chromium was available anywhere in that work; assume the same here unless
that's changed) — flagged honestly as unverified-in-a-real-browser rather than
claimed.

---

## 8. Out of scope

- Editing or deleting a course once created (hand-edit `courses.json`).
- Per-course detail pages / linking course titles anywhere.
- Public self-service registration — nothing here changes how a seat actually
  gets booked; an admin still updates `seatsFilled` by hand as people register
  through whatever channel (in person, email, phone).
- Any change to `course-ipc-a-610.html` itself.
- Authentication on `admin_server.py` (unchanged from the Calendar's design).
