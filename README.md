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
| `admin_server.py` | Local write-capable dev server — static files plus `POST /api/events` |
| `assets/data/events.json` | Calendar events; written by `admin_server.py`, read at runtime by `calendar.html` |
| `assets/js/spaces.js` | Shared A–I space list, used by the admin form and the Calendar |
| `assets/js/calendar.js` | Renders the Calendar's agenda and detail pane from `events.json` |
| `assets/js/admin-events.js` | Handles `admin-events.html`'s form and its `POST /api/events` submission |
| `tests/test_admin_server.py` | Unit tests for `admin_server.py`'s validation, uid generation, and file I/O |
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
- **Training** lists the courses. Enrolment and sign-up are not built.

Desktop-only by decision; empty responsive stubs sit at the bottom of
`site.css` so mobile is a later edit rather than a restructure.

## Open items

- **Calendar application** — view switching, booking and sign-in. Adding events
  and viewing the live agenda are built; see
  `docs/superpowers/specs/2026-08-17-patonhall-calendar-design.md`.
- **Training sign-up** — enrolment for the listed courses.
- **Inc. sub-site: Reports, Papers, Links** — in the section rail, no content
  or mockup yet.
- **Placeholder links** — Discord, Instagram, phone, the Updates filters, and
  the IPC-A-610 data sheet. Search `TODO`.
- **Status bar** — shows what is on at the hub and opens the Calendar when
  clicked. The event text is still static; wiring it to
  `assets/data/events.json` is future work, separate from the Calendar agenda
  itself.
- **Phone number** — not yet supplied.
- **Mobile** — not implemented, see Scope above.
- **Site aerial** — `assets/img/site-aerial.webp` (187KB) with `.jpg` (412KB)
  as `<picture>` fallback is in use on the Maps page. The 26MB
  7482×5809 original stays on disk at
  `assets/paton-with-google-earth-two.png`, git-ignored; regenerate from it
  with:

      magick assets/paton-with-google-earth-two.png -resize 2400x -strip \
        -quality 80 assets/img/site-aerial.webp

The subscribe panel is a reskin of the signup module from the existing site:
same markup, same field names, and the same Kit form endpoint
(`app.kit.com/forms/9788991/subscriptions`), so both sites feed one list.

## Deployment

GitHub Pages, served from the repository root. `.nojekyll` is in place so Pages
does not run Jekyll. No build step and no Actions workflow required.

Note: the existing `patonhall` repository owns a `CNAME`. If this site is to
take over that domain, that file has to move — a deliberate decision, not
something this repo does on its own.
