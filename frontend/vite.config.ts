import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const normalizeBase = (value: string) => String(value || '').trim().replace(/\/+$/, '');
const stripApiSuffix = (value: string) => normalizeBase(value).replace(/\/api$/i, '');

/**
 * Vite plugin: inline binary font files (TTF/WOFF/WOFF2) as base64 data URIs.
 * This guarantees fonts are embedded in the JS bundle and never fetched at
 * runtime — critical for Electron's offline production environment where
 * fetch() cannot access file:// asset paths inside the asar archive.
 */
const inlineFontsPlugin = (): Plugin => ({
  name: 'prime-inline-fonts',
  enforce: 'pre',
  load(id: string) {
    if (!/\.(ttf|woff|woff2)$/.test(id)) return;
    const mimeMap: Record<string, string> = {
      ttf: 'font/truetype',
      woff: 'font/woff',
      woff2: 'font/woff2',
    };
    const ext = id.split('.').pop()!;
    const mime = mimeMap[ext] ?? 'font/truetype';
    try {
      const bytes = fs.readFileSync(id);
      const b64 = bytes.toString('base64');
      // Export as a data URI string — @react-pdf/renderer calls .split() on src,
      // so it MUST be a string. Data URIs are fetched by the browser fetch API
      // without any file-system access, making them safe in all environments.
      return `export default 'data:${mime};base64,${b64}'`;
    } catch {
      return null; // let Vite handle it normally if reading fails
    }
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const apiProxyTarget =
      stripApiSuffix(env.VITE_API_PROXY_TARGET || '') ||
      stripApiSuffix(env.VITE_API_URL || '') ||
      'http://localhost:3000';
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        headers: {
          'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* data: blob: prime-pdf:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* data: blob:; frame-src 'self' blob: data: prime-pdf: http://127.0.0.1:* http://localhost:*; object-src 'self' blob: data: prime-pdf:; worker-src 'self' blob:; child-src 'self' blob:; font-src 'self' data: blob:;"
        },
        proxy: mode === 'development' ? {
          '/api': {
            target: apiProxyTarget,
            changeOrigin: true,
            secure: apiProxyTarget.startsWith('https://'),
            bypass: (req) => {
              if (req.headers.accept?.includes('text/html')) {
                return null;
              }
            }
          }
        } : {}
      },
      plugins: [react(), inlineFontsPlugin(), VitePWA({
        registerType: 'autoUpdate',
        injectRegister: false,
        includeAssets: ['favicon.ico', 'pwa-icon-*.png'],
          manifest: {
          id: '/',
          short_name: 'PrimeERP',
          name: 'Prime ERP System',
          description: 'Prime ERP - Enterprise Resource Planning System',
          icons: [
            { src: './pwa-icon-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: './pwa-icon-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: './pwa-icon-192x192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: './pwa-icon-512x512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
          start_url: '.',
          display: 'standalone',
          orientation: 'any',
          theme_color: '#2563eb',
          background_color: '#f8fafc',
          categories: ['business', 'productivity'],
          lang: 'en',
          scope: '.',
          screenshots: [
            { src: './screenshot-dashboard.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Prime ERP Dashboard' },
            { src: './screenshot-mobile.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Prime ERP Mobile' },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
          navigateFallback: '/index.html',
          navigateFallbackAllowlist: [/^(?!\/api\/|\/__).*/],
          runtimeCaching: [
            {
              urlPattern: /^https?:\/\/.*\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-cache',
                expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
                networkTimeoutSeconds: 5,
                backgroundSync: {
                  name: 'api-sync-queue',
                  options: {
                    maxRetentionTime: 24 * 60,
                  },
                },
              },
            },
            {
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'font-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
            {
              urlPattern: /^https?:\/\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'external-cache',
                expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 },
              },
            },
          ],
        },
      })],
      optimizeDeps: {
        include: [
          'recharts',
          'lucide-react',
          'react-router-dom',
          'idb',
          'date-fns',
          '@react-pdf/renderer',
          'zustand',
        ],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        // Don't hardcode API URL in production - let runtime config (Electron) take precedence
        'process.env.VITE_API_URL': mode === 'development' ? JSON.stringify(env.VITE_API_URL || 'http://localhost:3000') : '""',
        'process.env.API_BASE_URL': mode === 'development' ? JSON.stringify(env.VITE_API_URL || 'http://localhost:3000') : '""',
      },
      resolve: {
        alias: [
          { find: '@', replacement: path.resolve(__dirname, '.') },
          { find: /^zustand$/, replacement: path.resolve(__dirname, 'node_modules/zustand/index.js') },
        ]
      },
      base: './',
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: false,
        rollupOptions: {
          // Rollup 4.40+ has overly strict static ESM export analysis that raises
          // false-positive "X is not exported by Y" errors for packages that use
          // `export * from './sub-module'` re-export patterns (dequal, fontkit,
          // zustand, etc.). shimMissingExports suppresses the error and lets the
          // runtime resolve the export correctly (as it always could).
          shimMissingExports: true,
        }
      }
    };
});
