# Atlas operations — re-ingestion runbook

For Atlas admins. This is the procedure for refreshing the data the map runs
on, from nothing to a verified rebuild.

Everything the map serves is **pre-generated and committed**. The browser
never calls a public API. So refreshing the atlas means running these scripts,
checking the output, and committing the result — there is no server to deploy
and no build step beyond this.

**Nothing here runs automatically.** That is deliberate: every source below
has a rate limit, a licence, or a quirk that deserves a human looking at the
output before it ships.

---

## 0. Before you start

**Requirements**

- Python 3.9+ — standard library only. No pip install, no virtualenv.
- Network access to Overpass, ArcGIS services, and the Census API.
- About **40 minutes** for a full refresh, most of it waiting on Overpass.
- About **500 MB** free: ~37 MB of committed output, the rest response cache.

**Environment**

Only one script needs a secret:

```bash
export CENSUS_API_KEY=...        # free: api.census.gov/data/key_signup.html
```

Never commit it. This repository is public.

**Working directory matters.** Each script resolves its output relative to its
own location, so run them from the directory they live in.

---

## 1. Full refresh, in order

Run from `atlas/`:

```bash
# 1. OpenStreetMap — region-wide, both countries          (~10-15 min)
cd scripts
python3 fetch_osm.py --refresh

# 2. City of Hamilton — Ontario authoritative layers      (~5 min)
python3 fetch_hamilton.py --refresh

# 3. New York State + Niagara County                      (~15 min)
cd ../us/scripts
python3 fetch_nys.py --refresh

# 4. US Census — only if you want a newer vintage         (~1 min)
python3 fetch_census.py --year 2022
```

Order does not strictly matter — no script reads another's output — but this
is the order of increasing fragility, so a failure early is a cheap failure.

### What each one writes

| Script | Outputs | Approx features |
|---|---|---:|
| `fetch_osm.py` | `osm-places`, `osm-land`, `osm-rail`, `osm-disused` | 8,900 |
| `fetch_hamilton.py` | `hamilton-employment-land`, `hamilton-zoning-industrial`, `hamilton-rail`, `hamilton-truck-routes` | 3,400 |
| `fetch_nys.py` | `us-industrial-parcels`, `us-brownfield`, `us-facilities` | 11,500 |
| `fetch_census.py` | `us-cbp-<year>.json` (a table, not a layer) | — |

All land in `atlas/data/`.

### Partial refresh

Every script takes `--layer` to do one thing at a time:

```bash
python3 fetch_osm.py --refresh --layer rail
python3 fetch_hamilton.py --refresh --layer "Employment Lands"
python3 fetch_nys.py --refresh --layer parcels      # parcels | brownfield | facilities
```

---

## 2. The cache, and the one trap in it

Raw responses are cached under `scripts/.cache/` and `us/scripts/.cache/`,
both gitignored. Without `--refresh` a script reuses them and touches no
network — which makes re-running after a code change fast and free.

**The trap:** a cache key must cover the *whole request*, not just the
endpoint. `fetch_nys.py` once keyed on service URL plus page offset only, so
when the Erie parcel filter was widened from 1,159 rows to 4,822 it silently
returned the old, narrower cached result. The script reported success and the
map stayed quietly wrong.

If you change a query, either pass `--refresh` or make sure the cache key
includes what you changed. When a count comes back *exactly* the same as
before a filter change, suspect the cache first.

To force a genuinely clean run:

```bash
rm -rf scripts/.cache us/scripts/.cache
```

---

## 3. Verify before committing

```bash
cd atlas

# Feature counts, sizes and freshness per file
python3 - <<'EOF'
import json, glob, os
total = 0
for p in sorted(glob.glob('data/*')):
    d = json.load(open(p))
    n = len(d.get('features', []))
    kb = os.path.getsize(p) / 1024
    total += kb
    a = d.get('atlas', {})
    print(f"{os.path.basename(p):<38}{n:>7}{kb:>9.0f} KB  {a.get('freshness','-')}")
print(f"{'TOTAL':<38}{'':>7}{total:>9.0f} KB")
EOF
```

**Check, every time:**

1. **No count collapsed to zero.** A layer that silently empties reads on the
   map as "there is no industry here", which is a factual claim the pipeline
   is not entitled to make. Zero means investigate, never commit.
2. **No count is identical to a previous run after a query change** — see the
   cache trap above.
3. **Every feature still has provenance:**

