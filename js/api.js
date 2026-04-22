const API_KEY = 'lo5oml2c4gb0';
let BACK_DAYS = 30;
const SEARCH_RADIUS = 50; // km radius for sightings search

let taxonomy = [];

async function loadTaxonomy() {
  try {
    const res = await fetch('https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json&cat=species&locale=en', {
      headers: { 'X-eBirdApiToken': API_KEY }
    });
    const data = await res.json();
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
  let url;
  if (userLat != null && userLng != null) {
    url = `https://api.ebird.org/v2/data/obs/geo/recent/${speciesCode}?lat=${userLat}&lng=${userLng}&dist=${SEARCH_RADIUS}&back=${BACK_DAYS}`;
  } else {
    url = `https://api.ebird.org/v2/data/obs/US-NJ/recent/${speciesCode}?back=${BACK_DAYS}`;
  }
  const res = await fetch(url, { headers: { 'X-eBirdApiToken': API_KEY } });
  return res.json();
}
