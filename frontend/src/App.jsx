import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { LoadScript } from "@react-google-maps/api";

import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

// Pages
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Result from "./pages/Result";
import History from "./pages/History";
import GoogleCallback from "./pages/GoogleCallback";
import Nearby from "./pages/Nearby";

// Admin Pages
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminPredictions from "./pages/AdminPredictions";
import AdminLogs from "./pages/AdminLogs";

// Components
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";

// Styles
import "./styles/App.css";

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function AppContent() {
  return (
    <Router>
      <div className="app">
        <Navbar />

        <main className="main-content">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/result" element={<Result />} />
            <Route path="/nearby" element={<Nearby />} />

            {/* Protected User Routes */}
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <History />
                </ProtectedRoute>
              }
            />

            {/* Google OAuth Callback */}
            <Route path="/auth/google/callback" element={<GoogleCallback />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <AdminDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/predictions"
              element={
                <AdminRoute>
                  <AdminPredictions />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/logs"
              element={
                <AdminRoute>
                  <AdminLogs />
                </AdminRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* Google Maps MUST be loaded once at root */}
        <LoadScript
          googleMapsApiKey={GOOGLE_MAPS_API_KEY}
          libraries={["places"]}
        >
          <AppContent />
        </LoadScript>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;