# Atlas backlog

Data sources that are real but not yet in the map, plus application work
that has been designed and deferred — kept so nothing found or decided gets
lost between sessions. Everything in Tier A was verified
against a live endpoint on the date shown — those are facts, not leads.

Companion to [DATA-SOURCES.md](DATA-SOURCES.md) (what we use and why) and
[us/DATA-SOURCES.md](us/DATA-SOURCES.md) (the American side).

**Currently live:** 11 map layers plus one reference table — 18,386 features,
24.8 MB — from OpenStreetMap, the City of Hamilton, NYS GIS, NYS Department of
State, NYS DEC, and the US Census Bureau.

---

# Application backlog

## Per-dataset filtering in the right sidebar

**Designed 2026-08-19, deferred.** Replaces the narrower idea of splitting
Petroleum Bulk Storage into its own layer.

The right sidebar gains **two tabs**:

1. **Feature** — what is there now: the selected feature's classification,
   provenance and source attributes, plus per-listing actions.
2. **Dataset** — controls for manipulating one dataset: filtering, refining,
   subsetting.

Each dataset in the left panel gets a **tall, narrow side button** beside its
switch. Clicking it loads that dataset into the Dataset tab, where its
contents can be refined.

**Why this rather than more layers.** Petroleum Bulk Storage is 3,502 of the
4,845 features in `us-facilities`, and much of it is fuel retail rather than
industry. Splitting it into a separate switch would fix that one case and
leave the general problem — every merged dataset eventually has a subset
somebody wants to exclude. Nine DEC registries would become nine switches,
Hamilton zoning would want splitting by zone code, OSM places by tag. The
left panel becomes unusable long before the data is complete.

A filter mechanism solves the class rather than the instance, and keeps
ingestion honest: the shipped GeoJSON stays a faithful copy of what the
source published, and the *viewer* decides what to look at. That also
preserves the provenance guarantee — filtering at ingestion quietly changes
what "the dataset" means, filtering in the UI does not.

**Open questions when this is picked up:** whether filter state belongs in
the URL (the reference project encodes map and filter state there); whether
filters apply per-session or persist; and whether a filtered layer should
say so on the map, so a reader cannot mistake a filtered view for full
coverage.

---

# Data backlog

## Tier A — verified available, not loaded

Counts, schemas and licences confirmed by query on **2026-08-18**. These need
ingestion work, not investigation.

### Niagara Consolidated NEI — 98,065 business points
The largest verified source found, and twelve times the size of the entire
current atlas.

- OGL 2.0 (Niagara Region); GeoJSON download ready
- Fields: `nei_id, Year, municipality, businessname, businessstreetnumber,
  businessstreetname, businessunit, businesspobox, businesspostalcode,
  businesswebsite, primarynaics, secondarynaics, primarysector, industry,
  yearopen, indoorgfa, sizerangeemployees`
- **Blocked on two decisions, not on access:**
  1. Multi-year consolidated inventory since 2016 — one row per business per
     survey year. Needs group-by-`nei_id`, keep-latest-`Year`, and that year
     carried through as the feature's freshness stamp.
  2. It covers exactly the half of the map that currently has **no**
     authoritative data. Loading it inverts the coverage asymmetry rather
     than fixing it: Niagara becomes business-rich while Hamilton stays
     business-blind, because Hamilton publishes no equivalent. Worth deciding
     how the UI communicates that *before* ingesting.

### Hamilton Buildings — 214,293 footprints
Verified count. Not loaded because a single file of this size is the wrong
shape for a browser; needs splitting by key or tile, the way the reference
project splits its large dataset into `data/voa/*.json`.

### Hamilton zoning, non-industrial — 11,448 polygons
Already fetched, then filtered out at ingestion, and still sitting in the
local response cache. Recoverable without another network call if the atlas
ever wants full zoning context rather than industrial-only.

### Further Hamilton layers seen in the catalogue, never pulled
All present in the DCAT feed with live GeoServices endpoints:

Addresses · Development Applications · Vacant Building Registry ·
Businesses by Employee Count · Building & Demolition Permits (2008–2016 and
2017–present) · Planning Applications Reported Quarterly · Waterbodies ·
Watercourse · Airport · Business Improvement Areas · Historic Railways

**Vacant Building Registry** and **Businesses by Employee Count** are the two
worth checking first — the second is the only candidate found so far for
closing the Hamilton business gap.

---

## Tier B — reachable, contents uninspected

Confirmed HTTP 200 on 2026-08-18; catalogue never read.

| Source | Endpoint | Expected value |
|---|---|---|
| Ontario GeoHub | `geohub.lio.gov.on.ca` | Provincial land use, transport, hydrography |
| Ontario Open Data | `data.ontario.ca/api/3/action/` | Employment and industrial statistics |
| Open Government Canada | `open.canada.ca/data/api/3/action/` | National rail network, ports, NAICS statistics |

---

## Tier C — speculative, never probed

Ordered by how much they would change the map.

1. **Burlington** — still the real hole, and **probed without success on
   2026-08-19**. `opendata.burlington.ca` exists but returns **HTTP 403**;
   `gis.burlington.ca` does not resolve; the `cityofburlington` ArcGIS Online
   org has only 8 public items (historic locations and a bulk-trash form,
   nothing industrial, and possibly Burlington Vermont). No DCAT feed found at
   the usual Hub paths. **Next step is a human look at burlington.ca's open
   data page, or Halton Region as the upper tier** — the 403 in particular
   suggests a portal that exists and is refusing automated requests rather
   than one that is absent.
2. **Halton Region** — Burlington's upper tier; may publish employment land.
3. **Statistics Canada** — business counts by NAICS and census subdivision.
   The obvious candidate for the Hamilton business gap, and the only one that
   would let Hamilton and Niagara be compared on the same basis.
4. **The nine Niagara lower-tier municipalities** — St. Catharines, Welland,
   Niagara Falls, Thorold, Port Colborne, Grimsby, Lincoln, Fort Erie.
5. **HOPA Ports** (Hamilton-Oshawa Port Authority) — returned HTTP 403 to a
   plain request; needs a different approach or a human look.
6. **CN / CPKC / Metrolinx / VIA** — public infrastructure only. Assume no
   train positions exist; see closed list below.
7. **Hamilton brownfield programme** — no spatial dataset obvious in the
   catalogue scan. OSM currently supplies 263 `landuse=brownfield` polygons
   region-wide as an interim proxy.
8. **Hamilton "Industrial Sectors A–N"** — the City's own names for its
   industrial districts, published on a neighbourhood-boundaries PDF rather
   than as data. Relevant to §14 corridor detection as the authoritative
   naming to check discovered clusters against.

---

## Confirmed closed

Do not re-attempt. Each was established by direct check.

- **Real-time freight rail positions** — no public feed exists in Canada. CN
  and CPKC do not publish them; shipment tracking is customer-authenticated.
- **Seaway vessel transit** — public to read, `robots.txt: Disallow: /`. Link
  out; never crawl. Registered in `sources.json` with status `excluded`.
- **MPAC** — Ontario parcel and assessment data. Bulk access is fee-based and
  income/expense data is withheld. There is no Ontario equivalent of the UK
  rating-list feed behind the standard industrial-underuse method.
- **Niagara ArcGIS Hub DCAT feed** — 404. Discover through the CKAN catalogue
  at `niagaraopendata.ca`, download from `open.niagararegion.ca`.
