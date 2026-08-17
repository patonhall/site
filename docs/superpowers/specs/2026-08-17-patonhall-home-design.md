# Paton Hall — Home Page Design

**Date:** 2026-08-17
**Scope:** The Home page only, built to a finished standard, as the reference
implementation the remaining pages will be cloned from.
**Deploy target:** GitHub Pages, static, no build step.

---

## 1. Goal

Reproduce the aesthetic of `mockups_AUG17/Untitled-2026-08-17-0855.png` faithfully
enough that the rendered page and the mockup are hard to tell apart at 1722×1204.

The aesthetic is Excalidraw's: hand-drawn strokes, flat fills, generous whitespace,
a small palette. The intent is "fun but professional" — appropriate for a community
hardware hub that is also a place of formal training and peer education. Drawing is
the core idea of the site, not decoration applied to it.

**Restraint is a requirement, not a default.** Wobble is minimal and static. There
are no animations anywhere on the page — no hover jitter, no stroke re-rolls, no
transitions on the drawn elements.

---

## 2. Source material

Thirteen mockups exist in `mockups_AUG17/`. Only the first is in scope:

| File | Screen | In scope |
|---|---|---|
| `…-0855.png` | **Home** | **Yes** |
| `…-08551.png` | Membership | No |
| `…-0856.png` | Calendar (agenda view) | No |
| `…-08562.png` | Training | No |
| `…-08563.png` | Services | No |
| `…-085634.png` | Updates (index) | No |
| `…-0856345.png` | IPC-A-610 (course detail) | No |
| `…-08563456.png` | Updates (post detail) | No |
| `…-085634567.png` … `…-0856345671234.png` | Paton Hall Inc. sub-site (5 pages) | No |

The out-of-scope mockups still inform the token set, because the design system must
extend to them without rework. Specifically: page background is tintable (Calendar is
mint, the Inc. sub-site is yellow), the right rail is reused for section navigation,
and the active-nav fill colour varies by page.

### Known defects in the mockups

These are draft errors and are **not** to be reproduced:

1. **Address typos.** Mockups read `4 Breadarlane, Hamilton, Ontario L84 3E9`. The
   correct address, per the supplied Google Maps link, is
   **`4 Breadalbane St, Hamilton, Ontario L8R 3E9`**.
2. **Inconsistent active nav.** Across mockups the highlighted nav item does not match
   the page shown (the Services page highlights *Membership*). On Home, the active item
   is **Paton Hall**, filled `blue-3`.

---

## 3. Design tokens

### Colour

