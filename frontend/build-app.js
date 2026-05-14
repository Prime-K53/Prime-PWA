#!/usr/bin/env node

/**
 * Alternative build script that doesn't require Electron preinstalled
 * Uses electron-builder's built-in Electron download capability
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();

console.log('\n' + '='.repeat(60));
console.log('  Prime ERP System - Building Executable Installer');
console.log('='.repeat(60) + '\n');

try {
  // Step 1: Verify Node
  console.log('📋 Step 1: Verifying environment...');
  const nodeVersion = execSync('node --version', { encoding: 'utf8' }).trim();
  console.log(`   ✓ Node.js ${nodeVersion}`);
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
  console.log(`   ✓ npm ${npmVersion}\n`);

  // Step 2: Build frontend
  console.log('🔨 Step 2: Building frontend with Vite...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('   ✓ Frontend build complete\n');

  // Step 3: Prepare output directory
  console.log('📁 Step 3: Preparing output directory...');
  const outDir = path.join(projectRoot, 'dist-electron');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  console.log(`   ✓ Output: ${outDir}\n`);

  // Step 4: Use electron-builder to download Electron automatically
  console.log('🚀 Step 4: Running electron-builder...');
  console.log('   (This will download Electron if not present)\n');
  
  execSync('electron-builder --publish=never -w', { 
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: 'true',
      FORCE_COLOR: '1'
    }
  });

  console.log('\n' + '='.repeat(60));
  console.log('✨ BUILD SUCCESSFUL!');
  console.log('='.repeat(60) + '\n');
  
  console.log('📍 Output Location: dist-electron/\n');
  
  console.log('📦 Generated Files:');
  if (fs.existsSync(path.join(outDir, 'PrimeERP-Setup.exe'))) {
    const sizeSetup = fs.statSync(path.join(outDir, 'PrimeERP-Setup.exe')).size / (1024 * 1024);
    console.log(`   • PrimeERP-Setup.exe (${sizeSetup.toFixed(1)} MB) - NSIS Installer`);
  }
  if (fs.existsSync(path.join(outDir, 'PrimeERP.exe'))) {
    const sizePortable = fs.statSync(path.join(outDir, 'PrimeERP.exe')).size / (1024 * 1024);
    console.log(`   • PrimeERP.exe (${sizePortable.toFixed(1)} MB) - Portable Executable`);
  }
  
  console.log('\n🎯 Next Steps:');
  console.log('   1. Test: Run dist-electron/PrimeERP.exe');
  console.log('   2. Distribute: Share PrimeERP-Setup.exe with users');
  console.log('   3. Optional: Sign with code certificate for trust\n');
  
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Build Failed!\n');
  console.error('Error:', error.message);
  
  console.log('\n💡 Troubleshooting:\n');
  console.log('If SSL/TLS errors:');
  console.log('  npm config set strict-ssl false\n');
  
  console.log('If electron-builder missing:');
  console.log('  npm install electron-builder --save-dev --force\n');
  
  console.log('If node_modules corrupted:');
  console.log('  rm -r node_modules package-lock.json');
  console.log('  npm install\n');
  
  process.exit(1);
}
