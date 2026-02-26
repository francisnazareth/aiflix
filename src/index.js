import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';
import { initApiConfig } from './api';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Load runtime API config before rendering the app
initApiConfig().then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
);
