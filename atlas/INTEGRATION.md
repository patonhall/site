# Atlas integration map

How the pieces of the Industrial Atlas fit together, now that it spans two
countries. Read this before adding a region or a source.

---

## 1. Layout

```
atlas/
├── index.html          ONE application, both countries
├── app.js              layer registry, state, detail panel
├── map.js              Leaflet, basemap, styling
├── styles.css
│
├── data/               ONE directory, all regions, source-prefixed
│   ├── osm-*.geojson             region-wide (both countries)
│   ├── hamilton-*.geojson        City of Hamilton
│   ├── niagara-*.geojson         Niagara Region, Ontario   (planned)
│   └── us-*.geojson              New York State / WNY      (planned)
│
├── scripts/            Ontario + region-wide ingestion
│   ├── fetch_osm.py
│   ├── fetch_hamilton.py
│   └── .cache/         raw responses, gitignored
│
├── us/                 the American side
│   ├── DATA-SOURCES.md
│   ├── sources.json
│   └── scripts/        NY ingestion            (planned)
│
├── sources/sources.json    Ontario + region-wide source registry
├── DATA-SOURCES.md         Ontario reconnaissance
├── BACKLOG.md              everything found and not yet loaded
└── INTEGRATION.md          this file
```

**One application, not two.** The whole point of the atlas is that Hamilton,
Niagara and Buffalo are one industrial system that happens to have a border
through it. Two maps would defeat that before the first feature loaded.

**One `data/` directory, not one per region.** The frontend fetches by
filename; splitting the directory would buy nothing and would mean the layer
registry had to know about paths as well as regions.

**Separate `scripts/` and source docs per region.** These *do* diverge — the
portals, the licences, the field names and the quirks are entirely different,
and a single ingestion script trying to serve both would become a pile of
conditionals. Reconnaissance is also a per-jurisdiction activity: the
questions you ask a New York state agency are not the ones you ask a Canadian
municipality.

The rule: **shared where the data converges, separate where the sources
diverge.**

---

## 2. Flow

```
        ONTARIO / REGION-WIDE                      NEW YORK
   ┌──────────────────────────────┐   ┌──────────────────────────────┐
   │ OpenStreetMap (Overpass)     │   │ NYS GIS Clearinghouse        │
   │ City of Hamilton (ArcGIS)    │   │ NYS DEC facility registries  │
   │ Niagara Region NEI  (todo)   │   │ NYS DOT / Census   (todo)    │
   └──────────────┬───────────────┘   └───────────────┬──────────────┘
                  │                                   │
        atlas/scripts/*.py                    atlas/us/scripts/*.py
                  │                                   │
                  └───────────────┬───────────────────┘
                                  ↓
                    NORMALIZE to the atlas schema
              id · name · layer · categories · freshness
                    · source{} · original attributes
                                  ↓
                       atlas/data/*.geojson
                     (pre-generated, committed)
                                  ↓
                    app.js  →  map.js  →  Leaflet
                  lazy per-layer fetch on first toggle
```

Nothing in the browser talks to a public API. Every source is pulled by a
script, normalized, and committed as static GeoJSON — faster, reproducible,
independent of portal uptime, and cacheable. Same reasoning the parent site
fetches Kit posts at build time.

---

## 3. The normalized feature

Every feature from every source, in both countries, comes out of ingestion
looking like this:

```json
{
  "type": "Feature",
  "geometry": { },
  "properties": {
    "id": "us-nys-parcel-1234567",
    "name": "...",
    "layer": "land | place | building | rail | road | port | planning",
    "categories": ["MANUFACTURING", "STEEL"],
    "freshness": "RECENT | UPDATED ANNUALLY | HISTORICAL | STATIC",
    "source": {
      "name": "...", "dataset": "...", "source_id": "...",
      "url": "...", "license": "...", "attribution": "...",
      "retrieved_at": "2026-08-19", "source_modified": "..."
    },
    "attributes": { }
  }
}
```

`id` is prefixed by region and source so identifiers can never collide across
jurisdictions. `attributes` keeps the source's original fields verbatim — the
normalization is an interpretation, and an interpretation must never be the
only surviving record of what the source said.

---

## 4. The classification crosswalk

Four vocabularies now describe the same idea, and none of them agree:

| Source | Vocabulary | Example |
|---|---|---|
| OpenStreetMap | free tags | `building=warehouse`, `man_made=works` |
| City of Hamilton | `ZONING_DESC` text | "Light And Limited Heavy Industry, Etc." |
| Niagara Region NEI | NAICS + sector | `primarynaics=332`, `primarysector` |
| New York State | `PROP_CLASS` numeric | `700–799` = industrial |

