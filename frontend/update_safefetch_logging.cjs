const fs = require('fs');
const file = 'frontend/services/safeFetch.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/console\.warn\(`\[safeFetch\] /g, 'logger.warn(`');
content = content.replace(/console\.error\(`\[safeFetch\] /g, 'logger.error(`');
content = content.replace(/console\.debug\(`\[safeFetch\] /g, 'logger.debug(`');

fs.writeFileSync(file, content, 'utf8');
console.log("Updated frontend/services/safeFetch.ts console calls successfully");
