const fs = require('fs');
const path = require('path');
const BackupService = require('./services/backupService.cjs');

async function runBackup() {
  const dbPath = path.join(__dirname, 'examination.db');
  const backupDir = path.join(__dirname, '../storage/backups');
  
  console.log('Starting manual backup...');
  const backupService = new BackupService(dbPath, backupDir);
  
  try {
    const backupPath = await backupService.createBackup();
    console.log('SUCCESS: Backup created at ' + backupPath);
  } catch (err) {
    console.error('FAILED: Backup failed', err);
    process.exit(1);
  }
}

runBackup();
