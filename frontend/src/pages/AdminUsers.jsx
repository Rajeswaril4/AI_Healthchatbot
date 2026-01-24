import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/Admin.css';

const AdminUsers = () => {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (user && user.role !== 'admin') {
      navigate('/', { replace: true });
      return;
    }
    
    if (user) {
      fetchUsers();
    }
  }, [user, navigate, page, search, roleFilter]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError('');
      
      const params = { page, per_page: 20 };
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      
      const response = await api.get('/admin/users', { params });
      
      setUsers(response.data.users);
      setPagination(response.data.pagination);
      
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!window.confirm(`Change user role to ${newRole}?`)) return;
    
    try {
      await api.put(`/admin/users/${userId}/role`, { role: newRole });
      fetchUsers();
    } catch (err) {
      alert('Failed to update role: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleStatusChange = async (userId, isActive) => {
    const action = isActive ? 'activate' : 'deactivate';
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;
    
    try {
      await api.put(`/admin/users/${userId}/status`, { is_active: isActive });
      fetchUsers();
    } catch (err) {
      alert('Failed to update status: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('⚠️ Are you sure? This will permanently delete the user and all their data!')) return;
    
    try {
      await api.delete(`/admin/users/${userId}`);
      fetchUsers();
    } catch (err) {
      alert('Failed to delete user: ' + (err.response?.data?.error || 'Unknown error'));
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1>👥 User Management</h1>
        <button onClick={() => navigate('/admin')} className="btn btn-outline">
          ← Back to Dashboard
        </button>
      </div>

      <div className="admin-filters">
        <input
          type="text"
          placeholder="Search by email or username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="filter-select"
        >
          <option value="">All Roles</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </select>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading ? (
        <div className="loading-spinner">Loading users...</div>
      ) : (
        <>
          <div className="table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Predictions</th>
                  <th>Last Login</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.is_active ? 'inactive-row' : ''}>
                    <td>{u.id}</td>
                    <td>{u.email}</td>
                    <td>{u.username || '-'}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        disabled={u.id === user?.id}
                        className="role-select"
                      >
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>
                      <span className={`status-badge ${u.is_active ? 'active' : 'inactive'}`}>
                        {u.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>{u.prediction_count}</td>
                    <td className="date-cell">{formatDate(u.last_login)}</td>
                    <td className="date-cell">{formatDate(u.created_at)}</td>
                    <td>
                      <div className="action-buttons">
                        {u.id !== user?.id && (
                          <>
                            <button
                              onClick={() => handleStatusChange(u.id, !u.is_active)}
                              className={`btn-icon ${u.is_active ? 'btn-warning' : 'btn-success'}`}
                              title={u.is_active ? 'Deactivate' : 'Activate'}
                            >
                              {u.is_active ? '🔒' : '✅'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="btn-icon btn-danger"
                              title="Delete User"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
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
                ({pagination.total} total users)
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

export default AdminUsers;