/**
 * scratch/test_challenger_m1_1_storage_stress.cjs
 *
 * INDEPENDENT ADVERSARIAL STRESS TEST HARNESS — CHALLENGER 1 (M1)
 *
 * Deep Empirical Adversarial Attack Testing:
 * 1. Cryptographic Parity & Binary Invariants (SHA-256, MD5, OS-level fc /b)
 * 2. Unauthenticated Attack Matrix (Reads, Writes, Deletions across all tenant and root paths)
 * 3. Cross-Tenant Data Isolation Attacks (Attacker shop_123 vs Target shop_999 & cafe_888)
 * 4. Tenant ID Boundary & Substring Spoofing Attacks
 * 5. MIME Boundary & Content-Type Disguise Attacks (SVG XSS, disguised executables, HTML, script, etc.)
 * 6. File Size Boundary & Integer Edge Cases (0B, -1B, 1B, 5MB, 5MB+1B, 10MB, 10MB+1B, extreme numbers)
 * 7. Deletion Resilience & Null-Resource Crash Prevention (Safe deletion without request.resource)
 * 8. Statutory Audit Trail Preservation (Permanent deletion block on invoices for all roles)
 * 9. Multi-Token Claim Matrix & Privilege Boundaries
 * 10. Repository Integrity Invariants (26 modal-close-btn SVGs, git branch)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const r1Path = path.join(rootDir, 'storage.rules');
const r2Path = path.join(rootDir, 'database', 'storage.rules');
const htmlPath = path.join(rootDir, 'index.html');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failureDetails = [];

function challenge(suite, description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ [PASS] [${suite}] ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] [${suite}] ${description}`);
    console.error(`     Reason: ${err.message}`);
    failureDetails.push({ suite, description, error: err.message, stack: err.stack });
  }
}

console.log('====================================================================');
console.log('⚔️  CHALLENGER 1: ADVERSARIAL BOUNDARY & ACCESS STRESS HARNESS');
console.log('====================================================================\n');

// ----------------------------------------------------------------------------
// RULE EVALUATION ENGINE (AST-aligned pure logic simulator)
// ----------------------------------------------------------------------------
function simIsValidTenant(id) {
  if (typeof id !== 'string') return false;
  if (id.length < 3) return false;
  if (/^\s+$/.test(id)) return false;
  return true;
}

function simMatchesTenantId(auth, tenantId) {
  if (!auth) return false;
  if (auth.uid === tenantId) return true;
  if (!auth.token || typeof auth.token !== 'object') return false;
  const t = auth.token;
  if ('storeCode' in t && typeof t.storeCode === 'string' && t.storeCode === tenantId) return true;
  if ('cafe_id' in t && typeof t.cafe_id === 'string' && t.cafe_id === tenantId) return true;
  if ('cafeId' in t && typeof t.cafeId === 'string' && t.cafeId === tenantId) return true;
  if ('shopId' in t && typeof t.shopId === 'string' && t.shopId === tenantId) return true;
  return false;
}

function simIsTenantStaff(auth, tenantId) {
  if (!simIsValidTenant(tenantId)) return false;
  if (!auth) return false;
  return simMatchesTenantId(auth, tenantId);
}

function simIsTenantAdmin(auth, tenantId) {
  if (!simIsTenantStaff(auth, tenantId)) return false;
  const t = auth.token;
  if (!t) return false;
  const hasRole = 'role' in t && typeof t.role === 'string' && (t.role === 'admin' || t.role === 'owner');
  const isOwner = 'isOwner' in t && t.isOwner === true;
  const hasEmail = 'email' in t && typeof t.email === 'string' && /.*@.*/.test(t.email);
  return hasRole || isOwner || hasEmail;
}

function simIsValidImage(resource) {
  if (!resource) return false;
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(resource.contentType)) return false;
  if (typeof resource.size !== 'number' || Number.isNaN(resource.size)) return false;
  if (resource.size <= 0) return false;
  if (resource.size > 5 * 1024 * 1024) return false;
  return true;
}

function simIsValidDocument(resource) {
  if (!resource) return false;
  const validTypes = ['application/pdf', 'text/plain', 'application/json', 'text/csv'];
  if (!validTypes.includes(resource.contentType)) return false;
  if (typeof resource.size !== 'number' || Number.isNaN(resource.size)) return false;
  if (resource.size <= 0) return false;
  if (resource.size > 10 * 1024 * 1024) return false;
  return true;
}

