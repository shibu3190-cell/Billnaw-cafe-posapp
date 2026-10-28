const fs = require('fs');
const path = require('path');

function replaceRupee(file) {
    const p = path.join(__dirname, '..', file);
    if (!fs.existsSync(p)) return;
    let s = fs.readFileSync(p, 'utf8');

    // Replace cramped `₹${` or `₹\d` with `₹ `
    // Avoid double spaces like `₹  `
    s = s.replace(/₹(?!\s)([0-9]|\${)/g, '₹ $1');
    // Replace `-₹ ` with `-₹ ` or `-₹` with `-₹ `
    s = s.replace(/-₹(?!\s)([0-9]|\${)/g, '-₹ $1');

    fs.writeFileSync(p, s, 'utf8');
    console.log(`Updated rupee spacing in ${file}`);
}

['js/pos.js', 'js/customers.js', 'js/dashboard.js', 'js/settings.js', 'js/menu.js'].forEach(replaceRupee);

// In index.html, update initial template displays
const indexPath = path.join(__dirname, '..', 'index.html');
let indexHtml = fs.readFileSync(indexPath, 'utf8');
indexHtml = indexHtml.replace(/₹(?!\s)([0-9]|\${)/g, '₹ $1');
indexHtml = indexHtml.replace(/-₹(?!\s)([0-9]|\${)/g, '-₹ $1');
fs.writeFileSync(indexPath, indexHtml, 'utf8');
console.log('Updated rupee spacing in index.html');
