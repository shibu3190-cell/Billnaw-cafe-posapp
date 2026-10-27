const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const files = fs.readdirSync('scratch').filter(f => f.endsWith('.cjs'));
let failCount = 0;
let passCount = 0;
for (const f of files) {
  try {
    execSync(`node scratch/${f}`, { stdio: 'pipe', timeout: 30000 });
    console.log(`PASS: ${f}`);
    passCount++;
  } catch (err) {
    console.log(`FAIL: ${f}`);
    failCount++;
    console.log(err.stdout?.toString() || err.message);
  }
}
console.log(`\nDONE: ${passCount} passed, ${failCount} failed.`);
