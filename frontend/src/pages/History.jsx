import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../styles/History.css';

const History = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const { api, user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchHistory();
    }
  }, [user]);

  const fetchHistory = async () => {
    try {
      setError('');
      setLoading(true);
      
      // FIXED: Changed from '/history1' to '/history'
      const response = await api.get('/history');
      
      console.log('History loaded successfully:', response.data);
      setHistory(response.data.history || []);
      
    } catch (err) {
      console.error('History fetch error:', err);
      console.error('Error details:', {
        status: err.response?.status,
        data: err.response?.data,
        message: err.message
      });
      
      if (err.response?.status === 401) {
        setError('Session expired. Please login again.');
      } else if (err.response?.status === 422) {
        setError('Invalid request. Please try again.');
      } else if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Failed to load history. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  const formatSymptoms = (symptoms) => {
    if (!symptoms || symptoms.length === 0) return 'None';
    
    try {
      return symptoms
        .map((s) =>
          s
            .replace(/_/g, ' ')
            .split(' ')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ')
        )
        .join(', ');
    } catch (e) {
      return 'Error displaying symptoms';
    }
  };

  const formatConfidence = (confidence) => {
    if (!confidence && confidence !== 0) return 'N/A';
    try {
      const value = confidence <= 1 ? confidence * 100 : confidence;
      return `${value.toFixed(0)}%`;
    } catch (e) {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="history-container">
        <div className="loading-spinner">Loading your prediction history...</div>
      </div>
    );
  }

  return (
    <div className="history-container">
      <div className="history-header">
        <h2>Your Prediction History</h2>
        <div className="header-actions">
          <Link to="/" className="btn btn-primary">
            Back to Symptoms
          </Link>
        </div>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
          <button 
            onClick={fetchHistory} 
            style={{ 
              marginLeft: '12px', 
              padding: '6px 14px',
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: '600'
            }}
          >
            🔄 Retry
          </button>
        </div>
      )}

      {!error && history.length === 0 ? (
        <div className="no-history">
          <p>No prediction history yet.</p>
          <p style={{ fontSize: '0.9rem', color: '#999', marginTop: '8px' }}>
            Start by making your first disease prediction!
          </p>
          <Link to="/" className="btn btn-primary" style={{ marginTop: '20px' }}>
            Make Your First Prediction
          </Link>
        </div>
      ) : (
        <>
          <div className="history-table-container">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Disease</th>
                  <th>Confidence</th>
                  <th className="symptoms-column">Symptoms</th>
                  <th>Specialist</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id}>
                    <td className="date-cell" data-label="Date">
                      {formatDate(record.created_at)}
                    </td>
                    <td className="disease-cell" data-label="Disease">
                      {record.disease || 'Unknown'}
                    </td>
                    <td data-label="Confidence">
                      <span className="confidence-badge">
                        {formatConfidence(record.confidence)}
                      </span>
                    </td>
                    <td className="symptoms-cell" data-label="Symptoms">
                      {formatSymptoms(record.selected_symptoms)}
                    </td>
                    <td className="specialist-cell" data-label="Specialist">
                      {record.specialist || 'General Physician'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="history-summary">
            <p>
              📊 Total predictions: <strong>{history.length}</strong>
            </p>
          </div>
        </>
      )}
    </div>
  );
};

export default History;