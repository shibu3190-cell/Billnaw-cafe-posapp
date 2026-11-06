const https = require('https');

const proj = 'abhi-pro-cafe-pos';
const dbId = 'ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda';

async function testFirestoreRest() {
  const email = 'test_check@example.com';
  const encodedEmail = encodeURIComponent(email);
  const docPath = `https://firestore.googleapis.com/v1/projects/${proj}/databases/${dbId}/documents/clients/_auth/otp/${encodedEmail}`;

  // 1. Write OTP document
  const body = JSON.stringify({
    fields: {
      otp: { stringValue: '123456' },
      email: { stringValue: email },
      expiresAt: { integerValue: String(Date.now() + 600000) },
      attempts: { integerValue: '0' }
    }
  });

  console.log('Writing test doc to:', docPath);
  const writeRes = await fetch(docPath, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  console.log('Write status:', writeRes.status);
  const writeJson = await writeRes.json();
  console.log('Write result name:', writeJson.name);

  // 2. Read back
  const readRes = await fetch(docPath);
  console.log('Read status:', readRes.status);
  const readJson = await readRes.json();
  console.log('Read fields:', readJson.fields);

  // 3. Delete
  const delRes = await fetch(docPath, { method: 'DELETE' });
  console.log('Delete status:', delRes.status);
}

testFirestoreRest().catch(console.error);
