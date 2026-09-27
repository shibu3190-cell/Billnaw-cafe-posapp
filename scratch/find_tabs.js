import fs from 'fs';

const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('id="inventory"') || l.includes('id="whatsapp"') || l.includes('switchTab(') || l.includes('openCustomerHubSubView')) {
    console.log(`${idx + 1}: ${l.slice(0, 100)}`);
  }
});
