# Paton Hall

Static site for Paton Hall — an industrial hub in downtown Hamilton, Ontario.

The visual style reproduces the Excalidraw mockups in `mockups_AUG17/`.

## Running locally

    python3 -m http.server 8017

Then open <http://localhost:8017>. There is no build step.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | The home page |
| `assets/css/site.css` | All styling; design tokens live at the top |
| `assets/js/sketch.js` | Draws every hand-drawn border via Rough.js |
| `vendor/rough.min.js` | Rough.js 4.6.6, vendored |
| `assets/fonts/` | Self-hosted fonts + licence notes |
| `docs/superpowers/` | Design spec and implementation plan |
| `mockups_AUG17/` | The source mockups, kept as the fidelity reference |
| `patonhall-1stsite/` | The existing live site, for reference (not committed) |

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

This repository currently implements **the home page only**, as the reference
implementation the remaining twelve screens will be cloned from. Desktop-only
by decision; empty responsive stubs sit at the bottom of `site.css` so mobile
is a later edit rather than a restructure.

## Open items

- **Placeholder links** — Membership, Calendar, Training, Services, Updates,
  Maps, Discord, Instagram, phone, the garage glyph, and the status bar all
  point at `#`. Search `TODO`.
- **Status bar** — shows what is on at the hub and opens the Calendar when
  clicked. The event text is static for now; it becomes data-driven when the
  Calendar is built.
- **Phone number** — not yet supplied.
- **Mobile** — not implemented, see Scope above.
- **Site aerial** — `assets/img/site-aerial.webp` (187KB) and `.jpg` (412KB)
  are web-sized renditions of the floor-plan-on-aerial overlay, ready for the
  Maps page. Serve the WebP with the JPEG as `<picture>` fallback. The 26MB
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
