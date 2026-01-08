// Reuse the shared axios instance from AuthContext to keep interceptors consistent
import { api } from '../context/AuthContext';

// API helper functions
export const apiService = {
  // Auth
  login: (credentials) => api.post('/login', credentials),
  register: (userData) => api.post('/register', userData),
  logout: () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },
  getCurrentUser: () => api.get('/user'),

  // Symptoms
  getSymptoms: () => api.get('/symptoms'),

  // Predictions
  predict: (symptoms) => api.post('/predict', { symptoms }),
  getHistory: () => api.get('/history'),

  // Nearby specialists
  getNearby: (params) => api.get('/nearby', { params }),

  // Health check
  healthCheck: () => api.get('/health'),

  // CSRF token
  getCsrfToken: () => api.get('/csrf-token'),
};

export default api;