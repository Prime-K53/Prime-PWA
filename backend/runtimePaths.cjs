const fs = require('fs');
const path = require('path');

const resolveEnvPath = (value, fallback) => path.resolve(value || fallback);

const storageDir = resolveEnvPath(
  process.env.PRIME_ERP_STORAGE_DIR,
  path.join(__dirname, 'storage')
);
const backupDir = resolveEnvPath(
  process.env.PRIME_ERP_BACKUP_DIR,
  path.join(storageDir, 'backups')
);
const tempDir = resolveEnvPath(
  process.env.PRIME_ERP_TEMP_DIR,
  path.join(storageDir, 'temp')
);
const secureKeysDir = resolveEnvPath(
  process.env.PRIME_ERP_SECURE_KEYS_DIR,
  path.join(storageDir, 'secure', 'keys')
);
const workspaceConfigPath = resolveEnvPath(
  process.env.PRIME_ERP_WORKSPACE_CONFIG,
  path.join(storageDir, 'workspace.json')
);
const licensePath = resolveEnvPath(
  process.env.PRIME_ERP_LICENSE_PATH,
  path.join(storageDir, 'license.json')
);

// Dynamic dbPath that checks workspace config first
const getDbPath = () => {
  // Check if workspace config exists and has a dbPath
  if (fs.existsSync(workspaceConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(workspaceConfigPath, 'utf8'));
      if (config.dbPath) {
        return config.dbPath;
      }
    } catch (e) {
      // Ignore parse errors, fallback to default
    }
  }
  // Fall back to default path
  return resolveEnvPath(
    process.env.DB_PATH,
    path.join(storageDir, 'database.db')
  );
};

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  return dirPath;
};

const ensureRuntimeDirs = () => {
  const currentDbPath = getDbPath();
  [
    storageDir,
    backupDir,
    tempDir,
    secureKeysDir,
    path.dirname(currentDbPath),
    path.dirname(workspaceConfigPath),
    path.dirname(licensePath),
  ].forEach(ensureDir);
};

module.exports = {
  storageDir,
  backupDir,
  tempDir,
  secureKeysDir,
  getDbPath,
  workspaceConfigPath,
  licensePath,
  ensureDir,
  ensureRuntimeDirs,
};
