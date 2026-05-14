const fs = require('fs');
const file = 'frontend/config/api.js';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const start = lines.findIndex(l => l.includes('// In production mode (Electron desktop app), don\\'t default to a specific port -'));
const end = lines.findIndex(l => l.includes('const BASE_URL = API_BASE_URL;'));

if (start !== -1 && end !== -1) {
  lines.splice(
    start, 
    end - start + 1,
    "// Development: localhost:3000, Production: 127.0.0.1:3000",
    "const isDevMode = env?.DEV === true || env?.MODE === 'development';",
    "const BACKEND_ORIGIN = isDevMode ? 'http://localhost:3000' : 'http://127.0.0.1:3000';",
    "const API_BASE_URL = ensureApiPath(BACKEND_ORIGIN);",
    "const BASE_URL = API_BASE_URL;"
  );
  fs.writeFileSync(file, lines.join('\\n'));
  console.log('Replaced config successfully.');
} else {
  console.log('Lines not found', start, end);
}
