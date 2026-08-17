# Fonts

All faces here are self-hosted so the site makes no third-party requests.
Each was checked before being committed, by reading the licence metadata
embedded in the font binary itself (`fontTools` `name` table, IDs 0/13/14).

| File | Face | Licence | Source |
|---|---|---|---|
| `LilitaOne-Regular.woff2` | Lilita One | SIL OFL 1.1 — `scripts.sil.org/OFL`, © 2011 Juan Montoreano | `@excalidraw/excalidraw@0.18.1` |
| `ComicShannsMono-Regular.woff2` | Comic Shanns | MIT — © 2018 Shannon Miwa and contributors | `@excalidraw/excalidraw@0.18.1` |
| `nunito-latin-400-normal.woff2` | Nunito 400 | SIL OFL 1.1 — see `LICENSE-Nunito-OFL.txt` | `@fontsource/nunito@5.3.0` |
| `nunito-latin-600-normal.woff2` | Nunito 600 | SIL OFL 1.1 — see `LICENSE-Nunito-OFL.txt` | `@fontsource/nunito@5.3.0` |

Only the Latin subsets are included. Both Excalidraw faces ship split across
several unicode-range subsets under hashed filenames; the Latin one was
identified by reading the `unicodeRange` descriptors out of Excalidraw's
bundle and picking the subset covering `U+20-7e`.

## Excalifont is deliberately not here

The initial design assumed Excalifont — Excalidraw's hand-drawn display face —
for headings. Two things ruled it out:

1. **Licence.** Excalifont's embedded copyright reads *"Copyright (c) 2024 by
   Excalidraw. All rights reserved."* with no licence grant, and there is no
   `LICENSE` file in the font's directory in the Excalidraw repository. The
   repository is MIT overall, but font licences are commonly carved out from a
   project's code licence, and "all rights reserved" contradicts an implied
   grant. Not safe to redistribute without clarification.

2. **It was the wrong face anyway.** The headings in `mockups_AUG17/` have
   perfectly regular stroke weight. A hand-drawn face cannot produce that.
   Lilita One — a heavy geometric display face that Excalidraw also bundles —
   matches the mockups, and is unambiguously OFL.

The hand-drawn quality of this site comes from the *borders*, drawn at runtime
by `assets/js/sketch.js`, not from the typography.
