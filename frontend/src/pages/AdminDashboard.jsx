import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  Users,
  Shield,
  BarChart3,
  FileText,
  Activity,
  UserPlus,
  Stethoscope
} from "lucide-react";
import "../styles/Admin.css";

const AdminDashboard = () => {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/", { replace: true });
      return;
    }

    if (user) {
      fetchDashboardStats();
    }
  }, [user, navigate]);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.get("/admin/dashboard");
      setStats(response.data.stats);
    } catch (err) {
      console.error("Failed to fetch dashboard stats:", err);
      if (err.response?.status === 403) {
        setError("Access denied. Admin privileges required.");
        setTimeout(() => navigate("/"), 2000);
      } else {
        setError("Failed to load dashboard statistics");
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="admin-container">
        <div className="loading-spinner">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-container">
        <div className="error-message">{error}</div>
      </div>
    );
  }

  return (
    <div className="admin-container">
      {/* HEADER */}
      <div className="admin-header">
        <h1>Admin Dashboard</h1>

        <div className="admin-nav">
          <button onClick={() => navigate("/admin/users")} className="btn btn-primary">
            <Users size={16} /> Manage Users
          </button>

          <button onClick={() => navigate("/admin/predictions")} className="btn btn-primary">
            <BarChart3 size={16} /> View Predictions
          </button>

          <button onClick={() => navigate("/admin/logs")} className="btn btn-outline">
            <FileText size={16} /> Activity Logs
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Users size={22} />
          </div>
          <div className="stat-content">
            <h3>Total Users</h3>
            <p className="stat-value">{stats?.total_users || 0}</p>
            <p className="stat-label">{stats?.active_users || 0} active</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Shield size={22} />
          </div>
          <div className="stat-content">
            <h3>Admin Users</h3>
            <p className="stat-value">{stats?.admin_users || 0}</p>
            <p className="stat-label">administrators</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Activity size={22} />
          </div>
          <div className="stat-content">
            <h3>Total Predictions</h3>
            <p className="stat-value">{stats?.total_predictions || 0}</p>
            <p className="stat-label">
              {stats?.recent_predictions || 0} this week
            </p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <UserPlus size={22} />
          </div>
          <div className="stat-content">
            <h3>New Users</h3>
            <p className="stat-value">{stats?.recent_registrations || 0}</p>
            <p className="stat-label">last 30 days</p>
          </div>
        </div>
      </div>

      {/* TOP DISEASES */}
      {stats?.top_diseases && stats.top_diseases.length > 0 && (
        <div className="admin-section">
          <h2>
            <Stethoscope size={18} /> Top 5 Diseases
          </h2>

          <div className="disease-list">
            {stats.top_diseases.map((disease, index) => (
              <div key={index} className="disease-item">
                <span className="disease-rank">#{index + 1}</span>
                <span className="disease-name">{disease.disease}</span>
                <span className="disease-count">
                  {disease.count} predictions
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
