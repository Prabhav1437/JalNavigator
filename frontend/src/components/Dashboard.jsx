import React, { useState, useEffect } from 'react';

export default function Dashboard() {
  const [data, setData] = useState({
    waterTanks: 0,
    borewells: 0,
    pipelines: 0,
    totalComplaints: 0,
    pendingComplaints: 0,
    unresolvedAlerts: 0,
    recentAlerts: [],
    recentComplaints: []
  });

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  return (
    <section>
      <header className="section-header">
        <h1>Admin Dashboard</h1>
        <p className="subtitle">Central operational overview of rural drinking water infrastructure</p>
      </header>

      <div className="stats-grid">
        <div className="stat-card">
          <h3>Water Tanks</h3>
          <p>{data.waterTanks}</p>
        </div>
        <div className="stat-card">
          <h3>Borewells</h3>
          <p>{data.borewells}</p>
        </div>
        <div className="stat-card">
          <h3>Pipelines</h3>
          <p>{data.pipelines}</p>
        </div>
        <div className="stat-card">
          <h3>Total Complaints</h3>
          <p>{data.totalComplaints}</p>
        </div>
        <div className="stat-card">
          <h3>Pending Complaints</h3>
          <p>{data.pendingComplaints}</p>
        </div>
        <div className="stat-card">
          <h3>Unresolved Alerts</h3>
          <p>{data.unresolvedAlerts}</p>
        </div>
      </div>

      <div className="dashboard-columns">
        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Active Alerts</h3>
            <span className="badge badge-critical">{data.unresolvedAlerts}</span>
          </div>
          <div className="card-list">
            {!data.recentAlerts || data.recentAlerts.length === 0 ? (
              <div className="empty-state">No active alerts reported.</div>
            ) : (
              data.recentAlerts.map((alert) => (
                <div key={alert.id} className="card-item">
                  <div className="card-item-header">
                    <span className="card-item-title">
                      {alert.asset ? alert.asset.name : `Asset #${alert.assetId}`}
                    </span>
                    <span className={`badge ${alert.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <div className="card-item-body">{alert.message}</div>
                  <div className="card-item-meta">{new Date(alert.createdAt).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="dash-card-header">
            <h3>Recent Complaints</h3>
            <span className="badge badge-pending">{data.pendingComplaints}</span>
          </div>
          <div className="card-list">
            {!data.recentComplaints || data.recentComplaints.length === 0 ? (
              <div className="empty-state">No recent complaints found.</div>
            ) : (
              data.recentComplaints.map((complaint) => {
                let badgeClass = 'badge-pending';
                if (complaint.status === 'In Progress') badgeClass = 'badge-progress';
                if (complaint.status === 'Resolved') badgeClass = 'badge-resolved';

                return (
                  <div key={complaint.id} className="card-item">
                    <div className="card-item-header">
                      <span className="card-item-title">{complaint.title}</span>
                      <span className={`badge ${badgeClass}`}>{complaint.status}</span>
                    </div>
                    <div className="card-item-body">{complaint.description}</div>
                    <div className="card-item-meta">
                      {complaint.category} &bull; {new Date(complaint.createdAt).toLocaleString()}
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
