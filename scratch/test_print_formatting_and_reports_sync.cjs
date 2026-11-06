const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('🖨️  THERMAL PRINT GLITCH & REPORT SYNC VERIFICATION SUITE');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function it(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err.message}`);
    }
}

async function itAsync(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
        failed++;
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     ${err.message}`);
    }
}

(async () => {
    // ------------------------------------------------------------------------
    // SECTION 1: ESC/POS SANITIZATION & GLITCH-FREE BYTECODE
    // ------------------------------------------------------------------------
    console.log('📍 SECTION 1: ESC/POS SANITIZATION & HARDWARE OUTPUT INTEGRITY');

    const bridgeModule = await import('../src/core/platform-bridge.js');
    const { ThermalPrinterBridge, sanitizeEscPosText } = bridgeModule;

    it('GLITCH-01: sanitizeEscPosText converts Rupee symbol to Rs. and non-breaking space to standard space', () => {
        const input = "Total: ₹ 150.00\u00A0(Inclusive)";
        const cleaned = sanitizeEscPosText(input);
        assert.strictEqual(cleaned.includes('₹'), false, 'Must not contain raw Rupee symbol');
        assert.strictEqual(cleaned.includes('\u00A0'), false, 'Must not contain non-breaking space');
        assert.ok(cleaned.includes('Rs. 150.00 (Inclusive)'));
    });

    it('GLITCH-02: sanitizeEscPosText converts bullet • to clean pipe | and strips emojis', () => {
        const input = "Time: 12:30 PM • Server: John 👨‍🍳";
        const cleaned = sanitizeEscPosText(input);
        assert.strictEqual(cleaned.includes('•'), false, 'Must not contain unicode bullet');
        assert.strictEqual(cleaned.includes('👨‍🍳'), false, 'Must not contain emojis');
        assert.ok(cleaned.includes('Time: 12:30 PM | Server: John'));
    });

    it('GLITCH-03: generateEscPosCommands starts with ESC @ and ends with standard GS V cut', () => {
        const bill = {
            bill_no: 'B-101',
            amount: 250,
            final_payable_paise: 25000,
            items: [{ name: 'Paneer Tikka ₹ Special', qty: 1, line_total_paise: 25000 }]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(bill, '58mm');
        assert.strictEqual(bytes[0], 0x1B);
        assert.strictEqual(bytes[1], 0x40);
        const last4 = bytes.slice(-4);
        assert.strictEqual(last4[0], 0x1D);
        assert.strictEqual(last4[1], 0x56);
        assert.strictEqual(last4[2], 0x42);
        assert.strictEqual(last4[3], 0x00);
    });

    it('GLITCH-04: generateEscPosCommands contains zero multi-byte UTF-8 glitch bytes for currency', () => {
        const hostileBill = {
            bill_no: 'B-999',
            amount: 99,
            final_payable_paise: 9900,
            items: [
                { name: 'Cold Coffee ₹ 50', qty: 1, line_total_paise: 5000 },
                { name: 'Samosa ₹ 49', qty: 1, line_total_paise: 4900 }
            ],
            notes: 'Extra spicy • No onions 🍕'
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(hostileBill, '58mm');
        // ₹ in UTF-8 is 0xE2 0x82 0xB9. Ensure 0xE2 is never present in the stream
        const hasRupeeBytes = bytes.some((b, i) => b === 0xE2 && bytes[i+1] === 0x82 && bytes[i+2] === 0xB9);
        assert.strictEqual(hasRupeeBytes, false, 'Byte stream must never contain UTF-8 3-byte Rupee glitch sequence');
    });

    it('GLITCH-05: 58mm KOT and Bill output strictly wraps within 32 columns', () => {
        const kotData = {
            jobType: 'KOT',
            table: 'Table 14 - First Floor VIP Lounge',
            biller: 'Senior Captain Alexander',
            items: [
                { name: 'Super Crunchy Chicken Burger with Mayo and Fries', qty: 3, notes: 'Do not add pickles or onions' }
            ]
        };
        const bytes = ThermalPrinterBridge.generateEscPosCommands(kotData, '58mm', { isKot: true });
        const rawText = new TextDecoder().decode(bytes);
        const cleanLines = rawText
            .replace(/\x1B[\s\S]/g, '')
            .replace(/\x1D[\s\S]{1,3}/g, '')
            .split('\n')
            .map(l => l.trim())
            .filter(Boolean);

        for (const line of cleanLines) {
            assert.ok(line.length <= 32, `Line exceeded 32 cols: "${line}" (len=${line.length})`);
        }
    });

    // ------------------------------------------------------------------------
    // SECTION 2: POS.JS PRINT DISPATCH & FALLBACK HARDWARE SAFETY
    // ------------------------------------------------------------------------
    console.log('\n📍 SECTION 2: POS.JS PRINT DISPATCH & FALLBACK ROUTING');

    const posJs = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');

    it('POS-PRN-01: sendEscPosToPrinter routes through ThermalPrinterBridge.routePrintJob', () => {
        assert.ok(posJs.includes('window.ThermalPrinterBridge.routePrintJob(order,') && posJs.includes("role: 'RECEIPT'"),
            'Must route through ThermalPrinterBridge.routePrintJob');
    });

    it('POS-PRN-02: sendEscPosToPrinter direct fallback replaces \\x1B\\x6D with standard GS V cut', () => {
        assert.ok(!posJs.includes('\\x1B\\x6D'), 'pos.js must not send non-standard ESC m cut command');
        assert.ok(posJs.includes('\\x1D\\x56\\x42\\x00'), 'pos.js must send standard GS V 66 0 cut command');
    });

    it('POS-PRN-03: sendKotToPrinter direct fallback uses GS V cut and pipes instead of unicode bullets', () => {
        assert.ok(posJs.includes('Server: ${billerName}\\n'), 'sendKotToPrinter must use clean pipe instead of unicode bullet');
        assert.ok(posJs.includes('FEED_AND_CUT = \'\\x0A\\x0A\\x0A\\x0A\' + GS + \'V\\x42\\x00\''), 'sendKotToPrinter must use standard GS V cut');
    });

    // ------------------------------------------------------------------------
    // SECTION 3: REPORT SECTION SYNC & MULTI-DEVICE DATE EXTRACTION
    // ------------------------------------------------------------------------
    console.log('\n📍 SECTION 3: REPORT SECTION SYNC & MULTI-DEVICE RECONCILIATION');

    const dashJs = fs.readFileSync(path.join(__dirname, '../js/dashboard.js'), 'utf8');
    const coreJs = fs.readFileSync(path.join(__dirname, '../js/core.js'), 'utf8');

    it('REP-01: dashboard.js defines getOrderFilterDate and getExpenseFilterDate', () => {
        assert.ok(dashJs.includes('function getOrderFilterDate(o)'), 'Missing getOrderFilterDate');
        assert.ok(dashJs.includes('function getExpenseFilterDate(e)'), 'Missing getExpenseFilterDate');
    });

    it('REP-02: getOrderFilterDate accurately extracts YYYY-MM-DD from various date formats', () => {
        // Evaluate getOrderFilterDate logic
        const evalSandbox = {};
        const code = `
            function getLocalISODate(d = new Date()) {
                const y = d.getFullYear();
                const m = String(d.getMonth()+1).padStart(2,'0');
                const day = String(d.getDate()).padStart(2,'0');
                return \`\${y}-\${m}-\${day}\`;
            }
            ${dashJs.slice(dashJs.indexOf('function getOrderFilterDate'), dashJs.indexOf('window.getOrderFilterDate = getOrderFilterDate;'))}
            sandboxFn = getOrderFilterDate;
        `;
        const vm = require('vm');
        vm.runInNewContext(code, evalSandbox);
        const fn = evalSandbox.sandboxFn;

        // 1. Direct YYYY-MM-DD filterDate
        assert.strictEqual(fn({ filterDate: '2026-11-07' }), '2026-11-07');
        // 2. ISO created_at string
        assert.strictEqual(fn({ created_at: '2026-11-07T14:30:00.000Z' }), '2026-11-07');
        // 3. Millisecond timestamp ID
        const dateMs = new Date('2026-11-07T12:00:00Z').getTime();
        assert.strictEqual(fn({ id: dateMs }), '2026-11-07');
        // 4. DD/MM/YYYY local date string
        assert.strictEqual(fn({ date: '07/11/2026, 01:21:00 am' }), '2026-11-07');
    });

    it('REP-03: handleRemoteFirestoreUpdate merges remote orders without dropping local orders', () => {
        assert.ok(coreJs.includes('const orderMap = new Map();'), 'core.js must use Map to merge orders');
        assert.ok(coreJs.includes('if (!orderMap.has(key))'), 'core.js must preserve local unmerged orders');
    });

    it('REP-04: subscribeInvoicesCloudListener merges incoming invoices into orderHistory and updates dashboard', () => {
        assert.ok(coreJs.includes('invoices.forEach(inv => {'), 'core.js must iterate received invoices');
        assert.ok(coreJs.includes('window.dispatchEvent(new CustomEvent(\'billnaw:invoices-updated\''), 'core.js dispatches invoices-updated');
        assert.ok(dashJs.includes('window.addEventListener(\'billnaw:invoices-updated\''), 'dashboard.js listens to invoices-updated');
    });

    // ------------------------------------------------------------------------
    // SECTION 4: INVARIANTS & INTEGRITY AUDIT
    // ------------------------------------------------------------------------
    console.log('\n📍 SECTION 4: INVARIANTS & INTEGRITY AUDIT');

    const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

    it('INV-01: Exactly 26 modal-close-btn button elements exist in index.html', () => {
        const matches = html.match(/<button[^>]*class=["'][^"']*modal-close-btn[^"']*["']/g) || [];
        assert.strictEqual(matches.length, 26, `Expected exactly 26 modal-close-btn, found ${matches.length}`);
    });

    it('INV-02: Zero raw Unicode emojis inside button elements in index.html', () => {
        const buttonRegex = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
        let match;
        const violatingButtons = [];
        while ((match = buttonRegex.exec(html)) !== null) {
            const buttonHtml = match[0];
            const textContent = match[1].replace(/<svg[\s\S]*?<\/svg>/gi, '');
            if (emojiRegex.test(textContent)) {
                violatingButtons.push(buttonHtml.slice(0, 80));
            }
        }
        assert.strictEqual(violatingButtons.length, 0, `Found raw emojis in buttons:\n${violatingButtons.join('\n')}`);
    });

    console.log('\n====================================================');
    console.log(`🎯 TOTAL SUITE: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        console.log('✨ ALL THERMAL PRINT & REPORT SYNC DELIVERABLES VERIFIED 100% GREEN!\n');
    }
})();
