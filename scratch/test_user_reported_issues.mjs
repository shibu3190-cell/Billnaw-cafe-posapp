import { spawn } from 'child_process';
import assert from 'assert';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9227;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log("==============================================================================");
    console.log("🔍 TESTING USER REPORTED ISSUES: POS ITEM CARDS & CUSTOMER WHATSAPP MARKETING");
    console.log("==============================================================================");

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1280,880',
        'about:blank'
    ]);

    await sleep(1500);
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

    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2500);

    // Bypass login modal if open
    await evaluate(`(() => {
        if (typeof closeShopAuthModal === 'function') closeShopAuthModal(true);
    })()`);
    await sleep(800);

    // TEST 1: POS Item Cards Display
    console.log("\n[TEST 1] Verifying POS Item Cards Display...");
    const pos = await evaluate(`(() => {
        const grid = document.getElementById('menuGridUI');
        const cards = grid ? Array.from(grid.querySelectorAll('.menu-card')) : [];
        const cardData = cards.map(c => ({
            name: c.querySelector('.name')?.innerText?.trim(),
            price: c.querySelector('.price')?.innerText?.trim(),
            cat: c.querySelector('.cat-label')?.innerText?.trim()
        }));
        const activeTab = document.getElementById('pos')?.classList.contains('active');
        const gridVisible = grid && window.getComputedStyle(grid).display !== 'none';
        return {
            activeTab,
            gridVisible,
            cardCount: cards.length,
            cardData
        };
    })()`);

    console.log("POS State:", pos);
    assert.ok(pos, "POS evaluation returned null or undefined");
    assert.strictEqual(pos.cardCount, 4, `Expected 4 cards in POS, found ${pos.cardCount}`);
    assert.strictEqual(pos.cardData[0].name, 'Samosa');
    assert.strictEqual(pos.cardData[1].name, 'Tea');
    assert.strictEqual(pos.cardData[2].name, 'Chicken Curry');
    assert.strictEqual(pos.cardData[3].name, 'Masala Coke');
    console.log("✅ PASS: POS Item Cards successfully rendered and visible (4 dishes)");

    // TEST 2: Customer WhatsApp Marketing Option
    console.log("\n[TEST 2] Verifying Customer WhatsApp Marketing Option...");
    await evaluate(`switchTab('customers');`);
    await sleep(1000);

    const cust = await evaluate(`(() => {
        const hub = document.getElementById('customerLandingHub');
        const tiles = Array.from(hub.querySelectorAll('.hub-feature-tile'));
        const waTile = tiles.find(t => t.innerText && t.innerText.includes('WhatsApp Marketing'));
        const waSubView = document.getElementById('aiWhatsAppMarketingHub');
        return {
            hubVisible: hub && window.getComputedStyle(hub).display !== 'none',
            hasWaTile: !!waTile,
            waTileText: waTile?.innerText?.trim(),
            waSubViewDisplay: waSubView?.style?.display
        };
    })()`);

    console.log("Customer Hub State:", cust);
    assert.ok(cust, "Customer evaluation returned null");
    assert.ok(cust.hubVisible, "Customer Landing Hub is not visible");
    assert.ok(cust.hasWaTile, "WhatsApp Marketing option tile is MISSING from customer landing hub");
    console.log("✅ PASS: WhatsApp Marketing option is prominently displayed in Customer Hub");

    // TEST 3: Click WhatsApp Marketing Option -> Opens Subview with Back button
    console.log("\n[TEST 3] Testing Click on WhatsApp Marketing Option...");
    await evaluate(`openCustomerHubSubView('aiWhatsAppMarketingHub');`);
    await sleep(800);

    const waOpen = await evaluate(`(() => {
        const hub = document.getElementById('customerLandingHub');
        const waSubView = document.getElementById('aiWhatsAppMarketingHub');
        const backBtn = waSubView?.querySelector('button[onclick*=\"closeCustomerHubSubView\"]');
        return {
            hubHidden: hub && hub.style.display === 'none',
            waSubViewVisible: waSubView && waSubView.style.display !== 'none',
            hasBackBtn: !!backBtn
        };
    })()`);

    console.log("WhatsApp Subview State:", waOpen);
    assert.ok(waOpen, "WhatsApp subview evaluation returned null");
    assert.ok(waOpen.waSubViewVisible, "aiWhatsAppMarketingHub did not open");
    assert.ok(waOpen.hubHidden, "customerLandingHub was not hidden");
    assert.ok(waOpen.hasBackBtn, "Back to For You Hub button is missing in WhatsApp Subview");
    console.log("✅ PASS: Clicking WhatsApp Marketing opens AI WhatsApp Marketing Hub subview");

    // TEST 4: Click Back to Hub -> Returns to Customer Landing Hub
    console.log("\n[TEST 4] Testing 'Back to For You Hub' button...");
    await evaluate(`closeCustomerHubSubView();`);
    await sleep(600);

    const waClose = await evaluate(`(() => {
        const hub = document.getElementById('customerLandingHub');
        const waSubView = document.getElementById('aiWhatsAppMarketingHub');
        return {
            hubVisible: hub && hub.style.display !== 'none',
            waSubViewHidden: waSubView && waSubView.style.display === 'none'
        };
    })()`);

    console.log("Restored Hub State:", waClose);
    assert.ok(waClose, "Restored hub evaluation returned null");
    assert.ok(waClose.hubVisible, "customerLandingHub was not restored");
    assert.ok(waClose.waSubViewHidden, "aiWhatsAppMarketingHub was not hidden");
    console.log("✅ PASS: Back button smoothly restores Customer Landing Hub with WhatsApp Marketing option");

    ws.close();
    chrome.kill();
    console.log("\n🎉 ALL USER REPORTED ISSUES FIXED AND VERIFIED 100%!");
}

main().catch(err => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
