async function loadMonitoring() {
  try {
    const res = await fetch('/api/sensors');
    if (!res.ok) return;
    const readings = await res.json();
    const container = document.getElementById('monitoring-readings');
    if (!container) return;
    container.innerHTML = '';
    readings.forEach(reading => {
      const card = document.createElement('div');
      card.className = 'card-item';
      card.innerHTML = `
        <h4>Asset #${reading.assetId}</h4>
        <p>Water Level: ${reading.waterLevel}%</p>
        <p>Flow Rate: ${reading.flowRate} L/min</p>
        <p>Pressure: ${reading.pressure} bar</p>
        <small>${new Date(reading.recordedAt).toLocaleString()}</small>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function simulateReading() {
  try {
    const res = await fetch('/api/sensors/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetId: 1 })
    });
    if (res.ok) {
      loadMonitoring();
      loadDashboard();
    }
  } catch (err) {
    console.error(err);
  }
}
