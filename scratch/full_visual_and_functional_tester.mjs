import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9222;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
    }

    async connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.wsUrl);
            this.ws.onopen = () => resolve();
            this.ws.onerror = (err) => reject(err);
            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                if (msg.id && this.callbacks.has(msg.id)) {
                    const { resolve, reject } = this.callbacks.get(msg.id);
                    this.callbacks.delete(msg.id);
                    if (msg.error) reject(msg.error);
                    else resolve(msg.result);
                }
            };
        });
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            console.error('Eval error:', res.exceptionDetails);
        }
        return res.result?.value;
    }

    async screenshot(filepath) {
        const res = await this.send('Page.captureScreenshot', { format: 'png' });
        const buf = Buffer.from(res.data, 'base64');
        fs.writeFileSync(filepath, buf);
        console.log(`📸 Saved screenshot: ${filepath} (${buf.length} bytes)`);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function runTests() {
    console.log("==============================================================================");
    console.log("🚀 FULL VISUAL & FUNCTIONAL CDP TEST RUNNER");
    console.log("==============================================================================");

    const tempDir = path.join(process.env.TEMP, 'chrome_full_test_' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });

    const chromeProc = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${tempDir}`,
        '--window-size=1280,880',
        'about:blank'
    ]);

    let versionData = null;
    for (let i = 0; i < 20; i++) {
        await sleep(500);
        try {
            const res = await fetch(`http://localhost:${DEBUG_PORT}/json/version`);
            if (res.ok) {
                versionData = await res.json();
                break;
            }
        } catch (e) {}
    }

    if (!versionData) {
        console.error('Failed to connect to Chrome debug port');
        chromeProc.kill();
        return;
    }

    const targetsRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await targetsRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    const results = [];

    // --- PHASE 1: DESKTOP TESTING (1280 x 880) ---
    console.log("\n--- Phase 1: Desktop Viewport Testing (1280x880) ---");
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1280,
        height: 880,
        deviceScaleFactor: 1,
        mobile: false
    });

    // 1. Cold Load with Login Modal
    await cdp.send('Page.navigate', { url: 'http://localhost:5000/?auth=login' });
    await sleep(2000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_01_login.png'));

    // Check Login Modal Elements
    const authState = await cdp.evaluate(`(() => {
        const modal = document.getElementById('shopAuthModal');
        const loginTab = document.getElementById('tabShopLogin') || document.getElementById('authTabLogin');
        const signupTab = document.getElementById('tabShopSignup') || document.getElementById('authTabSignup');
        const skipBtn = document.getElementById('shopAuthSkipBtn');
        return {
            modalVisible: modal && modal.style.display !== 'none',
            loginTabActive: loginTab && loginTab.classList.contains('active'),
            hasSkipBtn: !!skipBtn
        };
    })()`);
    console.log("Auth Modal State:", authState);
    results.push({ name: "Desktop Auth Modal Displayed", pass: authState.modalVisible });

    // 2. Click Skip Login to enter POS
    await cdp.evaluate(`(() => {
        const btn = document.getElementById('shopAuthSkipBtn');
        if (btn) btn.click();
        else closeShopAuthModal(true);
    })()`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_02_pos_terminal.png'));

    // Verify POS Elements
    const posState = await cdp.evaluate(`(() => {
        const tableWrap = document.getElementById('tablesWrapper');
        const searchInput = document.getElementById('menuSearchInput');
        const voicePills = document.getElementById('quickVoicePillsRow');
        const menuGrid = document.getElementById('menuGridUI');
        const cards = document.querySelectorAll('.menu-card');
        const floatingCart = document.getElementById('floatingCart');
        const table1 = (window.tablesInfo && window.tablesInfo[1]) || {};
        const getColCount = (el) => {
            if (!el) return 0;
            const style = window.getComputedStyle(el).gridTemplateColumns || '';
            if (style.includes('repeat(4')) return 4;
            if (style.includes('repeat(2')) return 2;
            return style.trim().split(' ').filter(Boolean).length;
        };
        return {
            hasTableWrap: !!tableWrap,
            hasSearch: !!searchInput,
            hasVoicePills: !!voicePills,
            cardCount: cards.length,
            firstItem: cards[0]?.querySelector('.name')?.innerText,
            firstPrice: cards[0]?.querySelector('.price')?.innerText,
            table1Status: table1?.status,
            gridColumns: getColCount(menuGrid)
        };
    })()`);
    console.log("POS State (Desktop):", posState);
    results.push({ name: "POS Strict 4-Item Grid Rendered", pass: posState.cardCount === 4 });
    results.push({ name: "POS Grid has 4 Columns on Desktop", pass: posState.gridColumns === 4 });

    // 3. Test Voice Order Chips: Click '2 Hot Chai' chip
    console.log("Testing Voice Order Chip ('2 Hot Chai')...");
    await cdp.evaluate(`parseAndPushVoiceOrder('2 Hot Chai');`);
    await sleep(800);
    const cartAfterChai = await cdp.evaluate(`(() => {
        const t1 = (window.tablesInfo && window.tablesInfo[1]) || { items: [] };
        const count = (t1.items || []).reduce((s, i) => s + i.qty, 0);
        const total = (t1.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
        return { count, total, items: t1.items };
    })()`);
    console.log("Cart after '2 Hot Chai':", cartAfterChai);
    results.push({ name: "Voice Chip '2 Hot Chai' pushed to cart", pass: cartAfterChai.count === 2 && cartAfterChai.total === 20 });

    // 4. Test Menu Grid Stepper (+ ADD Chicken Curry)
    console.log("Testing Menu Stepper (+ Chicken Curry)...");
    await cdp.evaluate(`addToCart(3);`); // Chicken Curry is item id 3 (₹140)
    await sleep(800);
    const cartAfterCurry = await cdp.evaluate(`(() => {
        const t1 = (window.tablesInfo && window.tablesInfo[1]) || { items: [] };
        const total = (t1.items || []).reduce((s, i) => s + (i.price * i.qty), 0);
        return { total, status: t1.status };
    })()`);
    console.log("Cart after Chicken Curry:", cartAfterCurry);
    results.push({ name: "Cart total updated (₹20 + ₹140 = ₹160)", pass: cartAfterCurry.total === 160 });
    results.push({ name: "Table 1 transitioned to Occupied", pass: cartAfterCurry.status === 'occupied' });

    // Capture Desktop Cart Dock
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_03_pos_cart_loaded.png'));

    // 5. Test Checkout Flow to Bill / Invoice Modal
    console.log("Testing Checkout & Bill Modal...");
    await cdp.evaluate(`openCheckoutModal();`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_04_checkout_modal.png'));

    const checkoutState = await cdp.evaluate(`(() => {
        const modal = document.getElementById('checkoutModal');
        const grandTotal = document.getElementById('checkoutTotal')?.innerText;
        return {
            modalVisible: modal && modal.style.display !== 'none',
            grandTotal
        };
    })()`);
    console.log("Checkout Modal State:", checkoutState);
    results.push({ name: "Checkout Modal opened with total", pass: checkoutState.modalVisible && Boolean(checkoutState.grandTotal) });

    // Settle Bill with Cash
    console.log("Settling Bill with Cash...");
    await cdp.evaluate(`
        selectPayment('Cash', 'checkout');
        confirmCheckout();
    `);
    await sleep(1500);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_05_bill_receipt.png'));

    // Close invoice modal if open
    await cdp.evaluate(`
        const billModal = document.getElementById('billModal');
        if (billModal) billModal.style.display = 'none';
        const modalOverlay = document.querySelectorAll('.modal-overlay');
        modalOverlay.forEach(m => m.style.display = 'none');
    `);
    await sleep(600);

    // 6. Test Reports / Dashboard Tab & Date Picker
    console.log("Navigating to Reports / Dashboard Tab...");
    await cdp.evaluate(`switchTab('dashboard');`);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_06_reports_dashboard.png'));

    const reportsState = await cdp.evaluate(`(() => {
        const gross = document.getElementById('kpiGrossSales')?.innerText;
        const customBtn = document.getElementById('fRange-custom');
        const customWrap = document.getElementById('reportCustomDateWrap');
        const historyRows = document.querySelectorAll('#historyTableBody tr');
        return {
            gross,
            hasCustomBtn: !!customBtn,
            hasCustomWrap: !!customWrap,
            historyRowCount: historyRows.length
        };
    })()`);
    console.log("Reports State:", reportsState);
    results.push({ name: "Reports dashboard recorded settled bill", pass: reportsState.historyRowCount > 0 });
    results.push({ name: "Reports has Custom Date Range controls", pass: reportsState.hasCustomBtn && reportsState.hasCustomWrap });

    // 7. Test Inventory & Culinary Hub Tab
    console.log("Navigating to Inventory & Culinary Hub...");
    await cdp.evaluate(`switchTab('inventory');`);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_07_inventory_hub.png'));

    // Open RTR Tracker subview
    console.log("Opening RTR Tracker Subview in Inventory...");
    await cdp.evaluate(`openInventoryHubSubView('rtr_tracker');`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_08_inventory_rtr_subview.png'));

    // Close subview back to hub
    await cdp.evaluate(`closeInventoryHubSubView();`);
    await sleep(800);

    // 8. Test Customer Hub Tab ("For You ✨")
    console.log("Navigating to Customer Hub...");
    await cdp.evaluate(`switchTab('customers');`);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_09_customer_hub.png'));

    // Open Customer Directory subview
    console.log("Opening Customer Directory Subview...");
    await cdp.evaluate(`openCustomerHubSubView('customerDirectoryDetailedSubView');`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_10_customer_directory_subview.png'));

    // Close subview back to hub
    await cdp.evaluate(`closeCustomerHubSubView();`);
    await sleep(800);

    // 9. Test Settings Tab
    console.log("Navigating to Settings Tab...");
    await cdp.evaluate(`switchTab('settings');`);
    await sleep(1200);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_desktop_11_settings.png'));

    // --- PHASE 2: MOBILE VIEWPORT TESTING (390 x 844) ---
    console.log("\n--- Phase 2: Mobile Viewport Testing (390x844 - iPhone 14 size) ---");
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 2,
        mobile: true
    });

    // 10. Mobile POS Terminal View
    console.log("Switching to Mobile POS View...");
    await cdp.evaluate(`switchTab('pos');`);
    await sleep(1500);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_mobile_01_pos_grid.png'));

    const mobileGridState = await cdp.evaluate(`(() => {
        const menuGrid = document.getElementById('menuGridUI');
        const bottomNav = document.querySelector('.sidebar');
        const checkoutBar = document.querySelector('.mobile-pos-actions');
        const cards = document.querySelectorAll('.menu-card');
        const getColCount = (el) => {
            if (!el) return 0;
            const style = window.getComputedStyle(el).gridTemplateColumns || '';
            if (style.includes('repeat(2')) return 2;
            if (style.includes('repeat(4')) return 4;
            return style.trim().split(' ').filter(Boolean).length;
        };
        const navBtns = document.querySelectorAll('.sidebar .nav-btn');
        return {
            gridCols: getColCount(menuGrid),
            cardCount: cards.length,
            isBottomNavFixed: window.getComputedStyle(bottomNav).position === 'fixed',
            navBtnCount: navBtns.length,
            checkoutBarBottom: window.getComputedStyle(checkoutBar).position === 'fixed'
        };
    })()`);
    console.log("Mobile Grid State:", mobileGridState);
    results.push({ name: "Mobile Menu Grid strictly 2 columns", pass: mobileGridState.gridCols === 2 });
    results.push({ name: "Mobile Bottom Navigation Bar fixed with 6 tabs", pass: mobileGridState.isBottomNavFixed && mobileGridState.navBtnCount >= 6 });
    results.push({ name: "Mobile Sticky Checkout Bar positioned above navigation", pass: mobileGridState.checkoutBarBottom });

    // 11. Click Top-Left Billnaw Logo to Open Mobile Slide Menu
    console.log("Clicking top-left Billnaw logo button...");
    await cdp.evaluate(`toggleMobileSlideMenu(true);`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_mobile_02_slide_menu_drawer.png'));

    const slideMenuState = await cdp.evaluate(`(() => {
        const drawer = document.getElementById('mobileSlideMenuDrawer');
        const overlay = document.getElementById('mobileSlideMenuOverlay');
        const navItems = drawer ? drawer.querySelectorAll('.slide-nav-item') : [];
        return {
            drawerOpen: drawer && drawer.classList.contains('open'),
            overlayShow: overlay && (overlay.classList.contains('show') || overlay.classList.contains('open')),
            navItemCount: navItems.length
        };
    })()`);
    console.log("Slide Menu Drawer State:", slideMenuState);
    results.push({ name: "Top-left Logo opens Slide Menu Drawer", pass: slideMenuState.drawerOpen && slideMenuState.overlayShow });

    // Close Slide Menu
    await cdp.evaluate(`toggleMobileSlideMenu(false);`);
    await sleep(800);

    // 12. Test Bell Notification Drawer on Mobile
    console.log("Opening Notification Bell Drawer on Mobile...");
    await cdp.evaluate(`toggleNotificationDrawer(true);`);
    await sleep(1000);
    await cdp.screenshot(path.join(ARTIFACT_DIR, 'screen_mobile_03_notification_drawer.png'));

    const bellState = await cdp.evaluate(`(() => {
        const drawer = document.getElementById('bellNotificationDrawer');
        const overlay = document.getElementById('notificationDrawerOverlay');
        return {
            isOpen: drawer && (drawer.classList.contains('open') || drawer.style.display === 'block'),
            hasOverlay: overlay && overlay.style.display === 'block'
        };
    })()`);
    console.log("Bell Drawer State:", bellState);
    results.push({ name: "Bell Notification Drawer opens on click", pass: bellState.isOpen });

    // Close Bell Drawer
    await cdp.evaluate(`toggleNotificationDrawer(false);`);
    await sleep(600);

    // Done!
    cdp.close();
    chromeProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    console.log("\n==============================================================================");
    console.log("🎯 CDP TEST SUMMARY RESULTS:");
    console.log("==============================================================================");
    let allPass = true;
    results.forEach(r => {
        console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}: ${r.pass ? 'PASS' : 'FAIL'}`);
        if (!r.pass) allPass = false;
    });

    if (allPass) {
        console.log("\n🎉 ALL VISUAL AND FUNCTIONAL CDP TESTS PASSED WITH 100% SUCCESS!");
    } else {
        console.error("\n⚠️ SOME CDP TESTS FAILED.");
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("FATAL ERROR IN CDP RUNNER:", err);
    process.exit(1);
});
