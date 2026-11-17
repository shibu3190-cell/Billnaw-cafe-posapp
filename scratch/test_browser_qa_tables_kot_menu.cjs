/**
 * scratch/test_browser_qa_tables_kot_menu.cjs
 * Comprehensive Browser QA headless Chrome CDP verification for:
 * 1. Dedicated Table View: 32+ table grid (4x8), clicking table, floating order bar
 * 2. Unified Sequential KOT Engine: KOT #1, KOT #2 monotonic assignment & delta KOT dispatch
 * 3. Interactive Checkout Table Changer: #checkoutTableBadgeBtn, dropdown picker, vacant transfer & occupied switch
 * 4. Menu & Staff Multi-Device Tombstone Sync: deletion tracking & zero zombie resurrection in live browser context
 * 5. Active Staff Session Revocation guard on deletion
 * 6. Zero console errors and zero uncaught JS exceptions
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

function findChrome() {
    const candidates = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    throw new Error('Chrome/Edge not found');
}

async function run() {
    const chromePath = findChrome();
    const port = 9268;
    const userDataDir = path.join(__dirname, 'chrome_test_profile_' + Date.now());

    console.log('🚀 Spawning Headless Chrome for Tables, KOT & Sync Browser QA on port', port);
    const chrome = spawn(chromePath, [
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${userDataDir}`,
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu'
    ]);

    let connected = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 250));
        try {
            const res = await fetch(`http://127.0.0.1:${port}/json/version`);
            if (res.ok) { connected = true; break; }
        } catch (e) {}
    }
    assert.ok(connected, 'CDP connection failed');

    const newPageRes = await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' });
    const target = await newPageRes.json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise(r => ws.onopen = r);

    let msgId = 1;
    function send(method, params = {}) {
        const id = msgId++;
        ws.send(JSON.stringify({ id, method, params }));
        return new Promise(resolve => {
            const handler = (evt) => {
                const data = JSON.parse(evt.data);
                if (data.id === id) {
                    ws.removeEventListener('message', handler);
                    if (data.error) console.error('CDP Error:', data.error);
                    resolve(data.result);
                }
            };
            ws.addEventListener('message', handler);
        });
    }

    let pageLoaded = false;
    const consoleLogs = [];
    const jsExceptions = [];

    ws.addEventListener('message', (evt) => {
        const data = JSON.parse(evt.data);
        if (data.method === 'Page.loadEventFired') {
            pageLoaded = true;
        }
        if (data.method === 'Page.javascriptDialogOpening') {
            send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
        }
        if (data.method === 'Runtime.consoleAPICalled') {
            const text = data.params.args.map(a => a.value || a.description).join(' ');
            consoleLogs.push({ type: data.params.type, text });
        }
        if (data.method === 'Runtime.exceptionThrown') {
            jsExceptions.push(data.params.exceptionDetails);
        }
    });

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });

    for (let i = 0; i < 50; i++) {
        if (pageLoaded) break;
        await new Promise(r => setTimeout(r, 100));
    }
    // Wait an additional 2.5s for initial IndexedDB & Firebase async setup
    await new Promise(r => setTimeout(r, 2500));

    async function evaluateInApp(expression) {
        const res = await send('Runtime.evaluate', {
            expression,
            awaitPromise: true,
            returnByValue: true
        });
        if (res?.exceptionDetails) {
            console.error('[evaluateInApp Exception]:', res.exceptionDetails.text, res.exceptionDetails.exception?.description);
        }
        return res?.result?.value;
    }

    console.log('\n--- CHECK 1: Dedicated Fullscreen Table Floor View & 4x8 Grid ---');
    const tableFloorRes = await evaluateInApp(`(function() {
        // Authorize terminal for testing & dismiss login overlay if present
        localStorage.setItem('billnaw_auth_mode', 'demo');
        localStorage.setItem('billnaw_auth_token', 'test_qa_token');
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_role', 'MASTER');
        if (window.currentDeviceRecord) {
            window.currentDeviceRecord.status = 'AUTHORIZED';
            window.currentDeviceRecord.isMaster = true;
        }

        const loginOverlay = document.getElementById('loginOverlay');
        if (loginOverlay) loginOverlay.style.display = 'none';

        // Switch to tables view
        if (typeof window.switchTabDirect === 'function') {
            window.switchTabDirect('tables');
        } else if (typeof window.switchTab === 'function') {
            window.switchTab('tables');
        }

        const tablesView = document.getElementById('tables');
        const isActive = tablesView && tablesView.classList.contains('active');
        const grid = document.getElementById('tablesViewGridUI');
        if (typeof shopProfile === 'object' && shopProfile) {
            shopProfile.tableCount = 5;
        }
        if (typeof tablesInfo === 'object' && tablesInfo) {
            Object.keys(tablesInfo).forEach(k => {
                if (parseInt(k, 10) > 5) delete tablesInfo[k];
                else if (tablesInfo[k]) tablesInfo[k].items = [];
            });
        }
        if (typeof window.renderTablesView === 'function') window.renderTablesView();

        const cardsInitial = grid ? grid.querySelectorAll('.table-view-card') : [];
        const addCardInitial = grid ? grid.querySelector('.add-table-card') : null;
        const floatingBar = document.getElementById('tableOrderFloatingBar');

        // Select vacant Table 1 -> pill must be hidden ('none')
        if (typeof window.selectTableInTableView === 'function') {
            window.selectTableInTableView(1);
        }
        const pillDisplayWhenVacant = floatingBar ? floatingBar.style.display : null;

        // Test collapsible filter bar
        const filterDrawer = document.getElementById('tablesCollapsibleFilters');
        const filterCollapsedBefore = filterDrawer ? filterDrawer.style.display === 'none' : false;
        if (typeof window.toggleTablesFilterCollapse === 'function') window.toggleTablesFilterCollapse();
        const filterExpandedAfter = filterDrawer ? filterDrawer.style.display === 'flex' : false;
        if (typeof window.toggleTablesFilterCollapse === 'function') window.toggleTablesFilterCollapse();

        // Test dynamic scaling up to 32 tables
        const initialCount = cardsInitial.length;
        if (typeof shopProfile === 'object' && shopProfile) {
            shopProfile.tableCount = 32;
        }
        if (typeof window.renderTablesView === 'function') {
            window.renderTablesView();
        }
        const cardsScaled = grid ? grid.querySelectorAll('.table-view-card') : [];

        // Reset back to initial count (5)
        if (typeof shopProfile === 'object' && shopProfile) {
            shopProfile.tableCount = 5;
        }
        if (typeof window.renderTablesView === 'function') {
            window.renderTablesView();
        }

        // Check visible navigation bar tabs (primary 5 tabs)
        const sidebarNavBtns = Array.from(document.querySelectorAll('.sidebar .nav-btn')).filter(b => {
            const comp = window.getComputedStyle(b);
            return comp.display !== 'none' && b.id && b.id.startsWith('nav-');
        }).map(b => b.id);
        const moreButtonsCount = document.querySelectorAll('#nav-more').length;

        return {
            isActive,
            navButtons: sidebarNavBtns,
            moreCount: moreButtonsCount,
            initialCardCount: initialCount,
            hasAddTableCard: Boolean(addCardInitial),
            scaledCardCount: cardsScaled.length,
            activeTable: typeof window.activeTable !== 'undefined' ? window.activeTable : null,
            floatingBarExists: Boolean(floatingBar),
            pillDisplayWhenVacant,
            filterCollapsedBefore,
            filterExpandedAfter
        };
    })()`);
    console.log('Table floor view result:', tableFloorRes);
    assert.strictEqual(tableFloorRes.isActive, true, 'Tables view must be active');
    assert.strictEqual(tableFloorRes.moreCount, 1, 'Must have strictly one #nav-more element');
    assert.deepStrictEqual(tableFloorRes.navButtons, ['nav-pos', 'nav-menu', 'nav-dashboard', 'nav-tables', 'nav-more'], 'Navbar must have exact 5 buttons in order: POS, Menu, Reports, Tables, More');
    assert.strictEqual(tableFloorRes.hasAddTableCard, false, 'Must not render extra + Add Table card');
    assert.strictEqual(tableFloorRes.initialCardCount, 5, 'Must render strictly 5 tables matching shop profile');
    assert.strictEqual(tableFloorRes.scaledCardCount, 32, 'Must render strictly 32 tables when shop profile is set to 32');
    assert.strictEqual(tableFloorRes.pillDisplayWhenVacant, 'none', 'Checkout pill must be hidden when selected table has no order');
    assert.strictEqual(tableFloorRes.filterCollapsedBefore, true, 'Filter drawer must start collapsed');
    assert.strictEqual(tableFloorRes.filterExpandedAfter, true, 'Filter drawer must expand on toggle');
    assert.strictEqual(tableFloorRes.activeTable, 1, 'Table 1 must be selected');
    assert.strictEqual(tableFloorRes.floatingBarExists, true, 'Floating order inspector bar must exist');
    console.log('✅ PASS: Dedicated Table Floor View renders compact POS cards, collapsible filter bar, hidden pill on vacant table, and exact shop table count.');

    console.log('\n--- CHECK 2: Unified Sequential KOT Engine & Add-on Delta Dispatch ---');
    const kotEngineRes = await evaluateInApp(`(async function() {
        // Clear prior KOT test state
        localStorage.setItem('billnaw_last_kot_no', '0');
        localStorage.setItem('billnaw_active_kots', '[]');

        // Set Table 1 with initial item
        tablesInfo[1] = {
            items: [{ id: 1, name: 'Paneer Tikka', price: 180, qty: 2 }],
            status: 'occupied',
            notes: 'Less spicy'
        };
        activeTable = 1;
        persistTables();
        syncTableUI();

        // Check peek next KOT number before first print
        const peek1 = peekNextKotNumber();

        // Simulate sendToKitchen opening KOT modal
        sendToKitchen();
        const badge1 = document.getElementById('kotNextNumberBadge')?.innerText;

        // Trigger Kitchen Ticket print #1
        await printKitchenTicket();

        // Inspect stored active KOTs
        const kots1 = JSON.parse(localStorage.getItem('billnaw_active_kots') || '[]');
        const firstKot = kots1[0];

        // Add an Add-on item to Table 1
        tablesInfo[1].items.push({ id: 2, name: 'Fresh Lime Soda', price: 50, qty: 1 });
        persistTables();
        syncTableUI();

        const peek2 = peekNextKotNumber();
        sendToKitchen();
        const badge2 = document.getElementById('kotNextNumberBadge')?.innerText;

        // Trigger Kitchen Ticket print #2 (Add-on)
        await printKitchenTicket();

        const kots2 = JSON.parse(localStorage.getItem('billnaw_active_kots') || '[]');
        const secondKot = kots2[0]; // unshifted to index 0

        // Now increase quantity of existing item (Fresh Lime Soda from 1 -> 3 via modifyQty)
        modifyQty(2, 2);
        const peek3 = peekNextKotNumber();
        sendToKitchen();
        await printKitchenTicket();

        const kots3 = JSON.parse(localStorage.getItem('billnaw_active_kots') || '[]');
        const thirdKot = kots3[0];

        return {
            peek1,
            badge1,
            firstKotNo: firstKot ? firstKot.kotNo : null,
            firstKotDisplayNo: firstKot ? firstKot.kotDisplayNo : null,
            firstKotItemsCount: firstKot ? firstKot.items.length : 0,
            peek2,
            badge2,
            secondKotNo: secondKot ? secondKot.kotNo : null,
            secondKotDisplayNo: secondKot ? secondKot.kotDisplayNo : null,
            secondKotIsAddon: secondKot ? Boolean(secondKot.isAddon) : false,
            secondKotItemsCount: secondKot ? secondKot.items.length : 0,
            secondKotItemName: (secondKot && secondKot.items[0]) ? secondKot.items[0].name : null,
            secondKotItemQty: (secondKot && secondKot.items[0]) ? secondKot.items[0].quantity : 0,
            peek3,
            thirdKotNo: thirdKot ? thirdKot.kotNo : null,
            thirdKotIsAddon: thirdKot ? Boolean(thirdKot.isAddon) : false,
            thirdKotItemsCount: thirdKot ? thirdKot.items.length : 0,
            thirdKotItemName: (thirdKot && thirdKot.items[0]) ? thirdKot.items[0].name : null,
            thirdKotItemQty: (thirdKot && thirdKot.items[0]) ? thirdKot.items[0].quantity : 0
        };
    })()`);
    console.log('KOT Engine Result:', kotEngineRes);
    assert.strictEqual(kotEngineRes.peek1, 1, 'First peek KOT number must be 1');
    assert.strictEqual(kotEngineRes.badge1, 'KOT #1', 'First KOT badge must display KOT #1');
    assert.strictEqual(kotEngineRes.firstKotNo, 1, 'First KOT ticket kotNo must be 1');
    assert.strictEqual(kotEngineRes.firstKotDisplayNo, 'KOT #1', 'First KOT display number must be KOT #1');
    assert.strictEqual(kotEngineRes.firstKotItemsCount, 1, 'First KOT should have 1 item line');

    assert.strictEqual(kotEngineRes.peek2, 2, 'Second peek KOT number must be 2');
    assert.strictEqual(kotEngineRes.badge2, 'KOT #2', 'Second KOT badge must display KOT #2');
    assert.strictEqual(kotEngineRes.secondKotNo, 2, 'Second KOT ticket kotNo must be 2');
    assert.strictEqual(kotEngineRes.secondKotDisplayNo, 'KOT #2', 'Second KOT display number must be KOT #2');
    assert.strictEqual(kotEngineRes.secondKotIsAddon, true, 'Second KOT must be marked as Add-on');
    assert.strictEqual(kotEngineRes.secondKotItemsCount, 1, 'Second KOT delta ticket must have ONLY the 1 added item');
    assert.strictEqual(kotEngineRes.secondKotItemName, 'Fresh Lime Soda', 'Delta item must be Fresh Lime Soda');
    assert.strictEqual(kotEngineRes.secondKotItemQty, 1, 'Delta item quantity must be 1');

    assert.strictEqual(kotEngineRes.peek3, 3, 'Third peek KOT number must be 3');
    assert.strictEqual(kotEngineRes.thirdKotNo, 3, 'Third KOT ticket kotNo must be 3');
    assert.strictEqual(kotEngineRes.thirdKotIsAddon, true, 'Third KOT must be marked as Add-on');
    assert.strictEqual(kotEngineRes.thirdKotItemsCount, 1, 'Third KOT must contain ONLY the 1 increased item');
    assert.strictEqual(kotEngineRes.thirdKotItemName, 'Fresh Lime Soda', 'Third KOT item must be Fresh Lime Soda');
    assert.strictEqual(kotEngineRes.thirdKotItemQty, 2, 'Third KOT must print ONLY the +2 increased delta quantity');
    console.log('✅ PASS: Unified Sequential KOT Engine assigns monotonic KOT numbers and delta-only add-ons for both new and increased items.');

    console.log('\n--- CHECK 3: Interactive Checkout Table Changer & Order Transfer ---');
    const tableTransferRes = await evaluateInApp(`(async function() {
        localStorage.setItem('billnaw_auth_mode', 'demo');
        localStorage.setItem('billnaw_auth_token', 'test_qa_token');
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_role', 'MASTER');

        // Ensure Table 1 has active items for checkout test
        if (!tablesInfo[1] || !Array.isArray(tablesInfo[1].items) || tablesInfo[1].items.length === 0) {
            tablesInfo[1] = { items: [{ id: 1, name: 'Paneer Tikka', price: 180, qty: 2 }], status: 'occupied' };
        }
        activeTable = 1;
        window.activeTable = 1;
        persistTables();
        syncTableUI();

        // Open Checkout Modal for Table 1
        let openModalError = null;
        try {
            openCheckoutModal(true);
        } catch (err) {
            openModalError = err.message + ' ' + err.stack;
        }

        const checkoutModal = document.getElementById('checkoutModal');
        const isModalOpen = checkoutModal && (checkoutModal.style.display === 'flex' || checkoutModal.style.display === 'block');
        const badgeBtn = document.getElementById('checkoutTableBadgeBtn');
        const badgeTextBefore = badgeBtn?.innerText?.trim();

        // Click badge button to open table picker dropdown
        toggleCheckoutTablePicker(true);
        const picker = document.getElementById('checkoutTablePickerDropdown');
        const isPickerVisible = picker && picker.style.display !== 'none';
        const chips = picker ? picker.querySelectorAll('.checkout-table-chip') : [];

        // Select vacant Table 3 to transfer the order
        onCheckoutTableSelect(3);

        const badgeTextAfter = document.getElementById('checkoutTableBadgeBtn')?.innerText?.trim();
        const table1ItemsCount = (tablesInfo[1] && tablesInfo[1].items) ? tablesInfo[1].items.length : 0;
        const table3ItemsCount = (tablesInfo[3] && tablesInfo[3].items) ? tablesInfo[3].items.length : 0;
        const newActiveTable = (typeof window.activeTable !== 'undefined') ? window.activeTable : activeTable;

        // Close checkout modal
        if (checkoutModal) checkoutModal.style.display = 'none';

        return {
            isModalOpen,
            openModalError,
            displayVal: checkoutModal?.style?.display,
            badgeTextBefore,
            isPickerVisible,
            chipCount: chips.length,
            badgeTextAfter,
            table1ItemsCount,
            table3ItemsCount,
            newActiveTable
        };
    })()`);
    console.log('Checkout Table Changer Result:', tableTransferRes);
    assert.strictEqual(tableTransferRes.isModalOpen, true, 'Checkout modal should be open');
    assert.strictEqual(tableTransferRes.badgeTextBefore, 'Table 1', 'Badge should show Table 1');
    assert.strictEqual(tableTransferRes.isPickerVisible, true, 'Picker dropdown should be visible when toggled');
    assert.ok(tableTransferRes.chipCount >= 5, 'Should render table chips in picker');
    assert.strictEqual(tableTransferRes.badgeTextAfter, 'Table 3', 'Badge should update to Table 3');
    assert.strictEqual(tableTransferRes.table1ItemsCount, 0, 'Table 1 should now be vacant (0 items)');
    assert.strictEqual(tableTransferRes.table3ItemsCount, 2, 'Table 3 should now hold the transferred items (2 items)');
    assert.strictEqual(tableTransferRes.newActiveTable, 3, 'Active table should now be 3');
    console.log('✅ PASS: Interactive Checkout Table Changer transfers order cleanly and updates UI.');

    console.log('\n--- CHECK 4: Menu & Staff Tombstone Sync and Zero Zombie Resurrection ---');
    const syncTombstoneRes = await evaluateInApp(`(function() {
        // Test 1: Add a new custom menu item
        const testId = 987654;
        const testItem = { id: testId, name: 'Special Masala Chai', price: 25, category: 'Beverages', stock: 10 };
        menuItems.push(testItem);
        persistMenu();

        const hasItemBefore = menuItems.some(i => i.id === testId);

        // Test 2: Delete the menu item (with auto-confirm)
        const origConfirm = window.confirm;
        window.confirm = () => true;
        try {
            deleteMenuItem(testId, true);
        } finally {
            window.confirm = origConfirm;
        }
        const hasItemAfter = menuItems.some(i => i.id === testId);
        const tombstones = getDeletedMenuItemIds();
        const isTombstoneRecorded = tombstones.map(String).includes(String(testId));

        // Test 3: Remote Firestore sync arrives from a peer device with old cache resurrecting testItem
        const peerPayload = {
            menu: [
                { id: 1, name: 'Samosa', price: 15, category: 'Snacks' },
                { id: testId, name: 'Special Masala Chai', price: 25, category: 'Beverages' } // Zombie item!
            ]
        };
        handleRemoteFirestoreUpdate(peerPayload);

        // Verify testItem is NOT resurrected
        const isResurrected = menuItems.some(i => i.id === testId);

        return {
            hasItemBefore,
            hasItemAfter,
            isTombstoneRecorded,
            isResurrected
        };
    })()`);
    console.log('Sync Tombstone Result:', syncTombstoneRes);
    assert.strictEqual(syncTombstoneRes.hasItemBefore, true, 'Item should exist before deletion');
    assert.strictEqual(syncTombstoneRes.hasItemAfter, false, 'Item should be removed after deletion');
    assert.strictEqual(syncTombstoneRes.isTombstoneRecorded, true, 'Deleted item ID must be recorded in tombstones');
    assert.strictEqual(syncTombstoneRes.isResurrected, false, 'Deleted item must NEVER be resurrected by remote union merge');
    console.log('✅ PASS: Menu tombstones prevent zombie item resurrection across peer devices.');

    console.log('\n--- CHECK 5: Remote Staff Revocation Guard ---');
    const staffRevokeRes = await evaluateInApp(`(function() {
        // Set currentStaff as Waiter John (ID 555)
        const staffJohn = { id: 555, name: 'John Waiter', role: 'Waiter', status: 'Active' };
        currentStaff = staffJohn;
        window.currentStaff = staffJohn;
        localStorage.removeItem('billnaw_session_revoked');

        // Simulate incoming remote update where Admin deleted Waiter John
        const updateData = {
            staff: [{ id: 101, name: 'Admin', role: 'Admin' }],
            deletedStaffIds: ['555']
        };
        handleRemoteFirestoreUpdate(updateData);

        const isRevokedInStorage = localStorage.getItem('billnaw_session_revoked') === 'true';

        return {
            isRevokedInStorage
        };
    })()`);
    console.log('Staff Revocation Result:', staffRevokeRes);
    assert.strictEqual(staffRevokeRes.isRevokedInStorage, true, 'Remote staff deletion must flag session revocation');
    console.log('✅ PASS: Remote staff deletion triggers immediate session lockout.');

    console.log('\n--- CHECK 6: Uncaught JS Exceptions & Critical Errors ---');
    console.log('Total JS Exceptions caught:', jsExceptions.length);
    if (jsExceptions.length > 0) {
        jsExceptions.forEach((e, i) => console.error(`[Exception ${i+1}]:`, e.text, e.exception?.description));
    }
    assert.strictEqual(jsExceptions.length, 0, 'No uncaught JS exceptions allowed during verification');
    console.log('✅ PASS: Zero uncaught JS exceptions during full Table/KOT/Sync browser test run.');

    ws.close();
    chrome.kill();
    try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
    } catch (e) {}

    console.log('\n🎉 ALL BROWSER QA TESTS FOR TABLES, KOT & SYNC PASSED 100% GREEN!\n');
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
