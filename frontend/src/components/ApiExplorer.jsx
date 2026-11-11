import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function ApiExplorer() {
  const [apiInfo, setApiInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testResult, setTestResult] = useState(null);
  const [activeTestPath, setActiveTestPath] = useState('');

  const loadInfo = async () => {
    setLoading(true);
    try {
      const data = await api.getInfo();
      setApiInfo(data);
    } catch (err) {
      setApiInfo({ status: 'offline', error: err.message, endpoints: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const runTest = async (endpoint) => {
    setActiveTestPath(endpoint.path);
    try {
      let resData = null;
      if (endpoint.path === '/api') resData = await api.getInfo();
      else if (endpoint.path === '/api/dashboard') resData = await api.getDashboard();
      else if (endpoint.path === '/api/assets') resData = await api.getAssets();
      else if (endpoint.path === '/api/complaints') resData = await api.getComplaints();
      else if (endpoint.path === '/api/sensors') resData = await api.getSensors();
      else if (endpoint.path === '/api/alerts') resData = await api.getAlerts();
      else if (endpoint.path === '/api/sensors/simulate') resData = await api.simulateSensor();
      else resData = { message: 'Method requires payload or specific ID', path: endpoint.path };

      setTestResult({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        status: 200,
        data: resData
      });
    } catch (err) {
      setTestResult({
        endpoint: `${endpoint.method} ${endpoint.path}`,
        status: 'error',
        error: err.message
      });
    }
  };

  return (
    <section>
      <header className="section-header">
        <h1>REST API Directory</h1>
        <p className="subtitle">Backend endpoint specifications and interactive testing suite</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>API Status</h3>
          <p style={{ color: apiInfo?.status === 'healthy' ? '#16a34a' : '#dc2626', fontSize: '1.4rem' }}>
            {loading ? 'Checking...' : (apiInfo?.status?.toUpperCase() || 'OFFLINE')}
          </p>
        </div>
        <div className="stat-card">
          <h3>Version</h3>
          <p style={{ fontSize: '1.4rem', color: '#0f172a' }}>{apiInfo?.version || '1.0.0'}</p>
        </div>
        <div className="stat-card">
          <h3>Registered Routes</h3>
          <p>{apiInfo?.endpoints?.length || 13}</p>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Available Endpoints</h3>
            <button className="btn secondary sm" onClick={loadInfo}>Refresh</button>
          </div>
          <div className="card-list">
            {!apiInfo?.endpoints || apiInfo.endpoints.length === 0 ? (
              <div className="empty-state">No endpoints available.</div>
            ) : (
              apiInfo.endpoints.map((ep, idx) => (
                <div key={idx} className="card-item">
                  <div className="card-item-header">
                    <span className="card-item-title" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      <span className={`badge ${ep.method === 'GET' ? 'badge-progress' : ep.method === 'POST' ? 'badge-resolved' : ep.method === 'DELETE' ? 'badge-critical' : 'badge-warning'}`} style={{ marginRight: '8px' }}>
                        {ep.method}
                      </span>
                      {ep.path}
                    </span>
                    {(ep.method === 'GET' || ep.path === '/api/sensors/simulate') && (
                      <button
                        className="btn primary sm"
                        onClick={() => runTest(ep)}
                        disabled={activeTestPath === ep.path && loading}
                      >
                        Test
                      </button>
                    )}
                  </div>
                  <div className="card-item-body">{ep.description}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Live Response Console</h3>
            {testResult && (
              <button className="btn secondary sm" onClick={() => setTestResult(null)}>Clear</button>
            )}
          </div>
          <div style={{ background: '#0f172a', color: '#38bdf8', borderRadius: '6px', padding: '16px', fontFamily: 'monospace', fontSize: '0.8rem', minHeight: '380px', maxHeight: '480px', overflowY: 'auto' }}>
            {!testResult ? (
              <span style={{ color: '#64748b' }}>Select any GET endpoint on the left and click "Test" to inspect the live JSON response payload.</span>
            ) : (
              <div>
                <div style={{ color: '#a5f3fc', marginBottom: '8px', borderBottom: '1px solid #1e293b', paddingBottom: '6px' }}>
                  <strong>Endpoint:</strong> {testResult.endpoint}
                </div>
                <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {JSON.stringify(testResult.data || testResult.error, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
