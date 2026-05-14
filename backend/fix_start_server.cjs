const fs = require('fs');
const file = 'backend/index.cjs';
const content = fs.readFileSync(file, 'utf8');

const targetStr = "async function startServer() {\n    });\n  });";
const replacementStr = `async function startServer() {
  console.log('--- STARTING SERVER ---');

  let isPortBound = false;
  let currentPort = PORT;
  
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
    console.error(\`Startup aborted: Could not find an available port starting from \${PORT}\`);
    process.exit(1);
  }
  
  PORT = currentPort; // Update the global PORT variable

  try {
    await bootstrap();
    console.log('Bootstrap finished');
  } catch (err) {
    console.error('Bootstrap failed:', err);
    process.exit(1);
  }

  // System & Licensing Endpoints
  const licenseService = require('./services/licenseService.cjs');
  
  app.get('/api/status', (req, res) => {
    res.json({ 
      status: 'online', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  });`;

if (content.includes(targetStr)) {
    const updatedContent = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, updatedContent, 'utf8');
    console.log("Fixed and updated backend/index.cjs successfully");
} else {
    // Try to find just the function start
    const fallbackTarget = "async function startServer() {";
    if (content.includes(fallbackTarget)) {
        // Find the next app.get('/api'
        const apiGetIdx = content.indexOf("app.get('/api'", content.indexOf(fallbackTarget));
        if (apiGetIdx !== -1) {
            const updatedContent = content.substring(0, content.indexOf(fallbackTarget)) + replacementStr + "\n\n  " + content.substring(apiGetIdx);
            fs.writeFileSync(file, updatedContent, 'utf8');
            console.log("Fixed and updated backend/index.cjs using fallback successfully");
        } else {
            console.error("Could not find api/get after startServer");
        }
    } else {
        console.error("Could not find startServer target");
    }
}
