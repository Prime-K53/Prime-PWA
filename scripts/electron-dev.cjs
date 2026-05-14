const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const frontendCommand = process.platform === 'win32' ? 'npm' : 'npm';
const electronLauncher = (() => {
  if (process.platform === 'win32') {
    const binShim = path.join(rootDir, 'node_modules', '.bin', 'electron.cmd');
    if (fs.existsSync(binShim)) {
      return { command: binShim, args: ['.'], shell: true };
    }

    return {
      command: process.execPath,
      args: [path.join(rootDir, 'node_modules', 'electron', 'cli.js'), '.'],
      shell: false,
    };
  }

  const binShim = path.join(rootDir, 'node_modules', '.bin', 'electron');
  if (fs.existsSync(binShim)) {
    return { command: binShim, args: ['.'], shell: false };
  }

  return {
    command: process.execPath,
    args: [path.join(rootDir, 'node_modules', 'electron', 'cli.js'), '.'],
    shell: false,
  };
})();

let frontendProcess = null;
let electronProcess = null;
let shuttingDown = false;

const closeAll = (code = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (electronProcess) {
    try { electronProcess.kill(); } catch {}
  }

  if (frontendProcess) {
    try { frontendProcess.kill(); } catch {}
  }

  process.exit(code);
};

const waitForFrontend = (url, timeoutMs = 60000) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(probe, 500);
      });

      req.setTimeout(5000, () => req.destroy(new Error('Frontend probe timeout')));
    };

    probe();
  });

frontendProcess = spawn(frontendCommand, ['--prefix', 'frontend', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true,
});

frontendProcess.on('exit', (code) => {
  if (!shuttingDown) {
    console.error(`Frontend dev server exited early with code ${code}`);
    closeAll(code || 1);
  }
});

waitForFrontend('http://127.0.0.1:5173')
  .then(() => {
    const electronEnv = { ...process.env };
    delete electronEnv.ELECTRON_RUN_AS_NODE;

    electronProcess = spawn(electronLauncher.command, electronLauncher.args, {
      cwd: rootDir,
      env: {
        ...electronEnv,
        PRIME_ELECTRON_RENDERER_MODE: 'dev-server',
      },
      stdio: 'inherit',
      shell: electronLauncher.shell,
    });

    electronProcess.on('exit', (code) => closeAll(code || 0));
    electronProcess.on('error', (error) => {
      console.error('Failed to launch Electron:', error.message);
      closeAll(1);
    });
  })
  .catch((error) => {
    console.error(error.message);
    closeAll(1);
  });

process.on('SIGINT', () => closeAll(0));
process.on('SIGTERM', () => closeAll(0));
