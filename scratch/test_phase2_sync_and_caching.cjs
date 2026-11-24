// scratch/test_phase2_sync_and_caching.cjs
// Verification Suite for Phase 2: Multi-Device Sync & Listener Pruning
// 1. Role-aware listener scoping & root doc decoupling
// 2. Decoupled 5-second local unpaid table alert interval
// 3. Visibility-aware session heartbeat in js/staff.js
// 4. Dynamic listener adaptation on terminal unlock / role switch

process.env.NODE_ENV = 'test';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================================');
console.log('🚀 RUNNING PHASE 2 MULTI-DEVICE SYNC & CACHING AUDIT');
console.log('====================================================================');

async function runAudit() {
  const rootDir = path.resolve(__dirname, '..');

  // ---------------------------------------------------------------
  // CHECK 1: Role-Aware Listener Scoping in js/core.js
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 1: Role-Aware Listener Scoping in js/core.js');
  const coreContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf-8');

  assert.ok(coreContent.includes('const isKdsStation'), 'js/core.js must identify KDS kitchen stations');
  assert.ok(coreContent.includes('const isBillingRole'), 'js/core.js must calculate isBillingRole');
  assert.ok(coreContent.includes('const needsRootStoreDoc'), 'js/core.js must calculate needsRootStoreDoc (preserving KOTs on KDS)');
  assert.ok(coreContent.includes('subscribeInvoicesCloudListener(targetStoreCode);'), 'Must call subscribeInvoicesCloudListener for billing roles');
  assert.ok(coreContent.includes('lastSubscribedWasBillingRole'), 'Must track lastSubscribedWasBillingRole to eliminate listener thrashing');
  assert.ok(coreContent.includes('lastSubscribedWasRootDoc'), 'Must track lastSubscribedWasRootDoc');
  assert.ok(coreContent.includes('Decoupled heavy root storeDoc & invoice snapshots'), 'Must log light delta sync notice for secondary devices');
  console.log('  ✅ PASS: KDS KOT notifications preserved, heavy invoice listeners pruned, and role switching dynamically tracked.');

  // ---------------------------------------------------------------
  // CHECK 2: Decoupled Unpaid Table Alert Interval in js/pos.js
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 2: Decoupled Unpaid Table Alert in js/pos.js');
  const posContent = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf-8');

  const alertLoopIdx = posContent.indexOf("if (shopProfile.unpaidTableAlert === false) return;");
  assert.ok(alertLoopIdx > 0, 'Must locate unpaidTableAlert interval');
  const alertBlock = posContent.slice(alertLoopIdx - 150, alertLoopIdx + 900);

  assert.ok(alertBlock.includes("document.visibilityState === 'hidden'"), 'Unpaid alert interval must check document.visibilityState');
  assert.ok(!alertBlock.includes('persistTables();'), 'Unpaid alert interval must NOT call persistTables() to avoid cloud write storm');
  assert.ok(alertBlock.includes("idb.set('cafe_tables', tablesInfo)"), 'Unpaid alert must persist locally to IndexedDB');
  assert.ok(alertBlock.includes('syncTableUI();'), 'Unpaid alert must update local table UI');
  console.log('  ✅ PASS: 5-second unpaid alert decoupled from cloud writes and protected by visibility check.');

  // ---------------------------------------------------------------
  // CHECK 3: Visibility-Aware Session Heartbeat in js/staff.js
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 3: Visibility-Aware Session Heartbeat in js/staff.js');
  const staffContent = fs.readFileSync(path.join(rootDir, 'js', 'staff.js'), 'utf-8');

  const heartbeatIdx = staffContent.indexOf('sessionHeartbeatInterval = setInterval');
  assert.ok(heartbeatIdx > 0, 'Must locate sessionHeartbeatInterval');
  const heartbeatBlock = staffContent.slice(heartbeatIdx, heartbeatIdx + 300);

  assert.ok(heartbeatBlock.includes("document.visibilityState === 'hidden'"), 'Session heartbeat must check document.visibilityState');
  console.log('  ✅ PASS: Session heartbeat skips background execution when screen is off.');

  // ---------------------------------------------------------------
  // CHECK 4: Dynamic Listener Refresh on Staff Terminal Unlock
  // ---------------------------------------------------------------
  console.log('\n📍 CHECK 4: Dynamic Listener Refresh on Staff Terminal Unlock');
  const unlockIdx = staffContent.indexOf('function unlockTerminal(');
  assert.ok(unlockIdx > 0, 'Must locate unlockTerminal');
  const unlockBlock = staffContent.slice(unlockIdx, unlockIdx + 3000);

  assert.ok(unlockBlock.includes('attachFirestoreListener'), 'unlockTerminal must trigger attachFirestoreListener to dynamically adjust role listeners');
  console.log('  ✅ PASS: Staff unlock triggers dynamic listener reassessment.');

  console.log('\n====================================================================');
  console.log('🎉 ALL 4 PHASE 2 AUDIT CHECKS PASSED 100%!');
  console.log('====================================================================');
}

runAudit().catch(err => {
  console.error('❌ Phase 2 Audit Failed:', err);
  process.exit(1);
});
