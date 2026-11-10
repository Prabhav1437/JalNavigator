async function loadMonitoring() {
  await Promise.all([
    loadAssetSelectOptions(),
    loadMonitoringAlerts(),
    loadSensorReadings()
  ]);
}

async function loadAssetSelectOptions() {
  try {
    const res = await fetch('/api/assets');
    if (!res.ok) return;
    const assets = await res.json();
    const select = document.getElementById('simulate-asset-select');
    if (!select) return;

    const currentVal = select.value;
    select.innerHTML = '<option value="">Auto Select First Asset</option>';
    assets.forEach(asset => {
      const opt = document.createElement('option');
      opt.value = asset.id;
      opt.textContent = `${asset.name} (${asset.village || 'No village'})`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  } catch (err) {
    console.error(err);
  }
}

async function loadMonitoringAlerts() {
  try {
    const res = await fetch('/api/alerts');
    if (!res.ok) return;
    const alerts = await res.json();
    const container = document.getElementById('monitoring-alerts-list');
    const badge = document.getElementById('alerts-count-badge');
    if (badge) {
      badge.textContent = alerts.filter(a => a.status === 'Open').length;
    }
    if (!container) return;

    container.innerHTML = '';
    if (alerts.length === 0) {
      container.innerHTML = '<div class="empty-state">No alerts recorded.</div>';
      return;
    }

    alerts.forEach(alert => {
      const card = document.createElement('div');
      card.className = 'card-item';
      const assetName = alert.asset ? alert.asset.name : `Asset #${alert.assetId}`;
      const isResolved = alert.status === 'Resolved';

      card.innerHTML = `
        <div class="card-item-header">
          <span class="card-item-title">${assetName}</span>
          <span class="badge ${alert.severity === 'Critical' ? 'badge-critical' : 'badge-warning'}">${alert.severity}</span>
        </div>
        <div class="card-item-body">${alert.message}</div>
        <div class="card-item-footer">
          <span class="card-item-meta">${new Date(alert.createdAt).toLocaleString()}</span>
          ${isResolved ? '<span class="badge badge-resolved">Resolved</span>' : `<button class="btn secondary sm" data-alert-id="${alert.id}">Resolve Alert</button>`}
        </div>
      `;

      const resolveBtn = card.querySelector(`[data-alert-id="${alert.id}"]`);
      if (resolveBtn) {
        resolveBtn.addEventListener('click', async () => {
          await updateAlertStatus(alert.id, 'Resolved');
        });
      }

      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function updateAlertStatus(alertId, status) {
  try {
    const res = await fetch(`/api/alerts/${alertId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    if (res.ok) {
      loadMonitoringAlerts();
      loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}

async function loadSensorReadings() {
  try {
    const res = await fetch('/api/sensors');
    if (!res.ok) return;
    const readings = await res.json();
    const container = document.getElementById('monitoring-readings-list');
    const badge = document.getElementById('readings-count-badge');
    if (badge) {
      badge.textContent = readings.length;
    }
    if (!container) return;

    container.innerHTML = '';
    if (readings.length === 0) {
      container.innerHTML = '<div class="empty-state">No sensor readings recorded yet. Click "Simulate New Telemetry" above.</div>';
      return;
    }

    readings.forEach(reading => {
      const card = document.createElement('div');
      card.className = 'card-item';
      const assetName = reading.asset ? reading.asset.name : `Asset #${reading.assetId}`;
      const isLow = reading.waterLevel < 20;

      card.innerHTML = `
        <div class="card-item-header">
          <span class="card-item-title">${assetName}</span>
          <span class="badge ${isLow ? 'badge-critical' : 'badge-resolved'}">${isLow ? 'Low Level' : 'Normal'}</span>
        </div>
        <div class="card-item-body">
          <strong>Water Level:</strong> ${reading.waterLevel}% &bull;
          <strong>Flow Rate:</strong> ${reading.flowRate} L/min &bull;
          <strong>Pressure:</strong> ${reading.pressure} bar
        </div>
        <div class="card-item-meta">Recorded: ${new Date(reading.recordedAt).toLocaleString()} (Simulated)</div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function simulateReading() {
  const assetSelect = document.getElementById('simulate-asset-select');
  const assetId = assetSelect ? assetSelect.value : '';

  try {
    const body = {};
    if (assetId) body.assetId = parseInt(assetId, 10);

    const res = await fetch('/api/sensors/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      await loadMonitoring();
      await loadDashboard();
    } else {
      const errorData = await res.json();
      alert(errorData.error || 'Failed to simulate telemetry');
    }
  } catch (err) {
    console.error(err);
  }
}
