let lastSightingsData = null;
let lastSpeciesName = null;
let currentView = 'list';
let listLimit = 20;
let visibleCount = 20;
const wikiCache = {};
const addressCache = {};

async function reverseGeocode(lat, lng) {
  const key = `${lat},${lng}`;
  if (addressCache[key]) return addressCache[key];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`, {
      headers: { 'User-Agent': 'BirdSightingsApp/1.0' }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const a = data.address;
    const parts = [a.road, a.city || a.town || a.village || a.hamlet, a.state].filter(Boolean);
    const address = parts.join(', ') || data.display_name;
    addressCache[key] = address;
    return address;
  } catch (e) { return null; }
}

async function loadAddresses(observations) {
  for (let i = 0; i < observations.length; i++) {
    const obs = observations[i];
    const el = document.getElementById(`addr-${obs.lat}-${obs.lng}`);
    if (!el || el.textContent) continue;
    const address = await reverseGeocode(obs.lat, obs.lng);
    if (address && el) el.textContent = address;
  }
}

function setView(view) {
  currentView = view;
  const resultsEl = document.getElementById('results');
  const mapContainer = document.getElementById('mapContainer');
  const buttons = document.querySelectorAll('.view-btn');

  buttons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));

  if (view === 'map') {
    resultsEl.style.display = 'none';
    if (document.getElementById('hotspotsSection')) {
      document.getElementById('hotspotsSection').style.display = 'none';
    }
    mapContainer.style.display = 'block';
    if (lastSightingsData && lastSpeciesName) {
      initMap();
      setTimeout(() => {
        map.invalidateSize();
        renderMap(lastSightingsData, lastSpeciesName);
      }, 50);
    } else if (hotspotData && hotspotData.length) {
      initMap();
      setTimeout(() => {
        map.invalidateSize();
        renderHotspotsOnMap();
      }, 50);
    }
  } else {
    resultsEl.style.display = '';
    mapContainer.style.display = 'none';
    if (!lastSpeciesName && hotspotsVisible) {
      document.getElementById('hotspotsSection').style.display = '';
    }
  }
}

async function fetchBirdInfo(name) {
  // Try the common name first
  const queries = [name, name + ' (bird)'];

  // Find the scientific name from taxonomy as a last resort
  const entry = taxonomy.find(t => t.common === name);
  if (entry) queries.push(entry.sci);

  for (const q of queries) {
    try {
      const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(q)}`);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.type !== 'disambiguation') return data;
    } catch (e) { /* try next */ }
  }
  return null;
}

