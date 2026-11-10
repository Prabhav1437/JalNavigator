import React, { useState, useEffect } from 'react';

export default function Monitoring() {
  const [assets, setAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [readings, setReadings] = useState([]);

  const loadAssets = async () => {
    try {
      const res = await fetch('/api/assets');
      if (res.ok) {
        const json = await res.json();
        setAssets(json);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const json = await res.json();
        setAlerts(json);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadReadings = async () => {
    try {
      const res = await fetch('/api/sensors');
      if (res.ok) {
        const json = await res.json();
        setReadings(json);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadAssets();
    loadAlerts();
    loadReadings();
  }, []);

  const handleSimulate = async () => {
    try {
      const body = {};
      if (selectedAssetId) body.assetId = parseInt(selectedAssetId, 10);

      const res = await fetch('/api/sensors/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        loadReadings();
        loadAlerts();
      } else {
        const errJson = await res.json();
        alert(errJson.error || 'Failed to simulate telemetry');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResolveAlert = async (id) => {
    try {
      const res = await fetch(`/api/alerts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Resolved' })
      });
      if (res.ok) {
        loadAlerts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openAlertsCount = alerts.filter((a) => a.status === 'Open').length;

  return (
    <section>
      <header className="section-header">
        <h1>Water Monitoring (Simulated)</h1>
        <p className="subtitle">Telemetry parameters and threshold abnormality alerts</p>
      </header>

      <div className="notice-banner">
        <strong>Simulated Environment:</strong> All sensor telemetry and alert notifications are strictly simulated for demonstration purposes.
      </div>

      <div className="monitoring-toolbar">
        <div className="toolbar-group">
          <label>Target Asset:</label>
          <select
            className="form-control"
            value={selectedAssetId}
            onChange={(e) => setSelectedAssetId(e.target.value)}
          >
            <option value="">Auto Select First Asset</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.name} ({asset.village || 'No village'})
              </option>
            ))}
          </select>
        </div>
        <button className="btn primary" onClick={handleSimulate}>
          Simulate New Telemetry
        </button>
      </div>

      <div className="monitoring-columns">
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>System Alerts</h3>
            <span className="badge badge-critical">{openAlertsCount}</span>
          </div>
          <div className="card-list">
            {alerts.length === 0 ? (
              <div className="empty-state">No alerts recorded.</div>
            ) : (
              alerts.map((alert) => {
                const assetName = alert.asset ? alert.asset.name : `Asset #${alert.assetId}`;
                const isResolved = alert.status === 'Resolved';

                return (
                  <div key={alert.id} className="card-item">
                    <div className="card-item-header">
                      <span className="card-item-title">{assetName}</span>
                      <span className={`badge ${alert.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>
                        {alert.severity}
                      </span>
                    </div>
                    <div className="card-item-body">{alert.message}</div>
                    <div className="card-item-footer">
                      <span className="card-item-meta">{new Date(alert.createdAt).toLocaleString()}</span>
                      {isResolved ? (
                        <span className="badge badge-resolved">Resolved</span>
                      ) : (
                        <button
                          className="btn secondary sm"
                          onClick={() => handleResolveAlert(alert.id)}
                        >
                          Resolve Alert
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Sensor Readings Stream</h3>
            <span className="badge badge-info">{readings.length}</span>
          </div>
          <div className="card-list">
            {readings.length === 0 ? (
              <div className="empty-state">No sensor readings recorded yet. Click "Simulate New Telemetry" above.</div>
            ) : (
              readings.map((reading) => {
                const assetName = reading.asset ? reading.asset.name : `Asset #${reading.assetId}`;
                const isLow = reading.waterLevel < 20;

                return (
                  <div key={reading.id} className="card-item">
                    <div className="card-item-header">
                      <span className="card-item-title">{assetName}</span>
                      <span className={`badge ${isLow ? 'badge-critical' : 'badge-resolved'}`}>
                        {isLow ? 'Low Level' : 'Normal'}
                      </span>
                    </div>
                    <div className="card-item-body">
                      <strong>Water Level:</strong> {reading.waterLevel}% &bull;{' '}
                      <strong>Flow Rate:</strong> {reading.flowRate} L/min &bull;{' '}
                      <strong>Pressure:</strong> {reading.pressure} bar
                    </div>
                    <div className="card-item-meta">
                      Recorded: {new Date(reading.recordedAt).toLocaleString()} (Simulated)
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
