const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'storage/examination.db');
const db = new sqlite3.Database(dbPath);

const run = (sql) => new Promise((resolve, reject) => {
  db.run(sql, (err) => { if (err) reject(err); else resolve(); });
});

async function fix() {
  try {
    const rows = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(examination_classes)', (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });
    const colNames = rows.map(r => r.name);

    if (!colNames.includes('market_adjustment_total')) {
      await run('ALTER TABLE examination_classes ADD COLUMN market_adjustment_total NUMERIC(15, 2) DEFAULT 0');
      console.log('Added market_adjustment_total column');
    } else {
      console.log('market_adjustment_total already exists');
    }

    if (!colNames.includes('rounding_adjustment')) {
      await run('ALTER TABLE examination_classes ADD COLUMN rounding_adjustment NUMERIC(15, 2) DEFAULT 0');
      console.log('Added rounding_adjustment column');
    } else {
      console.log('rounding_adjustment already exists');
    }

    await run(
      "UPDATE examination_classes SET market_adjustment_total = adjustment_total_cost, rounding_adjustment = 0 WHERE market_adjustment_total IS NULL OR rounding_adjustment IS NULL"
    );
    console.log('Updated existing rows with default values');

    console.log('Migration complete');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

fix();
