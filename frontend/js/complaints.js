async function loadComplaints() {
  try {
    const res = await fetch('/api/complaints');
    if (!res.ok) return;
    const complaints = await res.json();
    const container = document.getElementById('complaints-list');
    if (!container) return;
    container.innerHTML = '';
    complaints.forEach(item => {
      const card = document.createElement('div');
      card.className = 'card-item';
      card.innerHTML = `
        <h4>${item.title}</h4>
        <p><strong>Category:</strong> ${item.category}</p>
        <p>${item.description}</p>
        <p><strong>Status:</strong> ${item.status}</p>
        <small>${new Date(item.createdAt).toLocaleString()}</small>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function submitComplaint(e) {
  e.preventDefault();
  const title = document.getElementById('complaint-title').value;
  const category = document.getElementById('complaint-category').value;
  const description = document.getElementById('complaint-desc').value;

  try {
    const res = await fetch('/api/complaints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, description })
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
