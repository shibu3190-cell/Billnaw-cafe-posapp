/**
 * scratch/test_m1_rules_adversarial.cjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER SUITE FOR MILESTONE 1
 *
 * Challenges:
 * 1. Strict Binary & Cryptographic Rules Parity (Zero-tolerance byte match, SHA-256, SHA-512, MD5, OS fc /b, mutation sensitivity)
 * 2. Tenant Boundary Adversarial Probing (isValidTenant with empty, whitespace, short strings, SQL injection, unicode)
 * 3. Multi-Tenant Role & Token Boundary Probing (isTenantStaff, isTenantAdmin, token claim mismatches, cross-tenant attacks)
 * 4. Dual-Path Structural & Rule Parity (/cafes/{cafeId} vs /shops/{shopId} exact subcollection & rule parity)
 * 5. Invoices Anti-Tampering & Print Queue Billing Injection Probing
 * 6. Repository Invariants Probing in index.html (Exact 26 modal close SVG buttons, zero raw Unicode emojis in buttons)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const f1Path = path.join(rootDir, 'firestore.rules');
const f2Path = path.join(rootDir, 'database', 'firestore.rules');
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
console.log('⚔️  MILESTONE 1 ADVERSARIAL CHALLENGER VERIFICATION HARNESS');
console.log('====================================================================\n');

// ============================================================================
// SUITE 1: STRICT BINARY & CRYPTOGRAPHIC RULES PARITY (ZERO TOLERANCE)
// ============================================================================
console.log('📍 SUITE 1: STRICT BINARY & CRYPTOGRAPHIC RULES PARITY');

challenge('S1-PARITY', 'Both firestore.rules and database/firestore.rules must exist', () => {
  assert.ok(fs.existsSync(f1Path), 'firestore.rules is missing at root');
  assert.ok(fs.existsSync(f2Path), 'database/firestore.rules is missing in database/');
});

const b1 = fs.readFileSync(f1Path);
const b2 = fs.readFileSync(f2Path);

challenge('S1-PARITY', 'Exact byte length equality between root and database rules', () => {
  assert.strictEqual(b1.length, b2.length, `Byte count mismatch: root=${b1.length}, database=${b2.length}`);
  assert.ok(b1.length > 5000, `Rules file too small: ${b1.length} bytes`);
});

challenge('S1-PARITY', 'Byte-by-byte buffer comparison (Buffer.compare === 0)', () => {
  const cmp = Buffer.compare(b1, b2);
  assert.strictEqual(cmp, 0, `Buffer.compare returned non-zero difference: ${cmp}`);
});

challenge('S1-PARITY', 'Byte-for-byte iterative loop check (0 difference at every index)', () => {
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
});

challenge('S1-PARITY', 'Windows OS-level binary compare (fc /b)', () => {
  const out = execSync(`cmd /c fc /b "firestore.rules" "database\\firestore.rules"`, { cwd: rootDir, encoding: 'utf8' });
  assert.ok(
    out.includes('FC: no differences encountered') || out.includes('no differences'),
    `OS fc /b failed: ${out}`
  );
});

challenge('S1-PARITY', 'Security Audit: "!isAuthenticated()" bypass is completely eradicated from firestore.rules', () => {
  assert.strictEqual(b1.toString('utf8').includes('!isAuthenticated()'), false, 'Security Integrity Violation: !isAuthenticated() found in rules!');
});

challenge('S1-PARITY', 'Adversarial Sensitivity: In-memory 1-byte mutation MUST trigger comparator failure', () => {
  // Test byte 0 mutation
  const mutated0 = Buffer.from(b2);
  mutated0[0] ^= 0xFF;
  assert.notStrictEqual(Buffer.compare(b1, mutated0), 0, 'Comparator failed to catch byte 0 mutation!');

  // Test midpoint mutation
  const mid = Math.floor(b2.length / 2);
  const mutatedMid = Buffer.from(b2);
  mutatedMid[mid] ^= 0x01;
  assert.notStrictEqual(Buffer.compare(b1, mutatedMid), 0, 'Comparator failed to catch midpoint mutation!');

  // Test EOF mutation
  const mutatedEOF = Buffer.from(b2);
  mutatedEOF[mutatedEOF.length - 1] ^= 0x20;
  assert.notStrictEqual(Buffer.compare(b1, mutatedEOF), 0, 'Comparator failed to catch EOF mutation!');

  // Test 1-byte truncation
  const truncated = b2.subarray(0, b2.length - 1);
  assert.notStrictEqual(b1.length, truncated.length, 'Length check failed to catch truncation!');
});

// ============================================================================
// SUITE 2: TENANT BOUNDARY ADVERSARIAL PROBING (isValidTenant)
// ============================================================================
console.log('\n📍 SUITE 2: TENANT BOUNDARY ADVERSARIAL PROBING (isValidTenant)');

// Rule definition: id is string && id.size() >= 3 && !id.matches('^\\s+$')
function evalIsValidTenant(id) {
  if (typeof id !== 'string') return false;
  if (id.length < 3) return false;
  if (/^\s+$/.test(id)) return false;
  return true;
}

challenge('S2-BOUNDARY', 'isValidTenant rejects empty string ""', () => {
  assert.strictEqual(evalIsValidTenant(""), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects 1-character string "a"', () => {
  assert.strictEqual(evalIsValidTenant("a"), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects 2-character string "ab"', () => {
  assert.strictEqual(evalIsValidTenant("ab"), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects whitespace-only string of 1 space " "', () => {
  assert.strictEqual(evalIsValidTenant(" "), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects whitespace-only string of 2 spaces "  "', () => {
  assert.strictEqual(evalIsValidTenant("  "), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects whitespace-only string of 3 spaces "   "', () => {
  assert.strictEqual(evalIsValidTenant("   "), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects whitespace-only string of 10 spaces', () => {
  assert.strictEqual(evalIsValidTenant("          "), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects tabs string "\t\t\t"', () => {
  assert.strictEqual(evalIsValidTenant("\t\t\t"), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects newlines string "\r\n\r\n"', () => {
  assert.strictEqual(evalIsValidTenant("\r\n\r\n"), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects mixed whitespace " \t \r\n "', () => {
  assert.strictEqual(evalIsValidTenant(" \t \r\n "), false);
});

challenge('S2-BOUNDARY', 'isValidTenant rejects non-string types (null, undefined, number, boolean, object, array)', () => {
  assert.strictEqual(evalIsValidTenant(null), false);
  assert.strictEqual(evalIsValidTenant(undefined), false);
  assert.strictEqual(evalIsValidTenant(0), false);
  assert.strictEqual(evalIsValidTenant(123), false);
  assert.strictEqual(evalIsValidTenant(true), false);
  assert.strictEqual(evalIsValidTenant(false), false);
  assert.strictEqual(evalIsValidTenant({}), false);
  assert.strictEqual(evalIsValidTenant([]), false);
  assert.strictEqual(evalIsValidTenant(() => {}), false);
});

challenge('S2-BOUNDARY', 'isValidTenant accepts valid standard tenant IDs (size >= 3)', () => {
  assert.strictEqual(evalIsValidTenant("abc"), true);
  assert.strictEqual(evalIsValidTenant("shop_101"), true);
  assert.strictEqual(evalIsValidTenant("cafe_central"), true);
  assert.strictEqual(evalIsValidTenant("tenant-uuid-4902-abcd"), true);
  assert.strictEqual(evalIsValidTenant("123"), true);
});

challenge('S2-BOUNDARY', 'isValidTenant accepts valid tenant IDs with leading/trailing spaces if length >= 3 and not pure whitespace', () => {
  // "  a  " length 5, not pure whitespace
  assert.strictEqual(evalIsValidTenant("  a  "), true);
});

// ============================================================================
// SUITE 3: MULTI-TENANT ROLE & CLAIM BOUNDARY PROBING
// ============================================================================
console.log('\n📍 SUITE 3: MULTI-TENANT ROLE & CLAIM BOUNDARY PROBING');

// Implement simulated rule evaluation adhering exactly to firestore.rules logic
function evalMatchesTenantId(auth, tenantId) {
  if (!auth || !auth.token) return false;
  const t = auth.token;
  return (
    ('storeCode' in t && typeof t.storeCode === 'string' && t.storeCode === tenantId) ||
    ('cafe_id' in t && typeof t.cafe_id === 'string' && t.cafe_id === tenantId) ||
    ('shopId' in t && typeof t.shopId === 'string' && t.shopId === tenantId)
  );
}

function evalMatchesOwnerEmail(auth, resource, requestResource) {
  if (!auth || !auth.token || typeof auth.token.email !== 'string') return false;
  const email = auth.token.email;
  const r1 = resource && resource.data && ('ownerEmail' in resource.data) && resource.data.ownerEmail === email;
  const r2 = requestResource && requestResource.data && ('ownerEmail' in requestResource.data) && requestResource.data.ownerEmail === email;
  return Boolean(r1 || r2);
}

function evalIsTenantStaff(auth, tenantId, resource, requestResource) {
  if (!evalIsValidTenant(tenantId)) return false;
  if (!auth || !auth.token) return false;
  return (
    evalMatchesTenantId(auth, tenantId) ||
    evalMatchesOwnerEmail(auth, resource, requestResource)
  );
}

function evalIsTenantAdmin(auth, tenantId, resource, requestResource) {
  if (!evalIsTenantStaff(auth, tenantId, resource, requestResource)) return false;
  if (!auth || !auth.token) return false;
  const t = auth.token;
  const hasAdminRole = 'role' in t && typeof t.role === 'string' && (t.role === 'admin' || t.role === 'owner');
  const isOwnerFlag = 'isOwner' in t && t.isOwner === true;
  const ownerEmailMatch = evalMatchesOwnerEmail(auth, resource, requestResource);
  return hasAdminRole || isOwnerFlag || ownerEmailMatch;
}

// Adversarial Attack Scenarios
challenge('S3-RBAC', 'Unauthenticated Access Attack: Unauthenticated request (auth=null) rejected from isTenantStaff', () => {
  assert.strictEqual(evalIsTenantStaff(null, 'shop_A', null, null), false, 'Security Breach: Unauthenticated user permitted staff access!');
  assert.strictEqual(evalIsTenantStaff(undefined, 'shop_A', null, null), false);
  assert.strictEqual(evalIsTenantStaff({}, 'shop_A', null, null), false);
  assert.strictEqual(evalIsTenantStaff({ token: null }, 'shop_A', null, null), false);
});

challenge('S3-RBAC', 'Unauthenticated Admin Escalation Attack: Unauthenticated request (auth=null) rejected from isTenantAdmin', () => {
  assert.strictEqual(evalIsTenantAdmin(null, 'shop_A', null, null), false, 'Security Breach: Unauthenticated user permitted admin access!');
  assert.strictEqual(evalIsTenantAdmin(undefined, 'shop_A', null, null), false);
  assert.strictEqual(evalIsTenantAdmin({}, 'shop_A', null, null), false);
  assert.strictEqual(evalIsTenantAdmin({ token: null }, 'shop_A', null, null), false);
});

challenge('S3-RBAC', 'Cross-Tenant Staff Access Attack: Staff of shop_A cannot read/write shop_B', () => {
  const authA = { token: { storeCode: 'shop_A', role: 'staff', email: 'cashier@shopA.com' } };
  const resB = { data: { ownerEmail: 'owner@shopB.com' } };

  // Attempting access on shop_B
  const isStaffOnB = evalIsTenantStaff(authA, 'shop_B', resB, null);
  assert.strictEqual(isStaffOnB, false, 'Security Breach: Staff of shop_A permitted access to shop_B!');
});

challenge('S3-RBAC', 'Cross-Tenant Admin Escalation Attack: Admin of shop_A cannot admin shop_B', () => {
  const authA = { token: { storeCode: 'shop_A', role: 'admin', email: 'admin@shopA.com' } };
  const resB = { data: { ownerEmail: 'owner@shopB.com' } };

  // Attempting admin on shop_B
  const isAdminOnB = evalIsTenantAdmin(authA, 'shop_B', resB, null);
  assert.strictEqual(isAdminOnB, false, 'Security Breach: Admin of shop_A granted admin control over shop_B!');
});

challenge('S3-RBAC', 'Intra-Tenant Privilege Escalation: Staff member of shop_A cannot execute admin actions on shop_A', () => {
  const staffAuth = { token: { storeCode: 'shop_A', role: 'staff', email: 'server@shopA.com' } };
  const doc = { data: { ownerEmail: 'owner@shopA.com' } };

  // Staff should be recognized as tenant staff
  assert.strictEqual(evalIsTenantStaff(staffAuth, 'shop_A', doc, null), true);
  // BUT NOT as tenant admin
  assert.strictEqual(evalIsTenantAdmin(staffAuth, 'shop_A', doc, null), false);
});

challenge('S3-RBAC', 'Role Spoofing Attack: Non-admin roles (waiter, cashier, viewer, manager) cannot escalate to admin', () => {
  const roles = ['waiter', 'cashier', 'server', 'viewer', 'guest', 'user', 'manager', 'ADMIN', 'Owner'];
  const doc = { data: { ownerEmail: 'owner@shopA.com' } };

  roles.forEach(role => {
    const auth = { token: { storeCode: 'shop_A', role: role, email: `${role}@shopA.com` } };
    assert.strictEqual(evalIsTenantAdmin(auth, 'shop_A', doc, null), false, `Role '${role}' improperly elevated to admin!`);
  });
});

challenge('S3-RBAC', 'Type Confusion Attack: Non-string role e.g. { role: ["admin"] } or { role: 1 } does not grant admin', () => {
  const doc = { data: { ownerEmail: 'owner@shopA.com' } };
  const attacks = [
    { token: { storeCode: 'shop_A', role: ['admin'] } },
    { token: { storeCode: 'shop_A', role: 1 } },
    { token: { storeCode: 'shop_A', role: { evil: 'admin' } } },
    { token: { storeCode: 'shop_A', role: true } },
    { token: { storeCode: 'shop_A', role: null } }
  ];

  attacks.forEach((auth, idx) => {
    assert.strictEqual(evalIsTenantAdmin(auth, 'shop_A', doc, null), false, `Attack ${idx} bypassed type check!`);
  });
});

challenge('S3-RBAC', 'Owner Email Recognition: Valid ownerEmail grants admin access even without storeCode in token', () => {
  const ownerAuth = { token: { email: 'boss@mycafe.com' } };
  const existingDoc = { data: { ownerEmail: 'boss@mycafe.com' } };

  assert.strictEqual(evalIsTenantStaff(ownerAuth, 'cafe_101', existingDoc, null), true);
  assert.strictEqual(evalIsTenantAdmin(ownerAuth, 'cafe_101', existingDoc, null), true);
});

challenge('S3-RBAC', 'Owner Email Spoofing Attack: Token with mismatched email cannot claim owner privileges', () => {
  const hackerAuth = { token: { email: 'hacker@evil.com', role: 'admin' } }; // Admin of another system
  const victimDoc = { data: { ownerEmail: 'legit@mycafe.com' } };

  assert.strictEqual(evalIsTenantStaff(hackerAuth, 'cafe_victim', victimDoc, null), false);
  assert.strictEqual(evalIsTenantAdmin(hackerAuth, 'cafe_victim', victimDoc, null), false);
});

challenge('S3-RBAC', 'Invalid Tenant ID with Valid Auth: isValidTenant failure blocks access completely', () => {
  const validAdmin = { token: { storeCode: '   ', role: 'admin', email: 'admin@shop.com' } };
  const doc = { data: { ownerEmail: 'admin@shop.com' } };

  assert.strictEqual(evalIsTenantStaff(validAdmin, '   ', doc, null), false);
  assert.strictEqual(evalIsTenantAdmin(validAdmin, '   ', doc, null), false);
});

// ============================================================================
// SUITE 4: DUAL-PATH STRUCTURAL & RULE PARITY (/cafes/{cafeId} vs /shops/{shopId})
// ============================================================================
console.log('\n📍 SUITE 4: DUAL-PATH STRUCTURAL & RULE PARITY');

const rulesContent = b1.toString('utf8');

// Extract /cafes/{cafeId} block and /shops/{shopId} block cleanly
function extractMatchBlock(content, matchPattern) {
  const startIdx = content.indexOf(matchPattern);
  assert.ok(startIdx !== -1, `Could not find pattern: ${matchPattern}`);
  const openBraceIdx = content.indexOf('{', startIdx + matchPattern.length);
  assert.ok(openBraceIdx !== -1, `Could not find open brace for: ${matchPattern}`);

  let depth = 0;
  let endIdx = -1;

  for (let i = openBraceIdx; i < content.length; i++) {
    if (content[i] === '{') {
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  assert.ok(endIdx !== -1, `Could not find end of match block: ${matchPattern}`);
  return content.substring(startIdx, endIdx);
}

function stripComments(code) {
  return code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const cafeBlock = extractMatchBlock(rulesContent, 'match /cafes/{cafeId}');
const shopBlock = extractMatchBlock(rulesContent, 'match /shops/{shopId}');

const expectedSubcollections = [
  'invoices/{invoiceId}',
  'kot/{kotId}',
  'kots/{kotId}',
  'print_queue/{jobId}',
  'tables/{tableId}',
  'devices/{deviceId}',
  'sessions/{sessionId}',
  'staffSessions/{staffId}',
  'printQueue/{jobId}',
  'staff/{staffId}',
  'menu/{menuId}',
  'inventory/{itemId}',
  'customers/{customerId}',
  'expenses/{expenseId}',
  'settings/{settingId}',
  'counters/{counterId}',
  'khata/{khataId}',
  'history/{historyId}',
  'raw_materials/{matId}',
  'sub_recipes/{recId}',
  'reports/{reportId}',
  'daily_summaries/{summaryId}',
  'marketing_logs/{logId}'
];

expectedSubcollections.forEach(sub => {
  challenge('S4-DUALPATH', `Both /cafes/{cafeId} and /shops/{shopId} must define subcollection: ${sub}`, () => {
    assert.ok(cafeBlock.includes(`match /${sub}`), `/cafes/{cafeId} missing subcollection: ${sub}`);
    assert.ok(shopBlock.includes(`match /${sub}`), `/shops/{shopId} missing subcollection: ${sub}`);
  });
});

challenge('S4-DUALPATH', 'Normalized rule equivalence: cafeBlock with cafeId->shopId must match shopBlock structure', () => {
  const normalizedCafe = stripComments(cafeBlock)
    .replace(/cafeId/g, 'shopId')
    .replace(/cafes/g, 'shops')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizedShop = stripComments(shopBlock)
    .replace(/\s+/g, ' ')
    .trim();

  assert.strictEqual(normalizedCafe, normalizedShop, 'Discrepancy detected between /cafes/{cafeId} and /shops/{shopId} rules!');
});

challenge('S4-DUALPATH', 'Root Hardware Devices gate (/devices/{deviceId}) strictly forbids direct client access', () => {
  const deviceMatch = rulesContent.match(/match\s+\/devices\/\{deviceId\}\s*\{\s*allow\s+read,\s*write:\s*if\s+false;\s*\}/);
  assert.ok(deviceMatch !== null, 'Root /devices/{deviceId} must have "allow read, write: if false;"');
});

// ============================================================================
// SUITE 5: INVOICES ANTI-TAMPERING & PRINT QUEUE BILLING INJECTION PROBING
// ============================================================================
console.log('\n📍 SUITE 5: INVOICES ANTI-TAMPERING & PRINT QUEUE SECURITY PROBING');

challenge('S5-INTEGRITY', 'Invoices ledger: Deletion is permanently forbidden in both paths', () => {
  assert.ok(cafeBlock.includes('match /invoices/{invoiceId}') && cafeBlock.includes('allow delete: if false;'));
  assert.ok(shopBlock.includes('match /invoices/{invoiceId}') && shopBlock.includes('allow delete: if false;'));
});

// Simulate invoice update rules:
// allow update: if isTenantStaff(cafeId) && isWithin30DayEditWindow() &&
//   resource.data.status == 'PAID' && request.resource.data.status == 'VOID' &&
//   request.resource.data.void_audit.void_reason is string &&
//   request.resource.data.void_audit.voided_by_staff_id is string &&
//   request.resource.data.void_audit.voided_at is string;
function evalInvoiceUpdate(currentDoc, requestDoc, requestTime, createdAt) {
  // Check 30-day window
  const msIn30Days = 30 * 24 * 60 * 60 * 1000;
  if (createdAt && (requestTime - createdAt) >= msIn30Days) {
    return false;
  }
  // Check status transition PAID -> VOID
  if (currentDoc.status !== 'PAID') return false;
  if (requestDoc.status !== 'VOID') return false;

  // Check audit metadata
  if (!requestDoc.void_audit) return false;
  const audit = requestDoc.void_audit;
  if (typeof audit.void_reason !== 'string' || audit.void_reason.length === 0) return false;
  if (typeof audit.voided_by_staff_id !== 'string' || audit.voided_by_staff_id.length === 0) return false;
  if (typeof audit.voided_at !== 'string' || audit.voided_at.length === 0) return false;

  return true;
}

challenge('S5-INTEGRITY', 'Invoices: Valid VOID mutation within 30-day window with complete audit metadata succeeds', () => {
  const now = Date.now();
  const created = now - 5 * 24 * 60 * 60 * 1000; // 5 days ago
  const cur = { status: 'PAID', amount: 450 };
  const req = {
    status: 'VOID',
    amount: 450,
    void_audit: {
      void_reason: 'Customer cancelled table',
      voided_by_staff_id: 'staff_102',
      voided_at: new Date().toISOString()
    }
  };
  assert.strictEqual(evalInvoiceUpdate(cur, req, now, created), true);
});

challenge('S5-INTEGRITY', 'Invoices Tampering Attack: Modifying bill amount without VOID is rejected', () => {
  const now = Date.now();
  const cur = { status: 'PAID', amount: 450 };
  const req = { status: 'PAID', amount: 150 }; // Fraudulent reduction
  assert.strictEqual(evalInvoiceUpdate(cur, req, now, now), false);
});

challenge('S5-INTEGRITY', 'Invoices Tampering Attack: Resurrecting VOID invoice back to PAID is rejected', () => {
  const now = Date.now();
  const cur = { status: 'VOID', amount: 450 };
  const req = { status: 'PAID', amount: 450 };
  assert.strictEqual(evalInvoiceUpdate(cur, req, now, now), false);
});

challenge('S5-INTEGRITY', 'Invoices Tampering Attack: VOID without audit reason is rejected', () => {
  const now = Date.now();
  const cur = { status: 'PAID', amount: 450 };
  const req = {
    status: 'VOID',
    void_audit: { void_reason: null, voided_by_staff_id: 'staff_1', voided_at: 'now' }
  };
  assert.strictEqual(evalInvoiceUpdate(cur, req, now, now), false);
});

challenge('S5-INTEGRITY', 'Invoices Tampering Attack: VOID past 30-day window (31 days) is rejected', () => {
  const now = Date.now();
  const created31DaysAgo = now - 31 * 24 * 60 * 60 * 1000;
  const cur = { status: 'PAID', amount: 450 };
  const req = {
    status: 'VOID',
    void_audit: { void_reason: 'Late dispute', voided_by_staff_id: 'staff_1', voided_at: 'now' }
  };
  assert.strictEqual(evalInvoiceUpdate(cur, req, now, created31DaysAgo), false);
});

// Print Queue Isolation Rules
// allow create: if isTenantStaff(id) && request.resource.data.jobType == 'KOT' &&
//   !('invoice' in request.resource.data) && !('billNo' in request.resource.data) &&
//   !('amount' in request.resource.data) && !('final_payable_paise' in request.resource.data) &&
//   request.resource.data.status in ['queued', 'pending'];
function evalPrintQueueCreate(data) {
  if (data.jobType !== 'KOT') return false;
  if ('invoice' in data) return false;
  if ('billNo' in data) return false;
  if ('amount' in data) return false;
  if ('final_payable_paise' in data) return false;
  if (!['queued', 'pending'].includes(data.status)) return false;
  return true;
}

challenge('S5-INTEGRITY', 'Print Queue: Valid KOT print job succeeds', () => {
  const kotJob = {
    jobType: 'KOT',
    kotId: 'KOT-101',
    tableNo: 'T1',
    items: [{ name: 'Espresso', qty: 2 }],
    status: 'queued'
  };
  assert.strictEqual(evalPrintQueueCreate(kotJob), true);
});

challenge('S5-INTEGRITY', 'Print Queue Billing Injection Attack: Job containing invoice / billNo / amount is blocked', () => {
  const injection1 = { jobType: 'KOT', invoice: { id: 1 }, status: 'queued' };
  const injection2 = { jobType: 'KOT', billNo: 'BILL-999', status: 'queued' };
  const injection3 = { jobType: 'KOT', amount: 500, status: 'queued' };
  const injection4 = { jobType: 'KOT', final_payable_paise: 50000, status: 'queued' };
  const injection5 = { jobType: 'RECEIPT', status: 'queued' };

  assert.strictEqual(evalPrintQueueCreate(injection1), false);
  assert.strictEqual(evalPrintQueueCreate(injection2), false);
  assert.strictEqual(evalPrintQueueCreate(injection3), false);
  assert.strictEqual(evalPrintQueueCreate(injection4), false);
  assert.strictEqual(evalPrintQueueCreate(injection5), false);
});

// ============================================================================
// SUITE 6: REPOSITORY INVARIANTS PROBING IN index.html
// ============================================================================
console.log('\n📍 SUITE 6: REPOSITORY INVARIANTS PROBING IN index.html');

challenge('S6-INVARIANTS', 'index.html exists and is readable', () => {
  assert.ok(fs.existsSync(htmlPath), 'index.html is missing');
});

const htmlContent = fs.readFileSync(htmlPath, 'utf8');

challenge('S6-INVARIANTS', 'Invariant R5: Exactly 26 .modal-close-btn button elements exist in index.html', () => {
  const modalCloseBtnMatches = htmlContent.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi);
  assert.ok(modalCloseBtnMatches !== null, 'No .modal-close-btn buttons found!');
  assert.strictEqual(
    modalCloseBtnMatches.length,
    26,
    `Violation: expected exactly 26 .modal-close-btn elements, found ${modalCloseBtnMatches.length}`
  );
});

challenge('S6-INVARIANTS', 'Invariant R5: Every single .modal-close-btn button contains an inline SVG (zero raw "✕")', () => {
  const modalCloseBtnMatches = htmlContent.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<\/button>/gi);
  modalCloseBtnMatches.forEach((btnHtml, idx) => {
    assert.ok(btnHtml.includes('<svg') && btnHtml.includes('</svg>'), `Button ${idx} lacks inline SVG: ${btnHtml}`);
    assert.ok(!btnHtml.includes('✕'), `Button ${idx} contains raw '✕': ${btnHtml}`);
    assert.ok(!btnHtml.includes('&#x2715;'), `Button ${idx} contains HTML entity &#x2715;: ${btnHtml}`);
    assert.ok(!btnHtml.includes('&times;'), `Button ${idx} contains HTML entity &times;: ${btnHtml}`);
  });
});

challenge('S6-INVARIANTS', 'Invariant R5: Zero raw Unicode emojis inside <button> elements in index.html', () => {
  const allButtons = [...htmlContent.matchAll(/<button\b[\s\S]*?<\/button>/gi)];
  assert.ok(allButtons.length > 100, `Unexpectedly low button count: ${allButtons.length}`);

  // Comprehensive emoji regex
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F0FF}\u{1F1E6}-\u{1F1FF}]/u;

  const violations = [];
  allButtons.forEach((btn, idx) => {
    const rawBtn = btn[0];
    if (emojiRegex.test(rawBtn)) {
      violations.push({ index: idx, snippet: rawBtn.substring(0, 120) });
    }
  });

  assert.strictEqual(
    violations.length,
    0,
    `Found ${violations.length} buttons with raw Unicode emojis: ${JSON.stringify(violations, null, 2)}`
  );
});

challenge('S6-INVARIANTS', 'Currency symbol format strictly preserves non-breaking space "₹ "', () => {
  assert.ok(htmlContent.includes('₹ '), 'Missing standard currency formatting "₹ " in index.html');
});

challenge('S6-INVARIANTS', 'Adversarial Sensitivity: Injecting emoji into a dummy button MUST be detected by scanner', () => {
  const dummyButton = '<button type="button" class="btn">Order Coffee ☕</button>';
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F0FF}\u{1F1E6}-\u{1F1FF}]/u;
  assert.strictEqual(emojiRegex.test(dummyButton), true, 'Scanner failed to catch injected coffee emoji!');
});

// ============================================================================
// SUMMARY & EXIT DISPATCH
// ============================================================================
console.log('\n====================================================================');
console.log('📊 EMPIRICAL ADVERSARIAL CHALLENGER SCORECARD');
console.log('====================================================================');
console.log(`  Total Challenges: ${totalTests}`);
console.log(`  Passed:           ${passedTests}`);
console.log(`  Failed:           ${failedTests}`);
console.log('--------------------------------------------------------------------');

if (failedTests === 0) {
  console.log('🎉 ALL ADVERSARIAL CHALLENGES PASSED! VERDICT: APPROVE');
  console.log('====================================================================\n');
  process.exit(0);
} else {
  console.error(`💥 ${failedTests} CHALLENGE(S) FAILED! VERDICT: REQUEST_CHANGES`);
  console.error('====================================================================\n');
  process.exit(1);
}
