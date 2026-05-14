const fs = require('fs');

try {
  let content;
  try {
    content = fs.readFileSync('tsc-errors.txt', 'utf8');
    if (content.charCodeAt(0) === 0xFFFE || content.charCodeAt(0) === 0xFEFF || content.includes('\0')) {
      content = fs.readFileSync('tsc-errors.txt', 'utf16le');
    }
  } catch (e) {
    content = fs.readFileSync('tsc-errors.txt', 'utf16le');
  }

  const lines = content.split('\n');
  const files = {};
  
  for (const line of lines) {
    const match = line.match(/^([a-zA-Z0-9_\-\./\\]+\.tsx?)\((\d+),(\d+)\):\s+(error\s+TS\d+:\s+.*)/);
    if (match) {
      const file = match[1];
      const lineNum = match[2];
      const msg = match[4];
      if (!files[file]) files[file] = [];
      files[file].push(`Line ${lineNum}: ${msg}`);
    }
  }

  for (const [file, errors] of Object.entries(files)) {
    console.log(`\n--- ${file} ---`);
    console.log(errors.slice(0, 5).join('\n'));
    if (errors.length > 5) console.log(`... and ${errors.length - 5} more errors`);
  }
} catch (err) {
  console.error("Failed to parse", err.message);
}
