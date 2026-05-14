const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = 'c:\\Users\\Rhonald Chiwatu\\Documents\\GitHub\\Prime BOOKS\\backend\\storage\\database.db';
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
