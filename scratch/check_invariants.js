import fs from 'fs';

const html = fs.readFileSync('index.html', 'utf8');
const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
console.log('Modal close buttons count:', matches ? matches.length : 0);
if (matches && matches.length === 26) {
  console.log('✅ Invariant passed: Exactly 26 modal-close-btn SVG buttons found.');
} else {
  console.error('❌ Invariant VIOLATED: Expected 26, got', matches ? matches.length : 0);
}
