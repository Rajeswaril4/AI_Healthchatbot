import React, { createContext, useState, useContext, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'light';
  });

  const [backgroundVisible, setBackgroundVisible] = useState(() => {
    return localStorage.getItem('bgImage') === 'on';
  });

  useEffect(() => {
    document.body.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('bgImage', backgroundVisible ? 'on' : 'off');
  }, [backgroundVisible]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const toggleBackground = () => {
    setBackgroundVisible((prev) => !prev);
  };

  const value = {
    theme,
    toggleTheme,
    backgroundVisible,
    toggleBackground,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export default ThemeContext;