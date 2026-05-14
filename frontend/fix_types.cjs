const fs = require('fs');
const content = fs.readFileSync('tsc-errors.txt', 'utf16le');
const lines = content.split('\n');
const missingTypes = new Set();

for (const line of lines) {
  const match = line.match(/Module '.*' has no exported member '([^']+)'/);
  if (match) {
    missingTypes.add(match[1]);
  }
}

const typesToAppend = Array.from(missingTypes).map(t => `export type ${t} = any; // TIER 2: Added as any due to missing definitions`).join('\n');
console.log(typesToAppend);
fs.appendFileSync('types.ts', '\n' + typesToAppend + '\n');
