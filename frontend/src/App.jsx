import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import MapView from './components/MapView';
import Monitoring from './components/Monitoring';
import Complaints from './components/Complaints';
import ApiExplorer from './components/ApiExplorer';
import ThemeToggle from './components/ThemeToggle';
import api from './services/api';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    api.getInfo()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <h2>JalNavigator</h2>
          <span>Rural Water System</span>
        </div>
        <nav className="nav-menu">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`nav-item ${activeTab === 'map' ? 'active' : ''}`}
            onClick={() => setActiveTab('map')}
          >
            Infrastructure Map
          </button>
          <button
            className={`nav-item ${activeTab === 'monitoring' ? 'active' : ''}`}
            onClick={() => setActiveTab('monitoring')}
          >
            Water Monitoring
          </button>
          <button
            className={`nav-item ${activeTab === 'complaints' ? 'active' : ''}`}
            onClick={() => setActiveTab('complaints')}
          >
            Complaints
          </button>
          <button
            className={`nav-item ${activeTab === 'api' ? 'active' : ''}`}
            onClick={() => setActiveTab('api')}
          >
            API Explorer
          </button>
        </nav>

        <ThemeToggle />

        <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #1e293b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: apiOnline ? '#22c55e' : '#ef4444',
            display: 'inline-block',
            boxShadow: apiOnline ? '0 0 6px #22c55e' : '0 0 6px #ef4444'
          }} />
          <span>API: {apiOnline ? 'Connected' : 'Offline'}</span>
        </div>
      </aside>

      <main className="content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'map' && <MapView />}
        {activeTab === 'monitoring' && <Monitoring />}
        {activeTab === 'complaints' && <Complaints />}
        {activeTab === 'api' && <ApiExplorer />}
      </main>
    </div>
  );
}
