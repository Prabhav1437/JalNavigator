const BASE_URL = import.meta.env.VITE_API_URL || '/api';

async function request(endpoint = '', options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  const res = await fetch(url, config);
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.error || `HTTP error ${res.status}`);
  }
  return res.json();
}

export const api = {
  getInfo: () => request(''),
  getDashboard: () => request('/dashboard'),
  getAssets: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/assets${query ? `?${query}` : ''}`);
  },
  createAsset: (data) => request('/assets', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateAsset: (id, data) => request(`/assets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  }),
  deleteAsset: (id) => request(`/assets/${id}`, {
    method: 'DELETE'
  }),
  getComplaints: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/complaints${query ? `?${query}` : ''}`);
  },
  createComplaint: (data) => request('/complaints', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  updateComplaintStatus: (id, status) => request(`/complaints/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  }),
  getSensors: () => request('/sensors'),
  simulateSensor: (data = {}) => request('/sensors/simulate', {
    method: 'POST',
    body: JSON.stringify(data)
  }),
  getAlerts: () => request('/alerts'),
  updateAlertStatus: (id, status) => request(`/alerts/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ status })
  })
};

export default api;
