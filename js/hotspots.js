let hotspotData = [];
let hotspotDetailCache = {};
let hotspotsVisible = false;
let hotspotLimit = 10;
let hotspotVisibleCount = 10;

async function fetchNearbyHotspots(lat, lng, dist) {
  dist = dist || 25;
  try {
    const data = await ebirdProxy('ref/hotspot/geo', { lat, lng, dist, fmt: 'json' });
    data.forEach(h => {
      h._dist = distanceMiles(lat, lng, h.lat, h.lng);
    });
    data.sort((a, b) => a._dist - b._dist);
    hotspotData = data;
    return data;
  } catch (e) {
    console.error('Failed to fetch hotspots:', e);
    return [];
  }
}

async function fetchHotspotObservations(locId) {
  if (hotspotDetailCache[locId]) return hotspotDetailCache[locId];
  try {
    const data = await ebirdProxy(`data/obs/${locId}/recent`, { back: BACK_DAYS });
    hotspotDetailCache[locId] = data;
    return data;
  } catch (e) {
    console.error('Failed to fetch hotspot observations:', e);
    return [];
  }
}

function renderHotspots() {
  const list = document.getElementById('hotspotsList');
  const countEl = document.getElementById('hotspotCount');
  if (!hotspotData.length) {
    list.innerHTML = '<div class="status">No hotspots found nearby.</div>';
    countEl.textContent = '';
    return;
  }

  const visible = hotspotVisibleCount > 0 ? hotspotData.slice(0, hotspotVisibleCount) : hotspotData;
  const hasMore = hotspotVisibleCount > 0 && hotspotVisibleCount < hotspotData.length;
  countEl.textContent = hasMore
    ? `Showing ${visible.length} of ${hotspotData.length}`
    : `${hotspotData.length} hotspot${hotspotData.length !== 1 ? 's' : ''}`;

  const cards = visible.map(h => {
    const distText = h._dist != null
      ? `<span class="distance-badge">${h._dist < 1 ? h._dist.toFixed(1) : Math.round(h._dist)} mi</span>`
      : '';
    const species = h.numSpeciesAllTime != null
      ? `<span class="badge">${h.numSpeciesAllTime} species</span>`
      : '';
    const lastObs = h.latestObsDt
      ? new Date(h.latestObsDt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';

    return `
      <div class="hotspot-card" data-loc-id="${h.locId}">
        <div class="hotspot-name">${h.locName}</div>
        <div class="hotspot-address" id="haddr-${h.locId}"></div>
        <div class="hotspot-meta">
          ${distText ? `<span>${distText}</span>` : ''}
          ${species ? `<span>${species}</span>` : ''}
          ${lastObs ? `<span>Last seen ${lastObs}</span>` : ''}
        </div>
        <div class="hotspot-detail" id="detail-${h.locId}"></div>
      </div>`;
  }).join('');

  const remaining = hotspotData.length - hotspotVisibleCount;
  const nextBatch = hotspotLimit > 0 ? Math.min(hotspotLimit, remaining) : remaining;
  const showMoreBtn = hasMore
    ? `<button class="btn-show-more" id="btnShowMoreHotspots">Show ${nextBatch} more</button>`
    : '';

  list.innerHTML = cards + showMoreBtn;

  // Wire up card clicks
  list.querySelectorAll('.hotspot-card').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.hotspot-detail')) return;
      toggleHotspotDetail(this.dataset.locId);
    });
  });

  if (document.getElementById('btnShowMoreHotspots')) {
    document.getElementById('btnShowMoreHotspots').addEventListener('click', function() {
      hotspotVisibleCount += hotspotLimit;
      renderHotspots();
      loadHotspotAddresses();
    });
  }

  loadHotspotAddresses();
}

async function loadHotspotAddresses() {
  const visible = hotspotVisibleCount > 0 ? hotspotData.slice(0, hotspotVisibleCount) : hotspotData;
  for (const h of visible) {
    const el = document.getElementById(`haddr-${h.locId}`);
    if (!el || el.textContent) continue;
    const address = await reverseGeocode(h.lat, h.lng);
    if (address && el) el.textContent = address;
  }
}

async function toggleHotspotDetail(locId) {
  const detail = document.getElementById(`detail-${locId}`);
  const card = detail.closest('.hotspot-card');
  if (!detail) return;

  if (detail.classList.contains('open')) {
    detail.classList.remove('open');
    card.classList.remove('expanded');
    detail.innerHTML = '';
    return;
  }

  // Close any other open details
  document.querySelectorAll('.hotspot-detail.open').forEach(d => {
    d.classList.remove('open');
    d.closest('.hotspot-card').classList.remove('expanded');
    d.innerHTML = '';
  });

  card.classList.add('expanded');
  detail.classList.add('open');
  detail.innerHTML = '<div class="hotspot-detail-loading">Loading recent observations...</div>';

  const obs = await fetchHotspotObservations(locId);
  if (!obs.length) {
    detail.innerHTML = '<div class="hotspot-detail-empty">No recent observations at this hotspot.</div>';
    return;
  }

  const rows = obs.map(o => {
    const count = o.howMany != null ? o.howMany : '?';
    const date = new Date(o.obsDt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `
      <div class="hotspot-obs-item">
        <span class="hotspot-obs-name">${o.comName}</span>
        <span class="hotspot-obs-meta">
          <span class="badge">${count}</span>
          <span>${date}</span>
        </span>
      </div>`;
  }).join('');

  detail.innerHTML = `<div class="hotspot-detail-header">Recent observations (${obs.length})</div>${rows}`;
}

async function showHotspots() {
  if (lastSpeciesName) return; // Don't show if species results are active
  const section = document.getElementById('hotspotsSection');
  section.style.display = '';
  hotspotsVisible = true;

  const viewToggle = document.getElementById('viewToggle');
  viewToggle.style.display = 'flex';

  if (hotspotData.length) {
    renderHotspots();
    return;
  }

  const list = document.getElementById('hotspotsList');
  list.innerHTML = '<div class="status">Finding nearby hotspots...</div>';

  await fetchNearbyHotspots(userLat, userLng);
  hotspotVisibleCount = hotspotLimit;
  renderHotspots();
}

function hideHotspots() {
  const section = document.getElementById('hotspotsSection');
  section.style.display = 'none';
  hotspotsVisible = false;
  document.getElementById('viewToggle').style.display = 'none';
}

function renderHotspotsOnMap() {
  if (!map) initMap();
  markerLayer.clearLayers();

  const hotspotIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;background:#e67e22;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  const bounds = [];

  hotspotData.forEach(h => {
    const distText = h._dist != null
      ? `<br><strong>${h._dist < 1 ? h._dist.toFixed(1) : Math.round(h._dist)} mi</strong> away`
      : '';
    const species = h.numSpeciesAllTime != null ? `${h.numSpeciesAllTime} species recorded` : '';

    const popup = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;line-height:1.4;min-width:160px;">
        <div style="font-weight:700;font-size:0.95rem;color:#e67e22;margin-bottom:4px;">${h.locName}</div>
        <div style="font-size:0.82rem;color:#6b6b6b;">
          ${species}${distText}
        </div>
      </div>`;

    const marker = L.marker([h.lat, h.lng], { icon: hotspotIcon }).bindPopup(popup);
    markerLayer.addLayer(marker);
    bounds.push([h.lat, h.lng]);
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

  const mapCountEl = document.getElementById('mapCount');
  mapCountEl.textContent = `${hotspotData.length} hotspot${hotspotData.length !== 1 ? 's' : ''} nearby`;
  document.getElementById('btnBirdInfoMap').style.display = 'none';
}
