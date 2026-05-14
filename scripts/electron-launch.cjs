const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

const electronLauncher = (() => {
  if (process.platform === 'win32') {
    const binShim = path.join(rootDir, 'node_modules', '.bin', 'electron.cmd');
    if (fs.existsSync(binShim)) {
      return { command: `"${binShim}"`, args: ['.'], shell: true };
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

const electronEnv = { ...process.env };
delete electronEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronLauncher.command, electronLauncher.args, {
  cwd: rootDir,
  env: {
    ...electronEnv,
    PRIME_ELECTRON_RENDERER_MODE: 'dist',
  },
  stdio: 'inherit',
  shell: electronLauncher.shell,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (error) => {
  console.error('Failed to launch Electron:', error.message);
  process.exit(1);
});
