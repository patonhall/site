# Western New York — Data Source Reconnaissance

**Erie County and Niagara County, New York.** The American side of the
Hamilton–Niagara Industrial Atlas.

**Reconnaissance date: 2026-08-19.** Everything below was verified against a
live endpoint on that date — counts, field names and coverage are observed.
Nothing here is assumed from documentation.

See [../INTEGRATION.md](../INTEGRATION.md) for how this side joins the
Canadian one, and [../DATA-SOURCES.md](../DATA-SOURCES.md) for the Ontario
sources.

---

## The headline finding

**New York publishes free, statewide, parcel-level property data. Ontario does
not.**

`NYS Tax Parcels Public` carries property class, gross floor area, acreage,
year built, owner name, assessed value, and utility/sewer/water service —
370,424 parcels in Erie County alone, of which **1,159 are classified
industrial**. The Ontario equivalent is MPAC, which is fee-based and withholds
income and expense data (see the closed list in `../DATA-SOURCES.md`).

This is a structural asymmetry, not a gap we can close with more work. The
American side of this atlas can support parcel-level industrial analysis —
who owns it, how big the building is, what it is assessed at — that the
Canadian side **cannot**, at any budget we would spend. `INTEGRATION.md`
covers how that gets communicated rather than smoothed over.

---

## Tier 1 — verified, high value

### 1. NYS Tax Parcels Public

| | |
|---|---|
| Organization | NYS Office of Information Technology Services / GIS Program Office |
| Portal | https://data.gis.ny.gov |
| Service | `https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Tax_Parcels_Public/FeatureServer/1` |
| Geometry | Polygon |
| Max records/request | 1,000 (paging required) |
| Coverage | **38 of New York's 62 counties** |

**Verified counts:**

| Query | Result |
|---|---:|
| `COUNTY_NAME = 'Erie'` | **370,424** parcels |
| `COUNTY_NAME = 'Erie' AND PROP_CLASS 700–799` | **1,159** industrial parcels |
| `COUNTY_NAME LIKE '%iagara%'` | **0** |

**Fields of interest:** `COUNTY_NAME, MUNI_NAME, PARCEL_ADDR, PROP_CLASS,
LAND_AV, TOTAL_AV, FULL_MARKET_VAL, YR_BLT, SQ_FT, ACRES, CALC_ACRES, GFA,
SEWER_TYPE, WATER_SUPPLY, UTILITIES, PRIMARY_OWNER, OWNER_TYPE, ROLL_YR,
SPATIAL_YR, USED_AS_DESC, BLDG_STYLE_DESC`

New York's property classification puts **industrial in the 700 series**, which
gives a clean authoritative filter — the direct equivalent of what we had to
approximate with a regex over Hamilton's `ZONING_DESC`.

> **Warning, and it is a serious one.** `PRIMARY_OWNER` names identifiable
> people and companies. Per the constraint section in `../DATA-SOURCES.md`,
> owner names must not be published at property level without a correction
> path, and should probably not be published at all in a public layer.
> Ingest the parcel geometry, class, floor area and assessment; leave owner
> identity out of the shipped GeoJSON unless there is a deliberate decision
> to include it.

**Layer index caution:** layer `/0` of this service is
`NYS_Tax_Parcels_Public_Footprint` — municipal boundaries, not parcels. The
parcels are `/1`. Same class of trap as Hamilton's shifting indices; resolve
by service name and check `name` in the layer metadata before ingesting.

### 2. Designated Brownfield Opportunity Areas

| | |
|---|---|
| Organization | NYS Department of State |
| Polygons | `https://services2.arcgis.com/okXm0pb6aWH6XOGI/arcgis/rest/services/BOA_Designations_November2021_Polygons/FeatureServer/0` |
| Centroids | `.../BOA_Designations_November2021_Points/FeatureServer/0` |
| Records | **86** statewide (verified) |
| Vintage | November 2021 designations |

Authoritative, state-designated brownfield areas. Strictly better than the
`landuse=brownfield` OSM proxy the Canadian side currently relies on, and a
clean answer to brief §4B. Small enough to ship whole.

Freshness state: **HISTORICAL / STATIC** — a 2021 designation snapshot, not a
live register. Must be labelled as such.

### 3. NYS DEC regulated facility registries

A cluster of statewide point layers on
`https://services6.arcgis.com/DZHaqZm9cxOD4CWM/arcgis/rest/services/…`, each a
register of facilities holding a specific permit:

`Air_Facility_Registrations` · `Air_State_Facility_Permits_ASF` ·
`Chemical_Bulk_Storage_Facility` · `Petroleum_Bulk_Storage_Facility` ·
`Major_Oil_Storage_Facility` ·
`Hazardous_Waste_Treatment__Storage_and_Disposal_Facilities_TSDFs` ·
`Combustion_Facilities` · `Regulated_Transfer_Facilities` ·
`Recyclables_Handling_and_Recovery_Facilities` ·
`Waste_Tire_Handling_and_Recovery_Facilities` ·
`Vehicle_Dismantling_Facilities` · `Remediation_Parcels` ·
`Wastewater_Facility`

