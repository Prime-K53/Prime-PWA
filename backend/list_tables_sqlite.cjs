const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Tables in database.sqlite:');
  rows.forEach(row => console.log(`- ${row.name}`));
  process.exit(0);
});
