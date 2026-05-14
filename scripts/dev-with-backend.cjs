const net = require('net');
const { spawn } = require('child_process');

const BACKEND_PORT = Number(process.env.BACKEND_PORT || process.env.PORT || 5002);
const npmCommand = process.platform === 'win32' ? 'npm' : 'npm';
const npmExecPath = process.env.npm_execpath;

const isPortListening = (port, host = '127.0.0.1') => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    socket.setTimeout(800);
    socket.once('connect', () => {
      socket.destroy();
      finish(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      finish(false);
    });
    socket.once('error', () => {
      finish(false);
    });

    socket.connect(port, host);
  });
};

const children = [];
let shuttingDown = false;

const shutdown = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (child && !child.killed) {
      try {
        child.kill();
      } catch {
        // Ignore shutdown kill errors.
      }
    }
  }

  setTimeout(() => process.exit(code), 150);
};

const wireChild = (child, name) => {
  children.push(child);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const normalizedCode = typeof code === 'number' ? code : (signal ? 1 : 0);
    console.log(`[dev] ${name} exited (code=${String(code)}, signal=${String(signal)})`);
    shutdown(normalizedCode);
  });
};

const main = async () => {
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  const backendAlreadyRunning = await isPortListening(BACKEND_PORT);
  if (backendAlreadyRunning) {
    console.log(`[dev] Backend already running on port ${BACKEND_PORT}.`);
  } else {
    console.log(`[dev] Starting backend on port ${BACKEND_PORT}...`);
    const backend = spawn('node', ['server/index.cjs'], {
      stdio: 'inherit',
      shell: false
    });
    wireChild(backend, 'backend');
  }

  console.log('[dev] Starting Vite frontend...');
  const frontend = npmExecPath
    ? spawn(process.execPath, [npmExecPath, 'run', 'dev:ui'], {
      stdio: 'inherit',
      shell: false
    })
    : spawn(npmCommand, ['run', 'dev:ui'], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });
  wireChild(frontend, 'frontend');
};

main().catch((error) => {
  console.error('[dev] Failed to start development stack:', error);
  shutdown(1);
});
