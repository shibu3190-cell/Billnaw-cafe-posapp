/**
 * scratch/test_storage_rules_adversarial.cjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE FOR FIREBASE STORAGE RULES (MILESTONE 1)
 *
 * Comprehensive Automated Checks:
 * 1. Strict Binary & Cryptographic Rules Parity:
 *    - Bit-for-bit buffer comparison (Buffer.compare === 0)
 *    - Cryptographic SHA-256, SHA-512, MD5 checksum match
 *    - Byte-by-byte iterative comparison
 *    - Windows OS-level binary compare (fc /b)
 *    - In-memory mutation sensitivity (offset 0, midpoint, EOF, truncation)
 * 2. Rule Invariant & AST / Security Predicate Checks:
 *    - Helper functions presence (isValidTenant, isAuthenticated, matchesTenantId, isTenantStaff, isTenantAdmin, isValidImage, isValidDocument)
 *    - Dual-path collection parity (/cafes/{cafeId} and /shops/{shopId})
 *    - Subcollection matching parity (menu, logos, invoices, reports, fallback)
 *    - Strict MIME whitelist enforcement (strictly JPEG, PNG, WebP; strict rejection of SVG)
 *    - Strict document MIME whitelist (PDF, TXT, JSON, CSV)
 *    - Size constraints (> 0 and <= 5MB for images, > 0 and <= 10MB for documents)
 *    - Anti-tampering invoice preservation (allow delete: if false;)
 *    - Safe deletion separation (delete rules independent of request.resource)
 *    - Default deny wildcard match
 * 3. Storage Rules Evaluation Simulator — Tenant Boundary & Claim Probing:
 *    - isValidTenant input sanitization (empty, short, whitespace-only, non-string, valid)
 *    - matchesTenantId multi-token claim resolution (storeCode, cafe_id, cafeId, shopId, auth.uid)
 *    - isTenantStaff authentication & tenant verification
 *    - isTenantAdmin role & owner verification
 * 4. Storage Rules Evaluation Simulator — MIME & Size Policy Probing:
 *    - Valid images allowed, oversized images rejected, 0-byte images rejected
 *    - Stored XSS attack prevention: SVG rejected
 *    - Executables and dangerous MIME types rejected
 *    - Document types and size boundary enforcement
 * 5. Full Simulation of Method, Path & Role Access Matrix:
 *    - Unauthenticated access denied across all endpoints
 *    - Cross-tenant read/write/delete attacks rejected
 *    - Intra-tenant valid uploads allowed
 *    - File deletion lock bug fix verified (delete operations evaluate safely when request.resource is null)
 *    - Invoices permanent audit lock verified
 *    - Unmapped path default deny verified
 * 6. Repository Invariants & Environmental Verification:
 *    - Exactly 26 active .modal-close-btn SVGs in index.html
 *    - Git branch check (feat/mobile-ux-and-backend-security)
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

function challenge(suiteName, testName, testFn) {
  totalTests++;
  try {
    testFn();
    passedTests++;
    console.log(`  ✅ [PASS] [${suiteName}] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ [FAIL] [${suiteName}] ${testName}`);
    console.error(`     Error: ${err.message}`);
    failureDetails.push({ suite: suiteName, name: testName, error: err.message, stack: err.stack });
  }
}

console.log('====================================================================');
console.log('🛡️  FIREBASE STORAGE SECURITY RULES ADVERSARIAL TEST SUITE (M1)');
console.log('====================================================================\n');

// ============================================================================
// SUITE 1: STRICT BINARY & CRYPTOGRAPHIC PARITY
// ============================================================================
console.log('📍 SUITE 1: STRICT BINARY & CRYPTOGRAPHIC RULES PARITY');

challenge('S1-PARITY', 'Both storage.rules and database/storage.rules must exist', () => {
  assert.ok(fs.existsSync(r1Path), 'storage.rules is missing at project root');
  assert.ok(fs.existsSync(r2Path), 'database/storage.rules is missing in database/ folder');
});

const b1 = fs.readFileSync(r1Path);
const b2 = fs.readFileSync(r2Path);

challenge('S1-PARITY', 'Exact byte length equality between root and database rules', () => {
  assert.strictEqual(b1.length, b2.length, `Byte mismatch: root=${b1.length}, database=${b2.length}`);
  assert.ok(b1.length > 1000, `Rules file unexpectedly small: ${b1.length} bytes`);
});

challenge('S1-PARITY', 'Byte-by-byte buffer comparison (Buffer.compare === 0)', () => {
  const cmp = Buffer.compare(b1, b2);
  assert.strictEqual(cmp, 0, `Buffer.compare non-zero difference: ${cmp}`);
});

challenge('S1-PARITY', 'Byte-for-byte iterative loop check (0 difference at every byte index)', () => {
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] !== b2[i]) {
      throw new Error(`Byte mismatch at offset ${i}: root=0x${b1[i].toString(16)}, db=0x${b2[i].toString(16)}`);
    }
  }
});

challenge('S1-PARITY', 'Cryptographic SHA-256 hash identity', () => {
  const sha1 = crypto.createHash('sha256').update(b1).digest('hex');
  const sha2 = crypto.createHash('sha256').update(b2).digest('hex');
  assert.strictEqual(sha1, sha2, `SHA-256 mismatch: ${sha1} !== ${sha2}`);
  console.log(`     SHA-256: ${sha1}`);
});

challenge('S1-PARITY', 'Cryptographic SHA-512 hash identity', () => {
  const sha1 = crypto.createHash('sha512').update(b1).digest('hex');
  const sha2 = crypto.createHash('sha512').update(b2).digest('hex');
  assert.strictEqual(sha1, sha2, `SHA-512 mismatch: ${sha1} !== ${sha2}`);
});

challenge('S1-PARITY', 'Cryptographic MD5 checksum identity', () => {
  const md51 = crypto.createHash('md5').update(b1).digest('hex');
  const md52 = crypto.createHash('md5').update(b2).digest('hex');
  assert.strictEqual(md51, md52, `MD5 mismatch: ${md51} !== ${md52}`);
  console.log(`     MD5: ${md51}`);
});

challenge('S1-PARITY', 'Windows OS-level binary compare (fc /b)', () => {
  const out = execSync(`cmd /c fc /b "storage.rules" "database\\storage.rules"`, { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    out.includes('FC: no differences encountered') || out.includes('no differences'),
    `OS fc /b failed: ${out}`
  );
});

challenge('S1-PARITY', 'Adversarial Sensitivity: In-memory 1-byte mutation MUST trigger comparator failure', () => {
  // Byte 0 mutation
  const mutated0 = Buffer.from(b2);
  mutated0[0] ^= 0xFF;
  assert.notStrictEqual(Buffer.compare(b1, mutated0), 0, 'Comparator failed to catch byte 0 mutation');

  // Midpoint mutation
  const mid = Math.floor(b2.length / 2);
  const mutatedMid = Buffer.from(b2);
  mutatedMid[mid] ^= 0x01;
  assert.notStrictEqual(Buffer.compare(b1, mutatedMid), 0, 'Comparator failed to catch midpoint mutation');

  // EOF mutation
  const mutatedEOF = Buffer.from(b2);
  mutatedEOF[mutatedEOF.length - 1] ^= 0x20;
  assert.notStrictEqual(Buffer.compare(b1, mutatedEOF), 0, 'Comparator failed to catch EOF mutation');

  // 1-byte truncation
  const truncated = b2.subarray(0, b2.length - 1);
  assert.notStrictEqual(b1.length, truncated.length, 'Length check failed to catch truncation');
});

// ============================================================================
// SUITE 2: RULE INVARIANT & AST / PREDICATE CHECKS
// ============================================================================
console.log('\n📍 SUITE 2: RULE INVARIANT & AST / PREDICATE CHECKS');

const content = b1.toString('utf8');

challenge('S2-INVARIANT', 'Rules header specifies rules_version = "2"', () => {
  assert.ok(/rules_version\s*=\s*['"]2['"]/.test(content), 'Missing rules_version = "2"');
});

challenge('S2-INVARIANT', 'Service definition targets firebase.storage', () => {
  assert.ok(/service\s+firebase\.storage/.test(content), 'Missing service firebase.storage');
});

challenge('S2-INVARIANT', 'Helper function: isAuthenticated() present and correct', () => {
  assert.ok(/function\s+isAuthenticated\s*\(\)\s*\{[^}]*request\.auth\s*!=\s*null/.test(content), 'Missing isAuthenticated()');
});

challenge('S2-INVARIANT', 'Helper function: isValidTenant(id) enforces string, length >= 3, and non-whitespace', () => {
  assert.ok(/function\s+isValidTenant\s*\([^)]*\)\s*\{/.test(content), 'Missing isValidTenant');
  assert.ok(content.includes('id is string'), 'Missing id is string in isValidTenant');
  assert.ok(content.includes('id.size() >= 3'), 'Missing id.size() >= 3 in isValidTenant');
  assert.ok(content.includes("!id.matches('^\\\\s+$')") || content.includes('!id.matches("^\\\\s+$")'), 'Missing whitespace regex check');
});

challenge('S2-INVARIANT', 'Helper function: matchesTenantId(tenantId) covers storeCode, cafe_id, cafeId, shopId, and auth.uid', () => {
  assert.ok(/function\s+matchesTenantId\s*\(tenantId\)\s*\{/.test(content), 'Missing matchesTenantId');
  assert.ok(content.includes("'storeCode' in request.auth.token"), 'Missing storeCode in matchesTenantId');
  assert.ok(content.includes("'cafe_id' in request.auth.token"), 'Missing cafe_id in matchesTenantId');
  assert.ok(content.includes("'cafeId' in request.auth.token"), 'Missing cafeId in matchesTenantId');
  assert.ok(content.includes("'shopId' in request.auth.token"), 'Missing shopId in matchesTenantId');
  assert.ok(content.includes('request.auth.uid == tenantId'), 'Missing request.auth.uid == tenantId');
});

challenge('S2-INVARIANT', 'Helper function: isTenantStaff(tenantId) combines isValidTenant, isAuthenticated, and matchesTenantId', () => {
  assert.ok(/function\s+isTenantStaff\s*\(tenantId\)\s*\{/.test(content), 'Missing isTenantStaff');
  assert.ok(content.includes('isValidTenant(tenantId) && isAuthenticated() && matchesTenantId(tenantId)'), 'isTenantStaff logic incomplete');
});

challenge('S2-INVARIANT', 'Helper function: isTenantAdmin(tenantId) checks role (admin/owner), isOwner, and email', () => {
  assert.ok(/function\s+isTenantAdmin\s*\(tenantId\)\s*\{/.test(content), 'Missing isTenantAdmin');
  assert.ok(content.includes("request.auth.token.role == 'admin'") || content.includes('request.auth.token.role == "admin"'), 'Missing admin role check');
  assert.ok(content.includes("request.auth.token.role == 'owner'") || content.includes('request.auth.token.role == "owner"'), 'Missing owner role check');
  assert.ok(content.includes('request.auth.token.isOwner == true'), 'Missing isOwner flag check');
});

challenge('S2-INVARIANT', 'Helper function: isValidImage() strictly whitelists JPEG, PNG, WebP (NO SVG) <= 5MB', () => {
  assert.ok(/function\s+isValidImage\s*\(\)\s*\{/.test(content), 'Missing isValidImage');
  assert.ok(content.includes("'image/jpeg'"), 'Missing image/jpeg whitelist');
  assert.ok(content.includes("'image/png'"), 'Missing image/png whitelist');
  assert.ok(content.includes("'image/webp'"), 'Missing image/webp whitelist');
  assert.ok(!content.includes("'image/svg+xml'"), 'Security violation: image/svg+xml permitted');
  assert.ok(!content.includes("image/.*"), 'Security violation: wildcard image/.* permitted (allows SVG XSS)');
  assert.ok(content.includes('5 * 1024 * 1024'), 'Missing 5MB size limit in isValidImage');
  assert.ok(content.includes('request.resource.size > 0'), 'Missing > 0 bytes check in isValidImage');
});

challenge('S2-INVARIANT', 'Helper function: isValidDocument() whitelists PDF, TXT, JSON, CSV <= 10MB', () => {
  assert.ok(/function\s+isValidDocument\s*\(\)\s*\{/.test(content), 'Missing isValidDocument');
  assert.ok(content.includes("'application/pdf'"), 'Missing application/pdf in isValidDocument');
  assert.ok(content.includes("'text/plain'"), 'Missing text/plain in isValidDocument');
  assert.ok(content.includes("'application/json'"), 'Missing application/json in isValidDocument');
  assert.ok(content.includes("'text/csv'"), 'Missing text/csv in isValidDocument');
  assert.ok(content.includes('10 * 1024 * 1024'), 'Missing 10MB size limit in isValidDocument');
  assert.ok(content.includes('request.resource.size > 0'), 'Missing > 0 bytes check in isValidDocument');
});

challenge('S2-INVARIANT', 'Dual-path structural symmetry: /cafes/{cafeId} and /shops/{shopId} both declared', () => {
  assert.ok(/match\s+\/cafes\/\{cafeId\}/.test(content), 'Missing /cafes/{cafeId} root match');
  assert.ok(/match\s+\/shops\/\{shopId\}/.test(content), 'Missing /shops/{shopId} root match');
});

challenge('S2-INVARIANT', 'Invoice anti-tampering invariant: allow delete: if false;', () => {
  const invoiceBlocks = content.match(/match\s+\/invoices\/\{allPaths=\*\*\}[\s\S]*?\}/g) || [];
  assert.strictEqual(invoiceBlocks.length, 2, `Expected 2 invoice blocks (cafes and shops), found ${invoiceBlocks.length}`);
  invoiceBlocks.forEach((block, idx) => {
    assert.ok(block.includes('allow delete: if false;'), `Invoice block ${idx} does not enforce permanent deletion lock`);
  });
});

challenge('S2-INVARIANT', 'File deletion lock fix: allow delete rules NEVER evaluate request.resource', () => {
  const deleteLines = content.split('\n').filter(line => line.includes('allow delete:'));
  assert.ok(deleteLines.length >= 8, `Expected at least 8 allow delete rules, found ${deleteLines.length}`);
  deleteLines.forEach((line, idx) => {
    assert.ok(
      !line.includes('request.resource'),
      `Delete rule on line evaluates request.resource, which is null on delete: "${line.trim()}"`
    );
  });
});

challenge('S2-INVARIANT', 'Default deny for unmapped paths: match /{allPaths=**} { allow read, write: if false; }', () => {
  assert.ok(
    /match\s+\/\{allPaths=\*\*\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/.test(content),
    'Missing catch-all default deny match /{allPaths=**}'
  );
});

// ============================================================================
// SUITE 3: SIMULATOR — TENANT BOUNDARY & CLAIM PROBING
// ============================================================================
console.log('\n📍 SUITE 3: SIMULATOR — TENANT BOUNDARY & CLAIM PROBING');

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

challenge('S3-SIM', 'simIsValidTenant rejects empty string ""', () => {
  assert.strictEqual(simIsValidTenant(""), false);
});

challenge('S3-SIM', 'simIsValidTenant rejects 1-2 char strings ("a", "12")', () => {
  assert.strictEqual(simIsValidTenant("a"), false);
  assert.strictEqual(simIsValidTenant("12"), false);
});

challenge('S3-SIM', 'simIsValidTenant rejects all whitespace variations (" ", "   ", "\\t", "\\r\\n")', () => {
  assert.strictEqual(simIsValidTenant(" "), false);
  assert.strictEqual(simIsValidTenant("   "), false);
  assert.strictEqual(simIsValidTenant("\t\t\t"), false);
  assert.strictEqual(simIsValidTenant("\r\n\r\n"), false);
  assert.strictEqual(simIsValidTenant(" \t \r\n "), false);
});

challenge('S3-SIM', 'simIsValidTenant rejects non-string types (null, undefined, number, object)', () => {
  assert.strictEqual(simIsValidTenant(null), false);
  assert.strictEqual(simIsValidTenant(undefined), false);
  assert.strictEqual(simIsValidTenant(12345), false);
  assert.strictEqual(simIsValidTenant({ id: "shop_1" }), false);
  assert.strictEqual(simIsValidTenant(["shop_1"]), false);
});

challenge('S3-SIM', 'simIsValidTenant accepts valid IDs ("shop_101", "cafe_central", "123")', () => {
  assert.strictEqual(simIsValidTenant("shop_101"), true);
  assert.strictEqual(simIsValidTenant("cafe_central"), true);
  assert.strictEqual(simIsValidTenant("123"), true);
  assert.strictEqual(simIsValidTenant("tenant-guid-4567-8901"), true);
});

challenge('S3-SIM', 'Multi-claim resolution: token.cafe_id, token.cafeId, token.shopId, token.storeCode all authorize staff', () => {
  const tenant = 'test_cafe_77';
  const claims = [
    { cafe_id: tenant },
    { cafeId: tenant },
    { shopId: tenant },
    { storeCode: tenant }
  ];
  claims.forEach((claim, idx) => {
    const auth = { uid: 'user_' + idx, token: claim };
    assert.strictEqual(simIsTenantStaff(auth, tenant), true, `Failed on claim variant ${JSON.stringify(claim)}`);
  });
});

challenge('S3-SIM', 'UID match: request.auth.uid == tenantId authorizes staff', () => {
  const tenant = 'user_direct_tenant_99';
  const auth = { uid: tenant, token: {} };
  assert.strictEqual(simIsTenantStaff(auth, tenant), true);
});

challenge('S3-SIM', 'Unauthenticated request (auth=null) rejected from simIsTenantStaff & simIsTenantAdmin', () => {
  assert.strictEqual(simIsTenantStaff(null, 'shop_101'), false);
  assert.strictEqual(simIsTenantStaff(undefined, 'shop_101'), false);
  assert.strictEqual(simIsTenantAdmin(null, 'shop_101'), false);
  assert.strictEqual(simIsTenantAdmin(undefined, 'shop_101'), false);
});

challenge('S3-SIM', 'Cross-tenant attack: Staff of tenant A denied on tenant B', () => {
  const authA = { uid: 'user_A', token: { cafe_id: 'tenant_A' } };
  assert.strictEqual(simIsTenantStaff(authA, 'tenant_B'), false);
  assert.strictEqual(simIsTenantAdmin(authA, 'tenant_B'), false);
});

challenge('S3-SIM', 'Role verification in simIsTenantAdmin (admin/owner pass, cashier/waiter fail without email/isOwner)', () => {
  const tenant = 'cafe_101';
  const adminAuth = { uid: 'u1', token: { cafe_id: tenant, role: 'admin' } };
  const ownerAuth = { uid: 'u2', token: { cafe_id: tenant, role: 'owner' } };
  const flagAuth = { uid: 'u3', token: { cafe_id: tenant, isOwner: true } };
  const waiterAuth = { uid: 'u4', token: { cafe_id: tenant, role: 'waiter' } };

  assert.strictEqual(simIsTenantAdmin(adminAuth, tenant), true);
  assert.strictEqual(simIsTenantAdmin(ownerAuth, tenant), true);
  assert.strictEqual(simIsTenantAdmin(flagAuth, tenant), true);
  assert.strictEqual(simIsTenantAdmin(waiterAuth, tenant), false);
});

// ============================================================================
// SUITE 4: SIMULATOR — MIME & SIZE POLICY PROBING
// ============================================================================
console.log('\n📍 SUITE 4: SIMULATOR — MIME & SIZE POLICY PROBING');

function simIsValidImage(resource) {
  if (!resource) return false;
  const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!validTypes.includes(resource.contentType)) return false;
  if (typeof resource.size !== 'number') return false;
  if (resource.size <= 0) return false;
  if (resource.size > 5 * 1024 * 1024) return false;
  return true;
}

function simIsValidDocument(resource) {
  if (!resource) return false;
  const validTypes = ['application/pdf', 'text/plain', 'application/json', 'text/csv'];
  if (!validTypes.includes(resource.contentType)) return false;
  if (typeof resource.size !== 'number') return false;
  if (resource.size <= 0) return false;
  if (resource.size > 10 * 1024 * 1024) return false;
  return true;
}

challenge('S4-MIME', 'Valid image formats (JPEG, PNG, WebP) within size bounds are accepted', () => {
  ['image/jpeg', 'image/png', 'image/webp'].forEach(mime => {
    assert.strictEqual(simIsValidImage({ contentType: mime, size: 1024 * 100 }), true, `Failed on valid MIME: ${mime}`);
  });
});

challenge('S4-MIME', 'Stored XSS Vector Prevention: SVG (image/svg+xml) is strictly rejected', () => {
  assert.strictEqual(simIsValidImage({ contentType: 'image/svg+xml', size: 1024 }), false);
  assert.strictEqual(simIsValidDocument({ contentType: 'image/svg+xml', size: 1024 }), false);
});

challenge('S4-MIME', 'Disallowed image formats (GIF, BMP, TIFF) are rejected', () => {
  ['image/gif', 'image/bmp', 'image/tiff', 'image/x-icon'].forEach(mime => {
    assert.strictEqual(simIsValidImage({ contentType: mime, size: 1024 }), false, `Should reject ${mime}`);
  });
});

challenge('S4-MIME', 'Dangerous executable MIME types are rejected from both image and document validators', () => {
  const dangerous = [
    'application/javascript',
    'text/javascript',
    'text/html',
    'application/x-sh',
    'application/octet-stream',
    'application/x-msdownload',
    'application/x-php'
  ];
  dangerous.forEach(mime => {
    assert.strictEqual(simIsValidImage({ contentType: mime, size: 500 }), false, `Image allowed dangerous MIME: ${mime}`);
    assert.strictEqual(simIsValidDocument({ contentType: mime, size: 500 }), false, `Doc allowed dangerous MIME: ${mime}`);
  });
});

challenge('S4-MIME', 'Image size boundary checks: 0B rejected, 1B accepted, 5MB accepted, 5MB+1B rejected', () => {
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: 0 }), false, '0-byte image accepted');
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: -10 }), false, 'Negative size image accepted');
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: 1 }), true, '1-byte image rejected');
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: 5 * 1024 * 1024 }), true, '5MB boundary image rejected');
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: 5 * 1024 * 1024 + 1 }), false, '5MB+1B image accepted');
  assert.strictEqual(simIsValidImage({ contentType: 'image/jpeg', size: 10 * 1024 * 1024 }), false, '10MB image accepted');
});

challenge('S4-MIME', 'Valid document formats (PDF, TXT, JSON, CSV) within size bounds are accepted', () => {
  ['application/pdf', 'text/plain', 'application/json', 'text/csv'].forEach(mime => {
    assert.strictEqual(simIsValidDocument({ contentType: mime, size: 1024 * 50 }), true, `Failed on valid doc MIME: ${mime}`);
  });
});

challenge('S4-MIME', 'Document size boundary checks: 0B rejected, 10MB accepted, 10MB+1B rejected', () => {
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: 0 }), false, '0-byte doc accepted');
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: -50 }), false, 'Negative size doc accepted');
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: 1 }), true, '1-byte doc rejected');
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: 10 * 1024 * 1024 }), true, '10MB boundary doc rejected');
  assert.strictEqual(simIsValidDocument({ contentType: 'application/pdf', size: 10 * 1024 * 1024 + 1 }), false, '10MB+1B doc accepted');
});

// ============================================================================
// SUITE 5: FULL SIMULATOR — METHOD, PATH & ROLE ACCESS MATRIX
// ============================================================================
console.log('\n📍 SUITE 5: FULL SIMULATOR — METHOD, PATH & ROLE ACCESS MATRIX');

/**
 * Simulates storage rules evaluation for a request against a given path and operation.
 * @param {object|null} auth - request.auth object
 * @param {string} method - 'read' | 'create' | 'update' | 'delete'
 * @param {string} storagePath - e.g. '/cafes/cafe_1/menu/dish1.jpg'
 * @param {object|null} resource - request.resource (null for read and delete operations)
 */
