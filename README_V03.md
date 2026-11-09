> Prototype update notes. See [README_Integrated.md](README_Integrated.md) for the current four-map site.

# V03 detail page — incremental update

Open `index.html` with VS Code Live Server and click the new button in V03. The detailed page is `visualization03.html`.

## What changed
- `index.html`: only adds a V03 link and explanatory sentence; original V01, V02, V04 and other content preserved.
- `css/style.css`: appends only a small entry-panel rule.
- New `visualization03.html`, `css/visualization03.css`, `js/visualization03.js`.
- New `data/parks_review_summary.json` computed from the supplied 52,419 reviews.
- New 53 regenerated word clouds, not exact copies of the earlier report's images.
- Three actual island-wide PNG maps from the supplied 2021–2025 archive (NDVI, NDBI, VBS).
- Metadata JSON for VBS and source settings, for later interpretation.

## Important limitations
- Park-specific NDVI, NDBI and environmental scores **are not calculated**. The site marks them as missing; do not claim park rankings yet.
- The VBS raster is an island-wide supplied composite, not an automatically computed park score.
- The source review corpus is a recent-first sample, not representative of all visitors; word frequency is not sentiment.
- This page works offline with Live Server; it uses a local JSON file and no external APIs.
- Categories follow the five park groups in the supplied reviews report.
