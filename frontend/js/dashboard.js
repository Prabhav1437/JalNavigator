async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('stat-tanks').textContent = data.waterTanks || 0;
    document.getElementById('stat-borewells').textContent = data.borewells || 0;
    document.getElementById('stat-pipelines').textContent = data.pipelines || 0;
    document.getElementById('stat-complaints').textContent = data.totalComplaints || 0;
    document.getElementById('stat-pending').textContent = data.pendingComplaints || 0;
    document.getElementById('stat-alerts').textContent = data.unresolvedAlerts || 0;

    const alertsCountBadge = document.getElementById('dash-alerts-count');
    if (alertsCountBadge) {
      alertsCountBadge.textContent = data.unresolvedAlerts || 0;
    }

    const complaintsCountBadge = document.getElementById('dash-complaints-count');
    if (complaintsCountBadge) {
      complaintsCountBadge.textContent = data.pendingComplaints || 0;
    }

    const alertsContainer = document.getElementById('dash-alerts-list');
    if (alertsContainer) {
      alertsContainer.innerHTML = '';
      if (!data.recentAlerts || data.recentAlerts.length === 0) {
        alertsContainer.innerHTML = '<div class="empty-state">No active alerts reported.</div>';
      } else {
        data.recentAlerts.forEach(alert => {
          const item = document.createElement('div');
          item.className = 'card-item';
          const assetName = alert.asset ? alert.asset.name : `Asset #${alert.assetId}`;
          item.innerHTML = `
            <div class="card-item-header">
              <span class="card-item-title">${assetName}</span>
              <span class="badge ${alert.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}">${alert.severity}</span>
            </div>
            <div class="card-item-body">${alert.message}</div>
            <div class="card-item-meta">${new Date(alert.createdAt).toLocaleString()}</div>
          `;
          alertsContainer.appendChild(item);
        });
      }
    }

    const complaintsContainer = document.getElementById('dash-complaints-list');
    if (complaintsContainer) {
      complaintsContainer.innerHTML = '';
      if (!data.recentComplaints || data.recentComplaints.length === 0) {
        complaintsContainer.innerHTML = '<div class="empty-state">No recent complaints found.</div>';
      } else {
        data.recentComplaints.forEach(complaint => {
          const item = document.createElement('div');
          item.className = 'card-item';
          let badgeClass = 'badge-pending';
          if (complaint.status === 'In Progress') badgeClass = 'badge-progress';
          if (complaint.status === 'Resolved') badgeClass = 'badge-resolved';

          item.innerHTML = `
            <div class="card-item-header">
              <span class="card-item-title">${complaint.title}</span>
              <span class="badge ${badgeClass}">${complaint.status}</span>
            </div>
            <div class="card-item-body">${complaint.description}</div>
            <div class="card-item-meta">${complaint.category} &bull; ${new Date(complaint.createdAt).toLocaleString()}</div>
          `;
          complaintsContainer.appendChild(item);
        });
      }
    }
  } catch (err) {
    console.error(err);
  }
}