function renderBirdInfoPanel(data) {
  const panel = document.getElementById('birdInfoPanel');
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

function updateInfoBtnText(isOpen) {
  const btn = document.getElementById('btnBirdInfo');
  if (btn) btn.textContent = isOpen ? 'Hide info' : 'Show info';
}

async function toggleBirdInfo() {
  const panel = document.getElementById('birdInfoPanel');
  if (panel.classList.contains('open')) {
    panel.className = 'bird-info-panel';
    panel.innerHTML = '';
    updateInfoBtnText(false);
    return;
  }

  const name = lastSpeciesName;
  if (!name) return;

  if (wikiCache[name]) {
    renderBirdInfoPanel(wikiCache[name]);
    updateInfoBtnText(true);
    return;
  }

  panel.className = 'bird-info-panel loading';
  panel.innerHTML = 'Loading...';
  try {
    const data = await fetchBirdInfo(name);
    wikiCache[name] = data || { type: 'not_found' };
    renderBirdInfoPanel(data);
    updateInfoBtnText(true);
  } catch (e) {
    wikiCache[name] = { type: 'not_found' };
    renderBirdInfoPanel(null);
    updateInfoBtnText(true);
  }
}

async function toggleSightingDetail(locId) {
  const detail = document.getElementById(`sighting-detail-${locId}`);
  const card = detail.closest('.sighting-card');
  if (!detail) return;

  if (detail.classList.contains('open')) {
    detail.classList.remove('open');
    card.classList.remove('expanded');
    detail.innerHTML = '';
    return;
  }

  // Close any other open details
  document.querySelectorAll('#results .hotspot-detail.open').forEach(d => {
    d.classList.remove('open');
    d.closest('.sighting-card').classList.remove('expanded');
    d.innerHTML = '';
  });

  card.classList.add('expanded');
  detail.classList.add('open');
  detail.innerHTML = '<div class="hotspot-detail-loading">Loading recent observations...</div>';

  const obs = await fetchHotspotObservations(locId);
  if (!obs.length) {
    detail.innerHTML = '<div class="hotspot-detail-empty">No recent observations at this location.</div>';
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

  detail.innerHTML = `<div class="hotspot-detail-header">Recent observations at this location (${obs.length})</div>${rows}`;
}

function renderList(data, commonName) {
  const results = document.getElementById('results');
  const sortLabel = userLat != null ? ' \u00b7 sorted by distance' : '';
  const visible = visibleCount > 0 ? data.slice(0, visibleCount) : data;
  const hasMore = visibleCount > 0 && visibleCount < data.length;
  const showing = hasMore
    ? `Showing ${visible.length} of ${data.length}`
    : `${data.length} sighting${data.length !== 1 ? 's' : ''}`;

  const limitOptions = [10, 20, 50, 100, 0].map(v => {
    const label = v === 0 ? 'All' : v;
    const selected = v === listLimit ? ' selected' : '';
    return `<option value="${v}"${selected}>${label}</option>`;
  }).join('');

  const infoOpen = document.getElementById('birdInfoPanel') &&
    document.getElementById('birdInfoPanel').classList.contains('open');
  const infoBtnText = infoOpen ? 'Hide info' : 'Show info';

  const speciesCode = getSpeciesCode(commonName);
  const isFav = speciesCode && isFavorite(speciesCode);
  const favClass = isFav ? ' favorited' : '';

  const header = `
    <div class="results-header">
      <h2>${commonName}</h2>
      <button class="btn-favorite-star${favClass}" id="btnFavorite" title="${isFav ? 'Remove from favorites' : 'Add to favorites'}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      </button>
      <button class="btn-bird-info" id="btnBirdInfo">${infoBtnText}</button>
      <span class="count">${showing}${sortLabel}</span>
      <select class="list-limit-select" id="listLimit">${limitOptions}</select>
    </div>`;

  const cards = visible.map(obs => {
    const date = new Date(obs.obsDt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const time = obs.obsDt.includes(' ')
      ? new Date(obs.obsDt.replace(' ', 'T')).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : '';
    const count = obs.howMany != null ? obs.howMany : '?';
    const distHtml = obs._dist != null
      ? `<span><span class="distance-badge">${obs._dist < 1 ? obs._dist.toFixed(1) : Math.round(obs._dist)} mi</span></span>`
      : '';

    const cachedAddr = addressCache[`${obs.lat},${obs.lng}`] || '';

    return `
      <div class="sighting-card" data-loc-id="${obs.locId}">
        <div class="sighting-location">${obs.locName}</div>
        <div class="sighting-address" id="addr-${obs.lat}-${obs.lng}">${cachedAddr}</div>
        <div class="sighting-meta">
          <span>\ud83d\udcc5 ${date}${time ? ' \u00b7 ' + time : ''}</span>
          <span><span class="badge">${count} ${count === 1 ? 'bird' : 'birds'}</span></span>
          ${distHtml}
          ${obs.locPrivate ? '<span>\ud83d\udccd Private</span>' : ''}
        </div>
        <div class="hotspot-detail" id="sighting-detail-${obs.locId}"></div>
      </div>`;
  }).join('');

  const remaining = data.length - visibleCount;
  const nextBatch = listLimit > 0 ? Math.min(listLimit, remaining) : remaining;
  const showMoreBtn = hasMore
    ? `<button class="btn-show-more" id="btnShowMore">Show ${nextBatch} more</button>`
    : '';

  const infoPanel = '<div id="birdInfoPanel" class="bird-info-panel"></div>';

  results.innerHTML = header + infoPanel + cards + showMoreBtn;

  loadAddresses(visible);

  results.querySelectorAll('.sighting-card[data-loc-id]').forEach(card => {
    card.addEventListener('click', function(e) {
      if (e.target.closest('.hotspot-detail')) return;
      toggleSightingDetail(this.dataset.locId);
    });
  });

  document.getElementById('btnFavorite').addEventListener('click', () => {
    const code = getSpeciesCode(commonName);
    if (code) {
      toggleFavorite(code, commonName);
      renderList(data, commonName);
      document.getElementById('btnBirdInfo').addEventListener('click', toggleBirdInfo);
    }
  });

  if (infoOpen && lastSpeciesName && wikiCache[lastSpeciesName]) {
    renderBirdInfoPanel(wikiCache[lastSpeciesName]);
  }

  document.getElementById('listLimit').addEventListener('change', function() {
    listLimit = parseInt(this.value, 10);
    visibleCount = listLimit > 0 ? listLimit : 0;
    renderList(lastSightingsData, lastSpeciesName);
    document.getElementById('btnBirdInfo').addEventListener('click', toggleBirdInfo);
  });

  if (document.getElementById('btnShowMore')) {
    document.getElementById('btnShowMore').addEventListener('click', function() {
      visibleCount += listLimit;
      renderList(lastSightingsData, lastSpeciesName);
      document.getElementById('btnBirdInfo').addEventListener('click', toggleBirdInfo);
    });
  }
}

async function fetchSightings(speciesCode, commonName) {
  const dropdown = document.getElementById('dropdown');
  const emptyState = document.getElementById('emptyState');
  const spinner = document.getElementById('spinner');
  const results = document.getElementById('results');
  const viewToggle = document.getElementById('viewToggle');

  dropdown.classList.remove('open');
  emptyState.style.display = 'none';
  if (typeof hideHotspots === 'function') hideHotspots();
  spinner.classList.add('active');
  results.innerHTML = '';
  lastSightingsData = null;
  lastSpeciesName = null;
  visibleCount = listLimit > 0 ? listLimit : 0;
  viewToggle.style.display = 'none';

  try {
    const data = await fetchSightingsData(speciesCode);

    if (!data.length) {
      results.innerHTML = `
        <div class="status">No sightings of <strong>${commonName}</strong> in New Jersey in the last 30 days.</div>`;
      return;
    }

    if (userLat != null && userLng != null) {
      data.forEach(obs => {
        obs._dist = distanceMiles(userLat, userLng, obs.lat, obs.lng);
      });
      data.sort((a, b) => a._dist - b._dist);
    }

    lastSightingsData = data;
    lastSpeciesName = commonName;
    viewToggle.style.display = 'flex';

    renderList(data, commonName);

    document.getElementById('btnBirdInfo').addEventListener('click', toggleBirdInfo);

    if (currentView === 'map') {
      setView('map');
    }
  } catch (e) {
    results.innerHTML = `<div class="status">Error fetching sightings. Check your API key and try again.</div>`;
    console.error(e);
  } finally {
    spinner.classList.remove('active');
  }
}