```bash
python3 - <<'EOF'
import json, glob
bad = 0
for p in glob.glob('data/*.geojson'):
    d = json.load(open(p))
    for f in d['features']:
        if not f.get('geometry'): bad += 1
        if not (f['properties'].get('source') or {}).get('retrieved_at'): bad += 1
print('features missing geometry or provenance:', bad)   # must be 0
EOF
```

4. **No personal data leaked.** Parcel sources carry owner names and mailing
   addresses; ingestion strips them. Confirm:

```bash
grep -l "PRIMARY_OWNER\|OwnrName\|own_street_address" data/*.geojson \
  && echo "OWNER DATA LEAKED — do not commit" || echo "clean"
```

5. **No API key in the tree:**

```bash
git diff --stat && git status --short
grep -rn "CENSUS_API_KEY *=" --include=*.py --include=*.json . | grep -v os.environ
```

6. **The parent site still builds** — the atlas shares a repo with it:

```bash
cd .. && python3 build.py --check && python3 -m pytest tests -q
```

---

## 4. View it locally

The map fetches its GeoJSON, so `file://` will not work. Serve over HTTP:

```bash
cd ~/making/site
python3 -m http.server 8000
# then open http://localhost:8000/atlas/
```

Toggle each refreshed layer at least once. A layer whose row says
**"unavailable"** failed to load — that is the map behaving correctly, and a
sign the file is malformed or missing, not that the source is empty.

---

## 5. Adding or changing a source

1. **Reconnaissance first.** Probe the live endpoint, record the verified
   count, field names, licence and update frequency in the relevant
   `DATA-SOURCES.md`. Record dead ends too — they are as valuable as finds.
2. **Register it** in `sources/sources.json` or `us/sources.json`.
3. **Write ingestion** that normalizes to the atlas schema with a full
   `source` block, keeps the original attributes verbatim, and strips
   personal data.
4. **Add the layer** to the `LAYERS` table in `app.js` — the one place the
   switch list, styling, region tab and credits are all generated from.
5. **Update** `INTEGRATION.md` §5 if the new source changes what any region's
   coverage looks like.

---

## 6. Known failure modes

| Symptom | Cause | Action |
|---|---|---|
| `overpass busy (HTTP 504), waiting Ns` | Overpass under load | Normal. The script backs off and retries four times. |
| `Overpass stayed busy after 4 attempts` | Sustained load | Wait and re-run. Do not parallelise — it is a free shared service. |
| Count identical after a filter change | Stale cache | `--refresh`, or delete `.cache/` |
| `WARNING: "<name>" not found in the catalogue` | Hamilton renamed or withdrew a dataset | Check `open.hamilton.ca`; the script skips rather than writing an empty layer |
| ArcGIS `Invalid field` error | Publisher renamed a field | Re-inspect the layer with `?f=json` and update the script |
| Census returns HTML, not JSON | Missing or rejected key | `export CENSUS_API_KEY=...`. The script detects this rather than writing an empty table. |
| Layer returns a *different* dataset than expected | FeatureServer layer index changed | Indices are publisher-assigned and unstable. `fetch_hamilton.py` resolves by name via DCAT; do the same for new sources. |

---

## 7. Rate limits and licences

- **Overpass** is a free shared service. One query per layer, never one per
  feature; caching on; a descriptive User-Agent so operators can identify the
  traffic. Do not run parallel refreshes.
- **ODbL (OpenStreetMap) is the binding licence** on anything derived, because
  OSM is the only source covering the whole map. Share-alike applies. Every
  feature carries its own licence in `source.license` so the obligation
  travels with the data.
- **`seaway-greatlakes.com` is `Disallow: /`.** Registered as `excluded`.
  Never build a collector against it.
- **Attribution is required** by Hamilton, Niagara Region, NYS and Niagara
  County. It is rendered from the `LAYERS` table, so it stays correct as long
  as new sources are registered there.

---

## 8. Refresh cadence

Nothing here needs to be frequent. Suggested rhythm:

| Source | Cadence | Why |
|---|---|---|
| OpenStreetMap | Quarterly | Continuously edited; the only live-ish source |
| Hamilton | Twice yearly | Layers carry their own `modified` date — check it first |
| NYS / Niagara County | Yearly | Assessment-roll driven |
| Census CBP | On a new vintage | Annual publication; captured once, then static |
| Brownfield Opportunity Areas | Rarely | A 2021 designation snapshot, labelled `HISTORICAL` |

Before a refresh, check whether the source actually changed. Hamilton's DCAT
feed exposes `modified` per dataset; re-pulling an unchanged layer costs the
publisher bandwidth and gains nothing.
