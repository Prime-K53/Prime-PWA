import React from 'react';
import ReactDOM from 'react-dom/client';
import { Buffer } from 'buffer';

if (typeof window !== 'undefined') {
  window.Buffer = Buffer;
}

if (typeof window !== 'undefined' && typeof (window as any).module === 'undefined') {
  try {
    (window as any).module = { exports: {} };
  } catch (e) {
    // ignore - non-critical
  }
}

import './index.css';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then((registration) => {
        if (registration.installing) {
          console.log('[PWA] Service worker installing');
        } else if (registration.waiting) {
          console.log('[PWA] Service worker installed, awaiting activation');
        } else if (registration.active) {
          console.log('[PWA] Service worker active');
        }
      })
      .catch((error) => {
        if (error.name === 'InvalidStateError') {
          console.info('[PWA] Service Worker registration skipped (document state not supported)');
        } else if (error.name === 'SecurityError') {
          console.info('[PWA] Service Worker registration skipped (insecure context)');
        } else {
          console.warn('[PWA] Service Worker registration failed:', error.message);
        }
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
