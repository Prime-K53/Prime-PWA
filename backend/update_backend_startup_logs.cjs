const fs = require('fs');
const file = 'backend/index.cjs';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.log\('--- SERVER SCRIPT STARTING ---\'\)/g, "console.log('[BACKEND] --- SERVER SCRIPT STARTING ---')");
content = content.replace(/console\.log\('Requiring /g, "console.log('[BACKEND] Requiring ");
content = content.replace(/console\.log\('Imports done\./g, "console.log('[BACKEND] Imports done.");
content = content.replace(/console\.log\('--- STARTING SERVER ---\'\)/g, "console.log('[BACKEND] --- STARTING SERVER ---')");
content = content.replace(/console\.log\('Bootstrap finished\'\)/g, "console.log('[BACKEND] Bootstrap finished')");

fs.writeFileSync(file, content, 'utf8');
console.log("Updated backend/index.cjs startup logs successfully");
