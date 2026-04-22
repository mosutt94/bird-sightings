# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NJ Bird Sightings — a zero-dependency web frontend that lets users search for recent bird sightings in New Jersey, sorted by proximity to the user's location. Deployed on Netlify with a single serverless function that proxies eBird API calls so the eBird key stays server-side.

## How to Run

Local dev uses `dev-server.py` — a ~80-line Python stdlib server that serves static files and proxies `/.netlify/functions/ebird` to the real eBird API so local matches prod.

```
python3 dev-server.py
```

Then open `http://localhost:8000`. The script reads `EBIRD_API_KEY` from a gitignored `.env.local` file (copy `.env.local.example` → `.env.local` and paste the key from Netlify's env vars).

Production deploys go to Netlify, where `netlify/functions/ebird.js` handles the proxy using `EBIRD_API_KEY` set in the Netlify dashboard.

## Architecture

- **No frontend build step**: No transpilation, bundling, or package management
- **Client-side frontend + one serverless function**: Browser code is plain HTML/CSS/JS; Netlify Function proxies eBird to hide the API key
- Scripts are loaded in order via `<script>` tags (not ES modules), so globals from earlier scripts are available to later ones

### File Layout

- `index.html` — Markup shell only, links to CSS and JS files
- `css/styles.css` — All styles, CSS custom properties for theming on `:root`
- `js/api.js` — `ebirdProxy()` helper, taxonomy loading, species filtering, sightings fetch
- `js/location.js` — Geolocation state (`userLat`/`userLng`), haversine distance calc, browser geolocation requests
- `js/search.js` — Search input handling, debounce, dropdown rendering, keyboard navigation
- `js/render.js` — `fetchSightings()` orchestrates API call, proximity sorting, and sighting card HTML
- `js/auth.js` — Firebase init, Google sign-in flow, `currentUser` state
- `js/favorites.js` — Favorites (Firestore when signed in, localStorage when not)
- `js/app.js` — Entry point, wires up event listeners and kicks off init (taxonomy load + geolocation request)
- `netlify/functions/ebird.js` — Serverless proxy that forwards `?path=...` to `https://api.ebird.org/v2/...` with `X-eBirdApiToken` from `EBIRD_API_KEY` env var
- `netlify.toml` — Tells Netlify the publish dir and functions dir

### API Integration (eBird v2)

- All eBird calls go through `/.netlify/functions/ebird?path=<eBird-path>&...` — never directly from the browser
- **Taxonomy endpoint**: Fetches ~10K bird species on page load, stored in-memory for fast local filtering
- **Sightings endpoint**: Fetches recent observations for a selected species in US-NJ (last 30 days)
- **Hotspots endpoints**: Nearby hotspots + recent observations per hotspot

### Key Cross-File Dependencies

- `js/render.js` reads `userLat`/`userLng` and `distanceMiles()` from `js/location.js`
- `js/render.js` calls `fetchSightingsData()` from `js/api.js`
- `js/search.js` calls `filterSpecies()` from `js/api.js` and `fetchSightings()` from `js/render.js`
- `js/app.js` calls `initSearch()` from `js/search.js`, `requestLocation()` from `js/location.js`, and `loadTaxonomy()` from `js/api.js`
