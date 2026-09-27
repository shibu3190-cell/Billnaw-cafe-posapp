import fs from 'fs';

const content = fs.readFileSync('index.html', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('id="customers"') || l.includes('customer-landing-hub') || l.includes('openCustomerSubView') || l.includes('For You ✨')) {
    console.log(`${idx + 1}: ${l.slice(0, 100)}`);
  }
});
