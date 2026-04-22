document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLocation').addEventListener('click', requestLocation);

  // Address input toggle
  document.getElementById('btnToggleAddress').addEventListener('click', () => {
    const bar = document.getElementById('addressBar');
    const isHidden = bar.style.display === 'none';
    bar.style.display = isHidden ? '' : 'none';
    if (isHidden) document.getElementById('addressInput').focus();
  });

  initAddressSearch();
  document.getElementById('btnAddress').addEventListener('click', () => {
    geocodeAddress(document.getElementById('addressInput').value);
  });
  document.getElementById('addressInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('addressDropdown').classList.remove('open');
      geocodeAddress(document.getElementById('addressInput').value);
    }
  });

  // Days back selector
  document.getElementById('backDays').addEventListener('change', (e) => {
    BACK_DAYS = parseInt(e.target.value, 10);
    // Re-fetch current species if one is selected
    if (lastSpeciesName && lastSightingsData) {
      const code = taxonomy.find(t => t.common === lastSpeciesName);
      if (code) fetchSightings(code.code, lastSpeciesName);
    }
    // Refresh hotspot detail cache since days changed
    hotspotDetailCache = {};
  });

  // Favorites
  document.getElementById('btnFavorites').addEventListener('click', toggleFavoritesPanel);
  updateFavoritesUI();

  // Auth button
  document.getElementById('btnAuth').addEventListener('click', () => {
    if (currentUser) signOutUser();
    else signIn();
  });

  initSearch();

  // View toggle (list / map)
  document.getElementById('viewToggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.view-btn');
    if (btn) setView(btn.dataset.view);
  });

  // Map info button
  document.getElementById('btnBirdInfoMap').addEventListener('click', toggleMapBirdInfo);

  // Map limit selector
  document.getElementById('mapLimit').addEventListener('change', (e) => {
    updateMapLimit(parseInt(e.target.value, 10));
  });

  if (API_KEY) {
    loadTaxonomy();
    requestLocation();
  } else {
    console.warn('Set your eBird API key in the API_KEY variable.');
  }
});
