const fs = require('fs');
const file = 'backend/index.cjs';
const content = fs.readFileSync(file, 'utf8');

const targetStr = "app.use((req, res, next) => {\n  const correlationId = req.headers['x-correlation-id'] || randomUUID();\n  req.correlationId = correlationId;\n  res.setHeader('x-correlation-id', correlationId);\n  console.log(JSON.stringify({\n    ts: new Date().toISOString(),\n    level: 'info',\n    event: 'http_request',\n    correlationId,\n    method: req.method,\n    path: req.url\n  }));\n  next();\n});";

const replacementStr = `app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] || randomUUID();
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(\`[API] \${req.method} \${req.originalUrl} \${res.statusCode} - \${duration}ms (CID: \${correlationId})\`);
  });
  next();
});`;

// Try to find the target string with different newline characters
const targetStrCRLF = targetStr.replace(/\n/g, '\r\n');

if (content.includes(targetStr)) {
    const updatedContent = content.replace(targetStr, replacementStr);
    fs.writeFileSync(file, updatedContent, 'utf8');
    console.log("Updated backend/index.cjs logging successfully (LF)");
} else if (content.includes(targetStrCRLF)) {
    const updatedContent = content.replace(targetStrCRLF, replacementStr.replace(/\n/g, '\r\n'));
    fs.writeFileSync(file, updatedContent, 'utf8');
    console.log("Updated backend/index.cjs logging successfully (CRLF)");
} else {
    // Fallback search
    const searchPart = "req.correlationId = correlationId;";
    const startIdx = content.lastIndexOf("app.use((req, res, next) => {", content.indexOf(searchPart));
    const nextIdx = content.indexOf("next();", content.indexOf(searchPart));
    const endIdx = content.indexOf("});", nextIdx) + 3;
    
    if (startIdx !== -1 && endIdx !== -1) {
        const updatedContent = content.substring(0, startIdx) + replacementStr + content.substring(endIdx);
        fs.writeFileSync(file, updatedContent, 'utf8');
        console.log("Updated backend/index.cjs logging using fallback successfully");
    } else {
        console.error("Could not find logging middleware target");
    }
}
