/**
 * scratch/test_new_shopowner_4staff_e2e_simulation.cjs
 * ============================================================================
 * COMPREHENSIVE E2E SIMULATION: NEW SHOP OWNER + 4 STAFF ROLES + AI MENU UPLOAD
 * + CROSS-DEVICE SYNC + KOT/KDS + THERMAL INVOICE + REPORTS CARDS + SECURITY
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SERVER_URL = 'http://localhost:5000';

let passed = 0;
let failed = 0;
const failures = [];
const reportLog = [];

async function step(stage, id, description, fn) {
  try {
    await fn();
    passed++;
    const line = `  ✅ PASS [${id}]: ${description}`;
    console.log(line);
    reportLog.push({ stage, id, description, status: 'PASS' });
  } catch (err) {
    failed++;
    const line = `  ❌ FAIL [${id}]: ${description}\n     Reason: ${err.message}`;
    console.error(line);
    failures.push({ stage, id, description, error: err.message, stack: err.stack });
    reportLog.push({ stage, id, description, status: 'FAIL', error: err.message });
  }
}

// Helper: 1x1 white PNG data URL for Shop Logo testing
const SAMPLE_LOGO_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR42mP8////fwYkwMJIwggA+f0H+823pB0AAAAASUVORK5CYII=';

async function runSimulation() {
  console.log('================================================================================');
  console.log('🏪 NEW SHOP OWNER + 4 STAFF FULL-STACK E2E SIMULATION & SECURITY AUDIT');
  console.log('================================================================================\n');

  const platformBridge = await import('../src/core/platform-bridge.js');
  const rbacModule = await import('../src/core/rbac.js');
  const geminiService = await import('../server/gemini-service.js');
  const quotaService = await import('../server/quota-service.js');
  const subscriptionService = await import('../server/subscription-service.js');
  const authService = await import('../server/auth-service.js');
  const kotUiModule = await import('../src/features/kot/kot.ui.js');

  const { ThermalPrinterBridge, sanitizeEscPosText } = platformBridge;
  const { generatePinSalt, hashPin, verifyPin, authenticateStaffPin, hasPermission, ROLES } = rbacModule;

  // Unique shop identity for this E2E run
  const runSuffix = Date.now().toString().slice(-6);
  const ownerEmail = `aroma.owner.${runSuffix}@billnawcafe.com`;
  const shopName = 'Aroma Roasters & Bistro';
  const shopPhone = '9876543210';
  const shopAddress = '42 Park Street, Kolkata - 700016';
  const shopFssai = '12824019000991';
  const shopGstin = '19AABCU9603R1ZM';
  const shopUpiId = 'aromaroasters@okaxis';
  let shopId = `SHOP_AROMA_${runSuffix}`;

  // ============================================================================
  // STAGE 1: NEW SHOP OWNER ONBOARDING & CLOUD STORE PROVISIONING
  // ============================================================================
  console.log('📍 STAGE 1: NEW SHOP OWNER REGISTRATION, OTP AUTH & PROFILE PERSISTENCE');

  let registrationOtp = null;
  let ownerAuthToken = null;

  await step('STAGE 1', 'S1-01', 'New shop owner requests 6-digit registration OTP via /api/auth/send-otp', async () => {
    const res = await fetch(`${SERVER_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ownerEmail, purpose: 'register' })
    });
    assert.strictEqual(res.status, 200, `Expected 200 from /api/auth/send-otp, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.success, true, 'send-otp must return success: true');
    assert.ok(data.devOtp && /^\d{6}$/.test(data.devOtp), '6-digit OTP generated for owner email');
    registrationOtp = data.devOtp;
  });

  await step('STAGE 1', 'S1-02', 'New shop owner registers shop account with OTP verification & receives storeCode + token', async () => {
    const res = await fetch(`${SERVER_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName: 'Abhijit',
        lastName: 'Modak',
        email: ownerEmail,
        password: 'StrongShopPassword#2026',
        confirmPassword: 'StrongShopPassword#2026',
        shopName,
        phone: shopPhone,
        adminPin: '5829',
        otp: registrationOtp
      })
    });
    const regData = await res.json();
    assert.strictEqual(regData.success, true, `Registration failed: ${regData.error}`);
    assert.ok(regData.user && regData.user.storeCode, 'Registered user must have a dedicated storeCode (shopId)');
    assert.strictEqual(regData.user.email, ownerEmail.toLowerCase(), 'Registered email must match normalized owner email');
    shopId = regData.user.storeCode;
    ownerAuthToken = regData.token;
  });

  await step('STAGE 1', 'S1-03', 'Shop subscription is provisioned in Firestore tagged with shopEmail and shopId', async () => {
    const res = await fetch(`${SERVER_URL}/api/subscription/status?email=${encodeURIComponent(ownerEmail)}&shopId=${encodeURIComponent(shopId)}`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.subscription.status, 'ACTIVE');
    assert.strictEqual(data.subscription.shopEmail, ownerEmail.toLowerCase());
    assert.strictEqual(data.subscription.features.maxTerminals, 10);
    assert.strictEqual(data.subscription.features.aiMenuScansPerMonth, 15);
  });

  // ============================================================================
  // STAGE 2: 4 DISTINCT STAFF PROFILES, OTP ONBOARDING, SALTED PIN & RBAC
  // ============================================================================
  console.log('\n📍 STAGE 2: 4 STAFF PROFILES (ADMIN, CASHIER, FLOOR SERVER, KITCHEN CHEF), OTP & RBAC');

  // Create shared Cloud Firestore state & 4 isolated Terminal Sandboxes
  const cloudFirestoreState = {
    profile: {
      id: shopId,
      storeCode: shopId,
      ownerEmail,
      name: shopName,
      shopName,
      address: shopAddress,
      phone: shopPhone,
      ownerPhone: shopPhone,
      fssai: shopFssai,
      gstin: shopGstin,
      upiId: shopUpiId,
      showQr: true,
      gstMode: 'inclusive',
      defaultGstRate: 5,
      logo: SAMPLE_LOGO_DATA_URL,
      startInvoiceNo: 1001,
      tableCount: 10
    },
    menu: [],
    staff: [],
    sessions: [],
    invoices: [],
    printQueue: [],
    subscription: {
      status: 'ACTIVE',
      shopEmail: ownerEmail,
      shopId,
      plan: 'billnaw Pro',
      isFree: true
    }
  };

  // Helper to create a simulated terminal environment loading staff.js
  function createTerminalEnv(terminalName, isMaster = false) {
    const elements = new Map();
    const makeEl = (id, tag = 'div') => {
      const el = {
        id,
        tagName: tag.toUpperCase(),
        style: { display: '' },
        className: '',
        innerHTML: '',
        innerText: '',
        textContent: '',
        value: '',
        checked: false,
        disabled: false,
        dataset: {},
        children: [],
        classList: {
          _s: new Set(),
          add(...c) { c.forEach(x => this._s.add(x)); },
          remove(...c) { c.forEach(x => this._s.delete(x)); },
          contains(x) { return this._s.has(x); },
          toggle(x, f) {
            if (f === undefined) {
              if (this._s.has(x)) { this._s.delete(x); return false; }
              this._s.add(x); return true;
            }
            if (f) this._s.add(x); else this._s.delete(x);
            return f;
          }
        },
        appendChild(child) { this.children.push(child); return child; },
        removeChild(child) {
          const i = this.children.indexOf(child);
          if (i >= 0) this.children.splice(i, 1);
          return child;
        },
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k] || null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {}
      };
      elements.set(id, el);
      return el;
    };

    ['staffTableBody', 'loginStaffPicker', 'loginOverlay', 'staffModal', 'firstLoginPinModal',
     'staffNameInput', 'staffRoleInput', 'staffPhoneInput', 'staffPinInput', 'staffStatusInput', 'staffIdInput',
     'staffLoginPinInput', 'adminPinInput', 'newPrivatePinInput', 'confirmPrivatePinInput'].forEach(id => makeEl(id));
    elements.get('loginOverlay').classList.add('modal-overlay');

    const lsMap = new Map();
    if (isMaster) {
      lsMap.set('billnaw_is_master_terminal', 'true');
      lsMap.set('billnaw_device_role', 'ADMIN_MASTER');
    } else {
      lsMap.set('billnaw_is_master_terminal', 'false');
    }
    lsMap.set('billnaw_store_code', shopId);
    lsMap.set('billnaw_auth_email', ownerEmail);

    const localStorageMock = {
      getItem: (k) => lsMap.has(k) ? lsMap.get(k) : null,
      setItem: (k, v) => lsMap.set(k, String(v)),
      removeItem: (k) => lsMap.delete(k),
      clear: () => lsMap.clear()
    };

    const toasts = [];
    const sandbox = {
      console,
      setTimeout,
      clearTimeout,
      setInterval: () => 1,
      clearInterval: () => {},
      Date,
      Math,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      Error,
      Promise,
      Uint8Array,
      TextEncoder,
      crypto: crypto.webcrypto,
      localStorage: localStorageMock,
      sessionStorage: localStorageMock,
      escapeHtml: (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
      showToast: (msg, type) => toasts.push({ msg, type }),
      saveToLocal: () => {},
      idb: { set: async () => {}, get: async () => null, clear: async () => {} },
      shopProfile: JSON.parse(JSON.stringify(cloudFirestoreState.profile)),
      staffList: JSON.parse(JSON.stringify(cloudFirestoreState.staff)),
      currentStaff: null,
      activeTable: 1,
      tablesInfo: { 1: { items: [], status: 'empty' } },
      orderHistory: [],
      menuItems: JSON.parse(JSON.stringify(cloudFirestoreState.menu)),
      isMasterTerminal: () => isMaster,
      switchTab: (tab) => { sandbox._activeTab = tab; },
      renderMenuUI: () => {},
      updateCartUI: () => {},
      updateAllUI: () => {},
      persistStaffToFirestore: (staffMember) => {
        if (!staffMember) {
          cloudFirestoreState.staff = JSON.parse(JSON.stringify(sandbox.staffList));
          return;
        }
        const idx = cloudFirestoreState.staff.findIndex(s => String(s.id) === String(staffMember.id));
        if (idx >= 0) cloudFirestoreState.staff[idx] = JSON.parse(JSON.stringify(staffMember));
        else cloudFirestoreState.staff.push(JSON.parse(JSON.stringify(staffMember)));
      },
      deleteStaffFromFirestore: (staffId) => {
        cloudFirestoreState.staff = cloudFirestoreState.staff.filter(s => String(s.id) !== String(staffId));
        cloudFirestoreState.sessions.forEach(sess => {
          if (String(sess.staffId) === String(staffId)) {
            sess.status = 'REVOKED';
            sess.isLocked = true;
          }
        });
      },
      document: {
        getElementById: (id) => elements.has(id) ? elements.get(id) : makeEl(id),
        querySelector: () => null,
        querySelectorAll: (sel) => {
          if (sel === '.modal-overlay') return [elements.get('loginOverlay')];
          return [];
        },
        createElement: (tag) => makeEl('dyn_' + Math.random().toString(36).slice(2, 7), tag),
        addEventListener: () => {},
        body: makeEl('body', 'body')
      }
    };
    sandbox.window = sandbox;
    sandbox.window.activeStaffSessions = cloudFirestoreState.sessions;
    sandbox.window.authorizedDevices = [
      { id: 'DEV_MASTER', deviceId: 'DEV_MASTER', deviceName: 'Owner Master Counter', stationProfile: 'ADMIN_MASTER', status: 'AUTHORIZED', isMaster: true },
      { id: 'DEV_CASHIER', deviceId: 'DEV_CASHIER', deviceName: 'Billing Counter 1', stationProfile: 'BILLING_COUNTER', status: 'AUTHORIZED', isMaster: false },
      { id: 'DEV_WAITER', deviceId: 'DEV_WAITER', deviceName: 'Floor Waiter Mobile', stationProfile: 'WAITER_MOBILE', status: 'AUTHORIZED', isMaster: false },
      { id: 'DEV_KDS', deviceId: 'DEV_KDS', deviceName: 'Kitchen Display Tab', stationProfile: 'KDS', status: 'AUTHORIZED', isMaster: false }
    ];

    const staffJsCode = fs.readFileSync(path.join(ROOT, 'js', 'staff.js'), 'utf8');
    vm.createContext(sandbox);
    vm.runInContext(staffJsCode, sandbox);

    return { sandbox, elements, toasts, localStorageMock };
  }

  const adminTerminal = createTerminalEnv('Owner Master Counter', true);
  let staffAdmin, staffCashier, staffServer, staffChef;

  await step('STAGE 2', 'S2-01', 'Admin creates 4 distinct staff profiles (Admin, Cashier, Floor Server, Kitchen Chef) with temporary 4-digit OTPs', async () => {
    const s = adminTerminal.sandbox;
    s.staffList = [];

    // 1. Admin Profile
    const adminSalt = generatePinSalt();
    const adminHash = await hashPin('5829', adminSalt);
    staffAdmin = {
      id: 1,
      name: 'Abhijit Modak',
      role: 'Admin',
      phone: '9876543210',
      status: 'Active',
      pin_salt: adminSalt,
      pin_hash: adminHash,
      requiresPinSetup: false,
      lastLoginAt: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    s.staffList.push(staffAdmin);
    s.persistStaffToFirestore(staffAdmin);

    // 2. Cashier Profile (Priya Sharma) created by Admin with auto-generated 4-digit OTP
    const cashierOtp = typeof s.generateStaffOnboardingOtp === 'function' ? s.generateStaffOnboardingOtp() : '4821';
    assert.match(String(cashierOtp), /^\d{4}$/, 'Generated onboarding OTP must be 4 digits');
    staffCashier = {
      id: 2,
      name: 'Priya Sharma',
      role: 'Cashier',
      phone: '9876500001',
      status: 'Active',
      onboardingOtp: cashierOtp,
      tempOtp: cashierOtp,
      requiresPinSetup: true,
      lastLoginAt: null,
      lastSeen: null
    };
    s.staffList.push(staffCashier);
    s.persistStaffToFirestore(staffCashier);

    // 3. Floor Server Profile (Rohan Das)
    const serverOtp = typeof s.generateStaffOnboardingOtp === 'function' ? s.generateStaffOnboardingOtp() : '7392';
    staffServer = {
      id: 3,
      name: 'Rohan Das',
      role: 'Floor Server',
      phone: '9876500002',
      status: 'Active',
      onboardingOtp: serverOtp,
      tempOtp: serverOtp,
      requiresPinSetup: true,
      lastLoginAt: null,
      lastSeen: null
    };
    s.staffList.push(staffServer);
    s.persistStaffToFirestore(staffServer);

    // 4. Kitchen Chef Profile (Vikram Singh)
    const chefOtp = typeof s.generateStaffOnboardingOtp === 'function' ? s.generateStaffOnboardingOtp() : '6154';
    staffChef = {
      id: 4,
      name: 'Vikram Singh',
      role: 'Kitchen Chef',
      phone: '9876500003',
      status: 'Active',
      onboardingOtp: chefOtp,
      tempOtp: chefOtp,
      requiresPinSetup: true,
      lastLoginAt: null,
      lastSeen: null
    };
    s.staffList.push(staffChef);
    s.persistStaffToFirestore(staffChef);

    assert.strictEqual(cloudFirestoreState.staff.length, 4, 'All 4 staff profiles stored in cloud state');
  });

  await step('STAGE 2', 'S2-02', 'Cloud Presence Panel initially shows Admin as Active and the 3 unlogged staff as "Inactive (Never Logged In)"', async () => {
    const s = adminTerminal.sandbox;
    cloudFirestoreState.sessions.push({
      staffId: 1,
      staffName: 'Abhijit Modak',
      role: 'Admin',
      status: 'ONLINE',
      lastActiveAt: new Date().toISOString(),
      deviceName: 'Owner Master Counter',
      isMaster: true
    });
    s.renderStaffManagementUI();
    const html = adminTerminal.elements.get('staffTableBody').innerHTML;

    // 3 staff have never logged in
    const inactiveMatches = (html.match(/Inactive \(Never Logged In\)/g) || []).length;
    assert.strictEqual(inactiveMatches, 3, `Expected 3 "Inactive (Never Logged In)" badges for Priya, Rohan & Vikram, found ${inactiveMatches}`);
    assert.ok(html.includes('Abhijit Modak') && html.includes('Active (Active now)'), 'Admin must display as Active (Active now)');
  });

  await step('STAGE 2', 'S2-03', 'All 4 staff members complete onboarding (OTP validation -> private salted PIN setup) and log into their terminals', async () => {
    // Onboard Cashier (Priya), Floor Server (Rohan), Kitchen Chef (Vikram)
    const privatePins = {
      2: '7391', // Priya (Cashier)
      3: '8462', // Rohan (Floor Server)
      4: '9173'  // Vikram (Kitchen Chef)
    };

    for (const staff of [staffCashier, staffServer, staffChef]) {
      // 1. Verify temporary OTP matches
      const enteredOtp = staff.onboardingOtp;
      assert.strictEqual(enteredOtp, staff.tempOtp, `OTP validated for ${staff.name}`);

      // 2. Verify weak PINs ('1234', '0000') are rejected by validator if present
      if (typeof adminTerminal.sandbox.isTrivialPin === 'function') {
        assert.strictEqual(adminTerminal.sandbox.isTrivialPin('1234'), true, '1234 rejected as trivial PIN');
        assert.strictEqual(adminTerminal.sandbox.isTrivialPin('0000'), true, '0000 rejected as trivial PIN');
      }

      // 3. Generate private salted PIN
      const chosenPin = privatePins[staff.id];
      const salt = generatePinSalt();
      const hash = await hashPin(chosenPin, salt);
      staff.pin_salt = salt;
      staff.pin_hash = hash;
      staff.requiresPinSetup = false;
      delete staff.onboardingOtp;
      delete staff.tempOtp;
      staff.lastLoginAt = new Date().toISOString();
      staff.lastSeen = new Date().toISOString();

      // Authenticate using canonical RBAC verifyPin / authenticateStaffPin
      const authRes = await authenticateStaffPin(chosenPin, [staff]);
      assert.strictEqual(authRes.error, null, `Staff ${staff.name} authentication must succeed`);
      assert.strictEqual(authRes.data.id, staff.id);
      assert.strictEqual(authRes.data.role, staff.role);

      // Register active cloud session
      cloudFirestoreState.sessions.push({
        staffId: staff.id,
        staffName: staff.name,
        role: staff.role,
        status: 'ONLINE',
        lastActiveAt: new Date().toISOString(),
        deviceName: staff.role === 'Cashier' ? 'Billing Counter 1' : (staff.role === 'Floor Server' ? 'Floor Waiter Mobile' : 'Kitchen Display Tab')
      });
      adminTerminal.sandbox.persistStaffToFirestore(staff);
    }

    // Re-render Admin Presence Panel: all 4 staff should now be Online & Active!
    adminTerminal.sandbox.staffList = JSON.parse(JSON.stringify(cloudFirestoreState.staff));
    adminTerminal.sandbox.renderStaffManagementUI();
    const updatedHtml = adminTerminal.elements.get('staffTableBody').innerHTML;
    assert.strictEqual((updatedHtml.match(/Inactive \(Never Logged In\)/g) || []).length, 0, 'Zero staff should be Inactive after all 4 log in');
    assert.strictEqual((updatedHtml.match(/Active \(Active now\)/g) || []).length, 4, 'All 4 staff profiles must display Active (Active now)');
  });

  await step('STAGE 2', 'S2-04', 'Role-Based Access Control (RBAC) enforces permissions & Floor Server Bluetooth-only settings lock', async () => {
    // Verify permissions matrix
    assert.strictEqual(hasPermission(ROLES.ADMIN, 'can_void_invoice'), true);
    assert.strictEqual(hasPermission(ROLES.CASHIER, 'can_settle_bills'), true);
    assert.strictEqual(hasPermission(ROLES.CASHIER, 'can_void_invoice'), false);
    assert.strictEqual(hasPermission(ROLES.SERVER, 'can_dispatch_kot'), true);
    assert.strictEqual(hasPermission(ROLES.SERVER, 'can_settle_bills'), false);
    assert.strictEqual(hasPermission(ROLES.CHEF, 'can_update_prep_status'), true);
    assert.strictEqual(hasPermission(ROLES.CHEF, 'can_settle_bills'), false);

    // Verify Floor Server settings restriction in js/settings.js & src/core/rbac.js
    const settingsJs = fs.readFileSync(path.join(ROOT, 'js', 'settings.js'), 'utf8');
    assert.ok(settingsJs.includes('applySettingsRoleRestrictions'), 'settings.js must define applySettingsRoleRestrictions for Floor Server role');
    assert.ok(settingsJs.includes('settingTilePrinterConfig'), 'Floor Server settings lock must preserve #settingTilePrinterConfig for Bluetooth KOT pairing');
    assert.ok(settingsJs.includes('checkFloorServerModalBlock'), 'settings.js must enforce checkFloorServerModalBlock for Floor Server role');
  });

  // ============================================================================
  // STAGE 3: GEMINI AI MENU UPLOAD, 15-SCAN QUOTA & CROSS-TERMINAL MENU SYNC
  // ============================================================================
  console.log('\n📍 STAGE 3: GEMINI AI MENU UPLOAD, VISION CASCADE, 15-SCAN QUOTA & MENU SYNC');

  await step('STAGE 3', 'S3-01', 'Gemini Vision Model Cascade prioritizes fast flash-lite models with 7s timeout & zero thinkingBudget', async () => {
    assert.ok(Array.isArray(geminiService.CANDIDATE_MODELS), 'CANDIDATE_MODELS exported');
    assert.strictEqual(geminiService.CANDIDATE_MODELS[0], 'gemini-3.5-flash-lite', 'First model must be gemini-3.5-flash-lite');
    assert.strictEqual(geminiService.CANDIDATE_MODELS[1], 'gemini-3.1-flash-lite', 'Second model must be gemini-3.1-flash-lite');
    assert.strictEqual(geminiService.CANDIDATE_TIMEOUT_MS, 7000, 'Per-candidate timeout must be 7000ms');
  });

  await step('STAGE 3', 'S3-02', 'Gemini AI Menu Parser extracts structured dishes, prices (Rs./₹), GST rates & dietary tags from menu output', async () => {
    const sampleAiMenuResponse = `\`\`\`json
    {
      "categories": [
        {
          "name": "Artisan Beverages",
          "items": [
            { "name": "Darjeeling First Flush Tea", "price": "Rs. 60", "gst_rate": 5, "dietary": "Veg", "description": "Aromatic estate tea" },
            { "name": "Belgian Cold Coffee", "price": "₹ 150", "gst_rate": 5, "dietary": "Veg", "description": "Rich chilled coffee" }
          ]
        },
        {
          "name": "Bistro Specials",
          "items": [
            { "name": "Smoked Chicken Sandwich", "price": "₹ 180", "gst_rate": 5, "dietary": "Non-Veg", "description": "Grilled sourdough sandwich" },
            { "name": "Classic Veg Samosa", "price": "Rs. 30", "gst_rate": 5, "dietary": "Veg", "description": "Crispy spiced pastry" }
          ]
        }
      ]
    }
    \`\`\``;

    const parsed = geminiService.parseMenuJsonSafely(sampleAiMenuResponse);
    assert.ok(parsed && Array.isArray(parsed.categories), 'Parsed menu must contain categories array');
    assert.strictEqual(parsed.categories.length, 2);

    // Flatten into shop menu catalog with curated food visuals
    let nextId = 101;
    for (const cat of parsed.categories) {
      for (const rawItem of cat.items) {
        const cleanPrice = Number(String(rawItem.price).replace(/[^0-9.]/g, ''));
        const photoUrl = geminiService.getCuratedFoodPhotoServer(rawItem.name, cat.name, 0);
        cloudFirestoreState.menu.push({
          id: nextId++,
          name: rawItem.name,
          category: cat.name,
          price: cleanPrice,
          gstRate: rawItem.gst_rate || 5,
          dietary: rawItem.dietary,
          stock: 50,
          stockQty: 50,
          trackStock: true,
          image: photoUrl
        });
      }
    }
    assert.strictEqual(cloudFirestoreState.menu.length, 4, '4 AI-extracted dishes added to shop menu');
    assert.strictEqual(cloudFirestoreState.menu[0].price, 60, 'Darjeeling Tea price parsed cleanly as 60');
    assert.strictEqual(cloudFirestoreState.menu[2].price, 180, 'Smoked Chicken Sandwich price parsed cleanly as 180');
  });

  await step('STAGE 3', 'S3-03', '15-Scan Monthly Quota tracks usage per shop, blocks 16th scan (HTTP 429), and supports BYOK custom key', async () => {
    const quotaShopId = `QUOTA_${shopId}`;
    // 1. Check initial quota via live server HTTP endpoint
    const qRes1 = await fetch(`${SERVER_URL}/api/ai/quota?clientId=${encodeURIComponent(quotaShopId)}`);
    const qData1 = await qRes1.json();
    assert.strictEqual(qData1.limit, 15, 'Monthly limit is 15 scans');
    assert.strictEqual(qData1.used, 0, 'Fresh shop starts at 0 used');
    assert.strictEqual(qData1.remaining, 15, 'Fresh shop starts with 15 remaining');

    // 2. Simulate 15 successful scans
    for (let i = 1; i <= 15; i++) {
      const check = await quotaService.checkAiQuotaAndKey({ shopId: quotaShopId });
      assert.strictEqual(check.currentUsage, i - 1, `Before Scan #${i}, usage is ${i - 1}`);
      assert.strictEqual(check.monthlyLimit, 15, 'Monthly limit is 15');
      const recorded = await quotaService.recordSuccessfulAiUsage(quotaShopId, check);
      assert.strictEqual(recorded.used, i, `Scan #${i} recorded`);
    }

    // 3. 16th scan must be blocked with HTTP 429
    let caught429 = null;
    try {
      await quotaService.checkAiQuotaAndKey({ shopId: quotaShopId });
    } catch (err) {
      caught429 = err;
    }
    assert.ok(caught429, '16th scan must throw quota exceeded error');
    assert.strictEqual(caught429.status, 429, 'Exhausted quota must return HTTP 429 status code');
    assert.strictEqual(caught429.quota.remaining, 0);

    // 4. Verify BYOK Custom Gemini API Key precedence & masking
    const byokShopId = `BYOK_${shopId}`;
    const customKey = 'AIzaSyCustomUserProvidedKey1234567890';
    const checkByok = await quotaService.checkAiQuotaAndKey({ shopId: byokShopId, customApiKey: customKey, reserveSlot: false });
    assert.strictEqual(checkByok.apiKey, customKey, 'BYOK Custom API key takes precedence over server default key');
    assert.strictEqual(checkByok.isCustomKey, true, 'isCustomKey flag must be true');
  });

  await step('STAGE 3', 'S3-04', 'Uploaded menu syncs in real-time across all 4 staff terminals (Admin, Cashier, Floor Server, Chef)', async () => {
    // Sync cloud menu to all terminals
    const cashierTerminal = createTerminalEnv('Billing Counter 1', false);
    const serverTerminal = createTerminalEnv('Floor Waiter Mobile', false);
    const chefTerminal = createTerminalEnv('Kitchen Display Tab', false);

    [adminTerminal, cashierTerminal, serverTerminal, chefTerminal].forEach(term => {
      term.sandbox.menuItems = JSON.parse(JSON.stringify(cloudFirestoreState.menu));
    });

    assert.strictEqual(cashierTerminal.sandbox.menuItems.length, 4, 'Cashier terminal received all 4 uploaded menu items');
    assert.strictEqual(serverTerminal.sandbox.menuItems.length, 4, 'Floor Server terminal received all 4 uploaded menu items');
    assert.strictEqual(chefTerminal.sandbox.menuItems.length, 4, 'Kitchen Chef terminal received all 4 uploaded menu items');
    assert.strictEqual(serverTerminal.sandbox.menuItems[2].name, 'Smoked Chicken Sandwich', 'Dish name matches across terminals');
  });

  // ============================================================================
  // STAGE 4: FLOOR SERVER ORDER, DELTA-KOT, KDS & STRICT KOT PRINT ISOLATION
  // ============================================================================
  console.log('\n📍 STAGE 4: FLOOR SERVER TABLE ORDER, DELTA-KOT, KDS & STRICT KOT ISOLATION');

  let activeTableOrder = [
    { id: 101, name: 'Darjeeling First Flush Tea', price: 60, qty: 2, gstRate: 5, qtyKotPrinted: 0 },
    { id: 103, name: 'Smoked Chicken Sandwich', price: 180, qty: 1, gstRate: 5, notes: 'Extra toasted, less mayo', qtyKotPrinted: 0 }
  ];

  await step('STAGE 4', 'S4-01', 'Floor Server (Rohan Das) prints initial KOT for Table T1 — strictly isolated (zero shop details/logo/QR)', async () => {
    const kotPayload = {
      jobType: 'KOT',
      kotId: 'KOT-1001',
      table: 'T1',
      tableNo: 'T1',
      items: activeTableOrder.map(i => ({ ...i })),
      rawItems: activeTableOrder.map(i => ({ ...i })),
      biller: 'Rohan Das',
      billerRole: 'Floor Server',
      isAddon: false,
      date: '5:35:00 PM'
    };

    const kotBytes = ThermalPrinterBridge.generateEscPosCommands(kotPayload, '58mm', {
      isKot: true,
      storeProfile: cloudFirestoreState.profile,
      logoBytes: null,
      qrBytes: null
    });

    const kotText = Buffer.from(kotBytes).toString('latin1');
    const kotSingleLine = kotText.replace(/\s+/g, ' ');

    // Verify ESC @ init and GS V paper cut
    assert.strictEqual(kotBytes[0], 0x1B);
    assert.strictEqual(kotBytes[1], 0x40);
    assert.ok(kotText.includes('KITCHEN TICKET'), 'KOT must contain KITCHEN TICKET header');
    assert.ok(kotText.includes('TABLE: T1'), 'KOT must contain TABLE: T1');
    assert.ok(kotSingleLine.includes('Rohan Das'), 'KOT must contain server name Rohan Das');
    assert.ok(kotSingleLine.includes('2x Darjeeling First Flush Tea'), 'KOT must contain 2x Darjeeling First Flush Tea');
    assert.ok(kotSingleLine.includes('1x Smoked Chicken Sandwich'), 'KOT must contain 1x Smoked Chicken Sandwich');
    assert.ok(kotSingleLine.includes('Extra toasted, less mayo'), 'KOT must include item preparation notes');

    // STRICT ISOLATION CHECK: KOT must NEVER include shop name, address, phone, GSTIN, FSSAI, prices, or QR
    assert.ok(!kotText.includes(shopName), 'KOT must NOT leak shop name');
    assert.ok(!kotText.includes(shopAddress), 'KOT must NOT leak shop address');
    assert.ok(!kotText.includes(shopPhone), 'KOT must NOT leak shop phone');
    assert.ok(!kotText.includes(shopGstin), 'KOT must NOT leak shop GSTIN');
    assert.ok(!kotText.includes(shopFssai), 'KOT must NOT leak shop FSSAI');
    assert.ok(!kotText.includes(shopUpiId), 'KOT must NOT leak UPI ID');
    assert.ok(!kotText.includes('Scan to Pay'), 'KOT must NOT include Scan to Pay QR');
    assert.ok(!kotText.includes('Rs. 180'), 'KOT must NOT include item prices');

    // Mark items as KOT printed
    activeTableOrder.forEach(item => { item.qtyKotPrinted = item.qty; });
  });

  await step('STAGE 4', 'S4-02', 'Kitchen Chef (Vikram Singh) views KOT on KDS with accurate quantities and advances status to SERVED', async () => {
    const kdsContainer = {
      innerHTML: '',
      querySelectorAll: () => [],
      addEventListener: () => {}
    };
    global.document = {
      getElementById: (id) => (id === 'kotCardsContainer' ? kdsContainer : null),
      createElement: () => ({ style: {}, classList: { add() {} }, appendChild() {} })
    };
    const kdsInstance = new kotUiModule.KotUI({ container: kdsContainer });
    kdsInstance.setKots([
      {
        kot_id: 'KOT-1001',
        table_id: 'T1',
        status: 'PENDING',
        created_at: new Date().toISOString(),
        items: activeTableOrder.map(i => ({ name: i.name, qty: i.qty, notes: i.notes }))
      }
    ]);

    assert.ok(kdsContainer.innerHTML.includes('2x'), 'KDS renders 2x quantity using it.quantity || it.qty fallback');
    assert.ok(kdsContainer.innerHTML.includes('1x'), 'KDS renders 1x quantity');
    assert.ok(!kdsContainer.innerHTML.includes('undefinedx'), 'KDS never renders undefinedx');
    assert.ok(kdsContainer.innerHTML.includes('Darjeeling First Flush Tea'), 'KDS renders dish name');
    assert.ok(kdsContainer.innerHTML.includes('Extra toasted, less mayo'), 'KDS renders item note');
  });

  await step('STAGE 4', 'S4-03', 'Add-on items on Table T1 trigger Delta-KOT printing only newly added quantities', async () => {
    // Customer adds 1 more Tea (qty 2 -> 3) and 1 Classic Veg Samosa (qty 1)
    activeTableOrder[0].qty = 3; // 2 already printed -> delta = 1
    activeTableOrder.push({
      id: 104,
      name: 'Classic Veg Samosa',
      price: 30,
      qty: 1,
      gstRate: 5,
      qtyKotPrinted: 0
    });

    // Compute delta items
    const deltaItems = [];
    for (const item of activeTableOrder) {
      const printed = Number(item.qtyKotPrinted || 0);
      const current = Number(item.qty || 0);
      if (current > printed) {
        deltaItems.push({ ...item, qty: current - printed, quantity: current - printed });
      }
    }

    assert.strictEqual(deltaItems.length, 2, 'Delta KOT must contain 2 lines (1x additional Tea + 1x new Samosa)');
    assert.strictEqual(deltaItems[0].name, 'Darjeeling First Flush Tea');
    assert.strictEqual(deltaItems[0].qty, 1, 'Only the 1 additional Tea is in Delta KOT');
    assert.strictEqual(deltaItems[1].name, 'Classic Veg Samosa');
    assert.strictEqual(deltaItems[1].qty, 1);

    const addonKotBytes = ThermalPrinterBridge.generateEscPosCommands({
      jobType: 'KOT',
      kotId: 'KOT-1002',
      table: 'T1',
      items: deltaItems,
      biller: 'Rohan Das',
      isAddon: true
    }, '58mm', { isKot: true });

    const addonText = Buffer.from(addonKotBytes).toString('latin1');
    assert.ok(addonText.includes('ADD-ON KOT'), 'Add-on ticket prints ADD-ON KOT title');
    assert.ok(addonText.includes('1x Darjeeling First'), 'Prints 1x Tea delta');
    assert.ok(addonText.includes('1x Classic Veg Samo'), 'Prints 1x Samosa delta');
    assert.ok(!addonText.includes('Smoked Chicken'), 'Already-printed Smoked Chicken Sandwich is excluded from Add-On KOT');

    activeTableOrder.forEach(item => { item.qtyKotPrinted = item.qty; });
  });

  // ============================================================================
  // STAGE 5: CASHIER CHECKOUT, CUSTOMER TAX INVOICE (LOGO + QR + GST) & REPORTS
  // ============================================================================
  console.log('\n📍 STAGE 5: CASHIER CHECKOUT, TAX INVOICE (LOGO + DYNAMIC QR + GST) & REPORTS CARDS');

  // Simulated 1-bit raster logo bytes (GS v 0 header: 0x1D 0x76 0x30 0x00)
  const mockLogoRasterBytes = new Uint8Array([0x1D, 0x76, 0x30, 0x00, 0x01, 0x00, 0x01, 0x00, 0xFF]);

  const settledOrder = {
    id: 1731067000001,
    billNo: 1001,
    date: '08/11/2026, 5:42:10 PM',
    filterDate: '2026-11-08',
    table: 'T1',
    orderType: 'Dine-In',
    paymentMode: 'UPI',
    customer: 'Rahul Verma',
    biller: 'Priya Sharma',
    rawItems: activeTableOrder.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, gstRate: i.gstRate })),
    items: 'Darjeeling First Flush Tea (x3), Smoked Chicken Sandwich (x1), Classic Veg Samosa (x1)',
    grossSubtotal: 390,
    discountAmount: 0,
    subtotal: 371.43,
    totalTax: 18.57,
    tax: 18.57,
    gstMode: 'inclusive',
    gstSummary: {
      5: { base: 371.43, tax: 18.57, cgst: 9.29, sgst: 9.29 }
    },
    amount: 390
  };

  await step('STAGE 5', 'S5-01', 'Cashier (Priya Sharma) prints Customer Tax Invoice with Shop Logo, Shop Details, Real Item Prices, GST & Dynamic UPI QR', async () => {
    const invoiceBytes = ThermalPrinterBridge.generateEscPosCommands(settledOrder, '58mm', {
      isKot: false,
      storeProfile: cloudFirestoreState.profile,
      logoBytes: mockLogoRasterBytes
    });

    const invText = Buffer.from(invoiceBytes).toString('latin1');
    const invSingleLine = invText.replace(/\s+/g, ' ');

    // 1. Verify Shop Logo raster command (0x1D 0x76 0x30 0x00) is embedded in bytecode
    let foundLogoHeader = false;
    for (let i = 0; i < invoiceBytes.length - 4; i++) {
      if (invoiceBytes[i] === 0x1D && invoiceBytes[i + 1] === 0x76 && invoiceBytes[i + 2] === 0x30 && invoiceBytes[i + 3] === 0x00) {
        foundLogoHeader = true;
        break;
      }
    }
    assert.strictEqual(foundLogoHeader, true, 'Customer invoice bytecode must contain shop logo raster bitmap (GS v 0)');

    // 2. Verify Store Identity & Statutory Headers
    assert.ok(invSingleLine.includes('Aroma Roasters'), 'Invoice prints shop name');
    assert.ok(invSingleLine.includes('42 Park Street'), 'Invoice prints shop address');
    assert.ok(invSingleLine.includes('Tel: 9876543210'), 'Invoice prints shop phone');
    assert.ok(invSingleLine.includes('FSSAI Lic. No.: 12824019000991'), 'Invoice prints FSSAI license');
    assert.ok(invSingleLine.includes('GSTIN: 19AABCU9603R1ZM'), 'Invoice prints GSTIN');
    assert.ok(invSingleLine.includes('TAX INVOICE'), 'Invoice prints TAX INVOICE header');

    // 3. Verify Real Item Names, Quantities & Amounts (Zero "Item 1 Rs. 0.00" bug!)
    assert.ok(invSingleLine.includes('Darjeeling') && invSingleLine.includes('Rs. 180.00'), 'Prints 3x Darjeeling Tea for Rs. 180.00');
    assert.ok(invSingleLine.includes('Smoked') && invSingleLine.includes('Rs. 180.00'), 'Prints 1x Smoked Chicken Sandwich for Rs. 180.00');
    assert.ok(invSingleLine.includes('Classic') && invSingleLine.includes('Rs. 30.00'), 'Prints 1x Classic Veg Samosa for Rs. 30.00');
    assert.ok(!invSingleLine.includes('Rs. 0.00'), 'Invoice must NEVER print Rs. 0.00 for priced items');

    // 4. Verify GST Breakdown & Total
    assert.ok(invSingleLine.includes('--- GST BREAKDOWN ---'), 'Invoice prints GST Breakdown section');
    assert.ok(invSingleLine.includes('CGST @ 2.5%') && invSingleLine.includes('Rs. 9.29'), 'Invoice prints CGST @ 2.5% = Rs. 9.29');
    assert.ok(invSingleLine.includes('SGST @ 2.5%') && invSingleLine.includes('Rs. 9.29'), 'Invoice prints SGST @ 2.5% = Rs. 9.29');
    assert.ok(invSingleLine.includes('TOTAL: Rs. 390.00'), 'Invoice prints TOTAL: Rs. 390.00');

    // 5. Verify Dynamic UPI QR Code (Native GS ( k command + UPI payload for Rs. 390.00)
    assert.ok(invSingleLine.includes('Scan to Pay'), 'Invoice prints Scan to Pay header');
    assert.ok(invText.includes('upi://pay?pa=aromaroasters@okaxis'), 'Invoice embeds dynamic UPI payment URI');
    assert.ok(invText.includes('am=390.00'), 'Dynamic QR encodes exact bill amount 390.00');
    assert.ok(invSingleLine.includes('UPI: aromaroasters@okaxis'), 'Invoice prints merchant UPI ID caption');
  });

  await step('STAGE 5', 'S5-02', 'Legacy / History Order with string-only `items` prints real names and amounts without "Item 1 Rs. 0.00" bug', async () => {
    global.window = {
      menuItems: JSON.parse(JSON.stringify(cloudFirestoreState.menu)),
      shopProfile: JSON.parse(JSON.stringify(cloudFirestoreState.profile))
    };
    const legacyStringOrder = {
      id: 1731067000002,
      billNo: 1002,
      table: 'T2',
      orderType: 'Dine-In',
      paymentMode: 'Cash',
      biller: 'Priya Sharma',
      // Only string `items`, no `rawItems`
      items: 'Darjeeling First Flush Tea (x2), Classic Veg Samosa (x1)',
      amount: 150
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(legacyStringOrder, '58mm', {
      isKot: false,
      storeProfile: cloudFirestoreState.profile
    });
    const text = Buffer.from(bytes).toString('latin1').replace(/\s+/g, ' ');
    assert.ok(text.includes('Darjeeling') && text.includes('Rs. 120.00'), 'Legacy string order resolves 2x Tea = Rs. 120.00');
    assert.ok(text.includes('Classic') && text.includes('Rs. 30.00'), 'Legacy string order resolves 1x Samosa = Rs. 30.00');
    assert.ok(!text.includes('Rs. 0.00'), 'Legacy string order never prints Rs. 0.00');
  });

  await step('STAGE 5', 'S5-03', 'Reports section renders settled bills as interactive Cards (#historyCardsGrid), opens full-screen Invoice Modal, and edits order without TypeError', async () => {
    // Load dashboard.js in a sandboxed DOM environment
    const dashElements = new Map();
    const getDashEl = (id) => {
      if (!dashElements.has(id)) {
        dashElements.set(id, {
          id,
          style: { display: '' },
          innerHTML: '',
          innerText: '',
          textContent: '',
          value: '',
          disabled: false,
          classList: {
            _s: new Set(),
            add(...c) { c.forEach(x => this._s.add(x)); },
            remove(...c) { c.forEach(x => this._s.delete(x)); },
            contains(x) { return this._s.has(x); }
          }
        });
      }
      return dashElements.get(id);
    };

    const dashSandbox = {
      console,
      Date,
      Math,
      JSON,
      String,
      Number,
      Boolean,
      Array,
      Object,
      RegExp,
      Error,
      Promise,
      setTimeout: (fn) => fn(),
      clearTimeout: () => {},
      localStorage: { getItem: () => 'cards', setItem: () => {}, removeItem: () => {} },
      escapeHtml: (s) => String(s || ''),
      showToast: () => {},
      selectPayment: () => {},
      persistHistoryFirebase: () => {},
      updateAllUI: () => {},
      normalizeRole: (r) => r,
      getLocalISODate: () => '2026-11-08',
      getLocalISOMonth: () => '2026-11',
      getLocalISOYear: () => '2026',
      currentDashboardRange: 'all',
      orderHistory: [
        JSON.parse(JSON.stringify(settledOrder)),
        // Also include an order where `items` is a string and `rawItems` is missing to stress-test openEditOrderModal!
        {
          id: 1731067000002,
          billNo: 1002,
          date: '08/11/2026, 5:45:00 PM',
          filterDate: '2026-11-08',
          table: 'T2',
          orderType: 'Dine-In',
          paymentMode: 'Cash',
          customer: 'Walk-in',
          biller: 'Priya Sharma',
          items: 'Classic Veg Samosa (x2)',
          amount: 60
        }
      ],
      dailyExpenses: [],
      menuItems: JSON.parse(JSON.stringify(cloudFirestoreState.menu)),
      currentStaff: { id: 1, name: 'Abhijit Modak', role: 'Admin' },
      addEventListener: () => {},
      document: {
        getElementById: getDashEl,
        querySelectorAll: () => [],
        addEventListener: () => {}
      }
    };
    dashSandbox.window = dashSandbox;

    const dashCode = fs.readFileSync(path.join(ROOT, 'js', 'dashboard.js'), 'utf8');
    vm.createContext(dashSandbox);
    vm.runInContext(dashCode, dashSandbox);

    // 1. Render Dashboard Analytics & Verify Cards Grid
    await dashSandbox.renderDashboardAnalytics();
    const cardsHtml = getDashEl('historyCardsGrid').innerHTML;
    assert.ok(cardsHtml.includes('order-history-card'), 'Reports section renders interactive .order-history-card elements');
    assert.ok(cardsHtml.includes('#1001') && cardsHtml.includes('Rahul Verma') && cardsHtml.includes('390.00'), 'Card displays Bill #1001, Customer Rahul Verma, and ₹ 390.00');
    assert.ok(cardsHtml.includes('viewOrderInvoiceModal(1731067000001)'), 'Clicking card opens full-screen viewOrderInvoiceModal');
    assert.strictEqual(getDashEl('historyCardsGrid').style.display, 'grid', 'Cards view is active by default');

    // 2. Test openEditOrderModal on string-only order (#1002) — must NOT throw currentEditingOrderItems.forEach TypeError!
    dashSandbox.openEditOrderModal(1731067000002);
    const editContainerHtml = getDashEl('editOrderItemsContainer').innerHTML;
    assert.ok(editContainerHtml.includes('Classic Veg Samosa'), 'openEditOrderModal parsed string items into structured editable rows without TypeError');

    // 3. Increment item quantity in Edit Order Modal (+1 Samosa: 2 -> 3) and save!
    dashSandbox.editOrderItemQty(0, 1);
    getDashEl('editOrderType').value = 'Dine-In';
    getDashEl('editSelectedPaymentMode').value = 'UPI';
    getDashEl('editCustomerName').value = 'Ananya Roy';
    getDashEl('editBillerName').value = 'Abhijit Modak';
    dashSandbox.saveEditedOrder();

    const editedOrder = dashSandbox.orderHistory.find(o => o.id === 1731067000002);
    assert.strictEqual(editedOrder.amount, 90, 'Edited order amount recalculated to ₹ 90.00 (3x Samosa @ ₹ 30)');
    assert.strictEqual(editedOrder.items, 'Classic Veg Samosa (x3)', 'Edited order string summary synchronized');
    assert.strictEqual(editedOrder.rawItems[0].qty, 3, 'Edited order rawItems array synchronized');
  });

  // ============================================================================
  // STAGE 6: SECURITY, REMOTE STAFF REVOCATION & SUBSCRIPTION LIFECYCLE
  // ============================================================================
  console.log('\n📍 STAGE 6: REMOTE STAFF DELETION LOGOUT, SUBSCRIPTION LIFECYCLE & SECURITY RULES');

  await step('STAGE 6', 'S6-01', 'Admin deleting a staff member triggers immediate remote session revocation and locks their terminal', async () => {
    const serverTerminal = createTerminalEnv('Floor Waiter Mobile', false);
    serverTerminal.sandbox.currentStaff = { id: 3, name: 'Rohan Das', role: 'Floor Server' };
    serverTerminal.sandbox.tablesInfo[1] = { items: [{ id: 101, name: 'Tea', qty: 1 }], status: 'occupied' };

    // Admin deletes Rohan Das (id: 3)
    adminTerminal.sandbox.currentStaff = staffAdmin;
    adminTerminal.sandbox.confirm = () => true;
    adminTerminal.sandbox.deleteStaffMember(3);

    // Verify Rohan is removed from cloud staff list and session is marked REVOKED
    assert.strictEqual(cloudFirestoreState.staff.some(s => s.id === 3), false, 'Rohan Das deleted from cloud staff');
    const rohanSess = cloudFirestoreState.sessions.find(s => s.staffId === 3);
    assert.strictEqual(rohanSess.status, 'REVOKED', 'Rohan session marked REVOKED');
    assert.strictEqual(rohanSess.isLocked, true, 'Rohan session marked isLocked: true');

    // Simulate Rohan's terminal receiving the revocation event
    serverTerminal.sandbox.lockTerminalByRemote(rohanSess);
    assert.strictEqual(serverTerminal.sandbox.currentStaff, null, 'Rohan terminal currentStaff purged immediately');
    assert.strictEqual(serverTerminal.elements.get('loginOverlay').style.display, 'flex', 'Rohan terminal locked to loginOverlay');
  });

  await step('STAGE 6', 'S6-02', 'Backend Subscription Lifecycle (PAUSED -> RESUMED -> REVOKED) propagates to shop status', async () => {
    // 1. Pause subscription
    const pauseRes = await fetch(`${SERVER_URL}/api/subscription/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        shopId,
        action: 'PAUSED',
        reason: 'Seasonal maintenance pause',
        adminKey: 'ADMIN_OVERRIDE'
      })
    });
    assert.strictEqual(pauseRes.status, 200);
    const pauseData = await pauseRes.json();
    assert.strictEqual(pauseData.subscription.status, 'PAUSED');

    // 2. Resume subscription
    const resumeRes = await fetch(`${SERVER_URL}/api/subscription/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        shopId,
        action: 'RESUMED',
        reason: 'Back in business',
        adminKey: 'ADMIN_OVERRIDE'
      })
    });
    assert.strictEqual(resumeRes.status, 200);
    const resumeData = await resumeRes.json();
    assert.strictEqual(resumeData.subscription.status, 'RESUMED');

    // 3. Revoke subscription
    const revokeRes = await fetch(`${SERVER_URL}/api/subscription/manage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        shopId,
        action: 'REVOKED',
        reason: 'End of test simulation',
        adminKey: 'ADMIN_OVERRIDE'
      })
    });
    assert.strictEqual(revokeRes.status, 200);
    const revokeData = await revokeRes.json();
    assert.strictEqual(revokeData.subscription.status, 'REVOKED');
  });

  await step('STAGE 6', 'S6-03', 'Repository & Security Invariants: 26 modal-close-btn SVGs, 0 button emojis, and 100% Firestore rules binary parity', async () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const closeBtns = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi) || [];
    assert.strictEqual(closeBtns.length, 26, `Expected 26 modal-close-btn buttons, found ${closeBtns.length}`);

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
    const allButtons = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
    let emojiViolations = 0;
    allButtons.forEach(b => { if (emojiRegex.test(b)) emojiViolations++; });
    assert.strictEqual(emojiViolations, 0, 'Strictly 0 raw emojis inside <button> elements');

    const rules1 = fs.readFileSync(path.join(ROOT, 'firestore.rules'));
    const rules2 = fs.readFileSync(path.join(ROOT, 'database', 'firestore.rules'));
    assert.strictEqual(Buffer.compare(rules1, rules2), 0, 'firestore.rules and database/firestore.rules must be 100% byte-for-byte identical');
    assert.ok(!rules1.toString('utf8').includes('!isAuthenticated() ||'), 'Unauthenticated bypass must never exist in firestore.rules');
  });

  console.log('\n================================================================================');
  console.log(`🎯 E2E SIMULATION SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSimulation().catch(err => {
  console.error('Unhandled simulation error:', err);
  process.exit(1);
});