They map into **one atlas taxonomy** (`MANUFACTURING`, `FABRICATION`,
`METAL`, `STEEL`, `WAREHOUSING`, `LOGISTICS`, `RAIL`, `MARITIME`, …), and a
feature may carry several.

Two rules:

1. **The crosswalk lives in ingestion, never in the frontend.** The map should
   receive features already classified, so a taxonomy change is a re-run
   rather than a code change in two places.
2. **The original code always survives** in `attributes`. When someone asks
   why a site is tagged `METAL`, the answer must be traceable to a specific
   published value.

NAICS is the closest thing to a common language, since both the Niagara NEI
and US Census CBP use it. It is not a universal one: OSM has no NAICS, and
NY's `PROP_CLASS` is a property-assessment code, not an industry code.

---

## 5. Four quadrants, four different kinds of coverage

This is the single most important thing to understand about the finished map.

| | Business inventory | Parcels | Land / zoning | Buildings |
|---|---|---|---|---|
| **Hamilton** | ✗ none published | ✗ MPAC is paid | ✓ employment lands + zoning | ✓ 214k (not yet loaded) |
| **Niagara, ON** | ✓ 98,065 NEI records | ✗ MPAC is paid | ✗ not sourced | ✗ not sourced |
| **Erie, NY** | ~ CBP: 22,574 estab. | ✓ 370,424 public | ✓ via `PROP_CLASS` | ✓ statewide layer |
| **Niagara, NY** | ~ CBP: 4,510 estab. | ✗ not in state set | ~ unknown | ✓ statewide layer |

No quadrant is covered the same way as any other, and the reasons are
institutional rather than geographic: Ontario sells parcel data and New York
gives it away; Niagara Region surveys its businesses and Hamilton does not.

**The consequence is a design requirement, not a caveat.** A viewer comparing
a dense quadrant to a sparse one will read it as a statement about industry.
It is a statement about publishing. So:

- every layer shows its **source and freshness** in the switch list — done;
- the left panel carries a standing note that coverage is uneven — done;
- **planned:** a coverage indicator that responds to the current viewport, so
  panning from Hamilton to Buffalo says plainly what changed underneath.

Until that last piece exists, the map is capable of misleading someone, and
that should be treated as an open defect rather than a nice-to-have.

---

## 6. Cross-border mechanics

**Bounding box.** `scripts/fetch_osm.py` uses
`(42.40, -80.30, 43.55, -78.40)` — extended on 2026-08-19 from an earlier box
whose eastern edge at -78.90 cut through Buffalo at -78.88, leaving the
American side blank in the one source that already covered it. The re-fetch
took OSM from 4,568 to **8,949 features**, of which **3,175 are in Western
New York**.

Any future region extension means re-running `fetch_osm.py --refresh`, not
just adding a script: OSM is a single query over one box, so its coverage is
defined here and nowhere else.

**Projection.** Everything is normalized to EPSG:4326 at ingestion. ArcGIS
services are asked for `outSR=4326` explicitly rather than trusting a default.

**Units.** New York reports floor area in square feet (`SQ_FT`, `GFA`);
Niagara's NEI reports `indoorgfa` without stated units. Do not compare or
aggregate the two until that is confirmed. Store as published, convert only
at the point of display, and label the unit.

**Municipal identity.** There is no shared identifier across the border.
`SWIS` codes are New York's; Ontario has its own. Cross-border grouping has to
be done by geometry, not by code.

---

## 7. Licensing

| Source family | Licence | Share-alike |
|---|---|---|
| OpenStreetMap | ODbL 1.0 | **Yes** |
| City of Hamilton | Hamilton Open Data Licence | No |
| Niagara Region | OGL 2.0 | No |
| New York State / federal | generally open, attribution | No |

**ODbL is the binding constraint and always will be**, because OSM is the only
source spanning the whole map. Any derived layer that mixes OSM geometry with
another source — the density heatmap especially — needs the share-alike
question answered deliberately before publication. Adding New York does not
change this; the US sources are the permissive ones.

Every feature carries its own licence in `source.license`, so the obligation
travels with the data rather than living in a footnote that gets lost.

---

## 8. Adding a region

1. Reconnaissance first, code second. Probe the live portals, record verified
   counts and field names, and write `<region>/DATA-SOURCES.md`. Record dead
   ends — they are as valuable as the finds, and the Eaton-County-Michigan
   near-miss is the reason.
2. Register sources in `<region>/sources.json`.
3. Write ingestion under `<region>/scripts/`, writing region-prefixed files
   into the shared `data/`.
4. Extend the classification crosswalk for the new vocabulary.
5. Add layers to the `LAYERS` table in `app.js` — the single place the switch
   list, the styling and the credits are all generated from.
6. Update the coverage table in §5 of this file. If the new region is covered
   differently from the others, that is the normal case, and saying so is the
   job.
