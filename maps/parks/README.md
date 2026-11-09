# Park Voices — 54-park review map

Leaflet map of the 54 parks in the review study. Every park is drawn as a green boundary; clicking one opens a
panel with its word cloud and a pie chart of its ten most frequent review words plus an aggregated **Others**
slice.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | Map page (also embedded in `../../index.html` as MAP 03) |
| `app.js` | Leaflet setup, filters, detail panel, pie chart |
| `style.css` | Green-only palette and responsive layout |
| `data/parks.geojson` | 54 features: 53 MultiPolygons + 1 Point (P51) |
| `data/park_reviews.json` | Review counts and the 32 ranked terms per park |
| `data/planning-areas.geojson` | Local basemap (URA planning areas), copied from the thermal map |
| `vendor/leaflet/` | Local Leaflet 1.x build |

Word clouds are not duplicated here: the panel loads `../../assets/images/park-wordclouds/Pxx.png`.

## Boundary sources and matching

1. `SG-兴趣面.shp` (584 OSM park polygons, WGS84) — primary source, matched by exact name.
2. `NParksParksandNatureReserves.geojson` (462 NParks polygons) — used for the five parks the OSM file lacks
   entirely: Fort Canning, Bukit Batok Nature Park, Hindhede, Toa Payoh Town Park and Bidadari. Multi-part parks
   that exist in the OSM file are merged rather than replaced.

| Park | Polygon used | Note |
| --- | --- | --- |
| P01 Bishan-Ang Mo Kio Park | 2 OSM parts | OSM splits it into two polygons |
| P05 Kallang Riverside Park | OSM North + East | merged |
| P11 East Coast Park | 8 OSM zones (A–H) | merged into one feature |
| P16 Punggol Point Park | OSM polygon | 6 vertices after simplification |
| P17 Fort Canning Park | NParks `FORT CANNING PARK` | not in the OSM file |
| P22 Bukit Batok Nature Park | NParks `BUKIT BATOK NATURE PARK` | not in the OSM file |
| P23 Clementi Woods Park | OSM `Clementi Woods` | OSM name drops "Park" |
| P24 Hindhede Nature Park | NParks `HINDHEDE NATURE PARK` | not in the OSM file |
| P26 Zhenghua Park | OSM `Zhenghua Nature Park` | closest available; verify if you need the exact 54-park definition |
| P34 Toa Payoh Town Park | NParks `TOA PAYOH TOWN PK` | not in the OSM file |
| P41 Bidadari Park | NParks `BIDADARI PK` | not in the OSM file |
| P42 Woodlands Town Garden | OSM `Marsiling Park` | park renamed; the review data still uses P42 |
| P44 Jurong Lake Gardens | OSM Lakeside + Japanese + Chinese Garden | merged |
| P45 Duxton Plain Park | 2 OSM parts | merged |
| P50 one-north Park | OSM `one-north Park` | sub-parks (Rochester, Fusionopolis) excluded |
| P51 Marina City Park | Point (1.2820, 103.8680) | park removed in 2007; approximate location, no reviews |

All coordinates were rounded to 6 decimals and simplified with a 0.00004° tolerance; rings smaller than four
points were dropped.

## Rebuilding `parks.geojson`

`tools/build_parks_geojson.py` (in the package root) regenerates the data file:

```powershell
python tools\build_parks_geojson.py --shp-dir "<folder with SG-*.shp/.dbf>" ^
  --nparks "<NParksParksandNatureReserves.geojson>" ^
  --parks-csv "<parks_54.csv>" --web "<...>\web"
```

It prints one line per park (parts and vertex counts) so a broken match is visible immediately. The `MATCH`
dictionary at the top of the script is the single place to edit if a name does not resolve.

## Reading the panel

- Word frequency comes from `data/parks_review_summary.json` (the same numbers as the word clouds and the
  comparison cards), not from a new count.
- The pie always shows 10 terms + Others, so the shares sum to 100% of that park's counted mentions.
- Frequency is not sentiment, visitor volume or thermal comfort. P51 has no reviews and shows an empty state.
