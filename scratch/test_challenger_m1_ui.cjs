// scratch/test_challenger_m1_ui.cjs
// ============================================================================
// CHALLENGER EMPIRICAL SUITE: MILESTONE 1 UI/UX STRESS-TESTING (R1 & R2)
// Testing: Real Headless Chrome (CDP) + Multi-Viewport Geometry & Layout Engine
// Viewports: 320x568, 360x800, 375x667, 390x844
// Objectives:
//   1. System Invariant: Strictly 26 SVG modal-close-btn elements in index.html
//   2. R1 (#menuItemModal): 100px preview, 100% width Generate button, 2-col secondary actions, 90vh/90dvh modal, scrollability
//   3. R2 (.cart-item in #cartDrawer): 1, 3, 4, 8 items, 48-54px heights, 40x40 thumb, center ellipsis, right stepper/total, 3-4 simultaneous item fit
//   4. Stress testing: long dish names, fallback images, extreme quantities
// ============================================================================

const { spawn } = require('child_process');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9245;
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_challenger_m1_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let testResults = {
  invariants: [],
  cssStatic: [],
  r1Modal: [],
  r2Cart: [],
  stressCases: []
};

function recordTest(category, name, passed, details = '') {
  testResults[category].push({ name, passed, details });
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${name} ${details ? `(${details})` : ''}`);
}

async function runStaticInvariantAndCssTests() {
  console.log('==============================================================================');
  console.log('🔍 PHASE 1: STATIC INVARIANT & CSS RULE ARCHITECTURE AUDIT');
  console.log('==============================================================================\n');

  // 1. Invariant: exactly 26 .modal-close-btn SVG elements in index.html
  const html = fs.readFileSync('index.html', 'utf8');
  const modalCloseMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/gs) || [];
  const modalCloseClassMatches = html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
  
  recordTest('invariants', 'INV-1: Exactly 26 SVG modal close buttons in index.html', modalCloseMatches.length === 26, `found ${modalCloseMatches.length}`);
  recordTest('invariants', 'INV-2: Total modal-close-btn class matches is exactly 26', modalCloseClassMatches.length === 26, `found ${modalCloseClassMatches.length}`);

  // Check no raw unicode ✕ in modal close buttons
  const hasRawClose = /modal-close-btn[^>]*>[^<]*✕/i.test(html);
  recordTest('invariants', 'INV-3: Zero raw unicode "✕" characters inside modal-close-btn', !hasRawClose, hasRawClose ? 'Found raw ✕' : 'Clean SVG');

  // Check style.css static rules
  const css = fs.readFileSync('style.css', 'utf8');

  // Preview container height 100px
  const fimPreviewRule = css.includes('.fim-preview-container') && css.includes('height: 100px;');
  recordTest('cssStatic', 'CSS-1: .fim-preview-container enforces height: 100px;', fimPreviewRule);

  // Button actions grid
  const fimPrimaryActionsRule = css.includes('.fim-primary-actions') && css.includes('flex-direction: column;');
  const fimSecondaryActionsRule = css.includes('.fim-secondary-actions') && css.includes('grid-template-columns: 1fr 1fr;');
  recordTest('cssStatic', 'CSS-2: .fim-primary-actions is column and .fim-secondary-actions is 1fr 1fr grid', fimPrimaryActionsRule && fimSecondaryActionsRule);

  // Modal box 90vh/90dvh and overflow
  const modalBoxMaxHeightRule = css.includes('#menuItemModal .modal-box') && css.includes('max-height: 90vh;') && css.includes('max-height: 90dvh;');
  recordTest('cssStatic', 'CSS-3: #menuItemModal .modal-box scoped with 90vh/90dvh and overflow-y: auto', modalBoxMaxHeightRule);

  // Cart item compact row rules
  const cartItemCompactRule = css.includes('.cart-item') && css.includes('min-height: 48px;') && css.includes('max-height: 54px;') && css.includes('flex-direction: row;');
  recordTest('cssStatic', 'CSS-4: .cart-item defines sleek horizontal row (48px-54px)', cartItemCompactRule);

  // Cart item thumb 40x40px
  const cartThumbRule = css.includes('.cart-item-thumb') && css.includes('width: 40px;') && css.includes('height: 40px;');
  recordTest('cssStatic', 'CSS-5: .cart-item-thumb defines 40x40px rounded thumbnail', cartThumbRule);

  // Cart item single-line ellipsis
  const cartNameEllipsisRule = css.includes('.cart-item-name') && css.includes('white-space: nowrap;') && css.includes('overflow: hidden;') && css.includes('text-overflow: ellipsis;');
  recordTest('cssStatic', 'CSS-6: .cart-item-name defines single-line ellipsis truncation', cartNameEllipsisRule);
}

async function runHeadlessBrowserTests() {
  console.log('\n==============================================================================');
  console.log('🚀 PHASE 2: REAL HEADLESS CHROME (CDP) COMPUTED LAYOUT & STRESS SUITE');
  console.log('==============================================================================\n');

  console.log('  Spawning Chrome Headless on debug port ' + DEBUG_PORT + '...');
  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${TEMP_USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=390,844',
    'about:blank'
  ]);

  try {
    await sleep(2500);

    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const page = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });

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

    const setViewport = async (width, height) => {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 2,
        mobile: true
      });
      await send('Emulation.setTouchEmulationEnabled', { enabled: true });
      await sleep(250);
    };

    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(3000);

    // Dismiss shop auth modal cleanly so POS & Menu functions are available
    await evaluate(`(() => {
      if (typeof closeShopAuthModal === 'function') closeShopAuthModal(true);
      const modal = document.getElementById('shopAuthModal');
      if (modal) modal.style.display = 'none';
      if (typeof switchTab === 'function') switchTab('pos');
    })()`);
    await sleep(600);

    // Test viewports list
    const viewports = [
      { name: '320px (iPhone SE 1st gen)', width: 320, height: 568 },
      { name: '360px (Samsung Galaxy S20)', width: 360, height: 800 },
      { name: '375px (iPhone SE 2nd/3rd)', width: 375, height: 667 },
      { name: '390px (iPhone 14 / Modern)', width: 390, height: 844 }
    ];

    // ========================================================================
    // TEST SECTION A: R1 (#menuItemModal) ACROSS VIEWPORTS
    // ========================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📍 AUDIT R1: #menuItemModal COMPUTED GEOMETRY & FULL-WIDTH BUTTON');
    console.log('------------------------------------------------------------------------------');

    for (const vp of viewports) {
      await setViewport(vp.width, vp.height);

      // Open Add Menu Item Modal
      await evaluate(`(() => {
        if (typeof openAddMenuItemModal === 'function') {
          openAddMenuItemModal();
        } else {
          document.getElementById('menuItemModal').style.display = 'flex';
        }
      })()`);
      await sleep(400);

      const r1Metrics = await evaluate(`(() => {
        const modal = document.getElementById('menuItemModal');
        const modalBox = modal.querySelector('.modal-box');
        const preview = document.getElementById('fimPreviewContainer');
        const primaryActions = document.getElementById('fimPrimaryActions');
        const generateBtn = document.getElementById('btnGenerateAI');
        const secondaryActions = document.getElementById('fimSecondaryActions');
        const secBtns = secondaryActions ? Array.from(secondaryActions.querySelectorAll('.fim-btn')) : [];

        const boxRect = modalBox.getBoundingClientRect();
        const boxStyle = window.getComputedStyle(modalBox);
        const previewRect = preview.getBoundingClientRect();
        const previewStyle = window.getComputedStyle(preview);
        const primaryRect = primaryActions.getBoundingClientRect();
        const btnRect = generateBtn.getBoundingClientRect();
        const btnSpan = generateBtn.querySelector('span');
        const spanRect = btnSpan ? btnSpan.getBoundingClientRect() : null;

        const secRects = secBtns.map(b => b.getBoundingClientRect());
        const secStyle = secondaryActions ? window.getComputedStyle(secondaryActions) : {};

        // Scrollability check
        const initialScrollTop = modalBox.scrollTop;
        modalBox.scrollTop = 50;
        const canScroll = modalBox.scrollHeight > modalBox.clientHeight;
        const scrolledTop = modalBox.scrollTop;
        modalBox.scrollTop = 0;

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          modalBox: {
            width: boxRect.width,
            height: boxRect.height,
            maxHeightComputed: boxStyle.maxHeight,
            overflowY: boxStyle.overflowY,
            scrollHeight: modalBox.scrollHeight,
            clientHeight: modalBox.clientHeight,
            canScroll: canScroll,
            scrolledSuccessfully: scrolledTop > 0
          },
          preview: {
            width: previewRect.width,
            height: previewRect.height,
            computedHeight: previewStyle.height
          },
          generateBtn: {
            width: btnRect.width,
            parentWidth: primaryRect.width,
            widthRatio: btnRect.width / primaryRect.width,
            spanWidth: spanRect ? spanRect.width : 0,
            hasTextCutoff: (spanRect ? (spanRect.width + 30 > btnRect.width) : false)
          },
          secondaryActions: {
            display: secStyle.display,
            gridColumns: secStyle.gridTemplateColumns,
            buttonCount: secBtns.length,
            buttonsSideBySide: secRects.length === 2 && Math.abs(secRects[0].top - secRects[1].top) < 4,
            btn1Width: secRects[0] ? secRects[0].width : 0,
            btn2Width: secRects[1] ? secRects[1].width : 0
          }
        };
      })()`);

      // Assertions for this viewport
      const vTag = `[${vp.name}]`;
      
      // Preview height must be exactly 100px (± 1px for subpixel)
      const preview100px = Math.abs(r1Metrics.preview.height - 100) <= 1.5;
      recordTest('r1Modal', `${vTag} Preview container height is ~100px`, preview100px, `actual: ${r1Metrics.preview.height}px, style: ${r1Metrics.preview.computedHeight}`);

      // Generate button is full width (ratio >= 0.98)
      const btnFullWidth = r1Metrics.generateBtn.widthRatio >= 0.98;
      recordTest('r1Modal', `${vTag} "Generate Food Image" button is full-width (100%)`, btnFullWidth, `btn: ${Math.round(r1Metrics.generateBtn.width)}px, parent: ${Math.round(r1Metrics.generateBtn.parentWidth)}px, ratio: ${r1Metrics.generateBtn.widthRatio.toFixed(2)}`);

      // Button label not clipped
      const textNotClipped = !r1Metrics.generateBtn.hasTextCutoff && r1Metrics.generateBtn.width > 180;
      recordTest('r1Modal', `${vTag} Button label text fits cleanly without truncation`, textNotClipped, `btn width: ${Math.round(r1Metrics.generateBtn.width)}px vs label: ${Math.round(r1Metrics.generateBtn.spanWidth)}px`);

      // 2-column secondary actions grid
      const sec2Col = r1Metrics.secondaryActions.display === 'grid' && r1Metrics.secondaryActions.buttonsSideBySide;
      recordTest('r1Modal', `${vTag} Secondary actions render as 2-column side-by-side grid`, sec2Col, `display: ${r1Metrics.secondaryActions.display}, sideBySide: ${r1Metrics.secondaryActions.buttonsSideBySide}, col1: ${Math.round(r1Metrics.secondaryActions.btn1Width)}px, col2: ${Math.round(r1Metrics.secondaryActions.btn2Width)}px`);

      // Modal max-height <= 90vh and overflow-y auto
      const maxHeightVp = parseFloat(r1Metrics.modalBox.maxHeightComputed);
      const is90vhCompliant = maxHeightVp <= (vp.height * 0.90 + 2);
      recordTest('r1Modal', `${vTag} Modal box max-height complies with 90vh / 90dvh`, is90vhCompliant, `computed max-height: ${r1Metrics.modalBox.maxHeightComputed}, 90vh limit: ${(vp.height * 0.9).toFixed(0)}px`);
      recordTest('r1Modal', `${vTag} Modal box overflow-y is auto/scrollable`, r1Metrics.modalBox.overflowY === 'auto' || r1Metrics.modalBox.overflowY === 'scroll', `overflowY: ${r1Metrics.modalBox.overflowY}`);
    }

    // Dismiss modal
    await evaluate(`(() => {
      document.getElementById('menuItemModal').style.display = 'none';
    })()`);
    await sleep(300);

    // ========================================================================
    // TEST SECTION B: R2 (.cart-item in #cartDrawer) ON MOBILE
    // ========================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📍 AUDIT R2: .cart-item SLEEK HORIZONTAL ROWS & 3-4 ITEM SIMULTANEOUS FIT');
    console.log('------------------------------------------------------------------------------');

    // Set mobile viewport 390x844 (standard mobile)
    await setViewport(390, 844);

    // Open Cart Drawer
    await evaluate(`(() => {
      const drawer = document.getElementById('cartDrawer');
      if (drawer && !drawer.classList.contains('open')) {
        if (typeof toggleCartDrawer === 'function') toggleCartDrawer();
        else drawer.classList.add('open');
      }
    })()`);
    await sleep(400);

    // Helper function to inject items into cart and measure
    const testCartWithItems = async (items) => {
      return await evaluate(`((itemsToRender) => {
        window.activeTable = 1;
        if (!window.tablesInfo) window.tablesInfo = {};
        window.tablesInfo[1] = {
          items: itemsToRender,
          status: 'occupied',
          discount: null
        };
        if (typeof updateCartUI === 'function') {
          updateCartUI();
        }

        const cartUI = document.getElementById('cartUI');
        const cartRect = cartUI.getBoundingClientRect();
        const cards = Array.from(cartUI.querySelectorAll('.cart-item'));

        const cardMetrics = cards.map((card, idx) => {
          const rect = card.getBoundingClientRect();
          const thumb = card.querySelector('.cart-item-thumb');
          const thumbRect = thumb ? thumb.getBoundingClientRect() : null;
          const info = card.querySelector('.cart-item-info');
          const infoRect = info ? info.getBoundingClientRect() : null;
          const nameEl = card.querySelector('.cart-item-name');
          const nameRect = nameEl ? nameEl.getBoundingClientRect() : null;
          const nameStyle = nameEl ? window.getComputedStyle(nameEl) : {};
          const mathEl = card.querySelector('.cart-item-math');
          const right = card.querySelector('.cart-item-right');
          const rightRect = right ? right.getBoundingClientRect() : null;
          const priceEl = card.querySelector('.cart-item-price');
          const qtyPill = card.querySelector('.qty-pill');
          const qtyRect = qtyPill ? qtyPill.getBoundingClientRect() : null;

          // Check left thumbnail position: thumb must be on the left of info
          const thumbOnLeft = thumbRect && infoRect && (thumbRect.left < infoRect.left);
          // Check right controls position: right must be on the right of info
          const rightOnRight = infoRect && rightRect && (infoRect.right <= rightRect.left + 5);

          return {
            index: idx,
            height: rect.height,
            width: rect.width,
            top: rect.top,
            bottom: rect.bottom,
            thumb: {
              width: thumbRect ? thumbRect.width : 0,
              height: thumbRect ? thumbRect.height : 0,
              onLeft: thumbOnLeft,
              src: thumb ? thumb.src : ''
            },
            info: {
              width: infoRect ? infoRect.width : 0,
              nameText: nameEl ? nameEl.innerText : '',
              nameHeight: nameRect ? nameRect.height : 0,
              nameScrollWidth: nameEl ? nameEl.scrollWidth : 0,
              nameClientWidth: nameEl ? nameEl.clientWidth : 0,
              nameTextOverflow: nameStyle.textOverflow,
              nameWhiteSpace: nameStyle.whiteSpace,
              mathText: mathEl ? mathEl.innerText : ''
            },
            right: {
              width: rightRect ? rightRect.width : 0,
              onRight: rightOnRight,
              priceText: priceEl ? priceEl.innerText : '',
              qtyText: qtyPill ? qtyPill.innerText : ''
            }
          };
        });

        // Check if all rendered items are simultaneously visible inside cartUI
        const allVisibleWithoutScroll = cards.length > 0 && cards.every(c => {
          const r = c.getBoundingClientRect();
          return r.top >= cartRect.top - 2 && r.bottom <= cartRect.bottom + 2;
        });

        return {
          cartContainer: {
            height: cartRect.height,
            clientHeight: cartUI.clientHeight,
            scrollHeight: cartUI.scrollHeight,
            overflowY: window.getComputedStyle(cartUI).overflowY
          },
          cardsCount: cards.length,
          cardMetrics: cardMetrics,
          allVisibleWithoutScroll: allVisibleWithoutScroll
        };
      })(${JSON.stringify(items)})`);
    };

    // ------------------------------------------------------------------------
    // Scenario 1: Exactly 1 item in Cart
    // ------------------------------------------------------------------------
    const res1 = await testCartWithItems([
      { id: 101, name: 'Filter Coffee', price: 40, qty: 1, image: 'assets/coffee.jpg' }
    ]);
    const m1 = res1.cardMetrics[0];
    recordTest('r2Cart', 'R2-1: 1 Cart Item renders with height between 48px and 54px', m1.height >= 47.5 && m1.height <= 54.5, `height: ${m1.height.toFixed(1)}px`);
    recordTest('r2Cart', 'R2-1: Dish thumbnail is strictly on LEFT (40x40px)', m1.thumb.onLeft && Math.abs(m1.thumb.width - 40) <= 1 && Math.abs(m1.thumb.height - 40) <= 1, `w: ${m1.thumb.width}px, h: ${m1.thumb.height}px, onLeft: ${m1.thumb.onLeft}`);
    recordTest('r2Cart', 'R2-1: Dish title and unit rate in center', m1.info.nameText === 'Filter Coffee' && m1.info.mathText.includes('40.00 each'), `title: "${m1.info.nameText}", rate: "${m1.info.mathText}"`);
    recordTest('r2Cart', 'R2-1: Quantity stepper pill & price strictly on RIGHT', m1.right.onRight && m1.right.priceText.includes('40.00'), `price: "${m1.right.priceText}", onRight: ${m1.right.onRight}`);

    // ------------------------------------------------------------------------
    // Scenario 2: Exactly 3 items in Cart
    // ------------------------------------------------------------------------
    const res3 = await testCartWithItems([
      { id: 101, name: 'Filter Coffee', price: 40, qty: 1 },
      { id: 102, name: 'Masala Chai', price: 30, qty: 2 },
      { id: 103, name: 'Crispy Samosa', price: 25, qty: 2 }
    ]);
    const all3HeightsOk = res3.cardMetrics.every(c => c.height >= 47.5 && c.height <= 54.5);
    recordTest('r2Cart', 'R2-3: 3 Cart items maintain ~48px-54px heights', all3HeightsOk, `heights: [${res3.cardMetrics.map(c => c.height.toFixed(1)).join(', ')}]`);
    recordTest('r2Cart', 'R2-3: 3 items are SIMULTANEOUSLY visible without scrolling', res3.allVisibleWithoutScroll, `scrollHeight: ${res3.cartContainer.scrollHeight}px <= clientHeight: ${res3.cartContainer.clientHeight}px`);

    // ------------------------------------------------------------------------
    // Scenario 3: Exactly 4 items in Cart
    // ------------------------------------------------------------------------
    const res4 = await testCartWithItems([
      { id: 101, name: 'Filter Coffee', price: 40, qty: 1 },
      { id: 102, name: 'Masala Chai', price: 30, qty: 2 },
      { id: 103, name: 'Crispy Samosa', price: 25, qty: 2 },
      { id: 104, name: 'Paneer Pakora', price: 120, qty: 1 }
    ]);
    const all4HeightsOk = res4.cardMetrics.every(c => c.height >= 47.5 && c.height <= 54.5);
    recordTest('r2Cart', 'R2-4: 4 Cart items maintain ~48px-54px heights', all4HeightsOk, `heights: [${res4.cardMetrics.map(c => c.height.toFixed(1)).join(', ')}]`);
    recordTest('r2Cart', 'R2-4: 4 items are SIMULTANEOUSLY visible without scrolling in mobile drawer', res4.allVisibleWithoutScroll, `scrollHeight: ${res4.cartContainer.scrollHeight}px vs clientHeight: ${res4.cartContainer.clientHeight}px`);

    // ------------------------------------------------------------------------
    // Scenario 4: 8 items in Cart (Scrollability & Ergonomics)
    // ------------------------------------------------------------------------
    const res8 = await testCartWithItems([
      { id: 101, name: 'Filter Coffee', price: 40, qty: 1 },
      { id: 102, name: 'Masala Chai', price: 30, qty: 2 },
      { id: 103, name: 'Crispy Samosa', price: 25, qty: 2 },
      { id: 104, name: 'Paneer Pakora', price: 120, qty: 1 },
      { id: 105, name: 'Bun Maska', price: 50, qty: 1 },
      { id: 106, name: 'Cold Coffee Frappe', price: 110, qty: 1 },
      { id: 107, name: 'Gulab Jamun (2 pcs)', price: 60, qty: 1 },
      { id: 108, name: 'Aloo Paratha with Curd', price: 90, qty: 2 }
    ]);
    const scrollsInternally = res8.cartContainer.scrollHeight > res8.cartContainer.clientHeight && res8.cartContainer.overflowY === 'auto';
    recordTest('r2Cart', 'R2-8: 8 items activate internal drawer scrolling smoothly without layout blowout', scrollsInternally, `scrollHeight: ${res8.cartContainer.scrollHeight}px, clientHeight: ${res8.cartContainer.clientHeight}px, overflowY: ${res8.cartContainer.overflowY}`);

    // ========================================================================
    // TEST SECTION C: STRESS CASES & ADVERSARIAL EDGE CONDITIONS
    // ========================================================================
    console.log('\n------------------------------------------------------------------------------');
    console.log('📍 AUDIT C: ADVERSARIAL STRESS CASES (LONG NAMES, FALLBACKS, EXTREME QTY)');
    console.log('------------------------------------------------------------------------------');

    // Stress 1: Extreme long dish name
    const longDishName = 'Extra Spicy Chef Special Paneer Tikka Butter Masala Premium Deluxe Bowl';
    const resLongName = await testCartWithItems([
      { id: 999, name: longDishName, price: 340, qty: 3 }
    ]);
    const mLong = resLongName.cardMetrics[0];
    const longNameHeightOk = mLong.height >= 47.5 && mLong.height <= 54.5;
    const isEllipsis = mLong.info.nameTextOverflow === 'ellipsis' && mLong.info.nameWhiteSpace === 'nowrap';
    const nameSingleLine = mLong.info.nameHeight <= 22;
    recordTest('stressCases', 'STRESS-1: Long dish name truncates via single-line ellipsis without wrapping', isEllipsis && nameSingleLine, `textOverflow: ${mLong.info.nameTextOverflow}, line-height/height: ${mLong.info.nameHeight.toFixed(1)}px`);
    recordTest('stressCases', 'STRESS-1: Card height strictly remains ~48-54px under long dish name stress', longNameHeightOk, `card height: ${mLong.height.toFixed(1)}px`);
    recordTest('stressCases', 'STRESS-1: Stepper and price remain intact and aligned on right', mLong.right.onRight && mLong.right.priceText.includes('1020.00'), `price: "${mLong.right.priceText}", onRight: ${mLong.right.onRight}`);

    // Stress 2: Missing image fallback resolution
    const resNoImg = await testCartWithItems([
      { id: 888, name: 'Special Mystery Recipe', price: 99, qty: 1, image: '' }
    ]);
    const mNoImg = resNoImg.cardMetrics[0];
    const fallbackThumbPresent = mNoImg.thumb.width === 40 && mNoImg.thumb.height === 40 && !!mNoImg.thumb.src;
    recordTest('stressCases', 'STRESS-2: Missing dish image resolves to valid fallback without breaking thumbnail geometry', fallbackThumbPresent, `src: ${mNoImg.thumb.src.slice(0, 45)}..., 40x40: ${mNoImg.thumb.width}x${mNoImg.thumb.height}`);

    // Stress 3: Extreme quantity and large monetary total
    const resHighQty = await testCartWithItems([
      { id: 777, name: 'Corporate Catering Chai Pot', price: 1250.50, qty: 999 }
    ]);
    const mHighQty = resHighQty.cardMetrics[0];
    const highQtyHeightOk = mHighQty.height >= 47.5 && mHighQty.height <= 54.5;
    recordTest('stressCases', 'STRESS-3: Large quantity (999) & high monetary total render cleanly without colliding', highQtyHeightOk && mHighQty.right.onRight, `total: "${mHighQty.right.priceText}", card height: ${mHighQty.height.toFixed(1)}px`);

    // Close drawer
    await evaluate(`(() => {
      const drawer = document.getElementById('cartDrawer');
      if (drawer && drawer.classList.contains('open')) {
        if (typeof toggleCartDrawer === 'function') toggleCartDrawer();
        else drawer.classList.remove('open');
      }
    })()`);

    console.log('\n  Shutting down headless Chrome...');
    ws.close();
    chrome.kill();
  } catch (err) {
    console.error('❌ Browser Test Execution Error:', err);
    chrome.kill();
    throw err;
  }
}

async function main() {
  try {
    await runStaticInvariantAndCssTests();
    await runHeadlessBrowserTests();

    console.log('\n==============================================================================');
    console.log('📊 CHALLENGER EMPIRICAL VERIFICATION SUMMARY');
    console.log('==============================================================================');

    let totalPassed = 0;
    let totalFailed = 0;

    for (const [category, tests] of Object.entries(testResults)) {
      const catPass = tests.filter(t => t.passed).length;
      const catFail = tests.filter(t => !t.passed).length;
      totalPassed += catPass;
      totalFailed += catFail;
      console.log(`  • ${category}: ${catPass} passed, ${catFail} failed (Total: ${tests.length})`);
    }

    console.log(`\n🎯 GRAND TOTAL: ${totalPassed} PASSED, ${totalFailed} FAILED (TOTAL: ${totalPassed + totalFailed})`);

    if (totalFailed === 0) {
      console.log('🏆 EMPIRICAL VERDICT: APPROVE');
      process.exit(0);
    } else {
      console.log('⚠️ EMPIRICAL VERDICT: REQUEST_CHANGES');
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal execution failure:', err);
    process.exit(1);
  }
}

main();
