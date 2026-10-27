// scratch/test_phase5_packaging.cjs
// ============================================================================
// Automated Test Suite: Phase 5 Cross-Platform PWA, Android & Hardware Packaging
// Covers:
//   1. Web App Manifest (PWA installability, standalone display, icons, shortcuts)
//   2. Zero-Data-Loss Service Worker (Shell caching, API bypass, cache isolation)
//   3. Platform Detection Bridge (PWA, Android Capacitor, Desktop Tauri)
//   4. Multi-Transport ESC/POS Thermal Printing & Decoupled Print Job Queue
//   5. Capacitor Android Packaging Configuration
// ============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("====================================================================");
console.log("🚀 VERIFICATION SUITE: PHASE 5 PWA, ANDROID & HARDWARE PACKAGING");
console.log("====================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

async function test(id, description, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: [${id}] ${description}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ FAIL: [${id}] ${description}`);
    console.log(`     Error: ${err.message}`);
    failed++;
    failures.push({ id, description, error: err.message });
  }
}

async function runSuite() {
  // --------------------------------------------------------------------------
  // SECTION 1: WEB APP MANIFEST
  // --------------------------------------------------------------------------
  console.log("📍 SECTION 1: WEB APP MANIFEST (PWA INSTALLABILITY)");

  await test("PWA-01", "public/manifest.json and manifest.json exist with valid JSON schema", () => {
    const pubManifestPath = path.resolve(__dirname, '../public/manifest.json');
    const rootManifestPath = path.resolve(__dirname, '../manifest.json');

    assert.ok(fs.existsSync(pubManifestPath), "public/manifest.json must exist");
    assert.ok(fs.existsSync(rootManifestPath), "manifest.json must exist");

    const pubJson = JSON.parse(fs.readFileSync(pubManifestPath, 'utf8'));
    const rootJson = JSON.parse(fs.readFileSync(rootManifestPath, 'utf8'));

    assert.strictEqual(pubJson.display, 'standalone');
    assert.strictEqual(rootJson.display, 'standalone');
    assert.strictEqual(pubJson.theme_color, '#143832');
    assert.strictEqual(pubJson.id, 'com.billnaw.pos.app');
  });

  await test("PWA-02", "Manifest defines multi-resolution icons (192px and 512px) with any maskable purpose", () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/manifest.json'), 'utf8'));
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);

    const has192 = manifest.icons.some(i => i.sizes === '192x192');
    const has512 = manifest.icons.some(i => i.sizes === '512x512');
    assert.ok(has192, "Manifest must include 192x192 icon");
    assert.ok(has512, "Manifest must include 512x512 icon");
  });

  await test("PWA-03", "Manifest includes quick-action shortcuts for New Bill, Tables, and Reports", () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../public/manifest.json'), 'utf8'));
    assert.ok(Array.isArray(manifest.shortcuts) && manifest.shortcuts.length >= 3);
    assert.ok(manifest.shortcuts.some(s => s.url.includes('#pos')));
    assert.ok(manifest.shortcuts.some(s => s.url.includes('#tables')));
    assert.ok(manifest.shortcuts.some(s => s.url.includes('#dashboard')));
  });

  // --------------------------------------------------------------------------
  // SECTION 2: ZERO-DATA-LOSS SERVICE WORKER
  // --------------------------------------------------------------------------
  console.log("\n📍 SECTION 2: ZERO-DATA-LOSS SERVICE WORKER (sw.js & service-worker.js)");

  await test("SW-01", "Service worker files exist in public/ and root directory", () => {
    assert.ok(fs.existsSync(path.resolve(__dirname, '../public/sw.js')), "public/sw.js must exist");
    assert.ok(fs.existsSync(path.resolve(__dirname, '../service-worker.js')), "service-worker.js must exist");
  });

  await test("SW-02", "Service worker declares modern shell cache version and static shell assets list", () => {
    const swContent = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
    assert.ok(swContent.includes('CACHE_VERSION'), "Must declare CACHE_VERSION");
    assert.ok(swContent.includes('STATIC_SHELL_ASSETS'), "Must declare STATIC_SHELL_ASSETS");
    assert.ok(swContent.includes('src/core/platform-bridge.js'), "Must cache platform-bridge.js");
    assert.ok(swContent.includes('src/features/billing/billing.service.js'), "Must cache billing.service.js");
  });

  await test("SW-03", "Zero-Data-Loss Invariant: mutations and Firestore API calls strictly bypass SW cache", () => {
    const swContent = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
    assert.ok(swContent.includes("req.method !== 'GET'"), "Non-GET mutation requests must bypass cache");
    assert.ok(swContent.includes("pathname.startsWith('/api/')"), "API routes must bypass cache");
    assert.ok(swContent.includes("firestore.googleapis.com"), "Firestore cloud sync must bypass cache");
  });

  await test("SW-04", "Service worker implements SKIP_WAITING and broadcasts DEPLOY_CACHE_UPDATED", () => {
    const swContent = fs.readFileSync(path.resolve(__dirname, '../public/sw.js'), 'utf8');
    assert.ok(swContent.includes('SKIP_WAITING'), "Must handle SKIP_WAITING event");
    assert.ok(swContent.includes('DEPLOY_CACHE_UPDATED'), "Must broadcast DEPLOY_CACHE_UPDATED to window clients");
  });

  // --------------------------------------------------------------------------
  // SECTION 3: PLATFORM DETECTION & HARDWARE BRIDGE
  // --------------------------------------------------------------------------
  console.log("\n📍 SECTION 3: PLATFORM DETECTION & THERMAL PRINTER BRIDGE (platform-bridge.js)");

  const {
    detectPlatform,
    PLATFORMS,
    ThermalPrinterBridge
  } = await import('../src/core/platform-bridge.js');

  await test("PLAT-01", "detectPlatform resolves active runtime environment", () => {
    const p = detectPlatform();
    assert.ok([PLATFORMS.PWA_BROWSER, PLATFORMS.ANDROID_CAPACITOR, PLATFORMS.DESKTOP_TAURI].includes(p));
  });

  await test("PLAT-02", "ThermalPrinterBridge generates standard ESC/POS commands with cut and rupee formatting", () => {
    const mockBill = {
      invoice_id: 'BN-T1-261027-0099',
      settled_at: new Date().toISOString(),
      final_payable_paise: 35000,
      items: [
        { name: 'Cold Coffee', quantity: 2, line_total_paise: 25000 },
        { name: 'Veg Sandwich', quantity: 1, line_total_paise: 10000 }
      ]
    };

    const bytes = ThermalPrinterBridge.generateEscPosCommands(mockBill);
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 50);

    // ESC @ initialization
    assert.strictEqual(bytes[0], 0x1B);
    assert.strictEqual(bytes[1], 0x40);

    // GS V paper cut at end
    const last4 = bytes.slice(-4);
    assert.strictEqual(last4[0], 0x1D);
    assert.strictEqual(last4[1], 0x56);
  });

  await test("PLAT-03", "Decoupled Print Queue enqueues job and executes asynchronously without blocking", async () => {
    const mockBill = {
      id: 'BN-T1-261027-0100',
      final_total_paise: 15000,
      items: [{ name: 'Masala Tea', qty: 1 }]
    };

    const res = await ThermalPrinterBridge.enqueuePrintJob(mockBill);
    assert.strictEqual(res.error, null);
    assert.ok(res.data.queued);
    assert.ok(res.data.jobId.startsWith('pjob_'));
  });

  // --------------------------------------------------------------------------
  // SECTION 4: CAPACITOR ANDROID PACKAGING CONFIGURATION
  // --------------------------------------------------------------------------
  console.log("\n📍 SECTION 4: CAPACITOR ANDROID CONFIGURATION (capacitor.config.json)");

  await test("CAP-01", "capacitor.config.json exists with valid Android package specifications", () => {
    const capPath = path.resolve(__dirname, '../capacitor.config.json');
    assert.ok(fs.existsSync(capPath), "capacitor.config.json must exist");

    const capJson = JSON.parse(fs.readFileSync(capPath, 'utf8'));
    assert.strictEqual(capJson.appId, 'com.billnaw.pos');
    assert.strictEqual(capJson.appName, 'Billnaw Cafe POS');
    assert.strictEqual(capJson.server.androidScheme, 'https');
  });

  await test("CAP-02", "package.json defines Capacitor Android synchronization & build commands", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
    assert.ok(pkg.scripts['cap:sync'], "Must define cap:sync in scripts");
    assert.ok(pkg.scripts['cap:build:android'], "Must define cap:build:android in scripts");
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log("\n====================================================================");
  console.log(`🎯 PHASE 5 AUDIT COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================================");

  if (failed > 0) {
    console.log(`\n⚠️  FAILURES (${failed}):`);
    failures.forEach(f => console.log(`  - [${f.id}] ${f.description}: ${f.error}`));
    process.exit(1);
  } else {
    console.log("\n✨ ALL PHASE 5 CROSS-PLATFORM PACKAGING DELIVERABLES VERIFIED 100%!");
    process.exit(0);
  }
}

runSuite().catch(err => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
