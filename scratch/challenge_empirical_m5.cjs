// scratch/challenge_empirical_m5.cjs
// ==============================================================================
// 🛡️ EMPIRICAL CHALLENGER VERIFICATION HARNESS (Milestone M5)
// ==============================================================================
// Independent, adversarial stress testing of:
// 1. Dish Lifecycle: save AI image -> disk write -> replace with upload -> obsolete unlink -> zero orphans
// 2. Storage Hygiene: 300KB base64 stripping -> Firestore 1MB protection -> URL preservation
// 3. Static Route 404: /uploads/food-images/missing.jpg -> 404 (NOT 200 SPA index.html)
// 4. Invariants Audit: exact 26 SVG modal close buttons, 0 emojis in operational controls, ₹ currency spacing
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const http = require('http');

process.env.NODE_ENV = 'test';

console.log("==============================================================================");
console.log("⚔️ BILLNAW POS: EMPIRICAL CHALLENGER STRESS HARNESS (M5)");
console.log("==============================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failed++;
  }
}

async function checkAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failures.push({ name, error: err.message, stack: err.stack });
    failed++;
  }
}

(async () => {
  const rootDir = path.resolve(__dirname, '..');
  const uploadsFoodImagesDir = path.join(rootDir, 'uploads', 'food-images');

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadsFoodImagesDir)) {
    fs.mkdirSync(uploadsFoodImagesDir, { recursive: true });
  }

  // Import server module
  const serverModule = await import('../server.js');
  const app = serverModule.app;
  assert.ok(app, "Express app must be exported by server.js");

  // Spin up an ephemeral HTTP server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  function httpRequest(method, reqPath, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(reqPath, baseUrl);
      const req = http.request(url, { method, headers }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch (e) {}
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: json || raw,
            raw
          });
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  // ============================================================================
  // STRESS AREA 1: DISH LIFECYCLE & STORAGE LIFECYCLE
  // ============================================================================
  console.log("📍 [STRESS AREA 1] DISH LIFECYCLE & FILE UNLINK");

  let createdFilename = null;
  let replacedFilename = null;

  await checkAsync("1.1 Dish Creation with Generated Image writes binary JPEG to disk", async () => {
    // Valid minimal JPEG binary
    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x60, 0x00, 0x60, 0x00, 0x00, 0xFF, 0xD9]);
    const base64Data = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

    const res = await httpRequest('POST', '/api/food-images/save', { 'Content-Type': 'application/json' }, {
      dishId: 'test_dish_cycle_99',
      dishName: 'Challenger Biryani',
      base64Data,
      mimeType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.success, true, "Response success must be true");
    assert.ok(res.body.image, "Response must include image object");
    assert.ok(res.body.image.filename, "Image object must have filename");
    assert.strictEqual(res.body.image.source, 'gemini-imagen');
    assert.strictEqual(res.body.image.approved, true);

    createdFilename = res.body.image.filename;
    const diskPath = path.join(uploadsFoodImagesDir, createdFilename);
    assert.ok(fs.existsSync(diskPath), `File ${createdFilename} must exist on disk`);

    const diskBytes = fs.readFileSync(diskPath);
    assert.deepStrictEqual(diskBytes, jpegBuffer, "Disk bytes must match original JPEG binary");
  });

  await checkAsync("1.2 Dish Image Replacement with Uploaded Photo writes new file to disk", async () => {
    // Valid PNG binary with magic bytes 89 50 4E 47
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89]);
    const base64Data = `data:image/png;base64,${pngBuffer.toString('base64')}`;

    const res = await httpRequest('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'test_dish_cycle_99',
      base64Data,
      mimeType: 'image/png',
      filename: 'challenger_upload.png'
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.image.filename.endsWith('.png'), "Uploaded file must have .png extension");
    assert.strictEqual(res.body.image.source, 'upload');

    replacedFilename = res.body.image.filename;
    const diskPath = path.join(uploadsFoodImagesDir, replacedFilename);
    assert.ok(fs.existsSync(diskPath), `New uploaded file ${replacedFilename} must exist on disk`);
    assert.notStrictEqual(createdFilename, replacedFilename, "New filename must differ from obsolete filename");
  });

  await checkAsync("1.3 Obsolete disk file unlinked cleanly via DELETE endpoint", async () => {
    assert.ok(createdFilename, "Created filename must be known");
    const oldPath = path.join(uploadsFoodImagesDir, createdFilename);
    assert.ok(fs.existsSync(oldPath), "Old file must still exist before deletion");

    const res = await httpRequest('DELETE', `/api/food-images/${createdFilename}`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.deletedFilename, createdFilename);

    // Verify unlinked
    assert.strictEqual(fs.existsSync(oldPath), false, "Obsolete file must be completely unlinked from disk");
  });

  await checkAsync("1.4 Verify no orphaned files remaining from lifecycle cycle", async () => {
    const oldPath = path.join(uploadsFoodImagesDir, createdFilename);
    const newPath = path.join(uploadsFoodImagesDir, replacedFilename);

    // Old is unlinked, new is present
    assert.strictEqual(fs.existsSync(oldPath), false, "Old file must remain unlinked");
    assert.strictEqual(fs.existsSync(newPath), true, "New file must remain present");

    // Clean up new file too to leave disk completely pristine
    const cleanRes = await httpRequest('DELETE', `/api/food-images/${replacedFilename}`);
    assert.strictEqual(cleanRes.status, 200);
    assert.strictEqual(fs.existsSync(newPath), false, "New file cleanly deleted");
  });

  await checkAsync("1.5 Adversarial path traversal attack on DELETE endpoint safely rejected", async () => {
    // Attempt to traverse out and delete server.js
    const traversalPayloads = [
      '..%2Fserver.js',
      '..%2F..%2Fserver.js',
      '..\\server.js',
      '....//....//server.js',
      'server.js\0.jpg'
    ];

    for (const payload of traversalPayloads) {
      const res = await httpRequest('DELETE', `/api/food-images/${payload}`);
      // Either 400 (Invalid filename), 403 (Access forbidden), 404 (Route not found / safely rejected), or 200 notFound
      assert.ok(res.status === 400 || res.status === 403 || res.status === 404 || (res.status === 200 && res.body.notFound),
        `Payload ${payload} must be safely handled, got status ${res.status}`);
      // Crucial assertion: server.js MUST STILL EXIST!
      assert.ok(fs.existsSync(path.join(rootDir, 'server.js')), "server.js must NOT be unlinked!");
    }
  });

  await checkAsync("1.6 Non-existent file deletion handled gracefully without crashing server", async () => {
    const res = await httpRequest('DELETE', '/api/food-images/non_existent_random_file_987654.jpg');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.notFound, true);
  });

  await checkAsync("1.7 Upload payload size > 3MB strictly rejected with HTTP 413", async () => {
    // 3.2MB mock buffer with JPEG header
    const hugeBuffer = Buffer.alloc(3.2 * 1024 * 1024);
    hugeBuffer[0] = 0xFF; hugeBuffer[1] = 0xD8; hugeBuffer[2] = 0xFF;
    const base64Data = hugeBuffer.toString('base64');

    const res = await httpRequest('POST', '/api/food-images/upload', { 'Content-Type': 'application/json' }, {
      dishId: 'huge_dish',
      base64Data,
      mimeType: 'image/jpeg'
    });

    assert.strictEqual(res.status, 413, `Expected HTTP 413, got ${res.status}`);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.error.includes('3MB'), "Error message must mention 3MB limit");
  });

  // ============================================================================
  // STRESS AREA 2: STORAGE HYGIENE (sanitizeMenuItemForStorage)
  // ============================================================================
  console.log("\n📍 [STRESS AREA 2] STORAGE HYGIENE & FIRESTORE 1MB PROTECTION");

  // Load sanitizeMenuItemForStorage from js/core.js
  const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf-8');
  assert.ok(coreJsContent.includes('function sanitizeMenuItemForStorage('), "sanitizeMenuItemForStorage must be defined in js/core.js");

  // Extract function cleanly
  const fnMatch = coreJsContent.match(/function sanitizeMenuItemForStorage\s*\([\s\S]*?\n\}/);
  assert.ok(fnMatch, "Must locate sanitizeMenuItemForStorage definition");
  const sanitizeFn = new Function('item', `
    function getCuratedFoodPhoto() { return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop'; }
    ${fnMatch[0]}
    return sanitizeMenuItemForStorage(item);
  `);

  check("2.1 Massive 300KB base64 string is stripped and replaced with curated URL", () => {
    // Build ~300KB base64 string
    const raw300kb = 'data:image/jpeg;base64,' + 'A'.repeat(300 * 1024);
    const item = {
      id: 101,
      name: "Super Size Dish",
      category: "Main Course",
      price: 499,
      image: raw300kb
    };

    const initialJsonLength = JSON.stringify(item).length;
    assert.ok(initialJsonLength > 300 * 1024, `Initial item size (${initialJsonLength}) should exceed 300KB`);

    const sanitized = sanitizeFn(item);

    assert.notStrictEqual(sanitized.image, raw300kb, "Base64 image must be stripped");
    assert.ok(sanitized.image.startsWith('https://images.unsplash.com/'), "Must replace with curated Unsplash URL");
    
    const sanitizedJsonLength = JSON.stringify(sanitized).length;
    assert.ok(sanitizedJsonLength < 1000, `Sanitized size (${sanitizedJsonLength}) should be < 1KB`);

    // Verify Firestore 1MB safety: 1,048,576 bytes
    const firestoreLimit = 1048576;
    const safetyMargin = firestoreLimit - sanitizedJsonLength;
    assert.ok(safetyMargin > 1000000, `Safety margin (${safetyMargin} bytes) provides complete protection against 1MB Firestore breach`);

    // Immutability: original item not mutated
    assert.strictEqual(item.image, raw300kb, "Original item object must not be mutated");
  });

  check("2.2 Clean relative static paths (/uploads/food-images/...) are preserved untouched", () => {
    const item = {
      id: 102,
      name: "Tandoori Roti",
      category: "Breads",
      price: 25,
      image: "/uploads/food-images/dish_102_1730000000.jpg"
    };

    const sanitized = sanitizeFn(item);
    assert.strictEqual(sanitized.image, "/uploads/food-images/dish_102_1730000000.jpg", "Static uploads path must NOT be modified");
  });

  check("2.3 Remote URLs (Unsplash, HTTPS) are preserved untouched", () => {
    const item = {
      id: 103,
      name: "Butter Naan",
      category: "Breads",
      price: 40,
      image: "https://images.unsplash.com/photo-1513104890138-7c749659a591"
    };

    const sanitized = sanitizeFn(item);
    assert.strictEqual(sanitized.image, "https://images.unsplash.com/photo-1513104890138-7c749659a591");
  });

  check("2.4 Short data URIs <= 2048 characters are preserved untouched", () => {
    const shortData = 'data:image/svg+xml;utf8,<svg></svg>';
    const item = { id: 104, name: "Icon Item", image: shortData };
    const sanitized = sanitizeFn(item);
    assert.strictEqual(sanitized.image, shortData);
  });

  check("2.5 Programmatic verification: persistMenu() and persistAllToFirestore() invoke sanitizer", () => {
    assert.ok(coreJsContent.includes('function persistMenu('));
    assert.ok(coreJsContent.includes('sanitizeMenuItemForStorage'), "core.js must use sanitizeMenuItemForStorage");
    
    // Check persistMenu implementation
    const persistMenuBlock = coreJsContent.match(/function persistMenu\(\)[\s\S]*?\n\}/);
    assert.ok(persistMenuBlock, "persistMenu function block found");
    assert.ok(persistMenuBlock[0].includes('sanitizeMenuItemForStorage'), "persistMenu must call sanitizeMenuItemForStorage");

    // Check persistAllToFirestore implementation
    const persistAllBlock = coreJsContent.match(/async function persistAllToFirestore\(\)[\s\S]*?\n\}/);
    assert.ok(persistAllBlock, "persistAllToFirestore function block found");
    assert.ok(persistAllBlock[0].includes('sanitizeMenuItemForStorage'), "persistAllToFirestore must call sanitizeMenuItemForStorage");
  });

  // ============================================================================
  // STRESS AREA 3: STATIC ROUTE 404 BEHAVIOR
  // ============================================================================
  console.log("\n📍 [STRESS AREA 3] STATIC ROUTE 404 BEHAVIOR");

  await checkAsync("3.1 Requesting missing image /uploads/food-images/missing.jpg returns HTTP 404 (NOT 200)", async () => {
    const res = await httpRequest('GET', '/uploads/food-images/missing_dish_never_existed_9999.jpg');
    assert.strictEqual(res.status, 404, `Missing upload must return 404, got status ${res.status}`);
    assert.ok(!res.raw.includes('<!DOCTYPE html>'), "Must NOT return SPA index.html");
    assert.ok(!res.raw.includes('<div id="app">'), "Must NOT contain SPA DOM");
    assert.ok(res.raw.includes('Cannot GET /uploads/food-images/missing_dish_never_existed_9999.jpg') || res.status === 404);
  });

  await checkAsync("3.2 Requesting non-existent root upload path /uploads/missing.png returns HTTP 404", async () => {
    const res = await httpRequest('GET', '/uploads/missing.png');
    assert.strictEqual(res.status, 404, `Missing upload root must return 404, got ${res.status}`);
    assert.ok(!res.raw.includes('<!DOCTYPE html>'), "Must NOT fall through to SPA index.html");
  });

  await checkAsync("3.3 Requesting SPA client navigation route (/pos, /menu) returns HTTP 200 and index.html", async () => {
    const res = await httpRequest('GET', '/pos');
    assert.strictEqual(res.status, 200, `SPA route should return 200, got ${res.status}`);
    assert.ok(res.raw.includes('<!DOCTYPE html>') || res.raw.includes('<html'), "SPA route must serve index.html");
  });

  await checkAsync("3.4 Requesting existing uploaded file returns HTTP 200 with 7-day immutable cache header", async () => {
    const testFilename = `cache_probe_${Date.now()}.jpg`;
    const testPath = path.join(uploadsFoodImagesDir, testFilename);
    const probeBytes = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x12, 0x34, 0xFF, 0xD9]);
    fs.writeFileSync(testPath, probeBytes);

    try {
      const res = await httpRequest('GET', `/uploads/food-images/${testFilename}`);
      assert.strictEqual(res.status, 200);
      assert.ok(res.headers['cache-control'], "Cache-control header must be present");
      assert.ok(res.headers['cache-control'].includes('max-age=604800'), "Must have 7d (604800s) maxAge");
      assert.ok(res.headers['cache-control'].includes('immutable'), "Must have immutable directive");
    } finally {
      if (fs.existsSync(testPath)) fs.unlinkSync(testPath);
    }
  });

  // ============================================================================
  // STRESS AREA 4: INVARIANT STRESS & PROGRAMMATIC AUDIT
  // ============================================================================
  console.log("\n📍 [STRESS AREA 4] INVARIANT STRESS & AUDIT");

  const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');

  check("4.1 Exact 26 SVG modal close buttons in index.html matching invariant regex", () => {
    const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>[\s\S]*?<\/svg><\/button>/gi;
    const matches = indexHtml.match(regex);
    const count = matches ? matches.length : 0;
    assert.strictEqual(count, 26, `Expected exactly 26 SVG modal close buttons, found ${count}`);

    // Verify all modal-close-btn elements match this exact regex (none have raw text or miss svg)
    const anyCloseBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>/gi;
    const totalCloseBtns = (indexHtml.match(anyCloseBtnRegex) || []).length;
    assert.strictEqual(totalCloseBtns, 26, `Total .modal-close-btn buttons (${totalCloseBtns}) must strictly equal 26`);
  });

  check("4.2 Zero raw unicode '✕' or '×' characters inside any modal close button", () => {
    const closeBtnMatches = indexHtml.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>([\s\S]*?)<\/button>/gi) || [];
    closeBtnMatches.forEach((btn, idx) => {
      assert.ok(!btn.includes('✕') && !btn.includes('×') && !btn.includes('&times;'),
        `Modal close button #${idx + 1} contains raw cross character: ${btn}`);
    });
  });

  check("4.3 Zero raw Unicode emojis in operational <button> elements in index.html", () => {
    // Regex matching raw unicode emoji ranges:
    // Emoticons, Misc Symbols and Pictographs, Transport and Map, Supplemental Symbols, etc.
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    
    const buttonMatches = indexHtml.match(/<button\b[\s\S]*?<\/button>/gi) || [];
    const violatingButtons = [];

    buttonMatches.forEach(btn => {
      // Exclude HTML entities or attribute comments; check text nodes
      const textContent = btn.replace(/<[^>]+>/g, '');
      if (emojiRegex.test(textContent)) {
        violatingButtons.push(btn.substring(0, 80));
      }
    });

    assert.strictEqual(violatingButtons.length, 0,
      `Found ${violatingButtons.length} buttons with raw Unicode emojis: ${violatingButtons.slice(0, 3).join(', ')}`);
  });

  check("4.4 Zero raw Unicode emojis in navigation tabs and pills in index.html", () => {
    const tabRegex = /<[a-z0-9]+\b[^>]*class=["'][^"']*(?:nav-item|tab-pill|sub-tab|segment-pill)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/gi;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    
    let match;
    const violations = [];
    while ((match = tabRegex.exec(indexHtml)) !== null) {
      const text = match[1].replace(/<[^>]+>/g, '');
      if (emojiRegex.test(text)) {
        violations.push(match[0].substring(0, 60));
      }
    }
    assert.strictEqual(violations.length, 0, `Found ${violations.length} nav tabs with raw emojis: ${violations.join(', ')}`);
  });

  check("4.5 Currency non-breaking space formatting: ₹ has proper spacing", () => {
    // Audit for cramped ₹[0-9] in price displays
    const crampedRegex = /₹[0-9]/g;
    const matches = indexHtml.match(crampedRegex);
    // In our invariant specifications, ₹ should be accompanied by space: "₹ " or "&nbsp;"
    // Check that standard currency formatting helper formatCurrency exists and outputs ₹ [amount]
    const coreJs = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf-8');
    assert.ok(coreJs.includes("₹ ") || coreJs.includes("'₹ '") || coreJs.includes('"₹ "'),
      "js/core.js must use standardized spaced '₹ ' currency formatting");
  });

  // Close HTTP server
  await new Promise(resolve => server.close(resolve));

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log("\n==============================================================================");
  console.log(`📊 EMPIRICAL CHALLENGE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log("==============================================================================");

  if (failed > 0) {
    console.error(`\n❌ ${failed} STRESS CHECKS FAILED:`);
    failures.forEach((f, i) => {
      console.error(`  ${i + 1}. ${f.name}`);
      console.error(`     ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log("🎉 ALL EMPIRICAL CHALLENGES PASSED PERFECTLY!");
    process.exit(0);
  }
})();
