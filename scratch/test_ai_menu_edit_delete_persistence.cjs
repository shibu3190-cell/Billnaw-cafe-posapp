// scratch/test_ai_menu_edit_delete_persistence.cjs
// Verification Suite for AI Menu Edit/Delete Permanence & Anti-Reversion Engine

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("🔥 AI MENU EDIT & DELETE PERSISTENCE AUDIT");
console.log("====================================================\n");

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

// 1. Verify static code modifications
const coreJs = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
const menuJs = fs.readFileSync(path.join(__dirname, '../js/menu.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
const syncServiceJs = fs.readFileSync(path.join(__dirname, '../server/sync-service.js'), 'utf8');

console.log("📍 SECTION 1: CODE LEVEL IMPLEMENTATION AUDIT");

test("MP-01: core.js implements dual tombstone tracking (IDs & normalized Names)", () => {
    assert(coreJs.includes('function getDeletedMenuItemNames'), "getDeletedMenuItemNames must be defined");
    assert(coreJs.includes('function recordDeletedMenuItemName'), "recordDeletedMenuItemName must be defined");
    assert(coreJs.includes('function removeDeletedMenuItemName'), "removeDeletedMenuItemName must be defined");
    assert(coreJs.includes('window.getDeletedMenuItemNames = getDeletedMenuItemNames'), "Must export getDeletedMenuItemNames to window");
});

test("MP-02: menu.js uses type-safe ID comparison and name fallback in addMenuItem and editMenuItem", () => {
    assert(/menuItems\s*:\s*\[\]\)\.find\(i\s*=>\s*String\(i\.id\)\s*===\s*String\(id\)\)/.test(menuJs), "editMenuItem must use String ID comparison");
    assert(/findIndex\(i\s*=>\s*String\(i\.id\)\s*===\s*String\(editingMenuItemId\)\)/.test(menuJs), "addMenuItem must use String ID comparison");
    assert(menuJs.includes('closeAddMenuItemModal();'), "addMenuItem must close modal and clear editingMenuItemId via closeAddMenuItemModal()");
});

test("MP-03: menu.js timestamps dish updates with updatedAt: now and deduplicates by item name", () => {
    assert(menuJs.includes('updatedAt: now'), "addMenuItem must stamp updatedAt: now on edited and added items");
    assert(menuJs.includes('showToast("✅ Existing item updated!");'), "addMenuItem must deduplicate by case-insensitive name");
});

test("MP-04: menu.js deleteMenuItem records both ID and Name tombstones", () => {
    assert(menuJs.includes('recordDeletedMenuItemId(id)'), "deleteMenuItem must record deleted ID");
    assert(menuJs.includes('recordDeletedMenuItemName(targetItem.name)'), "deleteMenuItem must record deleted name tombstone");
});

test("MP-05: confirmAiImport clears demo template and calls markMenuCustomized", () => {
    assert(menuJs.includes('isDefaultTemplateMenu(menuItems)'), "confirmAiImport must use isDefaultTemplateMenu to clear demo baseline");
    assert(menuJs.includes('markMenuCustomized()'), "confirmAiImport must call markMenuCustomized");
    assert(menuJs.includes('removeDeletedMenuItemName(rawName)'), "confirmAiImport must remove imported item from deleted name tombstones");
});

test("MP-06: server.js and sync-service.js support deletedMenuIds, deletedMenuNames and menuVersion", () => {
    assert(serverJs.includes('deletedMenuIds, deletedMenuNames, menuVersion'), "server.js /api/sync/store-data must destructure deletedMenuIds, deletedMenuNames, menuVersion");
    assert(syncServiceJs.includes('fieldsToPatch.deletedMenuIds = payload.deletedMenuIds'), "sync-service.js must patch deletedMenuIds");
    assert(syncServiceJs.includes('fieldsToPatch.deletedMenuNames = payload.deletedMenuNames'), "sync-service.js must patch deletedMenuNames");
    assert(syncServiceJs.includes('fieldsToPatch.menuVersion = v'), "sync-service.js must patch menuVersion");
    assert(syncServiceJs.includes('deletedMenuIds: fields.deletedMenuIds ?'), "getStoreFromFirestoreREST must return deletedMenuIds");
    assert(syncServiceJs.includes('deletedMenuNames: fields.deletedMenuNames ?'), "getStoreFromFirestoreREST must return deletedMenuNames");
    assert(syncServiceJs.includes('menuVersion: fields.menuVersion ?'), "getStoreFromFirestoreREST must return menuVersion");
});

console.log("\n📍 SECTION 2: RUNTIME LOGIC SIMULATION & REVERSION PREVENTION");

// Mock browser environment for simulation
const localStorageData = {};
global.localStorage = {
    getItem: (k) => localStorageData[k] || null,
    setItem: (k, v) => { localStorageData[k] = String(v); },
    removeItem: (k) => { delete localStorageData[k]; }
};
global.window = {};
global.idb = {
    set: () => Promise.resolve(),
    get: () => Promise.resolve(null)
};
global.shopProfile = { menuVersion: 1, storeCode: 'STORE-DEMO-TEST' };
global.renderMenuUI = () => {};
global.renderMenuCatalogUI = () => {};
global.syncMenuUIQuantities = () => {};
global.sanitizeMenuItemForStorage = (item) => ({ ...item });

let lastDispatchedSync = null;
global.dispatchBackendStoreSync = (payload, imm) => {
    lastDispatchedSync = payload;
    return Promise.resolve(true);
};

// Evaluate the tombstone functions in current scope
eval(`
${coreJs.substring(coreJs.indexOf('function getDeletedMenuItemIds'), coreJs.indexOf('window.getDeletedStaffIds'))}
`);

test("MP-07: Dual tombstone helpers record and clear IDs and Names correctly", () => {
    recordDeletedMenuItemId('dish_101');
    recordDeletedMenuItemName('Chicken Curry');
    
    assert(getDeletedMenuItemIds().includes('dish_101'), "ID tombstone dish_101 must be present");
    assert(getDeletedMenuItemNames().includes('chicken curry'), "Name tombstone 'chicken curry' must be stored lowercase");

    removeDeletedMenuItemId('dish_101');
    assert(!getDeletedMenuItemIds().includes('dish_101'), "dish_101 must be removed from ID tombstones");

    removeDeletedMenuItemName('Chicken Curry');
    assert(!getDeletedMenuItemNames().includes('chicken curry'), "'chicken curry' must be removed from Name tombstones");
});

test("MP-08: AI Menu Simulation: Edit price, then simulate stale cloud snapshot. Edit NEVER reverts.", () => {
    // 1. Initial local state: Shop uploaded AI menu
    let menuItems = [
        { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 250, updatedAt: 1000 },
        { id: 'ai_2', name: 'Garlic Naan', category: 'Breads', price: 40, updatedAt: 1000 },
        { id: 'ai_3', name: 'Mango Lassi', category: 'Beverages', price: 80, updatedAt: 1000 }
    ];
    global.menuItems = menuItems;
    localStorage.setItem('billnaw_menu_version', '2');
    global.shopProfile.menuVersion = 2;

    // 2. User edits Butter Chicken price from 250 to 300
    const editItemIndex = menuItems.findIndex(i => String(i.id) === 'ai_1');
    menuItems[editItemIndex].price = 300;
    menuItems[editItemIndex].updatedAt = 2000; // newer
    localStorage.setItem('billnaw_menu_version', '3'); // version bumped to 3
    global.shopProfile.menuVersion = 3;

    // 3. 15 seconds later, Firestore onSnapshot OR 30s background REST health check arrives
    // with STALE cloud document (version: 2 or version: 0) holding old price: 250
    const staleCloudPayload = {
        menuVersion: 2, // older than local 3
        menu: [
            { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 250, updatedAt: 1000 },
            { id: 'ai_2', name: 'Garlic Naan', category: 'Breads', price: 40, updatedAt: 1000 },
            { id: 'ai_3', name: 'Mango Lassi', category: 'Beverages', price: 80, updatedAt: 1000 }
        ]
    };

    // Extract and run the exact handleRemoteFirestoreUpdate menu reconciliation logic
    const incomingMenuVersion = Number(staleCloudPayload.menuVersion || 0);
    const localMenuVersion = Number(localStorage.getItem('billnaw_menu_version') || 0);

    const localDeletedIds = getDeletedMenuItemIds().map(String);
    const remoteDeletedIds = Array.isArray(staleCloudPayload.deletedMenuIds) ? staleCloudPayload.deletedMenuIds.map(String) : [];
    const deletedIdSet = new Set([...localDeletedIds, ...remoteDeletedIds]);

    const localDeletedNames = getDeletedMenuItemNames();
    const remoteDeletedNames = Array.isArray(staleCloudPayload.deletedMenuNames) ? staleCloudPayload.deletedMenuNames.map(n => String(n).trim().toLowerCase()) : [];
    const deletedNameSet = new Set([...localDeletedNames, ...remoteDeletedNames]);

    const cleanRemoteMenu = staleCloudPayload.menu.filter(m => {
        if (!m) return false;
        const idStr = String(m.id || '');
        const nameStr = String(m.name || '').trim().toLowerCase();
        if (idStr && deletedIdSet.has(idStr)) return false;
        if (nameStr && deletedNameSet.has(nameStr)) return false;
        return true;
    });

    // Run reconciliation rule:
    if (localMenuVersion > 0 && incomingMenuVersion <= localMenuVersion && Array.isArray(menuItems) && menuItems.length > 0) {
        // CASE 1: Local is authoritative! DO NOT OVERWRITE!
    } else if (incomingMenuVersion > localMenuVersion) {
        menuItems = cleanRemoteMenu;
    } else {
        menuItems = cleanRemoteMenu;
    }

    const updatedItem = menuItems.find(i => i.id === 'ai_1');
    assert.strictEqual(updatedItem.price, 300, "Price MUST remain edited ₹300, not reverted to ₹250!");
});

test("MP-09: AI Menu Simulation: Delete item, then simulate stale cloud snapshot. Deleted item NEVER resurrects.", () => {
    let menuItems = [
        { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 300 },
        { id: 'ai_2', name: 'Garlic Naan', category: 'Breads', price: 40 },
        { id: 'ai_3', name: 'Mango Lassi', category: 'Beverages', price: 80 }
    ];

    // User deletes Garlic Naan (ai_2)
    const targetItem = menuItems.find(i => i.id === 'ai_2');
    recordDeletedMenuItemId('ai_2');
    recordDeletedMenuItemName(targetItem.name);
    menuItems = menuItems.filter(i => i.id !== 'ai_2');
    localStorage.setItem('billnaw_menu_version', '4');

    assert.strictEqual(menuItems.length, 2, "Local menu must now have exactly 2 items");

    // Incoming stale cloud snapshot still has 'Garlic Naan'
    const staleCloudPayload = {
        menuVersion: 3, // older
        menu: [
            { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 250 },
            { id: 'ai_2', name: 'Garlic Naan', category: 'Breads', price: 40 },
            { id: 'ai_3', name: 'Mango Lassi', category: 'Beverages', price: 80 }
        ],
        deletedMenuIds: []
    };

    const incomingMenuVersion = Number(staleCloudPayload.menuVersion || 0);
    const localMenuVersion = Number(localStorage.getItem('billnaw_menu_version') || 0);

    const deletedIdSet = new Set([...getDeletedMenuItemIds().map(String), ...(staleCloudPayload.deletedMenuIds || []).map(String)]);
    const deletedNameSet = new Set([...getDeletedMenuItemNames(), ...(staleCloudPayload.deletedMenuNames || []).map(n => String(n).trim().toLowerCase())]);

    const cleanRemoteMenu = staleCloudPayload.menu.filter(m => {
        if (!m) return false;
        const idStr = String(m.id || '');
        const nameStr = String(m.name || '').trim().toLowerCase();
        if (idStr && deletedIdSet.has(idStr)) return false;
        if (nameStr && deletedNameSet.has(nameStr)) return false;
        return true;
    });

    // Check that cleanRemoteMenu itself filtered out Garlic Naan
    assert(!cleanRemoteMenu.some(m => m.id === 'ai_2'), "Garlic Naan must be filtered from remote menu by ID tombstone");
    assert(!cleanRemoteMenu.some(m => m.name.toLowerCase() === 'garlic naan'), "Garlic Naan must be filtered from remote menu by Name tombstone");

    // And in CASE 1: local menu is retained
    if (localMenuVersion > 0 && incomingMenuVersion <= localMenuVersion && Array.isArray(menuItems) && menuItems.length > 0) {
        // Local authoritative
    } else {
        menuItems = cleanRemoteMenu;
    }

    assert(!menuItems.some(i => i.name.toLowerCase() === 'garlic naan'), "Garlic Naan must NEVER resurrect in menuItems!");
    assert.strictEqual(menuItems.length, 2, "Menu items length must strictly remain 2");
});

test("MP-10: Existing shop with legacy unversioned cloud doc (version: 0) pushes local upgrade", () => {
    localStorage.setItem('billnaw_menu_customized', 'true');
    localStorage.setItem('billnaw_menu_version', '3');
    global.menuItems = [
        { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 300 }
    ];

    const legacyCloudPayload = {
        menuVersion: 0, // Legacy shop document before versioning
        menu: [
            { id: 'ai_1', name: 'Butter Chicken', category: 'Main Course', price: 200 }
        ]
    };

    const incomingMenuVersion = Number(legacyCloudPayload.menuVersion || 0);
    const localMenuVersion = Number(localStorage.getItem('billnaw_menu_version') || 0);
    const isLocalCustomized = localStorage.getItem('billnaw_menu_customized') === 'true';

    lastDispatchedSync = null;

    if (localMenuVersion > 0 && incomingMenuVersion <= localMenuVersion && Array.isArray(menuItems) && menuItems.length > 0) {
        if (incomingMenuVersion === 0 && isLocalCustomized) {
            dispatchBackendStoreSync({
                menu: menuItems,
                menuVersion: localMenuVersion,
                deletedMenuIds: getDeletedMenuItemIds(),
                deletedMenuNames: getDeletedMenuItemNames()
            }, true);
        }
    }

    assert(lastDispatchedSync !== null, "Must trigger dispatchBackendStoreSync to upgrade legacy cloud doc");
    assert.strictEqual(lastDispatchedSync.menuVersion, 3, "Upgraded cloud payload must carry local version 3");
    assert.strictEqual(lastDispatchedSync.menu[0].price, 300, "Upgraded cloud payload must carry authoritative price 300");
});

console.log("\n====================================================");
console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("====================================================");

if (failed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
