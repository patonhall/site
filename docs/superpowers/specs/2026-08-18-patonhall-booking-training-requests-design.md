# Paton Hall — Booking & Training Request Pipeline Design

**Date:** 2026-08-18
**Scope:** Public-facing "Book Space" and "Training sign-up" request forms, and
the automated pipeline that checks them against the site's live schedule data
and lets an admin approve them with one action. Extends, and does not
replace, the Calendar and Training admin systems already built (see
`2026-08-17-patonhall-calendar-design.md` and `2026-08-17-patonhall-training-design.md`).

---

## 1. Goal

Members can request a space booking or express training interest through a
form styled like the rest of the site. The request is checked automatically
against what's actually scheduled (`assets/data/events.json` /
`assets/data/courses.json`, still the sole authoritative record, still
written only by an admin through `admin-events.html`/`admin-courses.html`)
and surfaced to an admin as a GitHub Issue with the check already done. One
label added to that issue writes the confirmed event into the repo — no
retyping.

Nothing here changes how the Calendar or Training pages read or display
data. This is entirely upstream of that: a request-intake and triage layer.

---

## 2. Why this shape (recap of the exploration that led here)

- **Google Sheets, not Kit custom fields, hold the raw request data.** Kit's
  custom fields are subscriber-level — a second submission from the same
  email overwrites the first's field values before anything can read them.
  A Sheet linked to a Google Form gets one immutable row per submission.
- **A Google Form (not the Sheets API) is the write path**, because writing
  to a Sheet needs an authenticated credential, and a public visitor's
  browser can't safely hold one. Forms are Google's own public-write proxy
  in front of the Sheet — no credential exposed to the client.
