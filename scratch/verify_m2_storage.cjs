// scratch/verify_m2_storage.cjs
// Programmatic Verification Suite for Milestone M2:
// Persistent Disk Storage, Static Route, Upload/Delete Endpoints & Menu Metadata Hygiene

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';

console.log("==============================================================================");
console.log("🧪 VERIFYING MILESTONE M2: STORAGE, STATIC ROUTE, ENDPOINTS & METADATA HYGIENE");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failed++;
  }
}

(async () => {
  // 1. Directory creation check
  test("M2-DIR-01: uploads/food-images/ exists on disk", () => {
    const targetDir = path.join(__dirname, '..', 'uploads', 'food-images');
    assert.ok(fs.existsSync(targetDir), "uploads/food-images must exist");
  });

  // 2. Syntax & Exports check
  const serverModule = await import('../server.js');
  const app = serverModule.app;
  assert.ok(app, "server.js must export Express app");
  assert.ok(typeof serverModule.detectImageMagicBytes === 'function', "server.js must export detectImageMagicBytes");

  test("M2-MIM-01: detectImageMagicBytes correctly identifies JPEG, PNG, WebP and rejects invalid headers", () => {
    const jpegBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const webpBuf = Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8 ', 'ascii');
    const exeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'ascii');
    const smallBuf = Buffer.from([0x01, 0x02]);

    assert.deepStrictEqual(serverModule.detectImageMagicBytes(jpegBuf), { mime: 'image/jpeg', ext: 'jpg' });
    assert.deepStrictEqual(serverModule.detectImageMagicBytes(pngBuf), { mime: 'image/png', ext: 'png' });
    assert.deepStrictEqual(serverModule.detectImageMagicBytes(webpBuf), { mime: 'image/webp', ext: 'webp' });
    assert.strictEqual(serverModule.detectImageMagicBytes(exeBuf), null);
    assert.strictEqual(serverModule.detectImageMagicBytes(smallBuf), null);
  });

  // Start an ephemeral test server instance to test live HTTP routes
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request(method, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(reqPath, baseUrl);
      const req = http.request(url, { method, headers }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(data); } catch (e) {}
          resolve({ status: res.statusCode, headers: res.headers, body: json || data });
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  // 3. Static route & 404 fallthrough test
  await testAsync("M2-STATIC-01: Missing file under /uploads/food-images/ returns HTTP 404 (does not fall through to index.html)", async () => {
    const res = await request('GET', '/uploads/food-images/non_existent_image_12345.jpg');
    assert.strictEqual(res.status, 404, `Expected 404, got ${res.status}`);
    assert.ok(typeof res.body === 'string' && res.body.includes('Cannot GET'), "Should not return HTML index");
  });

  await testAsync("M2-STATIC-02: Existing file under /uploads/food-images/ returns HTTP 200 with cache headers", async () => {
    const testFilename = `static_test_${Date.now()}.jpg`;
    const uploadsFoodImages = path.join(__dirname, '..', 'uploads', 'food-images');
    const filePath = path.join(uploadsFoodImages, testFilename);
    const testContent = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x11, 0x22, 0xFF, 0xD9]);
    fs.writeFileSync(filePath, testContent);

    try {
      const res = await request('GET', `/uploads/food-images/${testFilename}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['cache-control']?.includes('max-age=604800'), "Expected max-age=604800");
      assert.ok(res.headers['cache-control']?.includes('immutable'), "Expected immutable");
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });

  // 4. POST /api/food-images/save tests
  await testAsync("M2-SAVE-01: POST /api/food-images/save saves valid JPEG and returns metadata", async () => {
    const mockB64 = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x12, 0x34, 0xFF, 0xD9]).toString('base64');
    const res = await request('POST', '/api/food-images/save', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_test_save',
      dishName: 'Paneer Tikka',
      base64Data: `data:image/jpeg;base64,${mockB64}`,
      mimeType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.image);
    assert.strictEqual(res.body.image.source, 'gemini-imagen');
    assert.strictEqual(res.body.image.approved, true);
    assert.ok(res.body.image.url.startsWith('/uploads/food-images/'));
    assert.ok(res.body.image.filename.startsWith('dish_test_save_'));
    assert.ok(res.body.image.filename.endsWith('.jpg'));

    const diskFile = path.join(__dirname, '..', 'uploads', 'food-images', res.body.image.filename);
    assert.ok(fs.existsSync(diskFile), "File must be written to disk");
    fs.unlinkSync(diskFile); // cleanup
  });

  await testAsync("M2-SAVE-02: POST /api/food-images/save rejects missing dishId or base64Data", async () => {
    const res1 = await request('POST', '/api/food-images/save', { 'Content-Type': 'application/json' }, {
      base64Data: 'dummy'
    });
    assert.strictEqual(res1.status, 400);

    const res2 = await request('POST', '/api/food-images/save', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_1'
    });
    assert.strictEqual(res2.status, 400);
  });

  // 5. POST /api/food-images/upload tests
  await testAsync("M2-UP-01: POST /api/food-images/upload accepts valid JPEG upload under 3MB", async () => {
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9]);
    const res = await request('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_admin_up',
      base64Data: jpegBuffer.toString('base64'),
      mimeType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.image.source, 'upload');
    assert.strictEqual(res.body.image.approved, true);

    const diskFile = path.join(__dirname, '..', 'uploads', 'food-images', res.body.image.filename);
    assert.ok(fs.existsSync(diskFile));
    fs.unlinkSync(diskFile); // cleanup
  });

  await testAsync("M2-UP-02: POST /api/food-images/upload accepts valid PNG and WebP uploads", async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const resPng = await request('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_png',
      base64Data: pngBuffer.toString('base64'),
      mimeType: 'image/png'
    });
    assert.strictEqual(resPng.status, 200);
    assert.ok(resPng.body.image.filename.endsWith('.png'));
    fs.unlinkSync(path.join(__dirname, '..', 'uploads', 'food-images', resPng.body.image.filename));

    const webpBuffer = Buffer.from('RIFF\x20\x00\x00\x00WEBPVP8 ', 'ascii');
    const resWebp = await request('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_webp',
      base64Data: webpBuffer.toString('base64'),
      mimeType: 'image/webp'
    });
    assert.strictEqual(resWebp.status, 200);
    assert.ok(resWebp.body.image.filename.endsWith('.webp'));
    fs.unlinkSync(path.join(__dirname, '..', 'uploads', 'food-images', resWebp.body.image.filename));
  });

  await testAsync("M2-UP-03: POST /api/food-images/upload rejects payloads exceeding 3MB limit with HTTP 413", async () => {
    const bigBuf = Buffer.alloc(3.1 * 1024 * 1024);
    bigBuf[0] = 0xFF; bigBuf[1] = 0xD8; bigBuf[2] = 0xFF;
    const res = await request('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_too_big',
      base64Data: bigBuf.toString('base64')
    });
    assert.strictEqual(res.status, 413);
    assert.ok(res.body.error.includes('3MB'));
  });

  await testAsync("M2-UP-04: POST /api/food-images/upload rejects malicious executable headers with HTTP 400", async () => {
    const exeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'ascii');
    const res = await request('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'dish_malicious',
      base64Data: exeBuf.toString('base64'),
      filename: 'exploit.jpg'
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error.includes('Allowed types: JPEG, PNG, WebP'));
  });

  // 6. DELETE /api/food-images/:filename tests
  await testAsync("M2-DEL-01: DELETE /api/food-images/:filename unlinks file and returns confirmation", async () => {
    const testFile = `del_verify_${Date.now()}.jpg`;
    const targetPath = path.join(__dirname, '..', 'uploads', 'food-images', testFile);
    fs.writeFileSync(targetPath, 'dummy_content');
    assert.ok(fs.existsSync(targetPath));

    const res = await request('DELETE', `/api/food-images/${testFile}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deletedFilename, testFile);
    assert.strictEqual(fs.existsSync(targetPath), false);
  });

  await testAsync("M2-DEL-02: DELETE /api/food-images/:filename safely neutralizes path traversal attempts", async () => {
    const res = await request('DELETE', '/api/food-images/..%2Fserver.js');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.deletedFilename, 'server.js');
    assert.strictEqual(res.body.notFound, true);
    // Real server.js must NOT be deleted
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'server.js')));
  });

  server.close();

  // 7. js/core.js sanitizeMenuItemForStorage test
  test("M2-HYG-01: sanitizeMenuItemForStorage in js/core.js strips base64 >2048 chars and keeps clean URLs", () => {
    const coreJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
    assert.ok(coreJs.includes('function sanitizeMenuItemForStorage('), "sanitizeMenuItemForStorage must be defined in js/core.js");
    assert.ok(coreJs.includes('2048'), "Must check > 2048 characters threshold");

    // Execute the function in isolated scope
    const fnMatch = coreJs.match(/function sanitizeMenuItemForStorage\([\s\S]*?\n\}/);
    assert.ok(fnMatch, "Function must match");
    const testSanitizer = new Function(`
      const getCuratedFoodPhoto = () => 'https://images.unsplash.com/mock-photo';
      ${fnMatch[0]}
      return sanitizeMenuItemForStorage;
    `)();

    // Test with >2048 base64
    const heavyDish = {
      id: 501,
      name: 'Heavy Base64 Dish',
      image: 'data:image/jpeg;base64,' + 'A'.repeat(3000)
    };
    const sanitizedHeavy = testSanitizer(heavyDish);
    assert.notStrictEqual(sanitizedHeavy.image, heavyDish.image);
    assert.ok(!sanitizedHeavy.image.startsWith('data:image/'));
    assert.ok(sanitizedHeavy.image.startsWith('https://images.unsplash.com/'));

    // Test with <= 2048 base64 (small svg/icon)
    const smallDish = {
      id: 502,
      name: 'Small Dish',
      image: 'data:image/png;base64,1234'
    };
    const sanitizedSmall = testSanitizer(smallDish);
    assert.strictEqual(sanitizedSmall.image, 'data:image/png;base64,1234');

    // Test with relative URL
    const relativeDish = {
      id: 503,
      name: 'Relative Dish',
      image: '/uploads/food-images/dish_1.jpg'
    };
    const sanitizedRel = testSanitizer(relativeDish);
    assert.strictEqual(sanitizedRel.image, '/uploads/food-images/dish_1.jpg');

    // Test with remote URL
    const remoteDish = {
      id: 504,
      name: 'Remote Dish',
      image: 'https://images.unsplash.com/photo-test'
    };
    const sanitizedRemote = testSanitizer(remoteDish);
    assert.strictEqual(sanitizedRemote.image, 'https://images.unsplash.com/photo-test');
  });

  test("M2-HYG-02: persistMenu in js/core.js applies sanitizeMenuItemForStorage to menu items", () => {
    const coreJs = fs.readFileSync(path.join(__dirname, '..', 'js', 'core.js'), 'utf8');
    assert.ok(coreJs.includes('sanitizeMenuItemForStorage'), "persistMenu must call sanitizeMenuItemForStorage");
    assert.ok(coreJs.includes('menuItems.map(item => sanitizeMenuItemForStorage(item))') || coreJs.includes('sanitizeMenuItemForStorage(item)'), "Must map menuItems through sanitizer");
  });

  // Summary
  console.log("\n==============================================================================");
  console.log(`🎯 M2 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
  console.log("==============================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("🎉 ALL MILESTONE M2 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!\n");
    process.exit(0);
  }
})();
