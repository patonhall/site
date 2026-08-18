# Hamilton–Niagara Industrial Atlas

A map of the **physical industrial economy** of Hamilton, Burlington and the
Niagara Peninsula — where things are made, repaired, fabricated, stored and
moved, and how rail, road, port and land fit together into one regional
productive system.

Not a business directory. The question it answers is *"what does the physical
industrial economy of Hamilton–Niagara actually look like?"* — not "where are
the businesses?"

An application in its own right, living in this folder inside the Paton Hall
site repo. It has no dependency on the site's build (`build.py` only reads
`../src/`), and GitHub Pages will serve it at `/site/atlas/` once there is an
`index.html` to serve.

---

## Status: reconnaissance complete, no application code yet

This is deliberate. The brief is explicit that a data-source reconnaissance
pass comes before significant application code, precisely so the architecture
is shaped by the data that actually exists rather than the data one assumes
exists.

**Done:**

- [`DATA-SOURCES.md`](DATA-SOURCES.md) — every source verified against its
  live endpoint on 2026-08-18, with observed record counts, field names and
  licences. Gaps and dead ends recorded explicitly.
- [`sources/sources.json`](sources/sources.json) — machine-readable registry,
  ready for the UI to expose so the atlas is auditable.

**Not started:** ingestion scripts, normalization, entity resolution, derived
analysis, the Leaflet application.

### What the reconnaissance established

Three sources carry the first milestone, all verified live:

| Source | What it gives | Verified |
|---|---|---|
| **OSM / Overpass** | Region-wide industrial land, buildings, rail, ports — one schema across every municipal and national boundary | 311 industrial-landuse ways in the Hamilton bbox |
| **City of Hamilton Open Data** | Employment lands, zoning, building footprints, railways, truck routes | 463 datasets; 214,293 buildings; 11,931 zoning polygons |
| **Niagara Consolidated NEI** | Business points with NAICS, sector, employee size range, indoor floor area | 98,065 records under OGL 2.0 |

**The finding that shapes the build:** Niagara publishes a rich business
inventory and Hamilton does not. The first version will therefore be
asymmetric — business-level detail in Niagara, land- and building-level detail
in Hamilton. That asymmetry has to be *shown*, not smoothed over, or a reader
will conclude Hamilton has less industry than Niagara, which is false and is
purely an artefact of who publishes what.

---

## Next step

Per §20 of the brief, Layer 1–3 of the MVP, in this order:

1. **Ingestion** — `scripts/osm/` and `scripts/hamilton/` writing raw pulls to
   a cache, respecting rate limits.
2. **Normalization** — into the atlas schema, every feature carrying its full
   provenance block.
3. **A first map** — Leaflet over pre-generated GeoJSON, showing OSM industrial
   places, the rail network and Hamilton employment lands, with per-layer
   freshness and source attribution visible from the first commit rather than
   retrofitted.

Directories get created when a real source justifies them, not up front.

---

## Rules this project runs on

Carried from the brief, and worth restating because they are the difference
between an atlas and a plausible-looking picture:

- **Never fabricate data.** A gap is shown as a gap.
- **Never infer that a business is currently operating** because an old
  dataset lists it. The NEI is a multi-year inventory; a 2016 row is a 2016
  observation.
- **Provenance is a feature, not metadata.** Source name, URL, retrieval date,
  licence and original ID travel with every feature.
- **Distinguish observation from inference, and current from historical.**
  A railway from a government GIS file and a vessel seen four minutes ago are
  different kinds of claim and must never be rendered as the same kind.
- **Every layer declares a freshness state** — `LIVE`, `RECENT`, `UPDATED
  MONTHLY`, `UPDATED ANNUALLY`, `HISTORICAL`, `STATIC`, `INFERRED`.
- **Derived scores are analytical indicators, not economic truth.** Label them
  that way in the UI.
- **Respect licences, rate limits and `robots.txt`.** Cache responses. The
  Seaway's transit page is public to read and `Disallow: /` to crawl; it is
  registered in `sources.json` with status `excluded` so nobody re-litigates
  it later.
- **Do not expose sensitive infrastructure detail.** Use only what is
  intentionally published.

### Licence note

The three primary sources are on three different licences — ODbL (OSM,
**share-alike**), the City of Hamilton Open Data Licence, and OGL 2.0
(Niagara). Any derived layer that mixes them, such as the industrial density
heatmap, raises a compatibility question that should be answered deliberately
before publication rather than discovered after it.

---

## Reference implementation

Architecture follows [`babbworks/atlas`](https://github.com/babbworks/atlas)
(branch `master`) — a static Leaflet + OSM/Overpass application for UK
industrial spaces. Its shape confirms the pipeline: a static frontend over
**pre-generated JSON** built by Python ingestion scripts, with one module per
source and a separate scoring module for derived indicators. It splits large
datasets by key into many small files to keep fetches cheap — a pattern worth
copying for Hamilton's 214k building footprints.

Preserved from it: lightweight, modular, client-side, no mandatory database,
statically deployable, independently replaceable data layers, GeoJSON-friendly.
