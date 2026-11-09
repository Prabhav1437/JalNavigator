let mapInstance = null;

function initMap() {
  if (mapInstance) return;
  const mapElement = document.getElementById('map-container');
  if (!mapElement) return;

  mapInstance = L.map('map-container').setView([20.5937, 78.9629], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
  }).addTo(mapInstance);

  loadMapAssets();
}

async function loadMapAssets() {
  try {
    const res = await fetch('/api/assets');
    if (!res.ok) return;
    const assets = await res.json();
    assets.forEach(asset => {
      if (asset.latitude && asset.longitude) {
        L.marker([asset.latitude, asset.longitude])
          .addTo(mapInstance)
          .bindPopup(`<b>${asset.name}</b><br>Type: ${asset.type}<br>Status: ${asset.status}`);
      }
    });
  } catch (err) {
    console.error(err);
  }
}
