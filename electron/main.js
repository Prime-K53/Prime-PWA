const { app, BrowserWindow, Menu, dialog, ipcMain, globalShortcut, protocol, shell, net: electronNet } = require('electron');

// Register custom protocols as privileged
protocol.registerSchemesAsPrivileged([
  { 
    scheme: 'prime-pdf', 
    privileges: { 
      standard: true, 
      secure: true, 
      stream: true, 
      supportFetchAPI: true, 
      bypassCSP: false,
      allowServiceWorkers: false
    } 
  },
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: false,
      allowServiceWorkers: true,
    }
  }
]);

const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { spawn } = require('child_process');

const isDev = !app.isPackaged;

let mainWindow = null;
let backendProcess = null;
let backendOrigin = '';
let backendStopInProgress = false;

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

const getUserDataPath = () => app.getPath('userData');
const getLogDir = () => ensureDir(path.join(getUserDataPath(), 'logs'));

const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per log file

/**
 * Write a log entry to a specific log file with rotation
 * @param {string} fileName - Log file name (main.log, backend.log, renderer.log)
 * @param {string} level - Log level (INFO, WARN, ERROR)
 * @param {string} message - Log message
 * @param {object} [extra] - Additional data to stringify
 */
const writeLog = (fileName, level, message, extra) => {
  const logFile = path.join(getLogDir(), fileName);
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`;

  try {
    // Log rotation: rotate if file exceeds max size
    if (fs.existsSync(logFile)) {
      const stats = fs.statSync(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        // Keep up to 2 old files
        const oldFile = `${logFile}.old`;
        if (fs.existsSync(oldFile)) {
          fs.unlinkSync(oldFile);
        }
        fs.renameSync(logFile, oldFile);
      }
    }
    fs.appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    console.error(`[Electron] Failed to write ${fileName}`, error);
  }

  // Also output to console for debugging with clear prefixes
  const consolePrefixMap = {
    'main.log': '[ELECTRON]',
    'backend.log': '[BACKEND]',
    'renderer.log': '[FRONTEND]'
  };
  const prefix = consolePrefixMap[fileName] || '[SYSTEM]';
  console.log(`${prefix} ${line}`);
};

/**
 * Specialized logging functions for each log category
 */
const log = {
  main: (level, message, extra) => writeLog('main.log', level, message, extra),
  backend: (level, message, extra) => writeLog('backend.log', level, message, extra),
  renderer: (level, message, extra) => writeLog('renderer.log', level, message, extra),
};

// Convenience methods
const appendLog = (scope, message, extra) => {
  // Map scope to appropriate log file and level
  if (scope.startsWith('backend') || scope === 'startup') {
    log.backend('INFO', message, extra);
  } else if (scope === 'renderer') {
    log.renderer('INFO', message, extra);
  } else {
    log.main('INFO', message, extra);
  }
};

const getBackendRoot = () =>
  isDev
    ? path.join(__dirname, '..', 'backend')
    : path.join(__dirname, '..', '..', 'backend');

const getFrontendEntry = () => {
  if (!isDev) {
    return 'app://./index.html';
  }

  if (process.env.PRIME_ELECTRON_RENDERER_MODE === 'dist') {
    return 'app://./index.html';
  }

  return 'http://127.0.0.1:5173';
};

const getIconPath = () => path.join(__dirname, 'Icon.ico');

const getBackendRuntimePaths = () => {
  const storageDir = ensureDir(path.join(getUserDataPath(), 'backend'));
  const workspaceConfigPath = path.join(storageDir, 'workspace.json');
  
  // Check workspace config for dynamic dbPath (same logic as runtimePaths.cjs)
  let dbPath = path.join(storageDir, 'database.db');
  try {
    if (fs.existsSync(workspaceConfigPath)) {
      const config = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8'));
      if (config.dbPath) {
        dbPath = config.dbPath;
      }
    }
  } catch (e) {
    // Ignore parse errors, use default
  }
  
  return {
    storageDir,
    backupDir: ensureDir(path.join(storageDir, 'backups')),
    tempDir: ensureDir(path.join(storageDir, 'temp')),
    secureKeysDir: ensureDir(path.join(storageDir, 'secure', 'keys')),
    dbPath,
    workspaceConfigPath,
    licensePath: path.join(storageDir, 'license.json'),
  };
};

const isSafeWindowTarget = (targetUrl) => {
  if (!targetUrl) return true;
  if (targetUrl === 'about:blank') return true;
  if (targetUrl.startsWith('file://')) return true;
  if (targetUrl.startsWith('app://')) return true;
  if (targetUrl.startsWith('data:')) return true;
  if (targetUrl.startsWith('blob:')) return true;
  if (isDev && targetUrl.startsWith('http://127.0.0.1:5173')) return true;
  if (targetUrl.startsWith(backendOrigin)) return true;
  return false;
};

const showBlockedExternalMessage = (targetUrl) => {
  appendLog('shell', 'Blocked external navigation in offline desktop mode', { url: targetUrl });

  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Offline Desktop Mode',
      message: 'External internet links are disabled in this offline desktop build.',
      detail: targetUrl,
    }).catch(() => {});
  }
};

const findAvailablePort = (startPort = 39300, maxPort = 39450) =>
  new Promise((resolve, reject) => {
    const tryPort = (port) => {
      if (port > maxPort) {
        reject(new Error(`No free port found between ${startPort} and ${maxPort}`));
        return;
      }

      const server = net.createServer();
      server.once('error', () => tryPort(port + 1));
      server.once('listening', () => {
        server.close(() => resolve(port));
      });
      server.listen(port, '127.0.0.1');
    };

    tryPort(startPort);
  });

const waitForBackend = async (origin) => {
  const MAX_RETRIES = 60; // 60 attempts * 500ms = 30 seconds
  const RETRY_DELAY_MS = 500;
  const healthUrl = `${origin}/health`;

  appendLog('backend', 'Starting backend health check loop', { origin, maxAttempts: MAX_RETRIES });

  for (let attempts = 1; attempts <= MAX_RETRIES; attempts++) {
    try {
      appendLog('backend', `Health check attempt ${attempts}/${MAX_RETRIES}`, { url: healthUrl });
      
      // Use global fetch with a timeout
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        appendLog('backend', `Backend is ready after ${attempts} attempt(s)`, { url: healthUrl });
        return; // Success
      }
      
      appendLog('backend', `Health check returned ${response.status}, retrying...`);
    } catch (err) {
      appendLog('backend', `Health check error: ${err.name === 'TimeoutError' ? 'Timeout' : err.message}`, { attempt: attempts });
    }

    if (attempts < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  throw new Error(`Failed to connect to backend after ${MAX_RETRIES} attempts (~30 seconds)`);
};

const stopBackend = (reason = 'explicit') => {
  if (!backendProcess) {
    backendStopInProgress = false;
    appendLog('backend', 'Stop requested but no backend process running', { reason });
    return;
  }

  if (backendStopInProgress) {
    appendLog('backend', 'Backend stop already in progress', { reason, pid: backendProcess.pid });
    return;
  }

  backendStopInProgress = true;

  appendLog('backend', 'Stopping backend process', { reason });

  // Remove listeners to prevent duplicate exit handling
  backendProcess.removeAllListeners('exit');

  // Kill the process with SIGTERM first, then force kill if needed
  const killProcess = (force = false) => {
    if (!backendProcess || backendProcess.killed) {
      appendLog('backend', 'Backend already terminated');
      return;
    }

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    appendLog('backend', `Sending ${signal} to backend process`, { pid: backendProcess.pid });

    try {
      process.kill(backendProcess.pid, signal);
    } catch (err) {
      appendLog('backend', 'Failed to send signal to backend', { error: err.message });
    }
  };

  // Handle the exit once
  backendProcess.once('exit', (code, signal) => {
    clearTimeout(forceKillTimeout);
    const exitInfo = {
      code,
      signal,
      reason,
      pid: backendProcess.pid,
    };

    if (backendStopInProgress || code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') {
      appendLog('backend', 'Backend process terminated cleanly', exitInfo);
    } else {
      appendLog('backend', 'Backend process terminated unexpectedly', exitInfo);
    }

    backendProcess = null;
    backendStopInProgress = false;
  });

  // Set a timeout to force kill if it doesn't terminate gracefully
  const forceKillTimeout = setTimeout(() => {
    if (backendProcess && backendProcess.exitCode === null) {
      appendLog('backend', 'Backend did not terminate gracefully, forcing kill');
      killProcess(true);
    }
  }, 3000);

  // Try graceful termination after the exit handler is attached to avoid missing a fast exit.
  killProcess(false);
};

const startBackend = async () => {
  const backendRoot = getBackendRoot();
  const backendEntry = path.join(backendRoot, 'index.cjs');

  if (!fs.existsSync(backendEntry)) {
    throw new Error(`Backend entry not found at ${backendEntry}`);
  }

  // Find an available port, defaulting to 3000 but auto-incrementing if taken
  const port = await findAvailablePort(3000, 3100);
  const runtimePaths = getBackendRuntimePaths();

  backendOrigin = `http://127.0.0.1:${port}`;

  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    NODE_ENV: isDev ? 'development' : 'production',
    PRIME_ERP_DESKTOP: 'true',
    PRIME_ERP_BACKEND_PORT: String(port),
    PORT: String(port),
    PRIME_ERP_STORAGE_DIR: runtimePaths.storageDir,
    PRIME_ERP_BACKUP_DIR: runtimePaths.backupDir,
    PRIME_ERP_TEMP_DIR: runtimePaths.tempDir,
    PRIME_ERP_SECURE_KEYS_DIR: runtimePaths.secureKeysDir,
    PRIME_ERP_WORKSPACE_CONFIG: runtimePaths.workspaceConfigPath,
    PRIME_ERP_LICENSE_PATH: runtimePaths.licensePath,
    DB_PATH: runtimePaths.dbPath,
  };

  appendLog('backend', 'Starting backend process', {
    backendEntry,
    port,
    dbPath: runtimePaths.dbPath,
  });
  backendStopInProgress = false;

  backendProcess = spawn(process.execPath, [backendEntry], {
    cwd: backendRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  backendProcess.stdout?.on('data', (chunk) => {
    const msg = String(chunk).trim();
    if (msg) log.backend('INFO', msg);
  });

  backendProcess.stderr?.on('data', (chunk) => {
    const msg = String(chunk).trim();
    if (msg) log.backend('WARN', msg);
  });

  backendProcess.on('exit', (code, signal) => {
    const exitInfo = { code, signal, pid: backendProcess?.pid };
    
    // Log exit event with appropriate severity
    if (code === 0) {
      log.backend('INFO', 'Backend process exited normally', exitInfo);
    } else if (signal) {
      log.backend('WARN', `Backend process terminated by signal`, exitInfo);
    } else {
      log.backend('ERROR', 'Backend process crashed or was killed', exitInfo);
    }
    
    backendProcess = null;

    // If backend crashes unexpectedly during normal operation, log and warn user
    if (mainWindow && !mainWindow.isDestroyed()) {
      log.backend('ERROR', 'Backend unavailable - application may not function correctly');
    }
  });

  backendProcess.on('error', (error) => {
    log.backend('ERROR', 'Backend process failed to start', { message: error.message });
  });

  await waitForBackend(backendOrigin);
  appendLog('backend', 'Backend is healthy', { origin: backendOrigin });
};

const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit', label: 'Exit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

const createWindow = async () => {
  const additionalArguments = [
    `--prime-backend-origin=${backendOrigin}`,
    `--prime-offline-mode=true`,
    `--prime-app-version=${app.getVersion()}`,
    `--prime-user-data=${encodeURIComponent(getUserDataPath())}`,
  ];

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    backgroundColor: '#f3f0ec',
    icon: getIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true,
      pdfViewer: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments,
    },
  });

  // Security: Implement Content-Security-Policy
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const CSP = isDev
      ? "default-src * 'unsafe-inline' 'unsafe-eval' data: blob: file: prime-pdf: app:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline'; img-src * data: blob: file: prime-pdf: app:; connect-src * data: blob: file:; frame-src * blob: data: file: prime-pdf: app:; object-src * blob: data: file: prime-pdf: app:; worker-src 'self' blob: file: app:; child-src 'self' blob: file: app:;"
      : "default-src 'self' file: prime-pdf: app:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: file: prime-pdf: app:; connect-src 'self' http://127.0.0.1:* http://localhost:* ws://127.0.0.1:* ws://localhost:* data: blob: file: app:; frame-src 'self' blob: data: file: prime-pdf: http://127.0.0.1:* http://localhost:* app:; object-src 'self' blob: data: file: prime-pdf: app:; worker-src 'self' blob: file: app:; child-src 'self' blob: file: app:; font-src 'self' data: blob: file: app:;";
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP]
      }
    });
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeWindowTarget(url)) {
      return { action: 'allow' };
    }

    showBlockedExternalMessage(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isSafeWindowTarget(url)) {
      event.preventDefault();
      showBlockedExternalMessage(url);
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const frontendEntry = getFrontendEntry();
  const isDevHttp = isDev && frontendEntry.startsWith('http');

  if (isDevHttp) {
    await mainWindow.loadURL(`${frontendEntry}?backend=${encodeURIComponent(backendOrigin)}`);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const queryString = `backend=${encodeURIComponent(backendOrigin)}`;
    const separator = frontendEntry.includes('?') ? '&' : '?';
    await mainWindow.loadURL(`${frontendEntry}${separator}${queryString}`);
  }
};

