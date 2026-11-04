/**
 * Forensic Audit Verification Script
 * Validates invariants, anti-tampering rules, and checks for cheating/facades.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('=== RUNNING FORENSIC INVARIANT & ANTI-TAMPERING AUDIT ===\n');

let issues = [];

// 1. Check the 6 required string invariants in both rules files
const requiredInvariants = [
  '/cafes/{cafeId}',
  'match /invoices/{invoiceId}',
  'allow delete: if false;',
  "request.resource.data.status == 'VOID'",
  'request.resource.data.void_audit.void_reason is string',
  'match /tables/{tableId}'
];

const rulesFiles = ['firestore.rules', 'database/firestore.rules'];

rulesFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  console.log(`Checking ${file}:`);
  requiredInvariants.forEach(inv => {
    const present = content.includes(inv);
    console.log(`  [${present ? 'PASS' : 'FAIL'}] Invariant: "${inv}"`);
    if (!present) {
      issues.push(`Missing invariant in ${file}: "${inv}"`);
    }
  });

  // Verify dual path /shops/{shopId} presence and symmetry
  const hasShops = content.includes('/shops/{shopId}');
  console.log(`  [${hasShops ? 'PASS' : 'FAIL'}] Dual-path /shops/{shopId} presence`);
  if (!hasShops) issues.push(`Missing /shops/{shopId} in ${file}`);

  // Verify that neither /cafes/{cafeId} nor /shops/{shopId} has a wildcard write bypass
  const cafeBlockMatch = content.match(/match\s+\/cafes\/\{cafeId\}[\s\S]*?match\s+\/shops\/\{shopId\}/);
  if (cafeBlockMatch) {
    const cafeBlock = cafeBlockMatch[0];
    const hasWildcardInCafe = /match\s+\/\{allChildren=\*\*\}/.test(cafeBlock);
    console.log(`  [${!hasWildcardInCafe ? 'PASS' : 'FAIL'}] No wildcard {allChildren=**} under /cafes/{cafeId}`);
    if (hasWildcardInCafe) issues.push(`Wildcard {allChildren=**} detected under /cafes/{cafeId} in ${file}`);
  }

  const shopBlockMatch = content.match(/match\s+\/shops\/\{shopId\}[\s\S]*?match\s+\/clients\/\{clientId\}/);
  if (shopBlockMatch) {
    const shopBlock = shopBlockMatch[0];
    const hasWildcardInShop = /match\s+\/\{allChildren=\*\*\}/.test(shopBlock);
    console.log(`  [${!hasWildcardInShop ? 'PASS' : 'FAIL'}] No wildcard {allChildren=**} under /shops/{shopId}`);
    if (hasWildcardInShop) issues.push(`Wildcard {allChildren=**} detected under /shops/{shopId} in ${file}`);
  }
});

// 2. Invariant: Exactly 26 .modal-close-btn SVG elements in index.html
const indexHtml = fs.readFileSync('index.html', 'utf8');
const modalCloseBtnMatches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
console.log(`\nChecking index.html modal-close-btn:`);
console.log(`  Found: ${modalCloseBtnMatches.length} occurrences (Expected: 26)`);
if (modalCloseBtnMatches.length !== 26) {
  issues.push(`Expected exactly 26 modal-close-btn in index.html, found ${modalCloseBtnMatches.length}`);
}

// 3. Invariant: Zero raw Unicode emojis in operational <button>, <tab>, and segmented pills
console.log(`\nChecking raw Unicode emojis in operational buttons, tabs, segmented pills:`);
const withoutComments = indexHtml.replace(/<!--[\s\S]*?-->/g, '');

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;

// Extract operational buttons
const buttonMatches = withoutComments.match(/<button[\s\S]*?<\/button>/gi) || [];
let emojiButtonCount = 0;
buttonMatches.forEach((btn) => {
  const cleanBtn = btn.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  if (emojiRegex.test(cleanBtn)) {
    emojiButtonCount++;
    console.log(`  Flagged button with emoji:`, cleanBtn.slice(0, 80));
  }
});
console.log(`  Operational <button> elements with raw emoji: ${emojiButtonCount} (Expected: 0)`);
if (emojiButtonCount > 0) {
  issues.push(`Found ${emojiButtonCount} buttons with raw Unicode emojis`);
}

// Extract filter-pills, nav tabs, segmented buttons
const pillMatches = withoutComments.match(/<button[^>]*class=["'][^"']*(?:filter-pill|tab-btn|segmented-btn|nav-tab)[^"']*["'][\s\S]*?<\/button>/gi) || [];
let emojiPillCount = 0;
pillMatches.forEach(p => {
  const cleanP = p.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  if (emojiRegex.test(cleanP)) {
    emojiPillCount++;
    console.log(`  Flagged pill/tab with emoji:`, cleanP.slice(0, 80));
  }
});
console.log(`  Segmented/filter pills with raw emoji: ${emojiPillCount} (Expected: 0)`);
if (emojiPillCount > 0) {
  issues.push(`Found ${emojiPillCount} segmented pills/tabs with raw Unicode emojis`);
}

// 4. Invariant: Non-breaking currency space formatting (`₹ `) preserved
console.log(`\nChecking non-breaking currency formatting:`);
const currencyUsage = indexHtml.match(/₹\s+/g) || [];
console.log(`  Found ${currencyUsage.length} instances of '₹ ' in index.html`);
const rawNoSpaceCurrency = indexHtml.match(/₹[0-9]/g) || [];
console.log(`  Instances of ₹ immediately followed by digit (no space): ${rawNoSpaceCurrency.length}`);
if (rawNoSpaceCurrency.length > 0) {
  issues.push(`Found ${rawNoSpaceCurrency.length} instances of '₹' without space before digit in index.html`);
}

// 5. Offline PWA functionality in sw.js and service-worker.js maintained
console.log(`\nChecking offline PWA functionality in sw.js and service-worker.js:`);
const swContent = fs.readFileSync('sw.js', 'utf8');
const isSwAlias = swContent.includes('importScripts') && swContent.includes('service-worker.js');
console.log(`  sw.js imports service-worker.js: ${isSwAlias}`);
if (!isSwAlias) {
  issues.push('sw.js does not import service-worker.js');
}

const serviceWorkerContent = fs.readFileSync('service-worker.js', 'utf8');
const hasFetch = serviceWorkerContent.includes("addEventListener('fetch'") || serviceWorkerContent.includes('fetch');
const hasCache = serviceWorkerContent.includes('caches.open') && serviceWorkerContent.includes('CACHE_VERSION');
const hasInstall = serviceWorkerContent.includes("addEventListener('install'");
console.log(`  service-worker.js: install=${hasInstall}, caches=${hasCache}, fetch=${hasFetch}`);
if (!hasFetch || !hasCache || !hasInstall) {
  issues.push('service-worker.js missing core ServiceWorker event handlers or CacheStorage logic');
}

console.log('\n=== AUDIT FORENSICS SUMMARY ===');
if (issues.length === 0) {
  console.log('✅ ALL INVARIANTS & SECURITY CHECKS PASSED PERFECTLY (0 ISSUES)!');
} else {
  console.log('❌ ISSUES FOUND:', issues);
}
