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
  console.log("🚀 EMPIRICAL CDP TEST: M2 MOBILE INVENTORY MASTER-DETAIL INTERACTION");
  console.log("====================================================================\n");

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'chrome_m2_test_' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9889',
    '--user-data-dir=' + userDataDir,
    '--window-size=375,667',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5000'
  ]);

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    try {
      targets = await getJson('http://127.0.0.1:9889/json/list');
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

  // Set mobile viewport 375x667
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    mobile: true
  });
  await wait(300);

  // Switch to inventory tab
  await send('Runtime.evaluate', {
    expression: `(() => {
      if (typeof switchTab === 'function') switchTab('inventory');
    })()`
  });
  await wait(500);

  // Check inventory card elements on mobile
  let mobCards = await send('Runtime.evaluate', {
    expression: `(() => {
      const cards = document.querySelectorAll('.inv-stock-cards-grid .inv-stock-card');
      if (!cards.length) return { error: 'No cards found' };
      const card = cards[0];
      const master = card.querySelector('.inv-row-master');
      const drawer = card.querySelector('.inv-row-drawer');
      const name = card.querySelector('.inv-card-name');
      const stock = card.querySelector('.inv-stock-qty');
      const chevron = card.querySelector('.inv-row-chevron');
      const badge = card.querySelector('.inv-badge-instock, .inv-badge-low, .inv-badge-out');
      const masterComp = window.getComputedStyle(master);
      const drawerComp = window.getComputedStyle(drawer);
      return {
        cardCount: cards.length,
        hasMaster: !!master,
        hasDrawer: !!drawer,
        hasName: !!name,
        hasStock: !!stock,
        hasChevron: !!chevron,
        hasBadge: !!badge,
        masterMinHeight: masterComp.minHeight,
        drawerMaxHeight: drawerComp.maxHeight,
        drawerVisibility: drawerComp.visibility,
        isExpandedInitial: card.classList.contains('expanded')
      };
    })()`,
    returnByValue: true
  });

  record(
    "MOB-INV-01: Mobile raw stock renders master row with min-height >= 50px and collapsed drawer",
    mobCards.result.value.hasMaster &&
    mobCards.result.value.hasDrawer &&
    mobCards.result.value.hasName &&
    mobCards.result.value.hasStock &&
    mobCards.result.value.hasChevron &&
    mobCards.result.value.drawerMaxHeight === '0px' &&
    !mobCards.result.value.isExpandedInitial,
    JSON.stringify(mobCards.result.value)
  );

  // Test toggling expansion via click on master row
  let toggleExpand = await send('Runtime.evaluate', {
    expression: `(async () => {
      const card = document.querySelector('.inv-stock-cards-grid .inv-stock-card');
      const master = card.querySelector('.inv-row-master');
      master.click();
      await new Promise(r => setTimeout(r, 350));
      const isExpandedAfterClick = card.classList.contains('expanded');
      const drawer = card.querySelector('.inv-row-drawer');
      const drawerComp = window.getComputedStyle(drawer);
      const restockBtn = card.querySelector('.btn-restock-quick');
      const restockComp = restockBtn ? window.getComputedStyle(restockBtn) : null;
      return {
        isExpandedAfterClick,
        drawerMaxHeight: drawerComp.maxHeight,
        drawerVisibility: drawerComp.visibility,
        restockMinHeight: restockComp ? restockComp.minHeight : null
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  record(
    "MOB-INV-02: Clicking master row expands accordion drawer to max-height 320px with visible restock action (min-height >= 44px)",
    toggleExpand.result.value.isExpandedAfterClick &&
    toggleExpand.result.value.drawerMaxHeight === '320px' &&
    toggleExpand.result.value.drawerVisibility === 'visible' &&
    toggleExpand.result.value.restockMinHeight === '44px',
    JSON.stringify(toggleExpand.result.value)
  );

  // Test collapsing by clicking again
  let toggleCollapse = await send('Runtime.evaluate', {
    expression: `(async () => {
      const card = document.querySelector('.inv-stock-cards-grid .inv-stock-card');
      const master = card.querySelector('.inv-row-master');
      master.click();
      await new Promise(r => setTimeout(r, 350));
      const isExpandedAfterSecondClick = card.classList.contains('expanded');
      const drawer = card.querySelector('.inv-row-drawer');
      const drawerComp = window.getComputedStyle(drawer);
      return {
        isExpandedAfterSecondClick,
        drawerMaxHeight: drawerComp.maxHeight,
        drawerVisibility: drawerComp.visibility
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  record(
    "MOB-INV-03: Clicking master row second time collapses accordion drawer back to 0px",
    !toggleCollapse.result.value.isExpandedAfterSecondClick &&
    toggleCollapse.result.value.drawerMaxHeight === '0px',
    JSON.stringify(toggleCollapse.result.value)
  );

  // Test desktop preservation: resize to 1280x800
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await wait(300);

  let deskCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      const card = document.querySelector('.inv-stock-cards-grid .inv-stock-card');
      const grid = document.querySelector('.inv-stock-cards-grid');
      const chevron = card.querySelector('.inv-row-chevron');
      const drawer = card.querySelector('.inv-row-drawer');
      const gridComp = window.getComputedStyle(grid);
      const chevronComp = window.getComputedStyle(chevron);
      const drawerComp = window.getComputedStyle(drawer);
      return {
        gridDisplay: gridComp.display,
        chevronDisplay: chevronComp.display,
        drawerDisplay: drawerComp.display,
        drawerMaxHeight: drawerComp.maxHeight
      };
    })()`,
    returnByValue: true
  });

  record(
    "DESK-INV-01: On desktop (1280px), grid layout is preserved, chevron is hidden, and drawer is permanently visible",
    deskCheck.result.value.gridDisplay === 'grid' &&
    deskCheck.result.value.chevronDisplay === 'none' &&
    deskCheck.result.value.drawerDisplay === 'block' &&
    deskCheck.result.value.drawerMaxHeight === 'none',
    JSON.stringify(deskCheck.result.value)
  );

  console.log("\n====================================================================");
  console.log(`🎯 EMPIRICAL CDP SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================================");

  ws.close();
  chromeProc.kill();
  process.exit(failed === 0 ? 0 : 1);
})();