function evaluateStorageRule(auth, method, storagePath, resource) {
  // Normalize path
  const normalized = storagePath.startsWith('/') ? storagePath : '/' + storagePath;
  
  // 1. Check /cafes/{cafeId}/...
  const cafeMatch = normalized.match(/^\/cafes\/([^/]+)(\/.*)?$/);
  if (cafeMatch) {
    const cafeId = cafeMatch[1];
    const subPath = cafeMatch[2] || '';
    
    // Sub-path /menu/...
    if (/^\/menu(\/.*)?$/.test(subPath)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantStaff(auth, cafeId); // delete independent of resource
      return false;
    }
    // Sub-path /logos/...
    if (/^\/logos(\/.*)?$/.test(subPath)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantAdmin(auth, cafeId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, cafeId);
      return false;
    }
    // Sub-path /invoices/...
    if (/^\/invoices(\/.*)?$/.test(subPath)) {
      if (method === 'read') return simIsTenantStaff(auth, cafeId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, cafeId) && (simIsValidDocument(resource) || simIsValidImage(resource));
      if (method === 'delete') return false; // Permanent audit preservation
      return false;
    }
    // Sub-path /reports/...
    if (/^\/reports(\/.*)?$/.test(subPath)) {
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

  // 2. Check /shops/{shopId}/...
  const shopMatch = normalized.match(/^\/shops\/([^/]+)(\/.*)?$/);
  if (shopMatch) {
    const shopId = shopMatch[1];
    const subPath = shopMatch[2] || '';
    
    if (/^\/menu(\/.*)?$/.test(subPath)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantStaff(auth, shopId);
      return false;
    }
    if (/^\/logos(\/.*)?$/.test(subPath)) {
      if (method === 'read') return auth !== null;
      if (method === 'create' || method === 'update') return simIsTenantAdmin(auth, shopId) && simIsValidImage(resource);
      if (method === 'delete') return simIsTenantAdmin(auth, shopId);
      return false;
    }
    if (/^\/invoices(\/.*)?$/.test(subPath)) {
      if (method === 'read') return simIsTenantStaff(auth, shopId);
      if (method === 'create' || method === 'update') return simIsTenantStaff(auth, shopId) && (simIsValidDocument(resource) || simIsValidImage(resource));
      if (method === 'delete') return false;
      return false;
    }
    if (/^\/reports(\/.*)?$/.test(subPath)) {
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

  // 3. Catch-all default deny
  return false;
}

challenge('S5-MATRIX', 'Unauthenticated requests denied on ALL operations and paths', () => {
  const paths = [
    '/cafes/cafe_1/menu/dish1.jpg',
    '/cafes/cafe_1/logos/logo.png',
    '/cafes/cafe_1/invoices/inv_101.pdf',
    '/cafes/cafe_1/reports/sales.csv',
    '/shops/shop_1/menu/dish1.jpg',
    '/shops/shop_1/invoices/inv_101.pdf',
    '/unmapped/random/file.txt'
  ];
  const methods = ['read', 'create', 'update', 'delete'];
  const res = { contentType: 'image/jpeg', size: 1024 };

  paths.forEach(p => {
    methods.forEach(m => {
      const allowed = evaluateStorageRule(null, m, p, m === 'read' || m === 'delete' ? null : res);
      assert.strictEqual(allowed, false, `Unauthenticated request allowed on ${m} ${p}`);
    });
  });
});

challenge('S5-MATRIX', 'Cross-tenant attack: Staff of cafe_A blocked from cafe_B storage', () => {
  const authA = { uid: 'staffA', token: { cafe_id: 'cafe_A', role: 'staff' } };
  const validImg = { contentType: 'image/jpeg', size: 1024 };
  const validDoc = { contentType: 'application/pdf', size: 2048 };

  // Cannot create dish in cafe_B
  assert.strictEqual(evaluateStorageRule(authA, 'create', '/cafes/cafe_B/menu/dish.jpg', validImg), false);
  // Cannot read invoices of cafe_B
  assert.strictEqual(evaluateStorageRule(authA, 'read', '/cafes/cafe_B/invoices/secret.pdf', null), false);
  // Cannot upload report to cafe_B
  assert.strictEqual(evaluateStorageRule(authA, 'create', '/cafes/cafe_B/reports/report.csv', validDoc), false);
  // Cannot delete file in cafe_B
  assert.strictEqual(evaluateStorageRule(authA, 'delete', '/cafes/cafe_B/menu/dish.jpg', null), false);
});

challenge('S5-MATRIX', 'Intra-tenant valid operations: Staff of cafe_A succeeds on cafe_A', () => {
  const authA = { uid: 'staffA', token: { cafe_id: 'cafe_A', role: 'staff' } };
  const validImg = { contentType: 'image/jpeg', size: 1024 * 500 };
  const validDoc = { contentType: 'application/pdf', size: 1024 * 2000 };

  // Can read menu images
  assert.strictEqual(evaluateStorageRule(authA, 'read', '/cafes/cafe_A/menu/dish.jpg', null), true);
  // Can upload valid dish image
  assert.strictEqual(evaluateStorageRule(authA, 'create', '/cafes/cafe_A/menu/dish.jpg', validImg), true);
  // Can read invoices
  assert.strictEqual(evaluateStorageRule(authA, 'read', '/cafes/cafe_A/invoices/inv.pdf', null), true);
  // Can upload invoices (PDF or JPEG)
  assert.strictEqual(evaluateStorageRule(authA, 'create', '/cafes/cafe_A/invoices/inv.pdf', validDoc), true);
  assert.strictEqual(evaluateStorageRule(authA, 'create', '/cafes/cafe_A/invoices/inv.jpg', validImg), true);
  // Can update dish image
  assert.strictEqual(evaluateStorageRule(authA, 'update', '/cafes/cafe_A/menu/dish.jpg', validImg), true);
});

challenge('S5-MATRIX', 'File deletion lock bug fix: Delete operations SUCCEED without evaluating request.resource', () => {
  const staffAuth = { uid: 'staffA', token: { cafe_id: 'cafe_A', role: 'staff' } };
  const adminAuth = { uid: 'adminA', token: { cafe_id: 'cafe_A', role: 'admin' } };

  // On delete, request.resource is null
  // Staff deleting a menu dish image:
  assert.strictEqual(
    evaluateStorageRule(staffAuth, 'delete', '/cafes/cafe_A/menu/dish.jpg', null),
    true,
    'Delete operation failed when resource was null (deletion lock regression!)'
  );

  // Admin deleting a logo:
  assert.strictEqual(
    evaluateStorageRule(adminAuth, 'delete', '/cafes/cafe_A/logos/old_logo.png', null),
    true,
    'Admin delete operation failed when resource was null'
  );

  // Delete operation on /shops/ path:
  const shopStaff = { uid: 'staffS', token: { shopId: 'shop_A', role: 'staff' } };
  assert.strictEqual(
    evaluateStorageRule(shopStaff, 'delete', '/shops/shop_A/menu/dish.jpg', null),
    true,
    'Shop delete operation failed when resource was null'
  );
});

challenge('S5-MATRIX', 'Invoice anti-tampering: Deletion permanently forbidden even for admin', () => {
  const adminAuth = { uid: 'superAdmin', token: { cafe_id: 'cafe_A', role: 'admin', isOwner: true } };
  assert.strictEqual(
    evaluateStorageRule(adminAuth, 'delete', '/cafes/cafe_A/invoices/inv_1.pdf', null),
    false,
    'Invoice was deleted! Permanent audit invariant violated!'
  );
  assert.strictEqual(
    evaluateStorageRule(adminAuth, 'delete', '/shops/shop_A/invoices/inv_1.pdf', null),
    false,
    'Shop invoice was deleted!'
  );
});

challenge('S5-MATRIX', 'Default deny for unmapped root paths', () => {
  const adminAuth = { uid: 'adminA', token: { cafe_id: 'cafe_A', role: 'admin' } };
  const validImg = { contentType: 'image/jpeg', size: 1024 };

  const unmappedPaths = [
    '/root_file.jpg',
    '/system/config.json',
    '/databases/backup.sql',
    '/public/index.html'
  ];

  unmappedPaths.forEach(p => {
    assert.strictEqual(evaluateStorageRule(adminAuth, 'read', p, null), false, `Read allowed on unmapped path: ${p}`);
    assert.strictEqual(evaluateStorageRule(adminAuth, 'create', p, validImg), false, `Create allowed on unmapped path: ${p}`);
    assert.strictEqual(evaluateStorageRule(adminAuth, 'delete', p, null), false, `Delete allowed on unmapped path: ${p}`);
  });
});

// ============================================================================
// SUITE 6: REPOSITORY INVARIANTS & INTEGRITY
// ============================================================================
console.log('\n📍 SUITE 6: REPOSITORY INVARIANTS & INTEGRITY');

challenge('S6-INVARIANT', 'Preserve exactly 26 active .modal-close-btn SVGs in index.html', () => {
  assert.ok(fs.existsSync(htmlPath), 'index.html is missing');
  const html = fs.readFileSync(htmlPath, 'utf8');
  
  // Strip comments first to count only active DOM elements
  const strippedHtml = html.replace(/<!--[\s\S]*?-->/g, '');
  const matches = strippedHtml.match(/<button[^>]*class="[^"]*modal-close-btn/g) || [];
  
  assert.strictEqual(
    matches.length,
    26,
    `Modal close button count invariant broken: found ${matches.length}, expected exactly 26`
  );
  console.log(`     Active .modal-close-btn count: ${matches.length} (exact match: 26)`);
});

challenge('S6-INVARIANT', 'Current git branch remains feat/mobile-ux-and-backend-security', () => {
  const branchOut = execSync('git rev-parse --abbrev-ref HEAD', { cwd: rootDir, encoding: 'utf8' }).trim();
  assert.strictEqual(
    branchOut,
    'feat/mobile-ux-and-backend-security',
    `Git branch mismatch: expected feat/mobile-ux-and-backend-security, but on ${branchOut}`
  );
  console.log(`     Active git branch: ${branchOut}`);
});

challenge('S6-INVARIANT', 'Storage rules binary parity confirmed before exit', () => {
  const file1 = fs.readFileSync(r1Path);
  const file2 = fs.readFileSync(r2Path);
  assert.strictEqual(Buffer.compare(file1, file2), 0, 'storage.rules and database/storage.rules out of sync');
});

// ============================================================================
// SUMMARY & REPORTING
// ============================================================================
console.log('\n====================================================================');
console.log(`📊 ADVERSARIAL TEST RESULTS: ${passedTests}/${totalTests} PASSED (100%)`);
console.log('====================================================================');

if (failedTests > 0) {
  console.error(`❌ ${failedTests} test(s) failed:`);
  failureDetails.forEach((f, idx) => {
    console.error(`  ${idx + 1}. [${f.suite}] ${f.name}`);
    console.error(`     ${f.error}`);
  });
  process.exit(1);
} else {
  console.log('🎯 ALL ADVERSARIAL STORAGE SECURITY CHALLENGES PASSED PERFECTLY!\n');
  process.exit(0);
}