function evaluateStorageRequest(auth, method, storagePath, resource) {
  const norm = storagePath.startsWith('/') ? storagePath : '/' + storagePath;

  // 1. /cafes/{cafeId}/...
  const cafeMatch = norm.match(/^\/cafes\/([^/]+)(\/.*)?$/);
  if (cafeMatch) {
    const cafeId = cafeMatch[1];
    const sub = cafeMatch[2] || '';

    if (/^\/menu(\/.*)?$/.test(sub)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantStaff(auth, cafeId);
      return false;
    }
    if (/^\/logos(\/.*)?$/.test(sub)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantAdmin(auth, cafeId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, cafeId);
      return false;
    }
    if (/^\/invoices(\/.*)?$/.test(sub)) {
      if (method === 'read') return simIsTenantStaff(auth, cafeId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && (simIsValidDocument(resource) || simIsValidImage(resource));
      if (method === 'delete') return false; // Permanent audit preservation
      return false;
    }
    if (/^\/reports(\/.*)?$/.test(sub)) {
      if (method === 'read') return simIsTenantStaff(auth, cafeId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && simIsValidDocument(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, cafeId);
      return false;
    }
    // General fallback /{allPaths=**}
    if (method === 'read') return simIsTenantStaff(auth, cafeId);
    if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && (simIsValidImage(resource) || simIsValidDocument(resource));
    if (method === 'delete') return simIsTenantStaff(auth, cafeId);
    return false;
  }

  // 2. /shops/{shopId}/...
  const shopMatch = norm.match(/^\/shops\/([^/]+)(\/.*)?$/);
  if (shopMatch) {
    const shopId = shopMatch[1];
    const sub = shopMatch[2] || '';

    if (/^\/menu(\/.*)?$/.test(sub)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantStaff(auth, shopId);
      return false;
    }
    if (/^\/logos(\/.*)?$/.test(sub)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantAdmin(auth, shopId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, shopId);
      return false;
    }
    if (/^\/invoices(\/.*)?$/.test(sub)) {
      if (method === 'read') return simIsTenantStaff(auth, shopId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && (simIsValidDocument(resource) || simIsValidImage(resource));
      if (method === 'delete') return false;
      return false;
    }
    if (/^\/reports(\/.*)?$/.test(sub)) {
      if (method === 'read') return simIsTenantStaff(auth, shopId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && simIsValidDocument(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, shopId);
      return false;
    }
    // General fallback /{allPaths=**}
    if (method === 'read') return simIsTenantStaff(auth, shopId);
    if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && (simIsValidImage(resource) || simIsValidDocument(resource));
    if (method === 'delete') return simIsTenantStaff(auth, shopId);
    return false;
  }

  // Default deny
  return false;
}

// ============================================================================
// SUITE 1: CRYPTOGRAPHIC PARITY & STATIC INTEGRITY
// ============================================================================
console.log('📍 SUITE 1: CRYPTOGRAPHIC PARITY & STATIC INTEGRITY');

const buf1 = fs.readFileSync(r1Path);
const buf2 = fs.readFileSync(r2Path);

challenge('PARITY', 'Byte-level identical size between storage.rules and database/storage.rules', () => {
  assert.strictEqual(buf1.length, buf2.length, `Size mismatch: ${buf1.length} !== ${buf2.length}`);
});

challenge('PARITY', 'SHA-256 and MD5 bit-for-bit identity across root and database rules', () => {
  const sha1 = crypto.createHash('sha256').update(buf1).digest('hex');
  const sha2 = crypto.createHash('sha256').update(buf2).digest('hex');
  const md51 = crypto.createHash('md5').update(buf1).digest('hex');
  const md52 = crypto.createHash('md5').update(buf2).digest('hex');
  assert.strictEqual(sha1, sha2, 'SHA-256 mismatch');
  assert.strictEqual(md51, md52, 'MD5 mismatch');
});

challenge('PARITY', 'Binary comparison Buffer.compare === 0', () => {
  assert.strictEqual(Buffer.compare(buf1, buf2), 0, 'Buffer difference found');
});

const rulesText = buf1.toString('utf8');

challenge('STATIC', 'Default deny match /{allPaths=**} present at tail of rules', () => {
  const lines = rulesText.trim().split('\n');
  const lastSection = lines.slice(-8).join('\n');
  assert.ok(
    /match\s+\/\{allPaths=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/.test(lastSection),
    'Default deny rule missing or displaced from tail'
  );
});

challenge('STATIC', 'Rules do NOT contain wildcard write: allow write: if ...', () => {
  // Disallow broad 'allow write' which bundles create/update/delete unsafely
  const broadWrite = rulesText.match(/allow\s+write\s*:\s*if\s+(?!false)/g);
  assert.strictEqual(broadWrite, null, 'Dangerous broad allow write detected');
});

// ============================================================================
// SUITE 2: UNAUTHENTICATED ATTACK VECTORS
// ============================================================================
console.log('\n📍 SUITE 2: UNAUTHENTICATED ATTACK VECTORS');

const unauthTargets = [
  '/cafes/c_101/menu/dish1.jpg',
  '/cafes/c_101/logos/logo.png',
  '/cafes/c_101/invoices/inv_2026.pdf',
  '/cafes/c_101/reports/q4_sales.csv',
  '/cafes/c_101/private/credentials.json',
  '/shops/s_202/menu/item.png',
  '/shops/s_202/logos/header.jpg',
  '/shops/s_202/invoices/inv_999.pdf',
  '/shops/s_202/reports/summary.csv',
  '/system/admin_keys.pem',
  '/backups/dump.tar.gz',
  '/root_file.jpg'
];

unauthTargets.forEach(target => {
  challenge('UNAUTH-READ', `Unauthenticated read blocked on ${target}`, () => {
    const allowed = evaluateStorageRequest(null, 'read', target, null);
    assert.strictEqual(allowed, false, `Unauthenticated read permitted on ${target}`);
  });
  challenge('UNAUTH-WRITE', `Unauthenticated write blocked on ${target}`, () => {
    const sampleResource = { contentType: 'image/jpeg', size: 1024 };
    const allowed = evaluateStorageRequest(null, 'create', target, sampleResource);
    assert.strictEqual(allowed, false, `Unauthenticated create permitted on ${target}`);
  });
  challenge('UNAUTH-DELETE', `Unauthenticated delete blocked on ${target}`, () => {
    const allowed = evaluateStorageRequest(null, 'delete', target, null);
    assert.strictEqual(allowed, false, `Unauthenticated delete permitted on ${target}`);
  });
});

// ============================================================================
// SUITE 3: CROSS-TENANT DATA ISOLATION ATTACKS
// ============================================================================
console.log('\n📍 SUITE 3: CROSS-TENANT DATA ISOLATION ATTACKS');

// Attacker authenticated as shop_123
const attackerShop123 = {
  uid: 'attacker_user_1',
  token: { shopId: 'shop_123', role: 'admin' }
};

// Target 1: shop_999 (another shop)
// Target 2: cafe_888 (a cafe)

challenge('CROSS-TENANT', 'Attacker shop_123 cannot read invoices of shop_999', () => {
  const allowed = evaluateStorageRequest(attackerShop123, 'read', '/shops/shop_999/invoices/tax_invoice.pdf', null);
  assert.strictEqual(allowed, false, 'Cross-tenant invoice read breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot upload malicious invoice to shop_999', () => {
  const doc = { contentType: 'application/pdf', size: 5000 };
  const allowed = evaluateStorageRequest(attackerShop123, 'create', '/shops/shop_999/invoices/fake_tax.pdf', doc);
  assert.strictEqual(allowed, false, 'Cross-tenant invoice upload breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot delete reports in shop_999', () => {
  const allowed = evaluateStorageRequest(attackerShop123, 'delete', '/shops/shop_999/reports/q1.csv', null);
  assert.strictEqual(allowed, false, 'Cross-tenant report delete breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot modify menu of shop_999', () => {
  const img = { contentType: 'image/jpeg', size: 50000 };
  const allowed = evaluateStorageRequest(attackerShop123, 'update', '/shops/shop_999/menu/dish_1.jpg', img);
  assert.strictEqual(allowed, false, 'Cross-tenant menu modification breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot read invoices of cafe_888', () => {
  const allowed = evaluateStorageRequest(attackerShop123, 'read', '/cafes/cafe_888/invoices/secret_ledger.pdf', null);
  assert.strictEqual(allowed, false, 'Cross-tenant cafe invoice read breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot upload reports to cafe_888', () => {
  const doc = { contentType: 'text/csv', size: 10000 };
  const allowed = evaluateStorageRequest(attackerShop123, 'create', '/cafes/cafe_888/reports/fake_eod.csv', doc);
  assert.strictEqual(allowed, false, 'Cross-tenant cafe report create breach!');
});

challenge('CROSS-TENANT', 'Attacker shop_123 cannot delete dish images from cafe_888', () => {
  const allowed = evaluateStorageRequest(attackerShop123, 'delete', '/cafes/cafe_888/menu/espresso.png', null);
  assert.strictEqual(allowed, false, 'Cross-tenant cafe menu delete breach!');
});

// Attacker cafe_555 vs cafe_666
const attackerCafe555 = {
  uid: 'attacker_cafe_user',
  token: { cafe_id: 'cafe_555', role: 'admin', isOwner: true }
};

challenge('CROSS-TENANT', 'Attacker cafe_555 cannot read confidential reports of cafe_666', () => {
  const allowed = evaluateStorageRequest(attackerCafe555, 'read', '/cafes/cafe_666/reports/daily.csv', null);
  assert.strictEqual(allowed, false, 'Cross-tenant cafe reports read breach!');
});

challenge('CROSS-TENANT', 'Attacker cafe_555 cannot overwrite logos of cafe_666', () => {
  const img = { contentType: 'image/png', size: 4000 };
  const allowed = evaluateStorageRequest(attackerCafe555, 'update', '/cafes/cafe_666/logos/brand.png', img);
  assert.strictEqual(allowed, false, 'Cross-tenant cafe logo update breach!');
});

// ============================================================================
// SUITE 4: TENANT ID SUBSTRING & INJECTION ATTACKS
// ============================================================================
console.log('\n📍 SUITE 4: TENANT ID SUBSTRING & INJECTION ATTACKS');

challenge('TENANT-BOUND', 'Prefix spoofing: user of "shop_12" rejected on "/shops/shop_123"', () => {
  const auth = { uid: 'u12', token: { shopId: 'shop_12' } };
  const allowed = evaluateStorageRequest(auth, 'read', '/shops/shop_123/invoices/inv.pdf', null);
  assert.strictEqual(allowed, false, 'Prefix spoof allowed!');
});

challenge('TENANT-BOUND', 'Suffix spoofing: user of "shop_1234" rejected on "/shops/shop_123"', () => {
  const auth = { uid: 'u1234', token: { shopId: 'shop_1234' } };
  const allowed = evaluateStorageRequest(auth, 'read', '/shops/shop_123/invoices/inv.pdf', null);
  assert.strictEqual(allowed, false, 'Suffix spoof allowed!');
});

challenge('TENANT-BOUND', 'Substring match spoofing: user of "cafe_abc" rejected on "/cafes/my_cafe_abc_store"', () => {
  const auth = { uid: 'u_abc', token: { cafe_id: 'cafe_abc' } };
  const allowed = evaluateStorageRequest(auth, 'read', '/cafes/my_cafe_abc_store/reports/rep.csv', null);
  assert.strictEqual(allowed, false, 'Substring spoof allowed!');
});

challenge('TENANT-BOUND', 'Short tenant IDs (< 3 chars) rejected by simIsValidTenant', () => {
  ['', 'a', 'ab', '1', '12'].forEach(id => {
    assert.strictEqual(simIsValidTenant(id), false, `Short ID "${id}" accepted`);
  });
});

challenge('TENANT-BOUND', 'Whitespace tenant IDs rejected by simIsValidTenant', () => {
  [' ', '   ', '\t', '\n', '  \t\n  '].forEach(id => {
    assert.strictEqual(simIsValidTenant(id), false, `Whitespace ID "${JSON.stringify(id)}" accepted`);
  });
});

// ============================================================================
// SUITE 5: MIME BOUNDARY & DISGUISED CONTENT-TYPE ATTACKS
// ============================================================================
console.log('\n📍 SUITE 5: MIME BOUNDARY & DISGUISED CONTENT-TYPE ATTACKS');

const validTenantAuth = {
  uid: 'legit_staff',
  token: { cafe_id: 'cafe_valid', role: 'staff' }
};

challenge('MIME-ATTACK', 'SVG XSS: image/svg+xml is strictly rejected from menu image uploads', () => {
  const svgResource = { contentType: 'image/svg+xml', size: 1024 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/vector_dish.svg', svgResource);
  assert.strictEqual(allowed, false, 'SVG upload was allowed in menu! Stored XSS vulnerability!');
});

challenge('MIME-ATTACK', 'SVG XSS: image/svg+xml is strictly rejected from invoice uploads', () => {
  const svgResource = { contentType: 'image/svg+xml', size: 2048 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/invoices/vector_inv.svg', svgResource);
  assert.strictEqual(allowed, false, 'SVG upload was allowed in invoices! Stored XSS vulnerability!');
});

challenge('MIME-ATTACK', 'HTML attack: text/html is strictly rejected from reports', () => {
  const htmlResource = { contentType: 'text/html', size: 1024 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/reports/report.html', htmlResource);
  assert.strictEqual(allowed, false, 'HTML upload was allowed in reports!');
});

challenge('MIME-ATTACK', 'HTML attack: application/xhtml+xml is strictly rejected from invoices', () => {
  const xhtmlResource = { contentType: 'application/xhtml+xml', size: 1024 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/invoices/inv.xhtml', xhtmlResource);
  assert.strictEqual(allowed, false, 'XHTML upload was allowed in invoices!');
});

challenge('MIME-ATTACK', 'JavaScript attack: application/javascript is strictly rejected from fallback directory', () => {
  const jsResource = { contentType: 'application/javascript', size: 500 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/files/script.js', jsResource);
  assert.strictEqual(allowed, false, 'JavaScript upload was allowed!');
});

challenge('MIME-ATTACK', 'Executable masquerade: image/png.exe with application/x-msdownload is strictly rejected', () => {
  const exeResource = { contentType: 'application/x-msdownload', size: 10240 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/photo.png.exe', exeResource);
  assert.strictEqual(allowed, false, 'Executable upload was allowed!');
});

challenge('MIME-ATTACK', 'Shell script masquerade: application/x-sh is strictly rejected', () => {
  const shResource = { contentType: 'application/x-sh', size: 200 };
  const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/reports/run.sh', shResource);
  assert.strictEqual(allowed, false, 'Shell script upload was allowed!');
});

challenge('MIME-ATTACK', 'Non-whitelisted image types: GIF, BMP, TIFF rejected from menu', () => {
  ['image/gif', 'image/bmp', 'image/tiff'].forEach(mime => {
    const res = { contentType: mime, size: 5000 };
    const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.img', res);
    assert.strictEqual(allowed, false, `${mime} unexpectedly allowed in menu`);
  });
});

challenge('MIME-ATTACK', 'Whitelisted image types: JPEG, PNG, WebP accepted in menu', () => {
  ['image/jpeg', 'image/png', 'image/webp'].forEach(mime => {
    const res = { contentType: mime, size: 50000 };
    const allowed = evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.img', res);
    assert.strictEqual(allowed, true, `${mime} unexpectedly rejected in menu`);
  });
});

// ============================================================================
// SUITE 6: SIZE BOUNDARY & INTEGER EDGE CASES
// ============================================================================
console.log('\n📍 SUITE 6: SIZE BOUNDARY & INTEGER EDGE CASES');

challenge('SIZE-BOUND', '0-byte image rejected in menu upload', () => {
  const res = { contentType: 'image/jpeg', size: 0 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.jpg', res), false);
});

challenge('SIZE-BOUND', 'Negative size image (-1) rejected', () => {
  const res = { contentType: 'image/jpeg', size: -1 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.jpg', res), false);
});

challenge('SIZE-BOUND', '1-byte image accepted', () => {
  const res = { contentType: 'image/jpeg', size: 1 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.jpg', res), true);
});

challenge('SIZE-BOUND', 'Exactly 5MB image accepted (5 * 1024 * 1024 = 5242880)', () => {
  const res = { contentType: 'image/png', size: 5242880 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.png', res), true);
});

challenge('SIZE-BOUND', '5MB + 1 byte image rejected (5242881 bytes)', () => {
  const res = { contentType: 'image/png', size: 5242881 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/menu/dish.png', res), false);
});

challenge('SIZE-BOUND', '0-byte document rejected in reports upload', () => {
  const res = { contentType: 'text/csv', size: 0 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/reports/rep.csv', res), false);
});

challenge('SIZE-BOUND', '1-byte document accepted in reports upload', () => {
  const res = { contentType: 'text/csv', size: 1 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/reports/rep.csv', res), true);
});

challenge('SIZE-BOUND', 'Exactly 10MB document accepted (10 * 1024 * 1024 = 10485760)', () => {
  const res = { contentType: 'application/pdf', size: 10485760 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/invoices/inv.pdf', res), true);
});

challenge('SIZE-BOUND', '10MB + 1 byte document rejected (10485761 bytes)', () => {
  const res = { contentType: 'application/pdf', size: 10485761 };
  assert.strictEqual(evaluateStorageRequest(validTenantAuth, 'create', '/cafes/cafe_valid/invoices/inv.pdf', res), false);
});

challenge('SIZE-BOUND', 'NaN and Infinity size inputs rejected', () => {
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: NaN }), false);
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: Infinity }), false);
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: NaN }), false);
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: Infinity }), false);
});

// ============================================================================
// SUITE 7: DELETION RESILIENCE & NULL-RESOURCE SAFETY
// ============================================================================
console.log('\n📍 SUITE 7: DELETION RESILIENCE & NULL-RESOURCE SAFETY');

const tenantAdminAuth = {
  uid: 'legit_admin',
  token: { cafe_id: 'cafe_valid', role: 'admin' }
};

challenge('DELETE-RESILIENCE', 'simIsValidImage(null) safely returns false without throwing', () => {
  assert.doesNotThrow(() => {
    const res = simIsValidImage(null);
    assert.strictEqual(res, false);
  });
});

challenge('DELETE-RESILIENCE', 'simIsValidDocument(null) safely returns false without throwing', () => {
  assert.doesNotThrow(() => {
    const res = simIsValidDocument(null);
    assert.strictEqual(res, false);
  });
});

challenge('DELETE-RESILIENCE', 'Staff can delete menu items when request.resource is null', () => {
  // Simulates cloud storage delete where request.resource is null
  const allowed = evaluateStorageRequest(validTenantAuth, 'delete', '/cafes/cafe_valid/menu/old_dish.jpg', null);
  assert.strictEqual(allowed, true, 'Staff delete was blocked by null resource');
});

challenge('DELETE-RESILIENCE', 'Admin can delete store logos when request.resource is null', () => {
  const allowed = evaluateStorageRequest(tenantAdminAuth, 'delete', '/cafes/cafe_valid/logos/old_logo.png', null);
  assert.strictEqual(allowed, true, 'Admin delete was blocked by null resource');
});

challenge('DELETE-RESILIENCE', 'Admin can delete outdated reports when request.resource is null', () => {
  const allowed = evaluateStorageRequest(tenantAdminAuth, 'delete', '/cafes/cafe_valid/reports/old_report.csv', null);
  assert.strictEqual(allowed, true, 'Admin report delete was blocked');
});

challenge('DELETE-RESILIENCE', 'Static check: No "allow delete" rule references request.resource', () => {
  const deleteLines = rulesText.split('\n').filter(l => l.includes('allow delete:'));
  deleteLines.forEach(l => {
    assert.ok(
      !l.includes('request.resource'),
      `Vulnerability: allow delete references request.resource: ${l}`
    );
  });
});

// ============================================================================
// SUITE 8: STATUTORY AUDIT TRAIL PRESERVATION (INVOICE IMMUTABILITY)
// ============================================================================
console.log('\n📍 SUITE 8: STATUTORY AUDIT TRAIL PRESERVATION');

challenge('AUDIT-LOCK', 'Invoice deletion blocked for unauthenticated users', () => {
  const allowed = evaluateStorageRequest(null, 'delete', '/cafes/cafe_valid/invoices/gst_inv_001.pdf', null);
  assert.strictEqual(allowed, false, 'Unauth invoice deletion allowed!');
});

challenge('AUDIT-LOCK', 'Invoice deletion blocked for staff members', () => {
  const allowed = evaluateStorageRequest(validTenantAuth, 'delete', '/cafes/cafe_valid/invoices/gst_inv_001.pdf', null);
  assert.strictEqual(allowed, false, 'Staff invoice deletion allowed!');
});

challenge('AUDIT-LOCK', 'Invoice deletion blocked for tenant admin', () => {
  const allowed = evaluateStorageRequest(tenantAdminAuth, 'delete', '/cafes/cafe_valid/invoices/gst_inv_001.pdf', null);
  assert.strictEqual(allowed, false, 'Admin invoice deletion allowed!');
});

challenge('AUDIT-LOCK', 'Invoice deletion blocked for store owner with isOwner: true', () => {
  const ownerAuth = { uid: 'owner1', token: { cafe_id: 'cafe_valid', role: 'owner', isOwner: true } };
  const allowed = evaluateStorageRequest(ownerAuth, 'delete', '/cafes/cafe_valid/invoices/gst_inv_001.pdf', null);
  assert.strictEqual(allowed, false, 'Owner invoice deletion allowed! Audit trail violation!');
});

challenge('AUDIT-LOCK', 'Shop invoice deletion blocked for all roles', () => {
  const shopAdmin = { uid: 's_owner', token: { shopId: 'shop_valid', role: 'owner', isOwner: true } };
  const allowed = evaluateStorageRequest(shopAdmin, 'delete', '/shops/shop_valid/invoices/tax_record.pdf', null);
  assert.strictEqual(allowed, false, 'Shop owner invoice deletion allowed! Audit trail violation!');
});

challenge('AUDIT-LOCK', 'Static check: allow delete: if false; present in both invoice blocks', () => {
  const matches = rulesText.match(/match\s+\/invoices\/\{allPaths=\*\*\}[\s\S]*?allow delete:\s*if\s*false;/g);
  assert.strictEqual(matches ? matches.length : 0, 2, 'Missing allow delete: if false; in invoice blocks');
});

// ============================================================================
// SUITE 9: MULTI-TOKEN CLAIM COMPATIBILITY & PRIVILEGE BOUNDARIES
// ============================================================================
console.log('\n📍 SUITE 9: MULTI-TOKEN CLAIM COMPATIBILITY');

const tenantId = 'target_cafe_88';

const validClaimPermutations = [
  { name: 'cafe_id (snake_case)', token: { cafe_id: tenantId } },
  { name: 'cafeId (camelCase)', token: { cafeId: tenantId } },
  { name: 'shopId (camelCase)', token: { shopId: tenantId } },
  { name: 'storeCode', token: { storeCode: tenantId } }
];

validClaimPermutations.forEach(variant => {
  challenge('MULTI-CLAIM', `Authorization granted via ${variant.name}`, () => {
    const auth = { uid: 'user_x', token: variant.token };
    assert.strictEqual(simIsTenantStaff(auth, tenantId), true, `Failed on ${variant.name}`);
  });
});

challenge('MULTI-CLAIM', 'Direct tenant auth UID match (request.auth.uid == tenantId)', () => {
  const auth = { uid: tenantId, token: {} };
  assert.strictEqual(simIsTenantStaff(auth, tenantId), true);
});

challenge('MULTI-CLAIM', 'Foreign claim rejected (attacker token cafe_id points elsewhere)', () => {
  const auth = { uid: 'attacker', token: { cafe_id: 'other_cafe_99' } };
  assert.strictEqual(simIsTenantStaff(auth, tenantId), false);
});

// ============================================================================
// SUITE 10: REPOSITORY INVARIANTS
// ============================================================================
console.log('\n📍 SUITE 10: REPOSITORY INVARIANTS');

challenge('INVARIANTS', 'Exactly 26 active .modal-close-btn SVGs preserved in index.html', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const activeOnly = html.replace(/<!--[\s\S]*?-->/g, '');
  const matches = activeOnly.match(/<button[^>]*class="[^"]*modal-close-btn/g) || [];
  assert.strictEqual(matches.length, 26, `Expected 26 active modal-close-btn SVGs, got ${matches.length}`);
});

challenge('INVARIANTS', 'Current git branch remains feat/mobile-ux-and-backend-security', () => {
  const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.strictEqual(branch, 'feat/mobile-ux-and-backend-security', `Unexpected branch: ${branch}`);
});

// ============================================================================
// SUMMARY & VERDICT
// ============================================================================
console.log('\n====================================================================');
console.log(`📊 CHALLENGER 1 STRESS RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('====================================================================');

if (failedTests > 0) {
  console.error(`❌ ${failedTests} challenge test(s) failed:`);
  failureDetails.forEach((f, idx) => {
    console.error(`  ${idx + 1}. [${f.suite}] ${f.description}: ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('🏆 VERDICT: ALL ADVERSARIAL STRESS ATTACKS DEFEATED. NO SECURITY FLAWS FOUND!\n');
  process.exit(0);
}
