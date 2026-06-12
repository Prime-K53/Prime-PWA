const { execSync } = require('child_process');
const path = require('path');

const REQUIRED_NODE_VERSION = '20.18.0';

function checkNode() {
  try {
    const version = execSync('node --version', { encoding: 'utf8' }).trim();
    console.log(`  Node.js version: ${version}`);

    const fullVersion = version.replace(/^v/, '');
    const [major, minor, patch] = fullVersion.split('.').map(Number);
    const [reqMajor, reqMinor, reqPatch] = REQUIRED_NODE_VERSION.split('.').map(Number);

    if (
      major < reqMajor ||
      (major === reqMajor && minor < reqMinor) ||
      (major === reqMajor && minor === reqMinor && patch < reqPatch)
    ) {
      console.error(`  ERROR: Node.js ${REQUIRED_NODE_VERSION}+ required, found ${fullVersion}`);
      process.exit(1);
    }
  } catch {
    console.error('  ERROR: Node.js is not installed or not accessible via PATH.');
    console.error('  Install Node.js from https://nodejs.org/ (LTS recommended).');
    process.exit(1);
  }
}

function checkRegistry() {
  try {
    const registry = execSync('npm config get registry', { encoding: 'utf8' }).trim();
    if (!registry.startsWith('https://')) {
      console.warn(`  WARNING: npm registry does not use HTTPS: ${registry}`);
      console.warn('  Run: npm config set registry https://registry.npmjs.org/');
    } else {
      console.log(`  npm registry: ${registry}`);
    }
  } catch {
    console.warn('  Could not verify npm registry configuration.');
  }
}

console.log('');
console.log('--- Prime ERP Workspace Post-Install ---');
console.log('');

console.log('  Workspace root:', path.resolve(__dirname, '..'));
console.log('  Workspaces: frontend/, backend/');
console.log('');

checkNode();
checkRegistry();

console.log('');
console.log('  All dependencies installed successfully via npm workspaces.');
console.log('  Run "npm run dev" to start the development servers.');
console.log('');
