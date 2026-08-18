# Paton Hall — Event Attendance Design

**Date:** 2026-08-18
**Scope:** Public RSVP for Calendar events, a confirmation email carrying a
calendar attachment, an attendee count on the Calendar, automatic
notification when an event changes or is cancelled, and the event editing
that makes those changes possible. Extends the Calendar and the
booking/training request pipeline already built (see
`2026-08-17-patonhall-calendar-design.md` and
`2026-08-18-patonhall-booking-training-requests-design.md`).

---

## 1. Goal

Anyone — already on the mailing list or not — can confirm they're coming to
a scheduled event. They get an email with the event attached as a calendar
file, so it lands in their own calendar. The Calendar page shows how many
people are coming. If the event later moves or is cancelled, everyone who
RSVP'd is told automatically and their saved calendar entry updates in
place.

Attendee **names are not published**. The public sees a count. Names live in
the RSVP Sheet, visible to an admin only, and become a members-only view in
a later project (§10).

---

## 2. Why this shape

- **Names never enter the repo, and never enter a GitHub Issue.** This repo
  is public and git history is permanent, so a name committed to
  `assets/data/` could never truly be withdrawn — "take my name off that
  list" would be a request we could not honour. The same objection rules out
  the otherwise-attractive "one issue per event, RSVPs as comments" design:
  anyone watching the repo is emailed the instant a comment is posted, so
  deleting it later does not unsend anything. Attendee data therefore lives
  only in the Sheet and is served by Apps Script, which can refuse.

- **The count is public; the names are a later, authenticated feature.**
  Publishing a count needs no moderation — a number cannot contain free
  text. Publishing chosen display names would put unmoderated public input
  on the site, and would also have to be walked back if names later became
  members-only. Starting with a count keeps the social signal and leaves the
  members-only path open.

- **The event is carried as a `uid` in a short-answer field, never a
  dropdown.** On 2026-08-18 the Book Space form was found to be silently
  dropping every submission because a Google Form *multiple-choice* question
  validates answers against a manually-maintained option list, and the
  client was sending a value that was not on it. An event list changes
  constantly; a dropdown of events would recreate that failure permanently.
  A short-answer field accepts any string, so there is nothing to keep in
  sync.

- **No GitHub Issue per RSVP.** The booking and training pipelines open an
  issue because a request needs an admin decision. An RSVP needs none, one
  issue per RSVP would be noise, and — decisively — an issue carrying
  attendee names would publish exactly the data this design keeps private.
  Issues appear only for operational problems, and carry no personal data.

- **Change detection watches the data file, not an admin action.** There is
  currently no way to edit an event at all (§7), so today a change means
  hand-editing `assets/data/events.json`. Hooking notification to an admin
  action would require building that action first and would still miss every
  hand-edit. Diffing the file catches a change however it arrived.

- **Transactional email comes from Apps Script, not Kit.** Kit's custom
  fields are subscriber-level, so a second RSVP from the same person
  overwrites the first event's field values before Kit could send anything —
  the same reasoning that put request data in Sheets rather than Kit in the
  booking design. Kit keeps lifecycle email (welcome, newsletters); Apps
  Script sends receipts. A confirmation is transactional, so it does not
  need Kit's unsubscribe machinery.

---

## 3. Public RSVP page (`rsvp.html`)

