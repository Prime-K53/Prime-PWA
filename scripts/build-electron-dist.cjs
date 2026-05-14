const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));

const releaseDir = path.join(rootDir, 'release');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const resourcesDir = path.join(unpackedDir, 'resources');
const appDir = path.join(resourcesDir, 'app');
const backendDir = path.join(resourcesDir, 'backend');
const backendFrontendRuntimeDir = path.join(resourcesDir, 'frontend');
const backendContractsDir = path.join(resourcesDir, 'contracts');
const installerScriptPath = path.join(releaseDir, 'prime-installer.nsi');
const installerPath = path.join(releaseDir, `PrimeERP-Setup-${packageJson.version}.exe`);

const frontendDistDir = path.join(rootDir, 'frontend', 'dist');
const electronExecutable = require('electron');
const electronDistDir = path.dirname(electronExecutable);

const ensureDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
};

const cleanPath = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true });
};

const copyRecursive = (source, destination, shouldInclude = () => true, relativePath = '') => {
  if (!shouldInclude(source, relativePath)) {
    return;
  }

  const stats = fs.statSync(source);
  if (stats.isDirectory()) {
    ensureDir(destination);
    for (const entry of fs.readdirSync(source)) {
      const childSource = path.join(source, entry);
      const childRelative = relativePath ? path.join(relativePath, entry) : entry;
      const childDestination = path.join(destination, entry);
      copyRecursive(childSource, childDestination, shouldInclude, childRelative);
    }
    return;
  }

  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
};

const findMakensis = () => {
  const nsisRoot = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis');
  if (!fs.existsSync(nsisRoot)) {
    throw new Error(`NSIS cache not found at ${nsisRoot}`);
  }

  const candidates = [];
  const walk = (dirPath) => {
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase() === 'makensis.exe') {
        candidates.push(fullPath);
      }
    }
  };

  walk(nsisRoot);

  if (candidates.length === 0) {
    throw new Error(`makensis.exe not found under ${nsisRoot}`);
  }

  return candidates.sort((left, right) => right.length - left.length)[0];
};

const toNsisPath = (targetPath) => targetPath.replace(/\\/g, '/');

const writePackagedApp = () => {
  if (!fs.existsSync(frontendDistDir)) {
    throw new Error(`Frontend build output not found at ${frontendDistDir}`);
  }

  cleanPath(unpackedDir);
  ensureDir(unpackedDir);

  copyRecursive(electronDistDir, unpackedDir);

  const renamedExe = path.join(unpackedDir, 'Prime ERP.exe');
  const defaultExe = path.join(unpackedDir, 'electron.exe');
  if (!fs.existsSync(defaultExe)) {
    throw new Error(`Electron executable not found at ${defaultExe}`);
  }
  fs.renameSync(defaultExe, renamedExe);

  // Embed custom icon into the executable so taskbar and shortcuts show it
  const icoPath = path.join(rootDir, 'electron', 'Icon.ico');
  if (fs.existsSync(icoPath)) {
    const rcedit = path.join(
      process.env.LOCALAPPDATA || '',
      'electron-builder', 'Cache', 'winCodeSign', 'winCodeSign-2.6.0', 'rcedit-x64.exe'
    );
    if (fs.existsSync(rcedit)) {
      const result = spawnSync(rcedit, [renamedExe, '--set-icon', icoPath], { stdio: 'pipe' });
      if (result.status === 0) {
        console.log('Custom icon embedded into executable.');
      } else {
        console.warn('Failed to embed icon:', result.stderr.toString());
      }
    } else {
      console.warn('rcedit not found, skipping icon embedding.');
    }
  }

  const defaultAppAsar = path.join(resourcesDir, 'default_app.asar');
  if (fs.existsSync(defaultAppAsar)) {
    fs.rmSync(defaultAppAsar, { force: true });
  }

  ensureDir(appDir);
  ensureDir(backendDir);
  ensureDir(backendFrontendRuntimeDir);
  ensureDir(backendContractsDir);

  copyRecursive(path.join(rootDir, 'electron'), path.join(appDir, 'electron'));
  copyRecursive(frontendDistDir, path.join(appDir, 'frontend', 'dist'));
  fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(appDir, 'package.json'));

  copyRecursive(
    path.join(rootDir, 'backend'),
    backendDir,
    (_source, relativePath) => {
      const normalized = String(relativePath || '').replace(/\\/g, '/');
      if (!normalized) return true;
      if (normalized === 'storage' || normalized.startsWith('storage/')) return false;
      if (normalized === 'tests' || normalized.startsWith('tests/')) return false;
      if (normalized.endsWith('.log')) return false;
      return true;
    }
  );

  copyRecursive(
    path.join(rootDir, 'frontend', 'services'),
    path.join(backendFrontendRuntimeDir, 'services'),
    (_source, relativePath) => {
      const normalized = String(relativePath || '').replace(/\\/g, '/');
      if (!normalized) return true;
      return normalized.endsWith('.cjs');
    }
  );

  copyRecursive(path.join(rootDir, 'contracts'), backendContractsDir);
};

