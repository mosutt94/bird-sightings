// favorites.js — Cross-device favorites, backed by:
//   - localStorage when the user is signed out (FAVORITES_KEY)
//   - Firestore   when signed in   (users/{uid} document, `favorites` field)
//
// Key idea: there's a single in-memory `favoritesCache` array that's always
// the source of truth for UI reads (isFavorite, getFavorites). Writes go to
// cache immediately for snappy UI, then persist to whichever backend is
// active. When the user signs in, local and cloud favorites are merged so
// nothing is lost.

const FAVORITES_KEY = 'birdapp_favorites';

let favoritesCache = loadLocalFavorites(); // populated immediately at startup

function loadLocalFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch (e) { return []; }
}

function saveLocalFavorites(favs) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

// One Firestore doc per user. The Firestore security rules (set in the
// Firebase console) enforce that only the signed-in user can read/write
// their own doc.
function userDocRef() {
  return db.collection('users').doc(currentUser.uid);
}

async function fetchCloudFavorites() {
  const snap = await userDocRef().get();
  return (snap.exists && Array.isArray(snap.data().favorites)) ? snap.data().favorites : [];
}

async function writeCloudFavorites(favs) {
  // merge: true so we don't clobber other fields we might add later.
  await userDocRef().set({ favorites: favs }, { merge: true });
}

// Union by species code (no duplicates). Used on sign-in to combine
// whatever the user had locally with whatever's already in the cloud.
function mergeFavorites(a, b) {
  const map = new Map();
  [...a, ...b].forEach(f => map.set(f.code, f));
  return Array.from(map.values());
}

// Reacts to every auth state change (sign-in, sign-out, token refresh).
// - Signed in: fetch cloud favorites, merge with local, push merged set
//   back to cloud. Cache now reflects Firestore.
// - Signed out: fall back to whatever's in localStorage.
onAuthChange(async (user) => {
  if (user) {
    try {
      const cloud = await fetchCloudFavorites();
      const local = loadLocalFavorites();
      const merged = mergeFavorites(cloud, local);
      if (merged.length !== cloud.length) {
        await writeCloudFavorites(merged);
      }
      favoritesCache = merged;
    } catch (e) {
      console.error('Failed to load cloud favorites:', e);
      favoritesCache = loadLocalFavorites();
    }
  } else {
    favoritesCache = loadLocalFavorites();
  }
  updateFavoritesUI();
  const section = document.getElementById('favoritesSection');
  if (section && section.style.display !== 'none') renderFavoritesList();
});

function getFavorites() {
  return favoritesCache;
}

function isFavorite(speciesCode) {
  return favoritesCache.some(f => f.code === speciesCode);
}

// Optimistic update: mutate the in-memory cache and refresh the UI first,
// then persist in the background. If the cloud write fails we fall back
// to localStorage so the change isn't lost entirely.
async function toggleFavorite(speciesCode, commonName) {
  const idx = favoritesCache.findIndex(f => f.code === speciesCode);
  if (idx >= 0) {
    favoritesCache.splice(idx, 1);
  } else {
    favoritesCache.push({ code: speciesCode, common: commonName });
  }
  updateFavoritesUI();

  if (currentUser) {
    try {
      await writeCloudFavorites(favoritesCache);
    } catch (e) {
      console.error('Failed to sync favorite:', e);
      alert('Could not sync favorite — your change is saved locally until you try again.');
      saveLocalFavorites(favoritesCache);
    }
  } else {
    saveLocalFavorites(favoritesCache);
  }
}

function getSpeciesCode(commonName) {
  const entry = taxonomy.find(t => t.common === commonName);
  return entry ? entry.code : null;
}

function updateFavoritesUI() {
  const btn = document.getElementById('btnFavorite');
  if (btn && lastSpeciesName) {
    const code = getSpeciesCode(lastSpeciesName);
    const fav = code && isFavorite(code);
    btn.classList.toggle('favorited', fav);
    btn.title = fav ? 'Remove from favorites' : 'Add to favorites';
  }

  const countEl = document.getElementById('favCount');
  if (countEl) {
    countEl.textContent = favoritesCache.length || '';
    countEl.style.display = favoritesCache.length ? '' : 'none';
  }
}

function renderFavoritesList() {
  const section = document.getElementById('favoritesSection');
  const list = document.getElementById('favoritesList');
  const favs = favoritesCache;

  if (!favs.length) {
    list.innerHTML = '<div class="status">No favorites yet. Search for a bird and tap the star to add it.</div>';
    return;
  }

  list.innerHTML = favs.map(f =>
    `<div class="favorite-item" data-code="${f.code}" data-name="${f.common}">
      <span class="favorite-name">${f.common}</span>
      <button class="btn-remove-fav" data-code="${f.code}" title="Remove from favorites">&times;</button>
    </div>`
  ).join('');

  list.querySelectorAll('.favorite-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-remove-fav')) return;
      document.getElementById('searchInput').value = item.dataset.name;
      section.style.display = 'none';
      fetchSightings(item.dataset.code, item.dataset.name);
    });
  });

  list.querySelectorAll('.btn-remove-fav').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const code = btn.dataset.code;
      favoritesCache = favoritesCache.filter(f => f.code !== code);
      if (currentUser) {
        try { await writeCloudFavorites(favoritesCache); }
        catch (err) { console.error('Failed to remove favorite:', err); }
      } else {
        saveLocalFavorites(favoritesCache);
      }
      renderFavoritesList();
      updateFavoritesUI();
    });
  });
}

function toggleFavoritesPanel() {
  const section = document.getElementById('favoritesSection');
  const btn = document.getElementById('btnFavorites');
  const isOpen = section.style.display !== 'none';
  section.style.display = isOpen ? 'none' : '';
  btn.classList.toggle('active', !isOpen);
  if (!isOpen) renderFavoritesList();
}
