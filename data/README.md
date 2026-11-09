# Data sources and integration status

- `parks_review_summary.json`: supplied 54-park study, 52,419 collected ratings/reviews and 24,189 with text across 53 parks. Raw review text is not included.
- `park_environment_metrics.json`: supplied Candidates worksheet environmental summaries. Values match the map source CSV within the original four-decimal rounding. Missing values remain unavailable.
- `scoring_parameters.json`: original 37-park VBS reference parameters.
- `../maps/thermal/data/metadata.json`: LST, background air, park heat-score methods and source periods.
- `../maps/optical/data/metadata.json`: NDVI, NDBI, VBS, observation support and original reference scale.
- [Ushahidi survey form](https://singaporeparks.ushahidi.io/post/create/2). Map 04 loads published responses with locations from the survey service and checks for updates while open.

The historical datasets are bundled. Latest station air temperature is fetched only inside the thermal widget; the timestamp and cached fallback state are labelled.
