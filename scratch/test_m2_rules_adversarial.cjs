/**
 * scratch/test_m2_rules_adversarial.cjs
 *
 * M2 ADVERSARIAL & COMPATIBILITY SUITE: FIRESTORE SECURITY RULES HARDENING & PARITY
 *
 * Tests BOTH static AST/structural invariants of firestore.rules & database/firestore.rules
 * AND a strict JS rule evaluator mirroring every M2 hardening requirement and client
 * backward-compatibility constraint.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const f1Path = path.join(rootDir, 'firestore.rules');
const f2Path = path.join(rootDir, 'database', 'firestore.rules');

let passed = 0;
let failed = 0;

function test(category, name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ [PASS] [${category}] ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ [FAIL] [${category}] ${name} -> ${err.message}`);
  }
}

console.log('====================================================================');
console.log('🛡️  M2 ADVERSARIAL & COMPATIBILITY TEST SUITE (FIRESTORE RULES)');
console.log('====================================================================\n');

const b1 = fs.readFileSync(f1Path);
const b2 = fs.readFileSync(f2Path);
const rules = b1.toString('utf8');

function extractMatchBlock(content, matchPattern) {
  const startIdx = content.indexOf(matchPattern);
  assert.ok(startIdx !== -1, `Could not find pattern: ${matchPattern}`);
  const openBraceIdx = content.indexOf('{', startIdx + matchPattern.length);
  assert.ok(openBraceIdx !== -1, `Could not find open brace for: ${matchPattern}`);
  let depth = 0;
  for (let i = openBraceIdx; i < content.length; i++) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.substring(startIdx, i + 1);
    }
  }
  throw new Error(`Unclosed match block: ${matchPattern}`);
}

function stripComments(code) {
  return code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const cafeBlock = extractMatchBlock(rules, 'match /cafes/{cafeId}');
const shopBlock = extractMatchBlock(rules, 'match /shops/{shopId}');
const clientBlock = extractMatchBlock(rules, 'match /clients/{clientId}');

// ============================================================================
// SECTION 1: STATIC STRUCTURE, PARITY & WILDCARD ELIMINATION
// ============================================================================
console.log('📍 SECTION 1: STATIC STRUCTURE, PARITY & WILDCARD ELIMINATION');

test('STATIC', 'firestore.rules and database/firestore.rules are 100% bit-for-bit identical', () => {
  assert.strictEqual(Buffer.compare(b1, b2), 0);
  const sha1 = crypto.createHash('sha256').update(b1).digest('hex');
  const sha2 = crypto.createHash('sha256').update(b2).digest('hex');
  assert.strictEqual(sha1, sha2);
  const fcOut = execSync('cmd /c fc /b "firestore.rules" "database\\firestore.rules"', { cwd: rootDir, encoding: 'utf8' });
  assert.ok(fcOut.includes('no differences'));
});

test('STATIC', 'Zero wildcard {allChildren=**} rules exist under /cafes, /shops, or /clients/{clientId}', () => {
  assert.strictEqual(/match\s+\/\{allChildren=\*\*\}/.test(cafeBlock), false, '/cafes must have no wildcard');
  assert.strictEqual(/match\s+\/\{allChildren=\*\*\}/.test(shopBlock), false, '/shops must have no wildcard');
  assert.strictEqual(/match\s+\/\{allChildren=\*\*\}/.test(clientBlock), false, '/clients/{clientId} must have no wildcard');
});

test('STATIC', '/clients/_auth/{allChildren=**} is explicitly denied and /clients/{clientId} guards clientId != _auth', () => {
  assert.ok(/match\s+\/clients\/_auth\/\{allChildren=\*\*\}\s*\{\s*allow read, write:\s*if false;\s*\}/.test(rules));
  assert.ok(clientBlock.includes("clientId != '_auth'"));
  assert.ok(rules.includes("id != '_auth'"));
});

test('STATIC', '3-way structural parity across /cafes/{cafeId}, /shops/{shopId}, and /clients/{clientId} subcollections', () => {
  const subs = [
    'invoices/{invoiceId}', 'kot/{kotId}', 'kots/{kotId}', 'print_queue/{jobId}',
    'tables/{tableId}', 'devices/{deviceId}', 'sessions/{sessionId}', 'staffSessions/{staffId}',
    'printQueue/{jobId}', 'staff/{staffId}', 'menu/{menuId}', 'menu_items/{menuId}',
    'menu_meta/{metaId}', 'inventory/{itemId}', 'customers/{customerId}', 'khata_payments/{paymentId}',
    'expenses/{expenseId}', 'settings/{settingId}', 'counters/{counterId}', 'khata/{khataId}',
    'history/{historyId}', 'raw_materials/{matId}', 'recipes/{recipeId}', 'stock_logs/{logId}',
    'sub_recipes/{recId}', 'reports/{reportId}', 'daily_summaries/{summaryId}',
    'marketing_logs/{logId}', 'quota/{quotaId}'
  ];
  for (const s of subs) {
    assert.ok(cafeBlock.includes(`match /${s}`), `/cafes missing ${s}`);
    assert.ok(shopBlock.includes(`match /${s}`), `/shops missing ${s}`);
    assert.ok(clientBlock.includes(`match /${s}`), `/clients missing ${s}`);
  }
  const normCafe = stripComments(cafeBlock).replace(/cafeId/g, 'shopId').replace(/cafes/g, 'shops').replace(/\s+/g, ' ').trim();
  const normShop = stripComments(shopBlock).replace(/\s+/g, ' ').trim();
  assert.strictEqual(normCafe, normShop);
});

test('STATIC', 'Anti-hijack: hasVerifiedEmail() enforces email_verified == true and no request.resource.data.ownerEmail bypass in staff/admin helpers', () => {
  assert.ok(rules.includes('request.auth.token.email_verified == true'));
  assert.ok(rules.includes('function matchesExistingOwnerEmail()'));
  assert.ok(rules.includes('function matchesCreateOwnerEmail()'));
  assert.ok(rules.includes('function matchesParentOwnerEmail(tenantId)'));
  assert.ok(rules.includes('function preservesOwnerEmailOnUpdate()'));
  assert.strictEqual(rules.includes('function matchesOwnerEmail()'), false, 'Vulnerable matchesOwnerEmail() must be removed');
});

test('STATIC', 'isWithin30DayEditWindow() removes !("createdAt" in resource.data) bypass completely', () => {
  const fnBlock = extractMatchBlock(rules, 'function isWithin30DayEditWindow()');
  assert.strictEqual(fnBlock.includes("!('createdAt' in resource.data)"), false, 'Missing createdAt bypass must be removed');
  assert.ok(fnBlock.includes('resource.data.createdAt is timestamp'));
  assert.ok(fnBlock.includes('resource.data.created_at is timestamp'));
});

test('STATIC', 'token.cafeId parity present in matchesTenantId', () => {
  const fnBlock = extractMatchBlock(rules, 'function matchesTenantId(tenantId)');
  assert.ok(fnBlock.includes('request.auth.token.cafeId'));
  assert.ok(fnBlock.includes('request.auth.token.cafe_id'));
  assert.ok(fnBlock.includes('request.auth.token.storeCode'));
  assert.ok(fnBlock.includes('request.auth.token.shopId'));
});

test('STATIC', 'Sensitive subcollections (/quota, /reports, /daily_summaries, /marketing_logs, /menu_items, /recipes) restrict writes to isTenantAdmin', () => {
  for (const col of ['reports', 'daily_summaries', 'marketing_logs', 'quota', 'menu_items', 'recipes']) {
    const reCafe = new RegExp(`match /${col}/\\{\\w+\\}\\s*\\{\\s*allow read: if isTenantStaff\\(cafeId\\);\\s*allow write: if isTenantAdmin\\(cafeId\\);\\s*\\}`);
    const reShop = new RegExp(`match /${col}/\\{\\w+\\}\\s*\\{\\s*allow read: if isTenantStaff\\(shopId\\);\\s*allow write: if isTenantAdmin\\(shopId\\);\\s*\\}`);
    const reClient = new RegExp(`match /${col}/\\{\\w+\\}\\s*\\{\\s*allow read: if isTenantStaff\\(clientId\\);\\s*allow write: if isTenantAdmin\\(clientId\\);\\s*\\}`);
    assert.ok(reCafe.test(cafeBlock), `/cafes/${col} must restrict write to isTenantAdmin`);
    assert.ok(reShop.test(shopBlock), `/shops/${col} must restrict write to isTenantAdmin`);
    assert.ok(reClient.test(clientBlock), `/clients/${col} must restrict write to isTenantAdmin`);
  }
});

test('STATIC', 'print_queue / printQueue blocks all 20 billing fields and locks update affectedKeys', () => {
  const expectedForbidden = [
    'invoice', 'billNo', 'amount', 'final_payable_paise',
    'bill_no', 'invoice_id', 'invoiceNo', 'invoice_no',
    'final_total_paise', 'grandTotal', 'grand_total',
    'paymentMode', 'payment_mode', 'subtotal', 'grossSubtotal',
    'totalTax', 'tax', 'total', 'discount', 'discountAmount'
  ];
  const fnBlock = extractMatchBlock(rules, 'function hasNoBillingFields()');
  for (const field of expectedForbidden) {
    assert.ok(fnBlock.includes(`'${field}'`), `Missing forbidden billing field ${field} in hasNoBillingFields()`);
  }
  assert.ok(cafeBlock.includes("affectedKeys().hasOnly(['status', 'leasedBy', 'leasedAt', 'attempts', 'printedAt', 'error', 'updatedAt', 'updated_at'])"));
});

test('STATIC', 'Explicit default deny match /{document=**} { allow read, write: if false; } exists at bottom', () => {
  assert.ok(/match \/\{document=\*\*\}\s*\{\s*allow read, write: if false;\s*\}/.test(rules));
});

// ============================================================================
// SECTION 2: STRICT JS RULE SIMULATOR FOR M2 SECURITY & COMPATIBILITY
// ============================================================================
console.log('\n📍 SECTION 2: STRICT JS RULE SIMULATOR (M2 SECURITY & BACKWARD COMPAT)');

const DAYS_30_MS = 30 * 24 * 60 * 60 * 1000;
const MINS_5_MS = 5 * 60 * 1000;

class MockTimestamp {
  constructor(ms) { this.ms = ms; }
}

function isValidTenant(id) {
  return typeof id === 'string' && id.length >= 3 && !/^\s+$/.test(id) && id !== '_auth';
}

function hasVerifiedEmail(auth) {
  const t = auth && auth.token;
  return Boolean(t && typeof t.email === 'string' && t.email.length > 0 && t.email_verified === true);
}

function matchesTenantId(auth, tenantId) {
  const t = auth && auth.token;
  if (!t) return false;
  return (
    (typeof t.storeCode === 'string' && t.storeCode === tenantId) ||
    (typeof t.cafe_id === 'string' && t.cafe_id === tenantId) ||
    (typeof t.cafeId === 'string' && t.cafeId === tenantId) ||
    (typeof t.shopId === 'string' && t.shopId === tenantId)
  );
}

function hasAdminOrOwnerClaim(auth) {
  const t = auth && auth.token;
  if (!t) return false;
  return (
    (typeof t.role === 'string' && (t.role === 'admin' || t.role === 'owner')) ||
    t.isOwner === true
  );
}

function matchesExistingOwnerEmail(auth, resource) {
  if (!hasVerifiedEmail(auth) || !resource || !resource.data) return false;
  const oe = resource.data.ownerEmail;
  return typeof oe === 'string' && oe.length > 0 && oe.toLowerCase() === auth.token.email.toLowerCase();
}

function matchesCreateOwnerEmail(auth, resource, reqResource) {
  if (!hasVerifiedEmail(auth) || resource !== null || !reqResource || !reqResource.data) return false;
  const oe = reqResource.data.ownerEmail;
  return typeof oe === 'string' && oe.length > 0 && oe.toLowerCase() === auth.token.email.toLowerCase();
}

function preservesOwnerEmailOnUpdate(auth, resource, reqResource) {
  const oldEmail = resource.data.ownerEmail;
  const newEmail = reqResource.data.ownerEmail;
  if (typeof oldEmail === 'string' && oldEmail.length > 0) {
    return typeof newEmail === 'string' && newEmail.toLowerCase() === oldEmail.toLowerCase();
  }
  if (!('ownerEmail' in reqResource.data)) return true;
  if (hasVerifiedEmail(auth) && typeof newEmail === 'string' && newEmail.toLowerCase() === auth.token.email.toLowerCase()) return true;
  const t = auth && auth.token;
  return Boolean(t && (t.isOwner === true || t.role === 'owner'));
}

function docMatchesVerifiedOwnerEmail(auth, doc) {
  if (!doc || !doc.exists || !doc.data) return false;
  const oe = doc.data.ownerEmail;
  return typeof oe === 'string' && oe.length > 0 && oe.toLowerCase() === auth.token.email.toLowerCase();
}

function matchesParentOwnerEmail(auth, tenantId, dbRoots) {
  if (!hasVerifiedEmail(auth)) return false;
  return (
    docMatchesVerifiedOwnerEmail(auth, dbRoots.cafes?.[tenantId]) ||
    docMatchesVerifiedOwnerEmail(auth, dbRoots.shops?.[tenantId]) ||
    docMatchesVerifiedOwnerEmail(auth, dbRoots.clients?.[tenantId])
  );
}

function isRootStaff(auth, tenantId, resource) {
  return isValidTenant(tenantId) && auth != null && (matchesTenantId(auth, tenantId) || matchesExistingOwnerEmail(auth, resource));
}

function isRootAdmin(auth, tenantId, resource) {
  return isRootStaff(auth, tenantId, resource) && (hasAdminOrOwnerClaim(auth) || matchesExistingOwnerEmail(auth, resource));
}

function isTenantStaff(auth, tenantId, dbRoots) {
  return isValidTenant(tenantId) && auth != null && (matchesTenantId(auth, tenantId) || matchesParentOwnerEmail(auth, tenantId, dbRoots));
}

function isTenantAdmin(auth, tenantId, dbRoots) {
  return isTenantStaff(auth, tenantId, dbRoots) && (hasAdminOrOwnerClaim(auth) || matchesParentOwnerEmail(auth, tenantId, dbRoots));
}

function affectedKeys(oldData, newData) {
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];
  for (const k of keys) {
    const inOld = Object.prototype.hasOwnProperty.call(oldData, k);
    const inNew = Object.prototype.hasOwnProperty.call(newData, k);
    if (inOld !== inNew || JSON.stringify(oldData[k]) !== JSON.stringify(newData[k])) {
      changed.push(k);
    }
  }
  return changed;
}

function evalRootOp(op, col, tenantId, auth, resource, reqResource, dbRoots) {
  if (col === 'clients' && tenantId === '_auth') return false;
  if (op === 'read') return isRootStaff(auth, tenantId, resource);
  if (op === 'delete') return false;
  if (op === 'create') {
    if (!isValidTenant(tenantId) || auth == null) return false;
    if (matchesTenantId(auth, tenantId) && hasAdminOrOwnerClaim(auth)) return true;
    if (!matchesCreateOwnerEmail(auth, resource, reqResource)) return false;
    for (const sib of ['cafes', 'shops', 'clients']) {
      if (sib === col) continue;
      const sibDoc = dbRoots[sib]?.[tenantId];
      if (sibDoc && sibDoc.exists && !docMatchesVerifiedOwnerEmail(auth, sibDoc)) return false;
    }
    return true;
  }
  if (op === 'update') {
    if (isRootAdmin(auth, tenantId, resource) && preservesOwnerEmailOnUpdate(auth, resource, reqResource)) {
      return true;
    }
    if (isRootStaff(auth, tenantId, resource)) {
      const changed = affectedKeys(resource.data, reqResource.data);
      const allowed = new Set(['tables', 'updatedAt', 'updated_at']);
      if (!changed.every(k => allowed.has(k))) return false;
      if ('tables' in reqResource.data) {
        const tbl = reqResource.data.tables;
        if (tbl === null || typeof tbl !== 'object' || Array.isArray(tbl)) return false;
      }
      return true;
    }
    return false;
  }
  return false;
}

function isWithin30DayEditWindow(resourceData, reqTimeMs) {
  if (resourceData.createdAt instanceof MockTimestamp && reqTimeMs < resourceData.createdAt.ms + DAYS_30_MS) return true;
  if (resourceData.created_at instanceof MockTimestamp && reqTimeMs < resourceData.created_at.ms + DAYS_30_MS) return true;
  return false;
}

function evalInvoiceOp(op, tenantId, auth, resource, reqResource, reqTimeMs, dbRoots) {
  if (!isTenantStaff(auth, tenantId, dbRoots)) return false;
  if (op === 'read') return true;
  if (op === 'delete') return false;
  if (op === 'create') {
    const d = reqResource.data;
    if ('status' in d && d.status !== 'PAID' && d.status !== 'SETTLED') return false;
    if ('createdAt' in d && d.createdAt instanceof MockTimestamp && d.createdAt.ms > reqTimeMs + MINS_5_MS) return false;
    if ('created_at' in d && d.created_at instanceof MockTimestamp && d.created_at.ms > reqTimeMs + MINS_5_MS) return false;
    return true;
  }
  if (op === 'update') {
    const oldD = resource.data;
    const newD = reqResource.data;
    if (!isWithin30DayEditWindow(oldD, reqTimeMs)) return false;
    if (oldD.status !== 'PAID' && oldD.status !== 'SETTLED') return false;
    if (newD.status !== 'VOID') return false;
    const changed = affectedKeys(oldD, newD);
    const allowed = new Set(['status', 'void_audit', 'void_reason', 'voided_by', 'voided_at', 'updatedAt', 'updated_at']);
    if (!changed.every(k => allowed.has(k))) return false;
    const nestedOk = newD.void_audit && typeof newD.void_audit === 'object' && !Array.isArray(newD.void_audit) &&
      typeof newD.void_audit.void_reason === 'string' && newD.void_audit.void_reason.length >= 3 &&
      typeof newD.void_audit.voided_by_staff_id === 'string' && newD.void_audit.voided_by_staff_id.length > 0 &&
      typeof newD.void_audit.voided_at === 'string' && newD.void_audit.voided_at.length > 0;
    const flatOk = typeof newD.void_reason === 'string' && newD.void_reason.length >= 3 &&
      typeof newD.voided_by === 'string' && newD.voided_by.length > 0 &&
      typeof newD.voided_at === 'string' && newD.voided_at.length > 0;
    return Boolean(nestedOk || flatOk);
  }
  return false;
}

const victimRoots = {
  cafes: { victim_cafe: { exists: true, data: { ownerEmail: 'owner@victim.com', subscription: { status: 'ACTIVE' }, tables: {} } } },
  shops: {},
  clients: {}
};

// 2.1 Anti-Hijack Tests
test('M2-HIJACK', 'Attacker cannot hijack existing root doc via request.resource.data.ownerEmail', () => {
  const attacker = { token: { email: 'attacker@evil.com', email_verified: true } };
  const existing = victimRoots.cafes.victim_cafe;
  const reqRes = { data: { ...existing.data, ownerEmail: 'attacker@evil.com' } };
  assert.strictEqual(evalRootOp('update', 'cafes', 'victim_cafe', attacker, existing, reqRes, victimRoots), false);
});

test('M2-HIJACK', 'Attacker cannot hijack subcollection via request.resource.data.ownerEmail', () => {
  const attacker = { token: { email: 'attacker@evil.com', email_verified: true } };
  assert.strictEqual(isTenantStaff(attacker, 'victim_cafe', victimRoots), false);
  assert.strictEqual(isTenantAdmin(attacker, 'victim_cafe', victimRoots), false);
});

test('M2-HIJACK', 'Attacker cannot shadow existing /cafes/victim_cafe by creating /shops/victim_cafe with attacker ownerEmail', () => {
  const attacker = { token: { email: 'attacker@evil.com', email_verified: true } };
  const reqRes = { data: { ownerEmail: 'attacker@evil.com' } };
  assert.strictEqual(evalRootOp('create', 'shops', 'victim_cafe', attacker, null, reqRes, victimRoots), false);
});

test('M2-HIJACK', 'Unverified email is rejected even if email matches ownerEmail', () => {
  const unverified = { token: { email: 'owner@victim.com', email_verified: false } };
  const existing = victimRoots.cafes.victim_cafe;
  assert.strictEqual(evalRootOp('read', 'cafes', 'victim_cafe', unverified, existing, null, victimRoots), false);
  assert.strictEqual(isTenantAdmin(unverified, 'victim_cafe', victimRoots), false);
});

test('M2-HIJACK', 'Admin cannot mutate or delete ownerEmail on existing root doc', () => {
  const adminWithClaim = { token: { storeCode: 'victim_cafe', role: 'admin', email: 'owner@victim.com', email_verified: true } };
  const existing = victimRoots.cafes.victim_cafe;
  assert.strictEqual(evalRootOp('update', 'cafes', 'victim_cafe', adminWithClaim, existing, { data: { ...existing.data, ownerEmail: 'new@evil.com' } }, victimRoots), false);
  const withoutEmail = { ...existing.data };
  delete withoutEmail.ownerEmail;
  assert.strictEqual(evalRootOp('update', 'cafes', 'victim_cafe', adminWithClaim, existing, { data: withoutEmail }, victimRoots), false);
});

test('M2-COMPAT', 'Legitimate brand-new root create & case-insensitive verified owner access succeed', () => {
  const owner = { token: { email: 'Owner@Victim.com', email_verified: true } };
  assert.strictEqual(evalRootOp('create', 'cafes', 'brand_new_cafe', owner, null, { data: { ownerEmail: 'owner@victim.com' } }, victimRoots), true);
  assert.strictEqual(evalRootOp('read', 'cafes', 'victim_cafe', owner, victimRoots.cafes.victim_cafe, null, victimRoots), true);
  assert.strictEqual(isTenantAdmin(owner, 'victim_cafe', victimRoots), true);
});

// 2.2 30-Day Edit Window & Invoice Tests
test('M2-INVOICE', 'Missing createdAt/created_at or non-timestamp createdAt is DENIED by isWithin30DayEditWindow()', () => {
  const now = Date.now();
  const staff = { token: { storeCode: 'victim_cafe', role: 'cashier' } };
  const baseVoid = {
    status: 'VOID',
    void_audit: { void_reason: 'Duplicate bill', voided_by_staff_id: 's1', voided_at: new Date().toISOString() }
  };
  const missingCreatedAt = { data: { status: 'PAID', amount: 500 } };
  const stringCreatedAt = { data: { status: 'PAID', amount: 500, created_at: new Date(now).toISOString() } };
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, missingCreatedAt, { data: { ...missingCreatedAt.data, ...baseVoid } }, now, victimRoots), false);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, stringCreatedAt, { data: { ...stringCreatedAt.data, ...baseVoid } }, now, victimRoots), false);
});

test('M2-INVOICE', '30-day window boundary: 29d23h ALLOWS void; 30d+1s DENIES void', () => {
  const now = Date.now();
  const staff = { token: { storeCode: 'victim_cafe', role: 'cashier' } };
  const near = { data: { status: 'PAID', total: 200, createdAt: new MockTimestamp(now - (DAYS_30_MS - 3600000)) } };
  const expired = { data: { status: 'PAID', total: 200, createdAt: new MockTimestamp(now - (DAYS_30_MS + 1000)) } };
  const voidPayload = { status: 'VOID', void_audit: { void_reason: 'Customer left', voided_by_staff_id: 's1', voided_at: '2026-11-18T00:00:00Z' } };
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, near, { data: { ...near.data, ...voidPayload } }, now, victimRoots), true);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, expired, { data: { ...expired.data, ...voidPayload } }, now, victimRoots), false);
});

test('M2-INVOICE', 'Financial tampering during VOID (amount, total, items, billNo, createdAt, tax, final_payable_paise) is DENIED', () => {
  const now = Date.now();
  const staff = { token: { storeCode: 'victim_cafe', role: 'cashier' } };
  const cur = {
    data: {
      status: 'SETTLED', total: 500, amount: 500, final_payable_paise: 50000,
      items: [{ name: 'Tea', qty: 2 }], billNo: 'B-1', created_at: new MockTimestamp(now - 1000)
    }
  };
  const validVoid = {
    status: 'VOID',
    void_reason: 'Wrong table',
    voided_by: 's1',
    voided_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-18T00:00:00Z'
  };
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, cur, { data: { ...cur.data, ...validVoid } }, now, victimRoots), true);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, cur, { data: { ...cur.data, ...validVoid, total: 1 } }, now, victimRoots), false);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, cur, { data: { ...cur.data, ...validVoid, final_payable_paise: 0 } }, now, victimRoots), false);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, cur, { data: { ...cur.data, ...validVoid, items: [] } }, now, victimRoots), false);
  assert.strictEqual(evalInvoiceOp('update', 'victim_cafe', staff, cur, { data: { ...cur.data, ...validVoid, billNo: 'B-999' } }, now, victimRoots), false);
});

test('M2-INVOICE', 'Invoice create rejects VOID initial status and future-dated timestamps (> 5m)', () => {
  const now = Date.now();
  const staff = { token: { storeCode: 'victim_cafe', role: 'cashier' } };
  assert.strictEqual(evalInvoiceOp('create', 'victim_cafe', staff, null, { data: { status: 'SETTLED', createdAt: new MockTimestamp(now) } }, now, victimRoots), true);
  assert.strictEqual(evalInvoiceOp('create', 'victim_cafe', staff, null, { data: { status: 'PAID', createdAt: new MockTimestamp(now) } }, now, victimRoots), true);
  assert.strictEqual(evalInvoiceOp('create', 'victim_cafe', staff, null, { data: { status: 'VOID', createdAt: new MockTimestamp(now) } }, now, victimRoots), false);
  assert.strictEqual(evalInvoiceOp('create', 'victim_cafe', staff, null, { data: { status: 'PAID', createdAt: new MockTimestamp(now + 10 * 60 * 1000) } }, now, victimRoots), false);
});

// 2.3 Root Tables Staff Compatibility vs Privilege Escalation
test('M2-ROOT', 'Non-admin Floor Server/Cashier can update ONLY tables/updatedAt on root doc; blocked from admin fields', () => {
  const server = { token: { storeCode: 'victim_cafe', role: 'server' } };
  const existing = victimRoots.cafes.victim_cafe;
  assert.strictEqual(
    evalRootOp('update', 'cafes', 'victim_cafe', server, existing, { data: { ...existing.data, tables: { T1: { cart: [] } }, updatedAt: '2026-11-18T00:00:00Z' } }, victimRoots),
    true
  );
  // Blocked: non-map tables
  assert.strictEqual(
    evalRootOp('update', 'cafes', 'victim_cafe', server, existing, { data: { ...existing.data, tables: 'hacked' } }, victimRoots),
    false
  );
  // Blocked: modifying subscription, ownerEmail, staff, menu, quota alongside tables
  for (const field of ['ownerEmail', 'subscription', 'menu', 'staff', 'quota', 'profile', 'settings']) {
    assert.strictEqual(
      evalRootOp('update', 'cafes', 'victim_cafe', server, existing, { data: { ...existing.data, tables: {}, [field]: 'tampered' } }, victimRoots),
      false,
      `Server must be blocked from modifying ${field}`
    );
  }
  // Blocked: root create & delete by non-admin staff
  assert.strictEqual(evalRootOp('create', 'cafes', 'new_cafe', server, null, { data: { tables: {} } }, victimRoots), false);
  assert.strictEqual(evalRootOp('delete', 'cafes', 'victim_cafe', server, existing, null, victimRoots), false);
});

// 2.4 token.cafeId & _auth isolation
test('M2-CLAIMS', 'token.cafeId grants staff/admin access to matching tenant and denies mismatched tenant or _auth', () => {
  const cafeStaff = { token: { cafeId: 'victim_cafe', role: 'cashier' } };
  const cafeAdmin = { token: { cafeId: 'victim_cafe', role: 'admin' } };
  const authSpoof = { token: { cafeId: '_auth', role: 'admin' } };
  assert.strictEqual(isTenantStaff(cafeStaff, 'victim_cafe', victimRoots), true);
  assert.strictEqual(isTenantAdmin(cafeStaff, 'victim_cafe', victimRoots), false);
  assert.strictEqual(isTenantAdmin(cafeAdmin, 'victim_cafe', victimRoots), true);
  assert.strictEqual(isTenantStaff(cafeAdmin, 'other_cafe', victimRoots), false);
  assert.strictEqual(evalRootOp('read', 'clients', '_auth', authSpoof, { data: {} }, null, victimRoots), false);
  assert.strictEqual(isTenantStaff(authSpoof, '_auth', victimRoots), false);
});

console.log('\n====================================================================');
console.log(`🎯 M2 RULES ADVERSARIAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('====================================================================');
if (failed > 0) process.exit(1);
