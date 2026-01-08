import React from 'react';
import { useTheme } from '../context/ThemeContext';

const BackgroundToggle = () => {
  const { backgroundVisible, toggleBackground } = useTheme();

  return (
    <button
      onClick={toggleBackground}
      className="theme-btn"
      aria-label={`${backgroundVisible ? 'Hide' : 'Show'} background image`}
      title={`${backgroundVisible ? 'Hide' : 'Show'} background`}>
    </button>
  );
};

export default BackgroundToggle;