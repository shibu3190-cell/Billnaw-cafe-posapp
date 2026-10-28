// scratch/test_e2e_staff_and_logout_bypass.mjs
import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9245;
const ARTIFACTS_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_pos_staff_e2e_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runStaffAndAuthE2E() {
  console.log("==============================================================================");
  console.log("🛡️ SENIOR QA & SECURITY AUDIT: E2E TWO-TIER STAFF RBAC & LOGOUT BYPASS AUDIT");
  console.log("==============================================================================\n");

  const chrome = spawn(CHROME_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    `--user-data-dir=${TEMP_USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--window-size=1280,800',
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
        console.error("DEBUG EXCEPTION DETAILS:", JSON.stringify(res.exceptionDetails, null, 2));
        throw new Error(res.exceptionDetails.text || JSON.stringify(res.exceptionDetails));
      }
      return res.result ? res.result.value : undefined;
    };

    const takeScreenshot = async (name) => {
      const res = await send('Page.captureScreenshot', { format: 'png' });
      const buffer = Buffer.from(res.data, 'base64');
      const filename = path.join(ARTIFACTS_DIR, `${name}.png`);
      fs.writeFileSync(filename, buffer);
      console.log(`  📸 Screenshot saved: ${name}.png`);
    };

    await send('Page.enable');
    await send('Runtime.enable');

    ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        const text = data.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        if (data.params.type === 'error' || data.params.type === 'warning') {
          console.log(`    [Browser Console ${data.params.type.toUpperCase()}]:`, text);
        }
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.log(`    [Browser Uncaught Exception]:`, data.params.exceptionDetails.text);
      }
    });

    console.log("📍 STEP 1: INITIAL CLEAN LOAD & STRICT ROOT AUTH GATE");
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2000);

    const initialModalState = await evaluate(`(() => {
      const modal = document.getElementById('shopAuthModal');
      const closeBtn = document.getElementById('shopAuthCloseBtn');
      const isVisible = modal && window.getComputedStyle(modal).display !== 'none';
      const isCloseHidden = closeBtn && (window.getComputedStyle(closeBtn).display === 'none' || closeBtn.disabled);
      const token = localStorage.getItem('billnaw_auth_token');
      const mode = localStorage.getItem('billnaw_auth_mode');
      const modalDisplay = modal ? modal.style.display : 'no-modal';
      return { isVisible, isCloseHidden, token, mode, modalDisplay };
    })()`);

    console.log(`  🔍 Initial shopAuthModal visible: ${initialModalState.isVisible}, Close button locked: ${initialModalState.isCloseHidden}, token: ${initialModalState.token}, mode: ${initialModalState.mode}, modalDisplay: ${initialModalState.modalDisplay}`);
    assert.strictEqual(initialModalState.isVisible, true, "Root Auth Gate: shopAuthModal MUST be visible on initial unauthenticated visit");
    assert.strictEqual(initialModalState.isCloseHidden, true, "shopAuthModal close button MUST be locked/hidden when unauthenticated");
    await takeScreenshot('screen_staff_e2e_1_auth_gate');

    console.log("\n📍 STEP 2: AUTHENTICATE WITH SHOP OWNER CREDENTIALS");
    // Simulate authentic shop owner login
    await evaluate(`(async () => {
      const email = 'audit_owner@billnawcafe.com';
      const sendRes = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const sendData = await sendRes.json();
      const devOtp = sendData.devOtp;
      const verifyRes = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp: devOtp, storeName: 'Audit Cafe POS' })
      });
      const verifyData = await verifyRes.json();
      localStorage.setItem('billnaw_auth_token', verifyData.token);
      localStorage.setItem('billnaw_auth_email', email);
      localStorage.setItem('billnaw_store_code', verifyData.storeCode);
      if (verifyData.session) {
        localStorage.setItem('billnaw_shop_session', JSON.stringify(verifyData.session));
      }
      closeShopAuthModal(true);
      if (typeof initStaffSystem === 'function') initStaffSystem();
    })()`);
    await sleep(1500);

    const staffInitialState = await evaluate(`(() => {
      return {
        staffCount: Array.isArray(staffList) ? staffList.length : 0,
        activeStaff: typeof currentStaff !== 'undefined' ? currentStaff : null
      };
    })()`);
    console.log(`  👤 Default Staff Initialized: ${staffInitialState.activeStaff?.name} (${staffInitialState.activeStaff?.role}), Total Staff: ${staffInitialState.staffCount}`);
    assert.ok(staffInitialState.activeStaff, "Default Admin/Owner staff profile must be active");
    assert.strictEqual(staffInitialState.activeStaff.role, 'Admin', "Default profile role must be Admin");
    await takeScreenshot('screen_staff_e2e_2_admin_active');

    console.log("\n📍 STEP 3: STAFF CRUD & 4-DIGIT PIN UNIQUENESS VALIDATION");
    // Attempt duplicate PIN
    const duplicatePinResult = await evaluate(`(async () => {
      // Try registering a cashier with PIN 1234 (which Admin already has)
      const res = await saveStaffMember({
        id: 'staff_test_cashier_fail',
        name: 'Duplicate PIN Tester',
        role: 'Cashier',
        pin: '1234',
        phone: '9999900001'
      });
      return res;
    })()`);
    console.log(`  🚫 Duplicate PIN Rejection: res = ${duplicatePinResult} (Expected: false)`);
    assert.strictEqual(duplicatePinResult, false, "System MUST reject duplicate 4-digit PIN!");

    // Register a valid Cashier with PIN 5555
    const validStaffResult = await evaluate(`(async () => {
      const res = await saveStaffMember({
        id: 'staff_ramesh_cashier',
        name: 'Ramesh Cashier',
        role: 'Cashier',
        pin: '5555',
        phone: '9876543210'
      });
      return {
        success: res,
        staffCount: staffList.length,
        cashierExists: staffList.some(s => s.name === 'Ramesh Cashier' && s.pinSalt && s.pinHash)
      };
    })()`);
    console.log(`  ✅ Valid Staff Created: success = ${validStaffResult.success}, Total staff = ${validStaffResult.staffCount}, Salted Hash Present = ${validStaffResult.cashierExists}`);
    assert.strictEqual(validStaffResult.success, true, "Staff creation with unique PIN must succeed");
    assert.strictEqual(validStaffResult.cashierExists, true, "Staff PIN must be salted SHA-256 hashed");

    console.log("\n📍 STEP 4: FAST STAFF SWITCHING (ADMIN -> CASHIER)");
    const switchResult = await evaluate(`(async () => {
      openStaffSwitchModal();
      const cashier = staffList.find(s => s.name === 'Ramesh Cashier');
      if (cashier) selectLoginStaff(cashier.id);
      const pinInput = document.getElementById('quickSwitchPinInput');
      if (pinInput) pinInput.value = '5555';
      await confirmQuickStaffSwitch();
      return {
        activeStaff: currentStaff
      };
    })()`);
    console.log(`  🔄 Staff Switched: ${switchResult.activeStaff?.name} (${switchResult.activeStaff?.role})`);
    assert.strictEqual(switchResult.activeStaff?.role, 'Cashier', "Active staff role must now be Cashier");
    await takeScreenshot('screen_staff_e2e_3_switched_to_cashier');

    console.log("\n📍 STEP 5: RBAC RESTRICTION & SPOT MANAGER PIN OVERRIDE");
    // Cashier attempts to switch to settings tab
    const rbacAttempt = await evaluate(`(() => {
      let overrideTriggered = false;
      const modal = document.getElementById('spotManagerOverrideModal');
      // Attempt tab switch
      switchTab('settings');
      if (modal && window.getComputedStyle(modal).display !== 'none') {
        overrideTriggered = true;
      }
      const activeTab = document.querySelector('.view.active')?.id || 'pos';
      return {
        activeTab,
        overrideTriggered,
        modalZIndex: modal ? window.getComputedStyle(modal).zIndex : null
      };
    })()`);
    console.log(`  🛡️ Cashier Settings Access Blocked: activeTab = ${rbacAttempt.activeTab}, Override Triggered = ${rbacAttempt.overrideTriggered}, z-index = ${rbacAttempt.modalZIndex}`);
    assert.notStrictEqual(rbacAttempt.activeTab, 'settings', "Cashier must not switch directly to Settings");
    assert.strictEqual(rbacAttempt.overrideTriggered, true, "Spot Manager Override modal must trigger");
    await takeScreenshot('screen_staff_e2e_4_spot_manager_override_prompt');

    // Authorize with Manager/Admin PIN 1234
    const overrideAuthResult = await evaluate(`(async () => {
      const pinInput = document.getElementById('spotOverridePinInput');
      if (pinInput) pinInput.value = '1234';
      await confirmSpotManagerOverride();
      const activeTab = document.querySelector('.view.active')?.id || 'pos';
      return {
        activeTab,
        activeStaffAfterOverride: currentStaff
      };
    })()`);
    console.log(`  🔓 Spot Override Authorized: activeTab = ${overrideAuthResult.activeTab}, Active Staff Kept = ${overrideAuthResult.activeStaffAfterOverride?.name} (${overrideAuthResult.activeStaffAfterOverride?.role})`);
    assert.strictEqual(overrideAuthResult.activeTab, 'settings', "Settings tab must unlock after valid Manager PIN override");
    assert.strictEqual(overrideAuthResult.activeStaffAfterOverride?.name, 'Ramesh Cashier', "Active staff session MUST remain Ramesh Cashier (spot authorization only)");

    console.log("\n📍 STEP 6: TERMINAL LOCK & RELOAD PERSISTENCE");
    await evaluate(`(() => {
      switchTab('pos');
      lockTerminal(false);
    })()`);
    await sleep(500);

    const lockStateBeforeReload = await evaluate(`(() => {
      const overlay = document.getElementById('loginOverlay');
      const isLocked = overlay && window.getComputedStyle(overlay).display !== 'none';
      const zIndex = overlay ? window.getComputedStyle(overlay).zIndex : null;
      const hasNumpad = !!document.getElementById('terminalPinNumpad');
      const storageFlag = localStorage.getItem('billnaw_terminal_locked');
      return { isLocked, zIndex, hasNumpad, storageFlag };
    })()`);
    console.log(`  🔒 Terminal Locked: isLocked = ${lockStateBeforeReload.isLocked}, z-index = ${lockStateBeforeReload.zIndex}, numpad = ${lockStateBeforeReload.hasNumpad}, storageFlag = ${lockStateBeforeReload.storageFlag}`);
    assert.strictEqual(lockStateBeforeReload.isLocked, true, "Terminal PIN lock overlay must be visible");
    assert.strictEqual(lockStateBeforeReload.zIndex, '1000005', "Overlay must have high z-index 1000005");
    assert.strictEqual(lockStateBeforeReload.storageFlag, 'true', "billnaw_terminal_locked must be stored in localStorage");
    await takeScreenshot('screen_staff_e2e_5_terminal_locked');

    // Reload the page
    console.log("  🔄 Reloading page to test lock persistence...");
    await send('Page.reload');
    await sleep(2500);

    const lockStateAfterReload = await evaluate(`(() => {
      const overlay = document.getElementById('loginOverlay');
      const isLocked = overlay && window.getComputedStyle(overlay).display !== 'none';
      const storageFlag = localStorage.getItem('billnaw_terminal_locked');
      return { isLocked, storageFlag };
    })()`);
    console.log(`  🔒 Lock Persisted After Page Refresh: isLocked = ${lockStateAfterReload.isLocked}, storageFlag = ${lockStateAfterReload.storageFlag}`);
    assert.strictEqual(lockStateAfterReload.isLocked, true, "Terminal PIN Lock MUST remain locked across page refreshes!");

    // Unlock terminal with PIN 5555
    const unlockResult = await evaluate(`(async () => {
      const cashier = staffList.find(s => s.name === 'Ramesh Cashier');
      if (cashier) selectLoginStaff(cashier.id);
      const pinInput = document.getElementById('staffLoginPinInput');
      if (pinInput) pinInput.value = '5555';
      await confirmStaffLogin();
      const overlay = document.getElementById('loginOverlay');
      const isStillLocked = overlay && window.getComputedStyle(overlay).display !== 'none';
      return { isStillLocked, activeStaff: currentStaff };
    })()`);
    console.log(`  🔓 Terminal Unlocked: overlay hidden = ${!unlockResult.isStillLocked}, activeStaff = ${unlockResult.activeStaff?.name}`);
    assert.strictEqual(unlockResult.isStillLocked, false, "Overlay must be hidden upon unlocking");

    console.log("\n📍 STEP 7: CRITICAL LOGOUT BYPASS PREVENTION AUDIT");
    // Trigger logout
    await evaluate(`(async () => {
      await logoutShop();
    })()`);
    await sleep(1500);

    const postLogoutState = await evaluate(`(() => {
      const token = localStorage.getItem('billnaw_auth_token');
      const session = localStorage.getItem('billnaw_shop_session');
      const staff = localStorage.getItem('billnaw_active_staff');
      const lockFlag = localStorage.getItem('billnaw_terminal_locked');
      const modal = document.getElementById('shopAuthModal');
      const isModalVisible = modal && window.getComputedStyle(modal).display !== 'none';
      const hasAuthParam = window.location.search.includes('auth=login');
      return { token, session, staff, lockFlag, isModalVisible, hasAuthParam };
    })()`);
    console.log(`  🚪 Post-Logout Storage Wiped: token = ${postLogoutState.token}, session = ${postLogoutState.session}, staff = ${postLogoutState.staff}`);
    console.log(`  🔒 Post-Logout Modal Locked: isModalVisible = ${postLogoutState.isModalVisible}, hasAuthParam = ${postLogoutState.hasAuthParam}`);
    assert.strictEqual(postLogoutState.token, null, "Auth token must be completely deleted from localStorage");
    assert.strictEqual(postLogoutState.session, null, "Shop session must be completely deleted from localStorage");
    assert.strictEqual(postLogoutState.staff, null, "Active staff must be purged from localStorage");
    assert.strictEqual(postLogoutState.lockFlag, null, "Terminal locked flag must be purged from localStorage");
    assert.strictEqual(postLogoutState.isModalVisible, true, "shopAuthModal must be open and blocking DOM");
    await takeScreenshot('screen_staff_e2e_6_logged_out_modal');

    // Test Back Button / Reload Bypass
    console.log("  🔄 Refreshing page post-logout to test for guest bypass...");
    await send('Page.reload');
    await sleep(2500);

    const postReloadAuthGate = await evaluate(`(() => {
      const modal = document.getElementById('shopAuthModal');
      const closeBtn = document.getElementById('shopAuthCloseBtn');
      const isModalVisible = modal && window.getComputedStyle(modal).display !== 'none';
      const isCloseLocked = closeBtn && (window.getComputedStyle(closeBtn).display === 'none' || closeBtn.disabled);
      const isDemoState = document.getElementById('topbarAuthStatus')?.innerText.toLowerCase().includes('demo');
      return { isModalVisible, isCloseLocked, isDemoState };
    })()`);
    console.log(`  🛡️ Post-Reload Auth Gate Guard: modal visible = ${postReloadAuthGate.isModalVisible}, close locked = ${postReloadAuthGate.isCloseLocked}, demo state = ${postReloadAuthGate.isDemoState}`);
    assert.strictEqual(postReloadAuthGate.isModalVisible, true, "CRITICAL: shopAuthModal MUST remain visible after page refresh (NO BYPASS!)");
    assert.strictEqual(postReloadAuthGate.isCloseLocked, true, "CRITICAL: shopAuthModal close button MUST remain disabled");
    assert.strictEqual(postReloadAuthGate.isDemoState, false, "CRITICAL: App MUST NOT silently transition into Guest/Demo mode on reload after logout!");
    await takeScreenshot('screen_staff_e2e_7_post_reload_strictly_locked');

    console.log("\n==============================================================================");
    console.log("🎯 ALL TWO-TIER STAFF & LOGOUT BYPASS E2E TESTS PASSED 100%!");
    console.log("==============================================================================");
  } finally {
    if (ws) ws.close();
    chrome.kill();
    try { fs.rmSync(TEMP_USER_DATA_DIR, { recursive: true, force: true }); } catch (e) {}
  }
}

runStaffAndAuthE2E().catch(err => {
  console.error("❌ E2E TEST FAILED:", err);
  process.exit(1);
});
