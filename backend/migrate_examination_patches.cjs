
const { db } = require('./server/db.cjs');

const runRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const migrate = async () => {
  try {
    console.log('Migrating database...');
    
    // Check if columns exist
    const checkColumn = (table, column) => {
      return new Promise((resolve, reject) => {
        db.all(`PRAGMA table_info(${table})`, (err, rows) => {
          if (err) reject(err);
          else {
            const exists = rows.some(r => r.name === column);
            resolve(exists);
          }
        });
      });
    };

    const hasType = await checkColumn('examination_batches', 'type');
    if (!hasType) {
      console.log('Adding type column to examination_batches...');
      await runRun("ALTER TABLE examination_batches ADD COLUMN type TEXT DEFAULT 'Original'");
    } else {
      console.log('Column type already exists.');
    }

    const hasParentBatchId = await checkColumn('examination_batches', 'parent_batch_id');
    if (!hasParentBatchId) {
      console.log('Adding parent_batch_id column to examination_batches...');
      await runRun("ALTER TABLE examination_batches ADD COLUMN parent_batch_id TEXT");
    } else {
      console.log('Column parent_batch_id already exists.');
    }

    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    db.close();
  }
};

migrate();