ipcMain.on('renderer-log', (_event, payload) => {
  appendLog('renderer', payload?.message || 'Renderer log', payload);
});

ipcMain.handle('desktop:get-runtime', () => ({
  appVersion: app.getVersion(),
  backendUrl: backendOrigin,
  isElectron: true,
  offlineMode: true,
  userDataPath: getUserDataPath(),
}));

// PDF file reading IPC handler for Electron-safe PDF loading
ipcMain.handle('desktop:read-pdf-file', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { error: 'Invalid file path', success: false };
    }

    // SECURITY: Restrict to userData paths only
    const resolved = path.resolve(filePath);
    const userData = path.resolve(getUserDataPath());
    if (!resolved.startsWith(userData)) {
      log.main('WARN', 'Blocked read access outside userData', { path: resolved });
      return { error: 'Access denied', success: false };
    }

    if (!fs.existsSync(resolved)) {
      log.main('ERROR', 'PDF file not found', { path: resolved });
      return { error: 'File not found', success: false };
    }

    const buffer = fs.readFileSync(resolved);
    const data = Array.from(new Uint8Array(buffer));

    log.main('INFO', 'PDF file read', { path: resolved, size: buffer.length });

    return { success: true, data, size: buffer.length, path: resolved };
  } catch (error) {
    log.main('ERROR', 'Failed to read PDF file', { error: error.message });
    return { error: error.message, success: false };
  }
});

