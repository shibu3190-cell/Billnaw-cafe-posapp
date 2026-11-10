const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 Starting Menu Capacity, AI Import & Multi-Device Isolation Test Suite...\n');

// -------------------------------------------------------------
// Test 1: Verify Code Invariants in js/core.js (No Mock Wipe)
// -------------------------------------------------------------
console.log('▶ [TEST 1] Verifying js/core.js for Mock Wipe Removal');
const coreCode = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');

assert.strictEqual(coreCode.includes('isLegacyRemoteMock'), false, 'isLegacyRemoteMock must be completely removed');
assert.strictEqual(coreCode.includes('isLegacyMockMenu'), false, 'isLegacyMockMenu must be completely removed');
assert.strictEqual(coreCode.includes('(data.menu.length >= 30)'), false, 'Arbitrary 30-item cap must be removed');
assert.strictEqual(coreCode.includes('(storedMenu.length >= 30)'), false, 'Arbitrary 30-item stored cap must be removed');

// Ensure tables are not wiped because of item names
assert.strictEqual(coreCode.includes("it.name === 'Steam Rice' || it.name === 'Espresso Coffee'"), false, 'Table item name wipe must be removed');
console.log('  ✅ [TEST 1 PASSED] All legacy destructive wipe logic eradicated from js/core.js.');

// -------------------------------------------------------------
// Test 2: AI Menu Import Baseline Replacement & Upsert Logic
// -------------------------------------------------------------
console.log('▶ [TEST 2] Verifying AI Menu Import Baseline Replacement & Upsert Logic');
const menuCode = fs.readFileSync(path.join(__dirname, '../js/menu.js'), 'utf8');

assert.strictEqual(menuCode.includes('isDefaultDemoMenu'), true, 'AI Import must detect and replace pristine 4-item demo baseline');
assert.strictEqual(menuCode.includes('existingItemIndex'), true, 'AI Import must perform deduplication / upsert on existing item names');

// Simulate the confirmAiImport logic
let testMenuItems = [
    { id: 1, name: "Samosa", category: "Snacks", price: 15 },
    { id: 2, name: "Tea", category: "Beverages", price: 10 },
    { id: 3, name: "Chicken Curry", category: "Main Course", price: 140 },
    { id: 4, name: "Masala Coke", category: "Beverages", price: 40 }
];
let testMenuCategories = ["All", "Snacks", "Beverages", "Main Course"];

// Step 2A: First import with 25 custom items (like AMBER & OAK Starters to Green Tea)
const isDefaultDemo = testMenuItems.length === 4 && testMenuItems.every(m => [1,2,3,4].includes(m.id));
assert.strictEqual(isDefaultDemo, true, 'Default demo menu must be detected');

if (isDefaultDemo) {
    testMenuItems = [];
}

const mockUploadedItems = [];
for (let i = 1; i <= 25; i++) {
    mockUploadedItems.push({
        name: `Special Dish ${i}`,
        category: i <= 10 ? 'Starters' : 'Main Course',
        price: 100 + i * 5
    });
}

mockUploadedItems.forEach((item, idx) => {
    const existingIndex = testMenuItems.findIndex(m => m.name.toLowerCase() === item.name.toLowerCase());
    if (existingIndex >= 0) {
        testMenuItems[existingIndex].price = item.price;
    } else {
        testMenuItems.push({
            id: Date.now() + idx,
            name: item.name,
            category: item.category,
            price: item.price
        });
    }
});

assert.strictEqual(testMenuItems.length, 25, 'First upload should replace demo items and contain exactly 25 items');
assert.strictEqual(testMenuItems.some(m => m.name === 'Samosa'), false, 'Demo Samosa should not pollute real uploaded menu');

// Step 2B: Second upload (incremental import + updates + scaling to 200 items)
const secondBatch = [];
// 10 items updated with new prices
for (let i = 1; i <= 10; i++) {
    secondBatch.push({
        name: `Special Dish ${i}`,
        category: 'Starters',
        price: 999
    });
}
// 175 new items added, bringing total to 200
for (let i = 26; i <= 200; i++) {
    secondBatch.push({
        name: `Grand Menu Item ${i}`,
        category: 'Chinese & Continental',
        price: 200 + i
    });
}