- **The visitor never sees Google's or Kit's own UI.** Our page is a
  custom-styled form; JS submits to Google's `formResponse` endpoint in the
  background. The form's native `action` also points there, as an honest
  no-JS fallback (full page POST, lands on Google's generic response page).
- **Kit is updated via API, not a second form.** `POST /v4/subscribers`
  (upsert by email) then `POST /v4/tags/{id}/subscribers` — both called from
  Apps Script, not the client. No Kit form, no Kit-side automation rule to
  configure.
- **Apps Script is the processing layer**, triggered instantly on form
  submit (not polled): it's free, Google-hosted, has credential-free access
  to its own Sheet, and can call both Kit's API and GitHub's API.
- **`events.json`/`courses.json` stay in the repo.** Moving them to Sheets
  was considered and rejected — it would retire a reviewed, working system
  for every visitor loading the Calendar/Training pages, not just for this
  request flow, to gain what's really just an editing-convenience benefit.
  Apps Script instead reads these files live via GitHub's public raw-content
  URLs, getting the same "live" check without the migration.
- **A GitHub Issue label, not "closed," triggers the write.** Closing an
  issue is ambiguous (resolved-by-adding vs. resolved-as-spam). Adding a
  specific label is a deliberate act, and — because only repo collaborators
  can add labels — it's safe by construction against the public.

---

## 3. Public forms

Two new pages, `book-space.html` and `training-signup.html`, in the site's
normal look. Each form's fields map to the corresponding Google Form's
verified `entry.XXXXX` fields (see §4). Structure:

```html
<form id="..." action="{GOOGLE_FORM_RESPONSE_URL}" method="POST" target="_blank">
  <!-- native fields, named entry.XXXXX directly, so the no-JS path works with zero JS -->
</form>
```

JS progressively enhances: on submit, `preventDefault()`, build a
`URLSearchParams` keyed by the same `entry.XXXXX` names, `fetch(actionUrl, {
method: 'POST', mode: 'no-cors', body })`, then (for Book Space only) also
call the Apps Script live-check endpoint (§6) and show the result inline —
same `setStatus()` pattern the admin forms already use. `target="_blank"` on
the native form means a no-JS submit opens Google's response page in a new
tab rather than navigating the visitor away from the site entirely.

### Book Space (`book-space.html`)

| Field | Google entry ID |
|---|---|
| Name | `entry.1317811418` |
| Email Address | `entry.823169727` |
| Space / Zone (select, A–I with the real labels below) | `entry.187152365` |
| Start Date | `entry.1379081936_year`, `_month`, `_day` |
| Start Time | `entry.1588425497_hour`, `_minute` |
| End Date | `entry.538228151_year`, `_month`, `_day` |
| End Time | `entry.1902716208_hour`, `_minute` |
| Purpose / Nature of Activity | `entry.673408033` |

Space options (already defined in the live form, and now the real values for
`assets/js/spaces.js`'s labels — see §8): A Blackboard, B Assembly Zone, C
Whiteboard, D Assembly Zone, E Pool Table, F Work Table 1, G Work Table 2, H
Loading Area, I Special Request.

Verified working: date/time sub-fields confirmed against the live form with
a real test submission on 2026-08-17 (`entry.<id>_year/_month/_day` for
dates, `entry.<id>_hour/_minute` for times, 24-hour). A test row landed in
the Booking sheet as part of that verification and was flagged for deletion
at the time.

### Training sign-up (`training-signup.html`)

| Field | Google entry ID |
|---|---|
| Name | `entry.2084093042` |
| Email | `entry.562281597` |
| Course (select: EPTAC / Linux Servers and Systems / Microcontrollers) | `entry.1570206020` |
| Note / Comments | `entry.1073976410` |

`course-categories.json` has already been updated to match these exact
strings (`EPTAC`, `Linux Servers and Systems`, `Microcontrollers`) — no
further reconciliation needed.

---

## 4. Google Forms / Sheets (already created by the user)

- Booking form: `https://docs.google.com/forms/d/e/1FAIpQLScbCJfTWbXL_G6jwuWXaVANMIdmCLCptHboW5DP9JjXJoB1yA/`
- Training form: `https://docs.google.com/forms/d/e/1FAIpQLSduJiDW8kLRbnFas0lOAO_QU-GhFScqvw4glNvVXh-6kd011w/`

Both live under the `patonhall.canada@gmail.com` account, each linked to its
own Sheet. No "publish to web" step is needed — Apps Script (§5) reads its
bound Sheet with native, credential-free access, so the Sheet never needs to
be publicly link-viewable.

---

## 5. Apps Script — on-submit processing

One script per Sheet (`onFormSubmit(e)` trigger, installed via the Sheet's
**Triggers** panel — not the default simple trigger, since it needs to call
external services, which requires an installable trigger with authorization).

Script Properties (**File → Project properties → Script properties**, not
hardcoded in source):

| Key | Value |
|---|---|
| `KIT_API_KEY` | Kit v4 API key |
| `GITHUB_TOKEN` | a GitHub PAT scoped to `repo` (issues + contents) on `peers8862/patonhall-excalisite` |

On each submission:

1. **Kit update.** `POST https://api.kit.com/v4/subscribers` with
   `{email_address, first_name}` (upsert), then resolve the tag id via
   `GET /v4/tags` and `POST /v4/tags/{id}/subscribers` with `{email_address}`
   — tag `booking-request` (Book Space) or `training-requested` (Training).
   Both calls use header `X-Kit-Api-Key`.
2. **Live schedule fetch.** `UrlFetchApp.fetch()` against:
   - `https://raw.githubusercontent.com/peers8862/patonhall-excalisite/main/assets/data/events.json`
   - `https://raw.githubusercontent.com/peers8862/patonhall-excalisite/main/assets/data/courses.json`
3. **Conflict / capacity check.**
   - Book Space: same-space events overlapping the requested range = hard
     conflict. Separately, **all** events (any space) overlapping the
     requested range **or within ±1 hour of it** = the "concurrent activity"
     report — informational only, never blocking (§7).
   - Training: courses matching the requested category with
     `registrationMode: "capacity"` and `seatsFilled < seatsTotal`, or any
     matching `"door"` course = "open." No matching upcoming course = "no
     upcoming offering" (still opened as an issue — an admin may want to
     schedule one).
4. **GitHub Issue.** `POST https://api.github.com/repos/peers8862/patonhall-excalisite/issues`
   with `Authorization: Bearer {GITHUB_TOKEN}`. Body includes:
   - Requester name/email, requested details, human-readable check result.
   - A hidden machine-readable block: an HTML comment containing the exact
     JSON the approval Action (§9) will parse — see §9 for the schema.
   - Labels: `type:booking`/`type:training`, plus `booking-conflict` if a
     same-space conflict was found (informational tagging on the issue
     itself, not a state change).
   - If no conflict (Book Space) or at least one open offering (Training):
     the issue is immediately closed via a follow-up `PATCH` — signaling
     "clear, ready for the one-label approval" without requiring the admin
     to have opened Apps Script's own check output separately. It can still
     be relabeled `approved` later like any other issue.

---

## 6. Apps Script — live availability check (Web App)

A second `doGet(e)` function in the booking script, deployed separately as a
**Web App** (Deploy → New deployment → Web app, execute as Me, access
Anyone). Takes `space`, `start`, `end` query params, does the same same-space
overlap check as step 3 above against the same live `events.json` fetch, and
returns `{"available": true|false, "conflicts": [...]}` as JSON. No
authentication needed — it only ever discloses whether one space is free at
one time, not the wider schedule.

The Book Space page's JS calls this (`fetch` with the form's current
space/date/time values) as the user finishes filling the space and time
fields, showing an inline "looks available" / "conflicts with an existing
booking" note **before** submission — informational, not a hard block; they
can still submit either way, since a same-space conflict isn't necessarily
disqualifying (the admin makes the final call, same as always) and the
window between check and admin review could change things regardless.

