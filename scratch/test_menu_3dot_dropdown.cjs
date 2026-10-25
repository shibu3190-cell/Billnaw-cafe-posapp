const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
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
  console.log("🔍 EMPIRICAL TEST: MENU 3-DOT ACTION DROPDOWN & MOBILE TITLES");
  console.log("====================================================================\n");

  // 1. Static Invariant & Code Checks
  const html = fs.readFileSync('index.html', 'utf8');
  const css = fs.readFileSync('style.css', 'utf8');
  const menuJs = fs.readFileSync('js/menu.js', 'utf8');

  console.log("📍 STAGE 1: CODE STRUCTURE & INVARIANTS");

  // Invariant 1: Exactly 26 SVG modal close buttons
  const modalMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
  assert.strictEqual(modalMatches ? modalMatches.length : 0, 26, "System invariant violated: expected exactly 26 SVG modal-close-btn in index.html");
  console.log("  ✅ PASS: Exactly 26 SVG modal close buttons in index.html");

  // Invariant 2: 3-dot button and dropdown in menu.js
  assert.ok(menuJs.includes('clean-item-more-btn'), "Missing clean-item-more-btn in js/menu.js");
  assert.ok(menuJs.includes('toggleMenuItemDropdown'), "Missing toggleMenuItemDropdown in js/menu.js");
  assert.ok(menuJs.includes('closeAllMenuActionDropdowns'), "Missing closeAllMenuActionDropdowns in js/menu.js");
  assert.ok(menuJs.includes('menuItemDropdown-'), "Missing menuItemDropdown ID template in js/menu.js");
  console.log("  ✅ PASS: clean-item-more-btn & dropdown handlers present in js/menu.js");

  // Invariant 3: Dropdown items present: Adjust Stock, Edit Item, Delete Item
  assert.ok(menuJs.includes('openQuickAdjustStockModal'), "Missing openQuickAdjustStockModal in menu dropdown");
  assert.ok(menuJs.includes('editMenuItem'), "Missing editMenuItem in menu dropdown");
  assert.ok(menuJs.includes('deleteMenuItem'), "Missing deleteMenuItem in menu dropdown");
  console.log("  ✅ PASS: All 3 actions (Adjust Stock, Edit Item, Delete Item) mapped in js/menu.js");

  // Invariant 4: CSS styling
  assert.ok(css.includes('.clean-item-more-btn'), "Missing .clean-item-more-btn in style.css");
  assert.ok(css.includes('.clean-item-card.dropdown-open'), "Missing .clean-item-card.dropdown-open in style.css");
  assert.ok(css.includes('.clean-item-right .action-dropdown-menu'), "Missing .clean-item-right .action-dropdown-menu in style.css");
  console.log("  ✅ PASS: CSS rules for 3-dot button, z-index elevation, and dropdown menu defined");

  // 2. Headless Chrome Browser Empirical Interaction
  console.log("\n📍 STAGE 2: HEADLESS CHROME MOBILE EMPIRICAL VALIDATION (375x667)");

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'chrome_menu_test_' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9891',
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
      targets = await getJson('http://127.0.0.1:9891/json/list');
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
  await send('DOM.enable');

  // Wait for page to initialize
  await wait(2500);

  // Switch to Menu Catalog
  const evalRes1 = await send('Runtime.evaluate', {
    expression: `
      (function() {
        if (typeof switchTab === 'function') {
          switchTab('menu');
        }
        return {
          currentTab: document.getElementById('menu') ? document.getElementById('menu').className : '',
          cardCount: document.querySelectorAll('#cleanItemCardsList .clean-item-card').length
        };
      })()
    `,
    returnByValue: true
  });

  await wait(500);

  const tabState = evalRes1.result.value;
  console.log("  Menu Catalog Tab loaded:", tabState);
  assert.ok(tabState.cardCount > 0, "Expected at least 1 menu item card rendered in #cleanItemCardsList");
  console.log(`  ✅ PASS: Rendered ${tabState.cardCount} clean item cards in Menu Catalog`);

  // Verify cards have 3-dot button and NO inline adjust-stock or edit buttons
  const checkButtonsRes = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const cards = document.querySelectorAll('#cleanItemCardsList .clean-item-card');
        const results = [];
        cards.forEach((card, idx) => {
          const nameEl = card.querySelector('.clean-item-name');
          const moreBtn = card.querySelector('.clean-item-more-btn');
          const dropdown = card.querySelector('.action-dropdown-menu');
          const inlineAdjust = card.querySelector('.adjust-stock-btn');
          const inlineEdit = card.querySelector('.clean-item-action-btn:not(.clean-item-more-btn)');
          const nameRect = nameEl ? nameEl.getBoundingClientRect() : null;

          results.push({
            dishName: nameEl ? nameEl.textContent.trim() : '',
            nameWidth: nameRect ? nameRect.width : 0,
            has3DotBtn: !!moreBtn,
            hasDropdown: !!dropdown,
            dropdownDisplay: dropdown ? window.getComputedStyle(dropdown).display : 'none',
            hasInlineAdjust: !!inlineAdjust,
            hasInlineEdit: !!inlineEdit
          });
        });
        return results;
      })()
    `,
    returnByValue: true
  });

  const cardsInfo = checkButtonsRes.result.value;
  console.log("  Clean Item Cards Inspection:", JSON.stringify(cardsInfo, null, 2));

  for (const c of cardsInfo) {
    assert.strictEqual(c.has3DotBtn, true, `Card '${c.dishName}' missing 3-dot button`);
    assert.strictEqual(c.hasDropdown, true, `Card '${c.dishName}' missing action-dropdown-menu`);
    assert.strictEqual(c.hasInlineAdjust, false, `Card '${c.dishName}' still has crowded inline Adjust Stock button`);
    assert.strictEqual(c.hasInlineEdit, false, `Card '${c.dishName}' still has crowded inline Edit button`);
    assert.ok(c.nameWidth >= 20, `Card '${c.dishName}' name width is too small (${c.nameWidth}px)`);
  }
  console.log("  ✅ PASS: All cards feature 3-dot button, hidden dropdown, zero crowded inline buttons");

  // Scroll cleanItemCardsList into view and open dropdown on Samosa
  const openDropdownRes = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const list = document.getElementById('cleanItemCardsList');
        if (list) list.scrollIntoView({ behavior: 'instant', block: 'start' });
        const firstBtn = document.querySelector('#cleanItemCardsList .clean-item-card .clean-item-more-btn');
        if (!firstBtn) return { success: false, err: "no button" };
        firstBtn.click();
        const firstDropdown = document.querySelector('#cleanItemCardsList .clean-item-card .action-dropdown-menu');
        const items = firstDropdown ? Array.from(firstDropdown.querySelectorAll('.action-dropdown-item')).map(b => b.textContent.trim()) : [];
        return {
          success: true,
          dropdownDisplay: firstDropdown ? window.getComputedStyle(firstDropdown).display : 'none',
          dropdownClass: firstDropdown ? firstDropdown.className : '',
          itemsCount: items.length,
          items: items
        };
      })()
    `,
    returnByValue: true
  });

  await wait(300);

  console.log("  Dropdown open result:", openDropdownRes.result.value);
  assert.strictEqual(openDropdownRes.result.value.dropdownDisplay, 'block', "Dropdown should be display: block after clicking 3-dot button");
  assert.strictEqual(openDropdownRes.result.value.itemsCount, 3, "Dropdown should have 3 items");
  assert.ok(openDropdownRes.result.value.items.some(i => i.includes("Adjust Stock")), "Missing Adjust Stock option");
  assert.ok(openDropdownRes.result.value.items.some(i => i.includes("Edit Item")), "Missing Edit Item option");
  assert.ok(openDropdownRes.result.value.items.some(i => i.includes("Delete Item")), "Missing Delete Item option");
  console.log("  ✅ PASS: 3-dot click successfully reveals dropdown with Adjust Stock, Edit Item, Delete Item");

  // Capture screenshot of open 3-dot dropdown
  const screenshotObj = await send('Page.captureScreenshot', { format: 'png' });
  const artifactDir = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
  const screenshotPath = path.join(artifactDir, 'screen_menu_3dot_dropdown_verified.png');
  fs.writeFileSync(screenshotPath, Buffer.from(screenshotObj.data, 'base64'));
  console.log(`  📸 Screenshot saved to: ${screenshotPath}`);

  // Test Click-Outside Dismissal
  const clickOutsideRes = await send('Runtime.evaluate', {
    expression: `
      (function() {
        document.body.click();
        const firstDropdown = document.querySelector('#cleanItemCardsList .clean-item-card .action-dropdown-menu');
        return {
          dropdownDisplay: firstDropdown ? window.getComputedStyle(firstDropdown).display : 'none'
        };
      })()
    `,
    returnByValue: true
  });

  console.log("  Click-outside dismissal result:", clickOutsideRes.result.value);
  assert.strictEqual(clickOutsideRes.result.value.dropdownDisplay, 'none', "Dropdown should be closed on click-outside");
  console.log("  ✅ PASS: Dropdown successfully dismisses on click-outside");

  // Test Triggering "Adjust Stock" Modal from Dropdown
  const triggerModalRes = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const firstBtn = document.querySelector('#cleanItemCardsList .clean-item-card .clean-item-more-btn');
        firstBtn.click();
        const firstDropdown = document.querySelector('#cleanItemCardsList .clean-item-card .action-dropdown-menu');
        const adjustBtn = firstDropdown ? firstDropdown.querySelector('.action-dropdown-item') : null;
        if (adjustBtn) adjustBtn.click();
        const modal = document.getElementById('quickAdjustStockModal');
        return {
          modalDisplay: modal ? window.getComputedStyle(modal).display : 'none',
          itemName: document.getElementById('quickAdjustItemName') ? document.getElementById('quickAdjustItemName').textContent : ''
        };
      })()
    `,
    returnByValue: true
  });

  console.log("  Trigger Adjust Stock modal result:", triggerModalRes.result.value);
  assert.strictEqual(triggerModalRes.result.value.modalDisplay, 'flex', "Quick Adjust Stock Modal should open with display: flex");
  console.log(`  ✅ PASS: Adjust Stock modal successfully opened for dish '${triggerModalRes.result.value.itemName}'`);

  // Close modal
  await send('Runtime.evaluate', {
    expression: `if (typeof closeQuickAdjustStockModal === 'function') closeQuickAdjustStockModal();`
  });

  // Cleanup Chrome
  ws.close();
  chromeProc.kill();

  console.log("\n====================================================================");
  console.log("🎉 ALL MENU 3-DOT DROPDOWN AUDIT CHECKS PASSED EMPIRICALLY (100%)");
  console.log("====================================================================");
  process.exit(0);
})();
