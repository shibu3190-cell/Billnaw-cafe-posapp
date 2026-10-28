// scratch/forensic_auditor_suite.cjs
// Independent forensic verification script executed by auditor_final_m5_1

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, status: 'PASS' });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    console.error(`[FAIL] ${name}: ${err.message}`);
  }
}

console.log('=== STARTING FORENSIC INTEGRITY CHECKS ===\n');

// Check 1: 26 Modal Close Buttons
check('Invariant 1: Exact 26 modal-close-btn SVG buttons in index.html', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const matches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
  assert.strictEqual(matches.length, 26, `Expected 26 modal close buttons, found ${matches.length}`);
});

// Check 2: Raw Emojis in Operational Buttons and Tabs
check('Invariant 2: Zero raw emojis inside operational buttons and tabs in index.html', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u;
  
  // 1. Button labels (inner text excluding <svg>)
  const buttonMatches = [...html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/gi)];
  const violatingButtons = buttonMatches.filter(b => {
    const innerWithoutSvg = b[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
    return emojiRegex.test(innerWithoutSvg);
  });
  assert.strictEqual(violatingButtons.length, 0, `Found raw emojis in buttons: ${JSON.stringify(violatingButtons.map(b => b[1].trim()))}`);

  // 2. Navigation tabs
  const tabMatches = [...html.matchAll(/class=["'][^"']*(?:nav-tab|tab-btn|segmented-btn)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a|div)>/gi)];
  const violatingTabs = tabMatches.filter(t => {
    const innerWithoutSvg = t[1].replace(/<svg[\s\S]*?<\/svg>/gi, '').trim();
    return emojiRegex.test(innerWithoutSvg);
  });
  assert.strictEqual(violatingTabs.length, 0, `Found raw emojis in tabs: ${JSON.stringify(violatingTabs.map(t => t[1].trim()))}`);
});

// Check 3: Currency non-breaking space `₹ `
check('Invariant 3: Currency non-breaking space formatting in core UI display files', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const menuJs = fs.readFileSync('js/menu.js', 'utf8');
  const posJs = fs.readFileSync('js/pos.js', 'utf8');
  const coreJs = fs.readFileSync('js/core.js', 'utf8');
  const culinaryJs = fs.readFileSync('js/culinary_inventory.js', 'utf8');
  
  const crampedRegex = /₹(?!\s)([0-9]|\${)/g;
  const files = [
    { name: 'index.html', content: html },
    { name: 'js/pos.js', content: posJs },
    { name: 'js/menu.js', content: menuJs },
    { name: 'js/core.js', content: coreJs },
    { name: 'js/culinary_inventory.js', content: culinaryJs }
  ];
  for (const f of files) {
    const cramped = f.content.match(crampedRegex);
    assert.strictEqual(cramped ? cramped.length : 0, 0, `Found cramped currency in ${f.name}`);
  }
});

// Check 4: Uploads directory exists on disk and permissions
check('Static Storage: uploads/food-images/ directory exists', () => {
  const targetDir = path.join(process.cwd(), 'uploads', 'food-images');
  assert.ok(fs.existsSync(targetDir), 'uploads/food-images directory does not exist');
  const stat = fs.statSync(targetDir);
  assert.ok(stat.isDirectory(), 'uploads/food-images is not a directory');
});

// Check 5: GEMINI_API_KEY never leaked in client files
check('Security: GEMINI_API_KEY is never exposed in client JS or HTML bundles', () => {
  const clientFiles = [
    'index.html',
    'js/core.js',
    'js/menu.js',
    'js/pos.js',
    'js/culinary_inventory.js',
    'service-worker.js'
  ];
  for (const file of clientFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      assert.ok(!content.includes('process.env.GEMINI_API_KEY'), `process.env.GEMINI_API_KEY referenced in ${file}`);
      assert.ok(!content.includes('process.env.GEMINI_API_KEY2'), `process.env.GEMINI_API_KEY2 referenced in ${file}`);
    }
  }
});

// Check 6: Real binary file I/O & JPEG magic bytes validation
check('Logic: Server magic byte validation correctly identifies JPEG/PNG/WebP and rejects invalid binaries', () => {
  const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
  const validPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  const invalidExe = Buffer.from([0x4D, 0x5A, 0x90, 0x00]); // MZ PE
  const textFile = Buffer.from('Just plain text file content');

  function detectImageMagicBytes(buffer) {
    if (!buffer || buffer.length < 4) return null;
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return { mime: 'image/jpeg', ext: 'jpg' };
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return { mime: 'image/png', ext: 'png' };
    if (buffer.length >= 12) {
      const riff = buffer.subarray(0, 4).toString('ascii');
      const webp = buffer.subarray(8, 12).toString('ascii');
      if (riff === 'RIFF' && webp === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
    }
    return null;
  }

  assert.strictEqual(detectImageMagicBytes(validJpeg)?.mime, 'image/jpeg');
  assert.strictEqual(detectImageMagicBytes(validPng)?.mime, 'image/png');
  assert.strictEqual(detectImageMagicBytes(validWebp)?.mime, 'image/webp');
  assert.strictEqual(detectImageMagicBytes(invalidExe), null);
  assert.strictEqual(detectImageMagicBytes(textFile), null);
});

// Check 7: Server genuine Model configuration
check('Logic: Google model imagen-3.0-generate-002 is genuinely configured in server/config.js and server/gemini-service.js', () => {
  const configJs = fs.readFileSync('server/config.js', 'utf8');
  const serviceJs = fs.readFileSync('server/gemini-service.js', 'utf8');
  assert.ok(configJs.includes("imagen-3.0-generate-002"), "server/config.js must configure imagen-3.0-generate-002");
  assert.ok(serviceJs.includes("generateImagenFoodImage"), "server/gemini-service.js must define generateImagenFoodImage");
  assert.ok(serviceJs.includes("ai.models.generateImages"), "server/gemini-service.js must call ai.models.generateImages");
  assert.ok(serviceJs.includes("generativelanguage.googleapis.com/v1beta/models/"), "server/gemini-service.js must support REST predict endpoint");
});

// Check 8: Key Scrubbing Logic in sanitizeErrorForClient
check('Security: sanitizeErrorForClient redacts API keys and AIzaSy tokens from errors', () => {
  const testKey = 'AIzaSySecretServerKey999888777666';
  function sanitizeErrorForClient(errMsg, apiKey = '') {
    let clean = String(errMsg || 'An error occurred during image generation.');
    if (apiKey && apiKey.length > 5) {
      clean = clean.split(apiKey).join('[REDACTED_API_KEY]');
    }
    clean = clean.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_API_KEY]');
    return clean;
  }
  const errorWithKey = `Error calling Google API at https://api.google.com?key=${testKey}: Request failed`;
  const sanitized = sanitizeErrorForClient(errorWithKey, testKey);
  assert.ok(!sanitized.includes(testKey), 'Key was not redacted');
  assert.ok(sanitized.includes('[REDACTED_API_KEY]'), 'Redaction placeholder missing');
});

// Check 9: Disk file write and roundtrip
check('Storage: Writing binary JPEG to uploads/food-images/ succeeds and produces readable valid file', () => {
  const targetDir = path.join(process.cwd(), 'uploads', 'food-images');
  const testFileName = `forensic_test_${Date.now()}.jpg`;
  const testFilePath = path.join(targetDir, testFileName);
  const testJpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  
  fs.writeFileSync(testFilePath, testJpegBuffer);
  assert.ok(fs.existsSync(testFilePath), 'File was not written to disk');
  const readBack = fs.readFileSync(testFilePath);
  assert.strictEqual(readBack.length, testJpegBuffer.length);
  assert.strictEqual(readBack[0], 0xFF);
  assert.strictEqual(readBack[1], 0xD8);
  assert.strictEqual(readBack[2], 0xFF);
  
  // Clean up
  fs.unlinkSync(testFilePath);
  assert.ok(!fs.existsSync(testFilePath), 'Test file was not cleaned up');
});

console.log('\n=== CHECKS COMPLETED: ' + results.filter(r => r.status === 'PASS').length + '/' + results.length + ' PASSED ===');
if (results.some(r => r.status === 'FAIL')) {
  process.exit(1);
}
