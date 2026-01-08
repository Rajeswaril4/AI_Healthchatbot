import React from 'react';

const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <div className="loading-container">
      <div className="loading-spinner">
        <p>{message}</p>
      </div>
    </div>
  );
};

export default LoadingSpinner;