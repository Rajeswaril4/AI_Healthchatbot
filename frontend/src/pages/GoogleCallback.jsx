import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GoogleCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleGoogleCallback } = useAuth();

  useEffect(() => {
    const processCallback = async () => {
      // Get the token from URL parameters
      const token = searchParams.get('token');
      const error = searchParams.get('error');

      if (error) {
        console.error('Google OAuth error:', error);
        navigate('/login', {
          state: { error: 'Google login failed. Please try again.' },
        });
        return;
      }

      if (token) {
        const result = await handleGoogleCallback(token);

        if (result.success) {
          navigate('/', { replace: true });
        } else {
          navigate('/login', {
            state: { error: result.error || 'Authentication failed' },
          });
        }
      } else {
        navigate('/login', {
          state: { error: 'No authentication token received' },
        });
      }
    };

    processCallback();
  }, [searchParams, navigate, handleGoogleCallback]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="loading-spinner">
          <p>Completing Google sign-in...</p>
        </div>
      </div>
    </div>
  );
};

export default GoogleCallback;