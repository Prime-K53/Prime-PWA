/**
 * Migration Script: Production Module Schema
 * This script creates all production module tables and indexes
 * Run with: node database/migrate_production_schema.cjs
 */

const { db } = require('../db.cjs');
const fs = require('fs');
const path = require('path');

// Helper to run DB queries as promises
const runQuery = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
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

const runRun = (query, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// Check if migration has already been run
async function checkMigrationStatus() {
    try {
        const result = await runGet(
            "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='production_batches'"
        );
        return result.count > 0;
    } catch (err) {
        return false;
    }
}

// Read the production schema SQL file
function readProductionSchema() {
    const schemaPath = path.join(__dirname, 'production_schema_postgresql.sql');
    return fs.readFileSync(schemaPath, 'utf8');
}

// Execute the schema creation
async function createProductionSchema() {
    console.log('Starting production module schema migration...\n');

    try {
        const schemaSQL = readProductionSchema();

        // Split by semicolon and execute each statement
        const statements = schemaSQL
            .split(';')
            .filter(stmt => stmt.trim().length > 0 && !stmt.trim().startsWith('--'))
            .map(stmt => stmt.trim());

        console.log(`Executing ${statements.length} SQL statements...\n`);

        for (let i = 0; i < statements.length; i++) {
            const stmt = statements[i];
            try {
                await runRun(stmt);
                console.log(`✓ Statement ${i + 1}/${statements.length}: Executed successfully`);
            } catch (err) {
                // Skip if table already exists
                if (err.message.includes('already exists')) {
                    console.log(`✓ Statement ${i + 1}/${statements.length}: Table already exists (skipped)`);
                } else {
                    console.error(`✗ Statement ${i + 1}/${statements.length}: Error - ${err.message}`);
                    throw err;
                }
            }
        }

        console.log('\n✓ All production module tables created successfully!');

        // Verify tables were created
        const tables = await runQuery(`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name LIKE 'production_%'
            ORDER BY name
        `);

        console.log('\n✓ Created tables:');
        tables.forEach(table => {
            console.log(`  - ${table.name}`);
        });

        // Verify indexes were created
        const indexes = await runQuery(`
            SELECT name FROM sqlite_master 
            WHERE type='index' 
            AND name LIKE 'idx_production%'
            ORDER BY name
        `);

        console.log('\n✓ Created indexes:');
        indexes.forEach(index => {
            console.log(`  - ${index.name}`);
        });

        console.log('\n✓ Migration completed successfully!');
        return true;

    } catch (err) {
        console.error('\n✗ Migration failed:', err.message);
        throw err;
    }
}

// Main execution
async function main() {
    try {
        const alreadyExists = await checkMigrationStatus();

        if (alreadyExists) {
            console.log('⚠ Production module schema already exists.');
            console.log('To re-run the migration, delete the existing tables first.');
            process.exit(0);
        }

        await createProductionSchema();

    } catch (err) {
        console.error('\n❌ Migration failed:', err.message);
        process.exit(1);
    }
}

main();