const writeInstallerScript = () => {
  const script = [
    '!include "MUI2.nsh"',
    'Unicode True',
    'SetCompressor /SOLID lzma',
    `Name "${packageJson.build.productName}"`,
    `OutFile "${toNsisPath(installerPath)}"`,
    `InstallDir "$PROGRAMFILES64\\\\${packageJson.build.productName}"`,
    'InstallDirRegKey HKCU "Software\\\\PrimeERP" "Install_Dir"',
    'RequestExecutionLevel admin',
    `Icon "${toNsisPath(path.join(rootDir, 'electron', 'icon.ico'))}"`,
    `UninstallIcon "${toNsisPath(path.join(rootDir, 'electron', 'icon.ico'))}"`,
    '!define MUI_ABORTWARNING',
    '!insertmacro MUI_PAGE_WELCOME',
    '!insertmacro MUI_PAGE_DIRECTORY',
    '!insertmacro MUI_PAGE_INSTFILES',
    '!insertmacro MUI_PAGE_FINISH',
    '!insertmacro MUI_UNPAGE_CONFIRM',
    '!insertmacro MUI_UNPAGE_INSTFILES',
    '!insertmacro MUI_LANGUAGE "English"',
    '',
    'Section "Install"',
    '  SetOutPath "$INSTDIR"',
    '  File /r "win-unpacked\\*"',
    '  WriteRegStr HKCU "Software\\\\PrimeERP" "Install_Dir" "$INSTDIR"',
    '  WriteUninstaller "$INSTDIR\\\\Uninstall.exe"',
    '  CreateDirectory "$SMPROGRAMS\\\\Prime ERP"',
    '  CreateShortcut "$SMPROGRAMS\\\\Prime ERP\\\\Prime ERP.lnk" "$INSTDIR\\\\Prime ERP.exe"',
    '  CreateShortcut "$DESKTOP\\\\Prime ERP.lnk" "$INSTDIR\\\\Prime ERP.exe"',
    'SectionEnd',
    '',
    'Section "Uninstall"',
    '  Delete "$DESKTOP\\\\Prime ERP.lnk"',
    '  Delete "$SMPROGRAMS\\\\Prime ERP\\\\Prime ERP.lnk"',
    '  Delete "$SMPROGRAMS\\\\Prime ERP\\\\Uninstall Prime ERP.lnk"',
    '  RMDir "$SMPROGRAMS\\\\Prime ERP"',
    '  Delete "$INSTDIR\\\\Uninstall.exe"',
    '  RMDir /r "$INSTDIR"',
    '  DeleteRegKey HKCU "Software\\\\PrimeERP"',
    'SectionEnd',
    '',
  ].join('\n');

  fs.writeFileSync(installerScriptPath, script, 'utf8');
};

const buildInstaller = () => {
  const makensis = findMakensis();
  const result = spawnSync(makensis, [installerScriptPath], {
    cwd: rootDir,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`makensis exited with code ${result.status}`);
  }
};

const main = () => {
  console.log('Preparing Windows desktop distribution...');
  writePackagedApp();
  writeInstallerScript();
  buildInstaller();
  console.log(`Created unpacked app: ${unpackedDir}`);
  console.log(`Created installer: ${installerPath}`);
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
