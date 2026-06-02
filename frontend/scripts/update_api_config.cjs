const fs = require('fs');
const file = 'frontend/config/api.js';
const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const start = lines.findIndex(l => l.includes('const API_BASE_URL ='));
const end = lines.findIndex(l => l.includes('const BACKEND_ORIGIN ='));

if (start !== -1 && end !== -1) {
  lines.splice(
    start, 
    end - start + 1,
    "const API_BASE_URL = ensureApiPath(BACKEND_ORIGIN);",
    "const BASE_URL = API_BASE_URL;",
    "// Whether a dedicated API server is available (separate from Supabase)",
    "const HAS_REMOTE_BACKEND = SUPABASE_CONFIGURED && Boolean(API_BASE_URL);",
    "const BACKEND_ORIGIN = '';"
  );
  fs.writeFileSync(file, lines.join('\\n'));
  console.log('Replaced config successfully.');
} else {
  console.log('Lines not found', start, end);
}
