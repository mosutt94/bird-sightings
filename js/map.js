// map.js — Leaflet map view for sightings and hotspots.
//
// Leaflet is loaded via CDN in index.html; the `L` global comes from there.
// `map` is created lazily (only when the user switches to map view) because
// Leaflet misbehaves when initialized inside a hidden container.

let map = null;          // Leaflet map instance (created once, reused)
let markerLayer = null;  // layer group we clear + repopulate between renders
let currentMapLimit = 20; // how many sightings to show — 0 means "all"

function initMap() {
  if (map) return;
  map = L.map('map').setView([40.06, -74.4], 8);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
    subdomains: 'abcd'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

// Render a species' sightings on the map: one marker per sighting, plus
// an extra blue dot for the user's location. fitBounds() auto-zooms to
// include all of them.
function renderMap(sightings, speciesName) {
  if (!map) initMap();
  markerLayer.clearLayers(); // wipe any previous species' markers

  const sorted = [...sightings];
  if (userLat != null && userLng != null) {
    sorted.forEach(obs => {
      if (obs._dist == null) {
        obs._dist = distanceMiles(userLat, userLng, obs.lat, obs.lng);
      }
    });
    sorted.sort((a, b) => a._dist - b._dist);
  }

  const limit = currentMapLimit === 0 ? sorted.length : currentMapLimit;
  const visible = sorted.slice(0, limit);

  const mapCountEl = document.getElementById('mapCount');
  mapCountEl.textContent = `Showing ${visible.length} of ${sorted.length} sightings`;

  document.getElementById('btnBirdInfoMap').style.display = '';

  const bounds = [];

  visible.forEach(obs => {
    const date = new Date(obs.obsDt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const time = obs.obsDt.includes(' ')
      ? new Date(obs.obsDt.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const countLabel = obs.howMany != null ? `${obs.howMany} counted` : 'Present (not counted)';
    const distText = obs._dist != null
      ? `<br><strong>${obs._dist < 1 ? obs._dist.toFixed(1) : Math.round(obs._dist)} mi</strong> away`
      : '';

    const popup = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;line-height:1.4;min-width:160px;">
        <div style="font-weight:700;font-size:0.95rem;color:#3a6b4c;margin-bottom:4px;">${speciesName}</div>
        <div style="font-weight:600;font-size:0.88rem;margin-bottom:6px;">${obs.locName}</div>
        <div style="font-size:0.82rem;color:#6b6b6b;">
          Reported ${date}${time ? ' at ' + time : ''}<br>
          ${countLabel}
          ${obs.locPrivate ? ' &middot; Private location' : ''}
          ${distText}
        </div>
      </div>`;

    const marker = L.marker([obs.lat, obs.lng]).bindPopup(popup);
    markerLayer.addLayer(marker);
    bounds.push([obs.lat, obs.lng]);
  });

  if (userLat != null && userLng != null) {
    const userIcon = L.divIcon({
      className: '',
      html: '<div style="width:14px;height:14px;background:#2563eb;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });
    L.marker([userLat, userLng], { icon: userIcon })
      .bindPopup('<strong>Your location</strong>')
      .addTo(markerLayer);
    bounds.push([userLat, userLng]);
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 });
  }
}

async function toggleMapBirdInfo() {
  const panel = document.getElementById('mapBirdInfoPanel');
  const btn = document.getElementById('btnBirdInfoMap');
  if (panel.classList.contains('open')) {
    panel.className = 'bird-info-panel';
    panel.innerHTML = '';
    if (btn) btn.textContent = 'Show info';
    return;
  }

  const name = lastSpeciesName;
  if (!name) return;

  if (wikiCache[name]) {
    renderInfoInto(panel, wikiCache[name]);
    if (btn) btn.textContent = 'Hide info';
    return;
  }

  panel.className = 'bird-info-panel loading';
  panel.innerHTML = 'Loading...';
  try {
    const data = await fetchBirdInfo(name);
    wikiCache[name] = data || { type: 'not_found' };
    renderInfoInto(panel, data);
  } catch (e) {
    wikiCache[name] = { type: 'not_found' };
    renderInfoInto(panel, null);
  }
  if (btn) btn.textContent = 'Hide info';
}

function renderInfoInto(panel, data) {
  if (!data || data.type === 'disambiguation') {
    panel.className = 'bird-info-panel open';
    panel.innerHTML = '<span style="color:var(--text-muted);font-size:0.88rem;">No information available for this species.</span>';
    return;
  }
  const imgHtml = data.thumbnail
    ? `<img class="bird-info-img" src="${data.thumbnail.source}" alt="${data.title}" />`
    : '';
  const wikiUrl = data.content_urls && data.content_urls.desktop
    ? data.content_urls.desktop.page : null;
  const linkHtml = wikiUrl
    ? `<a class="bird-info-link" href="${wikiUrl}" target="_blank" rel="noopener">Learn more on Wikipedia &rarr;</a>`
    : '';
  panel.className = 'bird-info-panel open';
  panel.innerHTML = `${imgHtml}<div class="bird-info-body"><p class="bird-info-text">${data.extract}</p>${linkHtml}</div>`;
}

function updateMapLimit(newLimit) {
  currentMapLimit = newLimit;
  if (lastSightingsData && lastSpeciesName) {
    renderMap(lastSightingsData, lastSpeciesName);
  }
}
