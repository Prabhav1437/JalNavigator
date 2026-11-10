import React, { useState } from 'react';
import Dashboard from './components/Dashboard';
import MapView from './components/MapView';
import Monitoring from './components/Monitoring';
import Complaints from './components/Complaints';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

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
        </nav>
      </aside>

      <main className="content">
        {activeTab === 'dashboard' && <Dashboard />}
        {activeTab === 'map' && <MapView />}
        {activeTab === 'monitoring' && <Monitoring />}
        {activeTab === 'complaints' && <Complaints />}
      </main>
    </div>
  );
}