// Write blob to temporary file and return path
ipcMain.handle('desktop:write-temp-pdf', async (_event, arrayBuffer, filename) => {
  try {
    const safeName = String(filename || `pv_${Date.now()}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const tempDir = path.join(getUserDataPath(), 'temp');
    ensureDir(tempDir);

    const tempFilePath = path.join(tempDir, safeName);
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(tempFilePath, buffer);
    log.main('INFO', 'Temp PDF written', { path: tempFilePath, bytes: buffer.length });

    return { success: true, path: tempFilePath };
  } catch (error) {
    log.main('ERROR', 'Failed to write temp PDF', { error: error.message });
    return { error: error.message, success: false };
  }
});

// Clean up temporary PDF file
ipcMain.handle('desktop:cleanup-temp-pdf', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid file path' };
    }
    const resolved = path.resolve(filePath);
    const tempDir = path.resolve(path.join(getUserDataPath(), 'temp'));
    if (!resolved.startsWith(tempDir)) {
      log.main('WARN', 'Blocked cleanup outside temp dir', { path: resolved });
      return { success: false, error: 'Permission denied' };
    }
    if (fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
      log.main('INFO', 'Temp PDF cleaned up', { path: resolved });
    }
    return { success: true };
  } catch (error) {
    log.main('ERROR', 'Failed to cleanup temp PDF', { error: error.message });
    return { error: error.message, success: false };
  }
});

// Open PDF in system-default PDF viewer
ipcMain.handle('desktop:open-pdf-system', async (_event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Invalid path' };
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      return { success: false, error: 'File not found' };
    }
    await shell.openPath(resolved);
    log.main('INFO', 'Opened PDF in system viewer', { path: resolved });
    return { success: true };
  } catch (error) {
    log.main('ERROR', 'Failed to open PDF in system viewer', { error: error.message });
    return { error: error.message, success: false };
  }
});

// Startup temp cleanup: remove orphaned preview files older than 24 hours
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const cleanupStaleTempFiles = () => {
  const tempDir = path.join(app.getPath('userData'), 'temp');
  if (!fs.existsSync(tempDir)) return;

  let removed = 0;
  let failed = 0;

  try {
    const entries = fs.readdirSync(tempDir);
    const now = Date.now();

    for (const entry of entries) {
      if (!entry.endsWith('.pdf')) continue;
      const fullPath = path.join(tempDir, entry);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs > TEMP_MAX_AGE_MS) {
          fs.unlinkSync(fullPath);
          removed++;
        }
      } catch {
        failed++;
      }
    }

    if (removed > 0 || failed > 0) {
      log.main('INFO', 'Temp cleanup complete', { removed, failed, maxAgeHours: 24 });
    }
  } catch (error) {
    log.main('WARN', 'Temp cleanup error', { error: error.message });
  }
};

// prime-pdf:// custom protocol handler - serves PDFs from temp directory
const TEMP_DIR = path.join(app.getPath('userData'), 'temp');

const registerPdfProtocol = () => {
  try {
    protocol.handle('prime-pdf', async (request) => {
      try {
        const url = new URL(request.url);
        // Normalize path: decode and convert all backslashes to forward slashes
        const decodedPath = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
        const resolvedPath = path.resolve(decodedPath);
        
        // SECURITY: Only allow files within temp directory
        const normalizedTemp = path.resolve(TEMP_DIR).replace(/\\/g, '/');
        const normalizedResolved = resolvedPath.replace(/\\/g, '/');
        
        // Case-insensitive comparison for Windows
        if (!normalizedResolved.toLowerCase().startsWith(normalizedTemp.toLowerCase())) {
          console.warn('[prime-pdf] Blocked access outside temp dir:', resolvedPath);
          return new Response('Forbidden', { status: 403, headers: { 'Content-Type': 'text/plain' } });
        }
        
        if (!fs.existsSync(resolvedPath)) {
          console.warn('[prime-pdf] File not found:', resolvedPath);
          return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
        }
        
        const data = fs.readFileSync(resolvedPath);
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'inline',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (err) {
        console.error('[prime-pdf] Handler error:', err.message);
        return new Response('Error', { status: 500, headers: { 'Content-Type': 'text/plain' } });
      }
    });
    console.log('[Electron] prime-pdf:// protocol registered');
  } catch (error) {
    console.error('[Electron] Failed to register prime-pdf:// protocol:', error.message);
  }
};

// app:// custom protocol handler - serves the frontend from dist directory
const FRONTEND_DIST_DIR = path.join(__dirname, '..', 'frontend', 'dist');

const MIME_MAP = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const registerAppProtocol = () => {
  try {
    protocol.handle('app', async (request) => {
      try {
        let reqPath = new URL(request.url).pathname;
        if (reqPath.startsWith('/')) reqPath = reqPath.slice(1);
        if (!reqPath || reqPath === '') reqPath = 'index.html';

        const filePath = path.join(FRONTEND_DIST_DIR, reqPath);

        if (fs.existsSync(filePath)) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_MAP[ext] || 'application/octet-stream';

          if (process.platform === 'win32') {
            return electronNet.fetch(
              'file:///' + path.resolve(filePath).replace(/\\/g, '/'),
              { method: 'GET' }
            );
          }
          return electronNet.fetch('file://' + path.resolve(filePath), { method: 'GET' });
        }

        // SPA fallback: serve index.html for client-side routes
        const indexPath = path.join(FRONTEND_DIST_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
          const data = fs.readFileSync(indexPath);
          return new Response(data, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
          });
        }

        return new Response('Not Found', { status: 404 });
      } catch {
        return new Response('Internal Server Error', { status: 500 });
      }
    });
    console.log('[Electron] app:// protocol registered');
  } catch (error) {
    console.error('[Electron] Failed to register app:// protocol:', error.message);
  }
};

// PDF generation worker window (hidden, offloads @react-pdf/renderer from main renderer)
let pdfWorkerWindow = null;
const PDF_WORKER_TIMEOUT_MS = 60000;

const createPdfWorkerWindow = async () => {
  try {
    pdfWorkerWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    const frontendEntry = getFrontendEntry();
    const workerUrl = frontendEntry.startsWith('http')
      ? `${frontendEntry}?worker=true`
      : `app://./index.html?worker=true`;

    await pdfWorkerWindow.loadURL(workerUrl);

    // Wait for worker ready signal
    await pdfWorkerWindow.webContents.executeJavaScript(
      `new Promise(r => { if (window.__pdfWorkerReady) r(); else window.addEventListener('pdf-worker-ready', () => r(), { once: true }); })`
    );

    // Self-test: generate real document PDFs to verify the pipeline
    const testResult = await pdfWorkerWindow.webContents.executeJavaScript('__pdfWorkerTest()');
    if (testResult?.success && Array.isArray(testResult.results)) {
      for (const line of testResult.results) {
        log.main('INFO', `Worker test: ${line}`);
      }
    } else {
      log.main('ERROR', 'PDF worker self-test FAILED', { error: testResult?.error });
    }
  } catch (error) {
    log.main('ERROR', 'Failed to create PDF worker window', { error: error.message });
    pdfWorkerWindow = null;
  }
};

// Desktop: generate PDF (offloaded to hidden worker window)
ipcMain.handle('desktop:generate-pdf', async (_event, payload) => {
  if (!pdfWorkerWindow || pdfWorkerWindow.isDestroyed()) {
    log.main('ERROR', 'PDF worker unavailable');
    return { success: false, error: 'PDF worker not available', path: null };
  }

  try {
    const result = await Promise.race([
      pdfWorkerWindow.webContents.executeJavaScript(
        `__pdfWorkerGenerate(${JSON.stringify(payload)})`,
      ),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('PDF generation timed out')), PDF_WORKER_TIMEOUT_MS),
      ),
    ]);

    if (!result || !result.success) {
      log.main('ERROR', 'PDF worker returned error', { error: result?.error, size: result?.size });
      return { success: false, error: result?.error || 'Generation failed', path: null, size: result?.size };
    }

    // Write temp file
    const safeName = `gen_${Date.now()}.pdf`;
    const tempDir = path.join(getUserDataPath(), 'temp');
    ensureDir(tempDir);
    const tempFilePath = path.join(tempDir, safeName);
    fs.writeFileSync(tempFilePath, Buffer.from(result.data));
    log.main('INFO', 'PDF generated via worker', { path: tempFilePath, size: result.size });

    return { success: true, path: tempFilePath, size: result.size };
  } catch (error) {
    log.main('ERROR', 'PDF worker generation failed', { error: error.message });
    return { success: false, error: error.message, path: null };
  }
});

