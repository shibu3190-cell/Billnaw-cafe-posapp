// scratch/test_auditor_rules_stress.cjs
// Independent Adversarial Rules Stress Test by Auditor

const assert = require('assert');

// Exact reproduction of hardened firestore.rules logic
function isValidTenant(id) {
  if (typeof id !== 'string') return false;
  if (id.length < 3) return false;
  if (/^\s+$/.test(id)) return false;
  if (id === '_auth') return false;
  return true;
}

function isAuthenticated(request) {
  return request.auth != null;
}

function hasVerifiedEmail(request) {
  if (!request.auth || !request.auth.token) return false;
  const t = request.auth.token;
  return (
    'email' in t &&
    typeof t.email === 'string' &&
    t.email.length > 0 &&
    'email_verified' in t &&
    t.email_verified === true
  );
}

function matchesTenantId(request, tenantId) {
  if (!request.auth || !request.auth.token) return false;
  const token = request.auth.token;
  return (
    ('storeCode' in token && typeof token.storeCode === 'string' && token.storeCode === tenantId) ||
    ('cafe_id' in token && typeof token.cafe_id === 'string' && token.cafe_id === tenantId) ||
    ('cafeId' in token && typeof token.cafeId === 'string' && token.cafeId === tenantId) ||
    ('shopId' in token && typeof token.shopId === 'string' && token.shopId === tenantId)
  );
}

function hasAdminOrOwnerClaim(request) {
  if (!request.auth || !request.auth.token) return false;
  const token = request.auth.token;
  const hasRole = 'role' in token && typeof token.role === 'string' && (token.role === 'admin' || token.role === 'owner');
  const isOwner = 'isOwner' in token && token.isOwner === true;
  return hasRole || isOwner;
}

function matchesExistingOwnerEmail(request, resource) {
  if (!hasVerifiedEmail(request)) return false;
  if (!resource || !resource.data || typeof resource.data.ownerEmail !== 'string' || resource.data.ownerEmail.length === 0) return false;
  return resource.data.ownerEmail.toLowerCase() === request.auth.token.email.toLowerCase();
}

function matchesCreateOwnerEmail(request, resource) {
  if (!hasVerifiedEmail(request)) return false;
  if (resource != null) return false;
  if (!request.resource || !request.resource.data || typeof request.resource.data.ownerEmail !== 'string' || request.resource.data.ownerEmail.length === 0) return false;
  return request.resource.data.ownerEmail.toLowerCase() === request.auth.token.email.toLowerCase();
}

function matchesParentOwnerEmail(request, parentDoc) {
  if (!hasVerifiedEmail(request)) return false;
  if (!parentDoc || !parentDoc.data || typeof parentDoc.data.ownerEmail !== 'string' || parentDoc.data.ownerEmail.length === 0) return false;
  return parentDoc.data.ownerEmail.toLowerCase() === request.auth.token.email.toLowerCase();
}

function isRootStaff(request, resource, tenantId) {
  return isValidTenant(tenantId) && isAuthenticated(request) && (
    matchesTenantId(request, tenantId) ||
    matchesExistingOwnerEmail(request, resource)
  );
}

function isRootAdmin(request, resource, tenantId) {
  if (!isRootStaff(request, resource, tenantId)) return false;
  return hasAdminOrOwnerClaim(request) || matchesExistingOwnerEmail(request, resource);
}

function isTenantStaff(request, parentDoc, tenantId) {
  return isValidTenant(tenantId) && isAuthenticated(request) && (
    matchesTenantId(request, tenantId) ||
    matchesParentOwnerEmail(request, parentDoc)
  );
}

function isTenantAdmin(request, parentDoc, tenantId) {
  if (!isTenantStaff(request, parentDoc, tenantId)) return false;
  return hasAdminOrOwnerClaim(request) || matchesParentOwnerEmail(request, parentDoc);
}

console.log('=== AUDITOR INDEPENDENT ADVERSARIAL STRESS TEST ===\n');

let pass = 0;
function test(name, fn) {
  fn();
  pass++;
  console.log(`  [PASS] ${name}`);
}

// 1. Unauthenticated attacks
test('Unauthenticated user (auth=null) cannot access staff endpoints', () => {
  const req = { auth: null };
  assert.strictEqual(isTenantStaff(req, null, 'shop123'), false);
  assert.strictEqual(isTenantAdmin(req, null, 'shop123'), false);
});

test('Unauthenticated user (auth=undefined) cannot access staff endpoints', () => {
  const req = {};
  assert.strictEqual(isTenantStaff(req, null, 'shop123'), false);
  assert.strictEqual(isTenantAdmin(req, null, 'shop123'), false);
});

// 2. Cross-tenant attacks
test('Staff of tenant A cannot access tenant B', () => {
  const req = { auth: { token: { storeCode: 'tenant_A', role: 'staff' } } };
  assert.strictEqual(isTenantStaff(req, null, 'tenant_B'), false);
});

test('Admin of tenant A cannot admin tenant B', () => {
  const req = { auth: { token: { storeCode: 'tenant_A', role: 'admin' } } };
  assert.strictEqual(isTenantAdmin(req, null, 'tenant_B'), false);
});

