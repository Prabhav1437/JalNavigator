import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import api from '../services/api';

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const linesLayerRef = useRef(null);

  const [assets, setAssets] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterVillage, setFilterVillage] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAssetId, setEditingAssetId] = useState(null);

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

    const linesLayer = L.layerGroup().addTo(map);
    const markersLayer = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      setFormState((prev) => ({
        ...prev,
        latitude: e.latlng.lat.toFixed(5),
        longitude: e.latlng.lng.toFixed(5)
      }));
      setShowAddForm(true);
    });

    mapInstanceRef.current = map;
    markersLayerRef.current = markersLayer;
    linesLayerRef.current = linesLayer;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
      linesLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    loadAssets();
  }, [filterType, filterVillage]);

  useEffect(() => {
    if (!mapInstanceRef.current || !markersLayerRef.current || !linesLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    linesLayerRef.current.clearLayers();
    const bounds = [];
    const pipelinePoints = [];

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
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="btn primary sm" style="flex:1;" id="edit-btn-${asset.id}">Edit</button>
            <button class="btn secondary sm" style="flex:1;" id="del-btn-${asset.id}">Delete</button>
          </div>
        `;

        const editBtn = popupNode.querySelector(`#edit-btn-${asset.id}`);
        if (editBtn) {
          editBtn.addEventListener('click', () => {
            setEditingAssetId(asset.id);
            setFormState({
              name: asset.name,
              type: asset.type,
              village: asset.village || '',
              latitude: asset.latitude.toString(),
              longitude: asset.longitude.toString(),
              status: asset.status
            });
            setShowAddForm(true);
            mapInstanceRef.current.closePopup();
          });
        }

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

        if (typeClass === 'pipeline' || typeClass === 'tank' || typeClass === 'pump') {
          pipelinePoints.push([asset.latitude, asset.longitude]);
        }
      }
    });

    if (pipelinePoints.length > 1) {
      const polyline = L.polyline(pipelinePoints, {
        color: '#9333ea',
        weight: 3,
        dashArray: '6, 6',
        opacity: 0.8
      });
      linesLayerRef.current.addLayer(polyline);
    }

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
      const payload = {
        name: formState.name,
        type: formState.type,
        village: formState.village,
        latitude: parseFloat(formState.latitude),
        longitude: parseFloat(formState.longitude),
        status: formState.status
      };

      if (editingAssetId) {
        await api.updateAsset(editingAssetId, payload);
      } else {
        await api.createAsset(payload);
      }

      setShowAddForm(false);
      setEditingAssetId(null);
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

  const handleCancel = () => {
    setShowAddForm(false);
    setEditingAssetId(null);
    setFormState({
      name: '',
      type: 'tank',
      village: '',
      latitude: '',
      longitude: '',
      status: 'Operational'
    });
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
          onClick={() => {
            if (showAddForm) handleCancel();
            else setShowAddForm(true);
          }}
        >
          {showAddForm ? 'Close Form' : '+ Add Water Asset'}
        </button>
      </div>

      {showAddForm && (
        <form className="panel-form" onSubmit={handleFormSubmit}>
          <div className="panel-header">
            <h3>{editingAssetId ? 'Edit Water Asset' : 'Register New Water Asset'}</h3>
            <span className="panel-hint">
              {editingAssetId ? 'Update asset attributes or coordinates' : 'Click anywhere on the map to set coordinates automatically'}
            </span>
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
              <label>Status</label>
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
            <button type="submit" className="btn primary">
              {editingAssetId ? 'Update Asset' : 'Save Asset'}
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={handleCancel}
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
          <div className="legend-item"><span className="legend-color marker-pipeline"></span> Pipeline Line</div>
        </div>
      </div>
    </section>
  );
}
