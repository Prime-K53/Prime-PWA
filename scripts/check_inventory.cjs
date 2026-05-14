const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../server/database.sqlite');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.all("SELECT id, name, material, quantity, cost_price, cost_per_unit FROM inventory", (err, rows) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("Inventory Items:");
    rows.forEach(row => {
      console.log(JSON.stringify(row));
    });
  });
});

db.close();
