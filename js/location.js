// location.js — Everything related to the user's location.
//
// - Manages userLat/userLng (read by api.js, render.js, hotspots.js, map.js)
// - Converts coordinates <-> human-readable addresses via OpenStreetMap's
//   Nominatim API (free, but rate-limited — we cache results in localStorage)
// - Provides browser geolocation and manual address geocoding

let userLat = null;
let userLng = null;

// Haversine formula: great-circle distance between two lat/lng points on Earth.
// R = Earth's radius in miles. Used to sort sightings by proximity.
function distanceMiles(lat1, lng1, lat2, lng2) {
  const toRad = d => d * Math.PI / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------- Reverse-geocode cache ----------
// Nominatim is free but aggressively rate-limited. We cache lat/lng → label
// in localStorage so repeat visits don't re-hit the API. Keys are rounded
// to 3 decimals (~110m precision) so near-identical GPS readings reuse the
// same entry.
const GEOCACHE_KEY = 'birdapp_geocache';

function loadGeocache() {
  try { return JSON.parse(localStorage.getItem(GEOCACHE_KEY)) || {}; }
  catch (e) { return {}; }
}

function cacheGeocode(lat, lng, name) {
  const cache = loadGeocache();
  cache[`${lat.toFixed(3)},${lng.toFixed(3)}`] = name;
  localStorage.setItem(GEOCACHE_KEY, JSON.stringify(cache));
}

function getCachedGeocode(lat, lng) {
  return loadGeocache()[`${lat.toFixed(3)},${lng.toFixed(3)}`];
}

// Central setter for the user's location. Called from:
//   - requestLocation() — browser geolocation
//   - geocodeAddress() / address-dropdown click — manual address
// Updates the module-level lat/lng, shows a human-readable label in the
// location bar, and kicks off the nearby-hotspots fetch.
async function setUserLocation(lat, lng, displayName) {
  userLat = lat;
  userLng = lng;
  const statusEl = document.getElementById('locationStatus');
  statusEl.classList.add('active');

  if (displayName) {
    statusEl.textContent = displayName;
    cacheGeocode(lat, lng, displayName);
  } else {
    const cached = getCachedGeocode(lat, lng);
    if (cached) {
      statusEl.textContent = cached;
    } else {
      statusEl.textContent = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=en`);
        if (!res.ok) {
          console.warn(`Nominatim reverse-geocode failed: ${res.status} ${res.statusText}`);
        } else {
          const data = await res.json();
          if (data.display_name) {
            const a = data.address || {};
            const place = a.city || a.town || a.village || a.hamlet || a.county || a.municipality || a.suburb || a.neighbourhood;
            const region = a.state || a.province || a.state_district;
            const country = a.country;
            const parts = [place, region, country].filter(Boolean);
            const label = parts.length ? parts.join(', ') : data.display_name;
            statusEl.textContent = label;
            cacheGeocode(lat, lng, label);
          }
        }
      } catch (e) {
        console.warn('Nominatim reverse-geocode error:', e);
      }
    }
  }

  if (typeof showHotspots === 'function') showHotspots();
}

// ---------- Manual address search (Nominatim forward-geocoding) ----------
// Typing in the "Set address" input calls searchAddresses() with a debounce.
// Picking a result or clicking the button calls geocodeAddress() to commit.
let addressDebounce = null;

async function searchAddresses(query) {
  const dropdown = document.getElementById('addressDropdown');
  if (!query || query.length < 3) {
    dropdown.classList.remove('open');
    return;
  }
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`, {
      headers: { 'User-Agent': 'BirdSightingsApp/1.0' }
    });
    if (!res.ok) return;
    const results = await res.json();
    if (!results.length) {
      dropdown.classList.remove('open');
      return;
    }
    dropdown.innerHTML = results.map((r, i) =>
      `<div class="dropdown-item" data-index="${i}" data-lat="${r.lat}" data-lon="${r.lon}">
        <span class="common">${r.display_name}</span>
      </div>`
    ).join('');
    dropdown.classList.add('open');
  } catch (e) {
    dropdown.classList.remove('open');
  }
}

function initAddressSearch() {
  const input = document.getElementById('addressInput');
  const dropdown = document.getElementById('addressDropdown');

  input.addEventListener('input', () => {
    clearTimeout(addressDebounce);
    addressDebounce = setTimeout(() => {
      searchAddresses(input.value.trim());
    }, 300);
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    const lat = parseFloat(item.dataset.lat);
    const lon = parseFloat(item.dataset.lon);
    const name = item.textContent.trim();
    input.value = name;
    dropdown.classList.remove('open');
    document.getElementById('addressBar').style.display = 'none';
    if (typeof hotspotData !== 'undefined') {
      hotspotData = [];
      hotspotDetailCache = {};
    }
    setUserLocation(lat, lon, name);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.address-wrapper')) {
      dropdown.classList.remove('open');
    }
  });
}

async function geocodeAddress(query) {
  const statusEl = document.getElementById('locationStatus');
  const btn = document.getElementById('btnAddress');
  if (!query.trim()) return;

  btn.disabled = true;
  statusEl.textContent = 'Looking up address...';
  statusEl.classList.remove('active');

  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&addressdetails=1`, {
      headers: { 'User-Agent': 'BirdSightingsApp/1.0' }
    });
    if (!res.ok) throw new Error('Geocode failed');
    const results = await res.json();
    if (!results.length) {
      statusEl.textContent = 'Address not found — try a different search';
      btn.disabled = false;
      return;
    }
    const r = results[0];
    // Clear old hotspot data so new location fetches fresh
    if (typeof hotspotData !== 'undefined') {
      hotspotData = [];
      hotspotDetailCache = {};
    }
    document.getElementById('addressBar').style.display = 'none';
    await setUserLocation(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
    btn.disabled = false;
  } catch (e) {
    statusEl.textContent = 'Failed to look up address';
    btn.disabled = false;
    console.error('Geocode error:', e);
  }
}

// ---------- Browser geolocation ----------
// Uses the Web Geolocation API, which triggers the native permission prompt
// the first time. Requires an HTTPS origin (localhost counts) — won't work
// from file://, which is why CLAUDE.md says to use the dev server.
function requestLocation() {
  const statusEl = document.getElementById('locationStatus');
  const btn = document.getElementById('btnLocation');

  if (!navigator.geolocation) {
    statusEl.textContent = 'Geolocation not supported';
    return;
  }
  btn.disabled = true;
  statusEl.textContent = 'Getting location...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (typeof hotspotData !== 'undefined') {
        hotspotData = [];
        hotspotDetailCache = {};
      }
      setUserLocation(pos.coords.latitude, pos.coords.longitude);
      btn.disabled = false;
    },
    (err) => {
      statusEl.textContent = 'Location denied \u2014 sightings unsorted';
      btn.disabled = false;
      console.warn('Geolocation error:', err);
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
}