The mockup palette is [Open Color](https://yeun.github.io/open-color/), which is the
palette Excalidraw itself uses. Tokens are named accordingly so future pages can pull
any Excalidraw swatch and match exactly.

| Token | Value | Open Color | Used for |
|---|---|---|---|
| `--ink` | `#1b1b1f` | — | All strokes and body text |
| `--paper` | `#ffffff` | — | Page background (Home) |
| `--blue-3` | `#a5d8ff` | blue-3 | Active nav fill (Home) |
| `--yellow-3` | `#ffec99` | yellow-3 | Active nav fill (other pages), garage icon |
| `--green-0` | `#ebfbee` | green-0 | Status bar background |
| `--green-7` | `#2f9e44` | green-7 | Status bar event dot |
| `--cyan-9` | `#0b7285` | cyan-9 | Section rule, emphasis paragraph |
| `--panel` | `#1f2933` | — | Subscribe panel background |
| `--panel-field` | `#f2efe6` | — | Form input fill |
| `--panel-btn` | `#f5ecd7` | — | Submit button fill |

### Type

Excalidraw ships exactly three faces. The mockups use all three in their intended
roles, plus a serif confined to the Subscribe panel.

| Token | Face | Used for |
|---|---|---|
| `--font-display` | Excalifont | `<h1>`, section headings |
| `--font-body` | Nunito | Body paragraphs, address, footer |
| `--font-mono` | Comic Shanns Mono | Nav buttons, facility list, form labels, button, status bar |
| `--font-serif` | serif stack | Subscribe panel heading and lead line only |

Fonts are **self-hosted** as `.woff2` under `assets/fonts/`. Licences must be verified
before commit; if any face cannot be redistributed, substitute the nearest permissively
licensed alternative and record the substitution in `README.md`. No external font CDN —
the page must render correctly offline and with no third-party requests.

---

## 4. Layout

Desktop-only for this pass, by explicit decision. The frame carries a `min-width`;
below it the page scrolls horizontally rather than reflowing. Breakpoint hooks are
left in `site.css` as commented stubs so mobile is a later edit and not a rewrite.

```
┌─ .frame ───────────────────────────────────────────────────────┐
│ ┌────────┬──────────────────────────┬────────────────────────┐ │
│ │ .rail  │ .main                    │ .aside                 │ │
│ │ 200px  │ ~890px                   │ ~460px                 │ │
│ │        │                          │                        │ │
│ │ nav    │ h1  PATON HALL           │ [ front.jpg ]          │ │
│ │ btns   │ intro paragraph          │ address                │ │
│ │        │ ─── teal rule ───        │ DIRECTIONS →           │ │
│ │ social │ body paragraphs ×2       │                        │ │
│ │ icons  │ teal emphasis note ×3    │ facility list (mono)   │ │
│ │        │ ┌ subscribe panel ─────┐ │                        │ │
│ │        │ └──────────────────────┘ │                        │ │
│ │ garage │ footer line              │                        │ │
│ └────────┴──────────────────────────┴────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
┌─ .statusbar (pinned, outside scroll) ──────────────────────────┐
│ ● 11:30-5pm – EPTAC Course …        TUESDAY OCTOBER 20th 2026 ☀ │
└────────────────────────────────────────────────────────────────┘
```

CSS Grid throughout. `.rail` is sticky; `.statusbar` is fixed to the viewport bottom
and sits outside the scrolling region. The garage icon pins to the bottom of `.rail`.

---

## 5. The sketch layer

The single interesting component, and the thing that makes or breaks fidelity.

### Dependency

[Rough.js](https://roughjs.com/), vendored to `vendor/rough.min.js` (~20KB). This is
the library Excalidraw renders with; using it is what makes the strokes read as drawn
rather than as smooth CSS curves.

### Contract

`assets/js/sketch.js` knows nothing about the page. It reads attributes and draws.

```html
<a class="nav-btn" data-sketch="box" data-sketch-fill="var(--blue-3)">Paton Hall</a>
<a class="social"  data-sketch="circle">…</a>
<div class="frame" data-sketch="frame">…</div>
<svg class="garage" data-sketch="garage">…</svg>
```

| Attribute | Effect |
|---|---|
| `data-sketch="box"` | Rough rounded rectangle drawn behind the element |
| `data-sketch="circle"` | Rough circle (social glyph rings) |
| `data-sketch="frame"` | The outer page border |
| `data-sketch="garage"` | The garage glyph, stroked segment by segment |
| `data-sketch-fill="<colour>"` | Adds a hachure-free solid fill behind the stroke |

For each matched element the script injects an absolutely-positioned `<svg>` sized to
the element's border box, behind its content, `pointer-events: none`, `aria-hidden`.

### Rendering parameters

```js
{ roughness: 0.9, bowing: 0.6, strokeWidth: 1.6, fillStyle: 'solid', seed: <derived> }
```

`roughness` and `bowing` are deliberately well below Rough.js defaults (`1` and `1`)
to satisfy the minimal-wobble requirement while retaining broken-stroke texture.

**The seed is derived from the element's index in the `[data-sketch]` collection**, not
random. Rough.js otherwise re-rolls its randomness on every call, so any redraw would
visibly twitch every border on the page. A derived seed makes each element's wobble a
fixed property of that element — it draws identically on every load and every resize.

### Redraw

`ResizeObserver` on each sketched element, debounced to one animation frame. Redraw
only on size change. No redraw on hover, focus, scroll, or a timer.

### Degradation

Every sketchable element carries a plain CSS border by default:

```css
[data-sketch] { border: 1.6px solid var(--ink); border-radius: 6px; }
.sketched [data-sketch] { border-color: transparent; }
```

`sketch.js` adds `.sketched` to `<html>` **only after it has successfully drawn**. So:

- Script 404s, is blocked, throws, or JS is off → page renders complete with clean
  borders. It degrades to plain, never to borderless.
- Script succeeds → the swap from CSS borders to drawn ones happens in a single style
  recalculation on one element, so there is no visible pop.

If `rough` is undefined or any draw throws, the script bails without setting the class.

### Garage icon

The garage glyph is authored as a set of line/path segments in `sketch.js` (roof line,
bay opening, door slats, side wall, window) and drawn with the same Rough.js pen as
everything else, inside a rough circle filled `--yellow-3`. It is not a raster image
and not a pre-drawn SVG — it is drawn by the same code path as the boxes, so its
stroke weight and texture match the rest of the page exactly.

It links to the Paton Hall Inc. sub-site (`#` placeholder for now), matching the
footer's "Click garage icon for more info."

---

## 6. Content

All copy is transcribed verbatim from the Home mockup except the address correction
noted in §2.

**Nav:** Paton Hall *(active)*, Membership, Calendar, Training, Services, Updates, Maps
**Social:** email, Discord, Instagram, X, phone

### Links

| Target | URL |
|---|---|
| X / Twitter | `https://x.com/_paton_hall_` |
| DIRECTIONS | The supplied Google Maps place URL for 4 Breadalbane St |
| Email | `mailto:paton@babb.tel` |
| All other nav and social | `#` placeholder |

Placeholder links get `aria-disabled="true"` and a `TODO` comment so they are trivially
greppable, and do not read as working links to assistive technology.

### Facility list (right rail, mono)

Pool Table · Work Tables & Benches · Assembly Zones · Blackboard | Whiteboard ·
Tools & Storage Bins · Certified Training · Peer Education · Talks & Meetups ·
Demos & Launches

### Status bar

Left: `● 11:30-5pm – EPTAC Course (IPC-A-610 Specialist) @ABCD | Pool Table Closed`
Right: `TUESDAY OCTOBER 20th 2026 ☀`

Both are **static text** in this pass, reproducing the mockup exactly. They are marked
with a `TODO` noting they become data-driven when the Calendar is built.

---

## 7. Subscribe form

Marked up and styled exactly as drawn: `NAME`, `EMAIL`, a `WHAT BRINGS YOU HERE`
select, a `PUT ME ON THE LIST` submit, and the fine-print line.

The site is deployed to Kit.com (ConvertKit), which the existing Paton Hall site
already uses. **The endpoint is not available yet** and will be supplied at the end of
site design. Therefore:

- The `<form>` carries a placeholder `action` and a `<!-- KIT.COM: replace action and
  confirm field names -->` marker.
- Field `name` attributes use Kit's conventions (`email_address`, `fields[name]`) so
  swapping the endpoint in is a one-line change.
- Until an endpoint exists the submit handler **must not pretend to succeed.** It shows
  an inline "not connected yet" message. Silently swallowing a submission would lose
  real signups.

The select's only confirmed option is `Build nights`, the value shown in the mockup.
Remaining options are a **TODO for the user to confirm**; the field ships with
`Build nights` plus plausible siblings, clearly marked in a comment.

---

## 8. File structure

```
patonhall-excalisite/
├── index.html
├── assets/
│   ├── css/site.css
│   ├── js/sketch.js
│   ├── fonts/*.woff2
│   ├── img/front.jpg
│   └── favicon.svg
├── vendor/rough.min.js
├── docs/superpowers/specs/
├── mockups_AUG17/          (reference, committed)
├── .nojekyll
└── README.md
```

`.nojekyll` prevents GitHub Pages from running Jekyll, which would otherwise ignore any
future underscore-prefixed paths. `front.jpg` moves from `assets/` to `assets/img/`.

---

## 9. Verification

This is a static page whose requirement is visual fidelity, so verification is visual
and must be done before claiming completion:

1. Serve locally, render at **1722×1204** — the mockup's exact dimensions.
2. Screenshot and compare against `Untitled-2026-08-17-0855.png` region by region:
   rail, heading, rule, body block, emphasis note, subscribe panel, right rail,
   status bar. Fix drift.
3. Confirm degradation: load with JS disabled and verify the page is complete with
   plain borders.
4. Confirm stability: reload several times and resize, and verify no border changes
   shape and nothing animates.
5. Validate HTML, and confirm no external network requests are made.

---

## 10. Explicitly out of scope

- All twelve other mockups.
- Any responsive or mobile layout.
- A live Kit.com endpoint.
- Real URLs for Discord, Instagram, phone, and the Maps/Membership/Calendar/Training/
  Services/Updates pages.
- Any dynamic behaviour in the status bar.
- Dark mode. The mockups define no dark palette, and inventing one risks diverging
  from the aesthetic before it is established.
