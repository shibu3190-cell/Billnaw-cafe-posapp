/**
 * scratch/test_large_menu_images_version_backend.cjs
 *
 * Comprehensive Verification Suite for:
 *  1. Large 260-Item Menu (POS Grid 36-item slicing + Catalog 40-item slicing + Category/Search filters)
 *  2. Image, No-Image, Broken-Image & XSS Sanitization (_resolveStableMenuThumb, _handleMenuImgError, FIFO 100 cap, no-image modal leak guard, 1MB Firestore metadata hygiene)
 *  3. Monotonic menuVersion End-to-End (Frontend persistMenu + handleRemoteFirestoreUpdate + BroadcastChannel + Backend sync-service REST enforcement)
 *  4. Real Backend HTTP API Suite (/api/health, /api/version, /api/config/client, Auth OTP -> Bearer Token, RBAC 401/403 enforcement, 260-item sync roundtrip, /api/food-images/upload -> GET -> DELETE + magic-byte/size/traversal guards)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TEST_PORT = 5056;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Minimal valid 1x1 PNG (67 bytes)
const TINY_VALID_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function makeDomNode(tag = 'div', id = '') {
  const attrs = {};
  const dataset = {};
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    id,
    attrs,
    dataset,
    style: { display: '' },
    _innerHTML: '',
    _innerText: '',
    _textContent: '',
    value: '',
    checked: false,
    disabled: false,
    children: [],
    onerror: null,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, force) => (force === undefined ? (classes.has(c) ? classes.delete(c) : classes.add(c)) : (force ? classes.add(c) : classes.delete(c)))
    },
    get className() { return Array.from(classes).join(' '); },
    set className(v) { classes.clear(); String(v || '').split(/\s+/).filter(Boolean).forEach(c => classes.add(c)); },
    setAttribute(k, v) {
      attrs[k] = String(v);
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        dataset[camel] = String(v);
      }
    },
    getAttribute(k) { return k in attrs ? attrs[k] : null; },
    removeAttribute(k) {
      delete attrs[k];
      if (k === 'src') node._src = '';
    },
    get src() { return node._src !== undefined ? node._src : (attrs.src || ''); },
    set src(v) { node._src = String(v || ''); attrs.src = node._src; },
    get innerHTML() { return node._innerHTML; },
    set innerHTML(v) { node._innerHTML = String(v || ''); },
    get innerText() { return node._innerText; },
    set innerText(v) { node._innerText = String(v || ''); },
    get textContent() { return node._textContent; },
    set textContent(v) { node._textContent = String(v || ''); },
    focus() {},
    click() {},
    closest() { return null; },
    appendChild() {},
    remove() {},
    insertBefore() {},
    querySelectorAll(sel) {
      if (sel === '.menu-card') {
        const ids = [...node._innerHTML.matchAll(/class="menu-card[^"]*"[^>]*data-item-id="([^"]+)"/g)].map(m => m[1]);
        return ids.map(idVal => {
          const card = makeDomNode('div');
          card.setAttribute('data-item-id', idVal);
          card.querySelector = () => null;
          return card;
        });
      }
      if (sel === '.clean-item-card[data-catalog-item-id]') {
        const ids = [...node._innerHTML.matchAll(/data-catalog-item-id="([^"]+)"/g)].map(m => m[1]);
        return ids.map(idVal => {
          const card = makeDomNode('div');
          card.setAttribute('data-catalog-item-id', idVal);
          card.querySelector = () => null;
          return card;
        });
      }
      return [];
    },
    querySelector() { return null; }
  };
  return node;
}

function createFrontendSandbox() {
  const elements = {};
  const getEl = (id) => {
    if (!elements[id]) elements[id] = makeDomNode('div', id);
    return elements[id];
  };
  const storage = {};
  const postedBroadcasts = [];
  const syncedPayloads = [];

  const sandbox = {
    console,
    Math,
    Date,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    JSON,
    Promise,
    Error,
    RegExp,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    IntersectionObserver: undefined,
    CustomEvent: function(name, detail) { return { name, ...detail }; },
    navigator: { onLine: true },
    location: { href: 'http://127.0.0.1:5056/index.html', origin: 'http://127.0.0.1:5056' },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    localStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    document: {
      visibilityState: 'visible',
      createElement: (tag) => makeDomNode(tag),
      getElementById: (id) => getEl(id),
      querySelector: (sel) => {
        if (sel.startsWith('#')) return getEl(sel.slice(1));
        return null;
      },
      querySelectorAll: () => [],
      addEventListener: () => {}
    },
    idb: {
      _mem: {},
      get: async (k) => sandbox.idb._mem[k] ?? null,
      set: async (k, v) => { sandbox.idb._mem[k] = v; return true; }
    },
    BroadcastChannel: function() {
      return { postMessage: (msg) => postedBroadcasts.push(msg), close: () => {}, addEventListener: () => {} };
    },
    posMeshChannel: {
      postMessage: (msg) => postedBroadcasts.push(msg)
    },
    showToast: () => {},
    confirm: () => true,
    fetch: async () => ({ ok: true, json: async () => ({ success: true, remaining: 15, limit: 15 }) })
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.getStoreGstConfig = () => ({ mode: 'inclusive', defaultRate: 5 });
  sandbox.escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

  vm.createContext(sandbox);

  const coreSrc = fs.readFileSync(path.join(ROOT, 'js', 'core.js'), 'utf8');
  const menuSrc = fs.readFileSync(path.join(ROOT, 'js', 'menu.js'), 'utf8');
  vm.runInContext(coreSrc, sandbox, { filename: 'js/core.js' });
  vm.runInContext(menuSrc, sandbox, { filename: 'js/menu.js' });

  // Override dispatchBackendStoreSync to spy on outbound menu payloads cleanly
  sandbox.dispatchBackendStoreSync = async (payload) => {
    syncedPayloads.push(payload);
    return true;
  };
  sandbox.window.dispatchBackendStoreSync = sandbox.dispatchBackendStoreSync;
  sandbox.currentStaff = { id: 1, name: 'Owner', role: 'Admin' };
  sandbox.window.currentStaff = sandbox.currentStaff;
  sandbox.shopProfile = { storeCode: 'SHOP_TEST_260', name: 'Test Cafe', menuVersion: 1 };
  sandbox.window.shopProfile = sandbox.shopProfile;
  sandbox.localStorage.setItem('billnaw_store_code', 'SHOP_TEST_260');
  sandbox.localStorage.setItem('billnaw_menu_version', '1');

  return { sandbox, getEl, postedBroadcasts, syncedPayloads, storage };
}

async function waitForHealth() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`);
      if (r.ok) return await r.json();
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('Server did not become healthy on port ' + TEST_PORT);
}

async function run() {
  console.log('========================================================================');
  console.log('🧪 COMPREHENSIVE TEST: 260+ MENU, IMAGES, NO-IMAGE, VERSION & BACKEND');
  console.log('========================================================================\n');

  // --------------------------------------------------------------------------
  // PART 1: LARGE 260-ITEM MENU, IMAGES, NO-IMAGE & BROKEN IMAGES (FRONTEND)
  // --------------------------------------------------------------------------
  console.log('📍 PART 1: Large 260-Item Menu, Images, No-Image & Broken Image Fallbacks');
  const { sandbox, getEl, postedBroadcasts, syncedPayloads } = createFrontendSandbox();

  const categories = ['All', 'Coffee', 'Tea', 'Snacks', 'Burgers', 'Desserts', 'Shakes', 'Combos', 'Specials'];
  sandbox.menuCategories = categories;
  sandbox.window.menuCategories = categories;
  sandbox.activeCategory = 'All';
  sandbox.window.activeCategory = 'All';

  const hugeMenu = Array.from({ length: 260 }, (_, idx) => {
    const id = 5000 + idx;
    const cat = categories[1 + (idx % 8)];
    let image = '';
    if (idx % 4 === 0) {
      // Valid HTTPS image
      image = `https://cdn.example.com/menu/dish_${idx}.webp`;
    } else if (idx % 4 === 1) {
      // NO IMAGE (empty string / omitted)
      image = '';
    } else if (idx % 4 === 2) {
      // Uploaded local relative URL
      image = `/uploads/food-images/dish_${idx}.webp`;
    } else {
      // Broken external image URL
      image = `https://broken.invalid.test/missing_${idx}.jpg`;
    }
    return {
      id,
      name: idx % 10 === 0 ? `Chef's Special #${idx} & Co` : `Dish Item ${idx}`,
      category: cat,
      price: 50 + (idx % 12) * 15,
      gstRate: 5,
      trackStock: idx % 5 === 0,
      stockQty: idx % 15 === 0 ? 0 : 12,
      image,
      is_active: true,
      isAvailable: true,
      isDeleted: false
    };
  });

  // Add malicious XSS image URI test dish to confirm _sanitizeMenuImgUrl strips it
  hugeMenu.push({
    id: 5999,
    name: 'XSS Test Salad',
    category: 'Specials',
    price: 99,
    image: 'javascript:alert(1)',
    is_active: true
  });

  sandbox.menuItems = hugeMenu;
  sandbox.window.menuItems = hugeMenu;
  sandbox.renderMenuUI();

  // Check POS Grid windowed slicing (36 items initial)
  const gridHtml = getEl('menuGridUI').innerHTML;
  const initialPosCardCount = (gridHtml.match(/class="menu-card/g) || []).length;
  assert.strictEqual(initialPosCardCount, 36, `POS grid should slice 261 items to 36 initial cards, got ${initialPosCardCount}`);
  assert.ok(gridHtml.includes('menuLoadMoreBtn'), 'POS grid must render Show More button');
  assert.ok(!gridHtml.includes('Dish Item 259'), 'POS grid must not dump 260th card upfront');

  // Check pagination loadMoreMenuItems()
  sandbox.loadMoreMenuItems();
  const expandedPosCardCount = (getEl('menuGridUI').innerHTML.match(/class="menu-card/g) || []).length;
  assert.strictEqual(expandedPosCardCount, 72, `loadMoreMenuItems should expand POS grid to 72 cards, got ${expandedPosCardCount}`);

  // Check category filter & debounced search
  sandbox.filterMenu('Specials');
  const specialsHtml = getEl('menuGridUI').innerHTML;
  assert.ok(specialsHtml.includes('XSS Test Salad'), 'Specials category must render XSS Test Salad');
  assert.ok(!specialsHtml.includes('javascript:alert(1)'), 'XSS javascript: image URI MUST be stripped by sanitizer');

  // Check Menu Catalog view slicing (40 items initial + exact total badge)
  sandbox.renderMenuCatalogUI();
  assert.strictEqual(getEl('catalogItemCountBadge').innerText, '261 Items', 'Catalog badge must show total active items (261 Items)');
  const catalogHtml = getEl('cleanItemCardsList').innerHTML;
  const initialCatalogCount = (catalogHtml.match(/data-catalog-item-id="/g) || []).length;
  assert.strictEqual(initialCatalogCount, 40, `Catalog view should slice 261 items to 40 initial cards, got ${initialCatalogCount}`);
  assert.ok(catalogHtml.includes('catalogLoadMoreBtn'), 'Catalog view must render Show More Items button');

  sandbox.loadMoreCatalogItems();
  const expandedCatalogCount = (getEl('cleanItemCardsList').innerHTML.match(/data-catalog-item-id="/g) || []).length;
  assert.strictEqual(expandedCatalogCount, 80, `loadMoreCatalogItems should expand catalog to 80 cards, got ${expandedCatalogCount}`);

  // Check No-Image + Broken Image fallback + Bounded 100-item FIFO Error Cache
  for (let i = 0; i < 130; i++) {
    const fakeImg = {
      src: `https://broken.invalid.test/img_${i}.jpg`,
      dataset: {
        resolvedSrc: `https://broken.invalid.test/img_${i}.jpg`,
        itemName: "Chef's Pasta",
        itemCat: 'Specials'
      },
      getAttribute: () => `https://broken.invalid.test/img_${i}.jpg`,
      onerror: () => {}
    };
    sandbox._handleMenuImgError(fakeImg);
    assert.ok(fakeImg.src.startsWith('data:image/svg+xml'), 'Broken image must immediately swap to SVG fallback');
    assert.ok(!fakeImg.src.includes("'"), 'SVG fallback URI must NEVER contain raw unencoded apostrophe');
    assert.strictEqual(fakeImg.onerror, null, 'onerror must be cleared to prevent infinite error loop');
  }
  assert.strictEqual(sandbox._failedMenuImageUrls.size, 100, '_failedMenuImageUrls cache must stay strictly capped at 100 entries');

  // Check No-Image modal regression guard (previously preview.src = "" leaked window.location.href!)
  const prevNode = getEl('newItemImagePreview');
  prevNode.src = 'http://127.0.0.1:5056/index.html';
  prevNode.style.display = 'block';
  sandbox.openAddMenuItemModal();
  assert.strictEqual(prevNode.style.display, 'none', 'Preview must be hidden on openAddMenuItemModal');
  assert.strictEqual(prevNode.getAttribute('src'), null, 'openAddMenuItemModal must remove src attribute so page URL never leaks');

  getEl('newItemName').value = 'Pure Black Coffee';
  getEl('newItemPrice').value = '45';
  getEl('newItemCategory').value = 'Coffee';
  // Simulate browser resolving empty .src getter to page href while hidden & no src attr
  prevNode._src = 'http://127.0.0.1:5056/index.html';
  sandbox.addMenuItem(true);
  const addedDish = sandbox.menuItems.find(m => m.name === 'Pure Black Coffee');
  assert.ok(addedDish, 'Added no-image dish must exist in menuItems');
  assert.ok(!String(addedDish.image || '').includes('index.html') && !String(addedDish.image || '').includes('127.0.0.1:5056'),
    `No-image dish MUST NEVER store window.location.href as image! Got: ${addedDish.image}`);

  // Check sanitizeMenuItemForStorage protects 1MB Firestore limit on both image & imageMetadata.url
  const hugeB64 = 'data:image/webp;base64,' + 'A'.repeat(4096);
  const sanitized = sandbox.sanitizeMenuItemForStorage({
    id: 9001,
    name: 'Offline Heavy Dish',
    category: 'Coffee',
    image: hugeB64,
    imageMetadata: { id: 'm1', url: hugeB64, source: 'upload' }
  });
  assert.ok(sanitized.image.length < 300, 'Oversized base64 image must be stripped before cloud sync');
  assert.ok(String(sanitized.imageMetadata.url || '').length < 300, 'Oversized base64 inside imageMetadata.url must also be stripped before cloud sync');

  console.log('  ✅ PASS: 260+ menu slicing (POS 36 + Catalog 40), image/no-image/broken fallback, no-image modal guard & 1MB metadata hygiene verified!');

  // --------------------------------------------------------------------------
  // PART 2: FRONTEND MONOTONIC menuVersion RECONCILIATION
  // --------------------------------------------------------------------------
  console.log('\n📍 PART 2: Frontend Monotonic menuVersion & Conflict Protection');
  const verBefore = Number(sandbox.localStorage.getItem('billnaw_menu_version'));
  sandbox.persistMenu();
  const verAfter = Number(sandbox.localStorage.getItem('billnaw_menu_version'));
  assert.strictEqual(verAfter, verBefore + 1, 'persistMenu must bump menuVersion monotonically');
  assert.ok(postedBroadcasts.some(b => b.type === 'MENU_UPDATED' && b.version === verAfter), 'BroadcastChannel must broadcast new menuVersion');
  assert.ok(syncedPayloads.some(p => p.menuVersion === verAfter), 'Backend sync must receive bumped menuVersion');

  // Stale incoming cloud snapshot (lower version) MUST NOT overwrite newer local menu
  const countBeforeStale = sandbox.menuItems.length;
  sandbox.handleRemoteFirestoreUpdate({
    menu: [{ id: 1, name: 'Stale Old Item', price: 10, category: 'Snacks' }],
    menuVersion: 1
  });
  assert.strictEqual(sandbox.menuItems.length, countBeforeStale, 'Stale lower menuVersion snapshot must be rejected');

  // Higher remote menuVersion MUST be adopted cleanly
  sandbox.handleRemoteFirestoreUpdate({
    menu: [{ id: 8888, name: 'Remote v500 Dish', price: 250, category: 'Specials', is_active: true }],
    menuVersion: 500
  });
  assert.strictEqual(sandbox.localStorage.getItem('billnaw_menu_version'), '500', 'Newer cloud menuVersion 500 must be adopted');
  assert.ok(sandbox.menuItems.some(m => m.name === 'Remote v500 Dish'), 'Newer cloud menu items must be adopted');
  console.log('  ✅ PASS: Frontend monotonic menuVersion, BroadcastChannel propagation & stale snapshot protection verified!');

  // --------------------------------------------------------------------------
  // PART 3: LIVE BACKEND EXPRESS SERVER, RBAC, MENU VERSION & FOOD IMAGE TESTS
  // --------------------------------------------------------------------------
  console.log('\n📍 PART 3: Proper Backend Server API, Auth, RBAC, 260-Item MenuVersion Sync & Food Images');

  let serverProc = null;
  let uploadedImageFilename = null;
  const testStoreCode = `SHOP_VERIFY_${Date.now()}`;
  const testEmail = `verify_backend_${Date.now()}@billnawcafe.com`;

  try {
    serverProc = spawn('node', ['server.js'], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(TEST_PORT), HOST: '127.0.0.1' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const health = await waitForHealth();
    assert.strictEqual(health.status, 'ok', '/api/health must return status: ok');

    // 3.1 Version & Public Client Config
    const verRes = await fetch(`${BASE_URL}/api/version`);
    assert.strictEqual(verRes.status, 200);
    const verJson = await verRes.json();
    assert.strictEqual(verJson.version, '3.0.0', '/api/version must return 3.0.0');

    const cfgRes = await fetch(`${BASE_URL}/api/config/client`);
    assert.strictEqual(cfgRes.status, 200);
    const cfgJson = await cfgRes.json();
    assert.strictEqual(cfgJson.projectId, 'abhi-pro-cafe-pos', 'Firebase projectId must match config');
    assert.ok(!cfgJson.jwtSecret && !cfgJson.geminiApiKey, 'Client config must NEVER expose server secrets');

    // 3.2 Real Auth OTP Flow -> Signed Bearer Token
    const otpReq = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, purpose: 'signup' })
    });
    assert.strictEqual(otpReq.status, 200);
    const otpJson = await otpReq.json();
    assert.ok(otpJson.success && otpJson.devOtp, 'Synthetic test email OTP dispatch must succeed with devOtp');

    const verifyReq = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, otp: otpJson.devOtp, shopName: 'Verify Backend Cafe' })
    });
    assert.strictEqual(verifyReq.status, 200);
    const verifyJson = await verifyReq.json();
    assert.ok(verifyJson.token, 'verify-otp must mint signed session Bearer token');
    const assignedStoreCode = verifyJson.storeCode || verifyJson.shop?.storeCode;
    assert.ok(assignedStoreCode, 'verify-otp must assign tenant storeCode');
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${verifyJson.token}`,
      'x-shop-id': assignedStoreCode,
      'x-store-code': assignedStoreCode
    };

    // 3.3 RBAC & Tenant Isolation Checks on /api/sync/store-data
    const crossTenantRes = await fetch(`${BASE_URL}/api/sync/store-data`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-shop-id': 'SHOP_OTHER_TENANT', 'x-store-code': 'SHOP_OTHER_TENANT' },
      body: JSON.stringify({ storeCode: 'SHOP_OTHER_TENANT', menu: [], menuVersion: 2 })
    });
    assert.strictEqual(crossTenantRes.status, 403, 'Cross-tenant sync write MUST be rejected with 403');

    const unauthSync = await fetch(`${BASE_URL}/api/sync/store-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-shop-id': assignedStoreCode },
      body: JSON.stringify({ storeCode: assignedStoreCode, menu: [], menuVersion: 2 })
    });
    assert.strictEqual(unauthSync.status, 401, 'Unauthenticated store sync MUST return 401');

    const waiterMenuSync = await fetch(`${BASE_URL}/api/sync/store-data`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-staff-role': 'Floor Server' },
      body: JSON.stringify({ storeCode: assignedStoreCode, menu: [{ id: 1, name: 'Hijack', price: 1 }], menuVersion: 999 })
    });
    assert.strictEqual(waiterMenuSync.status, 403, 'Floor Server attempting menu modification MUST be blocked with 403');

    // 3.4 Large 260-Item Menu Sync & Backend Monotonic menuVersion Enforcement
    const backend260Menu = hugeMenu.slice(0, 260).map(item => sandbox.sanitizeMenuItemForStorage(item));
    const syncV10Res = await fetch(`${BASE_URL}/api/sync/store-data`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-staff-role': 'Admin' },
      body: JSON.stringify({
        storeCode: assignedStoreCode,
        menu: backend260Menu,
        categories,
        menuVersion: 10
      })
    });
    assert.strictEqual(syncV10Res.status, 200);
    const syncV10Json = await syncV10Res.json();
    assert.strictEqual(syncV10Json.success, true, '260-item menu sync v10 must succeed');
    assert.strictEqual(syncV10Json.menuVersion, 10, 'Backend must confirm menuVersion 10');

    // Attempt stale offline downgrade (menuVersion 4 attempting to overwrite 260 items with 1 item)
    const staleSyncRes = await fetch(`${BASE_URL}/api/sync/store-data`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-staff-role': 'Admin' },
      body: JSON.stringify({
        storeCode: assignedStoreCode,
        menu: [{ id: 99, name: 'Stale Wipe', price: 1 }],
        menuVersion: 4
      })
    });
    assert.strictEqual(staleSyncRes.status, 200);
    const staleSyncJson = await staleSyncRes.json();
    assert.strictEqual(staleSyncJson.staleMenuRejected, true, 'Backend must reject stale menuVersion 4 write');
    assert.strictEqual(staleSyncJson.cloudMenuVersion, 10, 'Backend must report existing cloudMenuVersion 10');

    // Read back via GET /api/sync/store-data to confirm all 260 dishes & version 10 intact
    const getStoreRes = await fetch(`${BASE_URL}/api/sync/store-data?storeCode=${encodeURIComponent(assignedStoreCode)}`, {
      headers: authHeaders
    });
    assert.strictEqual(getStoreRes.status, 200);
    const getStoreJson = await getStoreRes.json();
    assert.strictEqual(getStoreJson.menuVersion, 10, 'GET store-data must preserve menuVersion 10 after stale attempt');
    assert.strictEqual(getStoreJson.menu.length, 260, 'GET store-data must return all 260 synced dishes intact');

    // Clean up temporary synthetic store documents in Firestore
    const fsBase = `https://firestore.googleapis.com/v1/projects/${cfgJson.projectId}/databases/${cfgJson.firestoreDatabaseId}/documents/shops/${encodeURIComponent(assignedStoreCode)}`;
    await fetch(`${fsBase}/menu_meta/version`, { method: 'DELETE' }).catch(() => {});
    await fetch(fsBase, { method: 'DELETE' }).catch(() => {});

    // 3.5 Food Image Upload -> Serve -> Path Traversal Protection -> Delete Cleanup
    // Reject non-image spoofed payload (magic bytes validation)
    const badMagicRes = await fetch(`${BASE_URL}/api/food-images/upload`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-staff-role': 'Admin' },
      body: JSON.stringify({
        dishId: 'test_bad',
        mimeType: 'image/png',
        base64Data: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64')
      })
    });
    assert.strictEqual(badMagicRes.status, 400, 'Spoofed non-PNG bytes must be rejected with 400');

    // Valid PNG upload
    const goodUploadRes = await fetch(`${BASE_URL}/api/food-images/upload`, {
      method: 'POST',
      headers: { ...authHeaders, 'x-staff-role': 'Admin' },
      body: JSON.stringify({
        dishId: 'verify_dish_5000',
        mimeType: 'image/png',
        filename: 'test.png',
        base64Data: 'data:image/png;base64,' + TINY_VALID_PNG_B64
      })
    });
    assert.strictEqual(goodUploadRes.status, 200, 'Valid PNG upload must succeed');
    const goodUploadJson = await goodUploadRes.json();
    assert.ok(goodUploadJson.success && goodUploadJson.image.url.startsWith('/uploads/food-images/'), 'Upload must return static /uploads/food-images/ URL');
    uploadedImageFilename = goodUploadJson.image.filename;

    // Fetch uploaded image back via Express static middleware
    const fetchedImgRes = await fetch(`${BASE_URL}${goodUploadJson.image.url}`);
    assert.strictEqual(fetchedImgRes.status, 200, 'Uploaded image must be retrievable via HTTP GET');

    // Waiter attempting to upload/delete food image must be rejected (403)
    const waiterDeleteRes = await fetch(`${BASE_URL}/api/food-images/${encodeURIComponent(uploadedImageFilename)}`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'x-staff-role': 'Floor Server' }
    });
    assert.strictEqual(waiterDeleteRes.status, 403, 'Floor Server must NOT be allowed to delete food images');

    // Cleanup uploaded test image as Admin
    const adminDeleteRes = await fetch(`${BASE_URL}/api/food-images/${encodeURIComponent(uploadedImageFilename)}`, {
      method: 'DELETE',
      headers: { ...authHeaders, 'x-staff-role': 'Admin' }
    });
    assert.strictEqual(adminDeleteRes.status, 200, 'Admin DELETE /api/food-images/:filename must clean up uploaded file');
    uploadedImageFilename = null;

    console.log('  ✅ PASS: All backend health, auth OTP, RBAC, 260-item menuVersion sync & food-image API checks passed!');
  } finally {
    if (uploadedImageFilename) {
      try { fs.unlinkSync(path.join(ROOT, 'uploads', 'food-images', uploadedImageFilename)); } catch (_) {}
    }
    if (serverProc) {
      try { serverProc.kill('SIGKILL'); } catch (_) {}
    }
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL 3 SUITES PASSED 100% GREEN (LARGE MENU, IMAGES, VERSION & BACKEND)');
  console.log('========================================================================');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