// IPC: Run PDF worker self-test (returns test PDF or error)
ipcMain.handle('desktop:test-pdf-worker', async () => {
  if (!pdfWorkerWindow || pdfWorkerWindow.isDestroyed()) {
    return { success: false, error: 'Worker not available' };
  }
  try {
    const result = await pdfWorkerWindow.webContents.executeJavaScript('__pdfWorkerTest()');
    return result || { success: false, error: 'No result from worker' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

app.whenReady().then(async () => {
  app.setAppUserModelId('com.primeerp.system.workspace');
  app.setName('Prime ERP System');
  cleanupStaleTempFiles();
  createMenu();
  registerPdfProtocol();
  registerAppProtocol();

  // Create PDF worker window in background (don't block startup)
  createPdfWorkerWindow().catch((err) =>
    log.main('ERROR', 'PDF worker creation failed', { error: err.message })
  );

  try {
    await startBackend();
    await createWindow();

    // Register Ctrl+Shift+I global shortcut to open dev tools
    const devToolsShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.webContents.isDevToolsOpened()) {
          mainWindow.webContents.closeDevTools();
        } else {
          mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
      }
    });

    if (!devToolsShortcutRegistered) {
      appendLog('main', 'Failed to register Ctrl+Shift+I dev tools shortcut');
    } else {
      appendLog('main', 'Ctrl+Shift+I dev tools shortcut registered successfully');
    }
  } catch (error) {
    const errorDetails = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };
    log.main('ERROR', 'Desktop startup failed', errorDetails);

    await dialog.showMessageBox({
      type: 'error',
      title: 'Prime ERP System failed to start',
      message: 'The offline desktop services could not start.',
      detail: error instanceof Error ? error.stack || error.message : String(error),
    });

    stopBackend('startup-failed');
    app.quit();
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('before-quit', (event) => {
  appendLog('app', 'App is preparing to quit');
  // Unregister all global shortcuts
  globalShortcut.unregisterAll();
  stopBackend('before-quit');
});

app.on('will-quit', () => {
  appendLog('app', 'App will quit');
  stopBackend('will-quit');
});

app.on('window-all-closed', () => {
  appendLog('app', 'All windows closed');
  stopBackend('window-all-closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle uncaught exceptions in the main process
process.on('uncaughtException', (error) => {
  log.main('ERROR', 'Uncaught exception in main process', {
    message: error.message,
    stack: error.stack,
  });
  stopBackend('uncaught-exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.main('WARN', 'Unhandled promise rejection in main process', {
    reason: String(reason),
  });
});

// Handle OS signals to ensure clean shutdown
const setupSignalHandlers = () => {
  const shutdownSignal = (signal) => {
    appendLog('process', `Received ${signal}, shutting down gracefully`);
    stopBackend(signal);
    // Give the backend time to clean up, then exit
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  // Handle Ctrl+C and terminal close
  if (process.platform !== 'win32') {
    process.on('SIGINT', () => shutdownSignal('SIGINT'));
    process.on('SIGTERM', () => shutdownSignal('SIGTERM'));
  }

  // On Windows, Electron handles these differently
  process.on('exit', (code) => {
    appendLog('process', `Node process exiting with code ${code}`);
    if (backendProcess && !backendProcess.killed) {
      appendLog('process', 'Force killing backend on process exit');
      try {
        process.kill(backendProcess.pid, 'SIGKILL');
      } catch (e) {
        // Ignore - process may already be dead
      }
    }
  });
};

setupSignalHandlers();
