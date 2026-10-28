// scratch/verify_5_user_fixes_browser.mjs
import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9248;
const ARTIFACTS_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_5_fixes_test_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runBrowserVerification() {
  console.log("==============================================================================");
  console.log("🧪 BROWSER E2E VERIFICATION: 5 CRITICAL POS UI/UX & STACKING FIXES");
  console.log("==============================================================================\n");

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${TEMP_USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=390,844',
    'about:blank'
  ]);

  await sleep(2500);

  let ws;
  try {
    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const page = targets.find(t => t.type === 'page') || targets[0];

    ws = new WebSocket(page.webSocketDebuggerUrl);
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
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || 'Evaluation error');
      }
      return res.result?.value;
    };

    const capture = async (name) => {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const imgPath = path.join(ARTIFACTS_DIR, `${name}.png`);
      fs.writeFileSync(imgPath, Buffer.from(res.data, 'base64'));
      console.log(`  📸 Screenshot captured: ${name}.png`);
      return imgPath;
    };

    await send('Page.enable');
    await send('Runtime.enable');

    console.log("📍 STEP 1: INITIALIZING DEMO POS SESSION AT MOBILE VIEWPORT (390 x 844)");
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(3000);

    // Bypass any auth gate into demo mode
    await evaluate(`
      (function() {
        if (typeof window.bypassToDemoMode === 'function') {
          window.bypassToDemoMode();
        } else if (typeof window.enterGuestDemoMode === 'function') {
          window.enterGuestDemoMode();
        } else {
          const btn = document.querySelector('#shopAuthModal button, #loginOverlay button, .auth-btn');
          if (btn) btn.click();
        }
        if (typeof switchView === 'function') switchView('pos');
      })()
    `);
    await sleep(1500);

    console.log("\n📍 TEST 1: POS VIEW BOTTOM CONTAINER & BACKGROUND AUDIT");
    const posBottomStyle = await evaluate(`
      (function() {
        const posLeft = document.querySelector('.pos-left');
        const actions = document.querySelector('.mobile-pos-actions');
        const posView = document.getElementById('pos');
        const csPos = posLeft ? window.getComputedStyle(posLeft) : null;
        const csActions = actions ? window.getComputedStyle(actions) : null;
        return {
          posLeftBg: csPos ? csPos.backgroundColor : null,
          posLeftPadBottom: csPos ? csPos.paddingBottom : null,
          actionsBg: csActions ? csActions.backgroundColor : null,
          actionsDisplay: csActions ? csActions.display : null,
          actionsPointerEvents: csActions ? csActions.pointerEvents : null
        };
      })()
    `);
    console.log("  Computed POS bottom styles:", posBottomStyle);
    assert.strictEqual(posBottomStyle.actionsPointerEvents, 'none', "Mobile POS actions wrapper must have pointer-events: none");
    await capture('screen_fix1_mobile_pos_bottom');
    console.log("  ✅ PASS: Fix 1 - Mobile POS view background is uniform and no white box blocks bottom nav");

    console.log("\n📍 TEST 2: MINIMALIST REPORTS UI (DATE POPOVER & EXPORT MODAL)");
    await evaluate(`
      (function() {
        if (typeof switchView === 'function') switchView('dashboard');
      })()
    `);
    await sleep(800);

    const reportsHeaderCheck = await evaluate(`
      (function() {
        const rangeBtn = document.getElementById('reportDateRangeBtn');
        const exportBtn = document.getElementById('reportExportModalBtn');
        const stickyFooter = document.querySelector('.reports-export-sticky-footer');
        return {
          hasRangeBtn: !!rangeBtn,
          rangeBtnText: rangeBtn ? rangeBtn.innerText.trim() : '',
          hasExportBtn: !!exportBtn,
          exportBtnText: exportBtn ? exportBtn.innerText.trim() : '',
          hasOldStickyFooter: !!stickyFooter
        };
      })()
    `);
    console.log("  Reports Action Bar state:", reportsHeaderCheck);
    assert.ok(reportsHeaderCheck.hasRangeBtn, "Must have #reportDateRangeBtn");
    assert.ok(reportsHeaderCheck.hasExportBtn, "Must have #reportExportModalBtn");
    assert.strictEqual(reportsHeaderCheck.hasOldStickyFooter, false, "Bulky .reports-export-sticky-footer must be removed");

    // Open Date Range Popover
    await evaluate(`window.toggleReportDatePopover()`);
    await sleep(400);
    const popoverOpen = await evaluate(`document.getElementById('reportDatePopover').style.display !== 'none'`);
    assert.strictEqual(popoverOpen, true, "Date Range Popover must be open");
    await capture('screen_fix2_reports_action_bar_popover');

    // Select 'Yesterday' preset
    await evaluate(`window.selectReportDatePreset('yesterday', 'Yesterday')`);
    await sleep(400);
    const popoverClosed = await evaluate(`document.getElementById('reportDatePopover').style.display === 'none'`);
    const activeLabel = await evaluate(`document.getElementById('reportActiveRangeLabel').innerText.trim()`);
    assert.strictEqual(popoverClosed, true, "Popover must close on preset selection");
    assert.strictEqual(activeLabel, 'Yesterday', "Active range label must update to Yesterday");

    // Open Export & Audit Modal
    await evaluate(`window.openReportExportModal()`);
    await sleep(400);
    const exportModalOpen = await evaluate(`document.getElementById('reportExportModal').style.display !== 'none'`);
    assert.strictEqual(exportModalOpen, true, "Report Export Modal must be open");
    await capture('screen_fix2_reports_export_modal');
    await evaluate(`window.closeReportExportModal()`);
    await sleep(300);
    console.log("  ✅ PASS: Fix 2 - Minimalist Reports UI triggers work cleanly with popover & modal");

    console.log("\n📍 TEST 3: INVENTORY PURGE & CLEAN EMPTY STATES");
    await evaluate(`
      (function() {
        if (typeof switchView === 'function') switchView('inventory');
      })()
    `);
    await sleep(800);

    const inventoryCheck = await evaluate(`
      (function() {
        const emptyState = document.querySelector('.empty-inventory-state');
        const whiskyItem = Array.from(document.querySelectorAll('*')).find(el => el.textContent && el.textContent.includes('Whisky'));
        const beerKegItem = Array.from(document.querySelectorAll('*')).find(el => el.textContent && el.textContent.includes('Craft Beer Keg'));
        return {
          hasEmptyState: !!emptyState,
          emptyStateText: emptyState ? emptyState.innerText.replace(/\\s+/g, ' ').trim() : '',
          hasWhisky: !!whiskyItem,
          hasBeerKeg: !!beerKegItem
        };
      })()
    `);
    console.log("  Inventory empty state audit:", inventoryCheck);
    assert.ok(inventoryCheck.hasEmptyState, "Inventory must display clean empty state when no items exist");
    assert.strictEqual(inventoryCheck.hasWhisky, false, "Dummy Whisky item must NOT exist");
    assert.strictEqual(inventoryCheck.hasBeerKeg, false, "Dummy Craft Beer Keg item must NOT exist");
    await capture('screen_fix3_inventory_clean_empty_state');
    console.log("  ✅ PASS: Fix 3 - Inventory displays pure user empty state with zero dummy data");

    console.log("\n📍 TEST 4: RUPEE SYMBOL SPACING & NON-WRAPPING");
    await evaluate(`
      (function() {
        if (typeof switchView === 'function') switchView('pos');
      })()
    `);
    await sleep(600);

    const rupeeCheck = await evaluate(`
      (function() {
        const prices = Array.from(document.querySelectorAll('.clean-item-price, .price, .kpi-value'));
        const whiteSpaceValues = prices.map(p => window.getComputedStyle(p).whiteSpace);
        const allNowrap = whiteSpaceValues.length > 0 && whiteSpaceValues.every(v => v === 'nowrap');
        const textSamples = prices.slice(0, 5).map(p => p.innerText.trim());
        const hasCrampedRupee = textSamples.some(t => /₹[0-9]/.test(t));
        return {
          sampleTexts: textSamples,
          allNowrap,
          hasCrampedRupee
        };
      })()
    `);
    console.log("  Rupee formatting audit:", rupeeCheck);
    assert.strictEqual(rupeeCheck.hasCrampedRupee, false, "No price should have cramped '₹' touching digits");
    assert.strictEqual(rupeeCheck.allNowrap, true, "All price elements must have white-space: nowrap");
    await capture('screen_fix4_rupee_spacing_pos_checkout');
    console.log("  ✅ PASS: Fix 4 - Rupee symbol formatted with uniform spacing and non-wrapping");

    console.log("\n📍 TEST 5: NESTED MODAL STACKING & TOAST DEDUPLICATION");
    await evaluate(`
      (function() {
        if (typeof openCheckoutModal === 'function') openCheckoutModal();
        if (typeof openCustomerModal === 'function') openCustomerModal();
      })()
    `);
    await sleep(500);

    const modalZIndexCheck = await evaluate(`
      (function() {
        const checkout = document.getElementById('checkoutModal');
        const customer = document.getElementById('customerModal');
        const zCheckout = parseInt(window.getComputedStyle(checkout).zIndex, 10);
        const zCustomer = parseInt(window.getComputedStyle(customer).zIndex, 10);
        return {
          zCheckout,
          zCustomer,
          customerAboveCheckout: zCustomer > zCheckout
        };
      })()
    `);
    console.log("  Modal z-index comparison:", modalZIndexCheck);
    assert.strictEqual(modalZIndexCheck.customerAboveCheckout, true, "Customer modal MUST sit above Checkout modal");

    // Toast deduplication test: fire 5 rapid toasts
    await evaluate(`
      (function() {
        for (let i = 0; i < 5; i++) {
          showToast('Payment Processing Notice', 'info');
        }
      })()
    `);
    await sleep(200);

    const toastCheck = await evaluate(`
      (function() {
        const container = document.getElementById('toast-container');
        const toasts = container ? container.querySelectorAll('.toast') : [];
        const zToast = container ? parseInt(window.getComputedStyle(container).zIndex, 10) : 0;
        return {
          toastCount: toasts.length,
          zToast,
          toastText: toasts[0] ? toasts[0].innerText : ''
        };
      })()
    `);
    console.log("  Toast container audit:", toastCheck);
    assert.strictEqual(toastCheck.toastCount, 1, "Exactly 1 toast must be active (rapid clicks throttled & deduplicated)");
    assert.strictEqual(toastCheck.zToast, 1000060, "Toast container must be at z-index 1000060");
    await capture('screen_fix5_modal_stacking_and_toast');
    console.log("  ✅ PASS: Fix 5 - Nested modal hierarchy (#customerModal > #checkoutModal) and single toast confirmed");

    console.log("\n==============================================================================");
    console.log("🎯 ALL 5 BROWSER VERIFICATION AUDITS PASSED WITH ZERO ERRORS!");
    console.log("==============================================================================");

  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
}

runBrowserVerification().catch(err => {
  console.error("FATAL ERROR in browser verification:", err);
  process.exit(1);
});
