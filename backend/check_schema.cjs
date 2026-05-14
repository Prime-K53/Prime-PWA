const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'examination.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='examination_classes'", (err, rows) => {
        if (err) {
            console.error(err);
        } else if (rows.length > 0) {
            console.log(rows[0].sql);
        } else {
            console.log("Table examination_classes not found");
        }
        
        // Also check if columns exist by trying to select them (dirty check or pragma)
        db.all("PRAGMA table_info(examination_classes)", (err, info) => {
            if (err) console.error(err);
            else console.log(JSON.stringify(info, null, 2));
            db.close();
        });
    });
});
