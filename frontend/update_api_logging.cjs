const fs = require('fs');
const file = 'frontend/services/api.ts';
let content = fs.readFileSync(file, 'utf8');

// Replace console calls within the interceptors and relevant functions
// We target [API Response], [API Error], etc.

content = content.replace(/console\.debug\(`\[API Response\]/g, 'logger.info(`Response');
content = content.replace(/console\.error\(`\[API Error\]/g, 'logger.error(`Error');
content = content.replace(/console\.error\(`\[API Error Response\]/g, 'logger.error(`Error Response');
content = content.replace(/console\.error\(`\[API No Response\]/g, 'logger.error(`No Response');
content = content.replace(/console\.error\(`\[API Request Error\]/g, 'logger.error(`Request Error');
content = content.replace(/console\.debug\(`\[API Request\]/g, 'logger.info(`Request');

fs.writeFileSync(file, content, 'utf8');
console.log("Updated frontend/services/api.ts console calls to logger calls successfully");
