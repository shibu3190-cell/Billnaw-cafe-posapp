import { spawn } from 'child_process';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9226;
const ARTIFACTS_DIR = 'C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7';
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_test_login_ai_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log("==============================================================================");
    console.log("🧪 TESTING: AUTHENTICATION LOGIN + AI MENU EXTRACTION + DISH IMAGES");
    console.log("==============================================================================");

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${TEMP_USER_DATA_DIR}`,
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1280,900',
        'about:blank'
    ]);

    await sleep(2000);
    const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
    const targets = await listRes.json();
    const page = targets.find(t => t.type === 'page') || targets[0];

    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise(r => { ws.onopen = r; });

    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id === id) {
                ws.removeEventListener('message', handler);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
        const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        return res?.result?.value;
    };

    const captureScreenshot = async (filename) => {
        const res = await send('Page.captureScreenshot', { format: 'png' });
        const filePath = path.join(ARTIFACTS_DIR, filename);
        fs.writeFileSync(filePath, Buffer.from(res.data, 'base64'));
        console.log(`  📸 Screenshot saved: ${filename}`);
    };

    await send('Page.enable');
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2500);

    // ==============================================================================
    // PART 1: LOGIN FLOW & OTP VERIFICATION TESTING
    // ==============================================================================
    console.log("\n🔒 PART 1: TESTING LOGIN FLOW & OTP VERIFICATION");

    // 1.1 Check Auth Modal Presence & UI Cleanliness
    const modalCheck = await evaluate(`(() => {
        const modal = document.getElementById('shopAuthModal');
        const skipBtn = document.getElementById('shopAuthSkipBtn');
        const autoFillBanner = document.getElementById('otpAutoFillBanner');
        const loginEmailInput = document.getElementById('shopAuthEmail');
        const isVisible = modal && window.getComputedStyle(modal).display !== 'none';
        return { isVisible, hasSkipBtn: !!skipBtn, hasAutoFill: !!autoFillBanner, hasEmailInput: !!loginEmailInput };
    })()`);
    console.log("  Auth Modal UI State:", modalCheck);
    assert.strictEqual(modalCheck.hasSkipBtn, false, "Demo skip button must not exist");
    assert.strictEqual(modalCheck.hasAutoFill, false, "Auto-fill helper must not exist");
    assert.ok(modalCheck.hasEmailInput, "Email input must exist on login modal");

    await captureScreenshot('screen_test_login_flow.png');

    // 1.2 Test Backend OTP Generation & Live Verification
    const testEmail = `test_owner_${Date.now()}@billnawcafe.com`;
    console.log(`  Testing OTP Request for: ${testEmail}`);

    const otpSendRes = await evaluate(`(async () => {
        try {
            const res = await fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: '${testEmail}' })
            });
            return await res.json();
        } catch(e) {
            return { error: e.message };
        }
    })()`);
    console.log("  OTP Send Result:", otpSendRes);
    assert.ok(otpSendRes.success, "Backend /api/auth/send-otp must return success: true");

    // 1.3 Test Invalid OTP Rejection
    const invalidOtpRes = await evaluate(`(async () => {
        try {
            const res = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: '${testEmail}', code: '000000' })
            });
            return await res.json();
        } catch(e) {
            return { error: e.message };
        }
    })()`);
    console.log("  Invalid OTP Response (Expected Rejection):", invalidOtpRes);
    assert.strictEqual(invalidOtpRes.success, false, "Invalid OTP code must be rejected");

    // 1.4 Test Backend Signup with Mandatory Phone
    const testPhone = '9876543210';
    const signupRes = await evaluate(`(async () => {
        try {
            const res = await fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: 'Abhijit',
                    lastName: 'Das',
                    email: '${testEmail}',
                    password: 'SecurePassword123!',
                    shopName: 'Test Cafe & Bakery',
                    phone: '${testPhone}'
                })
            });
            return await res.json();
        } catch(e) {
            return { error: e.message };
        }
    })()`);
    console.log("  Signup Response:", signupRes);
    assert.ok(signupRes.success && signupRes.token, "Signup must succeed and return credentials");

    // 1.5 Test Zero-State Metrics on Fresh Shop Profile
    const menuItems = signupRes.shop?.menu || [];
    const ordersCount = signupRes.shop?.orders ? signupRes.shop.orders.length : 0;
    const expensesCount = signupRes.shop?.expenses ? signupRes.shop.expenses.length : 0;
    
    console.log("  Fresh Store Baseline:", {
        menuItemsCount: menuItems.length,
        menuItems: menuItems.map(m => m.name),
        ordersCount,
        expensesCount
    });
    assert.strictEqual(menuItems.length, 4, "Fresh store must seed exactly 4 items");
    assert.strictEqual(ordersCount, 0, "Fresh store must have 0 orders");
    assert.strictEqual(expensesCount, 0, "Fresh store must have 0 expenses");
    console.log("  ✅ PASS: Authentication flow, OTP verification, and Zero-State metrics verified successfully");

    // Close auth modal to proceed to AI Menu & Image tests
    await evaluate(`closeShopAuthModal(true)`);
    await sleep(800);

    // ==============================================================================
    // PART 2: AI MENU EXTRACTION & AUTO-DETECTION TESTING
    // ==============================================================================
    console.log("\n⚡ PART 2: TESTING AI MENU EXTRACTION & AUTO-DETECTION");

    await evaluate(`switchTab('menu')`);
    await sleep(1000);

    // 2.1 Test Opening AI Menu Upload Choice Modal
    await evaluate(`openUploadMenuChoiceModal()`);
    await sleep(600);

    const uploadModalState = await evaluate(`(() => {
        const modal = document.getElementById('uploadMenuChoiceModal');
        const isVisible = modal && window.getComputedStyle(modal).display !== 'none';
        return { isVisible };
    })()`);
    console.log("  Upload Choice Modal State:", uploadModalState);
    assert.ok(uploadModalState.isVisible, "Upload Menu Choice modal must open");

    await captureScreenshot('screen_test_ai_menu_modal.png');

    await evaluate(`closeUploadMenuChoiceModal()`);
    await sleep(400);

    // 2.2 Test AI Document / Text Menu Extraction Endpoint (/api/extract-menu)
    const sampleMenuText = `
        STARTERS & SNACKS
        Paneer Tikka - ₹180
        Crispy Veg Roll - ₹70
        
        MAIN COURSE
        Butter Chicken Handi - ₹280
        Dal Makhani - ₹160
        
        BEVERAGES
        Cold Coffee - ₹60
        Mango Lassi - ₹50
    `;

    console.log("  Invoking /api/extract-menu with sample physical menu text...");
    const aiExtractionResult = await evaluate(`(async () => {
        try {
            const res = await fetch('/api/extract-menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ extractedText: ${JSON.stringify(sampleMenuText)} })
            });
            return await res.json();
        } catch(e) {
            return { error: e.message };
        }
    })()`);
    console.log("  AI Extraction Result:", {
        success: !aiExtractionResult.error,
        categoriesCount: aiExtractionResult.categories ? aiExtractionResult.categories.length : 0,
        categories: aiExtractionResult.categories ? aiExtractionResult.categories.map(c => ({
            name: c.name,
            items: c.items.map(i => `${i.name} (₹${i.price})`)
        })) : []
    });

    assert.ok(aiExtractionResult.categories && aiExtractionResult.categories.length > 0, "AI extraction must parse categories");
    const allParsedItems = aiExtractionResult.categories.flatMap(c => c.items);
    assert.ok(allParsedItems.length >= 4, "AI extraction must parse at least 4 items");
    assert.ok(allParsedItems.some(i => i.name.toLowerCase().includes('paneer')), "Paneer Tikka must be parsed");
    assert.ok(allParsedItems.some(i => i.name.toLowerCase().includes('butter chicken')), "Butter Chicken Handi must be parsed");
    console.log("  ✅ PASS: AI Menu layout parser successfully converted text/document into structured dishes");

    // ==============================================================================
    // PART 3: DISH IMAGE RENDERING & FALLBACK TESTING
    // ==============================================================================
    console.log("\n🖼️ PART 3: TESTING DISH IMAGES & FALLBACK GENERATION");

    // 3.1 Test Fallback Image Generator (Canvas WebP/JPEG data URI with culinary color harmony)
    const imgTest = await evaluate(`(() => {
        const samosaImg = generateFallbackImage('Samosa');
        const teaImg = generateFallbackImage('Tea');
        const chickenImg = generateFallbackImage('Chicken Curry');
        const colaImg = generateFallbackImage('Masala Coke');
        const customImg = generateFallbackImage('Special Mango Smoothie');

        return {
            samosaIsDataImg: samosaImg.startsWith('data:image/'),
            teaIsDataImg: teaImg.startsWith('data:image/'),
            chickenIsDataImg: chickenImg.startsWith('data:image/'),
            colaIsDataImg: colaImg.startsWith('data:image/'),
            customIsDataImg: customImg.startsWith('data:image/'),
            samosaLength: samosaImg.length
        };
    })()`);
    console.log("  Fallback Image Generator Results:", imgTest);
    assert.ok(imgTest.samosaIsDataImg && imgTest.teaIsDataImg && imgTest.chickenIsDataImg, "generateFallbackImage must return valid data:image/ data URIs");

    // 3.2 Verify Image Elements on POS and Menu Catalog
    await evaluate(`switchTab('pos')`);
    await sleep(800);

    const posImagesState = await evaluate(`(() => {
        const cards = Array.from(document.querySelectorAll('#menuGridUI .menu-card'));
        const images = cards.map(c => {
            const img = c.querySelector('img');
            const placeholder = c.querySelector('.card-img-placeholder');
            const title = c.querySelector('.name')?.innerText?.trim();
            return {
                title,
                hasImageOrPlaceholder: !!img || !!placeholder,
                hasStockBadge: !!c.querySelector('.stock-badge')
            };
        });
        return { totalCards: cards.length, images };
    })()`);
    console.log("  POS Dishes & Image State:", posImagesState);
    assert.strictEqual(posImagesState.totalCards, 4, "Expected 4 cards in POS grid");
    assert.ok(posImagesState.images.every(i => i.hasImageOrPlaceholder), "Every POS card must have a visible image or placeholder");

    await captureScreenshot('screen_test_image_rendering.png');
    console.log("  ✅ PASS: Dish image rendering, SVG fallbacks, and visual placeholders verified successfully");

    console.log("\n==============================================================================");
    console.log("🎉 ALL TESTS PASSED! LOGIN, AI MENU & IMAGES OPERATIONAL AND VERIFIED.");
    console.log("==============================================================================");

    ws.close();
    chrome.kill();
}

main().catch(err => {
    console.error("❌ Test failed:", err);
    process.exit(1);
});
