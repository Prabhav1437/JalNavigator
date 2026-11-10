let mapInstance = null;
let assetMarkersLayer = null;

function initMap() {
  const mapElement = document.getElementById('map-container');
  if (!mapElement) return;

  if (!mapInstance) {
    mapInstance = L.map('map-container').setView([26.8480, 80.9480], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(mapInstance);

    assetMarkersLayer = L.layerGroup().addTo(mapInstance);

    mapInstance.on('click', (e) => {
      const lat = e.latlng.lat.toFixed(5);
      const lng = e.latlng.lng.toFixed(5);
      const latInput = document.getElementById('asset-lat');
      const lngInput = document.getElementById('asset-lng');
      if (latInput && lngInput) {
        latInput.value = lat;
        lngInput.value = lng;
      }
      const form = document.getElementById('add-asset-form');
      if (form && form.classList.contains('hidden')) {
        form.classList.remove('hidden');
      }
    });

    setupMapControls();
  } else {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 150);
  }

  loadMapAssets();
}

function setupMapControls() {
  const toggleBtn = document.getElementById('toggle-asset-form-btn');
  const addForm = document.getElementById('add-asset-form');
  const cancelBtn = document.getElementById('cancel-asset-btn');
  const filterType = document.getElementById('map-filter-type');
  const filterVillage = document.getElementById('map-filter-village');

  if (toggleBtn && addForm) {
    toggleBtn.addEventListener('click', () => {
      addForm.classList.toggle('hidden');
    });
  }

  if (cancelBtn && addForm) {
    cancelBtn.addEventListener('click', () => {
      addForm.classList.add('hidden');
      addForm.reset();
    });
  }

  if (filterType) {
    filterType.addEventListener('change', () => loadMapAssets());
  }

  if (filterVillage) {
    filterVillage.addEventListener('input', () => loadMapAssets());
  }

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('asset-name').value;
      const type = document.getElementById('asset-type').value;
      const village = document.getElementById('asset-village').value;
      const latitude = parseFloat(document.getElementById('asset-lat').value);
      const longitude = parseFloat(document.getElementById('asset-lng').value);
      const status = document.getElementById('asset-status').value;

      try {
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type, village, latitude, longitude, status })
        });

        if (res.ok) {
          addForm.reset();
          addForm.classList.add('hidden');
          loadMapAssets();
          loadDashboard();
          if (typeof loadAssetSelectOptions === 'function') {
            loadAssetSelectOptions();
          }
        }
      } catch (err) {
        console.error(err);
      }
    });
  }
}

async function loadMapAssets() {
  if (!mapInstance || !assetMarkersLayer) return;

  const filterType = document.getElementById('map-filter-type')?.value || '';
  const filterVillage = document.getElementById('map-filter-village')?.value || '';

  const params = new URLSearchParams();
  if (filterType) params.append('type', filterType);
  if (filterVillage) params.append('village', filterVillage);

  try {
    const res = await fetch(`/api/assets?${params.toString()}`);
    if (!res.ok) return;
    const assets = await res.json();

    assetMarkersLayer.clearLayers();

    const bounds = [];

    assets.forEach(asset => {
      if (asset.latitude && asset.longitude) {
        const typeClass = (asset.type || 'tank').toLowerCase();
        const customIcon = L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker ${typeClass}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([asset.latitude, asset.longitude], { icon: customIcon });

        const popupContent = document.createElement('div');
        popupContent.innerHTML = `
          <strong>${asset.name}</strong><br>
          Type: ${asset.type}<br>
          Village: ${asset.village || 'N/A'}<br>
          Status: ${asset.status}<br>
          Coordinates: ${asset.latitude.toFixed(4)}, ${asset.longitude.toFixed(4)}<br>
          <button class="btn secondary sm" style="margin-top:6px;width:100%;" data-del-id="${asset.id}">Delete Asset</button>
        `;

        popupContent.querySelector(`[data-del-id="${asset.id}"]`).addEventListener('click', async () => {
          if (confirm(`Delete asset "${asset.name}"?`)) {
            await deleteAsset(asset.id);
          }
        });

        marker.bindPopup(popupContent);
        assetMarkersLayer.addLayer(marker);
        bounds.push([asset.latitude, asset.longitude]);
      }
    });

    if (bounds.length > 0 && !filterType && !filterVillage) {
      mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  } catch (err) {
    console.error(err);
  }
}

async function deleteAsset(id) {
  try {
    const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadMapAssets();
      loadDashboard();
      if (typeof loadAssetSelectOptions === 'function') {
        loadAssetSelectOptions();
      }
    }
  } catch (err) {
    console.error(err);
  }
}
