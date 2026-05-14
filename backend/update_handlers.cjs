const fs = require('fs');
const file = 'backend/index.cjs';
const content = fs.readFileSync(file, 'utf8');

// Find the start of the process.on('exit') block
const exitStart = content.indexOf("process.on('exit', (code) => {");

if (exitStart === -1) {
  console.error("Could not find the target code block");
  process.exit(1);
}

const newBottom = `process.on('exit', (code) => {
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

const updatedContent = content.substring(0, exitStart) + newBottom;
fs.writeFileSync(file, updatedContent, 'utf8');
console.log("Updated backend/index.cjs successfully");
