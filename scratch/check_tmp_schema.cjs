const sqlite3 = require('sqlite3').verbose();
const dbPath = '/tmp/database.db';
const db = new sqlite3.Database(dbPath);

db.all("PRAGMA table_info(inventory)", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(JSON.stringify(rows, null, 2));
  db.close();
});
