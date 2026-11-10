async function loadComplaints() {
  const filterSelect = document.getElementById('complaint-filter-status');
  const statusFilter = filterSelect ? filterSelect.value : '';

  const params = new URLSearchParams();
  if (statusFilter) params.append('status', statusFilter);

  try {
    const res = await fetch(`/api/complaints?${params.toString()}`);
    if (!res.ok) return;
    const complaints = await res.json();
    const container = document.getElementById('complaints-list');
    if (!container) return;

    container.innerHTML = '';
    if (complaints.length === 0) {
      container.innerHTML = '<div class="empty-state">No complaints matching filter.</div>';
      return;
    }

    complaints.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card-item';

      let badgeClass = 'badge-pending';
      if (item.status === 'In Progress') badgeClass = 'badge-progress';
      if (item.status === 'Resolved') badgeClass = 'badge-resolved';

      const locationText = (item.latitude && item.longitude)
        ? `Coordinates: ${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
        : 'Location: Not provided';

      card.innerHTML = `
        <div class="card-item-header">
          <span class="card-item-title">${item.title}</span>
          <span class="badge ${badgeClass}">${item.status}</span>
        </div>
        <div class="card-item-body">${item.description}</div>
        <div class="card-item-meta">
          <strong>Category:</strong> ${item.category} &bull; ${locationText}
        </div>
        <div class="card-item-footer">
          <span class="card-item-meta">${new Date(item.createdAt).toLocaleString()}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            <label style="font-size:0.75rem;color:#64748b;">Status:</label>
            <select class="status-badge-select" data-complaint-id="${item.id}">
              <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
              <option value="In Progress" ${item.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
              <option value="Resolved" ${item.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
            </select>
          </div>
        </div>
      `;

      const select = card.querySelector(`[data-complaint-id="${item.id}"]`);
      if (select) {
        select.addEventListener('change', async (e) => {
          await updateComplaintStatus(item.id, e.target.value);
        });
      }

      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function updateComplaintStatus(id, newStatus) {
  try {
    const res = await fetch(`/api/complaints/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      loadComplaints();
      loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function submitComplaint(e) {
  e.preventDefault();
  const title = document.getElementById('complaint-title').value;
  const category = document.getElementById('complaint-category').value;
  const description = document.getElementById('complaint-desc').value;
  const latVal = document.getElementById('complaint-lat').value;
  const lngVal = document.getElementById('complaint-lng').value;

  const payload = {
    title,
    category,
    description
  };
  if (latVal) payload.latitude = parseFloat(latVal);
  if (lngVal) payload.longitude = parseFloat(lngVal);

  try {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      document.getElementById('complaint-form').reset();
      loadComplaints();
      loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}
