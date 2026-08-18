# Paton Hall

Static site for Paton Hall — an industrial hub in downtown Hamilton, Ontario.

The visual style reproduces the Excalidraw mockups in `mockups_AUG17/`.

## Running locally

    python3 build.py
    python3 -m http.server 8017

Then open <http://localhost:8017>.

To add Calendar events, run `python3 admin_server.py` instead of the plain
`http.server` command above — it serves the site identically, plus a local write
endpoint at `/api/events` that `admin-events.html` (unlinked; visit it directly)
uses to append to `assets/data/events.json`. Nobody else's workflow changes —
anyone not adding events keeps using plain `http.server`.

Pages are assembled from `src/` by `build.py` and the output is committed, so
GitHub Pages serves plain static files — the build is a development
convenience, never a runtime dependency. **Edit `src/`, not the root `.html`
files; they are overwritten.** `python3 build.py --check` exits non-zero if the
output is stale.

## Structure

| Path | Purpose |
|---|---|
| `src/_shell.html` | The frame, left rail and status bar — shared by every page |
| `src/*.html` | One content file per page, with front matter for title and nav |
| `build.py` | Assembles `src/` into the page files at the repo root |
| `*.html` | Generated output, committed; this is what Pages serves |
| `assets/css/site.css` | All styling; design tokens live at the top |
| `assets/js/sketch.js` | Draws every hand-drawn border via Rough.js |
| `assets/js/statusbar.js` | Fills the persistent bottom bar with today's date and the next scheduled event from `events.json` |
| `admin_server.py` | Local write-capable dev server — static files plus `POST /api/events` |
| `assets/data/events.json` | Calendar events; written by `admin_server.py`, read at runtime by `calendar.html` |
| `assets/js/spaces.js` | Shared A–I space list; loaded by the shell on every page, so the status bar, Calendar, Book Space and admin form all name a space the same way |
| `assets/js/calendar.js` | Renders the Calendar's agenda and detail pane from `events.json` |
| `assets/js/admin-events.js` | Handles `admin-events.html`'s form and its `POST /api/events` submission |
| `tests/test_admin_server.py` | Unit tests for `admin_server.py`'s validation, uid generation, and file I/O |
| `assets/data/course-categories.json` | Training category names; admin-writable via `admin-courses.html`, read by both the admin form and `training.html` |
| `assets/data/courses.json` | Scheduled Training courses; written by `admin_server.py`, read at runtime by `training.html` |
| `assets/js/courses.js` | Renders Training's live course list and category filter from `courses.json` |
| `assets/js/admin-courses.js` | Handles `admin-courses.html`'s form and its `POST /api/courses` submission |
| `vendor/rough.min.js` | Rough.js 4.6.6, vendored |
| `assets/fonts/` | Self-hosted fonts + licence notes |
| `docs/superpowers/` | Design spec and implementation plan |
| `mockups_AUG17/` | The source mockups, kept as the fidelity reference |

## Design notes

