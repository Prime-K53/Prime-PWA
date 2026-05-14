const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const databases = [
  path.resolve(__dirname, '../storage/prime.sqlite'),
  path.resolve(__dirname, '../storage/prime_erp.sqlite')
];

databases.forEach(dbPath => {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error(`Error opening ${dbPath}:`, err.message);
      return;
    }
    console.log(`\nTables in ${path.basename(dbPath)}:`);
    db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
      if (err) {
        console.error(err);
      } else {
        rows.forEach(row => console.log(`- ${row.name}`));
      }
      db.close();
    });
  });
});
