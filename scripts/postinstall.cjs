
const { spawnSync } = require('child_process');
const path = require('path');

/**
 * Smart postinstall script for Prime ERP Workspace
 * 
 * This script runs 'npm install' in the backend directory
 * UNLESS we are in a Netlify build environment (where the backend
 * is not needed and often fails due to native compilation requirements).
 */

console.log('--- Prime ERP Workspace Post-Install ---');

const runInstall = (targetDir, label) => {
  console.log(`Installing ${label} dependencies via --prefix ${targetDir}...`);

  const result = spawnSync('npm', ['install'], {
    stdio: 'inherit',
    shell: true,
    cwd: path.resolve(__dirname, '..', targetDir)
  });

  if (result.status !== 0) {
    console.error(`${label} installation failed with status:`, result.status);
    process.exit(result.status || 1);
  }

  console.log(`${label} dependencies installed successfully.`);
};

const isNetlify = process.env.NETLIFY === 'true' || process.env.IS_NETLIFY === 'true';

if (isNetlify) {
  console.log('Netlify environment detected. Skipping backend dependency installation.');
} else {
  runInstall('backend', 'backend');
}

runInstall('frontend', 'frontend');
