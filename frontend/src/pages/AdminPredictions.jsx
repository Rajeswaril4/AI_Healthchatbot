import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Admin.css';

const AdminPredictions = () => {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  
  const [predictions, setPredictions] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/', { replace: true });
      return;
    }
    
    if (user) {
      fetchPredictions();
    }
  }, [user, navigate, page]);

  const fetchPredictions = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await api.get('/admin/predictions', {
        params: { page, per_page: 20 }
      });
      
      setPredictions(response.data.predictions);
      setPagination(response.data.pagination);
      
    } catch (err) {
      console.error('Failed to fetch predictions:', err);
      setError('Failed to load predictions');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePrediction = async (predictionId) => {
    if (!window.confirm('Are you sure you want to delete this prediction?')) return;
    
    try {
      await api.delete(`/admin/predictions/${predictionId}`);
      fetchPredictions();
    } catch (err) {
      alert('Failed to delete prediction: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const formatSymptoms = (symptoms) => {
    if (!symptoms || symptoms.length === 0) return 'None';
    return symptoms.map(s => 
      s.replace(/_/g, ' ').split(' ').map(w => 
        w.charAt(0).toUpperCase() + w.slice(1)
      ).join(' ')
    ).join(', ');
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>📊 Predictions Management</h1>
        <button onClick={() => navigate('/admin')} className="btn btn-outline">
          ← Back to Dashboard
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-spinner">Loading predictions...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Disease</th>
                  <th>Confidence</th>
                  <th>Specialist</th>
                  <th>Symptoms</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {predictions.map((pred) => (
                  <tr key={pred.id}>
                    <td>{pred.id}</td>
                    <td>
                      {pred.user ? (
                        <div>
                          <div>{pred.user.email}</div>
                          <small style={{ color: '#999' }}>
                            ID: {pred.user.id}
                          </small>
                        </div>
                      ) : (
                        <span style={{ color: '#999' }}>No user</span>
                      )}
                    </td>
                    <td>
                      <strong>{pred.disease}</strong>
                    </td>
                    <td>
                      <span className="confidence-badge">
                        {pred.confidence 
                          ? `${(pred.confidence * 100).toFixed(0)}%`
                          : 'N/A'}
                      </span>
                    </td>
                    <td>{pred.specialist || 'N/A'}</td>
                    <td className="symptoms-cell">
                      <div className="symptoms-scroll">
                        {formatSymptoms(pred.selected_symptoms)}
                      </div>
                    </td>
                    <td className="date-cell">
                      {formatDate(pred.created_at)}
                    </td>
                    <td>
                      <button
                        onClick={() => handleDeletePrediction(pred.id)}
                        className="btn-icon btn-danger"
                        title="Delete Prediction"
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(page - 1)}
                disabled={!pagination.has_prev}
                className="btn btn-outline"
              >
                ← Previous
              </button>
              
              <span className="page-info">
                Page {pagination.page} of {pagination.pages}
                ({pagination.total} total predictions)
              </span>
              
              <button
                onClick={() => setPage(page + 1)}
                disabled={!pagination.has_next}
                className="btn btn-outline"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminPredictions;