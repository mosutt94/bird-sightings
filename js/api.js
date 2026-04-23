// api.js — All eBird API access.
// Every request goes through the Netlify Function at /.netlify/functions/ebird,
// which forwards to api.ebird.org and injects the EBIRD_API_KEY header
// server-side so the key never reaches the browser.
//
// Globals exposed to other files:
//   taxonomy       — array of { code, common, sci } loaded once on page load
//   BACK_DAYS      — how many days of sightings to fetch (mutated by the UI)
//   loadTaxonomy() — called by app.js on startup
//   filterSpecies() — used by search.js for the dropdown
//   fetchSightingsData() — used by render.js when a bird is picked

let BACK_DAYS = 30;
const SEARCH_RADIUS = 50; // km radius for location-based sightings search

let taxonomy = []; // filled by loadTaxonomy() — ~10k species

// Thin wrapper around the Netlify Function. Converts our (path, params) call
// shape into a single GET request that the proxy can unpack.
async function ebirdProxy(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params }).toString();
  const res = await fetch(`/.netlify/functions/ebird?${qs}`);
  if (!res.ok) throw new Error(`eBird proxy failed: ${res.status}`);
  return res.json();
}

// Called once at startup. We keep the full taxonomy in memory so the search
// dropdown can filter locally without hitting the network on every keystroke.
async function loadTaxonomy() {
  try {
    const data = await ebirdProxy('ref/taxonomy/ebird', {
      fmt: 'json', cat: 'species', locale: 'en'
    });
    taxonomy = data.map(s => ({
      code: s.speciesCode,
      common: s.comName,
      sci: s.sciName
    }));
  } catch (e) {
    console.error('Failed to load taxonomy:', e);
  }
}

// Lowercase, treat hyphens as spaces, collapse whitespace.
// Lets users type "black and white warbler" and still match "Black-and-white Warbler".
function normalizeName(s) {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

// Returns up to 12 taxonomy entries whose common name contains the query.
// Called on every keystroke in the search input — keep it cheap.
function filterSpecies(query) {
  if (!query || query.length < 2) return [];
  const q = normalizeName(query);
  const matches = [];
  for (let i = 0; i < taxonomy.length && matches.length < 12; i++) {
    if (normalizeName(taxonomy[i].common).includes(q)) {
      matches.push(taxonomy[i]);
    }
  }
  return matches;
}

// Two endpoints depending on whether we have the user's coordinates:
// - geo/recent: sightings within SEARCH_RADIUS km of the user
// - US-NJ/recent: fallback — recent sightings anywhere in New Jersey
async function fetchSightingsData(speciesCode) {
  if (userLat != null && userLng != null) {
    return ebirdProxy(`data/obs/geo/recent/${speciesCode}`, {
      lat: userLat, lng: userLng, dist: SEARCH_RADIUS, back: BACK_DAYS
    });
  }
  return ebirdProxy(`data/obs/US-NJ/recent/${speciesCode}`, { back: BACK_DAYS });
}
