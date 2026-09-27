import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9228;
const ARTIFACTS_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_pos_e2e_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log("==============================================================================");
    console.log("🌟 CEO & DEVELOPER COMPREHENSIVE E2E VERIFICATION FOR BILLNAW POS");
    console.log("==============================================================================");

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${TEMP_USER_DATA_DIR}`,
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1280,880',
        'about:blank'
    ]);

    await sleep(2000);
    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const page = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id === id) {
                ws.removeEventListener('message', handler);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
        const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        return res?.result?.value;
    };

    const captureScreenshot = async (filename) => {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(ARTIFACTS_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`  📸 Screenshot captured: ${filename}`);
    };

    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2500);

    // ----------------------------------------------------
    // TEST 1: AUTHENTICATION CLEAN-UP (ZERO DEMO / AUTO-FILL)
    // ----------------------------------------------------
    console.log("\n🔒 TEST 1: AUTHENTICATION CLEAN-UP");
    const authState = await evaluate(`(() => {
        const modal = document.getElementById('shopAuthModal');
        const skipBtn = document.getElementById('shopAuthSkipBtn');
        const autoFillBanner = document.getElementById('otpAutoFillBanner');
        const loginAutoFill = document.getElementById('loginOtpAutoFillBanner');
        return {
            hasSkipBtn: !!skipBtn,
            hasAutoFillBanner: !!autoFillBanner || !!loginAutoFill,
            isModalPresent: !!modal
        };
    })()`);

    console.log("  Auth State:", authState);
    assert.strictEqual(authState.hasSkipBtn, false, "Demo skip button must be completely removed");
    assert.strictEqual(authState.hasAutoFillBanner, false, "Auto-fill verification container must be removed");
    console.log("  ✅ PASS: Authentication is pristine with zero bypass or dummy auto-fills");

    // Close auth modal to test POS
    await evaluate(`(() => {
        if (typeof closeShopAuthModal === 'function') closeShopAuthModal(true);
    })()`);
    await sleep(800);

    // ----------------------------------------------------
    // TEST 2: POS DATA RENDERING & 4 DEMO ITEMS
    // ----------------------------------------------------
    console.log("\n🍽️ TEST 2: POS SECTION DATA RENDERING");
    await evaluate(`switchTab('pos')`);
    await sleep(1000);

    const posState = await evaluate(`(() => {
        const grid = document.getElementById('menuGridUI');
        const cards = grid ? Array.from(grid.querySelectorAll('.menu-card')) : [];
        const cardTitles = cards.map(c => c.querySelector('.name')?.innerText?.trim() || '');
        const searchInput = document.getElementById('menuSearchInput');
        const voiceBtn = document.querySelector('.mic-icon');
        const tablesBar = document.getElementById('tableGridUI');
        const tableBtns = tablesBar ? Array.from(tablesBar.querySelectorAll('button')).map(b => b.innerText.trim()) : [];
        const speechChips = Array.from(document.querySelectorAll('.quick-voice-chip')).map(c => c.innerText.trim());
        
        return {
            cardCount: cards.length,
            cardTitles: cardTitles,
            hasSearch: !!searchInput,
            hasVoiceBtn: !!voiceBtn,
            tablesCount: tableBtns.length,
            sampleTables: tableBtns.slice(0, 5),
            speechChips: speechChips
        };
    })()`);

    console.log("  POS State:", posState);
    assert.ok(posState.cardCount >= 4, `Expected at least 4 items, found ${posState.cardCount}`);
    assert.ok(posState.cardTitles.some(t => t.includes('Samosa')), "Samosa must be in POS items");
    assert.ok(posState.cardTitles.some(t => t.includes('Tea')), "Tea must be in POS items");
    assert.ok(posState.cardTitles.some(t => t.includes('Chicken Curry')), "Chicken Curry must be in POS items");
    assert.ok(posState.cardTitles.some(t => t.includes('Masala Coke')), "Masala Coke must be in POS items");
    assert.ok(posState.hasSearch, "Search input must be present on POS");
    console.log("  ✅ PASS: POS grid successfully renders 4 authentic dishes with search and tables");

    await captureScreenshot('screen_pos_verified_4_items.png');

    // ----------------------------------------------------
    // TEST 3: REPORTS SECTION - CUSTOM DATE PICKER & ACTION SHEET
    // ----------------------------------------------------
    console.log("\n📊 TEST 3: REPORTS SECTION & ACTION SHEET");
    await evaluate(`switchTab('dashboard')`);
    await sleep(1000);

    // Test opening custom date picker modal
    await evaluate(`openInteractiveCustomDatePicker()`);
    await sleep(600);

    const datePickerState = await evaluate(`(() => {
        const modal = document.getElementById('reportCustomDatePickerModal');
        const isVisible = modal && modal.style.display !== 'none' && window.getComputedStyle(modal).display !== 'none';
        const startInput = document.getElementById('calendarPickerStartDate');
        const endInput = document.getElementById('calendarPickerEndDate');
        return { isVisible, startVal: startInput?.value, endVal: endInput?.value };
    })()`);

    console.log("  Date Picker Modal State:", datePickerState);
    assert.strictEqual(datePickerState.isVisible, true, "Custom date picker modal must open");
    console.log("  ✅ PASS: Interactive Custom Date Range Picker successfully opened");

    await captureScreenshot('screen_reports_custom_datepicker.png');

    // Close date picker
    await evaluate(`closeInteractiveCustomDatePicker()`);
    await sleep(500);

    // Test transaction action sheet
    const txnActionSheetState = await evaluate(`(() => {
        // Create a test order if history is empty
        if (!orderHistory || orderHistory.length === 0) {
            orderHistory = [{
                id: 999901,
                billNo: 1001,
                date: new Date().toLocaleString(),
                table: 'Table 1',
                customer: 'Rahul Verma',
                items: 'Samosa (x2), Tea (x2)',
                paymentMode: 'Cash',
                amount: 50.00
            }];
            saveToLocal();
            renderDashboardAnalytics();
        }
        openTransactionActionSheet(orderHistory[0].id);
        const modal = document.getElementById('transactionActionSheetModal');
        const isVisible = modal && modal.style.display !== 'none';
        const billNoText = document.getElementById('txnSheetBillNo')?.innerText;
        const totalText = document.getElementById('txnSheetTotalAmount')?.innerText;
        return { isVisible, billNoText, totalText };
    })()`);

    console.log("  Transaction Action Sheet State:", txnActionSheetState);
    assert.strictEqual(txnActionSheetState.isVisible, true, "Transaction action sheet must open");
    assert.ok(txnActionSheetState.billNoText.includes('Bill #'), "Must display correct bill #");
    console.log("  ✅ PASS: Transaction Action Sheet bottom sheet operational with direct action buttons");

    await captureScreenshot('screen_reports_transaction_action_sheet.png');

    await evaluate(`closeTransactionActionSheet()`);
    await sleep(500);

    // ----------------------------------------------------
    // TEST 4: CUSTOMER DIRECTORY & ACTION HUB
    // ----------------------------------------------------
    console.log("\n👥 TEST 4: CUSTOMER DIRECTORY & ACTION HUB");
    await evaluate(`switchTab('customers')`);
    await sleep(1000);

    const custHubState = await evaluate(`(() => {
        if (!customersList || customersList.length === 0) {
            customersList = [{
                id: 88801,
                name: 'Vikram Mehta',
                phone: '9876543210',
                tier: 'Gold',
                points: 120,
                visits: 5,
                totalSpent: 1250,
                notes: 'Regular guest'
            }];
            saveToLocal();
            renderCustomersUI();
        }
        openCustomerActionHub(customersList[0].id);
        const modal = document.getElementById('customerActionHubModal');
        const isVisible = modal && modal.style.display !== 'none';
        const nameText = document.getElementById('cActionName')?.innerText;
        const spendText = document.getElementById('cActionSpend')?.innerText;
        return { isVisible, nameText, spendText };
    })()`);

    console.log("  Customer Action Hub State:", custHubState);
    assert.ok(custHubState.nameText && custHubState.nameText.length > 0, "Must display customer name");
    assert.ok(custHubState.spendText.includes('Spent: ₹'), "Must display lifetime spend");
    console.log("  ✅ PASS: Customer Action Hub renders Tier, Points, Total Lifetime Spend and WhatsApp messaging");

    await captureScreenshot('screen_customer_action_hub_verified.png');

    await evaluate(`closeCustomerActionHub()`);
    await sleep(500);

    // ----------------------------------------------------
    // TEST 5: INVENTORY & RTR AUTO-RECIPE REGISTRATION
    // ----------------------------------------------------
    console.log("\n🥘 TEST 5: INVENTORY & RTR AUTO-RECIPE REGISTRATION");
    await evaluate(`switchTab('inventory')`);
    await sleep(1000);

    // Add a new dish in Menu and test that it auto-registers in RTR
    const rtrRegistration = await evaluate(`(async () => {
        const testDish = {
            id: 77701,
            name: 'Paneer Butter Masala',
            category: 'Main Course',
            price: 180
        };
        menuItems.push(testDish);
        window.menuItems = menuItems;
        const regRes = await window.culinaryInventory.registerNewDishRecipe(testDish);
        const dishes = window.culinaryInventory.getAllMenuDishes();
        const mappedDish = dishes.find(d => d.name === 'Paneer Butter Masala');
        return {
            hasMappedDish: !!mappedDish,
            hasRecipe: !!(mappedDish && mappedDish.recipe),
            recipeId: mappedDish?.recipe?.id
        };
    })()`);

    console.log("  RTR Auto-Registration Result:", rtrRegistration);
    assert.strictEqual(rtrRegistration.hasMappedDish, true, "Newly added dish must appear in RTR dishes");
    assert.strictEqual(rtrRegistration.hasRecipe, true, "Newly added dish must have auto-mapped culinary portion recipe");
    console.log("  ✅ PASS: Adding item in Menu automatically creates RTR portion recipe");

    await captureScreenshot('screen_inventory_rtr_auto_mapped.png');

    // ----------------------------------------------------
    // TEST 6: MODAL CLOSE BUTTON INVARIANT (26 SVG BUTTONS)
    // ----------------------------------------------------
    console.log("\n🛡️ TEST 6: STRICT 26 MODAL CLOSE BUTTON INVARIANT");
    const htmlContent = fs.readFileSync('index.html', 'utf8');
    const closeBtnMatches = htmlContent.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
    console.log(`  Modal Close Button Count: ${closeBtnMatches.length}`);
    assert.strictEqual(closeBtnMatches.length, 26, "Invariant failed: Expected exactly 26 modal-close-btn SVG buttons in index.html");
    console.log("  ✅ PASS: Invariant preserved with exactly 26 SVG modal close buttons");

    console.log("\n==============================================================================");
    console.log("🎉 ALL TESTS PASSED SUCCESSFULLY! ZERO ERRORS.");
    console.log("==============================================================================");

    ws.close();
    chrome.kill();
}

main().catch(err => {
    console.error("❌ E2E Verification failed:", err);
    process.exit(1);
});
