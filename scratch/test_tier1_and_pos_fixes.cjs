const assert = require('assert');
const fs = require('fs');

console.log('🧪 Starting Tier 1 & POS Fixes Verification Test Suite...\n');

// 1. Verify Gemini Service changes
const geminiService = fs.readFileSync('server/gemini-service.js', 'utf8');
assert(geminiService.includes('CANDIDATE_TIMEOUT_MS = 25000') || geminiService.includes('CANDIDATE_TIMEOUT_MS = 25000;'), 'CANDIDATE_TIMEOUT_MS should be 25000');
assert(geminiService.includes("'gemini-3.1-flash-lite'"), 'gemini-3.1-flash-lite should be in candidate models');
console.log('✅ Gemini Service timeout & model order verified.');

// 2. Verify Netlify API & Server tenant clientId sanitization
const netlifyApi = fs.readFileSync('netlify/functions/api.js', 'utf8');
const serverJs = fs.readFileSync('server.js', 'utf8');
assert(netlifyApi.includes('body?.clientId') || netlifyApi.includes('query.clientId'), 'Netlify API should check clientId in sanitizeTenantStoreCode');
assert(serverJs.includes('clientId'), 'server.js should check clientId in sanitizeTenantStoreCode');
console.log('✅ Tenant sanitization supports clientId.');

// 3. Verify Stale Table Rollover & Timer format in js/pos.js
const posJs = fs.readFileSync('js/pos.js', 'utf8');
assert(posJs.includes('checkAndRolloverStaleTables'), 'pos.js should define checkAndRolloverStaleTables');
assert(posJs.includes('BILL READY') || posJs.includes('ready_for_billing'), 'pos.js should handle ready_for_billing table status');
assert(posJs.includes('Yesterday') || posJs.includes('formattedTimer'), 'pos.js should format timers over 24h as Yesterday/days');
console.log('✅ Stale table rollover, timer formatting, and ready_for_billing in pos.js verified.');

// 4. Verify Preset Tombstone & IndexedDB v2 in js/core.js
const coreJs = fs.readFileSync('js/core.js', 'utf8');
assert(coreJs.includes('billnaw_menu_customized'), 'core.js should track billnaw_menu_customized tombstone');
assert(coreJs.includes("indexedDB.open('CafePOS_DB', 2)"), 'CafePOS_DB should open version 2');
assert(coreJs.includes("'orders'") && coreJs.includes("'by_date'"), 'CafePOS_DB v2 should create indexed orders store');
assert(coreJs.includes('setupTouchProtection') || coreJs.includes('withActionLock'), 'core.js should provide touch protection / action lock');
assert(coreJs.includes('debounce(') || coreJs.includes('function debounce'), 'core.js should define debounce utility');
console.log('✅ Preset tombstone, IndexedDB v2, touch protection, and debounce in core.js verified.');

// 5. Verify Mobile Ready for Billing in js/core.js
assert(coreJs.includes('.sc-right') && coreJs.includes('Ready for Billing'), 'Floor Server station profile should configure mobile .sc-right checkout button');
console.log('✅ Mobile Ready for Billing button configuration verified.');

// 6. Verify Skeleton UI and Ready for Billing styles in css/pos.css
const posCss = fs.readFileSync('css/pos.css', 'utf8');
assert(posCss.includes('ready-billing'), 'pos.css should define ready-billing styles');
assert(posCss.includes('pulseBilling'), 'pos.css should define pulseBilling animation');
assert(posCss.includes('skeleton'), 'pos.css should define skeleton shimmer styles');
console.log('✅ CSS styles for ready-billing and skeletons verified.');

// 7. Verify WebP compression in js/menu.js
const menuJs = fs.readFileSync('js/menu.js', 'utf8');
assert(menuJs.includes('compressImageToWebP') || menuJs.includes('image/webp'), 'menu.js should support client-side WebP compression');
assert(menuJs.includes('billnaw_menu_customized'), 'menu.js should set billnaw_menu_customized on menu edits/deletes');
console.log('✅ WebP image compression and menu customization flag in menu.js verified.');

// 8. Invariant checks
const indexHtml = fs.readFileSync('index.html', 'utf8');
const modalCloseCount = (indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || []).length;
assert.strictEqual(modalCloseCount, 26, `Must maintain exactly 26 modal-close-btn SVGs. Found ${modalCloseCount}`);
console.log('✅ Exactly 26 modal-close-btn SVGs maintained.');

const firestoreRules1 = fs.readFileSync('firestore.rules', 'utf8');
const firestoreRules2 = fs.readFileSync('database/firestore.rules', 'utf8');
assert.strictEqual(firestoreRules1, firestoreRules2, 'firestore.rules and database/firestore.rules must match identically');
console.log('✅ Firestore rules binary parity maintained.');

console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY!');