**Why these matter more than they first appear.** A regulatory permit is
positive evidence that a specific industrial *process* happens at a location —
combustion, chemical storage, metal recovery, vehicle dismantling. That is a
different and stronger signal than OSM's `building=industrial`, which only
says something looks industrial. Together they support classification by
observed activity rather than by appearance.

They are also, in the strict sense, a form of **activity data** (brief §15):
each is a live permit, not a guess.

Counts per county not yet checked.

### 4. NYS Building Footprints

`https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/arcgis/rest/services/NYS_Building_Footprints/FeatureServer`
— statewide, with a `Building Footprint County Overview` layer. Same size
problem as Hamilton's 214,293 footprints; will need clipping to the two
counties and probably tiling. Not yet counted.

### 5. NYS DOT freight indicators

- `Truck AADT` — `https://gis.dot.ny.gov/hostingny/rest/services/Roadways/Traffic_Monitoring/FeatureServer/2`
- `Percentage Truck` — same service, layer `/3`
- `DOT Facility` — `https://gis.dot.ny.gov/hostingny/rest/services/Maintenance/DOT_Facility/FeatureServer/0`

**Truck AADT has no Canadian counterpart found so far.** Hamilton publishes a
truck *route network* — where trucks are permitted. New York publishes
measured truck *volumes* — how many actually pass. That is a materially
better input to any freight-corridor analysis, and another place the two
sides will not be symmetrical.

### 6. OpenStreetMap

Already in use, same ODbL terms, and it is the one source that spans the
border under a single schema.

**Done, 2026-08-19.** The first bounding box was
`(42.83, -80.30, 43.45, -78.90)`, whose eastern edge cut through Buffalo at
-78.88 — the American side was blank in the one source that already covered
it. Now `(42.40, -80.30, 43.55, -78.40)`, taking in both counties, and all
four layers were re-fetched.

| Layer | Features | of which WNY |
|---|---:|---:|
| Rail | 4,399 | 2,016 |
| Places | 2,675 | 700 |
| Land | 1,513 | 289 |
| Brownfield & disused | 362 | 170 |

**3,175 features on the American side**, up from zero. OSM alone now carries
Western New York until the state layers are ingested.

---

### 7. Niagara County GIS — closes the parcel gap

**Found 2026-08-19.** Niagara County runs its own ArcGIS Server, which carries
the parcels the *state* dataset omits.

| | |
|---|---|
| Service | `https://gis.niagaracounty.com/arcgis/rest/services/NC_GIS/NC_GIS/FeatureServer/4` |
| Layer | `Parcel` (layer 4 of 9; others: municipality, bridges, parks, fire, school and agricultural districts) |
| Records | **94,318** parcels |
| Industrial (`PropClsite` 700–799) | **364** |

**It is richer than the state layer in one important way: it has `ZoneCode`.**
NYS Tax Parcels Public has no zoning field at all. Niagara County's is often
blank but populated for some parcels.

Class descriptions come pre-written — "Manufacturing and Processing", "Light
Industrial Manufacturing and Processing", "High Tech. Manufacturing and
Processing" — so no code lookup table is needed.

`OwnrName`, `own_street_address` and `own_city_state_zip` must be dropped at
ingestion, same as for the state parcels.

Also present on this server: `Inactive_Landfills`, `Farmland`, imagery back to
2013.

---

## Tier 2 — reachable, not yet inspected

| Source | Endpoint | Note |
|---|---|---|
| City of Buffalo Open Data | `data.buffalony.gov` (Socrata) | **Scanned 2026-08-19** — see below |
| NYS Open Data | `data.ny.gov` (Socrata) | API responded; catalogue unread |
| Erie County GIS | `gis.erie.gov` | Live; not a Hub DCAT feed — needs a look |
| ~~Niagara County GIS~~ | — | **Found**, see Tier 1 §7 (`gis.niagaracounty.com`) |
| EPA Envirofacts | `data.epa.gov/efservice/…` | Verified returning JSON; TRI facility records with county FIPS, addresses and a `fac_closed_ind` flag. Erie = FIPS 36029, Niagara = 36063 |

---

## Verified, key required

### US Census County Business Patterns (2022)

`https://api.census.gov/data/2022/cbp` — the closest US analogue to Niagara
Region's NEI: establishment and employment counts by NAICS by county.

**Verified 2026-08-19 with a live key:**

| County | FIPS | NAICS rows | Manufacturing rows | Establishments, all industries |
|---|---|---:|---:|---:|
| Erie | 36029 | 1,366 | 262 | **22,574** |
| Niagara | 36063 | 812 | 109 | **4,510** |

**Tabular, not geospatial** — counts per county, not mapped points. It informs
classification weighting and validates other layers; it does not become a map
layer of its own. Crucially it is the one source that could put Hamilton,
Niagara Region and the two US counties on a comparable NAICS footing, since
the NEI also carries NAICS.

**Captured 2026-08-19** to `../data/us-cbp-2022.json` (528 KB) by
`scripts/fetch_census.py`. Full NAICS breakdown for both counties, including
employment: Erie 22,574 establishments / 417,244 employees; Niagara 4,510 /
57,849.

