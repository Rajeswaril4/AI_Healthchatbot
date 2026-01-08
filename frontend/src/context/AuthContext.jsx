import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Axios instance with interceptors
export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log('🔑 Request with token:', token.substring(0, 20) + '...');
    } else {
      console.log('⚠️ No token found in request');
    }
    return config;
  },
  (error) => {
    console.error('❌ Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
// In AuthContext.jsx - Update the api interceptor response handler (around line 37)

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const status = error.response?.status;

    // If error is 401 or 422 (JWT validation failed) and we haven't retried yet
    if ((status === 401 || status === 422) && !originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const refreshToken = localStorage.getItem('refresh_token');
          if (refreshToken) {
            console.log('🔄 Attempting token refresh...');
            const response = await axios.post(
              `${API_URL}/refresh`,
              {},
              { headers: { Authorization: `Bearer ${refreshToken}` } }
            );

            const { access_token } = response.data;
            localStorage.setItem('access_token', access_token);
            console.log('✅ Token refreshed successfully');

            originalRequest.headers.Authorization = `Bearer ${access_token}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          console.error('❌ Token refresh failed:', refreshError);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('user');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }

    return Promise.reject(error);
  }
);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('🔍 AuthProvider mounted, checking authentication...');
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token');
    const savedUser = localStorage.getItem('user');

    console.log('🔍 Checking auth:', {
      hasToken: !!token,
      hasSavedUser: !!savedUser
    });

    if (token && savedUser) {
      try {
        // First, set user from localStorage immediately
        const userData = JSON.parse(savedUser);
        setUser(userData);
        console.log('✅ User loaded from localStorage:', userData);

        // Then verify with backend
        const response = await api.get('/user');
        setUser(response.data.user);
        console.log('✅ User verified with backend:', response.data.user);
        
      } catch (error) {
        console.error('❌ Auth check failed:', error.response?.status, error.message);
        
        // Only logout if it's a real auth failure, not a network error
        if (error.response?.status === 401 || error.response?.status === 404) {
          console.log('🚪 Invalid session, logging out...');
          logout();
        } else {
          // For network errors, keep the user from localStorage
          console.log('⚠️ Network error, keeping cached user');
          try {
            const userData = JSON.parse(savedUser);
            setUser(userData);
          } catch (e) {
            logout();
          }
        }
      }
    } else {
      console.log('ℹ️ No saved session found');
    }
    
    setLoading(false);
  };

  const login = async (credentials) => {
    try {
      console.log('🔐 Attempting login...');
      const response = await api.post('/login', credentials);
      const { access_token, refresh_token, user } = response.data;

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      setUser(user);
      console.log('✅ Login successful:', user);
      
      return { success: true, user };
    } catch (error) {
      console.error('❌ Login failed:', error.response?.data);
      const message = error.response?.data?.error || 'Login failed';
      return { success: false, error: message };
    }
  };

  const register = async (userData) => {
    try {
      console.log('📝 Attempting registration...');
      const response = await api.post('/register', userData);
      const { access_token, refresh_token, user } = response.data;

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      setUser(user);
      console.log('✅ Registration successful:', user);
      
      return { success: true, user };
    } catch (error) {
      console.error('❌ Registration failed:', error.response?.data);
      const message = error.response?.data?.error || 'Registration failed';
      return { success: false, error: message };
    }
  };

  const loginWithGoogle = () => {
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    window.location.href = `${API_URL}/auth/google?redirect_uri=${encodeURIComponent(redirectUri)}`;
  };

  const handleGoogleCallback = async (token) => {
    try {
      console.log('🔐 Processing Google OAuth callback...');
      const response = await api.get('/auth/google/callback', {
        headers: { Authorization: `Bearer ${token}` },
      });

      const { access_token, refresh_token, user } = response.data;

      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      setUser(user);
      console.log('✅ Google login successful:', user);
      
      return { success: true, user };
    } catch (error) {
      console.error('❌ Google login failed:', error.response?.data);
      const message = error.response?.data?.error || 'Google login failed';
      return { success: false, error: message };
    }
  };

  const logout = () => {
    console.log('🚪 Logging out...');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    loginWithGoogle,
    handleGoogleCallback,
    api,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;