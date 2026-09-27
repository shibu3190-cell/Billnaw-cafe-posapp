import fs from 'fs';

['index.html', 'js/menu.js', 'js/pos.js', 'js/core.js'].forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, i) => {
      if (l.includes('switchInventorySubTab') || l.includes('culinarySubTabContent')) {
        console.log(`${file}:${i + 1}: ${l.slice(0, 100)}`);
      }
    });
  }
});
