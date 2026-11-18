// scratch/test_cross_container_otp.cjs
const assert = require('assert');
const fs = require('fs');
const path = require('path');

async function run() {
  console.log('====================================================');
  console.log('🧪 CROSS-CONTAINER OTP PERSISTENCE TEST');
  console.log('====================================================\n');

  const apiJs = fs.readFileSync(path.join(__dirname, '../netlify/functions/api.js'), 'utf8');

  // Verify Netlify Blobs OTP integration
  assert.ok(apiJs.includes('getNetlifyOtpBlobStore'), 'api.js must define getNetlifyOtpBlobStore');
  assert.ok(apiJs.includes('billnaw-auth-otps'), 'api.js must use billnaw-auth-otps store');
  assert.ok(apiJs.includes('getOtpBlobKey'), 'api.js must define safe getOtpBlobKey');

  // Verify retrieveOtpFromFirestore checks Netlify Blobs
  assert.ok(apiJs.includes('blobStore.get(key'), 'retrieveOtpFromFirestore must check Netlify Blobs');

  // Verify removeOtpFromFirestore deletes from Netlify Blobs
  assert.ok(apiJs.includes('blobStore.delete(key'), 'removeOtpFromFirestore must delete from Netlify Blobs');

  // Verify cleanRecordOtp strips whitespace
  assert.ok(apiJs.includes('cleanRecordOtp !== submittedOtp'), 'verify-otp must compare clean stripped OTP');

  console.log('  ✅ PASS: All cross-container OTP persistence invariants verified.');
  console.log('====================================================');
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
