
const { db } = require('./server/db.cjs');

const runRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const runGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const seed = async () => {
  try {
    console.log('Seeding market_adjustments...');
    
    const count = await runGet("SELECT COUNT(*) as count FROM market_adjustments");
    if (count.count === 0) {
      console.log('No adjustments found. Adding defaults...');
      
      // 1. Overhead (10%)
      await runRun(`
        INSERT INTO market_adjustments (id, name, type, value, percentage, adjustment_category, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['adj-overhead', 'Standard Overhead', 'PERCENTAGE', 10, 10, 'Overhead', 1, 1]
      );

      // 2. Profit Margin (20%)
      await runRun(`
        INSERT INTO market_adjustments (id, name, type, value, percentage, adjustment_category, sort_order, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ['adj-margin', 'Standard Profit Margin', 'PERCENTAGE', 20, 20, 'Profit Margin', 2, 1]
      );

      console.log('Default adjustments added.');
    } else {
      console.log('Adjustments already exist. Skipping seed.');
    }

  } catch (error) {
    console.error('Seeding failed:', error);
  } finally {
    db.close();
  }
};

seed();
