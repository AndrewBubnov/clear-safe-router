import React from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './playground/index.css';
import './playground/playground.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
