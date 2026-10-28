// scratch/test_challenger_m1_engine.cjs
// Adversarial Empirical Stress Test Suite for Curated Culinary Image Engine, Modulo Cycling, and Safety
// Challenger Subagent: challenger_2

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

console.log("================================================================================");
console.log("🔥 CHALLENGER 2: ADVERSARIAL STRESS TEST - CURATED IMAGE ENGINE & SAFETY (M1)");
console.log("================================================================================\n");

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
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

async function testAsync(name, fn) {
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

  // Load server module
  const geminiService = await import('../server/gemini-service.js');
  const { getCuratedFoodPhotoServer, getDishVariationCountServer, generateMenuItemImage } = geminiService;

  // Load client js/core.js in isolated VM environment
  const coreJsContent = fs.readFileSync(path.join(rootDir, 'js', 'core.js'), 'utf8');
  const serverJsContent = fs.readFileSync(path.join(rootDir, 'server', 'gemini-service.js'), 'utf8');

  const localStorageMock = { getItem: () => null, setItem: () => {} };
  const windowMock = {
    document: {
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({ style: {} }),
      head: { appendChild: () => {} }
    },
    localStorage: localStorageMock,
    addEventListener: () => {}
  };
  windowMock.window = windowMock;

  const vmContext = vm.createContext({
    window: windowMock,
    document: windowMock.document,
    localStorage: localStorageMock,
    addEventListener: () => {},
    console,
    Math,
    Date,
    String,
    parseInt,
    Set,
    Array,
    Object,
    Map,
    Promise
  });
  vm.runInContext(coreJsContent, vmContext);

  const getCuratedFoodPhotoClient = windowMock.getCuratedFoodPhoto;
  const clientPhotoMap = windowMock.CULINARY_PHOTO_MAP;

  const FORBIDDEN_FISH_ID = 'photo-1599488615731-7e5c2823ff28';

  // ============================================================================
  // SECTION 1: ABSOLUTE REPOSITORY PURGE OF NEON AQUARIUM FISH
  // ============================================================================
  console.log("📍 SECTION 1: ABSOLUTE PURGE OF AQUARIUM FISH (R3 Safety)");

  test("R3-PURGE-1: server/gemini-service.js contains ZERO occurrences of aquarium fish ID", () => {
    assert.strictEqual(
      serverJsContent.includes(FORBIDDEN_FISH_ID),
      false,
      `Forbidden fish ID ${FORBIDDEN_FISH_ID} still found in server/gemini-service.js!`
    );
  });

  test("R3-PURGE-2: js/core.js contains ZERO occurrences of aquarium fish ID", () => {
    assert.strictEqual(
      coreJsContent.includes(FORBIDDEN_FISH_ID),
      false,
      `Forbidden fish ID ${FORBIDDEN_FISH_ID} still found in js/core.js!`
    );
  });

  test("R3-PURGE-3: Client CULINARY_PHOTO_MAP contains zero references to aquarium fish across all categories", () => {
    assert.ok(Array.isArray(clientPhotoMap), "CULINARY_PHOTO_MAP must be an array");
    for (const entry of clientPhotoMap) {
      if (entry.url) {
        assert.ok(!entry.url.includes(FORBIDDEN_FISH_ID), `Entry ${entry.keys?.[0]} main url has forbidden fish!`);
      }
      if (Array.isArray(entry.urls)) {
        for (const u of entry.urls) {
          assert.ok(!u.includes(FORBIDDEN_FISH_ID), `Entry ${entry.keys?.[0]} urls array contains forbidden fish!`);
        }
      }
    }
  });

  // ============================================================================
  // SECTION 2: ADVERSARIAL VARIATION CYCLING ACROSS HIGH INDICES
  // Test indices: 0, 1, 2, 3, 4, 5, 8, 12, 100, 1000
  // ============================================================================
  console.log("\n📍 SECTION 2: HIGH-INDEX VARIATION CYCLING & EXACT MODULO ARITHMETIC");

  const testDishes = [
    { name: 'Paneer', cat: 'Main Course' },
    { name: 'Paneer Butter Masala', cat: 'Main Course' },
    { name: 'Samosa', cat: 'Snacks' },
    { name: 'Biryani', cat: 'Main Course' },
    { name: 'Dal Makhani', cat: 'Main Course' },
    { name: 'Butter Naan', cat: 'Breads' },
    { name: 'Cold Coffee', cat: 'Beverages' },
    { name: 'Tea', cat: 'Beverages' },
    { name: 'Chicken Curry', cat: 'Main Course' },
    { name: 'Gulab Jamun', cat: 'Dessert' }
  ];

  const testIndices = [0, 1, 2, 3, 4, 5, 8, 12, 100, 1000];

  testDishes.forEach(dish => {
    test(`MODULO-SERVER: ${dish.name} cyclic consistency across indices [${testIndices.join(', ')}]`, () => {
      // Find expected urls array for this dish from base 0..3
      const baseUrls = [
        getCuratedFoodPhotoServer(dish.name, dish.cat, 0),
        getCuratedFoodPhotoServer(dish.name, dish.cat, 1),
        getCuratedFoodPhotoServer(dish.name, dish.cat, 2),
        getCuratedFoodPhotoServer(dish.name, dish.cat, 3)
      ];

      // Base URLs must all be distinct and Unsplash food images
      const baseSet = new Set(baseUrls);
      assert.strictEqual(baseSet.size, 4, `${dish.name} expected 4 distinct URLs, got ${baseSet.size}`);
      baseUrls.forEach((u, i) => {
        assert.ok(u.startsWith('https://images.unsplash.com/'), `${dish.name} v${i} must be Unsplash`);
        assert.ok(!u.includes(FORBIDDEN_FISH_ID), `${dish.name} v${i} must not be fish`);
      });

      // Verify each index satisfies exact modulo: vIdx % 4 === expected base index
      testIndices.forEach(idx => {
        const url = getCuratedFoodPhotoServer(dish.name, dish.cat, idx);
        const expected = baseUrls[idx % 4];
        assert.strictEqual(
          url,
          expected,
          `Server ${dish.name} at vIdx=${idx} expected base index ${idx % 4} (${expected}) but got ${url}`
        );
      });
    });

    test(`MODULO-CLIENT: ${dish.name} cyclic consistency across indices [${testIndices.join(', ')}]`, () => {
      const baseUrls = [
        getCuratedFoodPhotoClient(dish.name, dish.cat, 0),
        getCuratedFoodPhotoClient(dish.name, dish.cat, 1),
        getCuratedFoodPhotoClient(dish.name, dish.cat, 2),
        getCuratedFoodPhotoClient(dish.name, dish.cat, 3)
      ];

      const baseSet = new Set(baseUrls);
      assert.strictEqual(baseSet.size, 4, `${dish.name} client expected 4 distinct URLs, got ${baseSet.size}`);
      baseUrls.forEach((u, i) => {
        assert.ok(u.startsWith('https://images.unsplash.com/'), `${dish.name} client v${i} must be Unsplash`);
        assert.ok(!u.includes(FORBIDDEN_FISH_ID), `${dish.name} client v${i} must not be fish`);
      });

      testIndices.forEach(idx => {
        const url = getCuratedFoodPhotoClient(dish.name, dish.cat, idx);
        const expected = baseUrls[idx % 4];
        assert.strictEqual(
          url,
          expected,
          `Client ${dish.name} at vIdx=${idx} expected base index ${idx % 4} (${expected}) but got ${url}`
        );
      });
    });

    test(`PARITY-CLIENT-SERVER: ${dish.name} client and server return identical URLs across indices`, () => {
      testIndices.forEach(idx => {
        const sUrl = getCuratedFoodPhotoServer(dish.name, dish.cat, idx);
        const cUrl = getCuratedFoodPhotoClient(dish.name, dish.cat, idx);
        assert.strictEqual(
          sUrl,
          cUrl,
          `Discrepancy for ${dish.name} at vIdx=${idx}: server=${sUrl}, client=${cUrl}`
        );
      });
    });
  });

  // ============================================================================
  // SECTION 3: SPECIFIC PANEER GOURMET FOOD PHOTOGRAPHY VERIFICATION
  // ============================================================================
  console.log("\n📍 SECTION 3: PANEER GOURMET FOOD PHOTO INTEGRITY");

  test("PANEER-GOURMET-1: Paneer index 3 specifically returns Kadai Paneer photo-1603894584373-5ac82b2ae398", () => {
    const s3 = getCuratedFoodPhotoServer('Paneer', 'Main Course', 3);
    const c3 = getCuratedFoodPhotoClient('Paneer', 'Main Course', 3);
    assert.ok(s3.includes('photo-1603894584373-5ac82b2ae398'), `Server paneer v3 was ${s3}`);
    assert.ok(c3.includes('photo-1603894584373-5ac82b2ae398'), `Client paneer v3 was ${c3}`);
  });

  test("PANEER-GOURMET-2: Paneer variations 0, 1, 2, 3 all represent authentic vegetarian Indian dishes", () => {
    const expectedPaneerIds = [
      'photo-1567188040759-fb8a883dc6d8', // Paneer tikka
      'photo-1631452180519-c014fe946bc7', // Shahi / Kadai Paneer bowl
      'photo-1546833999-b9f581a1996d', // Rich Indian curry
      'photo-1603894584373-5ac82b2ae398'  // Kadai Paneer butter masala
    ];
    for (let i = 0; i < 4; i++) {
      const url = getCuratedFoodPhotoServer('Paneer', 'Main Course', i);
      assert.ok(url.includes(expectedPaneerIds[i]), `Paneer variation ${i} expected ${expectedPaneerIds[i]}, got ${url}`);
    }
  });

  // ============================================================================
  // SECTION 4: generateMenuItemImage ZERO FALLTHROUGH TO WIKIMEDIA COMMONS
  // ============================================================================
  console.log("\n📍 SECTION 4: generateMenuItemImage NO FALLTHROUGH (vIdx >= 4)");

  const highVarIndices = [4, 5, 8, 12, 50, 100, 1000];

  for (const vIdx of highVarIndices) {
    await testAsync(`GEN-IMG-PANEER: generateMenuItemImage('Paneer Butter Masala', variation=${vIdx}) stays on curated-culinary`, async () => {
      const result = await generateMenuItemImage({
        itemName: 'Paneer Butter Masala',
        category: 'Main Course',
        variation: vIdx
      });
      assert.strictEqual(result.success, true, "Generation must succeed");
      assert.strictEqual(result.source, 'curated-culinary', `Must remain on curated-culinary for vIdx=${vIdx}, got: ${result.source}`);
      assert.ok(result.imageUrl.startsWith('https://images.unsplash.com/'), "Must be Unsplash food photo");
      assert.ok(!result.imageUrl.includes(FORBIDDEN_FISH_ID), "Must not be fish");
      assert.ok(!result.imageUrl.includes('wikimedia.org'), "Must never fall through to Wikimedia Commons");
      assert.strictEqual(result.variation, vIdx, "Result variation should mirror input");
    });
  }

  for (const vIdx of [4, 7, 25]) {
    await testAsync(`GEN-IMG-SAMOSA: generateMenuItemImage('Samosa', variation=${vIdx}) stays on curated-culinary`, async () => {
      const result = await generateMenuItemImage({
        itemName: 'Samosa',
        category: 'Snacks',
        variation: vIdx
      });
      assert.strictEqual(result.source, 'curated-culinary');
      assert.ok(!result.imageUrl.includes('wikimedia.org'), "Must never fall through to Wikimedia Commons");
    });

    await testAsync(`GEN-IMG-BIRYANI: generateMenuItemImage('Hyderabadi Chicken Biryani', variation=${vIdx}) stays on curated-culinary`, async () => {
      const result = await generateMenuItemImage({
        itemName: 'Hyderabadi Chicken Biryani',
        category: 'Main Course',
        variation: vIdx
      });
      assert.strictEqual(result.source, 'curated-culinary');
      assert.ok(!result.imageUrl.includes('wikimedia.org'), "Must never fall through to Wikimedia Commons");
    });
  }

  // ============================================================================
  // SECTION 5: ADVERSARIAL EDGE CASES & INPUT SANITIZATION
  // ============================================================================
  console.log("\n📍 SECTION 5: ADVERSARIAL INPUT SANITIZATION & EDGE CASES");

  test("EDGE-CASE-1: Case insensitivity across varied casings ('PANEER', 'Paneer Tikka', 'shahi PANEER')", () => {
    const casings = [
      'PANEER',
      'paneer',
      'Paneer',
      'PaNeEr',
      'PANEER TIKKA',
      'paneer tikka',
      'shahi PANEER',
      'SHAHI PANEER',
      'Kadai Paneer',
      'KADAI PANEER',
      'MATAR PANEER',
      'palak PANEER'
    ];
    for (const dish of casings) {
      const sUrl = getCuratedFoodPhotoServer(dish, 'Main Course', 0);
      const cUrl = getCuratedFoodPhotoClient(dish, 'Main Course', 0);
      assert.ok(sUrl, `Server failed to resolve casing: "${dish}"`);
      assert.ok(cUrl, `Client failed to resolve casing: "${dish}"`);
      assert.ok(sUrl.startsWith('https://images.unsplash.com/'), `Invalid URL for "${dish}"`);
      assert.strictEqual(sUrl, cUrl, `Server/Client mismatch for "${dish}"`);
    }
  });

  test("EDGE-CASE-2: Heavy whitespace padding ('   Paneer   ', '\\t\\nSamosa\\r\\n  ')", () => {
    const s1 = getCuratedFoodPhotoServer('   Paneer   ', '   Main Course   ', 0);
    const c1 = getCuratedFoodPhotoClient('   Paneer   ', '   Main Course   ', 0);
    assert.ok(s1 && c1);
    assert.strictEqual(s1, getCuratedFoodPhotoServer('Paneer', 'Main Course', 0));

    const s2 = getCuratedFoodPhotoServer('\t\nSamosa\r\n  ', 'Snacks', 0);
    const c2 = getCuratedFoodPhotoClient('\t\nSamosa\r\n  ', 'Snacks', 0);
    assert.ok(s2 && c2);
    assert.strictEqual(s2, getCuratedFoodPhotoServer('Samosa', 'Snacks', 0));
  });

  test("EDGE-CASE-3: Missing or undefined category defaults safely", () => {
    const s1 = getCuratedFoodPhotoServer('Paneer', '', 0);
    const c1 = getCuratedFoodPhotoClient('Paneer', '', 0);
    assert.ok(s1 && s1.startsWith('https://images.unsplash.com/'));
    assert.strictEqual(s1, c1);

    const s2 = getCuratedFoodPhotoServer('Biryani', null, 0);
    const c2 = getCuratedFoodPhotoClient('Biryani', null, 0);
    assert.ok(s2 && s2.startsWith('https://images.unsplash.com/'));
    assert.strictEqual(s2, c2);

    const s3 = getCuratedFoodPhotoServer('Tea', undefined, 0);
    const c3 = getCuratedFoodPhotoClient('Tea', undefined, 0);
    assert.ok(s3 && s3.startsWith('https://images.unsplash.com/'));
    assert.strictEqual(s3, c3);
  });

  test("EDGE-CASE-4: Empty/null/undefined inputs return null safely without throwing", () => {
    assert.strictEqual(getCuratedFoodPhotoServer('', '', 0), null);
    assert.strictEqual(getCuratedFoodPhotoServer(null, null, 0), null);
    assert.strictEqual(getCuratedFoodPhotoServer(undefined, undefined, 0), null);
    assert.strictEqual(getCuratedFoodPhotoClient('', '', 0), null);
    assert.strictEqual(getCuratedFoodPhotoClient(null, null, 0), null);
    assert.strictEqual(getCuratedFoodPhotoClient(undefined, undefined, 0), null);
  });

  test("EDGE-CASE-5: Negative, float, string, or invalid variation indices normalize safely", () => {
    // Negative index should clamp or handle safely via Math.max(0, ...)
    const negServer = getCuratedFoodPhotoServer('Paneer', 'Main Course', -5);
    const negClient = getCuratedFoodPhotoClient('Paneer', 'Main Course', -5);
    assert.strictEqual(negServer, getCuratedFoodPhotoServer('Paneer', 'Main Course', 0));
    assert.strictEqual(negClient, getCuratedFoodPhotoClient('Paneer', 'Main Course', 0));

    // String integer index '2'
    const strServer = getCuratedFoodPhotoServer('Paneer', 'Main Course', '2');
    const strClient = getCuratedFoodPhotoClient('Paneer', 'Main Course', '2');
    assert.strictEqual(strServer, getCuratedFoodPhotoServer('Paneer', 'Main Course', 2));
    assert.strictEqual(strClient, getCuratedFoodPhotoClient('Paneer', 'Main Course', 2));

    // Non-numeric string 'invalid_index' should default to 0
    const invServer = getCuratedFoodPhotoServer('Paneer', 'Main Course', 'invalid_index');
    const invClient = getCuratedFoodPhotoClient('Paneer', 'Main Course', 'invalid_index');
    assert.strictEqual(invServer, getCuratedFoodPhotoServer('Paneer', 'Main Course', 0));
    assert.strictEqual(invClient, getCuratedFoodPhotoClient('Paneer', 'Main Course', 0));
  });

  test("EDGE-CASE-6: Unmapped dish with allowCategoryFallback=false returns null, true returns category pool", () => {
    const unmappedDish = 'Quantum Martian Gravy 9000';
    
    // Server strict: null
    const sStrict = getCuratedFoodPhotoServer(unmappedDish, 'Main Course', 0, false);
    assert.strictEqual(sStrict, null, "Strict unmapped must be null");

    // Server fallback: returns category image
    const sFallback = getCuratedFoodPhotoServer(unmappedDish, 'Main Course', 0, true);
    assert.ok(sFallback && sFallback.startsWith('https://images.unsplash.com/'), "Fallback must return category pool");

    // Client strict: null
    const cStrict = getCuratedFoodPhotoClient(unmappedDish, 'Main Course', 0, false);
    assert.strictEqual(cStrict, null, "Client strict unmapped must be null");

    // Client fallback: returns category image
    const cFallback = getCuratedFoodPhotoClient(unmappedDish, 'Main Course', 0, true);
    assert.ok(cFallback && cFallback.startsWith('https://images.unsplash.com/'), "Client fallback must return category pool");
  });

  // ============================================================================
  // SUMMARY OF CHALLENGER AUDIT
  // ============================================================================
  console.log("\n================================================================================");
  console.log(`🎯 CHALLENGER AUDIT RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error("\n❌ LIST OF FAILURES:");
    failures.forEach((f, idx) => {
      console.error(`  ${idx + 1}. ${f.name}: ${f.error}`);
    });
    process.exit(1);
  } else {
    console.log("\n🚀 EMPIRICAL VERDICT: ALL ADVERSARIAL STRESS TESTS PASSED WITH 100% SUCCESS.");
    process.exit(0);
  }
})();
