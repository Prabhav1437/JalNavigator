import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import api from '../services/api';

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);

  const [assets, setAssets] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterVillage, setFilterVillage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [formState, setFormState] = useState({
    name: '',
    type: 'tank',
    village: '',
    latitude: '',
    longitude: '',
    status: 'Operational'
  });

  const loadAssets = async () => {
    try {
      const params = {};
      if (filterType) params.type = filterType;
      if (filterVillage) params.village = filterVillage;

      const json = await api.getAssets(params);
      setAssets(json);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current).setView([26.8480, 80.9480], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(map);

    const layer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      setFormState((prev) => ({
        ...prev,
        latitude: e.latlng.lat.toFixed(5),
        longitude: e.latlng.lng.toFixed(5)
      }));
      setShowAddForm(true);
    });

    mapInstanceRef.current = map;
    markersLayerRef.current = layer;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadAssets();
  }, [filterType, filterVillage]);

  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    const bounds = [];

    assets.forEach((asset) => {
      if (asset.latitude && asset.longitude) {
        const typeClass = (asset.type || 'tank').toLowerCase();
        const customIcon = L.divIcon({
          className: 'custom-marker-wrapper',
          html: `<div class="custom-marker ${typeClass}"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([asset.latitude, asset.longitude], { icon: customIcon });

        const popupNode = document.createElement('div');
        popupNode.innerHTML = `
          <strong>${asset.name}</strong><br>
          Type: ${asset.type}<br>
          Village: ${asset.village || 'N/A'}<br>
          Status: ${asset.status}<br>
          Coordinates: ${asset.latitude.toFixed(4)}, ${asset.longitude.toFixed(4)}<br>
          <button class="btn secondary sm" style="margin-top:6px;width:100%;" id="del-btn-${asset.id}">Delete Asset</button>
        `;

        const delBtn = popupNode.querySelector(`#del-btn-${asset.id}`);
        if (delBtn) {
          delBtn.addEventListener('click', async () => {
            if (confirm(`Delete asset "${asset.name}"?`)) {
              await handleDelete(asset.id);
            }
          });
        }

        marker.bindPopup(popupNode);
        markersLayerRef.current.addLayer(marker);
        bounds.push([asset.latitude, asset.longitude]);
      }
    });

    if (bounds.length > 0 && !filterType && !filterVillage) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [assets]);

  const handleDelete = async (id) => {
    try {
      await api.deleteAsset(id);
      loadAssets();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.createAsset({
        name: formState.name,
        type: formState.type,
        village: formState.village,
        latitude: parseFloat(formState.latitude),
        longitude: parseFloat(formState.longitude),
        status: formState.status
      });

      setShowAddForm(false);
      setFormState({
        name: '',
        type: 'tank',
        village: '',
        latitude: '',
        longitude: '',
        status: 'Operational'
      });
      loadAssets();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section>
      <header className="section-header">
        <h1>Infrastructure GIS Map</h1>
        <p className="subtitle">Interactive spatial mapping of village water network assets</p>
      </header>

      <div className="map-toolbar">
        <div className="toolbar-filters">
          <select
            className="form-control"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="">All Asset Types</option>
            <option value="tank">Water Tanks</option>
            <option value="borewell">Borewells</option>
            <option value="pump">Pumps</option>
            <option value="pipeline">Pipelines</option>
          </select>
          <input
            type="text"
            className="form-control"
            placeholder="Filter by village..."
            value={filterVillage}
            onChange={(e) => setFilterVillage(e.target.value)}
          />
        </div>
        <button
          className="btn primary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Close Form' : '+ Add Water Asset'}
        </button>
      </div>

      {showAddForm && (
        <form className="panel-form" onSubmit={handleFormSubmit}>
          <div className="panel-header">
            <h3>Register New Water Asset</h3>
            <span className="panel-hint">Click anywhere on the map to set coordinates automatically</span>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label>Asset Name</label>
              <input
                type="text"
                placeholder="e.g. Ward 4 Overhead Tank"
                value={formState.name}
                onChange={(e) => setFormState({ ...formState, name: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Asset Type</label>
              <select
                value={formState.type}
                onChange={(e) => setFormState({ ...formState, type: e.target.value })}
              >
                <option value="tank">Water Tank</option>
                <option value="borewell">Borewell</option>
                <option value="pump">Pump</option>
                <option value="pipeline">Pipeline</option>
              </select>
            </div>
            <div className="form-group">
              <label>Village</label>
              <input
                type="text"
                placeholder="e.g. Rampur"
                value={formState.village}
                onChange={(e) => setFormState({ ...formState, village: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 26.8467"
                value={formState.latitude}
                onChange={(e) => setFormState({ ...formState, latitude: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                placeholder="e.g. 80.9462"
                value={formState.longitude}
                onChange={(e) => setFormState({ ...formState, longitude: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Initial Status</label>
              <select
                value={formState.status}
                onChange={(e) => setFormState({ ...formState, status: e.target.value })}
              >
                <option value="Operational">Operational</option>
                <option value="Maintenance">Maintenance</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary">Save Asset</button>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="map-wrapper">
        <div ref={mapContainerRef} className="map-container" />
        <div className="map-legend">
          <h4>Map Legend</h4>
          <div className="legend-item"><span className="legend-color marker-tank"></span> Water Tank</div>
          <div className="legend-item"><span className="legend-color marker-borewell"></span> Borewell</div>
          <div className="legend-item"><span className="legend-color marker-pump"></span> Pump</div>
          <div className="legend-item"><span className="legend-color marker-pipeline"></span> Pipeline</div>
        </div>
      </div>
    </section>
  );
}
