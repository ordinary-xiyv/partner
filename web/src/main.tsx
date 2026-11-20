import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@lynx/shared';
import { ThemeProvider, onUnauthorized } from '@lynx/shared';
import App from './App';

onUnauthorized(() => {
  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider locale="zh">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);
