import React, { useState, useEffect } from 'react';
import api from '../services/api';

export default function Complaints() {
  const [complaints, setComplaints] = useState([]);
  const [filterStatus, setFilterStatus] = useState('');

  const [formState, setFormState] = useState({
    title: '',
    category: 'Pipeline leakage',
    description: '',
    latitude: '',
    longitude: ''
  });

  const loadComplaints = async () => {
    try {
      const params = {};
      if (filterStatus) params.status = filterStatus;

      const json = await api.getComplaints(params);
      setComplaints(json);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, [filterStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        title: formState.title,
        category: formState.category,
        description: formState.description
      };
      if (formState.latitude) payload.latitude = parseFloat(formState.latitude);
      if (formState.longitude) payload.longitude = parseFloat(formState.longitude);

      await api.createComplaint(payload);

      setFormState({
        title: '',
        category: 'Pipeline leakage',
        description: '',
        latitude: '',
        longitude: ''
      });
      loadComplaints();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await api.updateComplaintStatus(id, newStatus);
      loadComplaints();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <section>
      <header className="section-header">
        <h1>Grievance & Complaint Management</h1>
        <p className="subtitle">Citizen grievance intake and administrative resolution workflow</p>
      </header>

      <div className="complaints-layout">
        <div className="complaint-form-wrapper">
          <h3>Register Grievance</h3>
          <form className="simple-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Complaint Title</label>
              <input
                type="text"
                placeholder="Brief summary of issue"
                value={formState.title}
                onChange={(e) => setFormState({ ...formState, title: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select
                value={formState.category}
                onChange={(e) => setFormState({ ...formState, category: e.target.value })}
              >
                <option value="Pipeline leakage">Pipeline leakage</option>
                <option value="No water supply">No water supply</option>
                <option value="Dirty water">Dirty water</option>
                <option value="Low water pressure">Low water pressure</option>
                <option value="Damaged infrastructure">Damaged infrastructure</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Detailed Description</label>
              <textarea
                placeholder="Describe the problem, affected ward or landmark"
                rows="3"
                value={formState.description}
                onChange={(e) => setFormState({ ...formState, description: e.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Latitude (Optional)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="26.8467"
                  value={formState.latitude}
                  onChange={(e) => setFormState({ ...formState, latitude: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Longitude (Optional)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="80.9462"
                  value={formState.longitude}
                  onChange={(e) => setFormState({ ...formState, longitude: e.target.value })}
                />
              </div>
            </div>
            <button type="submit" className="btn primary">Submit Grievance</button>
          </form>
        </div>

        <div className="complaint-list-wrapper">
          <div className="list-toolbar">
            <h3>Track Complaints</h3>
            <select
              className="form-control"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
          </div>
          <div className="card-list">
            {complaints.length === 0 ? (
              <div className="empty-state">No complaints matching filter.</div>
            ) : (
              complaints.map((item) => {
                let badgeClass = 'badge-pending';
                if (item.status === 'In Progress') badgeClass = 'badge-progress';
                if (item.status === 'Resolved') badgeClass = 'badge-resolved';

                const locationText =
                  item.latitude != null && item.longitude != null
                    ? `Coordinates: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                    : 'Location: Not provided';

                return (
                  <div key={item.id} className="card-item">
                    <div className="card-item-header">
                      <span className="card-item-title">{item.title}</span>
                      <span className={`badge ${badgeClass}`}>{item.status}</span>
                    </div>
                    <div className="card-item-body">{item.description}</div>
                    <div className="card-item-meta">
                      <strong>Category:</strong> {item.category} &bull; {locationText}
                    </div>
                    <div className="card-item-footer">
                      <span className="card-item-meta">{new Date(item.createdAt).toLocaleString()}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Status:</label>
                        <select
                          className="status-badge-select"
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value)}
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Resolved">Resolved</option>
                        </select>
                      </div>
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
