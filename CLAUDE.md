# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NJ Bird Sightings — a zero-dependency web application that lets users search for recent bird sightings in New Jersey, sorted by proximity to the user's location. There is no build system, no package manager, and no backend.

## How to Run

Open `index.html` in a browser. Requires an internet connection for eBird API calls. Must be served over HTTP (not `file://`) for geolocation to work in most browsers — use any local server (e.g. `python3 -m http.server`).

## Architecture

- **No build step**: No transpilation, bundling, or package management
- **Client-side only**: All data fetching and rendering happens in the browser
- Scripts are loaded in order via `<script>` tags (not ES modules), so globals from earlier scripts are available to later ones

### File Layout

- `index.html` — Markup shell only, links to CSS and JS files
- `css/styles.css` — All styles, CSS custom properties for theming on `:root`
- `js/api.js` — eBird API config (`API_KEY`, `REGION`, `BACK_DAYS`), taxonomy loading, species filtering, sightings fetch
- `js/location.js` — Geolocation state (`userLat`/`userLng`), haversine distance calc, browser geolocation requests
- `js/search.js` — Search input handling, debounce, dropdown rendering, keyboard navigation
- `js/render.js` — `fetchSightings()` orchestrates API call, proximity sorting, and sighting card HTML
- `js/app.js` — Entry point, wires up event listeners and kicks off init (taxonomy load + geolocation request)

### API Integration (eBird v2)

- **Taxonomy endpoint**: Fetches ~10K bird species on page load, stored in-memory for fast local filtering
- **Sightings endpoint**: Fetches recent observations for a selected species in US-NJ (last 30 days)
- Auth via `X-eBirdApiToken` header; API key is the `API_KEY` constant in `js/api.js`

### Key Cross-File Dependencies

- `js/render.js` reads `userLat`/`userLng` and `distanceMiles()` from `js/location.js`
- `js/render.js` calls `fetchSightingsData()` from `js/api.js`
- `js/search.js` calls `filterSpecies()` from `js/api.js` and `fetchSightings()` from `js/render.js`
- `js/app.js` calls `initSearch()` from `js/search.js`, `requestLocation()` from `js/location.js`, and `loadTaxonomy()` from `js/api.js`