---

## 7. Concurrent-activity reporting (GitHub Issue only)

Whether two *different* zones running concurrently is actually a problem is
a judgment call specific to Paton Hall's physical layout (e.g. a loud
assembly-zone activity next to a training course) — not something the
automation should decide. The issue body therefore separates:

- **Conflicts (same zone)** — the hard, auto-computed verdict.
- **Concurrent activity (all zones)** — every event overlapping the
  requested window or within ±1 hour of it, across every space, listed with
  zone/time/title only (no purpose or requester details, to keep the report
  short) — purely for the admin's own judgment, never auto-flagged.

This section is omitted from the live-check Web App's response (§6) — it's
admin-facing detail, not something to expose to an anonymous visitor.

---

## 8. `spaces.js` label update

Since the Booking form already has real space names, `assets/js/spaces.js`'s
`label` fields (currently all `''`) get filled in to match exactly:

```
A: Blackboard, B: Assembly Zone, C: Whiteboard, D: Assembly Zone,
E: Pool Table, F: Work Table 1, G: Work Table 2, H: Loading Area,
I: Special Request
```

This is a pure content fill-in of an already-existing, already-designed-for
extension point (`docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`
§5) — no code or schema change.

---

## 9. GitHub Action — issue-label approval

New workflow, triggered on `issues: labeled`. Guards on the label actually
being `approved` (ignores every other label event) before doing anything.

**Issue body JSON schema** (embedded by Apps Script as
`<!-- request-data: {...} -->`):

```json
{
  "kind": "booking",
  "title": "string — event/course title, admin-editable before approving",
  "space": "A",
  "start": "2026-09-01T18:00",
  "end": "2026-09-01T21:00",
  "purpose": "string"
}
```
or, for `"kind": "training"`:
```json
{
  "kind": "training",
  "title": "string",
  "category": "EPTAC",
  "cost": "string — admin fills this in before approving, since a signup form doesn't collect it",
  "registrationMode": "capacity",
  "seatsTotal": 20,
  "seatsFilled": 0
}
```

New `scripts/approve_request.py` (stdlib only, matching this repo's existing
scripts):

1. Read `GITHUB_TOKEN`, `GITHUB_REPOSITORY`, and the issue number/body from
   the Action's event payload (passed via `env:`, never interpolated into a
   shell command — see the Global Constraints below).
2. Extract and `json.loads` the `<!-- request-data: ... -->` block. Missing
   or malformed → comment the specific parse error on the issue, exit
   without writing or closing it.
3. Build a payload dict from the JSON and validate it through
   `admin_server.validate_event` or `admin_server.validate_course` (imported
   directly — this repo's root is already a valid Python import path for
   these scripts, matching `scripts/check_booking_requests.py`'s existing
   pattern before it's removed, see §10). Invalid → comment the exact
   validation errors, exit without writing or closing.
4. Valid → `admin_server.generate_uid`, construct the record exactly as
   `admin_server.py`'s own handlers do, `admin_server.load_items`/`save_items`
   against `EVENTS_PATH`/`COURSES_PATH`, commit with a message naming the
   issue, push, comment the created record's `uid` on the issue, close it.

**Global Constraints for this Action** (copied forward from the existing
security review already run against `.github/workflows/*` in this repo):
never interpolate `github.event.issue.body` or any other event-supplied
field directly into a `run:` shell string — pass everything through `env:`
and read it from the environment inside the Python script.

---

## 10. What gets removed

`.github/workflows/booking-requests.yml` and `scripts/check_booking_requests.py`
(added 2026-08-17, commit `bc907c7`) are superseded by this design — the
polling model they implement is replaced by Apps Script's instant,
event-driven processing. Both are deleted as part of this work.

---

## 11. Kit tags needed

Already created by the user: `booking-request`, `booking-approved`,
`booking-conflict`, `training-requested`. Still needed: `training-reviewed`
(training's flow is simpler than booking's — no hard conflict concept, so
one "processed" tag is enough rather than mirroring booking's three-tag
approved/conflict split).

---

## 12. Out of scope

- Editing or re-running a rejected/conflicting request — an admin declines
  simply by not adding the `approved` label; nothing further happens
  automatically.
- Any UI for the admin to browse past requests beyond GitHub's own Issues
  list (closed issues remain there as a natural log).
- Rate limiting or spam protection on the public forms (Google Forms'/Kit's
  own abuse protections are relied on as-is).
- Editing an already-approved event/course through this pipeline — that
  still means hand-editing the JSON or using the existing admin forms, per
  the Calendar/Training specs' existing "creation-only" scope.
