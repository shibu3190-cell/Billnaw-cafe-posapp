const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Exact invariant regex
const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
const matches = [...html.matchAll(reg)];
console.log(`=== INVARIANT REGEX CHECK ===`);
console.log(`Total exact matches: ${matches.length}`);

// Lines of matches
const lines = html.split('\n');
matches.forEach((m, i) => {
  const charPos = m.index;
  const lineNum = html.substring(0, charPos).split('\n').length;
  console.log(`Match #${i + 1} at line ${lineNum}:`);
  console.log(`  Snippet: ${m[0].substring(0, 100)}...`);
});

// Any button with modal-close-btn regardless of tag structure
const allModalCloseBtns = [...html.matchAll(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi)];
console.log(`\n=== ALL BUTTONS WITH 'modal-close-btn' CLASS ===`);
console.log(`Total: ${allModalCloseBtns.length}`);
if (allModalCloseBtns.length !== matches.length) {
  console.log(`MISMATCH: Found ${allModalCloseBtns.length} buttons with modal-close-btn vs ${matches.length} matching exact SVG pattern`);
  allModalCloseBtns.forEach((b, idx) => {
    if (!matches.some(m => m[0] === b[0])) {
      console.log(`Non-matching button #${idx + 1}: ${b[0]}`);
    }
  });
} else {
  console.log(`All ${allModalCloseBtns.length} buttons with modal-close-btn class strictly match the exact SVG pattern.`);
}

// Check other close buttons that might be spoofed
const otherCloseBtns = [...html.matchAll(/<button\b[^>]*class=["'][^"']*(?:close-btn|khata-close-btn|slide-menu-close-btn|more-close-btn|upload_choice_close_btn)[^"']*["'][^>]*>/gi)];
console.log(`\n=== OTHER CLOSE BUTTONS ===`);
otherCloseBtns.forEach(b => {
  const lineNum = html.substring(0, b.index).split('\n').length;
  console.log(`Line ${lineNum}: ${b[0]}`);
});
