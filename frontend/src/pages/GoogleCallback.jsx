import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GoogleCallback = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { handleGoogleCallback } = useAuth();
  const [errorMessage, setErrorMessage] = useState('');
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const processCallback = async () => {
      try {
        console.log('🔐 GoogleCallback component mounted');
        console.log('URL params:', Object.fromEntries(searchParams));

        // Get the token from URL parameters
        const token = searchParams.get('token');
        const error = searchParams.get('error');

        // Check for error from backend
        if (error) {
          console.error('❌ Google OAuth error from backend:', error);
          setErrorMessage(`Google login failed: ${error}`);
          setProcessing(false);
          
          setTimeout(() => {
            navigate('/login', {
              state: { error: `Google login failed: ${error}` },
            });
          }, 2000);
          return;
        }

        // Check if we have a token
        if (!token) {
          console.error('❌ No token received from backend');
          setErrorMessage('No authentication token received');
          setProcessing(false);
          
          setTimeout(() => {
            navigate('/login', {
              state: { error: 'No authentication token received' },
            });
          }, 2000);
          return;
        }

        console.log('✅ Token received, verifying with backend...');

        // Call the handleGoogleCallback function from AuthContext
        const result = await handleGoogleCallback(token);

        if (result.success) {
          console.log('✅ Google login successful, redirecting to home...');
          setProcessing(false);
          navigate('/', { replace: true });
        } else {
          console.error('❌ Google login verification failed:', result.error);
          setErrorMessage(result.error || 'Authentication failed');
          setProcessing(false);
          
          setTimeout(() => {
            navigate('/login', {
              state: { error: result.error || 'Authentication failed' },
            });
          }, 2000);
        }
      } catch (error) {
        console.error('❌ Unexpected error in GoogleCallback:', error);
        setErrorMessage('An unexpected error occurred');
        setProcessing(false);
        
        setTimeout(() => {
          navigate('/login', {
            state: { error: 'An unexpected error occurred during authentication' },
          });
        }, 2000);
      }
    };

    processCallback();
  }, [searchParams, navigate, handleGoogleCallback]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="loading-spinner">
          {processing ? (
            <p>Completing Google sign-in...</p>
          ) : errorMessage ? (
            <div>
              <p style={{ color: '#e74c3c' }}>❌ {errorMessage}</p>
              <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>
                Redirecting to login...
              </p>
            </div>
          ) : (
            <p>Success! Redirecting...</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoogleCallback;