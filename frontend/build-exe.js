#!/usr/bin/env node

/**
 * Build script to create an executable installer for Prime ERP System
 * This script uses electron-builder to package the app into an installable .exe
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;

console.log('🔨 Prime ERP System - Building Executable Installer\n');

// Step 1: Build the Vite frontend
console.log('📦 Step 1: Building frontend with Vite...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: projectRoot });
  console.log('✅ Frontend build complete\n');
} catch (error) {
  console.error('❌ Frontend build failed:', error.message);
  process.exit(1);
}

// Step 2: Create dist-electron directory if it doesn't exist
console.log('📂 Step 2: Preparing output directory...');
const distElectronDir = path.join(projectRoot, 'dist-electron');
if (!fs.existsSync(distElectronDir)) {
  fs.mkdirSync(distElectronDir, { recursive: true });
}
console.log('✅ Output directory ready\n');

// Step 3: Build executable with electron-builder
console.log('🚀 Step 3: Building executable with electron-builder...');
try {
  execSync('electron-builder --publish never', { 
    stdio: 'inherit', 
    cwd: projectRoot,
    env: { ...process.env, ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true' }
  });
  console.log('✅ Executable build complete\n');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  console.error('\nNote: Make sure electron and electron-builder are installed:');
  console.error('  npm install electron-builder --no-optional');
  process.exit(1);
}

// Step 4: Report results
console.log('✨ Build Complete!\n');
console.log('📍 Installers location: ' + distElectronDir);
console.log('\n📝 Files created:');
console.log('   - PrimeERP-Setup.exe (NSIS installer)');
console.log('   - PrimeERP.exe (portable executable)\n');
console.log('🎉 You can now distribute the .exe files to users!\n');
