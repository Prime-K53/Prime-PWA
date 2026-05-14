const fs = require('fs');
const file = 'backend/index.cjs';
const content = fs.readFileSync(file, 'utf8');

// The original line: console.log('Starting app.listen on port', PORT);
// We want to replace it to use auto-increment and catch errors!

const startServerStr = `const startServer = async () => {`;
const startServerIndex = content.indexOf(startServerStr);

if (startServerIndex === -1) {
    console.error("Could not find startServer");
    process.exit(1);
}

const replacement = `const startServer = async () => {
  let isPortBound = false;
  let currentPort = PORT;
  let server;
  
  while (!isPortBound && currentPort < PORT + 100) {
    try {
      await ensurePortAvailable(currentPort);
      isPortBound = true;
    } catch (err) {
      console.warn(\`[System] Port \${currentPort} is in use (\${err.message}). Trying \${currentPort + 1}...\`);
      currentPort++;
    }
  }
  
  if (!isPortBound) {
    throw new Error(\`Could not find an available port starting from \${PORT}\`);
  }
  
  PORT = currentPort; // update global

  console.log('[System] Starting app.listen on port', PORT);
  
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(\`[System] Server running on port \${PORT}\`);
    setInterval(() => {}, 60000);
  });

  server.on('error', (err) => {
    console.error('[CRITICAL FATAL ERROR] SERVER ERROR:', err);
    closeDbAndExit(1);
  });

  server.on('close', () => {
    console.log('[System] Server closed unexpectedly');
  });

  const shutdown = async (signal) => {`;

const searchStr = `const startServer = async () => {
  // Catch-all for unknown API routes to ensure JSON response`;

// Wait, the original code is:
//   // Catch-all for unknown API routes to ensure JSON response
//   app.use('/api', (req, res) => {
// ...
//   console.log('Starting app.listen on port', PORT);
//   const server = app.listen(PORT, '0.0.0.0', () => {

const beforeAppListenStr = `  console.log('Starting app.listen on port', PORT);`;
const afterAppListenStr = `  const shutdown = async (signal) => {`;

const beforeIdx = content.indexOf(beforeAppListenStr);
const afterIdx = content.indexOf(afterAppListenStr);

if (beforeIdx === -1 || afterIdx === -1) {
    console.error("Could not find replacement boundaries in startServer");
    process.exit(1);
}

const customReplacement = `  let isPortBound = false;
  let currentPort = PORT;
  let server;
  
  while (!isPortBound && currentPort < PORT + 100) {
    try {
      await ensurePortAvailable(currentPort);
      isPortBound = true;
    } catch (err) {
      console.warn(\`[System] Port \${currentPort} is in use (\${err.message}). Trying \${currentPort + 1}...\`);
      currentPort++;
    }
  }
  
  if (!isPortBound) {
    throw new Error(\`Could not find an available port starting from \${PORT}\`);
  }
  
  PORT = currentPort; // update global

  console.log('[System] Starting app.listen on port', PORT);
  
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(\`[System] Server running on port \${PORT}\`);
    setInterval(() => {}, 60000);
  });

  server.on('error', (err) => {
    console.error('[CRITICAL FATAL ERROR] SERVER ERROR:', err);
    closeDbAndExit(1);
  });

  server.on('close', () => {
    console.log('[System] Server closed unexpectedly');
  });

`;

const updatedContent = content.substring(0, beforeIdx) + customReplacement + content.substring(afterIdx);
fs.writeFileSync(file, updatedContent, 'utf8');
console.log("Updated backend/index.cjs auto-increment successfully");
