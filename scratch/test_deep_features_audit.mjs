// scratch/test_deep_features_audit.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5000';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9270;
const USER_DATA_DIR = path.join(process.cwd(), 'scratch', 'chrome_deep_audit_' + Date.now());
const SCREENSHOT_DIR = path.join(process.cwd(), 'scratch', 'audit_screenshots');

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

  async screenshot(fileName) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    const targetPath = path.join(SCREENSHOT_DIR, fileName);
    fs.writeFileSync(targetPath, Buffer.from(res.data, 'base64'));
    console.log(`  📸 Saved screenshot: ${fileName}`);
    return targetPath;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function runDeepAudit() {
  console.log("==============================================================================");
  console.log("🔬 MULTI-DEVICE DEEP WORKFLOW & MODAL AUDIT (FEATURES 3, 4, 5, 6)");
  console.log("==============================================================================\n");

  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
  const auditReport = [];

  try {
    await sleep(2500);
    const listRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find(t => t.type === 'page') || targets[0];

    client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(2500);

    // Bypass login modal
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
      console.log(`\n==============================================================================`);
      console.log(`🖥️  DEVICE VIEWPORT: ${vp.name} (${vp.width}x${vp.height})`);
      console.log(`==============================================================================`);
      await client.setViewport(vp.width, vp.height);
      await sleep(1000);

      // ------------------------------------------------------------------------
      // FEATURE 3: INVENTORY HUB
      // ------------------------------------------------------------------------
      console.log(`\n[Feature 3] Auditing Culinary Inventory Hub on ${vp.name}...`);
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('inventory');`);
      await sleep(1000);

      const invData = await client.evaluate(`
        (() => {
          const tab = document.getElementById('inventory');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const overflow = scrollWidth - innerWidth;

          // Check subtabs
          const subTabs = Array.from(document.querySelectorAll('#inventory .inv-subnav-btn, #inventory [onclick*="switchInventoryHubTab"]')).map(b => ({
            text: b.innerText.trim(),
            visible: b.offsetParent !== null
          }));

          // Check KPI cards
          const kpis = Array.from(document.querySelectorAll('#inventory .inv-kpi-card')).map(k => ({
            title: k.querySelector('div:first-child')?.innerText?.trim() || '',
            count: k.querySelector('[id^="invStat"]')?.innerText?.trim() || ''
          }));

          return {
            isVisible,
            overflow,
            hasOverflow: overflow > 5,
            subTabs,
            kpis
          };
        })()
      `);
      await client.screenshot(`f3_inventory_${vp.name.toLowerCase()}.png`);
      auditReport.push({
        feature: 'Feature 3: Culinary Inventory Hub',
        viewport: vp.name,
        component: 'Landing Hub & KPIs',
        status: invData.hasOverflow ? 'DEFECT' : 'PASS',
        metrics: invData
      });

      // Test Add Material Modal
      const addModalCheck = await client.evaluate(`
        (() => {
          if (window.culinaryInventory && typeof window.culinaryInventory.openAddMaterialModal === 'function') {
            window.culinaryInventory.openAddMaterialModal();
          }
          const modal = document.getElementById('addMaterialModal');
          if (!modal) return { exists: false };
          const style = window.getComputedStyle(modal);
          const isVisible = style.display !== 'none';
          const content = modal.querySelector('.modal-content') || modal.querySelector('div[style*="background"]');
          const rect = content ? content.getBoundingClientRect() : null;
          const fitsScreen = rect ? (rect.width <= window.innerWidth && rect.height <= window.innerHeight + 50) : false;
          const hasCloseBtn = modal.querySelector('button[onclick*="closeAddMaterialModal"]') !== null;
          const usesForbiddenCloseClass = modal.querySelector('.modal-close-btn') !== null;
          
          // Close modal
          if (window.culinaryInventory && typeof window.culinaryInventory.closeAddMaterialModal === 'function') {
            window.culinaryInventory.closeAddMaterialModal();
          }

          return {
            exists: true,
            isVisible,
            fitsScreen,
            rect,
            hasCloseBtn,
            usesForbiddenCloseClass
          };
        })()
      `);
      auditReport.push({
        feature: 'Feature 3: Culinary Inventory Hub',
        viewport: vp.name,
        component: 'Add Material Modal',
        status: addModalCheck.fitsScreen ? 'PASS' : 'WARNING',
        metrics: addModalCheck
      });

      // ------------------------------------------------------------------------
      // FEATURE 4: CUSTOMERS & KHATA
      // ------------------------------------------------------------------------
      console.log(`\n[Feature 4] Auditing Customer CRM & Khata on ${vp.name}...`);
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('customers');`);
      await sleep(1000);

      const custData = await client.evaluate(`
        (() => {
          const tab = document.getElementById('customers');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const overflow = scrollWidth - innerWidth;

          // Check directory table rows
          const rows = document.querySelectorAll('#customersTableBody tr');
          const rowDetails = [];
          if (rows.length > 0) {
            const r = rows[0];
            const rStyle = window.getComputedStyle(r);
            const cells = r.querySelectorAll('td');
            rowDetails.push({
              display: rStyle.display,
              gridTemplateColumns: rStyle.gridTemplateColumns,
              cellCount: cells.length,
              spendText: cells[4]?.innerText?.trim() || '',
              phoneText: cells[1]?.innerText?.trim() || ''
            });
          }

          // Check action dropdown touch target
          const actionBtn = document.querySelector('.action-dropdown-btn');
          const actionBtnRect = actionBtn ? actionBtn.getBoundingClientRect() : null;

          return {
            isVisible,
            overflow,
            hasOverflow: overflow > 5,
            rowCount: rows.length,
            rowDetails,
            actionBtnSize: actionBtnRect ? { width: actionBtnRect.width, height: actionBtnRect.height } : null
          };
        })()
      `);
      await client.screenshot(`f4_customers_${vp.name.toLowerCase()}.png`);
      auditReport.push({
        feature: 'Feature 4: Customer CRM & Khata',
        viewport: vp.name,
        component: 'Directory & Loyalty Cards',
        status: custData.hasOverflow ? 'DEFECT' : 'PASS',
        metrics: custData
      });

      // Switch to Khata subview
      await client.evaluate(`if (typeof switchCustomerHubTab === 'function') switchCustomerHubTab('khata');`);
      await sleep(1000);
      const khataData = await client.evaluate(`
        (() => {
          const khataTab = document.getElementById('custTabKhata');
          const isVisible = khataTab && window.getComputedStyle(khataTab).display !== 'none';
          const kpis = {
            totalDue: document.getElementById('khataStatTotalDue')?.innerText?.trim() || '',
            overdue: document.getElementById('khataStatOverdueCount')?.innerText?.trim() || '',
            cleared: document.getElementById('khataStatClearedCount')?.innerText?.trim() || ''
          };
          const rows = document.querySelectorAll('#khataTableBody tr');
          return {
            isVisible,
            kpis,
            rowCount: rows.length
          };
        })()
      `);
      await client.screenshot(`f4_khata_${vp.name.toLowerCase()}.png`);
      auditReport.push({
        feature: 'Feature 4: Customer CRM & Khata',
        viewport: vp.name,
        component: 'Khata Debt Ledger',
        status: khataData.isVisible ? 'PASS' : 'DEFECT',
        metrics: khataData
      });

      // ------------------------------------------------------------------------
      // FEATURE 5: FOOD IMAGE MANAGER & MENU
      // ------------------------------------------------------------------------
      console.log(`\n[Feature 5] Auditing Food Image Manager on ${vp.name}...`);
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('menu');`);
      await sleep(1000);

      const menuData = await client.evaluate(`
        (() => {
          const tab = document.getElementById('menu');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const overflow = scrollWidth - innerWidth;

          const cards = document.querySelectorAll('.menu-item-card, .dish-card, #menuGrid > div');
          const cardImgWrappers = document.querySelectorAll('.card-img-wrapper, .dish-card-img-wrap');
          const pricePills = document.querySelectorAll('.card-img-price-pill');

          return {
            isVisible,
            overflow,
            hasOverflow: overflow > 5,
            cardCount: cards.length,
            imgWrapperCount: cardImgWrappers.length,
            pricePillCount: pricePills.length
          };
        })()
      `);
      await client.screenshot(`f5_menu_${vp.name.toLowerCase()}.png`);
      auditReport.push({
        feature: 'Feature 5: Food Image Manager',
        viewport: vp.name,
        component: 'Dish Card Image Rendering & Price Pills',
        status: menuData.hasOverflow ? 'DEFECT' : 'PASS',
        metrics: menuData
      });

      // Test Edit/Create Item Modal (Food Image Manager Modal)
      const menuItemModalCheck = await client.evaluate(`
        (() => {
          const modal = document.getElementById('menuItemModal');
          if (!modal) return { exists: false };
          if (typeof openNewItemModal === 'function') {
            openNewItemModal();
          } else {
            modal.style.display = 'flex';
          }
          const isVisible = window.getComputedStyle(modal).display !== 'none';
          const content = modal.querySelector('.modal-content') || modal.querySelector('div[style*="background"]');
          const rect = content ? content.getBoundingClientRect() : null;
          const fitsWidth = rect ? rect.width <= window.innerWidth : false;
          
          const photoGenBtn = modal.querySelector('#btnGenerateFoodPhoto, #btnGenAiPhoto, [onclick*="generate"]') || modal.querySelector('button.ai-gen-btn');
          const previewImg = modal.querySelector('#itemPhotoPreview, #newItemImgPreview, img');

          // Close modal
          if (typeof closeItemModal === 'function') closeItemModal();
          else modal.style.display = 'none';

          return {
            exists: true,
            isVisible,
            fitsWidth,
            rect,
            hasPhotoGenBtn: photoGenBtn !== null,
            hasPreviewImg: previewImg !== null
          };
        })()
      `);
      auditReport.push({
        feature: 'Feature 5: Food Image Manager',
        viewport: vp.name,
        component: 'Menu Item & Food Photo Modal',
        status: menuItemModalCheck.fitsWidth ? 'PASS' : 'WARNING',
        metrics: menuItemModalCheck
      });

      // ------------------------------------------------------------------------
      // FEATURE 6: OFFLINE PWA & THERMAL PRINTER BRIDGE
      // ------------------------------------------------------------------------
      console.log(`\n[Feature 6] Auditing Offline PWA & Thermal Printer Bridge on ${vp.name}...`);
      await client.evaluate(`if (typeof switchTab === 'function') switchTab('pos');`);
      await sleep(1000);

      const posData = await client.evaluate(`
        (() => {
          const tab = document.getElementById('pos');
          const isVisible = tab && window.getComputedStyle(tab).display !== 'none';
          const scrollWidth = document.documentElement.scrollWidth;
          const innerWidth = window.innerWidth;
          const overflow = scrollWidth - innerWidth;

          // Check connectivity status / offline indicator
          const isOnline = navigator.onLine;
          const swActive = 'serviceWorker' in navigator && navigator.serviceWorker.controller !== null;

          // Check fast tender buttons
          const cashTenderContainer = document.getElementById('checkoutCashTenderContainer');
          const upiContainer = document.getElementById('checkoutUpiQrContainer');

          return {
            isVisible,
            overflow,
            hasOverflow: overflow > 5,
            isOnline,
            swActive,
            hasCashTender: cashTenderContainer !== null,
            hasUpiContainer: upiContainer !== null
          };
        })()
      `);
      await client.screenshot(`f6_pos_${vp.name.toLowerCase()}.png`);
      auditReport.push({
        feature: 'Feature 6: Offline PWA & Thermal Printer Bridge',
        viewport: vp.name,
        component: 'POS Terminal & PWA Shell',
        status: posData.hasOverflow ? 'DEFECT' : 'PASS',
        metrics: posData
      });
    }

  } finally {
    if (client) client.close();
    chromeProc.kill();
  }

  console.log("\n==============================================================================");
  console.log("📝 WRITING DEEP AUDIT RESULTS TO FILE");
  console.log("==============================================================================\n");
  fs.writeFileSync(
    path.join(process.cwd(), 'scratch', 'deep_audit_report.json'),
    JSON.stringify(auditReport, null, 2)
  );
  console.log("Deep audit finished successfully. Output saved to scratch/deep_audit_report.json");
}

runDeepAudit().catch(err => {
  console.error("Deep audit fatal error:", err);
  process.exit(1);
});
