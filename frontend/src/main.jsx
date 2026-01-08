import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/App.css'

console.log('Main.jsx loaded');
console.log('Root element:', document.getElementById('root'));

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
  console.log('React app rendered');
} else {
  console.error('Root element not found!');
}
