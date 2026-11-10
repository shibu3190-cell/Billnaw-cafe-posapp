const { CONFIG } = require('../server/config.js');

function jsonToFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(v => jsonToFirestoreValue(v)).filter(v => v !== undefined)
      }
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = jsonToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function jsonToFirestoreFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = jsonToFirestoreValue(v);
    }
  }
  return fields;
}

async function testFullDocSync() {
  const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
  const url = `${base}/shops/SHOP-TEST-SYNC-DEV`;
  
  const payload = {
    storeCode: "SHOP-TEST-SYNC-DEV",
    name: "Sync Test Store",
    profile: {
      name: "Sync Test Store",
      phone: "9876543210",
      address: "123 Test St",
      tableCount: 12
    },
    staff: [
      { id: 1, name: "Admin", role: "Admin", pin_hash: "abc123hash", pin_salt: "salt1", status: "Active" },
      { id: 2, name: "Cashier John", role: "Cashier", pin_hash: "def456hash", pin_salt: "salt2", status: "Active" }
    ],
    tables: {
      "1": { items: [], status: "empty" },
      "2": { items: [{ name: "Samosa", price: 15, qty: 2 }], status: "occupied" }
    },
    menu: [
      { id: 101, name: "Samosa", price: 15, category: "Snacks" },
      { id: 102, name: "Tea", price: 10, category: "Beverages" }
    ],
    categories: ["All", "Snacks", "Beverages"],
    history: [
      { id: "ORD-101", billNo: "1001", amount: 30, table: "2", date: "2026-11-10" }
    ],
    expenses: [
      { id: "EXP-101", amount: 100, note: "Vegetables", category: "Kitchen" }
    ],
    updatedAt: new Date().toISOString()
  };

  console.log('Sending full document to Firestore...');
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: jsonToFirestoreFields(payload) })
  });

  console.log('PATCH Status:', res.status, res.statusText);
  if (!res.ok) {
    console.error('Error:', await res.text());
    return;
  }

  // Also sync staff to subcollection
  for (const s of payload.staff) {
    const subUrl = `${url}/staff/${s.id}`;
    const subRes = await fetch(subUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: jsonToFirestoreFields(s) })
    });
    console.log(`Subdoc staff/${s.id} status:`, subRes.status);
  }

  // Read back to verify
  const readRes = await fetch(url);
  const readData = await readRes.json();
  console.log('Readback storeCode:', readData.fields?.storeCode?.stringValue);
  console.log('Readback staff count:', readData.fields?.staff?.arrayValue?.values?.length);
  console.log('Readback menu count:', readData.fields?.menu?.arrayValue?.values?.length);
  console.log('Readback tables count:', Object.keys(readData.fields?.tables?.mapValue?.fields || {}).length);
  console.log('Readback history count:', readData.fields?.history?.arrayValue?.values?.length);
  console.log('Readback expenses count:', readData.fields?.expenses?.arrayValue?.values?.length);
  
  // Clean up test document
  await fetch(url, { method: 'DELETE' });
  await fetch(`${url}/staff/1`, { method: 'DELETE' });
  await fetch(`${url}/staff/2`, { method: 'DELETE' });
  console.log('Cleaned up test document.');
}

testFullDocSync().catch(console.error);
