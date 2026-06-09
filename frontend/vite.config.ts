import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

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
      return `export default 'data:${mime};base64,${b64}'`;
    } catch {
      return null;
    }
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const isDev = mode === 'development';

    return {
      server: {
        port: 5173,
        host: '127.0.0.1',
        https: true,
        allowedHosts: ['127.0.0.1', 'localhost'],
        headers: {
          'Content-Security-Policy': "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:* data: blob: prime-pdf: https://*.supabase.co wss://*.supabase.co; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:* ws://127.0.0.1:* ws://localhost:* wss://127.0.0.1:* wss://localhost:* data: blob: https://*.supabase.co wss://*.supabase.co https://openrouter.ai https://open.bigmodel.cn https://api.openai.com https://api.opencode.ai; frame-src 'self' blob: data: prime-pdf: http://127.0.0.1:* http://localhost:* https://127.0.0.1:* https://localhost:*; object-src 'self' blob: data: prime-pdf:; worker-src 'self' blob:; child-src 'self' blob:; font-src 'self' data: blob:;"
        }
      },
      plugins: [basicSsl(), react(), inlineFontsPlugin()],
      optimizeDeps: {
        include: [
          'recharts',
          'lucide-react',
          'react-router-dom',
          'idb',
          'date-fns',
          '@react-pdf/renderer',
          'zustand',
          'dexie',
        ],
        exclude: [],
      },
      define: {
        'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY),
        'process.env.VITE_AI_PROVIDER': JSON.stringify(env.VITE_AI_PROVIDER),
        'process.env.VITE_OPENROUTER_API_KEY': JSON.stringify(env.VITE_OPENROUTER_API_KEY),
        'process.env.VITE_OPENROUTER_MODEL': JSON.stringify(env.VITE_OPENROUTER_MODEL),
      },
      esbuild: {
        drop: mode === 'production' ? ['console'] : [],
      },
      resolve: {
        dedupe: ['react', 'react-dom', 'dexie'],
        alias: [
          { find: '@', replacement: path.resolve(__dirname, '.') },
        ]
      },
      base: env.VITE_BASE_URL || './',
      build: {
        outDir: 'dist',
        emptyOutDir: true,
        manifest: 'asset-manifest.json',
        sourcemap: false,
        rollupOptions: {
          shimMissingExports: true,
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              vendor: ['date-fns', 'zustand', 'idb', 'dexie'],
            }
          }
        }
      }
    };
});