A new page in the site's normal look, reached as `rsvp.html?uid=<event
uid>` from a link in the Calendar detail pane.

`assets/js/rsvp.js` reads `uid` from the query string, fetches
`assets/data/events.json`, and renders the event being confirmed (title,
time, space) above the form so nobody RSVPs blind. An unknown or missing
`uid`, or a cancelled or already-finished event, shows a plain message and
no form — the same "never fabricate" convention as `calendar.js` and
`post.js`.

Fields: **Name** (how we'd address you — not published), **Email**, and a
hidden input carrying the event `uid`.

**This page requires JavaScript, unlike `book-space.html`.** The form cannot
know which event is meant without reading the URL, and the site is static
with no server to render it. This is a real limitation and is stated on the
page rather than left to fail silently.

Submission follows the established pattern: `fetch(action, {method: 'POST',
mode: 'no-cors', body})` to the Google Form's `formResponse` endpoint. As
elsewhere, the opaque response confirms only that the request was sent — the
real confirmation is the email that arrives.

---

## 4. Google Form / Sheet (to be created)

A fourth Form + linked Sheet, alongside booking, training and homepage
signup, under `patonhall.canada@gmail.com`.

| Field | Type | Notes |
|---|---|---|
| Name | Short answer | Not published |
| Email | Short answer | Identity key, deduplication key |
| Event | **Short answer** | Holds the event `uid`. Never a dropdown — see §2 |

The `entry.XXXXX` ids must be read off the live form and recorded here once
it exists. Verify them the way the booking ids were verified: fetch the
form's `viewform` page and read `FB_PUBLIC_LOAD_DATA_`, rather than trusting
the prefill URL.

The Sheet carries two extra tabs the script owns:

- **`attendees`** — the form responses, plus `status` (`going` /
  `cancelled`), and a random `cancelToken` per row.
- **`event-snapshot`** — one row per event `uid` last seen by the change
  detector: the material fields, plus `sequence` (the iCalendar `SEQUENCE`
  counter). Kept here rather than in `events.json` so the repo schema is
  untouched by attendance.

---

## 5. Apps Script — `google-apps-script/rsvp.gs`

Bound to the RSVP Sheet. Same conventions as the other three processors:
installable `onFormSubmit` trigger sourced **from spreadsheet**, credentials
in Script Properties, and a `runSelfTest()` that checks triggers, script
properties, Kit reachability and tags, and repo readability.

Script Properties: `KIT_API_KEY`, `GITHUB_TOKEN`.

### `onFormSubmit(e)`

1. Read Name, Email, Event uid from `e.namedValues`.
2. Fetch `assets/data/events.json`. If the uid is unknown, cancelled, or the
   event has already ended, log it and open an operational GitHub Issue
   containing the uid but **no personal data**, then stop.
3. Deduplicate on (email, uid). A repeat submission updates the existing row
   and re-sends the confirmation; it never creates a second attendee.
4. Generate a `cancelToken` for the row if it has none.
5. Write the attendee row to the `attendees` tab. This is the durable
   record; everything after this point is a side effect that must not be
   able to undo it.
6. Send the confirmation email (§6).
7. Tag in Kit through `tagQuietly_`, so a Kit failure logs rather than
   destroying the RSVP.

Ordering follows the correction made to all three existing scripts on
2026-08-18: the durable record is written first, and the mailing-list side
effect happens afterwards and non-fatally. Email sending is wrapped the same
way — a blown `MailApp` quota costs a receipt, never someone's attendance.

### `doGet(e)`

`?event=<uid>` → `{"count": 6}`.

Names are never returned in this version. This endpoint is the seam for the
members-only view: adding a session check and returning names is the whole
of that later change (§10).

`?cancel=<token>` → marks that attendee `cancelled` and returns a plain
confirmation page. Tokens are random, single-purpose, and carry no
information about the person.

### Change detection — time-driven trigger

Runs every 15 minutes.

1. Fetch `assets/data/events.json`.
2. Diff each event against its `event-snapshot` row on the **material**
   fields only: `title`, `start`, `end`, `location`, `cancelled`. A
   description typo must not email anyone.
3. For each materially changed event with attendees:
   - **Blast guard.** If the number of attendees to be emailed across this
     run exceeds 20, send nothing, open a GitHub Issue asking an admin to
     confirm, and leave the snapshot unchanged so the next run re-detects
     it. Email is irreversible and the daily quota is finite; a single bad
     hand-edit must not fire a mass mailing.
   - Otherwise increment `sequence` and email every `going` attendee an
     updated invitation (§6).
4. An event that is `cancelled: true`, or that has disappeared from the file
   entirely, sends a cancellation instead.
5. Write the new snapshot.

---

## 6. Confirmation and update email

Sent with `MailApp` from the account that owns the script. Plain text in the
site's voice, matching `main-copy.md`'s register.

Contents: what they're confirmed for, when, which space, a note that this is
a request-free confirmation (no admin approval needed, unlike booking), the
"can't make it" cancel link, and an attached `.ics`.

### The calendar attachment

Built as a `text/calendar` blob. The mapping from an event record is nearly
one-to-one:

| iCalendar | Source |
|---|---|
| `UID` | the event's `uid` — **stable forever**, never regenerated |
| `SEQUENCE` | the counter in `event-snapshot`, incremented per material change |
| `DTSTART` / `DTEND` | `start` / `end` |
| `SUMMARY` | `title` |
| `LOCATION` | the space label via the same A–I list `spaces.js` owns |
| `DESCRIPTION` | `description` |
| `METHOD` | `REQUEST` normally, `CANCEL` for a cancellation |
| `STATUS` | `CANCELLED` for a cancellation |

Same `UID` with a higher `SEQUENCE` makes Google, Apple and Outlook
calendars **replace** the existing entry rather than create a duplicate.
This is the entire reason an edit must never regenerate `uid` (§7) — doing
so would orphan every RSVP and strand a stale entry in every attendee's
calendar with no way to remove it.

**Quota.** `MailApp` on a consumer Gmail account allows roughly 100
recipients per day; a Workspace account raises this to 1,500. The account is
expected to move to Workspace. Until then the blast guard and the
non-fatal-send wrapper are what keep the limit from causing damage.

---

## 7. Event editing

Editing exists today only as hand-editing `assets/data/events.json`:
`admin_server.py` exposes `POST /api/events` and nothing else — no update,
no delete — and `approve_request.py` only creates.

### `admin_server.py`

- `PUT /api/events/<uid>` — validates through the existing `validate_event`,
  then updates the record in place. **`uid` and `created` are preserved and
  never regenerated** (§6).
- `cancelled` becomes an accepted boolean field on an event, defaulting to
  `false`. Cancelling is a flag, not a deletion, so attendees can be told and
  the Calendar can show the event struck through rather than having it
  silently vanish.
- Unit tests alongside the existing `tests/test_admin_server.py`, covering
  uid preservation, validation of an update, and the cancelled flag.

### `admin-events.html`

Grows a list of **upcoming events only** (past events are not editable and
would only clutter the form), each with edit and a cancel toggle.

**Publish stays a separate action** from saving. An unpushed edit does
nothing — Pages serves the committed file — so pushing is the point, but a
tool that pushes on every save makes a mistake public before it can be
reviewed. Publish commits and pushes explicitly. This is the first time
`admin_server.py` invokes `git`, and it is confined to that one action.

### Validation workflow

A GitHub Action running on pushes that touch `assets/data/events.json`,
validating every record through `admin_server.validate_event` and failing
loudly on a malformed one. Hand-editing remains a legitimate path, and
nothing currently prevents a bad edit from breaking the Calendar for every
visitor.

---

## 8. Site changes for `cancelled`

- `calendar.js` renders a cancelled event struck through, not hidden —
  someone who RSVP'd should be able to see it's off.
- `statusbar.js` skips cancelled events when choosing the next scheduled
  one, so the bar never advertises something that isn't happening.
- The Calendar detail pane gains the attendee count from `doGet` (§5),
  fetched when the pane opens. A deliberate click absorbs the measured
  ~1s Apps Script latency far better than a page load would; rendering is
  progressive, so event details appear immediately and the count fills in.
- The detail pane also gains the RSVP link to `rsvp.html?uid=<uid>`.

---

## 9. Kit tags needed

`event-rsvp` — created in Kit before deployment, as `kitUpsertAndTag_`
requires a tag to already exist. Per-event tags are deliberately avoided:
Kit would accumulate one tag per event forever, and the Sheet already holds
which event each RSVP is for.

---

## 10. Out of scope

- **Attendee names on the site.** The public sees a count. Names become a
  members-only view once member identity exists — that project is a
  magic-link sign-in (email a one-time token via `MailApp`, exchange it for
  a session, validate it in `doGet`), deliberately deferred and specified
  separately. Checking an email against Kit is **not** authentication: an
  email address is not a secret, and doing it client-side would leak whether
  any given address is subscribed.
- **Event capacity.** `events.json` has no capacity concept and build nights
  are soft-limited in practice. An optional `capacity` field with a
  submit-time "full" check can be added later without disturbing this design.
- **Payment or ticketing** of any kind.
- **RSVP for courses.** Training has its own request pipeline and its own
  seat counts; this design covers Calendar events only.
- **A no-JS RSVP path** — see §3.
- **A member roster in this repo.** The membership design's §8 exclusion
  still stands. This design does not breach it: the only attendance data
  reaching `assets/data/` is the `cancelled` flag on an event, which is a
  property of the event, not of a person.
