
const { db } = require('./server/db.cjs');

const migrate = async () => {
  console.log('Migrating inventory table...');
  
  db.serialize(() => {
    // Add 'unit' column
    db.run("ALTER TABLE inventory ADD COLUMN unit TEXT DEFAULT 'units'", (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('Column "unit" already exists.');
        } else {
          console.error('Error adding "unit" column:', err);
        }
      } else {
        console.log('Added "unit" column.');
      }
    });

    // Add 'reorder_point' column
    db.run("ALTER TABLE inventory ADD COLUMN reorder_point INTEGER DEFAULT 0", (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('Column "reorder_point" already exists.');
        } else {
          console.error('Error adding "reorder_point" column:', err);
        }
      } else {
        console.log('Added "reorder_point" column.');
      }
    });

    // Add 'name' column if missing (for compatibility, though we can use material)
    db.run("ALTER TABLE inventory ADD COLUMN name TEXT", (err) => {
      if (err) {
        if (err.message.includes('duplicate column name')) {
          console.log('Column "name" already exists.');
        } else {
          console.error('Error adding "name" column:', err);
        }
      } else {
        // If we added name, populate it from material
        db.run("UPDATE inventory SET name = material WHERE name IS NULL");
        console.log('Added "name" column and populated from material.');
      }
    });
  });
};

migrate();
