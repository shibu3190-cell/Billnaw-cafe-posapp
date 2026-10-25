const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const assert = require('assert');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log("====================================================================");
  console.log("🚀 EMPIRICAL VERIFICATION: MOBILE-FIRST RESPONSIVE UI/UX REFACTOR");
  console.log("====================================================================\n");

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'chrome_resp_test_' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9888',
    '--user-data-dir=' + userDataDir,
    '--window-size=1280,800',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5000'
  ]);

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    try {
      targets = await getJson('http://127.0.0.1:9888/json/list');
      if (targets && targets.length > 0) break;
    } catch (e) {}
  }

  if (!targets || targets.length === 0) {
    console.error("❌ Failed to attach to headless Chrome");
    chromeProc.kill();
    process.exit(1);
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');

  await wait(2500);

  let passed = 0;
  let failed = 0;

  function record(name, condition, details = '') {
    if (condition) {
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${name} ${details}`);
      failed++;
    }
  }

  // 1. MASTER HEADER ADAPTIVE RESPONSIVENESS
  console.log("📍 SECTION 1: MASTER HEADER ADAPTIVE RESPONSIVENESS");
  
  // Set desktop viewport 1280x800
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await wait(300);

  let headerDesktop = await send('Runtime.evaluate', {
    expression: `(() => {
      const deskActions = document.querySelector('.topbar-desktop-actions');
      const mobileWrap = document.querySelector('.topbar-adaptive-actions-wrap');
      const deskComp = deskActions ? window.getComputedStyle(deskActions) : null;
      const mobComp = mobileWrap ? window.getComputedStyle(mobileWrap) : null;
      return {
        desktopDisplay: deskComp ? deskComp.display : null,
        mobileWrapDisplay: mobComp ? mobComp.display : null
      };
    })()`,
    returnByValue: true
  });

  record(
    "HDR-DESK-01: At 1280px, desktop quick actions are visible and mobile dropdown button is hidden",
    headerDesktop.result.value.desktopDisplay !== 'none' && headerDesktop.result.value.mobileWrapDisplay === 'none',
    JSON.stringify(headerDesktop.result.value)
  );

  // Set mobile viewport 375x667
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true
  });
  await wait(300);

  let headerMobile = await send('Runtime.evaluate', {
    expression: `(() => {
      const deskActions = document.querySelector('.topbar-desktop-actions');
      const mobileWrap = document.querySelector('.topbar-adaptive-actions-wrap');
      const deskComp = deskActions ? window.getComputedStyle(deskActions) : null;
      const mobComp = mobileWrap ? window.getComputedStyle(mobileWrap) : null;
      return {
        desktopDisplay: deskComp ? deskComp.display : null,
        mobileWrapDisplay: mobComp ? mobComp.display : null
      };
    })()`,
    returnByValue: true
  });

  record(
    "HDR-MOB-01: At 375px, desktop quick actions are collapsed and mobile actions menu button is visible",
    headerMobile.result.value.desktopDisplay === 'none' && (headerMobile.result.value.mobileWrapDisplay === 'flex' || headerMobile.result.value.mobileWrapDisplay === 'inline-flex'),
    JSON.stringify(headerMobile.result.value)
  );

  // Test dropdown toggle and close
  let dropdownTest = await send('Runtime.evaluate', {
    expression: `(() => {
      toggleHeaderActionsDropdown();
      const dd = document.getElementById('headerActionsDropdown');
      const openDisplay = dd ? dd.style.display : null;
      closeHeaderActionsDropdown();
      const closeDisplay = dd ? dd.style.display : null;
      return { openDisplay, closeDisplay };
    })()`,
    returnByValue: true
  });

  record(
    "HDR-MOB-02: Header actions dropdown opens with 'block' display and closes with 'none'",
    dropdownTest.result.value.openDisplay === 'block' && dropdownTest.result.value.closeDisplay === 'none',
    JSON.stringify(dropdownTest.result.value)
  );

  // 2. REPORTS DASHBOARD ZERO-DATA & PROGRESS METERS
  console.log("\n📍 SECTION 2: REPORTS DASHBOARD ZERO-DATA & PROGRESS METERS");

  let zeroDonut = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (typeof switchTab === 'function') switchTab('dashboard');
      if (typeof toggleDonutDataset === 'function') toggleDonutDataset('category');
      await renderDonutChart([], []);
      const val = document.getElementById('donutCenterValue')?.innerText;
      const sub = document.getElementById('donutCenterSub')?.innerText;
      return { val, sub };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  record(
    "DASH-DONUT-01: Empty orders list renders '₹0' in donut center (not ₹1)",
    zeroDonut.result.value.val === '₹0',
    `Expected ₹0, got: ${zeroDonut.result.value.val}`
  );

  let zeroMeters = await send('Runtime.evaluate', {
    expression: `(() => {
      renderVerticalProgressMeters([]);
      const fills = Array.from(document.querySelectorAll('#categoryVerticalMeters .meter-fill-vertical'));
      const heights = fills.map(f => f.style.height);
      return { heights };
    })()`,
    returnByValue: true
  });

  record(
    "DASH-METERS-01: Zero revenue categories render 0% fill height (no false 6% sliver)",
    zeroMeters.result.value.heights.every(h => h === '0%'),
    JSON.stringify(zeroMeters.result.value)
  );

  // 3. INVENTORY STOCK GRID CARDS & INLINE ACCORDIONS
  console.log("\n📍 SECTION 3: INVENTORY STOCK GRID CARDS & INLINE ACCORDIONS");

  let invCards = await send('Runtime.evaluate', {
    expression: `(() => {
      if (typeof switchTab === 'function') switchTab('inventory');
      const cards = document.querySelectorAll('.inv-stock-cards-grid .inv-stock-card');
      const firstCard = cards[0];
      const hasName = firstCard ? !!firstCard.querySelector('.inv-card-name') : false;
      const hasLevels = firstCard ? !!firstCard.querySelector('.inv-card-levels-stacked') : false;
      const hasBadge = firstCard ? (firstCard.querySelector('.inv-badge-instock') || firstCard.querySelector('.inv-badge-low') || firstCard.querySelector('.inv-badge-out')) : false;
      return {
        cardCount: cards.length,
        hasName,
        hasLevels,
        hasBadge: !!hasBadge
      };
    })()`,
    returnByValue: true
  });

  record(
    "INV-CARD-01: Raw stock renders responsive grid cards with bold names, stacked levels & badges",
    invCards.result.value.cardCount > 0 && invCards.result.value.hasName && invCards.result.value.hasLevels && invCards.result.value.hasBadge,
    JSON.stringify(invCards.result.value)
  );

  let invAccordions = await send('Runtime.evaluate', {
    expression: `(() => {
      const panelBatch = document.getElementById('invAccordionBatching');
      const bodyBatch = document.getElementById('invAccBodyBatching');
      const initialDisplay = bodyBatch ? bodyBatch.style.display : null;
      window.culinaryInventory.toggleAccordion('batching');
      const expandedDisplay = bodyBatch ? bodyBatch.style.display : null;
      window.culinaryInventory.toggleAccordion('batching');
      const collapsedDisplay = bodyBatch ? bodyBatch.style.display : null;
      return { initialDisplay, expandedDisplay, collapsedDisplay };
    })()`,
    returnByValue: true
  });

  record(
    "INV-ACC-01: Morning Prep accordion toggles inline expansion smoothly",
    invAccordions.result.value.expandedDisplay === 'block' && invAccordions.result.value.collapsedDisplay === 'none',
    JSON.stringify(invAccordions.result.value)
  );

  // 4. CRM & WHATSAPP MARKETING HUB ACCORDIONS & FLOATING PREVIEW
  console.log("\n📍 SECTION 4: CRM & WHATSAPP ACCORDIONS & MOBILE FLOATING PREVIEW");

  let crmAccordions = await send('Runtime.evaluate', {
    expression: `(() => {
      if (typeof switchTab === 'function') switchTab('customers');
      if (typeof switchCustomerHubTab === 'function') switchCustomerHubTab('marketing');
      const accordions = document.querySelectorAll('.wa-tier-accordion');
      const vipAcc = document.getElementById('waTierAcc-vip');
      const isInitialOpen = vipAcc && !vipAcc.classList.contains('collapsed');
      toggleWaTierAccordion('vip');
      const isCollapsed = vipAcc && vipAcc.classList.contains('collapsed');
      toggleWaTierAccordion('vip');
      const isRestored = vipAcc && !vipAcc.classList.contains('collapsed');
      return {
        accordionCount: accordions.length,
        isInitialOpen,
        isCollapsed,
        isRestored
      };
    })()`,
    returnByValue: true
  });

  record(
    "CRM-ACC-01: Customer contacts render 3 collapsible tier accordions (VIP, Regular, Occasional)",
    crmAccordions.result.value.accordionCount === 3 && crmAccordions.result.value.isCollapsed && crmAccordions.result.value.isRestored,
    JSON.stringify(crmAccordions.result.value)
  );

  let waPreviewMobile = await send('Runtime.evaluate', {
    expression: `(() => {
      const pill = document.getElementById('waFloatingPreviewPill');
      const mockup = document.getElementById('waPhoneMockupCard');
      const backdrop = document.getElementById('waPreviewBackdrop');
      
      toggleWaPreviewExpand(true);
      const isExpanded = mockup.classList.contains('expanded') && backdrop.classList.contains('active');
      
      toggleWaPreviewExpand(false);
      const isDismissed = !mockup.classList.contains('expanded') && !backdrop.classList.contains('active') && pill.classList.contains('minimized');
      
      return { isExpanded, isDismissed };
    })()`,
    returnByValue: true
  });

  record(
    "WA-PREV-01: Floating preview pill expands into modal simulation and dismisses cleanly",
    waPreviewMobile.result.value.isExpanded && waPreviewMobile.result.value.isDismissed,
    JSON.stringify(waPreviewMobile.result.value)
  );

  let waQueueAccessible = await send('Runtime.evaluate', {
    expression: `(() => {
      const queueList = document.getElementById('waSelectedBroadcastQueue');
      const comp = window.getComputedStyle(queueList);
      return {
        exists: !!queueList,
        display: comp.display,
        visible: comp.visibility !== 'hidden'
      };
    })()`,
    returnByValue: true
  });

  record(
    "WA-QUEUE-01: 1-Tap send queue remains fully accessible and visible on mobile",
    waQueueAccessible.result.value.exists && waQueueAccessible.result.value.display !== 'none',
    JSON.stringify(waQueueAccessible.result.value)
  );

  console.log("\n====================================================================");
  console.log(`🎯 EMPIRICAL AUDIT SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================================");

  ws.close();
  chromeProc.kill();
  process.exit(failed === 0 ? 0 : 1);
})();
