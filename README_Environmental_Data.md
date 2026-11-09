> Prototype update notes. See [README_Integrated.md](README_Integrated.md) for the current four-map site.

# V03 environmental data integration

Source: Singapore_Park_Selection(1).xlsx, Candidates sheet.

New file: `data/park_environment_metrics.json` (keyed by park ID).
Updated: `js/visualization03.js` (loads review and environmental JSON together, updates both comparison cards), `css/visualization03.css` (metric styling).

NDVI = vegetation greenness; NDBI = built-up surface index; median LST = historical surface temperature; Temperature score 0–100 (higher hotter); VBS 0–100 (higher greener). VBS is NOT a thermal comfort score. Missing and unscored entries remain unavailable, not zero. Values are displayed at 3 decimals for indices, 2 decimals for LST and 1 decimal for scores. Original workbook precision is retained to 4 decimals in JSON.

Run with VS Code Live Server. Data are a snapshot of the uploaded workbook, not an automatic Excel sync.
