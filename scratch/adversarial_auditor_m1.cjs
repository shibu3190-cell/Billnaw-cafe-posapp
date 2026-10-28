const assert = require('assert');
const fs = require('fs');

async function runAdversarialAudit() {
  console.log("====================================================");
  console.log("🕵️ FORENSIC AUDITOR ADVERSARIAL STRESS TEST (M1)");
  console.log("====================================================");

  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (e) {
      console.error(`  ❌ FAIL: ${name}: ${e.message}`);
      failed++;
    }
  }

  // 1. Module Imports
  const geminiService = await import('../server/gemini-service.js');

  // Test 1: Absolute Purge of Aquarium Fish across server and core
  check("PURGE-1: Total absence of photo-1599488615731-7e5c2823ff28 across all server and client code", () => {
    const serverFile = fs.readFileSync('server/gemini-service.js', 'utf8');
    const coreFile = fs.readFileSync('js/core.js', 'utf8');
    const posFile = fs.readFileSync('js/pos.js', 'utf8');
    const indexFile = fs.readFileSync('index.html', 'utf8');
    
    assert.strictEqual(serverFile.includes('1599488615731'), false, "Must not exist in gemini-service.js");
    assert.strictEqual(coreFile.includes('1599488615731'), false, "Must not exist in js/core.js");
    assert.strictEqual(posFile.includes('1599488615731'), false, "Must not exist in js/pos.js");
    assert.strictEqual(indexFile.includes('1599488615731'), false, "Must not exist in index.html");
  });

  // Test 2: Mathematical Modulo Invariant for Paneer & Variations
  check("MODULO-1: Rigorous modulo cycling for Paneer across standard, large, and zero indices", () => {
    const url0 = geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 0);
    const url1 = geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 1);
    const url2 = geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 2);
    const url3 = geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 3);

    // Verify all 4 are distinct food photos
    const unique = new Set([url0, url1, url2, url3]);
    assert.strictEqual(unique.size, 4, "Must have 4 unique photographs for Paneer pool");

    // Kadai Paneer at index 3
    assert.ok(url3.includes('photo-1603894584373-5ac82b2ae398'), "Index 3 must be authentic Kadai Paneer photo");

    // Cycling at multiples of 4
    for (let cycle = 1; cycle <= 10; cycle++) {
      assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', cycle * 4 + 0), url0);
      assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', cycle * 4 + 1), url1);
      assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', cycle * 4 + 2), url2);
      assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', cycle * 4 + 3), url3);
    }
  });

  // Test 3: Adversarial / Boundary inputs for Variation Index
  check("BOUNDARY-1: Resilient handling of negative, float, string, and null variation indices", () => {
    const url0 = geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 0);

    // Negative should be clamped to 0 via Math.max(0, ...)
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', -1), url0, "Negative -1 clamps to 0");
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', -999), url0, "Negative -999 clamps to 0");

    // Float should parse via parseInt
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 1.8), geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 1));

    // String numbers
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', "2"), geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', 2));

    // Invalid non-numeric strings fallback safely to 0
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', "invalid"), url0);
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', null), url0);
    assert.strictEqual(geminiService.getCuratedFoodPhotoServer('Paneer', 'Main Course', undefined), url0);
  });

  // Test 4: Modal Close Button Integrity & Invariant
  check("INVARIANT-1: Exactly 26 SVG modal close buttons in index.html, non-dummy and functional", () => {
    const html = fs.readFileSync('index.html', 'utf8');
    const regex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[\s\S]*?<svg[^>]*>[\s\S]*?<\/svg>[\s\S]*?<\/button>/gi;
    const matches = [...html.matchAll(regex)];
    assert.strictEqual(matches.length, 26, `Must be exactly 26, found ${matches.length}`);

    // Verify none are dummy or hidden
    for (let i = 0; i < matches.length; i++) {
      const btn = matches[i][0];
      assert.ok(!btn.includes('display: none') && !btn.includes('display:none'), `Button #${i+1} must not be hidden`);
      assert.ok(!btn.includes('visibility: hidden') && !btn.includes('visibility:hidden'), `Button #${i+1} must not be invisible`);
      assert.ok(btn.includes('onclick=') || btn.includes('onclick ='), `Button #${i+1} must have an onclick handler`);
    }
  });

  // Test 5: Cart Item Compact Horizontal Layout & Thumb Positioning
  check("LAYOUT-1: .cart-item CSS defines sleek horizontal row layout with left thumbnail", () => {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.cart-item {'), "Must define .cart-item rule");
    assert.ok(css.includes('flex-direction: row;'), "Must be horizontal row flex");
    assert.ok(css.includes('min-height: 48px;'), "Must enforce min-height 48px");
    assert.ok(css.includes('max-height: 54px;'), "Must enforce max-height 54px");
    assert.ok(css.includes('.cart-item-thumb {'), "Must define .cart-item-thumb");
    assert.ok(css.includes('width: 40px;'), "Must specify 40px width");
    assert.ok(css.includes('height: 40px;'), "Must specify 40px height");
  });

  // Test 6: JS Cart Rendering Structure
  check("LAYOUT-2: js/pos.js renders .cart-item with left thumbnail, center info, and right stepper", () => {
    const js = fs.readFileSync('js/pos.js', 'utf8');
    assert.ok(js.includes('class="cart-item"'), "Must render cart-item wrapper");
    assert.ok(js.includes('cart-item-thumb'), "Must render thumbnail image");
    assert.ok(js.includes('cart-item-info'), "Must render info container");
    assert.ok(js.includes('cart-item-name'), "Must render name element with ellipsis");
    assert.ok(js.includes('cart-item-math'), "Must render unit rate");
    assert.ok(js.includes('cart-item-right'), "Must render right controls");
    assert.ok(js.includes('qty-pill'), "Must render quantity pill");
  });

  // Test 7: Mobile menuItemModal Responsive Usability
  check("MODAL-1: #menuItemModal has compact 100px preview and full width generate button", () => {
    const css = fs.readFileSync('style.css', 'utf8');
    assert.ok(css.includes('.fim-preview-container {'), "Must define .fim-preview-container");
    assert.ok(css.includes('height: 100px;'), "Must enforce 100px height for preview banner");
    assert.ok(css.includes('.fim-btn-generate {'), "Must define .fim-btn-generate");
    assert.ok(css.includes('width: 100%;'), "Must enforce full width for generate button");
    assert.ok(css.includes('#menuItemModal .modal-box {'), "Must define scoped rule for #menuItemModal");
    assert.ok(css.includes('max-height: 90vh;'), "Must enforce 90vh max height");
    assert.ok(css.includes('overflow-y: auto;'), "Must enforce overflow-y auto for scrollability");
  });

  console.log("====================================================");
  console.log(`🎯 AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("====================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialAudit().catch(err => {
  console.error("Adversarial audit failed fatally:", err);
  process.exit(1);
});
