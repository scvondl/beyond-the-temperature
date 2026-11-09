> Prototype notes for V01–V04. See [README_Integrated.md](README_Integrated.md) for the current four-map site and launch instructions.

# DEP5118 — Beyond the Temperature (V01–V04 revision)

Open `index.html` with VS Code Live Server. HTML, CSS and JavaScript are separate files.

## Replace the four visualisations

In the prototype, the four panels displayed static images from `assets/images/`. Each panel used an `<img>` tag in `index.html`.

- V01: hourly meteorological air-temperature map; future automatic refresh requires data fetch + scheduled upstream data updates. Source: https://github.com/liq35138-star/sg-weather-map/blob/main/data/hourly/2026-10.csv (October file is not necessarily a live endpoint).
- V02: historical mean LST + LST/air comparison + **proposed** composite thermal score. Historical LST is not verified in the supplied geospatial ZIP. Define comparable spatial/temporal units, normalisation and weights before scoring.
- V03: island-wide NDVI + NDBI + proposed park environmental composite score. Validate park boundaries, rasters, VBS methodology and score direction.
- V04: Ushahidi survey + results; no response export supplied. Link: https://singaporeparks.ushahidi.io/post/create/2. Show sample sizes, response dates, consent and limitations.

The descriptions in the website are research intentions, **not claimed findings**.
