# Integrated maps

The main page contains four interactive maps covering temperature, landscape, park reviews and visitor survey responses. The temperature and landscape maps each have a guide above the map. The park detail page uses the same landscape widget alongside reviews, word clouds and environmental comparison cards.

The park map shows all 54 parks as green boundaries (53 polygons plus one point for the removed Marina City Park). Clicking a park opens a panel with that park's word cloud and a pie chart of its ten most frequent review terms, with every remaining term grouped as Others. Boundaries come from the supplied OSM park polygons, with NParks polygons filling the gaps. See `maps/parks/README.md`.

The temperature, landscape and review maps include their historical data and assets. The latest NEA station readings require an internet connection and use a labelled saved snapshot when available. Map 04 reads published, mapped Ushahidi responses and shows them in interactive park illustrations. It loads survey data and basemap tiles online.

The site needs a local HTTP server because the maps fetch JSON and binary rasters; `START_WINDOWS.bat` starts one with Windows PowerShell only (no Python). `START_WINDOWS_PYTHON.bat` keeps the older Python path.
