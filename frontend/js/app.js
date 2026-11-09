document.addEventListener('DOMContentLoaded', () => {
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabName = item.getAttribute('data-tab');

      navItems.forEach(n => n.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      item.classList.add('active');
      const targetPane = document.getElementById(tabName);
      if (targetPane) {
        targetPane.classList.add('active');
      }

      if (tabName === 'dashboard') {
        loadDashboard();
      } else if (tabName === 'map') {
        initMap();
      } else if (tabName === 'monitoring') {
        loadMonitoring();
      } else if (tabName === 'complaints') {
        loadComplaints();
      }
    });
  });

  const simulateBtn = document.getElementById('simulate-btn');
  if (simulateBtn) {
    simulateBtn.addEventListener('click', simulateReading);
  }

  const complaintForm = document.getElementById('complaint-form');
  if (complaintForm) {
    complaintForm.addEventListener('submit', submitComplaint);
  }

  loadDashboard();
});