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
  } catch (err) {
    console.error(err);
  }
}
