const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const reg = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
let match;
let index = 0;
const results = [];

while ((match = reg.exec(html)) !== null) {
  index++;
  const btnStr = match[0];
  const btnPos = match.index;
  
  // Find modal container backwards
  const before = html.substring(Math.max(0, btnPos - 2000), btnPos);
  const modalDivMatches = [...before.matchAll(/<div\b[^>]*id=["']([^"']+)["'][^>]*>/g)];
  const nearestDiv = modalDivMatches.length > 0 ? modalDivMatches[modalDivMatches.length - 1][1] : 'NONE';
  
  // Also check onclick
  const onclickMatch = btnStr.match(/onclick=["']([^"']+)["']/);
  const onclick = onclickMatch ? onclickMatch[1] : 'NONE';
  
  // Check if button is display:none or hidden
  const isHidden = btnStr.includes('display: none') || btnStr.includes('display:none') || btnStr.includes('hidden');
  
  // Find modal class or structure
  const modalHeaderMatch = before.match(/<(div|header)\b[^>]*class=["'][^"']*(?:modal-header|modal-head)[^"']*["'][^>]*>/);

  results.push({
    index,
    btnPos,
    containerId: nearestDiv,
    onclick,
    isHidden,
    hasModalHeader: !!modalHeaderMatch,
    snippet: btnStr.replace(/\s+/g, ' ')
  });
}

console.log(`Found ${results.length} modal close buttons:\n`);
results.forEach(r => {
  console.log(`[#${r.index}] Modal ID: "${r.containerId}" | OnClick: "${r.onclick}" | Hidden: ${r.isHidden} | InHeader: ${r.hasModalHeader}`);
});
