const fs = require('fs');
const path = require('path');

console.log("=== COMPREHENSIVE RUPEE SPACING AUDIT ===");

function checkFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const violations = [];

    // Check for `₹` followed immediately by number or ${ without a space or &nbsp;
    lines.forEach((line, idx) => {
        // Regex matches `₹` followed immediately by a digit, decimal, or `${` or `{`
        const matches = [...line.matchAll(/₹([0-9]|\$\{|[a-zA-Z])/g)];
        if (matches.length > 0) {
            violations.push({
                lineNum: idx + 1,
                line: line.trim(),
                matches: matches.map(m => m[0])
            });
        }
    });
    return violations;
}

const filesToCheck = [
    'index.html',
    'style.css',
    ...fs.readdirSync('js').filter(f => f.endsWith('.js')).map(f => path.join('js', f)),
    ...fs.readdirSync('css').filter(f => f.endsWith('.css')).map(f => path.join('css', f))
];

let totalViolations = 0;
filesToCheck.forEach(file => {
    const v = checkFile(file);
    if (v.length > 0) {
        console.log(`\n❌ Found ${v.length} violations in ${file}:`);
        v.slice(0, 10).forEach(item => {
            console.log(`  Line ${item.lineNum}: [${item.matches.join(', ')}] -> ${item.line}`);
        });
        if (v.length > 10) {
            console.log(`  ...and ${v.length - 10} more`);
        }
        totalViolations += v.length;
    } else {
        console.log(`✅ ${file}: 0 cramped ₹ violations`);
    }
});

console.log(`\nTOTAL CRAMPED RUPEE VIOLATIONS: ${totalViolations}`);
