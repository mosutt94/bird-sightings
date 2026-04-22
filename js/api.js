let BACK_DAYS = 30;
const SEARCH_RADIUS = 50; // km radius for sightings search

let taxonomy = [];

async function ebirdProxy(path, params = {}) {
  const qs = new URLSearchParams({ path, ...params }).toString();
  const res = await fetch(`/.netlify/functions/ebird?${qs}`);
  if (!res.ok) throw new Error(`eBird proxy failed: ${res.status}`);
  return res.json();
}

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

function normalizeName(s) {
  return s.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
}

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

async function fetchSightingsData(speciesCode) {
  if (userLat != null && userLng != null) {
    return ebirdProxy(`data/obs/geo/recent/${speciesCode}`, {
      lat: userLat, lng: userLng, dist: SEARCH_RADIUS, back: BACK_DAYS
    });
  }
  return ebirdProxy(`data/obs/US-NJ/recent/${speciesCode}`, { back: BACK_DAYS });
}
