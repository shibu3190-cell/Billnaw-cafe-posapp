// scratch/test_ai_menu_quota_inspection.cjs - Comprehensive Verification for AI Menu Quota & Ingestion
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log("====================================================");
console.log("🤖 AI MENU INGESTION & 15-SCAN QUOTA VERIFICATION");
console.log("====================================================\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
    return (async () => {
        try {
            await fn();
            console.log(`  ✅ PASS: ${name}`);
            passed++;
        } catch (err) {
            console.error(`  ❌ FAIL: ${name}`);
            console.error(`     Error: ${err.message}`);
            failed++;
        }
    })();
}

(async () => {
    const {
        DEFAULT_MONTHLY_LIMIT,
        normalizeShopId,
        checkAiQuotaAndKey,
        recordSuccessfulAiUsage,
        getClientQuotaInfo,
        releaseAiQuotaSlot,
        getCurrentYearMonth
    } = await import('../server/quota-service.js');

    const {
        cleanParsedPrice,
        parseMenuJsonSafely,
        CANDIDATE_MODELS
    } = await import('../server/gemini-service.js');

    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const jsMenu = fs.readFileSync(path.join(__dirname, '..', 'js', 'menu.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
    const rootRules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'));
    const dbRules = fs.readFileSync(path.join(__dirname, '..', 'database', 'firestore.rules'));

    // -----------------------------------------------------------------
    // SECTION 1: PRICE CLEANING & NUMBER FORMATTING SAFETY
    // -----------------------------------------------------------------
    console.log("📍 SECTION 1: PRICE CLEANING & RANGE PARSING");
    
    await test("QC-01: cleanParsedPrice handles range pricing without numeric inflation", () => {
        assert.strictEqual(cleanParsedPrice("80-150"), 80, "80-150 should parse as 80, not 80150");
        assert.strictEqual(cleanParsedPrice("₹120/150"), 120, "120/150 should parse as 120, not 120150");
        assert.strictEqual(cleanParsedPrice("₹ 250.50"), 250.5, "Standard decimal price formatted correctly");
        assert.strictEqual(cleanParsedPrice("Free"), 0, "Non-numeric string parses as 0");
        assert.strictEqual(cleanParsedPrice(""), 0, "Empty string parses as 0");
        assert.strictEqual(cleanParsedPrice(Infinity), 0, "Infinity parses as 0");
    });

    // -----------------------------------------------------------------
    // SECTION 2: ROBUST JSON PARSER FOR DIVERSE LLM OUTPUTS
    // -----------------------------------------------------------------
    console.log("\n📍 SECTION 2: ROBUST JSON SCHEMA PARSER");

    await test("QC-02: parseMenuJsonSafely parses standard { categories: [...] }", () => {
        const raw = JSON.stringify({
            categories: [
                {
                    category: "Coffee",
                    items: [{ name: "Cappuccino", price: "140", isVeg: true }]
                }
            ]
        });
        const result = parseMenuJsonSafely(raw);
        assert.ok(result && result.categories.length === 1);
        assert.strictEqual(result.categories[0].name, "Coffee");
        assert.strictEqual(result.categories[0].items[0].name, "Cappuccino");
        assert.strictEqual(result.categories[0].items[0].price, 140);
        assert.strictEqual(result.categories[0].items[0].isVeg, true);
    });

    await test("QC-03: parseMenuJsonSafely normalizes flat { items: [...] } into categorized output", () => {
        const raw = JSON.stringify({
            items: [
                { name: "Cold Coffee", price: "120", category: "Beverages" },
                { name: "Veg Sandwich", price: "90", category: "Snacks" }
            ]
        });
        const result = parseMenuJsonSafely(raw);
        assert.ok(result && result.categories.length === 2);
        const bevCat = result.categories.find(c => c.name === "Beverages");
        const snackCat = result.categories.find(c => c.name === "Snacks");
        assert.ok(bevCat && bevCat.items.length === 1 && bevCat.items[0].name === "Cold Coffee");
        assert.ok(snackCat && snackCat.items.length === 1 && snackCat.items[0].name === "Veg Sandwich");
    });

    await test("QC-04: parseMenuJsonSafely handles category-keyed object { 'Beverages': [...] }", () => {
        const raw = JSON.stringify({
            "Hot Drinks": [
                { name: "Masala Chai", price: "30" },
                { name: "Filter Coffee", price: "40" }
            ],
            "Pastries": [
                { name: "Croissant", price: "110" }
            ]
        });
        const result = parseMenuJsonSafely(raw);
        assert.ok(result && result.categories.length === 2);
        const hotCat = result.categories.find(c => c.name === "Hot Drinks");
        assert.ok(hotCat && hotCat.items.length === 2);
    });

    await test("QC-05: parseMenuJsonSafely strips markdown code blocks and surrounding text", () => {
        const raw = `Here is the transcribed menu:
\`\`\`json
{
  "menu_categories": [
    {
      "name": "Desserts",
      "items": [{ "name": "Brownie", "price": "150" }]
    }
  ]
}
\`\`\`
Hope this helps!`;
        const result = parseMenuJsonSafely(raw);
        assert.ok(result && result.categories.length === 1);
        assert.strictEqual(result.categories[0].name, "Desserts");
        assert.strictEqual(result.categories[0].items[0].name, "Brownie");
        assert.strictEqual(result.categories[0].items[0].price, 150);
    });

    await test("QC-05b: parseMenuJsonSafely groups top-level item array by annotated categories", () => {
        const raw = JSON.stringify([
            { name: "Latte", category: "Coffee", price: 140 },
            { name: "Croissant", category: "Bakery", price: 110 }
        ]);
        const result = parseMenuJsonSafely(raw);
        assert.ok(result && result.categories.length === 2);
        const coffee = result.categories.find(c => c.name === "Coffee");
        const bakery = result.categories.find(c => c.name === "Bakery");
        assert.ok(coffee && coffee.items[0].name === "Latte");
        assert.ok(bakery && bakery.items[0].name === "Croissant");
    });

    // -----------------------------------------------------------------
    // SECTION 3: GEMINI MODEL CASCADE PRUNING
    // -----------------------------------------------------------------
    console.log("\n📍 SECTION 3: GEMINI MODEL CASCADE");

    await test("QC-06: CANDIDATE_MODELS does not contain deprecated 404 models", () => {
        assert.ok(!CANDIDATE_MODELS.includes('gemini-2.5-flash'), "Deprecated 404 gemini-2.5-flash must be pruned");
        assert.ok(CANDIDATE_MODELS.includes('gemini-3.1-flash-lite'), "gemini-3.1-flash-lite must be present");
        assert.ok(CANDIDATE_MODELS.includes('gemini-3.8-flash'), "gemini-3.8-flash must be present");
    });

    // -----------------------------------------------------------------
    // SECTION 4: 15-SCAN MONTHLY QUOTA ENFORCEMENT & CONCURRENCY
    // -----------------------------------------------------------------
    console.log("\n📍 SECTION 4: 15-SCAN MONTHLY QUOTA ENFORCEMENT");

    await test("QC-07: DEFAULT_MONTHLY_LIMIT is strictly 15 scans per shop", () => {
        assert.strictEqual(DEFAULT_MONTHLY_LIMIT, 15);
    });

    await test("QC-08: Shop ID normalization handles whitespace, symbols and defaults", () => {
        assert.strictEqual(normalizeShopId("Cafe Bangalore 123"), "Cafe_Bangalore_123");
        assert.strictEqual(normalizeShopId(""), "SHOP-BILLNAW-01");
        assert.strictEqual(normalizeShopId(null), "SHOP-BILLNAW-01");
        assert.strictEqual(normalizeShopId("STORE_A"), "STORE_A");
    });

    await test("QC-09: Quota allows exactly 15 scans and rejects the 16th with 429", async () => {
        const testShop = `TEST_QUOTA_SHOP_${Date.now()}`;
        
        // Initial state: 0 used, 15 remaining
        let info = await getClientQuotaInfo(testShop);
        assert.strictEqual(info.limit, 15);
        assert.strictEqual(info.used, 0);
        assert.strictEqual(info.remaining, 15);

        // Consume 15 slots
        for (let i = 1; i <= 15; i++) {
            const check = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
            assert.strictEqual(check.monthlyLimit, 15);
            await recordSuccessfulAiUsage(testShop, check);
            info = await getClientQuotaInfo(testShop);
            assert.strictEqual(info.used, i);
            assert.strictEqual(info.remaining, 15 - i);
        }

        // 16th scan must be rejected with status 429
        let errorCaught = null;
        try {
            await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
        } catch (err) {
            errorCaught = err;
        }

        assert.ok(errorCaught !== null, "16th scan must throw quota error");
        assert.strictEqual(errorCaught.status, 429, "Error status must be 429");
        assert.ok(errorCaught.message.includes("15 scans reached"), "Must mention 15 scans limit");
    });

    await test("QC-10: Slot release on failed AI call restores availability", async () => {
        const testShop = `TEST_RELEASE_SHOP_${Date.now()}`;
        
        // Consume 14 slots
        for (let i = 1; i <= 14; i++) {
            const check = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
            await recordSuccessfulAiUsage(testShop, check);
        }

        // Reserve 15th slot (now at limit)
        const check15 = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
        
        // Simulating failed scan -> release slot
        releaseAiQuotaSlot(testShop);

        // Can reserve 15th slot again without 429
        const check15Retry = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
        assert.ok(check15Retry);
        releaseAiQuotaSlot(testShop);
    });

    await test("QC-11: Dedicated custom Gemini key bypasses server 15-scan limit", async () => {
        const testShop = `TEST_BYOK_SHOP_${Date.now()}`;
        
        // Exhaust 15 scans on server tier
        for (let i = 1; i <= 15; i++) {
            const check = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
            await recordSuccessfulAiUsage(testShop, check);
        }

        // Verify server scan fails
        let serverError = null;
        try {
            await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
        } catch (err) {
            serverError = err;
        }
        assert.strictEqual(serverError.status, 429);

        // BYOK custom key must succeed even though 15 server scans were used
        const byokCheck = await checkAiQuotaAndKey({
            shopId: testShop,
            customApiKey: 'AIzaSyFakeKeyForTestVerification12345678',
            reserveSlot: true
        });
        assert.ok(byokCheck);
        assert.strictEqual(byokCheck.isCustomKey, true);
        releaseAiQuotaSlot(testShop);
    });

    await test("QC-11b: Short/dummy key (<=15 chars) does NOT bypass 15-scan quota limit", async () => {
        const testShop = `TEST_BYOK_SHORT_${Date.now()}`;
        
        // Exhaust 15 scans
        for (let i = 1; i <= 15; i++) {
            const check = await checkAiQuotaAndKey({ shopId: testShop, reserveSlot: true });
            await recordSuccessfulAiUsage(testShop, check);
        }

        // Attempting to bypass quota with a short fake key ("bypass123") must still throw 429
        let caughtErr = null;
        try {
            await checkAiQuotaAndKey({
                shopId: testShop,
                customApiKey: 'bypass123',
                reserveSlot: true
            });
        } catch (err) {
            caughtErr = err;
        }
        assert.ok(caughtErr !== null, "Short key must not bypass quota");
        assert.strictEqual(caughtErr.status, 429, "Must return HTTP 429");
    });

    // -----------------------------------------------------------------
    // SECTION 5: UI & HARD INVARIANTS AUDIT
    // -----------------------------------------------------------------
    console.log("\n📍 SECTION 5: UI & REPO INVARIANTS");

    await test("QC-12: index.html has #aiMenuQuotaPill and #modalAiQuotaStatus", () => {
        assert.ok(html.includes('id="aiMenuQuotaPill"'), "Must include #aiMenuQuotaPill");
        assert.ok(html.includes('id="aiMenuQuotaPillText"'), "Must include #aiMenuQuotaPillText");
        assert.ok(html.includes('id="modalAiQuotaStatus"'), "Must include #modalAiQuotaStatus in modal");
    });

    await test("QC-13: js/menu.js defines refreshAiMenuQuotaPill and integrates with modal and catalog", () => {
        assert.ok(jsMenu.includes('async function refreshAiMenuQuotaPill()'), "refreshAiMenuQuotaPill must be defined");
        assert.ok(jsMenu.includes('refreshAiMenuQuotaPill();'), "Must be invoked");
    });

    await test("QC-14: Exactly 26 modal-close-btn button elements in index.html", () => {
        const matches = html.match(/class="modal-close-btn"/g);
        assert.strictEqual(matches ? matches.length : 0, 26, `Expected exactly 26 modal-close-btn elements, found ${matches ? matches.length : 0}`);
    });

    await test("QC-15: Zero raw Unicode emojis inside button elements in index.html", () => {
        const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
        let match;
        let emojiCount = 0;
        while ((match = buttonRegex.exec(html)) !== null) {
            if (emojiRegex.test(match[1])) {
                emojiCount++;
            }
        }
        assert.strictEqual(emojiCount, 0, `Expected 0 button emojis, found ${emojiCount}`);
    });

    await test("QC-16: 100% bit-for-bit binary parity between firestore.rules and database/firestore.rules", () => {
        assert.ok(rootRules.equals(dbRules), "firestore.rules and database/firestore.rules must be 100% identical");
    });

    console.log("\n====================================================");
    console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log("====================================================");

    if (failed > 0) {
        process.exit(1);
    }
})();
