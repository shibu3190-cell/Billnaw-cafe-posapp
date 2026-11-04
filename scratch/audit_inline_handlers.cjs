const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const jsFiles = ['core.js', 'staff.js', 'pos.js', 'menu.js', 'customers.js', 'dashboard.js', 'marketing_inventory.js', 'culinary_inventory.js', 'settings.js']
    .map(f => fs.readFileSync('js/' + f, 'utf8'))
    .concat([fs.readFileSync('app.js', 'utf8')])
    .join('\n');

const regex = /on\w+\s*=\s*"([^"]+)"/g;
let match;
const handlers = new Set();
while ((match = regex.exec(html)) !== null) {
    const raw = match[1].trim();
    const funcCalls = raw.match(/([a-zA-Z0-9_$]+)\s*\(/g);
    if (funcCalls) {
        funcCalls.forEach(fc => {
            const name = fc.replace('(', '').trim();
            if (!['if', 'for', 'while', 'switch', 'catch', 'parseInt', 'parseFloat', 'Number', 'String', 'Boolean', 'Date', 'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval'].includes(name)) {
                handlers.add(name);
            }
        });
    }
}

const missing = [];
for (const h of handlers) {
    if (!html.includes('function ' + h) && !html.includes(h + ' =') && !html.includes(h + '=') && !jsFiles.includes('function ' + h) && !jsFiles.includes(h + ' =') && !jsFiles.includes(h + '=')) {
        missing.push(h);
    }
}
console.log('Total inline functions found:', handlers.size);
console.log('Missing functions:', missing);
const closeBtnCount = (html.match(/class="[^"]*modal-close-btn[^"]*"/g) || []).length;
console.log('modal-close-btn count:', closeBtnCount);
