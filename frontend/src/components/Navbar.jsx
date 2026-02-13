import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  Stethoscope,
  Home,
  History,
  Shield,
  User,
  LogOut,
  LogIn,
  UserPlus,
  Moon,
  Sun,
  Image,
  ImageOff,
  MapPin
} from "lucide-react";
import "../styles/Navbar.css";

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme, backgroundVisible, toggleBackground } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="navbar">
      {/* BRAND */}
      <div className="navbar-brand">
        <Link to="/" className="brand-link">
          <Stethoscope size={20} /> AI HealthBot
        </Link>
      </div>

      {/* NAV LINKS */}
      <nav className="navbar-nav">
        <Link to="/" className="nav-link">
          <Home size={16} /> Home
        </Link>

        <Link to="/nearby" className="nav-link">
          <MapPin size={16} /> Find Nearby
        </Link>

        {user ? (
          <>
            <Link to="/history" className="nav-link">
              <History size={16} /> History
            </Link>

            {/* Admin link */}
            {user.role === "admin" && (
              <Link to="/admin" className="nav-link admin-link">
                <Shield size={16} /> Admin
              </Link>
            )}

            <button onClick={handleLogout} className="nav-link nav-btn">
              <LogOut size={16} /> Logout
            </button>

            <span className="nav-user">
              <User size={16} />
              {user.username || user.email}
              {user.role === "admin" && (
                <span className="admin-badge">Admin</span>
              )}
            </span>
          </>
        ) : (
          <>
            <Link to="/login" className="nav-link">
              <LogIn size={16} /> Login
            </Link>

            <Link to="/register" className="nav-link">
              <UserPlus size={16} /> Register
            </Link>
          </>
        )}

        {/* THEME TOGGLE */}
        <button
          onClick={toggleTheme}
          className="theme-btn"
          aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
          title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
        >
          {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        

      </nav>
    </header>
  );
};

export default Navbar;