- Colours are [Open Color](https://yeun.github.io/open-color/), the palette
  Excalidraw uses. Tokens are named to match, so any Excalidraw swatch can be
  pulled in and will match exactly.
- Type is Lilita One (display), Nunito (body) and Comic Shanns Mono (nav,
  lists, status bar). All three are faces Excalidraw itself bundles. See
  `assets/fonts/README.md` — including why Excalifont is deliberately absent.
- The hand-drawn borders are rendered by Rough.js at low roughness
  (`0.9`/`0.6`) with per-element seeds derived from element index, so a border
  draws identically on every load and every resize. **There are no animations
  anywhere on this site.**
- If JavaScript fails or is disabled, every drawn border falls back to a plain
  CSS border and every fill falls back to a CSS background. The page never
  renders borderless.
- The page background and the active-nav fill are single tokens, because the
  other mockups retint them — Calendar is mint, the Paton Hall Inc. sub-site
  is yellow.

## Booking & training request pipeline

`book-space.html` and `training-signup.html` are public request forms that
submit to Google Forms (`google-apps-script/*.gs` are the processors bound
to their linked Sheets — pasted into Apps Script's editor, not run from
this repo). On submit, Apps Script updates the requester in Kit (tag, no
Kit-hosted form involved), checks the request against the repo's live
`events.json`/`courses.json`, and opens a GitHub Issue with the result —
closed immediately if clear. Adding the `approved` label to that issue
triggers `.github/workflows/approve-request.yml`, which runs
`scripts/approve_request.py` to parse the issue's hidden data block,
validate it through the same `admin_server.py` functions the admin forms
use, write the real event/course, commit, push, and close the issue.
Nothing here bypasses `admin-events.html`/`admin-courses.html` as the
source of truth — this pipeline only automates getting a request in front
of an admin with the checking already done, and turns one label into the
same write those forms would have made by hand.

Full design, the exact Google Form field mappings, and Apps Script
deployment steps: `docs/superpowers/specs/2026-08-18-patonhall-booking-training-requests-design.md`.

The homepage's signup form (`index.html`) follows the same shape for a
third case — joining the mailing list, or pre-committing as a Member or
Founder — via `google-apps-script/homepage-signup.gs`. It's simpler than
the booking/training pipeline: there's no repo data type for members, so
this one only opens a notification GitHub Issue (tiered labels
`tier:list`/`tier:member`/`tier:founder`) for an admin to follow up on —
no embedded data block, no `approved`-label write-back. Design:
`docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md`.
Email copy for Kit's own automations lives in `main-copy.md`, not this
README.

Requires the `KIT_API_KEY` and `GITHUB_TOKEN` Script Properties set on each
Apps Script project (not GitHub secrets — see the specs), and, in Kit, the
tags `booking-request`, `booking-approved`, `booking-conflict`,
`training-requested`, `training-reviewed`, `list-subscriber`,
`member-precommit`, `founder-interest` already existing.

## Scope

All fourteen pages are built: home, Membership, Calendar, Training, Services,
Updates, a course detail, a post detail, Maps, and the five Paton Hall Inc.
sub-site pages.

Two of these are **static views of applications that do not exist yet**:

- **Calendar** renders a live 14-day agenda from `assets/data/events.json`, with
  click-to-select event detail. Adding events requires running `admin_server.py`
  locally (see Running locally); there is no public booking flow yet. View
  switching (3-Day/Week/Month), space booking and sign-in are still inert
  placeholders.
- **Training** renders a live course list from `assets/data/courses.json`,
  filterable by category via the sidebar (ALL by default, matching
  `assets/data/course-categories.json`). Adding courses requires running
  `admin_server.py` locally (see Running locally) via `admin-courses.html`;
  there is no public self-service registration — seat counts are updated by
  hand as people register through other channels.

Desktop-only by decision; empty responsive stubs sit at the bottom of
`site.css` so mobile is a later edit rather than a restructure.

## Open items

- **Calendar application** — view switching, booking and sign-in. Adding events
  and viewing the live agenda are built; see
  `docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`.
- **Training sign-up** — no public self-service registration; an admin
  updates `seatsFilled` in `assets/data/courses.json` by hand as people
  register elsewhere. Adding and listing courses is built; see
  `docs/superpowers/specs/2026-08-17-patonhall-training-design.md`.
- **Inc. sub-site: Reports, Papers, Links** — in the section rail, no content
  or mockup yet.
- **Placeholder links** — Discord, Instagram, phone, the Updates filters, and
  the IPC-A-610 data sheet. Search `TODO`.
- **Phone number** — not yet supplied.
- **Mobile** — not implemented, see Scope above.
- **Site aerial** — `assets/img/site-aerial.webp` (187KB) with `.jpg` (412KB)
  as `<picture>` fallback is in use on the Maps page. The 26MB
  7482×5809 original stays on disk at
  `assets/paton-with-google-earth-two.png`, git-ignored; regenerate from it
  with:

      magick assets/paton-with-google-earth-two.png -resize 2400x -strip \
        -quality 80 assets/img/site-aerial.webp

The homepage's `.signup` panel is a tiered membership/founders signup form.
`assets/js/homepage-signup.js` submits it in the background to a Google Form
(`homepage-signup`); `google-apps-script/homepage-signup.gs` processes each
response by upserting and tagging the subscriber in Kit via its API (no
direct Kit-hosted form post) and opening a GitHub Issue for admin follow-up.
See `docs/superpowers/specs/2026-08-18-patonhall-membership-signup-design.md`
for the full design.

## Deployment

Live at <https://patonhall.github.io/site/>, in `patonhall/site` under the
`patonhall` GitHub org. GitHub Pages, served from the repository root.
`.nojekyll` is in place so Pages does not run Jekyll — the static build
(`build.py`) is still a local development convenience, never a runtime
dependency. `.github/workflows/approve-request.yml` is the one Actions
workflow that does exist, for the booking/training request pipeline (see
above); it plays no part in serving the site itself.

Note: `babbworks/patonhall` (a separate, older repo — business-case docs, not
this site) owns a `CNAME` pointing at `paton.babb.tel`. A custom domain for
this site (e.g. `patonhall.ca`, set as the `patonhall` org's profile URL) is
a deliberate future decision, not something set up automatically here.