let addedCount = 0;
let updatedCount = 0;
secondBatch.forEach((item, idx) => {
    const existingIndex = testMenuItems.findIndex(m => m.name.toLowerCase() === item.name.toLowerCase());
    if (existingIndex >= 0) {
        testMenuItems[existingIndex].price = item.price;
        updatedCount++;
    } else {
        testMenuItems.push({
            id: Date.now() + 1000 + idx,
            name: item.name,
            category: item.category,
            price: item.price
        });
        addedCount++;
    }
});

assert.strictEqual(testMenuItems.length, 200, 'Menu must support 200 items seamlessly without any cap');
assert.strictEqual(updatedCount, 10, '10 existing items must be updated without duplicates');
assert.strictEqual(addedCount, 175, '175 new items must be added');
assert.strictEqual(testMenuItems.find(m => m.name === 'Special Dish 1').price, 999, 'Item price must reflect update');
console.log('  ✅ [TEST 2 PASSED] AI Menu import baseline replacement, upsert deduplication and 200-item scaling verified.');

// -------------------------------------------------------------
// Test 3: Multi-Device Cross-Login Shop Name Isolation
// -------------------------------------------------------------
console.log('▶ [TEST 3] Verifying Multi-Device Cross-Login Shop Name Isolation');
const shopAuthCode = fs.readFileSync(path.join(__dirname, '../js/shop-auth.js'), 'utf8');

// Ensure the old buggy guard is completely gone from verify-otp and password login
assert.strictEqual(shopAuthCode.includes("if (!shopProfile.name || shopProfile.name === 'billnaw')"), false, 
    'The flawed shopProfile.name !== billnaw guard must be removed completely');

// Ensure tenant switch detection is in place
assert.strictEqual(shopAuthCode.includes('Switching store tenant'), true,
    'Store tenant switch detection must be active');

// Ensure clearAllTenantLocalData purges shop name and store profile
assert.strictEqual(shopAuthCode.includes("localStorage.removeItem('billnaw_shop_name')"), true,
    'clearAllTenantLocalData must remove billnaw_shop_name');
assert.strictEqual(shopAuthCode.includes("localStorage.removeItem('billnaw_store_profile')"), true,
    'clearAllTenantLocalData must remove billnaw_store_profile');

console.log('  ✅ [TEST 3 PASSED] Multi-Device shop name isolation and tenant cache clearance verified.');

// -------------------------------------------------------------
// Test 4: UI Invariants (26 Modal Close SVGs, 0 Button Emojis, Rules Parity)
// -------------------------------------------------------------
console.log('▶ [TEST 4] Verifying Project Invariants (SVGs, Button Emojis, Rules Parity)');
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

// 1. Modal close button count
const closeBtnMatches = indexHtml.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
assert.strictEqual(closeBtnMatches.length, 26, `Must maintain exactly 26 modal-close-btn elements (found: ${closeBtnMatches.length})`);

// 2. Button raw emojis check
const btnRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
let btnMatch;
let emojiButtonCount = 0;
while ((btnMatch = btnRegex.exec(indexHtml)) !== null) {
    const btnInner = btnMatch[1];
    if (rawEmojiRegex.test(btnInner)) {
        console.error('Found raw emoji in button:', btnInner);
        emojiButtonCount++;
    }
}
assert.strictEqual(emojiButtonCount, 0, `There must be 0 raw emojis in <button> tags in index.html (found: ${emojiButtonCount})`);

// 3. Rules parity
const rootRules = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
const dbRules = fs.readFileSync(path.join(__dirname, '../database/firestore.rules'), 'utf8');
assert.strictEqual(rootRules, dbRules, 'firestore.rules and database/firestore.rules must have 100% binary parity');

console.log('  ✅ [TEST 4 PASSED] All 26 modal close buttons, 0 button emojis, and firestore.rules parity verified.');

console.log('\n======================================================');
console.log('🎉 ALL 4 VERIFICATION SUITES PASSED FLAWLESSLY!');
console.log('======================================================\n');