**The key is no longer needed.** CBP is published annually and is small, so
this is a capture-once source, not a recurring fetch. The committed file is
the working copy; a key is only required again to pull a newer vintage
(`--year 2023`).

**Key handling when that day comes.** Free from
`api.census.gov/data/key_signup.html`. It must **never** be committed — this
repository is public. The script reads it from the environment and never
writes it to disk:

```bash
export CENSUS_API_KEY=...
python3 fetch_census.py --year 2023
```

A bad or missing key is returned by the Census API as an HTML page rather than
an error status, so the script checks the response actually starts as JSON —
otherwise an auth failure would look exactly like a county with no
businesses.

---

## City of Buffalo open data — scanned 2026-08-19

**51 datasets are Buffalo's own.** The portal's default API returns 400
records, but only 51 carry `domainCName = data.buffalony.gov`; 177 are
`data.ny.gov` and 170 are `health.data.ny.gov`. The `/api/catalog/v1` search
endpoint federates across *all* Socrata portals and cheerfully returns Austin,
Los Angeles and Santa Clara results for a Buffalo query. **Filter by
`domainCName` or the catalogue will lie to you.**

Of the 51, the ones with industrial value:

| Dataset | Why |
|---|---|
| **2025 Final Assessment Roll** | Parcel-level assessment for the city |
| **BPIS – Building Permits** | Construction activity; genuine §15 activity data |
| BPIS – Inspections | Follow-on activity |
| Commercial Sales / Property Sales | Transaction record — industrial property turnover |
| Property Tax / Tax Roll | Assessment context |
| Permits in the Right of Way | Works activity |
| Neighborhood Metrics / Data Lens | Area context |

**No zoning, no parcel geometry, no industrial land layer.** Buffalo's open
data is tabular assessment, tax and census; its GIS is elsewhere. The
assessment roll would need joining to parcel geometry from another source.

---

## Confirmed dead ends

- **`data-ecgis.opendata.arcgis.com`** is **Eaton County, Michigan**, not Erie
  County, New York. It returns a plausible-looking ArcGIS Hub with 78
  datasets, including "Eaton County ORV Approved Roads". Caught during this
  pass; recorded so the near-miss is not repeated.
- **Niagara County is not in `NYS Tax Parcels Public`.** Verified twice:
  exact match and `LIKE '%iagara%'` both return 0, and the distinct-value
  query lists 38 participating counties without it. **Resolved** — the county
  publishes its own parcels; see Tier 1 §7.
- **`data.buffalony.gov` federates other cities' data.** Its catalogue search
  returns Austin, LA and Santa Clara. Always filter by `domainCName`.

---

## Gaps and what they imply

**1. The two counties are not equally covered.** Erie has 370,424 public
parcels; Niagara has none in the state dataset. Within the American side
alone there is already the same coverage asymmetry the Canadian side has
between Hamilton and Niagara Region — and it points the opposite way across
the border. The atlas will therefore have **four differently-covered
quadrants**, which is exactly why per-layer coverage has to be a visible
feature and not a footnote.

**2. Licensing is simpler here.** New York State and federal datasets are
generally open with attribution and without share-alike. The binding
constraint on the combined map remains **OSM's ODbL share-alike**, which is
unchanged by anything on this side.

**3. Classification does not line up across the border.** Four vocabularies
are now in play: OSM tags, Hamilton `ZONING_DESC`, Niagara Region
`primarynaics`/`primarysector`, and NY `PROP_CLASS`. A crosswalk to the
atlas taxonomy is now required rather than optional — see `INTEGRATION.md`.

---

## Prioritization

| Source | Value | Coverage | Authority | Machine-readable | Licence | Cost |
|---|---|---|---|---|---|---|
| NYS Tax Parcels (Erie) | ★★★★★ | Erie only | ★★★★★ | ★★★★★ | ★★★★★ | Medium (370k, paged) |
| NYS DEC facility registries | ★★★★ | Statewide | ★★★★★ | ★★★★★ | ★★★★★ | Low |
| Brownfield Opportunity Areas | ★★★★ | Statewide | ★★★★★ | ★★★★★ | ★★★★★ | Low |
| OSM (bbox extension) | ★★★★ | **Both counties** | ★★★ | ★★★★★ | ★★★ ODbL | Low |
| NYS DOT Truck AADT | ★★★ | Statewide | ★★★★★ | ★★★★★ | ★★★★★ | Low |
| NYS Building Footprints | ★★★ | Statewide | ★★★★★ | ★★★★★ | ★★★★★ | High (needs tiling) |
| Census CBP | ★★★ | Both counties | ★★★★★ | ★★★★ | ★★★★★ | Low (needs key) |

**Recommended first build order:** extend the OSM bbox and re-fetch (cheapest,
and it makes the map non-blank across the border immediately) → DEC facility
registries clipped to the two counties → Erie industrial parcels (1,159, the
`PROP_CLASS 700–799` filter) → Brownfield Opportunity Areas → then decide
about Niagara County.
