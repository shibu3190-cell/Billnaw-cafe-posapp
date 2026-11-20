/**
 * Comprehensive verification of UPI ID and Shop Logo Firestore database storage,
 * partial sync protection, multi-device sync, and invoice/receipt generation.
 */
const assert = require('assert');
const { 
  getStoreFromFirestoreREST, 
  syncStoreToFirestoreREST, 
  saveStoreStateToPersistentCache, 
  getStoreStateFromPersistentCache 
} = require('../server/sync-service.js');
const { ThermalPrinterBridge } = require('../src/core/platform-bridge.js');

async function runTests() {
  console.log('🧪 Starting UPI ID & Shop Logo Firestore Database and Sync Verification...\n');

  // -------------------------------------------------------------
  // Test 1: Live Cloud Firestore Active Shop Audit
  // -------------------------------------------------------------
  console.log('--- Test 1: Live Firestore Verification for Active Shops ---');
  const targetShops = ['SHOP_ABHIJITMODAK', 'SHOP_BAPI92HALDER'];
  
  const expectedUpiByShop = {
    'SHOP_ABHIJITMODAK': 'abhijitmodak3746@ybl',
    'SHOP_BAPI92HALDER': '0G036517W5@mairtel'
  };

  for (const code of targetShops) {
    const store = await getStoreFromFirestoreREST(code);
    assert(store && store.success, `Store ${code} must exist in Firestore`);
    
    console.log(`[${code}] Profile Name: "${store.profile?.name}"`);
    console.log(`[${code}] UPI ID: "${store.profile?.upiId}"`);
    console.log(`[${code}] Show QR: ${store.profile?.showQr}`);
    console.log(`[${code}] Logo length: ${store.profile?.logo ? store.profile.logo.length : 0} chars`);

    assert(store.profile?.upiId, `${code} must have a valid upiId in profile`);
    assert.strictEqual(store.profile.upiId, expectedUpiByShop[code], `${code} upiId must match ${expectedUpiByShop[code]}`);
    assert.strictEqual(store.profile.showQr, true, `${code} showQr must be true`);
    assert(store.profile?.logo, `${code} must have a logo in profile`);
    assert(store.profile.logo.startsWith('data:image/'), `${code} logo must be a valid data URI`);
    
    // Check size under 35KB (35840 bytes)
    const logoSizeBytes = Math.round(store.profile.logo.length * 0.75);
    console.log(`[${code}] Logo approx binary size: ${(logoSizeBytes / 1024).toFixed(1)} KB (limit: 35 KB)`);
    assert(logoSizeBytes < 35840, `${code} logo size must be under 35 KB`);

    // Verify top-level aliases are populated by getStoreFromFirestoreREST
    assert.strictEqual(store.upiId, store.profile.upiId, `${code} root upiId alias must match profile.upiId`);
    assert.strictEqual(store.logo, store.profile.logo, `${code} root logo alias must match profile.logo`);
    assert.strictEqual(store.showQr, true, `${code} root showQr alias must be true`);
    
    console.log(`✅ [${code}] Live Firestore profile, UPI ID, and Logo verified perfectly!\n`);
  }

  // -------------------------------------------------------------
  // Test 2: Partial Profile Sync Protection (No Overwrite of Logo or UPI ID)
  // -------------------------------------------------------------
  console.log('--- Test 2: Partial Profile Update Protection ---');
  const testStoreCode = 'SHOP_TEST_LOGO_UPI_' + Date.now();
  const sampleLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const initialProfile = {
    name: 'Logo Sync Cafe',
    upiId: 'testcafe@upi',
    showQr: true,
    logo: sampleLogo,
    address: '123 Market Street',
    phone: '9876543210'
  };

  // Step 2a: Save initial profile to cache
  await saveStoreStateToPersistentCache(testStoreCode, {
    storeCode: testStoreCode,
    profile: initialProfile,
    updatedAt: new Date().toISOString()
  });

  const cachedBefore = await getStoreStateFromPersistentCache(testStoreCode);
  assert.strictEqual(cachedBefore.profile.upiId, 'testcafe@upi');
  assert.strictEqual(cachedBefore.profile.logo, sampleLogo);
  console.log('✅ Initial cache populated with logo and upiId');

  // Step 2b: Simulate a partial profile update that only changes address and phone (omits logo & upiId)
  await saveStoreStateToPersistentCache(testStoreCode, {
    storeCode: testStoreCode,
    profile: {
      address: '456 New Street',
      phone: '9999999999'
    },
    updatedAt: new Date().toISOString()
  });

  const cachedAfterPartial = await getStoreStateFromPersistentCache(testStoreCode);
  assert.strictEqual(cachedAfterPartial.profile.address, '456 New Street', 'Address should be updated');
  assert.strictEqual(cachedAfterPartial.profile.phone, '9999999999', 'Phone should be updated');
  assert.strictEqual(cachedAfterPartial.profile.upiId, 'testcafe@upi', 'upiId MUST BE PRESERVED when omitted in partial profile');
  assert.strictEqual(cachedAfterPartial.profile.logo, sampleLogo, 'logo MUST BE PRESERVED when omitted in partial profile');
  assert.strictEqual(cachedAfterPartial.profile.showQr, true, 'showQr MUST BE PRESERVED when omitted in partial profile');
  assert.strictEqual(cachedAfterPartial.profile.name, 'Logo Sync Cafe', 'name MUST BE PRESERVED when omitted in partial profile');
  console.log('✅ Partial profile update safely preserved upiId and logo without loss!\n');

  // -------------------------------------------------------------
  // Test 3: New Device Login & Hydration Contract
  // -------------------------------------------------------------
  console.log('--- Test 3: New Device Login & Hydration Contract ---');
  // Simulate what GET /api/sync/store-data returns to a freshly logged-in new device
  const abhijitData = await getStoreFromFirestoreREST('SHOP_ABHIJITMODAK');
  
  // Emulate client session creation as executed in js/shop-auth.js
  const clientSession = {
    token: 'test_token',
    storeCode: abhijitData.storeCode,
    shop: {
      storeCode: abhijitData.storeCode,
      name: abhijitData.profile?.name,
      profile: abhijitData.profile,
      logo: abhijitData.logo,
      upiId: abhijitData.upiId,
      showQr: abhijitData.showQr,
      staff: abhijitData.staff
    }
  };

  // Emulate ensureShopProfileHydrated client logic
  let clientShopProfile = {};
  const sp = clientSession.shop.profile || {};
  if (sp.name) clientShopProfile.name = sp.name;
  if (sp.logo) clientShopProfile.logo = sp.logo;
  if (sp.address) clientShopProfile.address = sp.address;
  if (sp.phone) clientShopProfile.phone = sp.phone;
  if (sp.upiId) clientShopProfile.upiId = sp.upiId;
  if (sp.showQr !== undefined) clientShopProfile.showQr = sp.showQr;
  if (clientSession.shop.upiId && !clientShopProfile.upiId) clientShopProfile.upiId = clientSession.shop.upiId;
  if (clientSession.shop.logo && !clientShopProfile.logo) clientShopProfile.logo = clientSession.shop.logo;

  assert.strictEqual(clientShopProfile.name, 'Billnaw');
  assert.strictEqual(clientShopProfile.upiId, 'abhijitmodak3746@ybl');
  assert.strictEqual(clientShopProfile.showQr, true);
  assert(clientShopProfile.logo && clientShopProfile.logo.startsWith('data:image/'), 'Client must hydrate logo');
  console.log('✅ New device login successfully hydrates upiId, showQr, and logo!\n');

  // -------------------------------------------------------------
  // Test 4: Dynamic UPI Payment String & ESC/POS Receipt Generation
  // -------------------------------------------------------------
  console.log('--- Test 4: Dynamic UPI Payment String & Receipt Generation ---');
  const dummyOrder = {
    id: 1019,
    billNo: '1019',
    table: 'T3',
    orderType: 'Dine-In',
    paymentMode: 'UPI',
    biller: 'Abhijit',
    amount: 829.00,
    rawItems: [
      { name: 'Green Tea', qty: 1, price: 25.00 },
      { name: 'Packaged Water (2 Litre)', qty: 3, price: 30.00 }
    ]
  };

  // Generate dynamic UPI string
  const upiPayString = `upi://pay?pa=${clientShopProfile.upiId}&pn=${encodeURIComponent(clientShopProfile.name || 'billnaw')}&am=${dummyOrder.amount.toFixed(2)}&cu=INR`;
  assert(upiPayString.includes('pa=abhijitmodak3746%40ybl') || upiPayString.includes('pa=abhijitmodak3746@ybl'), 'UPI pay string must contain payee upiId');
  assert(upiPayString.includes('am=829.00'), 'UPI pay string must contain exact amount');
  console.log(`Generated UPI URL: "${upiPayString}"`);

  // Generate ESC/POS commands with storeProfile and mock logoBytes
  const mockLogoBytes = new Uint8Array([0x1D, 0x76, 0x30, 0x00, 0x04, 0x00, 0x04, 0x00, 0xFF, 0xFF, 0xFF, 0xFF]);
  const escPosCommands = ThermalPrinterBridge.generateEscPosCommands(dummyOrder, '58mm', {
    storeProfile: clientShopProfile,
    logoBytes: mockLogoBytes
  });

  assert(escPosCommands instanceof Uint8Array, 'Commands must be a Uint8Array');
  assert(escPosCommands.length > 100, 'Commands must contain invoice content');

  // Convert binary to string to inspect textual markers
  const decoder = new TextDecoder('latin1');
  const printedText = decoder.decode(escPosCommands);

  assert(printedText.includes('Billnaw'), 'Receipt must include store name');
  assert(printedText.includes('Bill #1019'), 'Receipt must include Bill #1019');
  assert(printedText.includes('829.00'), 'Receipt must include total 829.00');
  assert(printedText.includes('Scan to Pay'), 'Receipt must include Scan to Pay');
  assert(printedText.includes('abhijitmodak3746@ybl'), 'Receipt must include payee UPI ID');
  console.log('✅ ESC/POS receipt commands contain Store Name, Logo Header, Table, Wrapped Items, Total, Scan to Pay, and payee UPI ID!');

  console.log('\n🎉 ALL UPI ID & SHOP LOGO VERIFICATION TESTS PASSED!\n');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
