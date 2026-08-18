# Hamilton–Niagara Industrial Atlas — Data Source Reconnaissance

**Reconnaissance date: 2026-08-18.** Every entry below was verified by
querying the live endpoint on that date — record counts, field names and
licences are observed, not assumed. Anything not yet checked is listed under
[Not yet investigated](#not-yet-investigated) rather than guessed at.

Re-run the probes before trusting these numbers after a few months; portals
reorganize and layer indices in ArcGIS FeatureServer URLs are not stable.

---

## Summary of what exists

The good news is that the two pillars of this atlas both exist as
machine-readable public data, under open licences, with real coverage:

- **Hamilton** publishes 463 datasets through an ArcGIS Hub, 391 of them under
  the City of Hamilton Open Data Licence. The industrially relevant ones —
  employment lands, zoning, building footprints, railways, truck routes — are
  all live FeatureServers with GeoJSON output.
- **Niagara Region** publishes the **Consolidated NEI**, a 98,065-record
  point inventory of businesses with NAICS codes, sector, employee size range
  and indoor floor area, under Open Government Licence 2.0.

There is no equivalent business inventory for Hamilton. That asymmetry is the
single most important finding of this pass, and §Gaps explains what it means
for the build.

---

## Tier 1 — verified, high value, use in the first milestone

### 1. City of Hamilton Open Data (ArcGIS Hub)

| | |
|---|---|
| Organization | City of Hamilton |
| Portal | https://open.hamilton.ca |
| Catalogue feed | https://open.hamilton.ca/api/feed/dcat-us/1.1.json |
| Service root | `https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services` |
| Format | ArcGIS FeatureServer → GeoJSON (`?f=geojson`), CSV, Shapefile, KML |
| Licence | [City of Hamilton Open Data Licence](https://www.hamilton.ca/city-initiatives/strategies-actions/open-data-licence-terms-and-conditions) — applies to 391 of 463 datasets |
| Attribution | Required; see licence terms |
| Freshness | Per dataset; Employment Lands last modified 2026-08-02 |
| Coverage | City of Hamilton only (includes Stoney Creek, Ancaster, Dundas, Waterdown, Flamborough) |

**Layers verified live, with observed record counts:**

| Layer | Records | Endpoint suffix | Atlas category |
|---|---:|---|---|
| Employment Lands | 22 | `Employment_Lands/FeatureServer/2` | `land` |
| Zoning By-law Boundary | 11,931 | `Zoning_By_law_Boundary/FeatureServer/1` | `land` / `planning` |
| Buildings | 214,293 | `Buildings/FeatureServer/8` | `building` |
| Railways | 1,692 | `Railways/FeatureServer/10` | `rail` |
| Truck Route Network | 1,250 | `Truck_Route_Network/FeatureServer/5` | `road` |

**Also present and relevant, not yet field-inspected:** Addresses,
Development Applications, Vacant Building Registry, Businesses by Employee
Count, City/Urban/Rural Boundary, Waterbodies, Watercourse, Airport,
Business Improvement Areas, Building and Demolition Permits (2008–2016 and
2017–present), Planning Applications Reported Quarterly, Historic Railways.

**Note on Employment Lands:** 22 features is a small number because these are
large designated *areas*, not sites. This is the authoritative answer to
"where is industrial land in Hamilton" and should be a foundational polygon
layer, not a point layer.

**Caution:** the numeric layer index in each FeatureServer URL (`/2`, `/8`,
`/10`) is assigned by the publisher and has been observed to change. Resolve
layers by name through the DCAT feed at build time rather than hard-coding
indices.

---

### 2. Niagara Region — Consolidated NEI (Niagara Employment Inventory)

| | |
|---|---|
| Organization | Niagara Region |
| Catalogue record | https://niagaraopendata.ca/dataset/consolidated-nei-opendata |
| Data portal | https://open.niagararegion.ca/datasets/NiagaraRegion::consolidated-nei-opendata |
| Service | `https://services1.arcgis.com/WxiLK82TWf8W3O3f/arcgis/rest/services/OpenData_Consolidated_NEI_Opendata/FeatureServer/45` |
| GeoJSON download | `https://open.niagararegion.ca/api/download/v1/items/d23f4f781add4584904bc78b94c869b3/geojson?layers=45` |
| Format | GeoJSON, CSV, Shapefile, KML, ArcGIS REST |
| Licence | **Open Government Licence 2.0 (Niagara Region)** |
| Geometry | Point |
| Records | **98,065** (verified) |
| Coverage | Niagara Region — all twelve municipalities |
| Temporal | Consolidated inventory **since 2016**; collection paused 2020–2021 (COVID) |

**Verified fields:**

```
nei_id, Year, municipality, businessname,
businessstreetnumber, businessstreetname, businessunit,
businesspobox, businesspostalcode, businesswebsite,
primarynaics, secondarynaics, primarysector, industry,
yearopen, indoorgfa, sizerangeemployees
```

This is the single richest source found. `primarynaics` + `industry` +
`sizerangeemployees` + `indoorgfa` together support classification,
weighting for the density layer, and floor-area analysis.

**Critical handling requirement.** This is a *multi-year consolidated*
inventory, so the same business appears once per survey year. It is a record
of what was observed in a given year, not a register of what is trading
today. Per data quality rule 2, the ingestion must:

1. Group by `nei_id` and keep the most recent `Year` per entity.
2. Carry that `Year` through to the feature as its freshness stamp.
3. Never render a 2016-only record as a currently operating business.
4. Surface the observation year in the UI.

Note also there are two distinct Niagara portals: `niagaraopendata.ca` is a
**CKAN** catalogue (use `/api/3/action/package_search`), while the data itself
is hosted on `open.niagararegion.ca`, an **ArcGIS Hub**. The Hub does *not*
serve a DCAT feed at the usual path; query the CKAN catalogue to discover, and
the Hub to download.

---

### 3. OpenStreetMap via Overpass

| | |
|---|---|
| Endpoint | https://overpass-api.de/api/interpreter |
| Status | https://overpass-api.de/api/status |
| Licence | **ODbL 1.0** — attribution *and* share-alike on derived data |
| Freshness | Minutes to days |
| Coverage | Entire region, uniform across municipal boundaries |

**Verified:** 311 `landuse=industrial` ways within the Hamilton bounding box
`(43.15,-80.05,43.35,-79.68)`.

This is the only source that covers the whole study area — Hamilton, Halton,
Niagara and across the border — with one consistent schema. It is the
backbone for cross-boundary features (rail corridors, the Welland Canal, the
harbour) that no single municipality publishes end to end.

Relevant tags: `landuse=industrial`, `building=industrial|warehouse|factory`,
`man_made=works`, `industrial=*`, `craft=*`, `shop=trade`, `railway=*`,
`harbour=*`, `waterway=*`, `power=substation|line`.

**ODbL is the strictest licence in this list.** Any published derivative that
mixes OSM geometry with other sources may trigger share-alike. Keep OSM-derived
features tagged as such in the provenance block so the obligation is traceable
rather than discovered later.

---

## Tier 2 — confirmed reachable, not yet catalogued

All returned HTTP 200 on 2026-08-18; contents not yet inspected.

| Source | Endpoint | Why it matters |
|---|---|---|
| Ontario GeoHub | https://geohub.lio.gov.on.ca | Provincial land use, transport, hydrography |
| Ontario Open Data (CKAN) | `https://data.ontario.ca/api/3/action/` | Provincial datasets, employment stats |
| Open Government Canada (CKAN) | `https://open.canada.ca/data/api/3/action/` | NRCan, Transport Canada, StatCan, rail network |

---

## Not yet investigated

Listed so the gap is explicit rather than silently absent:

- **Burlington, St. Catharines, Welland, Niagara Falls, Thorold, Port
  Colborne, Grimsby, Lincoln, Fort Erie** — municipal portals not yet probed.
  Burlington matters most; it is in the core scope and is *not* covered by
  either the Hamilton or the Niagara Region datasets above.
- **Halton Region** — Burlington's upper tier; may publish employment land.
- **Statistics Canada** — business counts by NAICS and CSD; useful for
  validating the NEI and for the Hamilton business gap.
- **Port of Hamilton / HOPA Ports** — returned HTTP 403 to a plain request on
  2026-08-18; needs a different approach or a human look.
- **St. Lawrence Seaway** — `seaway-greatlakes.com/vessel-transit` is public
  and server-rendered, **but `robots.txt` is `Disallow: /`**. Do not build an
  automated collector against it. Link out instead. (Already established while
  building the main site's Ships board.)
- **CN / CPKC / Metrolinx / VIA** — public infrastructure data not yet sought.
  Assume no freight positions; see the note below.
- **Brownfields** — Hamilton has a brownfield programme; a spatial dataset was
  not obvious in the DCAT scan and needs a targeted search.

---

## Known dead ends

Recorded so they are not re-attempted:

- **No public real-time freight rail feed exists in Canada.** CN and CPKC do
  not publish train positions; shipment tracking is customer-authenticated.
  Static rail infrastructure is available and is sufficient for Layers 1–3, as
  the brief anticipates. This was established independently while building the
  Ships board.
- **Seaway vessel transit data**: public to read, `Disallow: /` to crawl.
- **Niagara ArcGIS Hub DCAT feed**: 404 at `/api/feed/dcat-us/1.1.json`. Use
  the CKAN catalogue at `niagaraopendata.ca` for discovery instead.

---

## Gaps and what they imply

**1. There is no Hamilton equivalent of the NEI.** Niagara publishes 98,065
classified business points; Hamilton publishes building footprints, zoning and
employment land, but no comparable business inventory. The first version of the
atlas will therefore be *asymmetric by construction*: business-level detail in
Niagara, building- and land-level detail in Hamilton.

This must be visible in the UI. A user seeing dense business points across
Niagara and sparse ones across Hamilton would reasonably conclude Hamilton has
less industry, which is false — it is a data artefact. Options, in preference
order:

1. Show per-layer coverage explicitly, per §16 freshness states.
2. Lean on OSM for Hamilton business-level points, clearly attributed.
3. Investigate Hamilton's "Businesses by Employee Count" layer to see whether
   it is point-level or aggregated to areas.

**2. Licence mixing needs a decision before publishing derived data.** OSM is
ODbL (share-alike), Hamilton is a bespoke municipal licence, Niagara is OGL
2.0. A derived layer combining all three — the industrial density heatmap, for
example — needs the compatibility question answered deliberately, not
discovered after publication.

**3. Layer indices are unstable.** Resolve by dataset name via the catalogue
feeds at build time.

---

## Prioritization

Scored against the brief's criteria. Implementation cost is relative.

| Source | Value | Freshness | Coverage | Authority | Machine-readable | Licence | Cost |
|---|---|---|---|---|---|---|---|
| Niagara Consolidated NEI | ★★★★★ | ★★★ | Niagara only | ★★★★★ | ★★★★★ | ★★★★★ | Low |
| Hamilton Employment Lands | ★★★★★ | ★★★★ | Hamilton only | ★★★★★ | ★★★★★ | ★★★★ | Low |
| Hamilton Buildings | ★★★★ | ★★★★ | Hamilton only | ★★★★★ | ★★★★★ | ★★★★ | Medium (214k features) |
| Hamilton Zoning | ★★★★ | ★★★★ | Hamilton only | ★★★★★ | ★★★★★ | ★★★★ | Low |
| Hamilton Railways | ★★★★ | ★★★ | Hamilton only | ★★★★ | ★★★★★ | ★★★★ | Low |
| OSM / Overpass | ★★★★ | ★★★★★ | **Whole region** | ★★★ | ★★★★★ | ★★★ (ODbL) | Low |
| Hamilton Truck Routes | ★★★ | ★★★ | Hamilton only | ★★★★★ | ★★★★★ | ★★★★ | Low |

**Recommended first build order:** OSM (region-wide backbone) → Hamilton
Employment Lands + Zoning (land) → Niagara NEI (business) → Hamilton Buildings
(physical fabric) → Hamilton Railways + OSM rail (corridors) → derived density.

---

## Reference implementation

`babbworks/atlas` (branch `master`, last pushed 2026-06-10) — "Discover
workshops, manufacturing sites, and industrial spaces across the UK — Leaflet
+ OSM/Overpass". No licence file.

Its shape confirms the pipeline this brief describes: a static Leaflet app
(`app.js` 85KB, `map.js` 21KB, `overpass.js` 7KB, `styles.css` 46KB) over
**pre-generated JSON in `data/`** built by Python scripts in `scripts/`, with
per-source modules (`voa.js`, `epr.js`, `fsa.js`, `planning.js`,
`companies.js`) and a `scoring.js` for derived indicators. Large datasets are
split by key into `data/voa/*.json` to keep fetches small — a pattern worth
copying for 214k Hamilton buildings.

It also keeps `system/datasets.md` and `system/project-notes.md`, which is
the same instinct as this document.

---

## Reproducing this reconnaissance

```bash
# Hamilton catalogue
curl -s https://open.hamilton.ca/api/feed/dcat-us/1.1.json -o ham_dcat.json

# Any Hamilton layer's record count
curl -s "https://services.arcgis.com/rYz782eMbySr2srL/arcgis/rest/services/Employment_Lands/FeatureServer/2/query?where=1=1&returnCountOnly=true&f=json"

# Niagara catalogue search (CKAN)
curl -s "https://niagaraopendata.ca/api/3/action/package_search?q=NEI&rows=10"

# NEI schema
curl -s "https://services1.arcgis.com/WxiLK82TWf8W3O3f/arcgis/rest/services/OpenData_Consolidated_NEI_Opendata/FeatureServer/45?f=json"

# Overpass probe
curl -s -X POST https://overpass-api.de/api/interpreter \
  --data-urlencode 'data=[out:json][timeout:50];(way["landuse"="industrial"](43.15,-80.05,43.35,-79.68););out count;'
```
