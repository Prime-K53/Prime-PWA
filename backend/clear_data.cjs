const { db } = require('./db.cjs');

async function clearTransactionalData() {
  console.log('Starting data cleanup...');
  
  const tables = [
    'examinations',
    'invoices',
    'inventory',
    'schools',
    'classes',
    'subjects',
    'pdf_batch_jobs',
    'pdf_batch_items',
    'pdf_dead_letter_items',
    'pdf_audit_logs',
    'pdf_metrics',
    'pdf_documents'
  ];

  db.serialize(() => {
    // Disable foreign key checks temporarily to avoid issues during bulk delete
    db.run('PRAGMA foreign_keys = OFF');

    tables.forEach(table => {
      db.run(`DELETE FROM ${table}`, (err) => {
        if (err) {
          // Table might not exist, which is fine
          if (!err.message.includes('no such table')) {
            console.error(`Error clearing ${table}:`, err.message);
          }
        } else {
          console.log(`Cleared table: ${table}`);
        }
      });
      
      // Reset autoincrement counters
      db.run(`DELETE FROM sqlite_sequence WHERE name='${table}'`, (err) => {
        if (err) {
          // Ignore errors here
        }
      });
    });

    db.run('PRAGMA foreign_keys = ON', () => {
      console.log('Data cleanup completed successfully.');
      process.exit(0);
    });
  });
}

clearTransactionalData();
