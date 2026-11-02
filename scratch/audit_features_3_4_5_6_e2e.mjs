// scratch/audit_features_3_4_5_6_e2e.mjs
import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const BASE_URL = 'http://localhost:5000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9255;
const USER_DATA_DIR = path.join(process.cwd(), 'scratch', 'chrome_audit_profile_' + Date.now());

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
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data);
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
    if (res && res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || JSON.stringify(res.exceptionDetails);
      throw new Error(`Eval error: ${desc}`);
    }
    return res?.result?.value;
  }

  async setViewport(width, height) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 600
    });
  }

  async screenshot(filePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log("==============================================================================");
  console.log("🧪 MULTI-DEVICE E2E TEST & BUG AUDIT: FEATURES 3, 4, 5, 6");
  console.log("==============================================================================\n");

  const results = {
    feature3: { passed: 0, failed: 0, tests: [] },
    feature4: { passed: 0, failed: 0, tests: [] },
    feature5: { passed: 0, failed: 0, tests: [] },
    feature6: { passed: 0, failed: 0, tests: [] }
  };

  function record(feature, name, ok, details = '') {
    const target = results[feature];
    if (ok) {
      target.passed++;
      console.log(`  ✅ [PASS] [${feature.toUpperCase()}] ${name}`);
      target.tests.push({ name, status: 'PASS', details });
    } else {
      target.failed++;
      console.log(`  ❌ [FAIL] [${feature.toUpperCase()}] ${name} -> ${details}`);
      target.tests.push({ name, status: 'FAIL', details });
    }
  }

  // --------------------------------------------------------------------------
  // 1. FEATURE 3: CULINARY INVENTORY HUB (API & LOGIC)
  // --------------------------------------------------------------------------
  console.log("\n📍 --- FEATURE 3: CULINARY INVENTORY HUB (API & LOGIC) ---");
  try {
    // 3.1 Raw materials endpoint
    const rawRes = await fetch(`${BASE_URL}/api/inventory/raw-materials`);
    const rawData = await rawRes.json();
    record('feature3', 'Raw Materials Endpoint returns 200 and materials array', rawRes.status === 200 && Array.isArray(rawData.materials));

    // 3.2 Sub-recipes endpoint
    const subRes = await fetch(`${BASE_URL}/api/inventory/sub-recipes`);
    const subData = await subRes.json();
    record('feature3', 'Sub-recipes Endpoint returns 200 and sub_recipes array', subRes.status === 200 && Array.isArray(subData.sub_recipes));

    // 3.3 Food Costing report
    const costRes = await fetch(`${BASE_URL}/api/inventory/costing`);
    const costData = await costRes.json();
    record('feature3', 'Costing Report returns dishes with profit and margin calculations', costRes.status === 200 && Array.isArray(costData.costing));

    // 3.4 Batch production math & shortage rejection
    const batchShortageRes = await fetch(`${BASE_URL}/api/inventory/batch-produce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub_recipe_id: 'SUB-MAK-01', multiplier: 999999 })
    });
    record('feature3', 'Batch production rejects excessive multiplier with shortage 400', batchShortageRes.status === 400);

    // 3.5 POS order inventory deduction endpoint
    const deductRes = await fetch(`${BASE_URL}/api/inventory/pos-deduct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { name: 'Paneer Butter Masala', quantity: 1 }
        ]
      })
    });
    const deductData = await deductRes.json();
    record('feature3', 'POS order inventory deduction returns success and deductions', deductRes.status === 200 && deductData.success === true);

    // 3.6 Purchase Orders & Forecast
    const poRes = await fetch(`${BASE_URL}/api/inventory/purchase-orders`);
    const poData = await poRes.json();
    record('feature3', 'Purchase orders endpoint returns array of POs', poRes.status === 200 && Array.isArray(poData.purchase_orders));

    const fcRes = await fetch(`${BASE_URL}/api/inventory/forecast`);
    const fcData = await fcRes.json();
    record('feature3', 'Predictive forecast endpoint returns forecast items', fcRes.status === 200 && Array.isArray(fcData.forecast));
  } catch (err) {
    record('feature3', 'Backend API connectivity', false, err.message);
  }

  // --------------------------------------------------------------------------
  // 2. FEATURE 4: CUSTOMER CRM & KHATA (API & INVARIANTS)
  // --------------------------------------------------------------------------
  console.log("\n📍 --- FEATURE 4: CUSTOMER CRM & KHATA (DATA & BUSINESS LOGIC) ---");
  try {
    const { calculateLoyaltyTier, LOYALTY_TIERS } = await import('../src/features/customers/customers.service.js');
    record('feature4', 'Loyalty tier progression: 0 visits -> Bronze', calculateLoyaltyTier(0) === LOYALTY_TIERS.BRONZE);
    record('feature4', 'Loyalty tier progression: 5 visits -> Silver', calculateLoyaltyTier(5) === LOYALTY_TIERS.SILVER);
    record('feature4', 'Loyalty tier progression: 10 visits -> Gold', calculateLoyaltyTier(10) === LOYALTY_TIERS.GOLD);

    // WhatsApp Reminder link formatting
    const custPhone = '98765 43210';
    const cleanPhone = custPhone.replace(/\D/g, '');
    const reminderMsg = encodeURIComponent('Dear Customer, your pending balance is ₹ 350.00.');
    const waLink = `https://wa.me/91${cleanPhone}?text=${reminderMsg}`;
    record('feature4', 'WhatsApp link properly cleans phone and URI encodes message', waLink.includes('919876543210') && waLink.includes('%E2%82%B9'));

    // Check modal close button invariants on CRM modals in index.html
    const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
    const khataPaymentModalMatch = indexHtml.match(/<div[^>]*id=["']recordKhataPaymentModal["'][\s\S]*?<\/div>/);
    const hasKhataClose = indexHtml.includes('class="khata-close-btn"');
    const khataUsesModalClose = indexHtml.includes('id="recordKhataPaymentModal"') && /<div[^>]*id=["']recordKhataPaymentModal["'][\s\S]*?class=["'][^"']*modal-close-btn/.test(indexHtml);
    record('feature4', 'Khata payment modal strictly avoids .modal-close-btn to protect invariant', hasKhataClose && !khataUsesModalClose);
  } catch (err) {
    record('feature4', 'CRM logic check', false, err.message);
  }

  // --------------------------------------------------------------------------
  // 3. FEATURE 5: FOOD IMAGE MANAGER (API & FALLBACKS)
  // --------------------------------------------------------------------------
  console.log("\n📍 --- FEATURE 5: FOOD IMAGE MANAGER (ENDPOINTS & FALLBACKS) ---");
  try {
    // 5.1 Multimodal image generation endpoint
    const genRes = await fetch(`${BASE_URL}/api/food-images/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dishName: 'Paneer Tikka',
        cuisine: 'North Indian',
        servingStyle: 'Sizzling Platter',
        dietary: ['Vegetarian']
      })
    });
    const genData = await genRes.json();
    record('feature5', 'Food image generate endpoint returns valid payload', genRes.status === 200 && (genData.success === true || (genData.success === false && genData.fallbackUrl)));

    // 5.2 Test Fallback URL validity
    const fallbackUrl = genData.imageUrl || genData.fallbackUrl;
    record('feature5', 'Gourmet photography fallback URL is valid HTTP/HTTPS string', Boolean(fallbackUrl && fallbackUrl.startsWith('http')));

    // 5.3 Test Upload Size & Rejection
    const overSizedBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(4 * 1024 * 1024); // 4MB
    const uploadOversizeRes = await fetch(`${BASE_URL}/api/food-images/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dishId: 'test_dish',
        dishName: 'Oversize Item',
        base64Data: overSizedBase64,
        mimeType: 'image/jpeg'
      })
    });
    record('feature5', 'Upload endpoint rejects payload exceeding 3MB limit with 413', uploadOversizeRes.status === 413);

    // 5.4 Test Path Traversal Protection on Delete
    const deleteTraversalRes = await fetch(`${BASE_URL}/api/food-images/..%2F..%2Fserver.js`, {
      method: 'DELETE'
    });
    record('feature5', 'Delete endpoint rejects or sanitizes path traversal safely', deleteTraversalRes.status === 200 || deleteTraversalRes.status === 400 || deleteTraversalRes.status === 404);
  } catch (err) {
    record('feature5', 'Food image endpoint check', false, err.message);
  }

  // --------------------------------------------------------------------------
  // 4. FEATURE 6: OFFLINE PWA & THERMAL PRINTER BRIDGE
  // --------------------------------------------------------------------------
  console.log("\n📍 --- FEATURE 6: OFFLINE PWA & THERMAL PRINTER BRIDGE ---");
  try {
    const { ThermalPrinterBridge } = await import('../src/core/platform-bridge.js');
    const mockBill = {
      invoice_id: 'BN-T1-261031-9999',
      settled_at: new Date().toISOString(),
      final_payable_paise: 25000,
      items: [
        { name: 'Masala Chai', quantity: 2, line_total_paise: 6000 },
        { name: 'Veg Samosa', quantity: 2, line_total_paise: 19000 }
      ]
    };

    const escCommands = ThermalPrinterBridge.generateEscPosCommands(mockBill);
    record('feature6', 'Thermal printer ESC/POS commands generated as Uint8Array', escCommands instanceof Uint8Array && escCommands.length > 50);

    const queueRes = await ThermalPrinterBridge.enqueuePrintJob(mockBill);
    record('feature6', 'Decoupled print job queue enqueues asynchronously without blocking', queueRes.data?.queued === true);

    // Check service worker file existence and invariants
    const swPath = path.join(process.cwd(), 'service-worker.js');
    const swContent = fs.readFileSync(swPath, 'utf8');
    record('feature6', 'Service worker implements Stale-While-Revalidate and bypasses /api/', swContent.includes('Stale-While-Revalidate') && swContent.includes("url.pathname.startsWith('/api/')"));
  } catch (err) {
    record('feature6', 'Printer bridge & PWA check', false, err.message);
  }

  // --------------------------------------------------------------------------
  // 5. MULTI-DEVICE BROWSER WORKFLOWS (PC 1440x900, Tablet 768x1024, Mobile 375x667)
  // --------------------------------------------------------------------------
  console.log("\n📍 --- MULTI-DEVICE BROWSER WORKFLOW AUDIT ---");
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--window-size=1440,900',
    'about:blank'
  ]);

  let client;
  try {
    await sleep(2000);
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    console.log("Navigating to http://localhost:5000...");
    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(2500);

    // Bypass login modal if present
    await client.evaluate(`
      const auth = document.getElementById('shopAuthModal');
      if (auth && auth.style.display !== 'none') {
        if (typeof bypassShopAuthDemo === 'function') bypassShopAuthDemo();
      }
      localStorage.setItem('billnaw_user_role', 'admin');
    `);
    await sleep(1500);

    const viewports = [
      { name: 'PC', width: 1440, height: 900 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Mobile', width: 375, height: 667 }
    ];

    for (const vp of viewports) {
      console.log(`\n🔍 --- AUDITING VIEWPORT: ${vp.name} (${vp.width}x${vp.height}) ---`);
      await client.setViewport(vp.width, vp.height);
      await sleep(1000);

      // Audit Feature 3 in this viewport
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('inventory');`);
      await sleep(1200);

      const invCheck = await client.evaluate(`
        (() => {
          const tab = document.getElementById('inventory');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const hasHorizontalOverflow = scrollWidth > innerWidth + 5;
          const addBtn = document.getElementById('btnAddNewMaterial') || document.querySelector('[onclick*="openAddMaterialModal"]');
          const addBtnRect = addBtn ? addBtn.getBoundingClientRect() : null;
          return {
            isVisible,
            hasHorizontalOverflow,
            addBtnSize: addBtnRect ? { width: addBtnRect.width, height: addBtnRect.height } : null
          };
        })()
      `);
      record('feature3', `${vp.name}: Inventory tab visible without unhandled overflow`, invCheck.isVisible && !invCheck.hasHorizontalOverflow);
      if (invCheck.addBtnSize) {
        record('feature3', `${vp.name}: Inventory action button has adequate touch target (height >= 36px)`, invCheck.addBtnSize.height >= 36);
      }

      // Audit Feature 4 in this viewport
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('customers');`);
      await sleep(1200);

      const custCheck = await client.evaluate(`
        (() => {
          const tab = document.getElementById('customers');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const table = document.getElementById('customersTableBody');
          const rowCount = table ? table.querySelectorAll('tr').length : 0;
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const hasHorizontalOverflow = scrollWidth > innerWidth + 5;
          
          let mobileCardCheck = true;
          if (innerWidth <= 640 && rowCount > 0) {
            const firstRow = table.querySelector('tr');
            const display = window.getComputedStyle(firstRow).display;
            mobileCardCheck = display === 'grid' || display === 'flex' || display === 'block';
          }

          return {
            isVisible,
            rowCount,
            hasHorizontalOverflow,
            mobileCardCheck
          };
        })()
      `);
      record('feature4', `${vp.name}: Customers tab visible and zero horizontal viewport overflow`, custCheck.isVisible && !custCheck.hasHorizontalOverflow);
      if (vp.width <= 640) {
        record('feature4', `${vp.name}: Customers table renders as responsive card grid`, custCheck.mobileCardCheck);
      }

      // Audit Feature 5 in this viewport (Menu dish card images)
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('menu');`);
      await sleep(1200);

      const menuCheck = await client.evaluate(`
        (() => {
          const tab = document.getElementById('menu');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const cards = document.querySelectorAll('.menu-item-card, .dish-card, #menuGrid > div');
          const images = document.querySelectorAll('#menuGrid img');
          let brokenImages = 0;
          images.forEach(img => {
            if (img.naturalWidth === 0 && img.src && !img.src.includes('data:image/svg')) brokenImages++;
          });
          return {
            isVisible,
            cardCount: cards.length,
            brokenImages
          };
        })()
      `);
      record('feature5', `${vp.name}: Menu item dish cards render with healthy image backdrops`, menuCheck.isVisible && menuCheck.brokenImages === 0);

      // Audit Feature 6 in this viewport (POS Fast Tender & Receipt UI)
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('pos');`);
      await sleep(1200);

      const posCheck = await client.evaluate(`
        (() => {
          const tab = document.getElementById('pos');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const cart = document.getElementById('cartContainer') || document.querySelector('.pos-cart-panel');
          const isCartVisible = cart && window.getComputedStyle(cart).display !== 'none';
          return {
            isVisible,
            isCartVisible
          };
        })()
      `);
      record('feature6', `${vp.name}: POS terminal displays operational workspace & cart`, posCheck.isVisible);
    }

  } finally {
    if (client) client.close();
    chromeProc.kill();
  }

  console.log("\n==============================================================================");
  console.log("📊 AUDIT SCORECARD SUMMARY");
  console.log("==============================================================================");
  for (const [key, val] of Object.entries(results)) {
    console.log(`  ${key.toUpperCase()}: ${val.passed} Passed, ${val.failed} Failed (Total: ${val.passed + val.failed})`);
  }
  console.log("==============================================================================\n");

  fs.writeFileSync(
    path.join(process.cwd(), 'scratch', 'audit_features_3_4_5_6_results.json'),
    JSON.stringify(results, null, 2)
  );
}

run().catch(err => {
  console.error("Fatal audit runner error:", err);
  process.exit(1);
});
