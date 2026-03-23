import axios from 'axios';
const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API = axios.create({ 
  baseURL: baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api` 
});
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('spiceroute_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default API;
