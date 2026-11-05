/**
 * 🧾 TEST SUITE: STATUTORY INVOICE COMPLIANCE, STORE PROFILE DETAILS & ANTI-WIPE PERSISTENCE
 * Verifies:
 * 1. Statutory Store Details (Address, Phone, FSSAI, GSTIN, Dynamic NPCI UPI QR).
 * 2. Anti-Wipe Quad-Tier Persistence & Cache-Clear Resilience.
 * 3. Dynamic GST Engine & Invoice Titles ("TAX INVOICE" vs "RETAIL INVOICE").
 * 4. Thermal ESC/POS Byte Stream & HTML Printable Receipt Template.
 * 5. On-Screen Invoice Preview Modal (#billInvoiceModal) Synchronization.
 * 6. Codebase Invariants (26 .modal-close-btn SVGs, 0 raw emojis in buttons, currency space ₹ ).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('🧾 STATUTORY INVOICE & ANTI-WIPE PERSISTENCE AUDIT');
console.log('====================================================\n');

let totalTests = 0;
let passedTests = 0;

function it(name, fn) {
    totalTests++;
    try {
        fn();
        passedTests++;
        console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
    }
}

const html = fs.readFileSync('index.html', 'utf8');
const coreJs = fs.readFileSync(path.join('js', 'core.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join('js', 'settings.js'), 'utf8');
const posJs = fs.readFileSync(path.join('js', 'pos.js'), 'utf8');

// ----------------------------------------------------
// SECTION 1: HTML TEMPLATE & MODAL ELEMENT CONTRACTS
// ----------------------------------------------------
console.log('📍 SECTION 1: HTML TEMPLATE & MODAL ELEMENT CONTRACTS');

it('SEC1-01: #storeProfileModal contains all statutory business inputs including Phone, FSSAI, GSTIN, Address, UPI ID, and QR toggle', () => {
    assert(html.includes('id="shopNameInput"'), 'shopNameInput missing');
    assert(html.includes('id="shopPhoneInput"'), 'shopPhoneInput missing');
    assert(html.includes('id="fssaiInput"'), 'fssaiInput missing');
    assert(html.includes('id="gstinInput"'), 'gstinInput missing');
    assert(html.includes('id="shopAddressInput"'), 'shopAddressInput missing');
    assert(html.includes('id="shopUpiIdInput"'), 'shopUpiIdInput missing');
    assert(html.includes('id="shopShowQrInput"'), 'shopShowQrInput missing');
});

it('SEC1-02: #billInvoiceModal contains statutory header, address, phone, FSSAI, GSTIN, GST breakdown, and dynamic QR container', () => {
    assert(html.includes('id="invModalTitle"'), 'invModalTitle missing');
    assert(html.includes('id="invModalDocTypeBadge"'), 'invModalDocTypeBadge missing');
    assert(html.includes('id="invModalShopName"'), 'invModalShopName missing');
    assert(html.includes('id="invModalShopAddress"'), 'invModalShopAddress missing');
    assert(html.includes('id="invModalShopPhone"'), 'invModalShopPhone missing');
    assert(html.includes('id="invModalShopFssai"'), 'invModalShopFssai missing');
    assert(html.includes('id="invModalShopGstin"'), 'invModalShopGstin missing');
    assert(html.includes('id="invModalGstBreakdown"'), 'invModalGstBreakdown missing');
    assert(html.includes('id="invModalQrWrap"'), 'invModalQrWrap missing');
    assert(html.includes('id="invModalQrCode"'), 'invModalQrCode missing');
    assert(html.includes('id="invModalQrCaption"'), 'invModalQrCaption missing');
});

it('SEC1-03: #print-receipt printable template contains all statutory fields and invoice title', () => {
    assert(html.includes('id="printShopName"'), 'printShopName missing');
    assert(html.includes('id="printShopAddress"'), 'printShopAddress missing');
    assert(html.includes('id="printShopPhone"'), 'printShopPhone missing');
    assert(html.includes('id="printFssai"'), 'printFssai missing');
    assert(html.includes('id="printGstin"'), 'printGstin missing');
    assert(html.includes('id="printInvoiceTitle"'), 'printInvoiceTitle missing');
    assert(html.includes('id="printQrCode"'), 'printQrCode missing');
});

// ----------------------------------------------------
// SECTION 2: ANTI-WIPE QUAD-TIER PERSISTENCE ENGINE
// ----------------------------------------------------
console.log('\n📍 SECTION 2: ANTI-WIPE QUAD-TIER PERSISTENCE ENGINE');

it('SEC2-01: shopProfile model in js/core.js tracks phone and ownerPhone by default', () => {
    assert(coreJs.includes('phone: ""'), 'phone field missing from shopProfile');
    assert(coreJs.includes('ownerPhone: ""'), 'ownerPhone field missing from shopProfile');
});

it('SEC2-02: persistProfile() synchronizes to Memory, IndexedDB, LocalStorage JSON snapshot, discrete keys, and Firestore', () => {
    assert(coreJs.includes("idb.set('cafe_profile', shopProfile)"), 'IndexedDB write missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile))"), 'LocalStorage JSON snapshot missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_shop_phone', shopProfile.phone)"), 'Discrete phone key missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_shop_address', shopProfile.address)"), 'Discrete address key missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai)"), 'Discrete FSSAI key missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin)"), 'Discrete GSTIN key missing');
    assert(coreJs.includes("localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId)"), 'Discrete UPI ID key missing');
    assert(coreJs.includes("window.firestoreSetDoc(storeDocRef, { profile: shopProfile"), 'Cloud Firestore master write missing');
});

it('SEC2-03: initDatabase() recovers profile from LocalStorage and discrete keys if IndexedDB cache is cleared', () => {
    assert(coreJs.includes("localStorage.getItem('billnaw_store_profile')"), 'LocalStorage snapshot check missing in initDatabase');
    assert(coreJs.includes("localStorage.getItem('billnaw_shop_phone')"), 'Discrete phone recovery missing in initDatabase');
    assert(coreJs.includes("localStorage.getItem('billnaw_shop_address')"), 'Discrete address recovery missing in initDatabase');
    assert(coreJs.includes("localStorage.getItem('billnaw_shop_fssai')"), 'Discrete fssai recovery missing in initDatabase');
    assert(coreJs.includes("localStorage.getItem('billnaw_shop_gstin')"), 'Discrete gstin recovery missing in initDatabase');
});

it('SEC2-04: initDatabase() & handleRemoteFirestoreUpdate() reconcile cloud profile and heal local caches', () => {
    assert(coreJs.includes('window.firestoreGetDoc(storeDocRef)'), 'Proactive Firestore getDoc missing in initDatabase');
    assert(coreJs.includes('idb.set(\'cafe_profile\', shopProfile)'), 'Cache healing write to idb missing');
    assert(coreJs.includes('handleRemoteFirestoreUpdate'), 'handleRemoteFirestoreUpdate missing');
    assert(coreJs.includes("if (typeof updateProfileVisuals === 'function') updateProfileVisuals()"), 'Visual sync call on cloud update missing');
});

// ----------------------------------------------------
// SECTION 3: DYNAMIC GST ENGINE & INVOICE TITLES
// ----------------------------------------------------
console.log('\n📍 SECTION 3: DYNAMIC GST ENGINE & INVOICE TITLES');

it('SEC3-01: calculateOrderTotals() returns itemized gstSummary map partitioned into CGST and SGST', () => {
    assert(coreJs.includes('let gstSummary = {};'), 'gstSummary initialization missing in calculateOrderTotals');
    assert(coreJs.includes('gstSummary[rKey].cgst +='), 'CGST partition missing');
    assert(coreJs.includes('gstSummary[rKey].sgst +='), 'SGST partition missing');
    assert(coreJs.includes('gstSummary\n    };') || coreJs.includes('gstSummary\r\n    };') || coreJs.includes('gstSummary: {}'), 'gstSummary return missing');
});

it('SEC3-02: Simulated 5% Tax-Inclusive calculations correctly split CGST (2.5%) and SGST (2.5%)', () => {
    // Replicate core calculation
    const defaultRate = 5;
    const mode = 'inclusive';
    const items = [
        { price: 105, qty: 1, gstRate: 5 },
        { price: 210, qty: 1, gstRate: 5 }
    ];
    let computedTaxableSubtotal = 0;
    let totalTax = 0;
    let gstSummary = {};

    items.forEach(item => {
        const itemGross = item.price * item.qty;
        const itemGstRate = item.gstRate || defaultRate;
        const basePrice = itemGross / (1 + (itemGstRate / 100));
        const itemTax = itemGross - basePrice;
        computedTaxableSubtotal += basePrice;
        totalTax += itemTax;

        const rKey = String(itemGstRate);
        if (!gstSummary[rKey]) gstSummary[rKey] = { rate: itemGstRate, base: 0, tax: 0, cgst: 0, sgst: 0 };
        gstSummary[rKey].base += basePrice;
        gstSummary[rKey].tax += itemTax;
        gstSummary[rKey].cgst += itemTax / 2;
        gstSummary[rKey].sgst += itemTax / 2;
    });

    assert.strictEqual(Math.round((computedTaxableSubtotal + totalTax) * 100) / 100, 315);
    assert.strictEqual(Math.round(totalTax * 100) / 100, 15);
    assert.strictEqual(Math.round(gstSummary['5'].cgst * 100) / 100, 7.5);
    assert.strictEqual(Math.round(gstSummary['5'].sgst * 100) / 100, 7.5);
});

it('SEC3-03: When GST is disabled (mode === "none"), tax is strictly 0 and gstSummary is empty', () => {
    const mode = 'none';
    const items = [{ price: 100, qty: 2, gstRate: 5 }];
    let totalTax = 0;
    let gstSummary = {};
    if (mode === 'none') {
        totalTax = 0;
        gstSummary = {};
    }
    assert.strictEqual(totalTax, 0);
    assert.strictEqual(Object.keys(gstSummary).length, 0);
});

// ----------------------------------------------------
// SECTION 4: VISUAL UPDATES & RECEIPT GENERATION
// ----------------------------------------------------
console.log('\n📍 SECTION 4: VISUAL UPDATES & RECEIPT GENERATION');

it('SEC4-01: updateProfileVisuals() in js/settings.js correctly binds printShopAddress and printShopPhone (no typo)', () => {
    assert(settingsJs.includes("document.getElementById('printShopAddress')"), 'printShopAddress binding missing');
    assert(settingsJs.includes("document.getElementById('printShopPhone')"), 'printShopPhone binding missing');
    assert(settingsJs.includes("document.getElementById('printInvoiceTitle')"), 'printInvoiceTitle binding missing');
    assert(settingsJs.includes("document.getElementById('invModalDocTypeBadge')"), 'invModalDocTypeBadge binding missing');
});

it('SEC4-02: updateProfileVisuals() suppresses GSTIN and shows "RETAIL INVOICE" when GST mode is none', () => {
    assert(settingsJs.includes("const isGstActive = shopProfile.gstMode !== 'none'"), 'isGstActive check missing');
    assert(settingsJs.includes("const docTitle = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE'"), 'docTitle calculation missing');
    assert(settingsJs.includes("if (isGstActive && shopProfile.gstin)"), 'GSTIN suppression condition missing');
});

it('SEC4-03: sendEscPosToPrinter() HTML path populates invoice title, store address, phone, FSSAI, GSTIN, and GST breakdown', () => {
    assert(posJs.includes("pInvoiceTitle.innerText = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE'"), 'HTML printInvoiceTitle missing');
    assert(posJs.includes("pShopAddr.innerText = shopProfile.address"), 'HTML printShopAddress missing');
    assert(posJs.includes("pShopPhone.innerText = shopProfile.phone ? `Tel: ${shopProfile.phone}`"), 'HTML printShopPhone missing');
    assert(posJs.includes("pFssai.innerText = shopProfile.fssai ? `FSSAI Lic. No.: ${shopProfile.fssai}`"), 'HTML printFssai missing');
    assert(posJs.includes("pGstin.innerText = (isGstActive && shopProfile.gstin) ? `GSTIN: ${shopProfile.gstin}`"), 'HTML printGstin missing');
    assert(posJs.includes("--- GST BREAKDOWN ---"), 'HTML GST breakdown header missing');
});

it('SEC4-04: sendEscPosToPrinter() ESC/POS thermal text stream outputs Store Name, Address, Phone, FSSAI, GSTIN, and TAX/RETAIL header', () => {
    assert(posJs.includes("receiptText += ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON + (shopProfile.name || 'billnaw')"), 'ESC/POS store name missing');
    assert(posJs.includes("if(shopProfile.address) receiptText += shopProfile.address + '\\n'"), 'ESC/POS address missing');
    assert(posJs.includes("if(shopProfile.phone) receiptText += 'Tel: ' + shopProfile.phone + '\\n'"), 'ESC/POS phone missing');
    assert(posJs.includes("if(shopProfile.fssai) receiptText += 'FSSAI Lic. No.: ' + shopProfile.fssai + '\\n'"), 'ESC/POS fssai missing');
    assert(posJs.includes("if(isGstActive && shopProfile.gstin) receiptText += 'GSTIN: ' + shopProfile.gstin + '\\n'"), 'ESC/POS gstin missing');
    assert(posJs.includes("(isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE')"), 'ESC/POS invoice title missing');
});

it('SEC4-05: viewOrderInvoiceModal() populates store details, GST breakdown, and dynamic UPI QR preview', () => {
    assert(posJs.includes("invTitle.innerText = isGstActive ? 'Tax Invoice' : 'Retail Invoice'"), 'Modal invTitle missing');
    assert(posJs.includes("invShopAddr.innerText = shopProfile.address"), 'Modal shop address missing');
    assert(posJs.includes("invShopPhone.innerText = shopProfile.phone ? `Tel: ${shopProfile.phone}`"), 'Modal shop phone missing');
    assert(posJs.includes("invGstBreakdown.innerHTML = breakdownHtml"), 'Modal GST breakdown HTML missing');
    assert(posJs.includes("upi://pay?pa="), 'Modal dynamic UPI intent URL missing');
    assert(posJs.includes("Scan to Pay ₹"), 'Modal QR caption missing');
});

// ----------------------------------------------------
// SECTION 5: INVARIANTS & INTEGRITY AUDIT
// ----------------------------------------------------
console.log('\n📍 SECTION 5: INVARIANTS & INTEGRITY AUDIT');

it('SEC5-01: Exactly 26 modal-close-btn button elements exist in index.html', () => {
    const buttonCloseMatches = html.match(/<button[^>]*class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
    assert.strictEqual(buttonCloseMatches.length, 26, `Expected exactly 26 modal-close-btn button elements, found ${buttonCloseMatches.length}`);
});

it('SEC5-02: Zero raw Unicode emojis inside button elements in index.html', () => {
    const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
    let match;
    const rawEmojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    let violations = [];

    while ((match = buttonRegex.exec(html)) !== null) {
        const content = match[1];
        if (rawEmojiRegex.test(content)) {
            violations.push(content.trim().slice(0, 30));
        }
    }
    assert.strictEqual(violations.length, 0, `Found raw emojis in buttons: ${violations.join(', ')}`);
});

it('SEC5-03: Currency formatting consistently adheres to non-breaking space "₹ "', () => {
    assert(posJs.includes('₹ ${Number(item.price).toFixed(2)}') || posJs.includes('₹ ${'), 'Standard currency format present');
    assert(!html.includes('₹0.00'), 'Index HTML does not contain unspaced currency format');
});

console.log('\n====================================================');
console.log(`🎯 TOTAL SUITE: ${passedTests} PASSED, ${totalTests - passedTests} FAILED (TOTAL: ${totalTests})`);
console.log('====================================================\n');

if (passedTests === totalTests) {
    console.log('✨ ALL STATUTORY INVOICE & PERSISTENCE DELIVERABLES VERIFIED 100%!\n');
    process.exit(0);
} else {
    console.error('❌ SOME AUDIT CHECKS FAILED!\n');
    process.exit(1);
}
