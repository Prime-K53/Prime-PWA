const { db } = require('../server/db.cjs');

console.log("Database object:", db ? "Exists" : "Missing");
console.log("Starting query...");

db.all("SELECT * FROM inventory", (err, rows) => {
  if (err) {
    console.error("Error:", err);
    return;
  }
  console.log("Query complete. Rows found:", rows ? rows.length : 0);
  if (!rows || rows.length === 0) {
    console.log("No items found in inventory.");
  } else {
    rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });
  }
});
