const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./server/database.sqlite');

async function testProcurement() {
  return new Promise((resolve, reject) => {
    // Get existing purchases
    db.all("SELECT * FROM purchases", [], (err, purchases) => {
      if (err) return reject(err);
      console.log('Existing purchases:', purchases.length);

      // Create a test purchase
      const testPurchase = {
        id: 'PO-TEST-001',
        supplier_id: 'SUP-001',
        items: JSON.stringify([{
          itemId: 'ITEM-001',
          name: 'Test Item',
          quantity: 10,
          cost: 100,
          receivedQty: 0
        }]),
        total: 1000,
        status: 'Draft',
        date: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      console.log('Creating purchase...');
      db.run(`INSERT INTO purchases (id, supplier_id, items, total, status, date, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testPurchase.id, testPurchase.supplier_id, testPurchase.items,
         testPurchase.total, testPurchase.status, testPurchase.date, testPurchase.created_at],
        function(err) {
          if (err) return reject(err);
          console.log('Purchase created with ID:', testPurchase.id);

          // Now approve it (this should create ledger entries)
          // First check if transactionService is available
          // For now, let's just verify the dashboard updates by checking if there's any expenditure data

          // Get ledger entries to see current state
          db.all("SELECT * FROM ledger WHERE description LIKE '%PO%'", [], (err, ledger) => {
            if (err) return reject(err);
            console.log('PO-related ledger entries:', ledger.length);

            // Close the database
            db.close((err) => {
              if (err) console.error('Error closing DB:', err);
              resolve();
            });
          });
        });
    });
  });
}

testProcurement().then(() => {
  console.log('Test completed');
}).catch(err => {
  console.error('Error:', err);
  db.close();
});
