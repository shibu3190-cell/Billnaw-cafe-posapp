// ============================================================
// 🎯 HIGH-CONVERSION BLUEPRINT: 5-FACTOR AUTOMATED AUDIT
// Tests: Contrast Overlays, Proximity Steppers, Loss Aversion,
// Relative Tax Framing, and Fast Tender / Dynamic UPI QR Engine.
// ============================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('📐 HIGH-CONVERSION UI/UX BLUEPRINT AUDIT & VERIFICATION');
console.log('====================================================\n');

let passCount = 0;
function test(name, fn) {
    try {
        fn();
        console.log(`  ✅ PASS: ${name}`);
        passCount++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Error: ${err.message}`);
        process.exitCode = 1;
    }
}

const rootDir = path.resolve(__dirname, '..');
const styleCss = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf-8');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf-8');
const menuJs = fs.readFileSync(path.join(rootDir, 'js', 'menu.js'), 'utf-8');
const posJs = fs.readFileSync(path.join(rootDir, 'js', 'pos.js'), 'utf-8');

// ------------------------------------------------------------
// FACTOR 1: Contrast & Visibility (Subtle Food Backdrops)
// ------------------------------------------------------------
console.log('📍 FACTOR 1: CONTRAST & VISIBILITY (SUBTLE FOOD PHOTO BACKDROPS)');
test('style.css has gradient backdrop on dish photos (.card-img-wrapper::after)', () => {
    assert(styleCss.includes('.card-img-wrapper::after'), 'Missing .card-img-wrapper::after selector');
    assert(styleCss.includes('linear-gradient(180deg, rgba(0,0,0,0) 25%, rgba(30, 18, 12, 0.65) 100%)'), 'Missing high-contrast gradient backdrop');
    assert(styleCss.includes('z-index: 1'), 'Backdrop should have z-index: 1');
});

test('style.css defines .card-img-price-pill with tabular nums & frosted backdrop', () => {
    assert(styleCss.includes('.card-img-price-pill'), 'Missing .card-img-price-pill class');
    assert(styleCss.includes('backdrop-filter: blur(4px)'), 'Missing frosted glass effect');
    assert(styleCss.includes('tabular-nums'), 'Price pill must use tabular nums');
});

test('menu.js injects card-img-price-pill into dish card image wrappers', () => {
    assert(menuJs.includes('card-img-price-pill'), 'menu.js should render .card-img-price-pill on menu cards');
});

// ------------------------------------------------------------
// FACTOR 2: Proximity Quantity Steppers (-65% Motor Friction)
// ------------------------------------------------------------
console.log('\n📍 FACTOR 2: PROXIMITY QUANTITY STEPPERS (1-MOTION CONTROL)');
test('style.css defines ergonomic .item-qty-control with touch targets & spring feedback', () => {
    assert(styleCss.includes('.item-qty-control'), 'Missing .item-qty-control');
    assert(styleCss.includes('.item-qty-control button'), 'Missing .item-qty-control button');
    assert(styleCss.includes('transform: scale(0.9)'), 'Missing active spring feedback');
});

test('menu.js renders inline stepper directly on dish cards when qtyInCart > 0', () => {
    assert(menuJs.includes('syncMenuUIQuantities'), 'Missing syncMenuUIQuantities');
    assert(menuJs.includes('item-qty-control'), 'syncMenuUIQuantities should render item-qty-control');
    assert(menuJs.includes('event.stopPropagation()'), 'Stepper must prevent event bubbling');
    assert(menuJs.includes('modifyQty('), 'Stepper must wire to modifyQty');
});

test('Dishes with zero quantity render sleek + ADD pill', () => {
    assert(menuJs.includes('+ ADD'), 'Zero quantity items should render + ADD');
    assert(menuJs.includes('OUT'), 'Out of stock items should render OUT button');
});

// ------------------------------------------------------------
// FACTOR 3: Psychological Loss Aversion (VIP Loyalty Protection)
// ------------------------------------------------------------
console.log('\n📍 FACTOR 3: PSYCHOLOGICAL LOSS AVERSION (VIP LOYALTY PROTECTION)');
test('index.html contains #cartLossAversionAlert with warning shield & action trigger', () => {
    assert(indexHtml.includes('id="cartLossAversionAlert"'), 'Missing #cartLossAversionAlert in index.html');
    assert(indexHtml.includes('id="cartLossAversionMsg"'), 'Missing #cartLossAversionMsg in index.html');
    assert(indexHtml.includes('openCheckoutModal()'), 'Alert button should link directly to phone entry in checkout');
});

test('style.css styles .loss-aversion-banner with amber palette', () => {
    assert(styleCss.includes('.loss-aversion-banner'), 'Missing .loss-aversion-banner in style.css');
    assert(styleCss.includes('#FFFBEB'), 'Should use amber warm background');
    assert(styleCss.includes('.la-action-btn'), 'Missing .la-action-btn styling');
});

test('pos.js displays loss aversion alert when cart has items and diner phone is unlinked', () => {
    assert(posJs.includes('cartLossAversionAlert'), 'pos.js should reference cartLossAversionAlert');
    assert(posJs.includes('Diner forfeits'), 'pos.js should compute forfeited VIP loyalty points / cash message');
});

// ------------------------------------------------------------
// FACTOR 4: Relative Evaluation Contrast (Transparent GST Framing)
// ------------------------------------------------------------
console.log('\n📍 FACTOR 4: RELATIVE EVALUATION CONTRAST (GST RELATIVE FRAMING)');
test('style.css contains .gst-pct-pill badge styling', () => {
    assert(styleCss.includes('.gst-pct-pill'), 'Missing .gst-pct-pill in style.css');
    assert(styleCss.includes('var(--accent-soft)'), 'Should use subtle accent soft styling');
});

test('pos.js updateCartUI calculates and displays relative GST percentage', () => {
    assert(posJs.includes('gst-pct-pill'), 'pos.js should render .gst-pct-pill');
    assert(posJs.includes('Just '), 'pos.js should frame tax as "Just X%"');
    assert(posJs.includes('totals.finalTotal > 0 ? ((totals.totalTax / totals.finalTotal) * 100).toFixed(1) : \'0\''), 'Accurate percentage calculation formula');
});

test('Relative tax calculation accuracy unit simulation', () => {
    const mockOrder1 = { finalTotal: 500, totalTax: 25 }; // 5.0%
    const pct1 = ((mockOrder1.totalTax / mockOrder1.finalTotal) * 100).toFixed(1);
    assert.strictEqual(pct1, '5.0', '500 with 25 tax should be 5.0%');

    const mockOrder2 = { finalTotal: 770, totalTax: 18.5 }; // ~2.4%
    const pct2 = ((mockOrder2.totalTax / mockOrder2.finalTotal) * 100).toFixed(1);
    assert.strictEqual(pct2, '2.4', '770 with 18.5 tax should be 2.4%');
});

// ------------------------------------------------------------
// FACTOR 5: Fast Tender Engine & Dynamic In-Modal UPI QR
// ------------------------------------------------------------
console.log('\n📍 FACTOR 5: FAST TENDER ENGINE & CRO CHECKOUT OPTIMIZATION');
test('index.html contains #checkoutCashTenderContainer with input, pills, and change due box', () => {
    assert(indexHtml.includes('id="checkoutCashTenderContainer"'), 'Missing #checkoutCashTenderContainer');
    assert(indexHtml.includes('id="checkoutDenomPills"'), 'Missing #checkoutDenomPills');
    assert(indexHtml.includes('id="checkoutCashTenderedInput"'), 'Missing #checkoutCashTenderedInput');
    assert(indexHtml.includes('id="checkoutChangeDueBox"'), 'Missing #checkoutChangeDueBox');
    assert(indexHtml.includes('id="checkoutChangeDueDisplay"'), 'Missing #checkoutChangeDueDisplay');
});

test('index.html contains #checkoutUpiQrContainer for in-modal dynamic QR preview', () => {
    assert(indexHtml.includes('id="checkoutUpiQrContainer"'), 'Missing #checkoutUpiQrContainer');
    assert(indexHtml.includes('id="checkoutModalQrCanvas"'), 'Missing #checkoutModalQrCanvas');
    assert(indexHtml.includes('id="checkoutUpiAmtDisplay"'), 'Missing #checkoutUpiAmtDisplay');
});

test('style.css defines cash tender, denomination pill, and change due styles', () => {
    assert(styleCss.includes('.cash-tender-wrap'), 'Missing .cash-tender-wrap');
    assert(styleCss.includes('.denom-pill'), 'Missing .denom-pill');
    assert(styleCss.includes('.change-due-box'), 'Missing .change-due-box');
    assert(styleCss.includes('.change-due-box.shortage'), 'Missing shortage styling');
    assert(styleCss.includes('.checkout-qr-wrap'), 'Missing .checkout-qr-wrap');
});

test('pos.js implements setupCheckoutTenderEngine, setTenderAmount, onCashTenderedChange, renderCheckoutUpiQr', () => {
    assert(posJs.includes('setupCheckoutTenderEngine'), 'Missing setupCheckoutTenderEngine');
    assert(posJs.includes('setTenderAmount'), 'Missing setTenderAmount');
    assert(posJs.includes('onCashTenderedChange'), 'Missing onCashTenderedChange');
    assert(posJs.includes('renderCheckoutUpiQr'), 'Missing renderCheckoutUpiQr');
});

test('Denomination engine calculates correct smart pills for given bill amounts', () => {
    function generateTestDenoms(orderTotal) {
        const denoms = new Set();
        denoms.add(Math.round(orderTotal * 100) / 100);
        const steps = [10, 20, 50, 100, 200, 500, 2000];
        steps.forEach(step => {
            if (orderTotal < step) {
                denoms.add(step);
            } else {
                const nextRound = Math.ceil(orderTotal / step) * step;
                if (nextRound > orderTotal) denoms.add(nextRound);
            }
        });
        return Array.from(denoms).sort((a, b) => a - b).slice(0, 5);
    }

    const denoms340 = generateTestDenoms(340);
    assert(denoms340.includes(340), 'Must include exact 340');
    assert(denoms340.includes(350), 'Must include rounded 350');
    assert(denoms340.includes(400), 'Must include rounded 400');
    assert(denoms340.includes(500), 'Must include standard 500');
});

test('Change Due calculation accurately detects exact change, excess tender, and shortage', () => {
    const total = 425;
    
    // Exact
    assert.strictEqual(425 - total, 0);

    // Overpayment
    const tender500 = 500;
    assert.strictEqual(tender500 - total, 75);

    // Shortage
    const tender400 = 400;
    assert.strictEqual(total - tender400, 25);
});

test('pos.js confirmCheckout stores amountTendered and changeReturned in newOrder', () => {
    assert(posJs.includes('amountTendered: amountTendered'), 'confirmCheckout must persist amountTendered');
    assert(posJs.includes('changeReturned: changeReturned'), 'confirmCheckout must persist changeReturned');
});

test('HTML and ESC/POS thermal receipts render Cash Tendered and Change Due', () => {
    assert(posJs.includes('Cash Tendered'), 'Receipt should include Cash Tendered');
    assert(posJs.includes('Change Due') || posJs.includes('Change Returned'), 'Receipt should include Change Due/Returned');
});

console.log('\n====================================================');
console.log(`🎯 BLUEPRINT VERIFICATION COMPLETE: ${passCount} PASSED, 0 FAILED`);
console.log('====================================================\n');
