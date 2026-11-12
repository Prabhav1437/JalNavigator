import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Monitoring() {
  const [assets, setAssets] = useState([]);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [readings, setReadings] = useState([]);

  const loadAssets = async () => {
    try {
      const json = await api.getAssets();
      setAssets(json);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAlerts = async () => {
    try {
      const json = await api.getAlerts();
      setAlerts(json);
    } catch (err) {
      console.error(err);
    }
  };

  const loadReadings = async () => {
    try {
      const json = await api.getSensors();
      setReadings(json);
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

      await api.simulateSensor(body);
      loadReadings();
      loadAlerts();
    } catch (err) {
      alert(err.message || 'Failed to simulate telemetry');
    }
  };

  const handleResolveAlert = async (id) => {
    try {
      await api.updateAlertStatus(id, 'Resolved');
      loadAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const openAlertsCount = alerts.filter((a) => a.status === 'Open').length;

  const relevantReadings = selectedAssetId
    ? readings.filter((r) => r.assetId === parseInt(selectedAssetId, 10))
    : readings;

  const chartReadings = [...relevantReadings].reverse().slice(-12);

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
            <option value="">All Assets (Latest Stream)</option>
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

      <div className="dash-card" style={{ marginBottom: '24px' }}>
        <div className="dash-card-header">
          <h3>Water Level Trend (Historical Telemetry)</h3>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Critical Threshold: 20%</span>
        </div>
        {chartReadings.length === 0 ? (
          <div className="empty-state">No historical readings to plot.</div>
        ) : (
          <div style={{ width: '100%', height: '140px', position: 'relative' }}>
            <svg viewBox="0 0 500 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
              <line x1="0" y1="96" x2="500" y2="96" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" />
              <text x="4" y="92" fill="#ef4444" fontSize="9" fontFamily="sans-serif">20% Critical</text>

              {(() => {
                const step = 500 / Math.max(chartReadings.length - 1, 1);
                const points = chartReadings.map((r, i) => {
                  const x = i * step;
                  const y = 110 - (Math.min(Math.max(r.waterLevel, 0), 100) / 100) * 100;
                  return `${x},${y}`;
                }).join(' ');

                return (
                  <>
                    <polyline fill="none" stroke="#0284c7" strokeWidth="2.5" points={points} />
                    {chartReadings.map((r, i) => {
                      const x = i * step;
                      const y = 110 - (Math.min(Math.max(r.waterLevel, 0), 100) / 100) * 100;
                      const isLow = r.waterLevel < 20;
                      return (
                        <circle
                          key={r.id || i}
                          cx={x}
                          cy={y}
                          r="4"
                          fill={isLow ? '#ef4444' : '#0284c7'}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        >
                          <title>{`${r.waterLevel}% (${new Date(r.recordedAt).toLocaleTimeString()})`}</title>
                        </circle>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        )}
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
            <span className="badge badge-info">{relevantReadings.length}</span>
          </div>
          <div className="card-list">
            {relevantReadings.length === 0 ? (
              <div className="empty-state">No sensor readings recorded yet. Click "Simulate New Telemetry" above.</div>
            ) : (
              relevantReadings.map((reading) => {
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
