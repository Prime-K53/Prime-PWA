const { db } = require('./db.cjs');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Tables in database:');
  rows.forEach(row => console.log(`- ${row.name}`));
  process.exit(0);
});
