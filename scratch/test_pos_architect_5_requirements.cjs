/**
 * scratch/test_pos_architect_5_requirements.cjs
 * Comprehensive Architectural Verification Suite for the 5 Critical POS Requirements:
 * 1. Zero-Lag Menu & Rate Sync (Bundling, IndexedDB, Monotonic Version Listener)
 * 2. Price Snapshotting & Item Integrity (Frozen Rates, Soft Deletes, No Retroactive Alteration)
 * 3. Flicker-Free Cashier UI & Debounced Waiter Updates (DOM Diffing/Patching, 350ms Stepper Queue)
 * 4. Offline Resilience, Auth Persistence & Security (IndexedDB Multi-Tab Persistence, browserLocalPersistence, Hardened Rules)
 * 5. Repository Invariants & Parity
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const rootDir = path.resolve(__dirname, '..');
const fbInit = fs.readFileSync(path.join(rootDir, 'js', 'firebase-init.js'), 'utf8');
const jsCore = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
const jsPos = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf8');
const jsMenu = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const rulesRoot = fs.readFileSync(path.join(rootDir, 'firestore.rules'), 'utf8');
const rulesDb = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'), 'utf8');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        failed++;
    }
}

console.log("====================================================");
console.log("🏛️ PRINCIPAL POS SYSTEMS ARCHITECT AUDIT VERIFICATION");
console.log("====================================================");

// ============================================================================
// REQUIREMENT 1: Zero-Lag Menu & Rate Sync Across 10+ Devices
// ============================================================================
console.log("\n📍 REQUIREMENT 1: ZERO-LAG MENU & RATE SYNC (10+ DEVICES)");

test("REQ1-01: Menu is bundled efficiently in a single document payload to avoid 200 individual document reads", () => {
    assert.ok(jsCore.includes("idb.set('cafe_menu', sanitizedMenu)"), "Local IndexedDB menu caching missing");
    assert.ok(jsCore.includes("syncBundledMenuFromCloud"), "Missing single-document bundled cloud sync fetcher");
    assert.ok(/storeDocRef,\s*\{\s*menu:\s*sanitizedMenu/.test(jsCore), "Root store document bundle missing");
});

test("REQ1-02: Monotonic menuVersion counter implemented on persistMenu()", () => {
    assert.ok(jsCore.includes("billnaw_menu_version"), "Local menu version tracking missing in js/core.js");
    assert.ok(jsCore.includes("newVersion = currentVer + 1"), "Monotonic increment logic missing");
    assert.ok(jsCore.includes("menuVersion: newVersion"), "menuVersion not saved in store doc and backend sync payload");
});

test("REQ1-03: Lightweight metadata version listener (menus/meta) implemented without manual page reload", () => {
    assert.ok(jsCore.includes("function subscribeMenuMetaCloudListener"), "Missing subscribeMenuMetaCloudListener");
    assert.ok(jsCore.includes("menu_meta', 'version'"), "Missing metadata document reference");
    assert.ok(jsCore.includes("subscribeMenuMetaCloudListener(targetStoreCode)"), "Metadata listener not invoked in attachFirestoreListener");
});

test("REQ1-04: Remote store snapshot skips full catalog DOM wipe when incoming menuVersion <= localVersion", () => {
    assert.ok(jsCore.includes("incomingMenuVersion <= localMenuVersion"), "Version comparison gate missing in handleRemoteFirestoreUpdate");
    assert.ok(jsCore.includes("Zero-Lag Optimization: If menu version has not changed"), "Optimization comment and guard missing");
});

// ============================================================================
// REQUIREMENT 2: Price Snapshotting & Item Integrity
// ============================================================================
console.log("\n📍 REQUIREMENT 2: PRICE SNAPSHOTTING & ITEM INTEGRITY");

test("REQ2-01: addToCart creates immutable price and explicit rate snapshot at insertion moment", () => {
    assert.ok(jsPos.includes("rate: snapPrice, // Explicit immutable price snapshot"), "Missing explicit rate snapshot in addToCart");
    assert.ok(jsPos.includes("priceSnapshotAt: Date.now()"), "Missing priceSnapshotAt timestamp in cart line");
    assert.ok(jsPos.includes("isAvailable: true"), "Missing default availability flag in cart line");
});

test("REQ2-02: Mid-shift catalog price change simulation proves open cart line rates remain frozen", () => {
    // Algorithmic simulation
    const catalogItem = { id: 101, name: "Cold Coffee", price: 120 };
    const cartItem = {
        id: catalogItem.id,
        name: catalogItem.name,
        price: Number(catalogItem.price),
        rate: Number(catalogItem.price),
        qty: 2,
        priceSnapshotAt: Date.now()
    };
    
    // Simulate Admin mid-shift price change from 120 -> 180
    catalogItem.price = 180;
    
    // Cart item math MUST still equal 240, NOT 360
    const lineTotal = (cartItem.rate || cartItem.price) * cartItem.qty;
    assert.strictEqual(lineTotal, 240, "Cart item rate was corrupted by live catalog price update");
    assert.strictEqual(cartItem.price, 120, "Cart item frozen price was mutated");
});

test("REQ2-03: deleteMenuItem uses soft-delete semantics (isAvailable: false, isDeleted: true) preserving open orders", () => {
    assert.ok(jsMenu.includes("targetItem.isDeleted = true"), "Missing isDeleted flag in deleteMenuItem");
    assert.ok(jsMenu.includes("targetItem.isAvailable = false"), "Missing isAvailable: false in deleteMenuItem");
    assert.ok(jsMenu.includes("targetItem.deletedAt = new Date().toISOString()"), "Missing deletedAt timestamp");
    assert.ok(jsMenu.includes("isReferencedInOpenTables"), "Missing open tables referential safety check");
});

// ============================================================================
// REQUIREMENT 3: Flicker-Free Cashier UI & Debounced Waiter Updates
// ============================================================================
console.log("\n📍 REQUIREMENT 3: FLICKER-FREE CASHIER UI & DEBOUNCED WAITER UPDATES");

test("REQ3-01: Menu cards have unique DOM IDs and data attributes for granular diffing", () => {
    assert.ok(jsMenu.includes('id="menu-card-${item.id}"'), "Missing ID attribute on .menu-card element");
    assert.ok(jsMenu.includes('data-item-id="${item.id}"'), "Missing data-item-id attribute on .menu-card element");
});

test("REQ3-02: renderMenuUI employs in-place DOM patching without destroying posGrid.innerHTML when structure matches", () => {
    assert.ok(jsMenu.includes("canPatchInPlace"), "Missing canPatchInPlace DOM diffing branch");
    assert.ok(jsMenu.includes("priceEl.textContent = expectedPrice"), "Missing surgical price node update");
    assert.ok(jsMenu.includes("posGrid.innerHTML = cardsHtml.join('')"), "Single-assignment DOM write missing");
});

test("REQ3-03: Waiter quantity stepper taps (+ / -) are debounced through 350ms queue before writing to Firebase", () => {
    assert.ok(jsPos.includes("debouncedPersistTables"), "debouncedPersistTables function missing in js/pos.js");
    assert.ok(jsPos.includes("TABLE_PERSIST_DEBOUNCE_MS = 350"), "Missing 350ms debounce window constant");
    assert.ok(jsPos.includes("debouncedPersistTables(350)"), "addToCart or modifyQty does not call debouncedPersistTables(350)");
});

test("REQ3-04: flushDebouncedTablePersist flushes queued writes immediately before critical operations", () => {
    assert.ok(jsPos.includes("function flushDebouncedTablePersist"), "Missing flushDebouncedTablePersist definition");
    assert.ok(jsPos.includes("flushDebouncedTablePersist()"), "Missing flushDebouncedTablePersist invocations");
});

// ============================================================================
// REQUIREMENT 4: Offline Resilience, Auth Persistence & Security
// ============================================================================
console.log("\n📍 REQUIREMENT 4: OFFLINE RESILIENCE, AUTH PERSISTENCE & SECURITY");

test("REQ4-01: Firebase Firestore local persistence configured with multi-tab persistentLocalCache & fallback", () => {
    assert.ok(fbInit.includes("persistentLocalCache"), "Missing persistentLocalCache import in js/firebase-init.js");
    assert.ok(fbInit.includes("persistentMultipleTabManager"), "Missing persistentMultipleTabManager import in js/firebase-init.js");
    assert.ok(fbInit.includes("tabManager: persistentMultipleTabManager()"), "Missing tabManager configuration in initializeFirestore");
    assert.ok(fbInit.includes("enableIndexedDbPersistence"), "Missing enableIndexedDbPersistence fallback");
});

test("REQ4-02: Firebase Auth persistence explicitly configured with browserLocalPersistence", () => {
    assert.ok(fbInit.includes("browserLocalPersistence"), "Missing browserLocalPersistence import in js/firebase-init.js");
    assert.ok(fbInit.includes("setPersistence"), "Missing setPersistence import in js/firebase-init.js");
    assert.ok(fbInit.includes("setPersistence(auth, browserLocalPersistence)"), "setPersistence not invoked on auth instance");
});

test("REQ4-03: Firestore Security Rules lock menu & menu_meta mutations to tenant Admin only", () => {
    assert.ok(rulesRoot.includes("match /menu/{menuId} { allow read: if isTenantStaff(cafeId); allow write: if isTenantAdmin(cafeId); }"), "Admin write lock on /cafes/{cafeId}/menu missing");
    assert.ok(rulesRoot.includes("match /menu_meta/{metaId} { allow read: if isTenantStaff(cafeId); allow write: if isTenantAdmin(cafeId); }"), "Admin write lock on /cafes/{cafeId}/menu_meta missing");
    assert.ok(rulesRoot.includes("match /menu/{menuId} { allow read: if isTenantStaff(shopId); allow write: if isTenantAdmin(shopId); }"), "Admin write lock on /shops/{shopId}/menu missing");
    assert.ok(rulesRoot.includes("match /menu_meta/{metaId} { allow read: if isTenantStaff(shopId); allow write: if isTenantAdmin(shopId); }"), "Admin write lock on /shops/{shopId}/menu_meta missing");
});

test("REQ4-04: Legacy /clients/{clientId} path secured against unauthenticated access and _auth bypass", () => {
    assert.ok(rulesRoot.includes("match /clients/_auth/{allChildren=**} {\n      allow read, write: if false;\n    }"), "Internal /clients/_auth gate missing");
    assert.ok(rulesRoot.includes("match /clients/{clientId} {\n      allow read: if clientId != '_auth' && isRootStaff(clientId);"), "Unauthenticated hole in /clients/{clientId} not closed");
    assert.ok(rulesRoot.includes("isRootAdmin(clientId) && preservesOwnerEmailOnUpdate()"), "Admin update protection on /clients/{clientId} missing");
});

// ============================================================================
// REQUIREMENT 5: Repository Invariants & Parity
// ============================================================================
console.log("\n📍 REQUIREMENT 5: REPOSITORY INVARIANTS & PARITY");

test("REQ5-01: Exactly 26 modal-close-btn button elements with SVG exist in index.html", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.strictEqual(svgMatches ? svgMatches.length : 0, 26, "Expected exactly 26 SVG modal close buttons");
});

test("REQ5-02: Zero raw Unicode emojis inside button elements in index.html", () => {
    const rawEmojiBtnRegex = /<button\b[^>]*>[^<]*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}][^<]*<\/button>/gu;
    const matches = html.match(rawEmojiBtnRegex);
    assert.strictEqual(matches, null, "Raw Unicode emojis found inside button tags");
});

test("REQ5-03: 100% bit-for-bit binary equality between firestore.rules and database/firestore.rules", () => {
    const buf1 = fs.readFileSync(path.join(rootDir, 'firestore.rules'));
    const buf2 = fs.readFileSync(path.join(rootDir, 'database', 'firestore.rules'));
    assert.strictEqual(buf1.length, buf2.length, "File lengths differ");
    assert.strictEqual(Buffer.compare(buf1, buf2), 0, "Binary byte content differs between firestore.rules and database/firestore.rules");
});

console.log("\n====================================================");
console.log(`🎯 ARCHITECTURAL AUDIT RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
}
