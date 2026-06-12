const fs = require('fs');
const path = require('path');
const os = require('os');
const { workspaceConfigPath, getDbPath, ensureRuntimeDirs } = require('../runtimePaths.cjs');
const { reinitializeDatabase } = require('../db.cjs');

class WorkspaceService {
  constructor() {
    this.workspaceConfigPath = workspaceConfigPath;
  }

  async initializeWorkspace(companyName) {
    // Determine the user's Documents path (works on Windows, macOS, and Linux)
    const documentsPath = path.join(os.homedir(), 'Documents');
    const workspacePath = path.join(documentsPath, companyName);

    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    // Only create Sync subfolder for live database sync
    const syncFolder = path.join(workspacePath, 'Sync');
    if (!fs.existsSync(syncFolder)) {
      fs.mkdirSync(syncFolder, { recursive: true });
    }

    // Database path inside Sync folder
    const syncDbPath = path.join(syncFolder, path.basename(getDbPath()));

    const config = {
      workspacePath,
      dbPath: syncDbPath,
      companyName,
      initializedAt: new Date().toISOString()
    };

    const originalDbPath = getDbPath();

    // Ensure storage dir exists
    ensureRuntimeDirs();

    fs.writeFileSync(this.workspaceConfigPath, JSON.stringify(config, null, 2));

    // Copy existing database to the Sync folder if it exists
    try {
      if (fs.existsSync(originalDbPath) && !fs.existsSync(syncDbPath)) {
        fs.copyFileSync(originalDbPath, syncDbPath);
        console.log('[Workspace] Existing database migrated to Sync folder.');
      }
    } catch (dbErr) {
      console.warn('[Workspace] Could not copy existing database:', dbErr);
    }

    // Re-initialize database connection to use the new path
    try {
      reinitializeDatabase();
      console.log('[Workspace] Database connection re-initialized to use Sync folder.');
    } catch (reinitErr) {
      console.warn('[Workspace] Could not re-initialize database:', reinitErr);
    }

    return config;
  }

  getWorkspaceConfig() {
    if (fs.existsSync(this.workspaceConfigPath)) {
      try {
        return JSON.parse(fs.readFileSync(this.workspaceConfigPath, 'utf8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  async saveToWorkspace(folder, filename, data) {
    const config = this.getWorkspaceConfig();
    if (!config || !config.workspacePath) {
      throw new Error('Workspace not initialized');
    }

    const targetDir = path.join(config.workspacePath, folder);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const targetPath = path.join(targetDir, filename);
    
    // Check if data is base64 (e.g. for PDFs)
    let content = data;
    if (typeof data === 'string' && data.startsWith('data:')) {
      // Extract base64
      const base64Data = data.split(',')[1];
      content = Buffer.from(base64Data, 'base64');
    } else if (typeof data === 'object' && data !== null) {
      content = JSON.stringify(data, null, 2);
    }

    fs.writeFileSync(targetPath, content);
    return targetPath;
  }
}

module.exports = new WorkspaceService();