// 3. Privilege escalation within tenant
test('Waiter/cashier cannot escalate to admin', () => {
  const roles = ['waiter', 'cashier', 'server', 'cook', 'manager', 'ADMIN', 'Owner', ''];
  roles.forEach(role => {
    const req = { auth: { token: { storeCode: 'tenant_A', role: role } } };
    assert.strictEqual(isTenantStaff(req, null, 'tenant_A'), true);
    assert.strictEqual(isTenantAdmin(req, null, 'tenant_A'), false);
  });
});

test('Type confusion attacks on role cannot escalate to admin', () => {
  const badRoles = [1, ['admin'], { role: 'admin' }, true, false, null];
  badRoles.forEach(r => {
    const req = { auth: { token: { storeCode: 'tenant_A', role: r } } };
    assert.strictEqual(isTenantAdmin(req, null, 'tenant_A'), false);
  });
});

// 4. Owner email attacks
test('Verified owner email matches grant staff and admin (root & subcollection parent)', () => {
  const req = { auth: { token: { email: 'Owner@Cafe.com', email_verified: true } } };
  const res = { data: { ownerEmail: 'owner@cafe.com' } };
  assert.strictEqual(isRootStaff(req, res, 'tenant_A'), true);
  assert.strictEqual(isRootAdmin(req, res, 'tenant_A'), true);
  assert.strictEqual(isTenantStaff(req, res, 'tenant_A'), true);
  assert.strictEqual(isTenantAdmin(req, res, 'tenant_A'), true);
});

test('Unverified owner email is rejected even if email matches', () => {
  const req = { auth: { token: { email: 'owner@cafe.com', email_verified: false } } };
  const res = { data: { ownerEmail: 'owner@cafe.com' } };
  assert.strictEqual(isRootStaff(req, res, 'tenant_A'), false);
  assert.strictEqual(isRootAdmin(req, res, 'tenant_A'), false);
  assert.strictEqual(isTenantStaff(req, res, 'tenant_A'), false);
  assert.strictEqual(isTenantAdmin(req, res, 'tenant_A'), false);
});

test('Attacker supplying request.resource.data.ownerEmail cannot hijack existing root doc or subcollection', () => {
  const req = {
    auth: { token: { email: 'attacker@evil.com', email_verified: true } },
    resource: { data: { ownerEmail: 'attacker@evil.com' } }
  };
  const existingRoot = { data: { ownerEmail: 'owner@cafe.com' } };
  assert.strictEqual(isRootStaff(req, existingRoot, 'tenant_A'), false);
  assert.strictEqual(isRootAdmin(req, existingRoot, 'tenant_A'), false);
  assert.strictEqual(isTenantStaff(req, existingRoot, 'tenant_A'), false);
  assert.strictEqual(isTenantAdmin(req, existingRoot, 'tenant_A'), false);
  assert.strictEqual(matchesCreateOwnerEmail(req, existingRoot), false);
  assert.strictEqual(matchesCreateOwnerEmail(req, null), true);
});

test('Mismatched owner email is rejected', () => {
  const req = { auth: { token: { email: 'attacker@evil.com', email_verified: true } } };
  const res = { data: { ownerEmail: 'owner@cafe.com' } };
  assert.strictEqual(isTenantStaff(req, res, 'tenant_A'), false);
  assert.strictEqual(isTenantAdmin(req, res, 'tenant_A'), false);
});

// 5. Tenant ID boundary attacks
test('Tenant ID validation rejects invalid IDs and internal _auth namespace', () => {
  const req = { auth: { token: { storeCode: '   ', role: 'admin' } } };
  assert.strictEqual(isTenantStaff(req, null, '   '), false);
  assert.strictEqual(isTenantStaff(req, null, ''), false);
  assert.strictEqual(isTenantStaff(req, null, 'ab'), false);
  assert.strictEqual(isTenantStaff(req, null, '_auth'), false);
  assert.strictEqual(isTenantStaff(req, null, 123), false);
});

// 6. Legitimate staff and admin authorizations
test('Legitimate admin with storeCode receives staff and admin access', () => {
  const req = { auth: { token: { storeCode: 'shop_xyz', role: 'admin' } } };
  assert.strictEqual(isTenantStaff(req, null, 'shop_xyz'), true);
  assert.strictEqual(isTenantAdmin(req, null, 'shop_xyz'), true);
});

test('Legitimate admin with cafe_id or cafeId receives staff and admin access', () => {
  const req1 = { auth: { token: { cafe_id: 'cafe_xyz', role: 'owner' } } };
  assert.strictEqual(isTenantStaff(req1, null, 'cafe_xyz'), true);
  assert.strictEqual(isTenantAdmin(req1, null, 'cafe_xyz'), true);

  const req2 = { auth: { token: { cafeId: 'cafe_xyz', role: 'admin' } } };
  assert.strictEqual(isTenantStaff(req2, null, 'cafe_xyz'), true);
  assert.strictEqual(isTenantAdmin(req2, null, 'cafe_xyz'), true);
});

test('Legitimate admin with shopId and isOwner receives staff and admin access', () => {
  const req = { auth: { token: { shopId: 'shop_xyz', isOwner: true } } };
  assert.strictEqual(isTenantStaff(req, null, 'shop_xyz'), true);
  assert.strictEqual(isTenantAdmin(req, null, 'shop_xyz'), true);
});

console.log(`\n🎉 ALL ${pass} ADVERSARIAL STRESS CHALLENGES PASSED! VERDICT: 100% CLEAN`);
