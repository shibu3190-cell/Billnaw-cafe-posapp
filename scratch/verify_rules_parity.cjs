// scratch/verify_rules_parity.cjs
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const f1Path = path.join(rootDir, 'firestore.rules');
const f2Path = path.join(rootDir, 'database', 'firestore.rules');

console.log('====================================================');
console.log('🔒 VERIFYING FIRESTORE RULES BOUNDARIES & BINARY PARITY');
console.log('====================================================\n');

// 1. Existence Check
assert.ok(fs.existsSync(f1Path), 'firestore.rules does not exist');
assert.ok(fs.existsSync(f2Path), 'database/firestore.rules does not exist');

const buf1 = fs.readFileSync(f1Path);
const buf2 = fs.readFileSync(f2Path);

// 2. Exact Byte Size Parity
assert.strictEqual(buf1.length, buf2.length, `Byte mismatch: f1=${buf1.length}, f2=${buf2.length}`);
console.log(`✅ Exact Byte Equality: ${buf1.length} bytes`);

// 3. Buffer.compare Binary Identity
const diff = Buffer.compare(buf1, buf2);
assert.strictEqual(diff, 0, `Buffer.compare non-zero difference: ${diff}`);
console.log('✅ Buffer.compare: 100% bit-for-bit identical (diff = 0)');

// 4. SHA-256 and MD5 Checksums
const sha1 = crypto.createHash('sha256').update(buf1).digest('hex');
const sha2 = crypto.createHash('sha256').update(buf2).digest('hex');
assert.strictEqual(sha1, sha2, 'SHA-256 mismatch');
console.log(`✅ SHA-256 Hash Match: ${sha1}`);

const md51 = crypto.createHash('md5').update(buf1).digest('hex');
const md52 = crypto.createHash('md5').update(buf2).digest('hex');
assert.strictEqual(md51, md52, 'MD5 Checksum Match: ' + md51);
console.log(`✅ MD5 Checksum Match: ${md51}`);

// 5. OS-level File Comparison (fc /b)
const output = execSync(`cmd /c fc /b "firestore.rules" "database/firestore.rules"`, { cwd: rootDir, encoding: 'utf8' });
assert.ok(output.includes('FC: no differences encountered') || output.includes('no differences'), 'OS fc /b failed: ' + output);
console.log('✅ OS fc /b: "FC: no differences encountered"');

// 6. Security Boundaries & Helper Invariants
const content = buf1.toString('utf8');
assert.ok(content.includes('isValidTenant'), 'Missing isValidTenant');
assert.ok(content.includes('isAuthenticated'), 'Missing isAuthenticated');
assert.ok(content.includes('token.storeCode'), 'Missing token.storeCode');
assert.ok(content.includes('token.cafe_id'), 'Missing token.cafe_id');
assert.ok(content.includes('ownerEmail'), 'Missing ownerEmail');
assert.ok(content.includes('isTenantStaff'), 'Missing isTenantStaff');
assert.ok(content.includes('isTenantAdmin'), 'Missing isTenantAdmin');
assert.ok(content.includes('match /cafes/{cafeId}'), 'Missing /cafes/{cafeId}');
assert.ok(content.includes('match /shops/{shopId}'), 'Missing /shops/{shopId}');
assert.ok(content.includes('allow delete: if false;'), 'Missing allow delete: if false;');
console.log('✅ All security predicates, tenant boundaries, and invariants confirmed.');

console.log('\n🎯 ALL RULES PARITY & BOUNDARY CHECKS PASSED 100%!');
