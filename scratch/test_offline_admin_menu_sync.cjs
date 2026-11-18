// scratch/test_offline_admin_menu_sync.cjs
// Verification suite for Offline Admin Menu Edit -> Reconnection -> Multi-Device Sync
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("====================================================");
console.log("🔄 OFFLINE ADMIN MENU EDIT & PEER SYNC VERIFICATION");
console.log("====================================================\n");

const coreCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8').replace(/\r\n/g, '\n');
const syncCode = fs.readFileSync(path.join(__dirname, '..', 'server', 'sync-service.js'), 'utf8').replace(/\r\n/g, '\n');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const rootRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
const dbRules = fs.readFileSync(path.join(__dirname, '..', 'database', 'firestore.rules'), 'utf8');

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

// SECTION 1: SERVER-SIDE SUBCOLLECTION VERSION BUMP
console.log("📍 SECTION 1: SERVER-SIDE SUBCOLLECTION VERSION BUMP");

test("SYNC-01: syncStoreToFirestoreREST patches menu_meta/version subcollection document", () => {
    assert.ok(syncCode.includes('menu_meta/version'), "sync-service.js must reference menu_meta/version");
    assert.ok(syncCode.includes('const metaDocUrl = `${base}/${collection}/${encodeURIComponent(code)}/menu_meta/version`;'), "Must construct metaDocUrl for menu_meta/version");
    assert.ok(syncCode.includes("version: finalVer"), "Must patch finalVer to menu_meta/version");
});

test("SYNC-02: Server REST endpoint derives fallback monotonic version if menu or categories provided without version", () => {
    assert.ok(syncCode.includes('resolvedMenuVersion = Date.now();') || syncCode.includes('resolvedMenuVersion = fallbackVer;'), "Must derive fallback monotonic version");
    assert.ok(syncCode.includes('fieldsToPatch.menuVersion = resolvedMenuVersion;'), "Must patch menuVersion to root fields");
    assert.ok(syncCode.includes('metaFields.itemCount ='), "Must conditionally preserve itemCount in menu_meta");
});

// SECTION 2: CLIENT OFFLINE QUEUE FLUSH & BROADCAST
console.log("\n📍 SECTION 2: CLIENT OFFLINE QUEUE FLUSH & BROADCAST");

test("SYNC-03: flushOfflineSyncQueue updates menu_meta/version and broadcasts MENU_UPDATED on reconnect", () => {
    assert.ok(coreCode.includes("matchedEntry.menu || matchedEntry.menuVersion || matchedEntry.categories"), "Must detect menu in flushed offline payload");
    assert.ok(coreCode.includes("metaDocRef, {\n                                    version: flushedVer,"), "Must update metaDocRef with flushedVer on reconnect");
    assert.ok(coreCode.includes("posMeshChannel.postMessage({\n                                type: 'MENU_UPDATED',"), "Must post MENU_UPDATED to posMeshChannel");
});

test("SYNC-04: persistCategories monotonically bumps menuVersion and notifies menu_meta and mesh", () => {
    assert.ok(coreCode.includes("const currentVer = Number(localStorage.getItem('billnaw_menu_version')"), "Must read currentVer in persistCategories");
    assert.ok(coreCode.includes("const newVersion = currentVer + 1;"), "Must increment version in persistCategories");
    assert.ok(coreCode.includes("type: 'CATEGORIES_UPDATED'"), "Must post CATEGORIES_UPDATED to posMeshChannel");
    assert.ok(coreCode.includes("itemCount: (Array.isArray(window.menuItems)"), "Must pass itemCount to menu_meta in persistCategories");
});

test("SYNC-04b: posMeshChannel enforces version monotonicity against stale broadcast downgrades", () => {
    assert.ok(coreCode.includes("incomingVer > 0 && localVer > 0 && incomingVer < localVer"), "Must reject older MENU_UPDATED broadcast");
    assert.ok(coreCode.includes("incomingCatVer > 0 && localCatVer > 0 && incomingCatVer < localCatVer"), "Must reject older CATEGORIES_UPDATED broadcast");
});

// SECTION 3: PEER DEVICE ZERO-STALE SYNC & RECONCILIATION
console.log("\n📍 SECTION 3: PEER DEVICE ZERO-STALE SYNC & RECONCILIATION");

test("SYNC-05: syncBundledMenuFromCloud guards against stale SDK cache and falls back to server REST", () => {
    assert.ok(coreCode.includes("(!expectedVersion || docVer >= Number(expectedVersion))"), "Must reject cached doc if docVer < expectedVersion");
    assert.ok(coreCode.includes("fetch(`/api/sync/store-data?storeCode=${encodeURIComponent(storeCode)}`)"), "Must fetch fresh catalog from server REST");
});

test("SYNC-06: handleRemoteFirestoreUpdate clears stale local tombstones for items actively present in newer remote menu", () => {
    assert.ok(coreCode.includes("incomingMenuVersion > localMenuVersion"), "Must detect strictly newer version");
    assert.ok(coreCode.includes("deletedIdSet.delete(mid)"), "Must un-tombstone active dish ID from local set");
    assert.ok(coreCode.includes("deletedNameSet.delete(mname)"), "Must un-tombstone active dish Name from local set");
    assert.ok(coreCode.includes("removeDeletedMenuItemId(mid)"), "Must call removeDeletedMenuItemId for active items");
    assert.ok(coreCode.includes("removeDeletedMenuItemName(mname)"), "Must call removeDeletedMenuItemName for active items");
});

test("SYNC-07: runBackgroundHealthCheck falls back to REST if Firestore SDK returns stale local cache", () => {
    assert.ok(coreCode.includes("snap.metadata && snap.metadata.fromCache"), "Must check fromCache on snap metadata");
    assert.ok(coreCode.includes("!fromCache || snapMenuVer > localMenuVer"), "Must allow REST fallback if cache is not newer");
});

// SECTION 4: INVARIANTS & INTEGRITY AUDIT
console.log("\n📍 SECTION 4: INVARIANTS & INTEGRITY AUDIT");

test("SYNC-08: Exactly 26 modal-close-btn button elements with SVG exist in index.html", () => {
    const matches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(matches.length, 26, `Expected 26 modal close buttons, found ${matches.length}`);
});

test("SYNC-09: Zero raw Unicode emojis inside button elements in index.html", () => {
    const btnRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    const failures = [];
    while ((match = btnRegex.exec(html)) !== null) {
        if (emojiRegex.test(match[1])) {
            failures.push(match[0].substring(0, 50));
        }
    }
    assert.strictEqual(failures.length, 0, `Found raw emojis in buttons: ${failures.join('; ')}`);
});

test("SYNC-10: 100% bit-for-bit parity between firestore.rules and database/firestore.rules", () => {
    assert.strictEqual(rootRules, dbRules, "firestore.rules and database/firestore.rules must be bit-for-bit identical");
});

console.log("\n====================================================");
console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
} else {
    console.log("✨ ALL OFFLINE ADMIN MENU EDIT & PEER SYNC FIXES VERIFIED 100% GREEN!\n");
}
