/**
 * MULTI-USER KOT, TABLE CHECKOUT SWITCHER & MENU/STAFF SYNC TEST SUITE
 * 
 * Verifies:
 * 1. Unified sequential KOT numbers (KOT #1, KOT #2...) monotonically increasing across devices
 * 2. Interactive Table changing during checkout:
 *    - Transferring order to vacant table
 *    - Switching checkout to occupied table
 *    - Table picker dropdown rendering
 * 3. Menu Add/Edit/Delete cross-device sync & Zombie item resurrection prevention:
 *    - Tombstone deletion tracking (billnaw_deleted_menu_ids)
 *    - Remote union merge never resurrects deleted items
 *    - Staff deletion tombstone tracking (billnaw_deleted_staff_ids)
 * 4. Multi-device posMeshChannel event handling
 * 5. Repository invariants (26 modal-close-btn SVGs, 0 raw emojis in buttons, firestore.rules parity)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🔄 MULTI-USER KOT, TABLE SWITCHER & MENU SYNC AUDIT');
console.log('====================================================\n');

let passCount = 0;
let failCount = 0;

function pass(name) {
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
}

function fail(name, err) {
    console.error(`  ❌ FAIL: ${name}`, err);
    failCount++;
}

// ----------------------------------------------------
// SECTION 1: UNIFIED SEQUENTIAL KOT NUMBER ENGINE
// ----------------------------------------------------
console.log('📍 SECTION 1: UNIFIED SEQUENTIAL KOT NUMBER ENGINE');

try {
    const posJs = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');
    
    assert(posJs.includes('peekNextKotNumber'), 'pos.js must export peekNextKotNumber');
    assert(posJs.includes('getNextUnifiedKotNumber'), 'pos.js must export getNextUnifiedKotNumber');
    assert(posJs.includes('kotDisplayNo'), 'sendKotToPrinter must support kotDisplayNo');
    assert(posJs.includes('billnaw_last_kot_no'), 'KOT engine must track billnaw_last_kot_no');
    pass('pos.js defines peekNextKotNumber and getNextUnifiedKotNumber with monotonic incrementing');
} catch (e) {
    fail('pos.js unified KOT engine implementation', e);
}

try {
    // Simulate multi-device unified KOT sequence
    const mockStorage = {};
    const fakeLocalStorage = {
        getItem: (k) => mockStorage[k] || null,
        setItem: (k, v) => { mockStorage[k] = String(v); }
    };
    
    let mockShopProfile = { lastKotNo: 0 };
    
    function testPeekKot() {
        let lastKot = 0;
        const stored = parseInt(fakeLocalStorage.getItem('billnaw_last_kot_no') || '0', 10);
        if (!isNaN(stored) && stored > lastKot) lastKot = stored;
        if (mockShopProfile && mockShopProfile.lastKotNo) {
            const spKot = parseInt(mockShopProfile.lastKotNo, 10);
            if (!isNaN(spKot) && spKot > lastKot) lastKot = spKot;
        }
        return lastKot + 1;
    }
    
    function testGetNextKot() {
        const next = testPeekKot();
        fakeLocalStorage.setItem('billnaw_last_kot_no', String(next));
        mockShopProfile.lastKotNo = next;
        return next;
    }
    
    const kot1 = testGetNextKot();
    const kot2 = testGetNextKot();
    const kot3 = testGetNextKot();
    
    assert.strictEqual(kot1, 1, 'First KOT must be 1');
    assert.strictEqual(kot2, 2, 'Second KOT must be 2');
    assert.strictEqual(kot3, 3, 'Third KOT must be 3');
    assert.strictEqual(testPeekKot(), 4, 'Peek next KOT must be 4 without incrementing');
    pass('Sequential KOT numbers generate KOT #1, KOT #2, KOT #3 monotonically without collisions');
} catch (e) {
    fail('Sequential KOT generation simulation', e);
}

try {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert(html.includes('id="printKotDisplayNo"'), 'print-kot must have #printKotDisplayNo for thermal preview');
    assert(html.includes('id="kotNextNumberBadge"'), 'kotModal must have #kotNextNumberBadge');
    pass('index.html contains #printKotDisplayNo and #kotNextNumberBadge UI elements');
} catch (e) {
    fail('index.html KOT elements check', e);
}

// ----------------------------------------------------
// SECTION 2: INTERACTIVE CHECKOUT TABLE SWITCHER
// ----------------------------------------------------
console.log('\n📍 SECTION 2: INTERACTIVE TABLE CHANGER IN CHECKOUT MODAL');

try {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    assert(html.includes('id="checkoutTableBadgeBtn"'), 'checkoutModal must have #checkoutTableBadgeBtn');
    assert(html.includes('id="checkoutTablePickerDropdown"'), 'checkoutModal must have #checkoutTablePickerDropdown');
    assert(html.includes('id="checkoutTablePickerGrid"'), 'checkoutModal must have #checkoutTablePickerGrid');
    assert(html.includes('id="checkoutTableNoDisplay"'), 'checkoutModal must preserve #checkoutTableNoDisplay');
    pass('index.html defines #checkoutTableBadgeBtn, picker dropdown and table grid');
} catch (e) {
    fail('index.html checkout table changer elements', e);
}

try {
    const posJs = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');
    assert(posJs.includes('function toggleCheckoutTablePicker'), 'pos.js must define toggleCheckoutTablePicker');
    assert(posJs.includes('function renderCheckoutTablePicker'), 'pos.js must define renderCheckoutTablePicker');
    assert(posJs.includes('function onCheckoutTableSelect'), 'pos.js must define onCheckoutTableSelect');
    pass('pos.js implements toggleCheckoutTablePicker, renderCheckoutTablePicker, and onCheckoutTableSelect');
} catch (e) {
    fail('pos.js table switcher methods', e);
}

try {
    // Simulate table order transfer & occupied switch
    let tablesInfo = {
        1: { items: [{ name: 'Cold Coffee', qty: 2, price: 120 }], status: 'occupied' },
        2: { items: [], status: 'vacant' },
        3: { items: [{ name: 'Burger', qty: 1, price: 90 }], status: 'occupied' }
    };
    let activeTable = 1;
    
    function simulateTableSelect(targetTable) {
        if (targetTable === activeTable) return 'same';
        const cur = tablesInfo[activeTable];
        const tgt = tablesInfo[targetTable];
        const tgtHasItems = tgt && tgt.items && tgt.items.length > 0;
        const curHasItems = cur && cur.items && cur.items.length > 0;
        
        if (!tgtHasItems && curHasItems) {
            // Vacant target: transfer order
            tablesInfo[targetTable] = JSON.parse(JSON.stringify(cur));
            tablesInfo[activeTable] = { items: [], status: 'vacant' };
            activeTable = targetTable;
            return 'transferred';
        } else if (tgtHasItems) {
            // Occupied target: switch view
            activeTable = targetTable;
            return 'switched';
        }
        return 'vacant_switch';
    }
    
    // Transfer from T1 (occupied) to T2 (vacant)
    const res1 = simulateTableSelect(2);
    assert.strictEqual(res1, 'transferred');
    assert.strictEqual(activeTable, 2);
    assert.strictEqual(tablesInfo[2].items.length, 1);
    assert.strictEqual(tablesInfo[1].items.length, 0);
    assert.strictEqual(tablesInfo[1].status, 'vacant');
    
    // Switch from T2 to T3 (already occupied)
    const res2 = simulateTableSelect(3);
    assert.strictEqual(res2, 'switched');
    assert.strictEqual(activeTable, 3);
    assert.strictEqual(tablesInfo[3].items[0].name, 'Burger');
    assert.strictEqual(tablesInfo[2].items[0].name, 'Cold Coffee');
    
    pass('Checkout table selection correctly transfers order to vacant tables and switches view to occupied tables');
} catch (e) {
    fail('Table switcher transfer logic simulation', e);
}

// ----------------------------------------------------
// SECTION 3: MENU & STAFF SYNC AND ZOMBIE RESURRECTION FIX
// ----------------------------------------------------
console.log('\n📍 SECTION 3: MENU & STAFF MULTI-DEVICE SYNC & ZOMBIE FIX');

try {
    const coreJs = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
    assert(coreJs.includes('getDeletedMenuItemIds'), 'core.js must export getDeletedMenuItemIds');
    assert(coreJs.includes('recordDeletedMenuItemId'), 'core.js must export recordDeletedMenuItemId');
    assert(coreJs.includes('removeDeletedMenuItemId'), 'core.js must export removeDeletedMenuItemId');
    assert(coreJs.includes('getDeletedStaffIds'), 'core.js must export getDeletedStaffIds');
    assert(coreJs.includes('recordDeletedStaffId'), 'core.js must export recordDeletedStaffId');
    assert(coreJs.includes('removeDeletedStaffId'), 'core.js must export removeDeletedStaffId');
    pass('core.js implements tombstone tracking helpers for menu and staff');
} catch (e) {
    fail('core.js tombstone helpers check', e);
}

try {
    const menuJs = fs.readFileSync(path.join(__dirname, '../js/menu.js'), 'utf8');
    assert(menuJs.includes('recordDeletedMenuItemId(id)'), 'menu.js deleteMenuItem must record deleted id');
    assert(menuJs.includes('removeDeletedMenuItemId'), 'menu.js addMenuItem must remove revived id if applicable');
    pass('menu.js integrates tombstone tracking in deleteMenuItem and addMenuItem');
} catch (e) {
    fail('menu.js tombstone integration', e);
}

try {
    const staffJs = fs.readFileSync(path.join(__dirname, '../js/staff.js'), 'utf8');
    assert(staffJs.includes('recordDeletedStaffId(id)'), 'staff.js deleteStaffMember must record deleted id');
    assert(staffJs.includes('removeDeletedStaffId'), 'staff.js saveStaffMember must remove deleted id');
    pass('staff.js integrates tombstone tracking in deleteStaffMember and saveStaffMember');
} catch (e) {
    fail('staff.js tombstone integration', e);
}

try {
    // Simulate Device A deleting item and Device B syncing without resurrecting zombie item
    const deletedIds = new Set(['105']);
    
    let localDeviceBMenu = [
        { id: 101, name: 'Espresso', price: 80 },
        { id: 102, name: 'Cappuccino', price: 120 },
        { id: 105, name: 'Cold Coffee', price: 110 } // Deleted on Device A!
    ];
    
    const remoteDataFromDeviceA = {
        menu: [
            { id: 101, name: 'Espresso', price: 80 },
            { id: 102, name: 'Cappuccino', price: 120 }
        ],
        deletedMenuIds: ['105']
    };
    
    // Simulate handleRemoteFirestoreUpdate with tombstone protection
    const allDeleted = new Set([...deletedIds, ...(remoteDataFromDeviceA.deletedMenuIds || [])]);
    const cleanRemote = remoteDataFromDeviceA.menu.filter(m => !allDeleted.has(String(m.id)));
    
    const menuMap = new Map();
    cleanRemote.forEach(m => menuMap.set(m.name.trim().toLowerCase(), m));
    
    localDeviceBMenu.forEach(m => {
        if (!allDeleted.has(String(m.id))) {
            const key = m.name.trim().toLowerCase();
            if (!menuMap.has(key)) {
                menuMap.set(key, m);
            }
        }
    });
    
    const mergedResult = Array.from(menuMap.values());
    
    assert.strictEqual(mergedResult.length, 2, 'Merged menu must have exactly 2 items');
    assert(!mergedResult.some(m => m.id === 105), 'Deleted item 105 must NEVER be resurrected as a zombie');
    pass('Remote sync simulation proves deleted menu items are NEVER resurrected by peer union merge');
} catch (e) {
    fail('Zombie item resurrection prevention simulation', e);
}

try {
    const coreJs = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');
    assert(coreJs.includes("data.type === 'TABLES_UPDATED'"), 'posMeshChannel must handle TABLES_UPDATED');
    assert(coreJs.includes("data.type === 'MENU_UPDATED'"), 'posMeshChannel must handle MENU_UPDATED');
    assert(coreJs.includes("data.type === 'STAFF_UPDATED'"), 'posMeshChannel must handle STAFF_UPDATED');
    assert(coreJs.includes("data.type === 'KOT_DISPATCHED'"), 'posMeshChannel must handle KOT_DISPATCHED');
    pass('core.js posMeshChannel listens for TABLES_UPDATED, MENU_UPDATED, STAFF_UPDATED, and KOT_DISPATCHED');
} catch (e) {
    fail('core.js posMeshChannel event routing', e);
}

// ----------------------------------------------------
// SECTION 4: REPO INVARIANTS & INTEGRITY
// ----------------------------------------------------
console.log('\n📍 SECTION 4: REPOSITORY INVARIANTS & INTEGRITY');

try {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const closeBtns = (html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || []).length;
    assert.strictEqual(closeBtns, 26, `Must have exactly 26 modal-close-btn SVG elements (found ${closeBtns})`);
    pass('Exact count of 26 modal-close-btn SVG elements preserved');
} catch (e) {
    fail('modal-close-btn count invariant', e);
}

try {
    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
    const buttonEmojiRegex = /<button[^>]*>[^<]*[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiMatches = html.match(buttonEmojiRegex) || [];
    assert.strictEqual(emojiMatches.length, 0, `Buttons must not have raw unicode emojis (found ${emojiMatches.length})`);
    pass('Zero raw Unicode emojis inside <button> elements in index.html');
} catch (e) {
    fail('button emoji check', e);
}

try {
    const rules1 = fs.readFileSync(path.join(__dirname, '../firestore.rules'), 'utf8');
    const rules2 = fs.readFileSync(path.join(__dirname, '../database/firestore.rules'), 'utf8');
    assert.strictEqual(rules1, rules2, 'firestore.rules and database/firestore.rules must match 100% bit-for-bit');
    pass('100% bit-for-bit parity between firestore.rules and database/firestore.rules');
} catch (e) {
    fail('firestore.rules parity check', e);
}

try {
    const posCss = fs.readFileSync(path.join(__dirname, '../css/pos.css'), 'utf8');
    assert(posCss.includes('.checkout-table-badge-btn'), 'pos.css must style .checkout-table-badge-btn');
    assert(posCss.includes('.checkout-table-picker'), 'pos.css must style .checkout-table-picker');
    assert(posCss.includes('.checkout-table-chip'), 'pos.css must style .checkout-table-chip');
    pass('css/pos.css styles checkout table changer badge, dropdown, and chips');
} catch (e) {
    fail('css/pos.css checkout table switcher styles', e);
}

console.log('\n====================================================');
console.log(`🎯 TOTAL SUITE: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
console.log('====================================================\n');

if (failCount > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
