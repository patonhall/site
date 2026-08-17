# Paton Hall Home Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Paton Hall home page as a static, zero-build page that reproduces `mockups_AUG17/Untitled-2026-08-17-0855.png` faithfully at 1722×1204, in Excalidraw's hand-drawn aesthetic.

**Architecture:** A single `index.html` laid out with CSS Grid, styled by one stylesheet built on Open Color tokens and Excalidraw's three type faces. All hand-drawn strokes are produced at runtime by one self-contained script (`assets/js/sketch.js`) that reads `data-sketch` attributes and paints Rough.js SVGs behind elements. Every sketchable element carries a plain CSS border by default; drawn borders replace them only after the script succeeds, so JS failure degrades to plain rather than to borderless.

**Tech Stack:** Hand-written HTML5, CSS Grid, vanilla ES5-compatible JavaScript, [Rough.js](https://roughjs.com/) (vendored, ~20KB). No framework, no bundler, no build step. GitHub Pages serves the repo root.

**Spec:** `docs/superpowers/specs/2026-08-17-patonhall-home-design.md`

## Global Constraints

- **No build step.** GitHub Pages serves the repo root as-is. Nothing may require compiling, bundling, or transpiling.
- **No third-party network requests at runtime.** Fonts and Rough.js are self-hosted. The rendered page must make zero external requests.
- **No animation anywhere.** No CSS transitions, keyframes, or transforms on drawn elements. No hover jitter, no stroke re-rolls, no timers.
- **Minimal wobble.** Rough.js parameters are fixed at `roughness: 0.9, bowing: 0.6, strokeWidth: 1.6`. Do not raise these.
- **Deterministic strokes.** Seeds derive from element index. A given element must draw byte-identically on every load and every resize.
- **Desktop-only.** The frame carries `min-width: 1700px`. Below that the page scrolls horizontally. Do not add responsive breakpoints; leave commented stubs only.
- **Degrade to plain, never to borderless.** CSS borders are the default; `.sketched` on `<html>` suppresses them and is set only after a successful draw.
- **Address is `4 Breadalbane St, Hamilton, Ontario L8R 3E9`.** The mockups' `Breadarlane` / `L84` are typos and must not be reproduced. Confirmed by the user.
- **The subscribe form must never fake success.** Until a Kit.com endpoint exists, submission shows an inline "not connected yet" message.
- **Copy is verbatim from the mockup**, except the address correction above.
- **Reference dimensions: 1722×1204.** All visual comparison happens at this size.

---

### Task 1: Scaffold, tokens, and self-hosted fonts

Establishes the page shell, the full token set, and typography. Deliverable: a page that loads, makes no external requests, and renders each of the four type faces correctly.

**Files:**
- Create: `index.html`
- Create: `assets/css/site.css`
- Create: `assets/fonts/` (populated with `.woff2` files and licences)
- Create: `.nojekyll`
- Create: `README.md`
- Move: `assets/front.jpg` → `assets/img/front.jpg`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: CSS custom properties on `:root` consumed by every later task — `--ink`, `--paper`, `--blue-3`, `--yellow-3`, `--green-0`, `--green-7`, `--cyan-9`, `--panel`, `--panel-field`, `--panel-btn`, `--font-display`, `--font-body`, `--font-mono`, `--font-serif`. Font family names as declared in `@font-face`: `Excalifont`, `Nunito`, `Comic Shanns Mono`.

- [ ] **Step 1: Fetch the font packages and inspect their licences**

Excalidraw's three faces plus Nunito. `npm pack` is used because it yields the licence files alongside the fonts, which we must verify before redistributing.

```bash
cd /home/morgen/making/patonhall-excalisite
mkdir -p /tmp/phfonts && cd /tmp/phfonts
npm pack @excalidraw/excalidraw@latest
npm pack @fontsource/nunito@latest
for f in *.tgz; do tar xzf "$f"; done
find . -name '*.woff2' | grep -iE 'excalifont|comic|nunito'
find . -iname 'LICENSE*' -o -iname '*OFL*' | head
```

Expected: `woff2` files for Excalifont and Comic Shanns Mono under the Excalidraw package, Nunito woff2 files under `package/files/`, and licence files present.

- [ ] **Step 2: Verify each licence permits redistribution, then copy the fonts**

Read each licence found. Nunito is SIL OFL 1.1. Excalifont and Comic Shanns Mono ship with Excalidraw — confirm each is OFL or similarly permissive.

**If any face's licence does not permit redistribution**, substitute the nearest permissively licensed alternative, and record the substitution and the reason in `README.md`. Do not silently ship a font we cannot redistribute, and do not fall back to a font CDN.

Copy by search rather than by hardcoded path, since the packages' internal
layout varies between versions:

```bash
cd /home/morgen/making/patonhall-excalisite
DEST="$PWD/assets/fonts"

# Excalifont and Comic Shanns Mono, from the Excalidraw package.
find /tmp/phfonts -iname '*xcalifont*.woff2'      -exec cp {} "$DEST/" \;
find /tmp/phfonts -iname '*omic*hanns*.woff2'     -exec cp {} "$DEST/" \;

# Nunito latin, weights 400 and 600 only — we use no others.
find /tmp/phfonts -iname 'nunito-latin-400-normal.woff2' -exec cp {} "$DEST/" \;
find /tmp/phfonts -iname 'nunito-latin-600-normal.woff2' -exec cp {} "$DEST/" \;

# Licences travel with the fonts.
find /tmp/phfonts \( -iname 'LICENSE*' -o -iname '*OFL*' \) -not -path '*/node_modules/*' \
  -exec sh -c 'cp "$1" "$2/LICENSE-$(basename $(dirname $(dirname "$1")))"' _ {} "$DEST" \;

ls -la "$DEST"
```

Then rename whatever the Excalidraw package actually shipped to the exact
filenames the stylesheet expects in Step 4:

```bash
cd assets/fonts
# Adjust the left-hand side to the real filenames listed above.
mv *xcalifont*.woff2  Excalifont-Regular.woff2  2>/dev/null
mv *omic*hanns*.woff2 ComicShannsMono-Regular.woff2 2>/dev/null
ls
```

Expected final contents: `Excalifont-Regular.woff2`,
`ComicShannsMono-Regular.woff2`, `nunito-latin-400-normal.woff2`,
`nunito-latin-600-normal.woff2`, and at least one licence file.

- [ ] **Step 3: Move the building photo into place**

```bash
cd /home/morgen/making/patonhall-excalisite
mkdir -p assets/img
git mv assets/front.jpg assets/img/front.jpg 2>/dev/null || mv assets/front.jpg assets/img/front.jpg
ls assets/img/
```

- [ ] **Step 4: Write `assets/css/site.css` with font faces, tokens, and the base reset**

```css
/* ==========================================================================
   Paton Hall — site.css
   Aesthetic: Excalidraw. Palette: Open Color. Fonts: Excalidraw's own three,
   plus a serif confined to the subscribe panel.
   ========================================================================== */

/* --- Fonts. Self-hosted; no external requests. ---------------------------- */

@font-face {
  font-family: 'Excalifont';
  src: url('../fonts/Excalifont-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: block; /* block, not swap: a FOUT would flash the wrong aesthetic */
}

@font-face {
  font-family: 'Comic Shanns Mono';
  src: url('../fonts/ComicShannsMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: block;
}

@font-face {
  font-family: 'Nunito';
  src: url('../fonts/nunito-latin-400-normal.woff2') format('woff2');
  font-weight: 400;
  font-display: block;
}

@font-face {
  font-family: 'Nunito';
  src: url('../fonts/nunito-latin-600-normal.woff2') format('woff2');
  font-weight: 600;
  font-display: block;
}

/* --- Tokens --------------------------------------------------------------- */

:root {
  /* Colour. Named after Open Color, the palette Excalidraw uses, so future
     pages can pull any Excalidraw swatch and match exactly. */
  --ink:         #1b1b1f;
  --paper:       #ffffff;
  --blue-3:      #a5d8ff;
  --yellow-3:    #ffec99;
  --green-0:     #ebfbee;
  --green-7:     #2f9e44;
  --cyan-9:      #0b7285;
  --panel:       #1f2933;
  --panel-field: #f2efe6;
  --panel-btn:   #f5ecd7;

  /* Page background is a token, not a literal: Calendar is mint and the
     Inc. sub-site is yellow, so later pages retint by overriding this. */
  --page-bg: var(--paper);

  /* Active nav fill is a token for the same reason: blue on Home,
     yellow elsewhere. */
  --nav-active-fill: var(--blue-3);

  /* Type */
  --font-display: 'Excalifont', 'Segoe Print', cursive;
  --font-body:    'Nunito', system-ui, -apple-system, sans-serif;
  --font-mono:    'Comic Shanns Mono', ui-monospace, 'Cascadia Mono', monospace;
  --font-serif:   Georgia, 'Iowan Old Style', 'Times New Roman', serif;

  /* Stroke geometry, shared between CSS fallback borders and sketch.js so the
     two stay visually interchangeable. */
  --stroke-w: 1.6px;
  --radius:   8px;
}

/* --- Reset ---------------------------------------------------------------- */

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--page-bg);
  color: var(--ink);
}

body {
  font-family: var(--font-body);
  font-size: 17px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

img { max-width: 100%; display: block; }

a { color: inherit; }
```

- [ ] **Step 5: Write the `index.html` shell**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=1722">
<title>Paton Hall — Industrial hub in downtown Hamilton</title>
<meta name="description" content="An industrial hub in downtown Hamilton focused on electronics, machinery, robotics, peer education, industrial certifications, product demos and launches.">
<link rel="stylesheet" href="assets/css/site.css">
</head>
<body>

<!-- Font specimen block. Task 2 replaces this entirely. -->
<div style="padding:40px">
  <p style="font-family:var(--font-display); font-size:48px">Excalifont — PATON HALL</p>
  <p style="font-family:var(--font-body)">Nunito — An industrial hub in downtown Hamilton.</p>
  <p style="font-family:var(--font-mono)">Comic Shanns Mono — Pool Table</p>
  <p style="font-family:var(--font-serif)">Serif — Receive progress updates.</p>
</div>

<script src="vendor/rough.min.js" defer></script>
<script src="assets/js/sketch.js" defer></script>
</body>
</html>
```

Note: the two `<script>` tags reference files that do not exist until Task 5. `defer` scripts that 404 fail silently and do not block rendering — this is intentional and is the same degradation path the page relies on in production.

- [ ] **Step 6: Add `.nojekyll`, the favicon, and `README.md`**

`.nojekyll` is an empty file. It stops GitHub Pages running Jekyll, which would otherwise ignore underscore-prefixed paths.

```bash
cd /home/morgen/making/patonhall-excalisite
touch .nojekyll
```

The favicon is a static hand-drawn garage in the same yellow, authored directly
rather than generated by Rough.js — a favicon is 16px and rendered outside the
page, so runtime drawing buys nothing. Create `assets/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60">
  <circle cx="30" cy="30" r="28" fill="#ffec99" stroke="#1b1b1f" stroke-width="2.5"/>
  <path d="M12 25 L30 15 L48 25" fill="none" stroke="#1b1b1f" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M14 25 L14 46 L46 46 L46 25" fill="none" stroke="#1b1b1f" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="19" y="31" width="22" height="15" fill="none" stroke="#1b1b1f" stroke-width="2"/>
  <path d="M19 35 H41 M19 38.5 H41 M19 42 H41" stroke="#1b1b1f" stroke-width="1.5"/>
</svg>
```

Reference it from `index.html`'s `<head>`, alongside the stylesheet link:

```html
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
```

`README.md`:

```markdown
# Paton Hall

Static site for Paton Hall — an industrial hub in downtown Hamilton, Ontario.

Visual style reproduces the Excalidraw mockups in `mockups_AUG17/`.

## Running locally

    python3 -m http.server 8017

Then open <http://localhost:8017>. There is no build step.

## Structure

| Path | Purpose |
|---|---|
| `index.html` | The home page |
| `assets/css/site.css` | All styling; design tokens live at the top |
| `assets/js/sketch.js` | Draws every hand-drawn border via Rough.js |
| `vendor/rough.min.js` | Rough.js, vendored |
| `assets/fonts/` | Self-hosted fonts + licences |
| `docs/superpowers/` | Design spec and implementation plan |

## Design notes

- Colours are [Open Color](https://yeun.github.io/open-color/), the palette
  Excalidraw uses. Tokens are named to match.
- Fonts are Excalidraw's own three (Excalifont, Nunito, Comic Shanns Mono).
- Hand-drawn borders are rendered by Rough.js at low roughness with
  per-element fixed seeds, so nothing moves between loads. There are no
  animations on this site.
- If JavaScript fails or is disabled, every drawn border falls back to a
  plain CSS border. The page never renders borderless.

## Deployment

GitHub Pages, served from the repository root.
```

- [ ] **Step 7: Serve and verify fonts render with no external requests**

```bash
cd /home/morgen/making/patonhall-excalisite
python3 -m http.server 8017 &
sleep 1
curl -sI http://localhost:8017/ | head -1
curl -sI http://localhost:8017/assets/fonts/Excalifont-Regular.woff2 | head -1
```

Expected: `200 OK` for both.

Then open `http://localhost:8017` in the browser and confirm: four specimen lines each render in a visibly different face, the first is a hand-drawn style, and the DevTools Network panel shows **no requests to any third-party host**.

- [ ] **Step 8: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Add page scaffold, design tokens, and self-hosted fonts

Colour tokens named after Open Color, the palette Excalidraw uses.
Fonts are Excalidraw's own three plus a serif for the subscribe panel,
self-hosted so the page makes no third-party requests."
```

---

### Task 2: Layout skeleton

Builds the grid — frame, rail, main, aside, status bar — with plain CSS borders standing in for the drawn ones. Deliverable: correct page geometry at 1722×1204, no content yet.

**Files:**
- Modify: `index.html` (replace the specimen block from Task 1 Step 5)
- Modify: `assets/css/site.css` (append layout section)

**Interfaces:**
- Consumes: all `:root` tokens from Task 1.
- Produces: the DOM structure every later task fills in —
  `.frame` > `.rail` + `.main` + `.aside`, and `.statusbar` as a sibling of `.frame`.
  The `[data-sketch]` attribute convention and its CSS fallback border, consumed by Task 5.

- [ ] **Step 1: Replace the specimen block in `index.html` with the layout skeleton**

```html
<div class="frame" data-sketch="frame">

  <nav class="rail">
    <ul class="nav"><!-- Task 3 --></ul>
    <ul class="social"><!-- Task 3 --></ul>
    <a class="garage" href="#"><!-- Task 6 --></a>
  </nav>

  <main class="main">
    <!-- Task 3: heading, copy, rule, emphasis note -->
    <!-- Task 4: subscribe panel -->
    <!-- Task 3: footer line -->
  </main>

  <aside class="aside">
    <!-- Task 3: photo, address, directions, facility list -->
  </aside>

</div>

<footer class="statusbar">
  <!-- Task 3 -->
</footer>
```

- [ ] **Step 2: Append the layout section to `assets/css/site.css`**

```css
/* --- Sketchable elements --------------------------------------------------
   Every [data-sketch] element carries a plain border by default. sketch.js
   adds .sketched to <html> only after it has successfully drawn, and that is
   what suppresses these. So a JS failure degrades to plain, never to
   borderless. The class is on <html> rather than each element so the swap is
   one style recalculation instead of N.
   -------------------------------------------------------------------------- */

[data-sketch] {
  position: relative;          /* positioning context for the injected SVG */
  z-index: 0;                  /* stacking context, so the SVG's z-index:-1
                                  stays inside this element */
  border: var(--stroke-w) solid var(--ink);
  border-radius: var(--radius);
}

.sketched [data-sketch] { border-color: transparent; }

.sketch-svg {
  position: absolute;
  z-index: -1;                 /* behind this element's text, above its bg */
  pointer-events: none;
  overflow: visible;
}

/* --- Page frame ----------------------------------------------------------- */

body {
  min-width: 1700px;           /* desktop-only, by decision; below this the
                                  page scrolls horizontally rather than
                                  reflowing */
  padding: 12px 12px 52px;     /* bottom clears the fixed status bar */
}

.frame {
  display: grid;
  grid-template-columns: 200px minmax(0, 890px) minmax(0, 470px);
  column-gap: 60px;
  align-items: start;
  padding: 22px 28px 34px;
  min-height: calc(100vh - 76px);
  border-radius: 14px;
}

/* --- Left rail ------------------------------------------------------------ */

.rail {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  align-self: stretch;
}

.nav {
  list-style: none;
  margin: 0 0 34px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
}

.social {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.garage { margin-top: auto; }  /* pins to the bottom of the rail */

/* --- Main and aside ------------------------------------------------------- */

.main  { display: flex; flex-direction: column; align-items: flex-start; }
.aside { display: flex; flex-direction: column; align-items: flex-start; }

/* --- Status bar ----------------------------------------------------------- */

.statusbar {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  background: var(--green-0);
  border-top: var(--stroke-w) solid var(--ink);
  font-family: var(--font-mono);
  font-size: 15px;
  min-width: 1700px;
}

/* --- Responsive stubs -----------------------------------------------------
   Deliberately empty. Desktop-only was an explicit decision; these exist so
   adding mobile later is an edit rather than a restructure.

   @media (max-width: 1100px) { ... }
   @media (max-width: 700px)  { ... }
   -------------------------------------------------------------------------- */
```

- [ ] **Step 3: Verify geometry in the browser**

Serve, open at a 1722×1204 viewport, and confirm with DevTools:

- `.frame` spans the full width inside a 12px inset and shows a plain rounded border.
- The three grid columns measure approximately 200px / 890px / 470px.
- `.statusbar` is pinned to the viewport bottom, is 38px tall, and has the mint `--green-0` background.
- Nothing overlaps and no scrollbar appears at 1722px wide.

- [ ] **Step 4: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Add page layout grid and sketchable-element fallback borders

Three-column grid inside a framed page, with a pinned status bar.
Sketchable elements carry plain CSS borders that sketch.js suppresses
only after it draws successfully."
```

---

### Task 3: Content — rail, copy, aside, status bar

Fills every region with its real content and links. Deliverable: the complete page except the subscribe panel and the drawn strokes.

**Files:**
- Modify: `index.html`
- Modify: `assets/css/site.css`

**Interfaces:**
- Consumes: `.frame`/`.rail`/`.main`/`.aside`/`.statusbar` structure from Task 2; tokens from Task 1.
- Produces: `.nav-btn` elements carrying `data-sketch="box"` (the active one also carrying `data-sketch-fill="--nav-active-fill"`), and `.social a` elements carrying `data-sketch="circle"`. Task 5 consumes both.

- [ ] **Step 1: Fill the rail in `index.html`**

Placeholder links carry `aria-disabled="true"` and a `TODO` so they are greppable and do not read as working links to assistive technology.

```html
<ul class="nav">
  <li><a class="nav-btn is-active" href="./" data-sketch="box" data-sketch-fill="--nav-active-fill" aria-current="page">Paton Hall</a></li>
  <li><a class="nav-btn" href="#" data-sketch="box" aria-disabled="true">Membership</a></li><!-- TODO: link -->
  <li><a class="nav-btn" href="#" data-sketch="box" aria-disabled="true">Calendar</a></li><!-- TODO: link -->
  <li><a class="nav-btn" href="#" data-sketch="box" aria-disabled="true">Training</a></li><!-- TODO: link -->
  <li><a class="nav-btn" href="#" data-sketch="box" aria-disabled="true">Services</a></li><!-- TODO: link -->
  <li><a class="nav-btn" href="#" data-sketch="box" aria-disabled="true">Updates</a></li><!-- TODO: link -->
  <li><a class="nav-btn nav-btn--short" href="#" data-sketch="box" aria-disabled="true">Maps</a></li><!-- TODO: link -->
</ul>

<ul class="social">
  <li><a href="mailto:paton@babb.tel" data-sketch="circle" aria-label="Email Paton Hall">
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="17" font-family="var(--font-mono)" fill="currentColor">@</text></svg>
  </a></li>
  <li><a href="#" data-sketch="circle" aria-label="Discord" aria-disabled="true"><!-- TODO: link -->
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M19.3 5.3A16 16 0 0 0 15.4 4l-.2.4a15 15 0 0 0-6.4 0L8.6 4a16 16 0 0 0-4 1.3C2.1 9 1.4 12.6 1.7 16.1a16 16 0 0 0 4.9 2.5l.9-1.5a10 10 0 0 1-1.6-.8l.4-.3a11 11 0 0 0 9.4 0l.4.3c-.5.3-1 .6-1.6.8l.9 1.5a16 16 0 0 0 4.9-2.5c.4-4-.7-7.6-2.9-10.8ZM8.3 14c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.8 2-1.7 2Zm7.4 0c-1 0-1.7-.9-1.7-2s.8-2 1.7-2 1.8.9 1.7 2c0 1.1-.7 2-1.7 2Z"/></svg>
  </a></li>
  <li><a href="#" data-sketch="circle" aria-label="Instagram" aria-disabled="true"><!-- TODO: link -->
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg>
  </a></li>
  <li><a href="https://x.com/_paton_hall_" data-sketch="circle" aria-label="Paton Hall on X" rel="me noopener" target="_blank">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17.5 3h3.1l-6.8 7.7L21.8 21h-6.2l-4.9-6.4L5.1 21H2l7.2-8.2L2.4 3h6.3l4.4 5.8L17.5 3Zm-1.1 16.1h1.7L7.7 4.8H5.9l10.5 14.3Z"/></svg>
  </a></li>
  <li><a href="#" data-sketch="circle" aria-label="Phone" aria-disabled="true"><!-- TODO: number -->
    <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .5 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.5-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"/></svg>
  </a></li>
</ul>
```

- [ ] **Step 2: Fill `.main` in `index.html`**

Copy is verbatim from the mockup.

```html
<h1 class="page-title">Paton Hall</h1>

<p class="lede">An industrial hub in downtown Hamilton focused on electronics, machinery,
robotics, peer education, industrial certifications, product demos and launches. An all
ages environment with only a pool table as its permanent fixture. A place to accelerate
the formation of communities.</p>

<hr class="rule">

<p>Hamilton has industrial heritage, technical culture, manufacturing capacity and a port.
It's also the nexus for Toronto, Waterloo and Buffalo regions. Steeltown is the northern
linchpin of the Great Lakes industrial corridor stretching from Ontario through the
American Rust Belt.</p>

<p>This corridor and the wider Rust Belt are home to the reindustrialization movement. It
aims to revive hard industries and bring advanced manufacturing to old towns. It's being
driven by big policy and 1000s of small actors. The Hammer is the best positioned place in
North America to accelerate experiments.</p>

<p class="note">All programming and events organized by the Membership. No expensive assets or agendas to maintain.<br>
If you are a local business or organization interested in using the space or a membership, contact us!<br>
Space re-organized every AM or PM to support in-demand activities.</p>

<!-- Task 4 inserts the subscribe panel here -->

<p class="colophon">Paton Hall Inc. is a Canadian corporation run by and for its local
membership. Click garage icon for more info.</p>
```

- [ ] **Step 3: Fill `.aside` in `index.html`**

Note the corrected address — `Breadalbane`, `L8R`, not the mockup's typo.

```html
<img class="building" src="assets/img/front.jpg"
     alt="The Paton Hall building: a single-storey white concrete-block garage with an open bay door and a Paton Hall sign.">

<p class="address">4 Breadalbane St, Hamilton, Ontario L8R 3E9</p>

<p class="directions">
  <a href="https://www.google.com/maps/place/4+Breadalbane+St,+Hamilton,+ON+L8R+3E9/@43.2628465,-79.8917116,605m/data=!3m2!1e3!4b1!4m6!3m5!1s0x882c9b6398111ba9:0xbb89c6be63d64137!8m2!3d43.2628465!4d-79.8891313!16s%2Fg%2F11c5bzyvbw"
     rel="noopener" target="_blank">DIRECTIONS</a>
</p>

<ul class="facilities">
  <li>Pool Table</li>
  <li>Work Tables &amp; Benches</li>
  <li>Assembly Zones</li>
  <li>Blackboard | Whiteboard</li>
  <li>Tools &amp; Storage Bins</li>
  <li>Certified Training</li>
  <li>Peer Education</li>
  <li>Talks &amp; Meetups</li>
  <li>Demos &amp; Launches</li>
</ul>
```

- [ ] **Step 4: Fill `.statusbar` in `index.html`**

Static text reproducing the mockup. Marked as future Calendar data.

```html
<footer class="statusbar">
  <!-- TODO: becomes data-driven when the Calendar is built -->
  <span class="statusbar__event">
    <span class="statusbar__dot" aria-hidden="true"></span>
    11:30-5pm - EPTAC Course (IPC-A-610 Specialist) @ABCD | Pool Table Closed
  </span>
  <span class="statusbar__date">TUESDAY OCTOBER 20th 2026 <span aria-hidden="true">☀</span></span>
</footer>
```

- [ ] **Step 5: Append content styling to `assets/css/site.css`**

```css
/* --- Rail: nav buttons ---------------------------------------------------- */

.nav-btn {
  display: block;
  padding: 9px 14px 10px;
  font-family: var(--font-mono);
  font-size: 16px;
  line-height: 1;
  text-decoration: none;
  white-space: nowrap;
}

/* Maps is visibly narrower than its siblings in the mockup. */
.nav-btn--short { display: inline-block; }

/* The active fill is painted by sketch.js. This background is the fallback
   for the pre-script / no-JS state, so the active item reads as active
   either way. */
.nav-btn.is-active { background: var(--nav-active-fill); }
.sketched .nav-btn.is-active { background: transparent; }

/* Placeholder links should not present as interactive. */
[aria-disabled="true"] { cursor: default; }

/* --- Rail: social glyphs -------------------------------------------------- */

.social a {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--ink);
  text-decoration: none;
}

/* --- Main ----------------------------------------------------------------- */

.page-title {
  font-family: var(--font-display);
  font-size: 68px;
  line-height: 1;
  letter-spacing: 0.01em;
  margin: 0 0 26px;
  text-transform: uppercase;
}

.lede, .main p { margin: 0 0 18px; max-width: 890px; }

.rule {
  width: 100%;
  height: 0;
  margin: 12px 0 24px;
  border: 0;
  border-top: 3px solid var(--cyan-9);
}

.note { color: var(--cyan-9); }

.colophon { font-size: 15px; margin-top: 26px; }

/* --- Aside ---------------------------------------------------------------- */

.building { width: 100%; height: auto; margin-bottom: 22px; }

.address { font-size: 19px; margin: 0 0 8px; }

.directions { margin: 0 0 34px; font-size: 19px; }

.facilities {
  list-style: none;
  margin: 0;
  padding: 0;
  font-family: var(--font-mono);
  font-size: 17px;
}

.facilities li { margin-bottom: 30px; }

/* --- Status bar ----------------------------------------------------------- */

.statusbar__event { display: flex; align-items: center; gap: 10px; }

.statusbar__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid var(--green-7);
}
```

- [ ] **Step 6: Verify against the mockup**

Serve at 1722×1204 and compare the rendered page against
`mockups_AUG17/Untitled-2026-08-17-0855.png`. Confirm:

- Seven nav buttons in order, Paton Hall filled light blue.
- Five social glyphs in circles.
- Heading, three paragraphs, teal rule, teal three-line note in the correct order.
- Photo, address reading **Breadalbane** / **L8R**, DIRECTIONS, nine facility items.
- Status bar showing event on the left, date on the right.

Then check the X link resolves and the Google Maps link opens the right place:

```bash
curl -sI "https://x.com/_paton_hall_" -o /dev/null -w '%{http_code}\n'
```

- [ ] **Step 7: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Add home page content, navigation, and status bar

Copy transcribed verbatim from the AUG17 home mockup, except the
address: the mockups' 'Breadarlane / L84 3E9' are typos, corrected
to '4 Breadalbane St, Hamilton, Ontario L8R 3E9' per the supplied
Google Maps link and confirmed by the user.

Unknown destinations are '#' with aria-disabled and a TODO."
```

---

### Task 4: Subscribe panel

The dark panel and its form. Deliverable: the panel renders as drawn and cannot fake a successful submission.

**Files:**
- Modify: `index.html` (insert into `.main`, at the marker from Task 3 Step 2)
- Modify: `assets/css/site.css`

**Interfaces:**
- Consumes: `--panel`, `--panel-field`, `--panel-btn`, `--font-serif`, `--font-mono` from Task 1; the `.main` flow from Task 3.
- Produces: `#subscribe-form` and `#subscribe-status`, referenced by the inline handler in Step 3. No later task consumes these.

- [ ] **Step 1: Insert the panel markup into `.main`**

```html
<section class="subscribe">
  <h2 class="subscribe__title">Subscribe</h2>
  <p class="subscribe__lead">Receive progress updates and information on becoming a member.</p>
  <p class="subscribe__body">The first twenty-five members get a founding rate and a say in how the
  room runs. We open within ninety days.</p>

  <!-- KIT.COM: replace `action` with the Kit form endpoint and confirm the
       field names below. Until then the submit handler refuses to submit
       rather than pretending to succeed. -->
  <form id="subscribe-form" class="subscribe__form" method="post" action="">
    <div class="subscribe__row">
      <label class="subscribe__field">
        <span class="subscribe__label">Name</span>
        <input type="text" name="fields[name]" autocomplete="name">
      </label>
      <label class="subscribe__field">
        <span class="subscribe__label">Email</span>
        <input type="email" name="email_address" autocomplete="email" required>
      </label>
    </div>

    <label class="subscribe__field">
      <span class="subscribe__label">What brings you here</span>
      <!-- TODO: confirm this option list with the user. Only "Build nights"
           appears in the mockup; the rest are plausible placeholders. -->
      <select name="fields[interest]">
        <option>Build nights</option>
        <option>Membership</option>
        <option>Training &amp; certification</option>
        <option>Space or event rental</option>
        <option>Just curious</option>
      </select>
    </label>

    <button type="submit" class="subscribe__submit">Put me on the list</button>

    <p id="subscribe-status" class="subscribe__status" role="status" aria-live="polite"></p>

    <p class="subscribe__fine">We will email you about Paton Hall and nothing else.
    Unsubscribe in one click, any time. No sharing, no selling, no third parties.
    Questions: <a href="mailto:paton@babb.tel">paton@babb.tel</a>.</p>
  </form>
</section>
```

- [ ] **Step 2: Append panel styling to `assets/css/site.css`**

```css
/* --- Subscribe panel ------------------------------------------------------ */

.subscribe {
  width: 100%;
  max-width: 862px;
  margin: 16px 0 8px;
  padding: 30px 32px 26px;
  background: var(--panel);
  color: #e9e7e1;
}

.subscribe__title {
  font-family: var(--font-serif);
  font-size: 19px;
  font-weight: 400;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  margin: 0 0 16px;
  color: #cfcdc6;
}

.subscribe__lead {
  font-family: var(--font-serif);
  font-size: 20px;
  margin: 0 0 16px;
}

.subscribe__body { font-size: 17px; margin: 0 0 24px; max-width: 640px; }

.subscribe__row { display: grid; grid-template-columns: 1fr 1fr; gap: 22px; }

.subscribe__field { display: block; margin-bottom: 20px; }

.subscribe__label {
  display: block;
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: #b9b7b0;
  margin-bottom: 7px;
}

.subscribe__field input,
.subscribe__field select {
  width: 100%;
  padding: 11px 12px;
  border: 0;
  background: var(--panel-field);
  color: var(--ink);
  font-family: var(--font-body);
  font-size: 17px;
}

.subscribe__submit {
  padding: 12px 22px;
  border: 0;
  background: var(--panel-btn);
  color: var(--ink);
  font-family: var(--font-mono);
  font-size: 14px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  cursor: pointer;
}

.subscribe__status:empty { display: none; }

.subscribe__status {
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--yellow-3);
  margin: 14px 0 0;
}

.subscribe__fine {
  font-family: var(--font-mono);
  font-size: 12.5px;
  line-height: 1.7;
  color: #97958f;
  margin: 18px 0 0;
}

.subscribe__fine a { color: #97958f; }
```

- [ ] **Step 3: Add the guard that prevents faking success**

Append to `index.html` before the closing `</body>`, after the existing script tags:

```html
<script>
/* The Kit.com endpoint is not wired up yet. Until form.action is set, refuse
   the submission and say so. Showing a success message with no endpoint
   behind it would silently lose real signups. */
(function () {
  var form = document.getElementById('subscribe-form');
  var status = document.getElementById('subscribe-status');
  if (!form || !status) return;
  form.addEventListener('submit', function (e) {
    if (!form.getAttribute('action')) {
      e.preventDefault();
      status.textContent = 'Signup is not connected yet — email paton@babb.tel and we will add you.';
    }
  });
})();
</script>
```

- [ ] **Step 4: Verify the panel and the guard**

Serve, and confirm visually that the panel matches the mockup: dark background, letterspaced serif `SUBSCRIBE`, serif lead line, two cream input fields side by side, a full-width select, a cream uppercase button, and grey mono fine print.

Then verify the guard actually guards:

1. Fill in an email and click **Put me on the list**.
2. Expected: the page does **not** navigate, and the message
   `Signup is not connected yet — email paton@babb.tel and we will add you.`
   appears below the button.
3. Confirm no success message of any kind appears.

- [ ] **Step 5: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Add subscribe panel

Field names follow Kit.com conventions so wiring the endpoint later
is a one-line change. Until form.action is set the handler refuses
the submission and says so, rather than showing a success message
with nothing behind it."
```

---

### Task 5: The sketch layer

The Rough.js renderer. Deliverable: every bordered element is hand-drawn, strokes are identical across reloads, and disabling JS leaves the page intact with plain borders.

**Files:**
- Create: `vendor/rough.min.js`
- Create: `assets/js/sketch.js`

**Interfaces:**
- Consumes: `[data-sketch]` elements produced by Tasks 2 and 3 (`frame`, `box`, `circle`), the optional `data-sketch-fill` attribute holding a **custom property name** (e.g. `--nav-active-fill`), and the `.sketched` CSS hook from Task 2.
- Produces: a global `window.PatonSketch` with `{ redraw() }`, used by the verification steps here and in Task 7. Injects `svg.sketch-svg` as the first child of each sketched element. Registers the `garage` kind extension point consumed by Task 6.

**Note on the spec:** the spec's §5 example writes `data-sketch-fill="var(--blue-3)"`. Attribute values are not resolved by CSS, so this implementation takes the bare custom property name (`--nav-active-fill`) and resolves it with `getComputedStyle`. Same intent, one fewer layer of indirection.

- [ ] **Step 1: Vendor Rough.js**

```bash
cd /home/morgen/making/patonhall-excalisite
mkdir -p /tmp/phrough && cd /tmp/phrough
npm pack roughjs@latest
tar xzf roughjs-*.tgz
ls package/bundled/
cp package/bundled/rough.js /home/morgen/making/patonhall-excalisite/vendor/rough.min.js
cd /home/morgen/making/patonhall-excalisite
ls -la vendor/ && head -c 200 vendor/rough.min.js
```

Expected: a UMD bundle exposing a global `rough`. Confirm the file is non-empty and roughly 20–90KB.

- [ ] **Step 2: Write `assets/js/sketch.js`**

```js
/* ==========================================================================
   sketch.js — draws every hand-drawn border on the page.

   Knows nothing about the page's content. Walks [data-sketch] and paints a
   Rough.js SVG behind each matched element.

   Two properties matter and are easy to get wrong:

   1. Seeds are derived from element index, never random. Rough.js re-rolls
      its randomness on every call, so without a fixed seed every resize
      would reshape every border and the page would appear to twitch.
      A derived seed makes wobble a fixed property of the element.

   2. The .sketched class goes on <html> only after a successful draw. It is
      what suppresses the CSS fallback borders. So if this file 404s, throws,
      or is blocked, the page keeps clean plain borders — it degrades to
      plain, never to borderless.
   ========================================================================== */

(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  /* Well below Rough.js defaults (roughness 1, bowing 1): the brief calls for
     minimal wobble. Enough texture to read as drawn, not enough to look shaky. */
  var PARAMS = {
    roughness:   0.9,
    bowing:      0.6,
    strokeWidth: 1.6,
    fillStyle:   'solid'
  };

  var PAD = 4;  /* SVG overhangs the element so overshooting strokes aren't clipped */

  var registry = [];  /* [{ el, kind, index }] */

  /* Deterministic per-element seed. Knuth multiplicative hash keeps adjacent
     indices from producing visually similar wobble. */
  function seedFor(index) {
    return ((index + 1) * 2654435761) % 2147483647;
  }

  function tokenValue(el, name) {
    if (!name) return null;
    var v = getComputedStyle(el).getPropertyValue(name.trim());
    return v ? v.trim() : null;
  }

  function radiusFor(kind) {
    return kind === 'frame' ? 14 : 8;
  }

  /* Rounded-rect path, offset by PAD so it sits inside the padded SVG. */
  function roundedRectPath(w, h, r, pad) {
    r = Math.min(r, w / 2, h / 2);
    var x = pad, y = pad, X = pad + w, Y = pad + h;
    return 'M ' + (x + r) + ' ' + y +
           ' L ' + (X - r) + ' ' + y + ' Q ' + X + ' ' + y + ' ' + X + ' ' + (y + r) +
           ' L ' + X + ' ' + (Y - r) + ' Q ' + X + ' ' + Y + ' ' + (X - r) + ' ' + Y +
           ' L ' + (x + r) + ' ' + Y + ' Q ' + x + ' ' + Y + ' ' + x + ' ' + (Y - r) +
           ' L ' + x + ' ' + (y + r) + ' Q ' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Z';
  }

  function svgFor(el) {
    var svg = el.firstChild;
    if (!svg || svg.nodeType !== 1 || !svg.classList || !svg.classList.contains('sketch-svg')) {
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'sketch-svg');
      svg.setAttribute('aria-hidden', 'true');
      el.insertBefore(svg, el.firstChild);
    }
    return svg;
  }

  function drawOne(entry) {
    var el = entry.el;
    var w = el.offsetWidth;
    var h = el.offsetHeight;
    if (!w || !h) return false;

    var svg = svgFor(el);
    svg.setAttribute('width', w + PAD * 2);
    svg.setAttribute('height', h + PAD * 2);
    svg.setAttribute('viewBox', '0 0 ' + (w + PAD * 2) + ' ' + (h + PAD * 2));
    svg.style.left = -PAD + 'px';
    svg.style.top = -PAD + 'px';
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    var opts = {};
    for (var k in PARAMS) opts[k] = PARAMS[k];
    opts.seed = seedFor(entry.index);
    opts.stroke = tokenValue(el, '--ink') || '#1b1b1f';

    var fill = tokenValue(el, el.getAttribute('data-sketch-fill'));
    if (fill) opts.fill = fill;

    var rc = rough.svg(svg);
    var node;

    if (entry.kind === 'circle') {
      node = rc.circle(PAD + w / 2, PAD + h / 2, Math.min(w, h) - 2, opts);
    } else if (entry.kind === 'garage') {
      node = null;  /* Task 6 registers this kind */
    } else {
      node = rc.path(roundedRectPath(w, h, radiusFor(entry.kind), PAD), opts);
    }

    if (node) svg.appendChild(node);
    return true;
  }

  function drawAll() {
    var ok = 0;
    for (var i = 0; i < registry.length; i++) {
      try {
        if (drawOne(registry[i])) ok++;
      } catch (err) {
        /* One bad element must not strip borders from the whole page. */
        if (window.console) console.warn('sketch: failed to draw', registry[i].el, err);
      }
    }
    return ok;
  }

  function init() {
    if (typeof rough === 'undefined') {
      if (window.console) console.warn('sketch: rough.js unavailable; keeping CSS borders');
      return;
    }

    var els = document.querySelectorAll('[data-sketch]');
    for (var i = 0; i < els.length; i++) {
      registry.push({ el: els[i], kind: els[i].getAttribute('data-sketch'), index: i });
    }

    if (!drawAll()) return;  /* nothing drew — leave the CSS borders in place */

    document.documentElement.classList.add('sketched');

    /* Redraw only on size change, coalesced to one frame. Never on hover,
       focus, scroll, or a timer — the page has no animation. */
    if (typeof ResizeObserver !== 'undefined') {
      var pending = false;
      var ro = new ResizeObserver(function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () { pending = false; drawAll(); });
      });
      for (var j = 0; j < registry.length; j++) ro.observe(registry[j].el);
    }
  }

  window.PatonSketch = {
    redraw: drawAll,
    _registry: registry,
    _seedFor: seedFor
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

- [ ] **Step 3: Verify the strokes render**

Serve and open at 1722×1204. Confirm:

- The outer frame, every nav button, and every social circle now have visibly hand-drawn, slightly irregular strokes.
- The active `Paton Hall` button is filled light blue by the drawn shape, not by the CSS fallback.
- Strokes look *restrained* — irregular, but not shaky or sketchy-cartoonish. If they read as too wild, the parameters are wrong, not the approach.

- [ ] **Step 4: Verify determinism — strokes must not change between draws**

This is the test that protects the no-animation requirement. Run in the browser console:

```js
var snap = function () {
  return Array.prototype.map.call(
    document.querySelectorAll('.sketch-svg'),
    function (s) { return s.innerHTML; }
  ).join('|');
};
var before = snap();
window.PatonSketch.redraw();
var after = snap();
console.log('identical after redraw:', before === after, '| elements:', document.querySelectorAll('.sketch-svg').length);
```

Expected: `identical after redraw: true` and a non-zero element count.

If this prints `false`, the seed is not being applied and every resize will visibly reshape the page. Fix before continuing.

Then reload the page twice and confirm no border visibly changes shape.

- [ ] **Step 5: Verify degradation — JS off must leave the page complete**

1. Open DevTools → Settings → Debugger → **Disable JavaScript**.
2. Reload.
3. Expected: the page renders completely, every box and circle has a clean plain border, the active nav button is still filled light blue, and nothing is borderless or invisible.
4. Confirm `<html>` does **not** carry the `sketched` class.
5. Re-enable JavaScript.

Then verify the harder failure mode — script present but broken:

```bash
cd /home/morgen/making/patonhall-excalisite
mv vendor/rough.min.js /tmp/rough.bak
```

Reload. Expected: plain borders, a console warning `sketch: rough.js unavailable; keeping CSS borders`, and no visual breakage. Then restore:

```bash
mv /tmp/rough.bak vendor/rough.min.js
```

- [ ] **Step 6: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Add Rough.js sketch layer

Draws every border at roughness 0.9 / bowing 0.6 with per-element
seeds derived from index, so strokes are identical across loads and
resizes — Rough.js would otherwise re-roll and make the page twitch.

The .sketched class lands on <html> only after a successful draw, so
a missing or broken script leaves plain CSS borders rather than none."
```

---

### Task 6: The garage glyph

The garage icon, drawn by the same Rough.js pen as everything else rather than shipped as an image. Deliverable: a sketched garage in a filled circle, pinned to the bottom of the rail.

**Files:**
- Modify: `assets/js/sketch.js` (implement the `garage` kind stubbed in Task 5)
- Modify: `index.html` (the `.garage` anchor from Task 2 Step 1)
- Modify: `assets/css/site.css`

**Interfaces:**
- Consumes: `drawOne`, `PARAMS`, `PAD`, `seedFor`, `tokenValue` from Task 5's module scope; the `entry.kind === 'garage'` branch left as `node = null`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Update the `.garage` anchor in `index.html`**

```html
<a class="garage" href="#" data-sketch="garage" data-sketch-fill="--yellow-3"
   aria-label="About Paton Hall Inc."><!-- TODO: link to the Inc. sub-site --></a>
```

- [ ] **Step 2: Replace the `garage` branch in `drawOne` with the real drawing**

In `assets/js/sketch.js`, replace this:

```js
    } else if (entry.kind === 'garage') {
      node = null;  /* Task 6 registers this kind */
    } else {
```

with this:

```js
    } else if (entry.kind === 'garage') {
      node = drawGarage(rc, w, h, opts);
    } else {
```

- [ ] **Step 3: Add the `drawGarage` function to `sketch.js`**

Insert above `drawOne`:

```js
  /* The garage glyph, stroked segment by segment with the same pen as every
     box on the page — so its weight and texture match rather than merely
     resembling. Geometry is authored in a 60×60 space and scaled to fit.

     Returns a <g> holding the ring and the building. */
  function drawGarage(rc, w, h, opts) {
    var g = document.createElementNS(NS, 'g');
    var d = Math.min(w, h);
    var s = d / 60;                       /* scale from the 60×60 authoring grid */
    var ox = PAD + (w - d) / 2;
    var oy = PAD + (h - d) / 2;

    function X(v) { return ox + v * s; }
    function Y(v) { return oy + v * s; }

    /* Filled ring. */
    var ringOpts = {};
    for (var k in opts) ringOpts[k] = opts[k];
    g.appendChild(rc.circle(X(30), Y(30), d - 3, ringOpts));

    /* The building is stroke-only — the ring's fill shows through. */
    var line = {};
    for (var k2 in opts) line[k2] = opts[k2];
    delete line.fill;
    line.strokeWidth = 1.3;
    line.seed = opts.seed + 1;

    /* Roof: a shallow gable. */
    g.appendChild(rc.linearPath(
      [[X(12), Y(25)], [X(30), Y(15)], [X(48), Y(25)]], line));

    /* Body. */
    g.appendChild(rc.linearPath(
      [[X(14), Y(25)], [X(14), Y(46)], [X(46), Y(46)], [X(46), Y(25)]], line));

    /* Bay door. */
    g.appendChild(rc.rectangle(X(19), Y(31), 22 * s, 15 * s, line));

    /* Door slats. */
    for (var i = 1; i <= 3; i++) {
      var y = 31 + i * 3.75;
      g.appendChild(rc.line(X(19), Y(y), X(41), Y(y), line));
    }

    return g;
  }
```

- [ ] **Step 4: Size the glyph in `assets/css/site.css`**

```css
/* --- Garage glyph --------------------------------------------------------- */

.garage {
  display: block;
  width: 62px;
  height: 62px;
  margin-top: auto;   /* pins to the bottom of the rail */
  border-radius: 50%;
  color: var(--ink);
}

/* The CSS fallback: a plain circle carrying the fill, so the glyph still
   reads as a button before the script runs or if it never does. */
.garage[data-sketch] { background: var(--yellow-3); }
.sketched .garage[data-sketch] { background: transparent; }
```

- [ ] **Step 5: Verify the glyph**

Serve and confirm:

- A yellow circle sits at the bottom of the left rail with a recognisable garage inside — roof, body, bay door with slats.
- Its stroke weight and wobble match the nav buttons; it does not look like a pasted-in icon.
- Re-run the determinism check from Task 5 Step 4 and confirm it still prints `true` (the garage adds several paths; a wrong seed here would show up as `false`).
- Disable JavaScript, reload, and confirm a plain yellow circle remains — the glyph degrades to a filled circle, not to nothing.

- [ ] **Step 6: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Draw the garage glyph with Rough.js

Authored as line segments and stroked by the same pen as every other
border, so its texture matches the page instead of resembling it.
Falls back to a plain filled circle when the script does not run."
```

---

### Task 7: Fidelity pass and final verification

Compare against the mockup, tune the drift, and run the full verification checklist from spec §9. Deliverable: a page that stands up to side-by-side comparison, with every claim in the spec actually checked.

**Files:**
- Modify: `assets/css/site.css` (spacing and size tuning only)
- Modify: `README.md` (record any font substitutions and open TODOs)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: the finished page. No later task.

- [ ] **Step 1: Capture the page at the mockup's exact dimensions**

```bash
cd /home/morgen/making/patonhall-excalisite
python3 -m http.server 8017 &
sleep 1
```

Open `http://localhost:8017` in a browser sized to a **1722×1204** viewport and screenshot it.

- [ ] **Step 2: Compare region by region and fix drift**

Put the screenshot beside `mockups_AUG17/Untitled-2026-08-17-0855.png` and work through each region in order. For each, adjust only spacing, size, and position in `site.css` — do not restructure.

- [ ] Outer frame inset and corner radius
- [ ] Rail: button widths, gaps, font size; social circle diameter and spacing
- [ ] `PATON HALL` heading size and baseline position
- [ ] Lede paragraph width and leading
- [ ] Teal rule width, thickness, and the space above and below it
- [ ] Two body paragraphs: leading and paragraph spacing
- [ ] Teal three-line note
- [ ] Subscribe panel: width, padding, field sizes, button size, fine-print leading
- [ ] Aside: photo size and top alignment, address, DIRECTIONS, facility list item spacing
- [ ] Status bar: height, font size, dot size, left and right padding
- [ ] Colophon line position

- [ ] **Step 3: Re-run the full verification checklist**

Each of these was specified in the design; confirm each actually holds.

```bash
# No external network requests: nothing in the source may point off-origin
# except the two intentional outbound links (X and Google Maps).
cd /home/morgen/making/patonhall-excalisite
grep -nE 'https?://' index.html assets/css/site.css | grep -vE 'x\.com/_paton_hall_|google\.com/maps|w3\.org|schema\.org|roughjs\.com|yeun\.github\.io'
```

Expected: no output. Any hit is an unintended third-party dependency.

- [ ] Determinism: re-run the console snapshot test from Task 5 Step 4 → `true`.
- [ ] Degradation: JS disabled → complete page, plain borders, no `sketched` class.
- [ ] No animation: confirm `site.css` contains no `transition`, `animation`, or `@keyframes`:

```bash
grep -nE 'transition|animation|@keyframes' assets/css/site.css
```

Expected: no output.

- [ ] Form guard: submitting shows "not connected yet", never a success message.
- [ ] Address reads `4 Breadalbane St, Hamilton, Ontario L8R 3E9`.
- [ ] HTML validity:

```bash
curl -s -H "Content-Type: text/html; charset=utf-8" \
  --data-binary @index.html \
  "https://validator.w3.org/nu/?out=gnu" || echo "validator unreachable — check manually"
```

- [ ] **Step 4: Record open TODOs in `README.md`**

Append, so the handover state is explicit rather than buried in comments:

```markdown
## Open items

- **Kit.com endpoint** — `index.html`, `#subscribe-form`. The `action` is empty
  and the form refuses to submit until it is set. Search `KIT.COM`.
- **"What brings you here" options** — only *Build nights* comes from the
  mockup; the rest are placeholders awaiting confirmation.
- **Placeholder links** — Membership, Calendar, Training, Services, Updates,
  Maps, Discord, Instagram, phone, and the garage glyph all point at `#`.
  Search `TODO: link`.
- **Status bar** — currently static text from the mockup. Becomes data-driven
  when the Calendar is built.
- **Mobile** — desktop-only by decision. Empty breakpoint stubs are at the
  bottom of `site.css`.
```

- [ ] **Step 5: Commit**

```bash
cd /home/morgen/making/patonhall-excalisite
git add -A
git commit -m "Tune spacing against the home mockup and record open items

Side-by-side pass at 1722x1204. Verified: no third-party requests,
deterministic strokes, plain-border fallback with JS disabled, no
animation anywhere, and the form still refuses to fake success."
```

- [ ] **Step 6: Report what was verified and what was not**

State plainly which checklist items passed, with the actual output — and name anything skipped or still failing rather than reporting completion. Do not claim fidelity without having compared the screenshots.

---

## Deployment note (not a task)

To publish: push to GitHub and set Pages to serve from the default branch, root
directory. There is no build step and no Actions workflow required. `.nojekyll`
is already in place. The existing `patonhall` repo has a `CNAME` — if this site
is to take over that domain, the `CNAME` file must move, and that is a decision
for the user, not part of this plan.
