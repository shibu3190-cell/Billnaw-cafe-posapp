const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const idRegex = /\bid=["']([^"']+)["']/g;
const ids = {};
let match;
while ((match = idRegex.exec(html)) !== null) {
  const id = match[1];
  ids[id] = (ids[id] || 0) + 1;
}

const duplicates = Object.entries(ids).filter(([id, count]) => count > 1);
console.log(`Total unique IDs: ${Object.keys(ids).length}`);
console.log(`Duplicate IDs count: ${duplicates.length}`);
if (duplicates.length > 0) {
  duplicates.forEach(([id, count]) => {
    console.log(`  ID: "${id}" appears ${count} times`);
  });
} else {
  console.log(`Zero duplicate IDs found in index.html!`);
}
