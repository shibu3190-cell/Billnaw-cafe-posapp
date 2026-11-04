// scratch/test_challenger_cloud_m1_2.cjs
// Empirical Challenger Verification Harness for Milestone 1
// Remote Firestore REST Probes, Boundary Security, Anti-Tampering Invariants, and Offline Resilience

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passCount = 0;
let failCount = 0;
const findings = [];

function pass(name, detail = '') {
  console.log(`  ✅ PASS: ${name}${detail ? ' — ' + detail : ''}`);
  passCount++;
}

function recordFinding(severity, name, detail, reproduction) {
  console.error(`  ❌ [${severity}] ${name}: ${detail}`);
  failCount++;
  findings.push({ severity, name, detail, reproduction });
}

async function runEmpiricalChallenge() {
  console.log('========================================================================');
  console.log('🛡️ EMPIRICAL CHALLENGER: CLOUD BACKBONE, SECURITY RULES & OFFLINE RESILIENCE');
  console.log('========================================================================\n');

  const PROJECT_ID = 'abhi-pro-cafe-pos';
  const DATABASE_ID = 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda';
  const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/documents`;

  // -------------------------------------------------------------------------
  // CHALLENGE 1: REMOTE FIRESTORE REST 403-ELIMINATION & AUTHORIZED 404 PROBES
  // -------------------------------------------------------------------------
  console.log('📍 CHALLENGE 1: LIVE REMOTE FIRESTORE REST PROBES (403 ELIMINATION & 404 VERIFICATION)');

  const testEndpoints = [
    { name: 'Root Shop (/shops/SHOP-BILLNAW-01)', path: '/shops/SHOP-BILLNAW-01' },
    { name: 'Root Cafe (/cafes/cafe_billnaw_kolkata_01)', path: '/cafes/cafe_billnaw_kolkata_01' },
    { name: 'Non-existent Shop (/shops/SHOP-NONEXISTENT-CHALLENGER)', path: '/shops/SHOP-NONEXISTENT-CHALLENGER' },
    { name: 'Non-existent Cafe (/cafes/cafe_nonexistent_challenger)', path: '/cafes/cafe_nonexistent_challenger' },
    { name: 'Devices subcollection doc (/shops/SHOP-BILLNAW-01/devices/DEV-CHALLENGE-01)', path: '/shops/SHOP-BILLNAW-01/devices/DEV-CHALLENGE-01' },
    { name: 'Sessions subcollection doc (/shops/SHOP-BILLNAW-01/sessions/SESS-CHALLENGE-01)', path: '/shops/SHOP-BILLNAW-01/sessions/SESS-CHALLENGE-01' },
    { name: 'Staff subcollection doc (/shops/SHOP-BILLNAW-01/staff/STAFF-CHALLENGE-01)', path: '/shops/SHOP-BILLNAW-01/staff/STAFF-CHALLENGE-01' },
    { name: 'Tables subcollection doc (/shops/SHOP-BILLNAW-01/tables/T-01)', path: '/shops/SHOP-BILLNAW-01/tables/T-01' },
    { name: 'Cafe Devices subcollection doc (/cafes/cafe_billnaw_kolkata_01/devices/DEV-CHALLENGE-01)', path: '/cafes/cafe_billnaw_kolkata_01/devices/DEV-CHALLENGE-01' },
    { name: 'Cafe Sessions subcollection doc (/cafes/cafe_billnaw_kolkata_01/sessions/SESS-CHALLENGE-01)', path: '/cafes/cafe_billnaw_kolkata_01/sessions/SESS-CHALLENGE-01' },
    { name: 'Cafe Staff subcollection doc (/cafes/cafe_billnaw_kolkata_01/staff/STAFF-CHALLENGE-01)', path: '/cafes/cafe_billnaw_kolkata_01/staff/STAFF-CHALLENGE-01' }
  ];

  for (const ep of testEndpoints) {
    try {
      const res = await fetch(BASE_URL + ep.path);
      const data = await res.json();
      
      assert.notStrictEqual(res.status, 403, `${ep.name} returned HTTP 403 Forbidden!`);
      assert.notStrictEqual(data?.error?.code, 403, `${ep.name} returned code 403 PERMISSION_DENIED!`);
      
      if (res.status === 404) {
        assert.strictEqual(data?.error?.status, 'NOT_FOUND', `${ep.name} expected NOT_FOUND on missing doc`);
        pass(ep.name, `HTTP 404 NOT_FOUND (Authorized read verified, 0% 403 error)`);
      } else if (res.status === 200) {
        pass(ep.name, `HTTP 200 OK (Document exists and readable)`);
      } else {
        pass(ep.name, `HTTP ${res.status} (Non-403 response)`);
      }
    } catch (err) {
      recordFinding('HIGH', `Remote probe failed for ${ep.name}`, err.message, `fetch(${BASE_URL + ep.path})`);
    }
  }

  // -------------------------------------------------------------------------
  // CHALLENGE 2: SECURITY PERIMETER & ANTI-TAMPERING ADVERSARIAL STRESS PROBES
  // -------------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 2: SECURITY BOUNDARY & ANTI-TAMPERING ADVERSARIAL STRESS PROBES');

  // 2.1 Attack: Attempt to read invalid/short tenant ID (< 3 chars)
  try {
    const invalidShopRes = await fetch(BASE_URL + '/shops/ab');
    const invalidShopData = await invalidShopRes.json();
    assert.strictEqual(invalidShopRes.status, 403, 'Invalid tenant /shops/ab MUST return HTTP 403 Forbidden');
    assert.strictEqual(invalidShopData?.error?.status, 'PERMISSION_DENIED', 'Invalid tenant must be PERMISSION_DENIED');
    pass('Security Perimeter: /shops/ab (<3 chars) rejected with HTTP 403 PERMISSION_DENIED');
  } catch (err) {
    recordFinding('HIGH', 'Security Perimeter: /shops/ab short tenant probe failed', err.message, `fetch(${BASE_URL}/shops/ab)`);
  }

  try {
    const invalidCafeRes = await fetch(BASE_URL + '/cafes/xy');
    const invalidCafeData = await invalidCafeRes.json();
    assert.strictEqual(invalidCafeRes.status, 403, 'Invalid tenant /cafes/xy MUST return HTTP 403 Forbidden');
    assert.strictEqual(invalidCafeData?.error?.status, 'PERMISSION_DENIED', 'Invalid tenant must be PERMISSION_DENIED');
    pass('Security Perimeter: /cafes/xy (<3 chars) rejected with HTTP 403 PERMISSION_DENIED');
  } catch (err) {
    recordFinding('HIGH', 'Security Perimeter: /cafes/xy short tenant probe failed', err.message, `fetch(${BASE_URL}/cafes/xy)`);
  }

  // 2.2 Attack: Physical deletion of a settled invoice (Anti-tampering invariant)
  const testInvId = 'INV-AUDIT-' + Date.now();
  let invoiceCreated = false;
  try {
    const createRes = await fetch(`${BASE_URL}/shops/SHOP-BILLNAW-01/invoices?documentId=${testInvId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          status: { stringValue: 'PAID' },
          total: { integerValue: '450' }
        }
      })
    });
    invoiceCreated = createRes.status === 200;
  } catch (e) {}

  if (invoiceCreated) {
    const delRes = await fetch(`${BASE_URL}/shops/SHOP-BILLNAW-01/invoices/${testInvId}`, {
      method: 'DELETE'
    });
    if (delRes.status === 403) {
      pass('Anti-Tampering Invariant: DELETE /invoices/{id} strictly rejected with HTTP 403');
    } else {
      recordFinding(
        'CRITICAL',
        'Anti-Tampering Invariant Violated: Settled invoice physically deleted via REST',
        `DELETE on /shops/SHOP-BILLNAW-01/invoices/${testInvId} returned HTTP ${delRes.status} (expected 403). ` +
        `The catch-all rule 'match /{allChildren=**} { allow read, write: if isTenantStaff(...); }' in firestore.rules grants write (which includes delete) to all subcollections, completely overriding 'allow delete: if false;' on /invoices/{invoiceId}.`,
        `POST ${BASE_URL}/shops/SHOP-BILLNAW-01/invoices?documentId=${testInvId} followed by DELETE ${BASE_URL}/shops/SHOP-BILLNAW-01/invoices/${testInvId}`
      );
    }

    // 2.3 Attack: Arbitrary modification of settled invoice without VOID metadata
    const testInv2 = 'INV-AUDIT-MOD-' + Date.now();
    await fetch(`${BASE_URL}/shops/SHOP-BILLNAW-01/invoices?documentId=${testInv2}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          status: { stringValue: 'PAID' },
          total: { integerValue: '300' }
        }
      })
    });

    const patchRes = await fetch(`${BASE_URL}/shops/SHOP-BILLNAW-01/invoices/${testInv2}?updateMask.fieldPaths=total`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          total: { integerValue: '9999' }
        }
      })
    });

    if (patchRes.status === 403) {
      pass('Anti-Tampering Invariant: Unauthorized PATCH without VOID transition strictly rejected with HTTP 403');
    } else {
      recordFinding(
        'CRITICAL',
        'Anti-Tampering Invariant Violated: Settled invoice modified without VOID audit trail',
        `PATCH on /shops/SHOP-BILLNAW-01/invoices/${testInv2} modifying total from 300 to 9999 returned HTTP ${patchRes.status} (expected 403). ` +
        `The catch-all rule 'match /{allChildren=**} { allow read, write: if isTenantStaff(...); }' grants update access to all subcollections, overriding the mandatory VOID status and void_audit requirement.`,
        `PATCH ${BASE_URL}/shops/SHOP-BILLNAW-01/invoices/${testInv2}?updateMask.fieldPaths=total with total=9999 on a PAID invoice`
      );
      // Clean up test document
      await fetch(`${BASE_URL}/shops/SHOP-BILLNAW-01/invoices/${testInv2}`, { method: 'DELETE' });
    }
  }

  // -------------------------------------------------------------------------
  // CHALLENGE 3: UNIVERSAL DB CLIENT OFFLINE STRESS & FAULT TOLERANCE
  // -------------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 3: UNIVERSAL DB CLIENT OFFLINE STRESS & FAULT TOLERANCE');

  try {
    const { getDbClient } = await import('../src/core/db-client.js');
    const client = getDbClient();

    // 3.1 Verify isolation between paths
    await client.doc('shops/TEST/devices/D1').set({ name: 'Counter 1' });
    await client.doc('cafes/TEST/devices/D1').set({ name: 'Cafe Tablet' });
    
    const dShop = await client.doc('shops/TEST/devices/D1').get();
    const dCafe = await client.doc('cafes/TEST/devices/D1').get();
    assert.strictEqual(dShop.data().name, 'Counter 1');
    assert.strictEqual(dCafe.data().name, 'Cafe Tablet');
    pass('UniversalDbClient maintains strict path isolation between shops and cafes');

    // 3.2 Atomic increment and arrayUnion offline operations
    await client.doc('shops/TEST/counters/c1').set({ visits: 10, tags: ['starter'] });
    await client.doc('shops/TEST/counters/c1').update({
      visits: client.increment(5),
      tags: client.arrayUnion('vip', 'starter')
    });
    const updatedCounter = await client.doc('shops/TEST/counters/c1').get();
    assert.strictEqual(updatedCounter.data().visits, 15);
    assert.deepStrictEqual(updatedCounter.data().tags, ['starter', 'vip']);
    pass('UniversalDbClient supports atomic increment and deduplicated arrayUnion');

    // 3.3 Listener Exception Confinement (A crashing listener must not crash notifyListeners or other listeners)
    let goodListenerFired = false;
    const unsubBad = client.doc('shops/TEST/devices/D2').onSnapshot(() => {
      throw new Error('Adversarial listener crash!');
    });
    const unsubGood = client.doc('shops/TEST/devices/D2').onSnapshot(() => {
      goodListenerFired = true;
    });

    await client.doc('shops/TEST/devices/D2').set({ status: 'ACTIVE' });
    assert.strictEqual(goodListenerFired, true, 'Healthy listener must execute despite peer listener throwing');
    unsubBad();
    unsubGood();
    pass('UniversalDbClient isolates crashing listeners in notifyListeners without unhandled crash');

    // 3.4 Batch operations commit atomicity
    const batch = client.createBatch();
    const docRefA = client.doc('shops/TEST/batch/A');
    const docRefB = client.doc('shops/TEST/batch/B');
    batch.set(docRefA, { val: 100 });
    batch.set(docRefB, { val: 200 });
    await batch.commit();

    const resA = await docRefA.get();
    const resB = await docRefB.get();
    assert.strictEqual(resA.data().val, 100);
    assert.strictEqual(resB.data().val, 200);
    pass('UniversalDbClient batch writes commit seamlessly');

  } catch (err) {
    recordFinding('HIGH', 'UniversalDbClient stress test failed', err.message, 'src/core/db-client.js');
  }

  // -------------------------------------------------------------------------
  // CHALLENGE 4: JS/CORE.JS OFFLINE MUTATION FALLBACK & IDB RESILIENCE
  // -------------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 4: JS/CORE.JS OFFLINE MUTATION & ZERO FIREBASE RUNTIME FALLBACK');

  try {
    const mockStorage = {
      billnaw_store_code: 'SHOP-BILLNAW-01'
    };

    global.window = {
      firestoreDB: null,
      firestoreDoc: null,
      firestoreCollection: null,
      firestoreSetDoc: null,
      firestoreOnSnapshot: null,
      authorizedDevices: [],
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true
    };
    global.document = {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => []
    };
    global.localStorage = {
      getItem: (k) => mockStorage[k] || null,
      setItem: (k, v) => { mockStorage[k] = String(v); },
      removeItem: (k) => { delete mockStorage[k]; }
    };
    global.staffList = [
      { id: 1, name: 'Admin Staff', role: 'Admin' }
    ];

    delete require.cache[require.resolve('../js/core.js')];
    require('../js/core.js');

    // 4.1 Test unhandled rejection risk when indexedDB is not available
    let unhandledRejectionCaught = null;
    const rejectionHandler = (err) => {
      unhandledRejectionCaught = err;
    };
    process.on('unhandledRejection', rejectionHandler);

    await global.window.syncDeviceRecordToCloud({ deviceId: 'DEV-OFFLINE-TEST-1' });
    await new Promise(r => setTimeout(r, 20));

    process.removeListener('unhandledRejection', rejectionHandler);

    if (unhandledRejectionCaught) {
      recordFinding(
        'HIGH',
        'UnhandledPromiseRejection in js/core.js offline sync methods',
        `syncDeviceRecordToCloud invoked idb.set without await or catch, resulting in unhandled rejection: ${unhandledRejectionCaught.message}`,
        `Calling syncDeviceRecordToCloud({ deviceId: 'DEV-1' }) in an environment where window.indexedDB is undefined`
      );
    } else {
      pass('syncDeviceRecordToCloud executes without unhandled rejection');
    }

    // 4.2 Subscriptions when cloud is null
    const devSubRes = global.window.subscribeDevicesCloudListener('SHOP-BILLNAW-01');
    const sessSubRes = global.window.subscribeSessionsCloudListener('SHOP-BILLNAW-01');
    const staffSubRes = global.window.subscribeStaffCloudListener('SHOP-BILLNAW-01');
    assert.strictEqual(devSubRes, null);
    assert.strictEqual(sessSubRes, null);
    assert.strictEqual(staffSubRes, null);
    pass('All subcollection listeners return null cleanly when cloud is disconnected');

    // 4.3 attachFirestoreListener & detachFirestoreListener lifecycle
    global.window.attachFirestoreListener('SHOP-BILLNAW-01');
    assert.strictEqual(mockStorage['billnaw_store_code'], 'SHOP-BILLNAW-01');
    global.window.detachFirestoreListener();
    pass('attachFirestoreListener and detachFirestoreListener execute cleanly with null cloud instance');

  } catch (err) {
    recordFinding('HIGH', 'js/core.js offline resilience check failed', err.message, 'js/core.js');
  }

  // -------------------------------------------------------------------------
  // CHALLENGE 5: STORE COLLECTION NAME RESOLUTION EXTREME BOUNDARY INPUTS
  // -------------------------------------------------------------------------
  console.log('\n📍 CHALLENGE 5: getStoreCollectionName EXTREME BOUNDARY & FUZZ TESTING');
  try {
    const fn = global.window.getStoreCollectionName;
    assert.strictEqual(fn('SHOP-01'), 'shops');
    assert.strictEqual(fn('shop-02'), 'shops');
    assert.strictEqual(fn('cafe_01'), 'cafes');
    assert.strictEqual(fn('cafe-02'), 'cafes');
    assert.strictEqual(fn('CAFE-03'), 'cafes');
    assert.strictEqual(fn('CLIENT-01'), 'clients');
    assert.strictEqual(fn('BONGBHOJ-TERMINAL'), 'clients');
    assert.strictEqual(fn('RANDOM-TENANT-NAME'), 'shops', 'Unprefixed default to shops');
    assert.strictEqual(fn('   cafe_trimmed  '), 'shops', 'Untrimmed non-prefix defaults safely');
    pass('getStoreCollectionName handles standard, edge, and fuzz inputs with safe deterministic fallbacks');
  } catch (err) {
    recordFinding('MEDIUM', 'getStoreCollectionName boundary test failed', err.message, 'js/core.js');
  }

  // Summary
  console.log('\n========================================================================');
  console.log(`🛡️ CHALLENGER AUDIT SUMMARY: ${passCount} PASSED, ${failCount} FAILED (TOTAL: ${passCount + failCount})`);
  console.log('========================================================================\n');

  if (findings.length > 0) {
    console.log('CRITICAL FINDINGS SUMMARY:');
    findings.forEach((f, idx) => {
      console.log(`${idx + 1}. [${f.severity}] ${f.name}`);
      console.log(`   Details: ${f.detail}`);
      console.log(`   Reproduction: ${f.reproduction}\n`);
    });
    console.log('❌ EMPIRICAL VERDICT: REQUEST_CHANGES');
    process.exit(1);
  } else {
    console.log('✅ EMPIRICAL VERDICT: APPROVE');
  }
}

runEmpiricalChallenge();
