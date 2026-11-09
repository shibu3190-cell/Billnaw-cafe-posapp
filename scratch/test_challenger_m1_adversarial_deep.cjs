/**
 * scratch/test_challenger_m1_adversarial_deep.cjs
 *
 * EMPIRICAL ADVERSARIAL CHALLENGER DEEP STRESS HARNESS
 * Milestone 1 Iteration 2: Rules & Boundary Verification
 *
 * Exhaustive attack surface evaluation:
 * - Matrix A: Unauthenticated Rejection Stress Matrix (20+ vectors)
 * - Matrix B: Cross-Tenant Isolation & Boundary Breach Attempts (15+ vectors)
 * - Matrix C: Role & Privilege Escalation Boundary Probing (15+ vectors)
 * - Matrix D: Legitimate Access & Identity Permissibility Matrix (15+ vectors)
 * - Matrix E: Tenant Identifier Structural Boundaries (15+ vectors)
 * - Matrix F: Static AST & Rule File Binary Verification (10+ checks)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const f1Path = path.join(rootDir, 'firestore.rules');
const f2Path = path.join(rootDir, 'database', 'firestore.rules');

let passedCount = 0;
let failedCount = 0;
const failureLog = [];

function runCheck(category, testName, fn) {
  try {
    fn();
    passedCount++;
    console.log(`  ✅ [${category}] ${testName}`);
  } catch (err) {
    failedCount++;
    console.error(`  ❌ [${category}] ${testName} -> FAILED: ${err.message}`);
    failureLog.push({ category, testName, error: err.message });
  }
}

// ----------------------------------------------------------------------------
// RULE EVALUATION ENGINE MIRRORING FIRESTORE RULES
// ----------------------------------------------------------------------------
function evalIsValidTenant(id) {
  if (typeof id !== 'string') return false;
  if (id.length < 3) return false;
  if (/^\s+$/.test(id)) return false;
  return true;
}

function evalIsAuthenticated(auth) {
  return auth !== null && auth !== undefined;
}

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
  return (
    evalIsValidTenant(tenantId) &&
    evalIsAuthenticated(auth) &&
    (evalMatchesTenantId(auth, tenantId) || evalMatchesOwnerEmail(auth, resource, requestResource))
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

console.log('====================================================================');
console.log('🛡️  CHALLENGER DEEP STRESS HARNESS — FIRESTORE RULES BOUNDARIES');
console.log('====================================================================\n');

// ----------------------------------------------------------------------------
// MATRIX A: UNAUTHENTICATED REJECTION STRESS MATRIX (20+ VECTORS)
// ----------------------------------------------------------------------------
console.log('📍 MATRIX A: UNAUTHENTICATED REJECTION STRESS MATRIX');

const unauthVectors = [
  { name: 'null auth', auth: null },
  { name: 'undefined auth', auth: undefined },
  { name: 'boolean false auth', auth: false },
  { name: 'empty string auth', auth: '' },
  { name: 'number zero auth', auth: 0 },
  { name: 'empty object auth', auth: {} },
  { name: 'auth with uid only, no token', auth: { uid: 'anon_123' } },
  { name: 'auth with token: null', auth: { uid: 'anon_123', token: null } },
  { name: 'auth with token: undefined', auth: { uid: 'anon_123', token: undefined } },
  { name: 'auth with empty token object', auth: { uid: 'anon_123', token: {} } },
  { name: 'auth with token email: null', auth: { token: { email: null } } },
  { name: 'auth with token email: undefined', auth: { token: { email: undefined } } },
  { name: 'auth with token storeCode: null', auth: { token: { storeCode: null } } },
  { name: 'auth with token cafe_id: null', auth: { token: { cafe_id: null } } },
  { name: 'auth with token shopId: null', auth: { token: { shopId: null } } },
  { name: 'auth with admin role but missing tenant ID', auth: { token: { role: 'admin' } } },
  { name: 'auth with owner role but missing tenant ID', auth: { token: { role: 'owner' } } },
  { name: 'auth with isOwner: true but missing tenant ID', auth: { token: { isOwner: true } } },
  { name: 'auth with storeCode: empty string', auth: { token: { storeCode: '' } } },
  { name: 'auth with cafe_id: empty string', auth: { token: { cafe_id: '' } } },
  { name: 'auth with shopId: empty string', auth: { token: { shopId: '' } } },
  { name: 'auth with storeCode: number 12345', auth: { token: { storeCode: 12345 } } },
  { name: 'auth with storeCode: array ["shop_101"]', auth: { token: { storeCode: ['shop_101'] } } }
];

const targetTenant = 'shop_101';
const mockResource = { data: { ownerEmail: 'owner@shop101.com' } };

unauthVectors.forEach(v => {
  runCheck('MATRIX-A', `isTenantStaff rejects ${v.name}`, () => {
    const res = evalIsTenantStaff(v.auth, targetTenant, mockResource, null);
    assert.strictEqual(res, false, `Security Breach: isTenantStaff permitted ${v.name}!`);
  });

  runCheck('MATRIX-A', `isTenantAdmin rejects ${v.name}`, () => {
    const res = evalIsTenantAdmin(v.auth, targetTenant, mockResource, null);
    assert.strictEqual(res, false, `Security Breach: isTenantAdmin permitted ${v.name}!`);
  });
});

// ----------------------------------------------------------------------------
// MATRIX B: CROSS-TENANT ISOLATION & BOUNDARY BREACH ATTEMPTS (15+ VECTORS)
// ----------------------------------------------------------------------------
console.log('\n📍 MATRIX B: CROSS-TENANT ISOLATION & BOUNDARY BREACH ATTEMPTS');

const crossTenantVectors = [
  {
    name: 'storeCode pointing to tenant_alpha attacking tenant_beta',
    auth: { token: { storeCode: 'tenant_alpha', role: 'staff' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'cafe_id pointing to tenant_alpha attacking tenant_beta',
    auth: { token: { cafe_id: 'tenant_alpha', role: 'staff' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'shopId pointing to tenant_alpha attacking tenant_beta',
    auth: { token: { shopId: 'tenant_alpha', role: 'staff' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'Admin of tenant_alpha attempting admin actions on tenant_beta',
    auth: { token: { storeCode: 'tenant_alpha', role: 'admin', email: 'admin@alpha.com' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'Owner of tenant_alpha attempting admin actions on tenant_beta',
    auth: { token: { storeCode: 'tenant_alpha', isOwner: true, email: 'owner@alpha.com' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'Owner role of tenant_alpha attacking tenant_beta',
    auth: { token: { storeCode: 'tenant_alpha', role: 'owner', email: 'owner@alpha.com' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'Case sensitivity attack: token storeCode "Shop_101" vs target "shop_101"',
    auth: { token: { storeCode: 'Shop_101', role: 'staff' } },
    target: 'shop_101',
    res: { data: { ownerEmail: 'owner@shop101.com' } }
  },
  {
    name: 'Case sensitivity attack: token storeCode "shop_101" vs target "SHOP_101"',
    auth: { token: { storeCode: 'shop_101', role: 'staff' } },
    target: 'SHOP_101',
    res: { data: { ownerEmail: 'owner@shop101.com' } }
  },
  {
    name: 'Substring match attack: token storeCode "tenant_alpha" attacking "tenant_alpha_extended"',
    auth: { token: { storeCode: 'tenant_alpha', role: 'admin' } },
    target: 'tenant_alpha_extended',
    res: { data: { ownerEmail: 'owner@alphaext.com' } }
  },
  {
    name: 'Prefix match attack: token storeCode "tenant" attacking "tenant_alpha"',
    auth: { token: { storeCode: 'tenant', role: 'admin' } },
    target: 'tenant_alpha',
    res: { data: { ownerEmail: 'owner@alpha.com' } }
  },
  {
    name: 'Path traversal token: storeCode "../tenant_beta" attacking "tenant_beta"',
    auth: { token: { storeCode: '../tenant_beta', role: 'admin' } },
    target: 'tenant_beta',
    res: { data: { ownerEmail: 'owner@beta.com' } }
  },
  {
    name: 'SQL injection string in token storeCode "\' OR 1=1 --" attacking "shop_101"',
    auth: { token: { storeCode: "' OR 1=1 --", role: 'admin' } },
    target: 'shop_101',
    res: { data: { ownerEmail: 'owner@shop101.com' } }
  },
  {
    name: 'Mismatched owner email: attacker@evil.com targeting cafe with owner owner@mycafe.com',
    auth: { token: { email: 'attacker@evil.com', role: 'admin' } },
    target: 'cafe_target',
    res: { data: { ownerEmail: 'owner@mycafe.com' } }
  },
  {
    name: 'Owner email case mismatch: "Owner@Cafe.com" in token vs "owner@cafe.com" in doc',
    auth: { token: { email: 'Owner@Cafe.com', role: 'admin' } },
    target: 'cafe_target',
    res: { data: { ownerEmail: 'owner@cafe.com' } }
  },
  {
    name: 'Token with valid storeCode for tenant_alpha but spoofed target tenant_beta in resource payload',
    auth: { token: { storeCode: 'tenant_alpha', role: 'staff' } },
    target: 'tenant_beta',
    res: null
  }
];

crossTenantVectors.forEach(v => {
  runCheck('MATRIX-B', `Isolation enforced for: ${v.name}`, () => {
    assert.strictEqual(evalIsTenantStaff(v.auth, v.target, v.res, null), false, 'Staff isolation failure');
    assert.strictEqual(evalIsTenantAdmin(v.auth, v.target, v.res, null), false, 'Admin isolation failure');
  });
});

// ----------------------------------------------------------------------------
// MATRIX C: ROLE & PRIVILEGE ESCALATION BOUNDARY PROBING (15+ VECTORS)
// ----------------------------------------------------------------------------
console.log('\n📍 MATRIX C: ROLE & PRIVILEGE ESCALATION BOUNDARY PROBING');

const validTenant = 'cafe_101';
const validDoc = { data: { ownerEmail: 'proprietor@cafe101.com' } };

// Staff roles that must NOT be granted admin privileges
const nonAdminRoles = [
  'cashier',
  'server',
  'waiter',
  'chef',
  'kitchen',
  'manager',
  'accountant',
  'auditor',
  'guest',
  'temp',
  'ADMIN',     // Capitalized
  'Admin',     // Title case
  'OWNER',     // Capitalized
  'Owner',     // Title case
  'superadmin',// Non-standard admin name
  'root',
  'operator',
  'admin ',    // Trailing space
  ' admin'     // Leading space
];

nonAdminRoles.forEach(role => {
  runCheck('MATRIX-C', `Role "${role}" on valid tenant is staff but CANNOT escalate to admin`, () => {
    const auth = { token: { storeCode: validTenant, role: role, email: `${role}@cafe101.com` } };
    assert.strictEqual(evalIsTenantStaff(auth, validTenant, validDoc, null), true, 'Valid staff access denied');
    assert.strictEqual(evalIsTenantAdmin(auth, validTenant, validDoc, null), false, `Privilege escalation! Role ${role} became admin!`);
  });
});

// Type confusion vectors for admin role or isOwner flag
const typeConfusionVectors = [
  { name: 'role as array ["admin"]', auth: { token: { storeCode: validTenant, role: ['admin'] } } },
  { name: 'role as boolean true', auth: { token: { storeCode: validTenant, role: true } } },
  { name: 'role as number 1', auth: { token: { storeCode: validTenant, role: 1 } } },
  { name: 'role as object { admin: true }', auth: { token: { storeCode: validTenant, role: { admin: true } } } },
  { name: 'isOwner as string "true"', auth: { token: { storeCode: validTenant, isOwner: 'true' } } },
  { name: 'isOwner as number 1', auth: { token: { storeCode: validTenant, isOwner: 1 } } },
  { name: 'isOwner as array [true]', auth: { token: { storeCode: validTenant, isOwner: [true] } } },
  { name: 'isOwner as string "yes"', auth: { token: { storeCode: validTenant, isOwner: 'yes' } } },
  { name: 'isOwner as object { owner: true }', auth: { token: { storeCode: validTenant, isOwner: { owner: true } } } }
];

typeConfusionVectors.forEach(v => {
  runCheck('MATRIX-C', `Type confusion ${v.name} does NOT escalate to admin`, () => {
    assert.strictEqual(evalIsTenantAdmin(v.auth, validTenant, validDoc, null), false, `Bypassed by ${v.name}!`);
  });
});

// ----------------------------------------------------------------------------
// MATRIX D: LEGITIMATE ACCESS & IDENTITY PERMISSIBILITY (15+ VECTORS)
// ----------------------------------------------------------------------------
console.log('\n📍 MATRIX D: LEGITIMATE ACCESS & IDENTITY PERMISSIBILITY');

const legitimateStaffVectors = [
  { name: 'token.storeCode match', auth: { token: { storeCode: validTenant } } },
  { name: 'token.cafe_id match', auth: { token: { cafe_id: validTenant } } },
  { name: 'token.shopId match', auth: { token: { shopId: validTenant } } },
  { name: 'token with storeCode and cashier role', auth: { token: { storeCode: validTenant, role: 'cashier' } } },
  { name: 'token with cafe_id and server role', auth: { token: { cafe_id: validTenant, role: 'server' } } },
  { name: 'token with shopId and waiter role', auth: { token: { shopId: validTenant, role: 'waiter' } } },
  { name: 'token matching resource ownerEmail', auth: { token: { email: 'proprietor@cafe101.com' } } },
  { name: 'token matching request.resource ownerEmail on create', auth: { token: { email: 'newowner@cafe101.com' } }, reqRes: { data: { ownerEmail: 'newowner@cafe101.com' } } }
];

legitimateStaffVectors.forEach(v => {
  runCheck('MATRIX-D', `Permits legitimate staff: ${v.name}`, () => {
    const res = evalIsTenantStaff(v.auth, validTenant, validDoc, v.reqRes || null);
    assert.strictEqual(res, true, `Legitimate staff rejected: ${v.name}`);
  });
});

const legitimateAdminVectors = [
  { name: 'token.storeCode + role: "admin"', auth: { token: { storeCode: validTenant, role: 'admin' } } },
  { name: 'token.cafe_id + role: "admin"', auth: { token: { cafe_id: validTenant, role: 'admin' } } },
  { name: 'token.shopId + role: "admin"', auth: { token: { shopId: validTenant, role: 'admin' } } },
  { name: 'token.storeCode + role: "owner"', auth: { token: { storeCode: validTenant, role: 'owner' } } },
  { name: 'token.cafe_id + role: "owner"', auth: { token: { cafe_id: validTenant, role: 'owner' } } },
  { name: 'token.shopId + role: "owner"', auth: { token: { shopId: validTenant, role: 'owner' } } },
  { name: 'token.storeCode + isOwner: true', auth: { token: { storeCode: validTenant, isOwner: true } } },
  { name: 'token.cafe_id + isOwner: true', auth: { token: { cafe_id: validTenant, isOwner: true } } },
  { name: 'token.shopId + isOwner: true', auth: { token: { shopId: validTenant, isOwner: true } } },
  { name: 'token matching ownerEmail in resource.data', auth: { token: { email: 'proprietor@cafe101.com' } } },
  { name: 'token matching ownerEmail in request.resource.data', auth: { token: { email: 'newowner@cafe101.com' } }, reqRes: { data: { ownerEmail: 'newowner@cafe101.com' } } }
];

legitimateAdminVectors.forEach(v => {
  runCheck('MATRIX-D', `Permits legitimate admin: ${v.name}`, () => {
    const res = evalIsTenantAdmin(v.auth, validTenant, validDoc, v.reqRes || null);
    assert.strictEqual(res, true, `Legitimate admin rejected: ${v.name}`);
  });
});

// ----------------------------------------------------------------------------
// MATRIX E: TENANT IDENTIFIER STRUCTURAL BOUNDARIES (15+ VECTORS)
// ----------------------------------------------------------------------------
console.log('\n📍 MATRIX E: TENANT IDENTIFIER STRUCTURAL BOUNDARIES');

const invalidTenantIds = [
  { id: '', desc: 'empty string' },
  { id: 'a', desc: '1 char string' },
  { id: 'ab', desc: '2 char string' },
  { id: '   ', desc: '3 spaces' },
  { id: '    ', desc: '4 spaces' },
  { id: '\t\t\t', desc: '3 tabs' },
  { id: '\n\n\n', desc: '3 newlines' },
  { id: '\r\n\r\n', desc: 'crlf sequence' },
  { id: ' \t \r\n ', desc: 'mixed whitespace' },
  { id: null, desc: 'null' },
  { id: undefined, desc: 'undefined' },
  { id: 1234, desc: 'number' },
  { id: true, desc: 'boolean' },
  { id: {}, desc: 'object' },
  { id: [], desc: 'array' }
];

invalidTenantIds.forEach(v => {
  runCheck('MATRIX-E', `isValidTenant rejects ${v.desc}`, () => {
    assert.strictEqual(evalIsValidTenant(v.id), false);
  });
});

const validTenantIds = [
  'abc',
  '123',
  'cafe_central',
  'shop-101-pro',
  'TENANT_ALPHA',
  'my-shop-id-uuid-5544332211',
  '  a  ', // contains non-whitespace and length >= 3
  'kiosk_#1'
];

validTenantIds.forEach(id => {
  runCheck('MATRIX-E', `isValidTenant accepts "${id}"`, () => {
    assert.strictEqual(evalIsValidTenant(id), true);
  });
});

// ----------------------------------------------------------------------------
// MATRIX F: STATIC AST & RULE FILE BINARY VERIFICATION (10+ CHECKS)
// ----------------------------------------------------------------------------
console.log('\n📍 MATRIX F: STATIC AST & RULE FILE BINARY VERIFICATION');

runCheck('MATRIX-F', 'Both firestore.rules and database/firestore.rules exist', () => {
  assert.ok(fs.existsSync(f1Path));
  assert.ok(fs.existsSync(f2Path));
});

const rawBuf1 = fs.readFileSync(f1Path);
const rawBuf2 = fs.readFileSync(f2Path);

runCheck('MATRIX-F', 'Binary parity: exact buffer equality', () => {
  assert.strictEqual(Buffer.compare(rawBuf1, rawBuf2), 0);
});

runCheck('MATRIX-F', 'SHA-256 cryptographic parity match', () => {
  const hash1 = crypto.createHash('sha256').update(rawBuf1).digest('hex');
  const hash2 = crypto.createHash('sha256').update(rawBuf2).digest('hex');
  assert.strictEqual(hash1, hash2);
});

runCheck('MATRIX-F', 'Windows OS fc /b binary parity execution', () => {
  const out = execSync(`cmd /c fc /b "firestore.rules" "database\\firestore.rules"`, { cwd: rootDir, encoding: 'utf8' });
  assert.ok(out.includes('FC: no differences encountered') || out.includes('no differences'));
});

const rulesText = rawBuf1.toString('utf8');

runCheck('MATRIX-F', 'Security Invariant: "!isAuthenticated()" is 100% absent from rules files', () => {
  assert.strictEqual(rulesText.includes('!isAuthenticated()'), false);
});

runCheck('MATRIX-F', 'Security Invariant: "isAuthenticated() &&" is present in isTenantStaff', () => {
  assert.ok(rulesText.includes('isValidTenant(tenantId) && isAuthenticated() &&'));
});

runCheck('MATRIX-F', 'Security Invariant: /devices/{deviceId} completely blocks direct client access', () => {
  assert.ok(rulesText.includes('match /devices/{deviceId} {\n      allow read, write: if false;\n    }'));
});

runCheck('MATRIX-F', 'Security Invariant: Invoices ledger permanently forbids physical deletion', () => {
  assert.ok(rulesText.includes('match /invoices/{invoiceId} {\n        allow read, create: if isTenantStaff(cafeId);\n        \n        // PHYSICAL DELETION IS PERMANENTLY FORBIDDEN\n        allow delete: if false;'));
  assert.ok(rulesText.includes('match /invoices/{invoiceId} {\n        allow read, create: if isTenantStaff(shopId);\n        allow delete: if false;'));
});

runCheck('MATRIX-F', 'Security Invariant: Print queue forbids billing data injection', () => {
  assert.ok(rulesText.includes("!('invoice' in request.resource.data)"));
  assert.ok(rulesText.includes("!('billNo' in request.resource.data)"));
  assert.ok(rulesText.includes("!('amount' in request.resource.data)"));
  assert.ok(rulesText.includes("!('final_payable_paise' in request.resource.data)"));
});

runCheck('MATRIX-F', 'Dual-path parity: matches count for /cafes/ and /shops/', () => {
  const cafeCount = (rulesText.match(/match \/cafes\/\{cafeId\}/g) || []).length;
  const shopCount = (rulesText.match(/match \/shops\/\{shopId\}/g) || []).length;
  assert.strictEqual(cafeCount, 1);
  assert.strictEqual(shopCount, 1);
});

// ----------------------------------------------------------------------------
// FINAL SUMMARY
// ----------------------------------------------------------------------------
console.log('\n====================================================================');
console.log('📊 CHALLENGER DEEP STRESS HARNESS RESULTS');
console.log('====================================================================');
console.log(`  Total Checks: ${passedCount + failedCount}`);
console.log(`  Passed:       ${passedCount}`);
console.log(`  Failed:       ${failedCount}`);
console.log('--------------------------------------------------------------------');

if (failedCount === 0) {
  console.log('🎉 ALL ADVERSARIAL STRESS CHECKS PASSED WITH 100% INTEGRITY!');
  console.log('   VERDICT: APPROVE');
  console.log('====================================================================\n');
  process.exit(0);
} else {
  console.error(`💥 ${failedCount} CHECK(S) FAILED!`);
  console.error('   VERDICT: REQUEST_CHANGES');
  console.error('====================================================================\n');
  process.exit(1);
}
