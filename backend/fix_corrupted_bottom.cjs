const fs = require('fs');
const file = 'backend/index.cjs';
const content = fs.readFileSync(file, 'utf8');

// Find the last app.use('/api' block before the corruption
const corruptionStart = content.indexOf("app.use((err, req, res, next) => {");

if (corruptionStart === -1) {
    console.error("Could not find start of corruption");
    process.exit(1);
}

const fixedBottom = `  app.use((err, req, res, next) => {
    console.error('[CRITICAL ERROR]', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
  });

  console.log('[BACKEND] Starting app.listen on port', PORT);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(\`[BACKEND] Server running on port \${PORT}\`);
    // Keep-alive mechanism
    setInterval(() => {}, 60000);
  });

  server.on('error', (err) => {
    console.error('[BACKEND] SERVER ERROR:', err);
    closeDbAndExit(1);
  });

  server.on('close', () => {
    console.log('[BACKEND] Server closed unexpectedly');
  });

  const shutdown = async (signal) => {
    console.log(\`[System] \${signal} received. Starting graceful shutdown...\`);
    
    // Set a timeout to force exit if cleanup takes too long
    const forceExitTimeout = setTimeout(() => {
      console.error('[System] Shutdown timed out, forcing exit.');
      process.exit(1);
    }, 10000);

    try {
      if (server) {
        await new Promise((resolve) => server.close(resolve));
        console.log('[System] HTTP server closed.');
      }
      
      if (db && typeof db.close === 'function') {
        await new Promise((resolve) => {
          db.close((err) => {
            if (err) console.error('[System] Error closing database:', err.message);
            else console.log('[System] Database connection closed.');
            resolve();
          });
        });
      }
      
      clearTimeout(forceExitTimeout);
      console.log('[System] Shutdown complete.');
      process.exit(0);
    } catch (err) {
      console.error('[System] Error during shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('exit', (code) => {
  console.log(\`[Process] About to exit with code: \${code}\`);
});

process.on('uncaughtException', (err) => {
  console.error('\\n[CRITICAL FATAL ERROR] Uncaught Exception');
  console.error('Error Message:', err.message);
  console.error('Stack Trace:', err.stack);
  console.error('This error was caught by the global handler. The process will NOT crash silently.\\n');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\\n[CRITICAL FATAL ERROR] Unhandled Rejection');
  console.error('Promise:', promise);
  console.error('Reason:', reason instanceof Error ? reason.stack || reason.message : reason);
  console.error('This error was caught by the global handler to prevent silent crashes.\\n');
});

console.log('[System] Verifying environment state...');
console.log(\`[System] Process CWD: \${process.cwd()}\`);
console.log(\`[System] Node Environment: \${process.env.NODE_ENV || 'production (default)'}\`);

startServer().catch(err => {
  console.error('\\n[CRITICAL FATAL ERROR] Failed to start server:');
  console.error('Error Message:', err.message);
  console.error('Stack Trace:', err.stack);
  console.error('The backend could not bind to the port or initialize correctly.\\n');
  process.exit(1);
});`;

const updatedContent = content.substring(0, corruptionStart) + fixedBottom;
fs.writeFileSync(file, updatedContent, 'utf8');
console.log("Fixed corrupted bottom of backend/index.cjs successfully");
