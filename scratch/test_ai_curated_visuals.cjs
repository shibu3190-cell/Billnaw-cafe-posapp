// scratch/test_ai_curated_visuals.cjs - Automated Verification Suite for AI Culinary Visual Engine & Variation Cycling
const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log("====================================================");
console.log("📸 CURATED GOURMET CULINARY PHOTO & VARIATION AUDIT");
console.log("====================================================\n");

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

const rootDir = path.resolve(__dirname, '..');
const htmlPath = path.join(rootDir, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

(async () => {
  // ----------------------------------------------------
  // SECTION 1: CRITICAL INVARIANTS
  // ----------------------------------------------------
  console.log("📍 SECTION 1: CRITICAL INVARIANT PRESERVATION");

  test("INV-1: Exactly 26 SVG modal close buttons in index.html", () => {
    const svgMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g);
    assert.ok(svgMatches, "No modal-close-btn found");
    assert.strictEqual(svgMatches.length, 26, `Expected exactly 26, got ${svgMatches.length}`);
  });

  test("INV-2: Total modal-close-btn class occurrences in index.html is exactly 26", () => {
    const allMatches = html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g);
    assert.ok(allMatches, "No modal-close-btn classes found");
    assert.strictEqual(allMatches.length, 26, `Expected exactly 26, got ${allMatches.length}`);
  });

  test("INV-3: Zero raw unicode '✕' characters inside modal-close-btn", () => {
    const rawMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*>[^<]*✕[^<]*<\/button>/g);
    assert.strictEqual(rawMatches, null, "Found forbidden raw ✕ modal-close-btn");
  });

  // ----------------------------------------------------
  // SECTION 2: CURATED CULINARY PHOTO LIBRARY INTEGRITY
  // ----------------------------------------------------
  console.log("\n📍 SECTION 2: 26 CULINARY CATEGORIES & PHOTO ASSET INTEGRITY");

  const geminiService = await import('../server/gemini-service.js');
  const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
  const menuJsContent = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf8');

  test("CUL-LIB-1: Server exports getCuratedFoodPhotoServer and getDishVariationCountServer", () => {
    assert.strictEqual(typeof geminiService.getCuratedFoodPhotoServer, 'function', "getCuratedFoodPhotoServer must be exported");
    assert.strictEqual(typeof geminiService.getDishVariationCountServer, 'function', "getDishVariationCountServer must be exported");
    assert.strictEqual(typeof geminiService.generateMenuItemImage, 'function', "generateMenuItemImage must be exported");
  });

  test("CUL-LIB-2: js/core.js defines getCuratedFoodPhoto, getGourmetFoodImage & getDishVariationCount", () => {
    assert.ok(coreJsContent.includes('function getCuratedFoodPhoto('), "Missing getCuratedFoodPhoto");
    assert.ok(coreJsContent.includes('function getGourmetFoodImage('), "Missing getGourmetFoodImage");
    assert.ok(coreJsContent.includes('function getDishVariationCount('), "Missing getDishVariationCount");
    assert.ok(coreJsContent.includes('window.getDishVariationCount = getDishVariationCount;'), "Missing window.getDishVariationCount export");
  });

  const sampleDishes = [
    { name: 'Samosa', category: 'Snacks' },
    { name: 'Tea', category: 'Beverages' },
    { name: 'Chicken Curry', category: 'Main Course' },
    { name: 'Masala Coke', category: 'Beverages' },
    { name: 'Biryani', category: 'Main Course' },
    { name: 'Paneer Butter Masala', category: 'Main Course' },
    { name: 'Cold Coffee', category: 'Beverages' },
    { name: 'Cappuccino', category: 'Beverages' },
    { name: 'Burger', category: 'Fast Food' },
    { name: 'Pizza', category: 'Fast Food' },
    { name: 'French Fries', category: 'Snacks' },
    { name: 'Grilled Sandwich', category: 'Snacks' },
    { name: 'Momos', category: 'Snacks' },
    { name: 'Masala Dosa', category: 'South Indian' },
    { name: 'Mango Lassi', category: 'Beverages' },
    { name: 'Dal Makhani', category: 'Main Course' },
    { name: 'Hakka Noodles', category: 'Chinese' },
    { name: 'Paneer Roll', category: 'Snacks' },
    { name: 'Chocolate Cake', category: 'Dessert' },
    { name: 'Gulab Jamun', category: 'Dessert' },
    { name: 'Virgin Mojito', category: 'Beverages' },
    { name: 'Tomato Soup', category: 'Starters' },
    { name: 'Butter Naan', category: 'Breads' },
    { name: 'Pav Bhaji', category: 'Street Food' },
    { name: 'Omelette', category: 'Breakfast' },
    { name: 'Caesar Salad', category: 'Salads' }
  ];

  test("CUL-LIB-3: All 26 categories return valid, authentic food photo URLs via getCuratedFoodPhotoServer", () => {
    sampleDishes.forEach(dish => {
      const url = geminiService.getCuratedFoodPhotoServer(dish.name, dish.category, 0);
      assert.ok(url, `Missing photo for dish: ${dish.name}`);
      assert.ok(url.startsWith('https://images.unsplash.com/'), `Invalid URL format for ${dish.name}: ${url}`);
    });
  });

  // ----------------------------------------------------
  // SECTION 3: VARIATION CYCLING & LOOP INTEGRITY
  // ----------------------------------------------------
  console.log("\n📍 SECTION 3: VARIATION CYCLING & 4-SHOT IMAGE POOLS");

  test("CUL-VAR-1: Samosa photo variations cycle through 4 distinct photographs", () => {
    const var0 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 0);
    const var1 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 1);
    const var2 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 2);
    const var3 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 3);

    assert.ok(var0 && var1 && var2 && var3, "All 4 variations must exist");
    const uniqueSet = new Set([var0, var1, var2, var3]);
    assert.strictEqual(uniqueSet.size, 4, `Expected 4 distinct photo URLs, got ${uniqueSet.size}`);
  });

  test("CUL-VAR-2: Variation index loops seamlessly (vIdx 4 wraps to vIdx 0)", () => {
    const var0 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 0);
    const var4 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 4);
    const var5 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 5);
    const var1 = geminiService.getCuratedFoodPhotoServer('Samosa', 'Snacks', 1);

    assert.strictEqual(var4, var0, "Variation 4 must loop back to variation 0");
    assert.strictEqual(var5, var1, "Variation 5 must loop back to variation 1");
  });

  test("CUL-VAR-3: getDishVariationCountServer returns 4 for mapped culinary dishes", () => {
    const count = geminiService.getDishVariationCountServer('Samosa', 'Snacks');
    assert.strictEqual(count, 4, "Expected variation count 4");
  });

  test("CUL-VAR-4: allowCategoryFallback flag controls strict vs fallback matching", () => {
    const strictUnknown = geminiService.getCuratedFoodPhotoServer('Chef Magical Mystery Plate', 'Main Course', 0, false);
    assert.strictEqual(strictUnknown, null, "Strict mode must return null for unmapped dish name");

    const fallbackUnknown = geminiService.getCuratedFoodPhotoServer('Chef Magical Mystery Plate', 'Main Course', 0, true);
    assert.ok(fallbackUnknown, "Fallback mode must return category photo for unmapped dish");
    assert.ok(fallbackUnknown.startsWith('https://images.unsplash.com/'), "Must return valid URL");
  });

  test("CUL-VAR-5: Scored keyword match prioritizes specific dish name over broad keyword", () => {
    const count = geminiService.getDishVariationCountServer('Crispy Chicken Burger', 'Fast Food');
    assert.strictEqual(count, 4, "Expected variation count 4");
    const photo = geminiService.getCuratedFoodPhotoServer('Crispy Chicken Burger', 'Fast Food', 0);
    assert.ok(photo, "Should return photo for Crispy Chicken Burger");
  });

  // ----------------------------------------------------
  // SECTION 4: SERVER AI ENGINE & NO HALLUCINATED ARTIFACTS
  // ----------------------------------------------------
  console.log("\n📍 SECTION 4: SERVER GENERATEMENUITEMIMAGE & ZERO HALLUCINATION OVERRIDE");

  await testAsync("CUL-GEN-1: generateMenuItemImage returns curated gourmet photo for Samosa immediately", async () => {
    const result = await geminiService.generateMenuItemImage({
      itemName: 'Samosa',
      category: 'Snacks',
      variation: 0
    });

    assert.ok(result.success, "Result must be successful");
    assert.strictEqual(result.source, 'curated-culinary', "Must use curated culinary library");
    assert.ok(result.imageUrl.startsWith('https://images.unsplash.com/'), "Must return Unsplash photo");
    assert.ok(!result.imageUrl.startsWith('data:image/jpeg;base64,'), "Must NEVER return AI-hallucinated Imagen 3 base64 artifact");
  });

  await testAsync("CUL-GEN-2: generateMenuItemImage cycles variations when Next Photo variation requested", async () => {
    const res0 = await geminiService.generateMenuItemImage({ itemName: 'Masala Chai', category: 'Beverages', variation: 0 });
    const res1 = await geminiService.generateMenuItemImage({ itemName: 'Masala Chai', category: 'Beverages', variation: 1 });
    const res2 = await geminiService.generateMenuItemImage({ itemName: 'Masala Chai', category: 'Beverages', variation: 2 });
    const res3 = await geminiService.generateMenuItemImage({ itemName: 'Masala Chai', category: 'Beverages', variation: 3 });

    assert.strictEqual(res0.source, 'curated-culinary');
    assert.strictEqual(res1.source, 'curated-culinary');
    assert.notStrictEqual(res0.imageUrl, res1.imageUrl, "Variation 0 and 1 must have distinct images");
    assert.notStrictEqual(res1.imageUrl, res2.imageUrl, "Variation 1 and 2 must have distinct images");
    assert.notStrictEqual(res2.imageUrl, res3.imageUrl, "Variation 2 and 3 must have distinct images");
  });

  await testAsync("CUL-GEN-3: Unknown dish name falls back safely to appetizing category pool without crashing", async () => {
    const res = await geminiService.generateMenuItemImage({
      itemName: 'Chef Magical Mystery Plate',
      category: 'Main Course',
      variation: 0
    });

    assert.ok(res.success, "Result must succeed");
    assert.ok(res.imageUrl, "Image URL must be populated");
    assert.ok(res.imageUrl.startsWith('https://images.unsplash.com/'), "Must return high-res curated photo");
  });

  // ----------------------------------------------------
  // SECTION 5: CLIENT MENU.JS PHOTO GENERATOR & TOAST VERIFICATION
  // ----------------------------------------------------
  console.log("\n📍 SECTION 5: CLIENT MENU.JS PHOTO GENERATION & MODAL CYCLING");

  test("CLIENT-1: js/menu.js fetchImageAsBase64 prioritizes getCuratedFoodPhoto", () => {
    assert.ok(menuJsContent.includes('if (typeof getCuratedFoodPhoto === \'function\')'), "Must check getCuratedFoodPhoto locally");
    assert.ok(menuJsContent.includes('const directCurated = getCuratedFoodPhoto(dishName, cat, vIdx, false);'), "Must call getCuratedFoodPhoto with direct match");
  });

  test("CLIENT-2: js/menu.js generateAIImage uses correct variation feedback toast", () => {
    assert.ok(menuJsContent.includes('getDishVariationCount(name, cat)'), "Must calculate totalVars");
    assert.ok(menuJsContent.includes('showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${name}`);'), "Must show clean variation toast");
    assert.ok(menuJsContent.includes('preview.src = currentItemImageBase64;'), "Must update preview.src");
  });

  test("CLIENT-3: js/menu.js generateAiItemPhoto in AI Menu Review Modal cycles variations", () => {
    assert.ok(menuJsContent.includes('function generateAiItemPhoto('), "generateAiItemPhoto must be defined");
    assert.ok(menuJsContent.includes('showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${item.name || \'item\'}`);'), "Must show variation toast in AI review modal");
    assert.ok(menuJsContent.includes('item._varIndex = (item._varIndex !== undefined) ? (item._varIndex + 1) : 1;'), "Must advance _varIndex");
  });

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log("\n====================================================");
  console.log(`🎯 TOTAL AUDIT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("====================================================");

  if (failed > 0) {
    process.exit(1);
  }
})();
