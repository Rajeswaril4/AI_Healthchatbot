import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Admin.css';

const AdminLogs = () => {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  
  const [logs, setLogs] = useState([]);
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
      fetchLogs();
    }
  }, [user, navigate, page]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      setError('');
      
      const response = await api.get('/admin/logs', {
        params: { page, per_page: 50 }
      });
      
      setLogs(response.data.logs);
      setPagination(response.data.pagination);
      
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setError('Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getActionIcon = (action) => {
    if (action.includes('delete')) return '🗑️';
    if (action.includes('update') || action.includes('change')) return '✏️';
    if (action.includes('create') || action.includes('activate')) return '✅';
    if (action.includes('deactivate')) return '🔒';
    return '📝';
  };

  const getActionColor = (action) => {
    if (action.includes('delete')) return '#e74c3c';
    if (action.includes('update') || action.includes('change')) return '#f39c12';
    if (action.includes('create') || action.includes('activate')) return '#2ecc71';
    if (action.includes('deactivate')) return '#95a5a6';
    return '#3498db';
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>📝 Activity Logs</h1>
        <button onClick={() => navigate('/admin')} className="btn btn-outline">
          ← Back to Dashboard
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-spinner">Loading activity logs...</div>
      ) : (
        <>
          <div className="logs-container">
            {logs.map((log) => (
              <div key={log.id} className="log-item">
                <div className="log-icon" style={{ color: getActionColor(log.action) }}>
                  {getActionIcon(log.action)}
                </div>
                
                <div className="log-content">
                  <div className="log-header">
                    <span className="log-admin">
                      {log.admin_email || `Admin #${log.admin_id}`}
                    </span>
                    <span className="log-action" style={{ color: getActionColor(log.action) }}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </div>
                  
                  <div className="log-details">
                    {log.target_type && (
                      <span className="log-target">
                        {log.target_type} #{log.target_id}
                      </span>
                    )}
                    
                    {log.details && (
                      <div className="log-extra">
                        {JSON.stringify(log.details)}
                      </div>
                    )}
                  </div>
                  
                  <div className="log-date">
                    {formatDate(log.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 1}
                className="btn btn-outline"
              >
                ← Previous
              </button>
              
              <span className="page-info">
                Page {pagination.page} of {pagination.pages}
              </span>
              
              <button
                onClick={() => setPage(page + 1)}
                disabled={page === pagination.pages}
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

export default AdminLogs;