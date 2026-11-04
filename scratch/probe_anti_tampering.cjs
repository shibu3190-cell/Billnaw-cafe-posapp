/**
 * Live Firestore Anti-Tampering Empirical Probe
 */
const https = require('https');

const base = 'https://firestore.googleapis.com/v1/projects/abhi-pro-cafe-pos/databases/ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda/documents';

async function test() {
  console.log('Testing live remote Firestore anti-tampering rules on abhi-pro-cafe-pos...');
  const invId = 'INV-AUDIT-' + Date.now();
  
  // 1. Create a settled invoice (status: PAID)
  const createRes = await fetch(`${base}/shops/SHOP-BILLNAW-01/invoices?documentId=${invId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        status: { stringValue: 'PAID' },
        total: { integerValue: '500' }
      }
    })
  });
  console.log(`Create Invoice [${invId}]: HTTP ${createRes.status}`);

  // 2. Attempt unauthorized physical deletion
  const delRes = await fetch(`${base}/shops/SHOP-BILLNAW-01/invoices/${invId}`, {
    method: 'DELETE'
  });
  console.log(`Physical DELETE Invoice [${invId}]: HTTP ${delRes.status} (Expected: 403 PERMISSION_DENIED)`);

  // 3. Attempt unauthorized patch without VOID transition
  const patchRes = await fetch(`${base}/shops/SHOP-BILLNAW-01/invoices/${invId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        total: { integerValue: '9999' }
      }
    })
  });
  console.log(`Unauthorized PATCH Invoice [${invId}]: HTTP ${patchRes.status} (Expected: 403 PERMISSION_DENIED)`);

  if (delRes.status === 403 && patchRes.status === 403) {
    console.log('✅ ANTI-TAMPERING INVARIANT EMPIRICALLY CONFIRMED ON PRODUCTION FIRESTORE!');
    process.exit(0);
  } else {
    console.error('❌ ANTI-TAMPERING FAILURE: Deletion or unauthorized patch was not denied!');
    process.exit(1);
  }
}

test().catch(err => {
  console.error('Probe error:', err);
  process.exit(1);
});
