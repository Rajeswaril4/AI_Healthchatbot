import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import '../styles/Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, backgroundVisible, toggleBackground } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <Link to="/" className="brand-link">
          🩺 AI HealthBot
        </Link>
      </div>

      <nav className="navbar-nav">
        <Link to="/" className="nav-link">
          Home
        </Link>

        {user ? (
          <>
            <Link to="/history" className="nav-link">
              History
            </Link>
            <button onClick={handleLogout} className="nav-link nav-btn">
              Logout
            </button>
            <span className="nav-user">👤 {user.username || user.email}</span>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">
              Login
            </Link>
            <Link to="/register" className="nav-link">
              Register
            </Link>
          </>
        )}

        <button
          onClick={toggleTheme}
          className="theme-btn"
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <button
          onClick={toggleBackground}
          className="theme-btn"
          aria-label={`${backgroundVisible ? 'Hide' : 'Show'} background image`}
          title={`${backgroundVisible ? 'Hide' : 'Show'} background`}>
        </button>
      </nav>
    </header>
  );
};

export default Navbar;