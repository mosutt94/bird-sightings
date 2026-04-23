// search.js — The bird-name search input + its dropdown.
//
// This file does not talk to the network directly. It calls filterSpecies()
// from api.js (which reads the cached taxonomy) and fetchSightings() from
// render.js when the user picks a result.
//
// Keyboard: ArrowUp/Down navigates the dropdown, Enter selects, Escape closes.
// Mouse:   click anywhere outside the search wrapper to close the dropdown.

let activeIndex = -1;   // which dropdown item is highlighted (arrow-key state)
let debounceTimer = null; // cleared/reset on every keystroke

function highlightMatch(text, query) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + '<mark>' + text.slice(idx, idx + query.length) + '</mark>' + text.slice(idx + query.length);
}

function showDropdown(items, query) {
  const dropdown = document.getElementById('dropdown');
  if (!items.length) {
    dropdown.classList.remove('open');
    return;
  }
  activeIndex = -1;
  dropdown.innerHTML = items.map((item, i) => {
    const fav = typeof isFavorite === 'function' && isFavorite(item.code);
    return `<div class="dropdown-item${fav ? ' is-fav' : ''}" data-index="${i}" data-code="${item.code}" data-name="${item.common}">
      <span class="common">${highlightMatch(item.common, query)}</span>
      ${fav ? '<span class="dropdown-fav-star">&#9733;</span>' : ''}
      <span class="sci">${item.sci}</span>
    </div>`;
  }).join('');
  dropdown.classList.add('open');
}

function updateActive(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
  if (items[activeIndex]) {
    items[activeIndex].scrollIntoView({ block: 'nearest' });
  }
}

function selectItem(el) {
  const code = el.dataset.code;
  const name = el.dataset.name;
  document.getElementById('searchInput').value = name;
  fetchSightings(code, name);
}

function initSearch() {
  const input = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');

  // Debounce pattern: every keystroke cancels the previous pending callback
  // and schedules a new one 150ms later. Without this we'd filter the full
  // 10k-species list on every single key — wasteful and janky on slower
  // devices.
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = input.value.trim();
      // Empty query: go back to the "nearby hotspots" initial view.
      if (!q && typeof showHotspots === 'function' && userLat != null) {
        document.getElementById('dropdown').classList.remove('open');
        document.getElementById('results').innerHTML = '';
        document.getElementById('viewToggle').style.display = 'none';
        lastSightingsData = null;
        lastSpeciesName = null;
        showHotspots();
        return;
      }
      const items = filterSpecies(q);
      showDropdown(items, q);
    }, 150);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.dropdown-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      updateActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      updateActive(items);
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectItem(items[activeIndex]);
    } else if (e.key === 'Escape') {
      dropdown.classList.remove('open');
    }
  });

  dropdown.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (item) selectItem(item);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      dropdown.classList.remove('open');
    }
  });
}
