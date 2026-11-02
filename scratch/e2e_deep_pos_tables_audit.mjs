// scratch/e2e_deep_pos_tables_audit.mjs
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DEBUG_PORT = 9244;
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const USER_DATA = path.join(process.cwd(), 'scratch', 'chrome_audit_profile_' + Date.now());

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function cdpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
            });
        }).on('error', reject);
    });
}

class CDPClient {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.id = 1;
        this.callbacks = new Map();
        this.consoleMessages = [];
        this.errors = [];
        this.warnings = [];
    }

    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.onopen = resolve;
            this.ws.onerror = reject;
        });

        this.ws.onmessage = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id && this.callbacks.has(data.id)) {
                const { resolve, reject } = this.callbacks.get(data.id);
                this.callbacks.delete(data.id);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }

            if (data.method === 'Runtime.consoleAPICalled') {
                const type = data.params.type;
                const text = data.params.args.map(a => a.value !== undefined ? String(a.value) : (a.description || '')).join(' ');
                this.consoleMessages.push({ type, text });
                if (type === 'error') {
                    this.errors.push(text);
                } else if (type === 'warning') {
                    this.warnings.push(text);
                }
            }

            if (data.method === 'Runtime.exceptionThrown') {
                const desc = data.params?.exceptionDetails?.exception?.description ||
                             data.params?.exceptionDetails?.text || 'Unknown exception';
                this.errors.push('[EXCEPTION] ' + desc);
            }
        };
    }

    send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = this.id++;
            this.callbacks.set(id, { resolve, reject });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }

    async evaluate(expression) {
        const res = await this.send('Runtime.evaluate', {
            expression,
            returnByValue: true,
            awaitPromise: true
        });
        if (res.exceptionDetails) {
            const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
            this.errors.push('[EVAL EXCEPTION] ' + desc);
        }
        return res?.result?.value;
    }

    async setViewport(width, height, isMobile = false) {
        await this.send('Emulation.setDeviceMetricsOverride', {
            width,
            height,
            deviceScaleFactor: isMobile ? 2 : 1,
            mobile: isMobile
        });
        await sleep(500);
    }

    close() {
        if (this.ws) this.ws.close();
    }
}

async function runAudit() {
    console.log("==============================================================================");
    console.log("🔍 DEEP AUDIT: FEATURE 1 (POS & FAST TENDER) & FEATURE 2 (TABLES & KOT)");
    console.log("==============================================================================\n");

    if (!fs.existsSync(USER_DATA)) fs.mkdirSync(USER_DATA, { recursive: true });

    const chrome = spawn(CHROME_PATH, [
        `--remote-debugging-port=${DEBUG_PORT}`,
        `--user-data-dir=${USER_DATA}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--headless=new',
        '--disable-gpu',
        '--window-size=1440,900',
        'http://localhost:5000'
    ], { stdio: 'ignore' });

    try {
        let connected = false;
        let tabs = [];
        for (let i = 0; i < 20; i++) {
            await sleep(500);
            try {
                tabs = await cdpGet(`http://localhost:${DEBUG_PORT}/json`);
                if (tabs && tabs.length > 0) {
                    connected = true;
                    break;
                }
            } catch (e) {}
        }
        if (!connected) throw new Error('Could not connect to Chrome debugging port');

        const tab = tabs.find(t => t.type === 'page') || tabs[0];
        const client = new CDPClient(tab.webSocketDebuggerUrl);
        await client.connect();

        await client.send('Page.enable');
        await client.send('Runtime.enable');
        await client.send('Log.enable');

        await sleep(2000);

        // Dismiss auth if modal is shown by setting demo mode
        await client.evaluate(`(() => {
            localStorage.setItem('billnaw_auth_mode', 'demo');
            if (typeof window.closeShopAuthModal === 'function') {
                window.closeShopAuthModal(true);
            }
            if (document.getElementById('shopAuthModal')) {
                document.getElementById('shopAuthModal').style.display = 'none';
            }
            if (typeof window.switchTab === 'function') {
                window.switchTab('pos');
            }
        })()`);
        await sleep(1000);

        const auditReport = {
            viewportsTested: [],
            posBillingResults: {},
            fastTenderResults: {},
            tableManagementResults: {},
            kotResults: {},
            invariants: {},
            consoleAudit: {
                totalMessages: 0,
                errors: [],
                warnings: []
            }
        };

        // ==========================================================================
        // VIEWPORT 1: PC (1440 x 900)
        // ==========================================================================
        console.log("🖥️ --- VIEWPORT 1: PC DESKTOP (1440 x 900) ---");
        await client.setViewport(1440, 900, false);
        auditReport.viewportsTested.push("PC (1440x900)");

        const pcLayout = await client.evaluate(`(() => {
            const pos = document.getElementById('pos');
            const posLeft = document.querySelector('.pos-left');
            const posRight = document.querySelector('.pos-right');
            const menuGrid = document.querySelector('.menu-grid');
            const tableSection = document.getElementById('tablesWrapper') || document.getElementById('posTablesSection');
            return {
                posDisplay: window.getComputedStyle(pos).display,
                posLeftWidth: posLeft ? window.getComputedStyle(posLeft).width : null,
                posRightWidth: posRight ? window.getComputedStyle(posRight).width : null,
                menuGridCols: menuGrid ? window.getComputedStyle(menuGrid).gridTemplateColumns.split(' ').length : 0,
                tableSectionVisible: tableSection ? window.getComputedStyle(tableSection).display !== 'none' : false
            };
        })()`);
        console.log("  PC Layout State:", pcLayout);

        // ==========================================================================
        // FEATURE 1: POS Billing & Cart Modifications
        // ==========================================================================
        console.log("\n🛒 --- TESTING FEATURE 1: POS BILLING & CART MODIFICATIONS ---");
        
        // Reset cart first
        await client.evaluate(`(() => {
            window.cart = [];
            if (typeof window.updateCartUI === 'function') window.updateCartUI();
        })()`);
        await sleep(500);

        // 1. Add Samosa via addToCart or stepper
        const cartStep1 = await client.evaluate(`(() => {
            const samosa = window.menuItems.find(i => i.name.toLowerCase().includes('samosa'));
            if (samosa && typeof window.addToCart === 'function') {
                window.addToCart(samosa);
            }
            return {
                cartCount: window.cart.reduce((s, i) => s + (i.quantity || i.qty || 1), 0),
                cartTotal: window.cart.reduce((s, i) => s + ((i.quantity || i.qty || 1) * i.price), 0),
                cartItems: window.cart.map(i => ({ name: i.name, qty: i.quantity || i.qty, price: i.price }))
            };
        })()`);
        console.log("  Step 1 (Add Samosa):", cartStep1);

        // 2. Increment Samosa quantity
        const cartStep2 = await client.evaluate(`(() => {
            const samosa = window.menuItems.find(i => i.name.toLowerCase().includes('samosa'));
            if (samosa && typeof window.updateItemQtyInCart === 'function') {
                window.updateItemQtyInCart(samosa.id, 1);
            } else if (samosa && typeof window.addToCart === 'function') {
                window.addToCart(samosa);
            }
            return {
                cartCount: window.cart.reduce((s, i) => s + (i.quantity || i.qty || 1), 0),
                cartTotal: window.cart.reduce((s, i) => s + ((i.quantity || i.qty || 1) * i.price), 0),
                cartItems: window.cart.map(i => ({ name: i.name, qty: i.quantity || i.qty, price: i.price }))
            };
        })()`);
        console.log("  Step 2 (Increment Samosa to 2):", cartStep2);

        // 3. Add Tea via quick chip
        const cartStep3 = await client.evaluate(`(() => {
            if (typeof window.quickVoiceAddOrder === 'function') {
                window.quickVoiceAddOrder('2 Hot Chai');
            } else {
                const tea = window.menuItems.find(i => i.name.toLowerCase().includes('tea') || i.name.toLowerCase().includes('chai'));
                if (tea && typeof window.addToCart === 'function') {
                    window.addToCart(tea);
                    window.addToCart(tea);
                }
            }
            return {
                cartCount: window.cart.reduce((s, i) => s + (i.quantity || i.qty || 1), 0),
                cartTotal: window.cart.reduce((s, i) => s + ((i.quantity || i.qty || 1) * i.price), 0),
                cartItems: window.cart.map(i => ({ name: i.name, qty: i.quantity || i.qty, price: i.price }))
            };
        })()`);
        console.log("  Step 3 (Voice/Quick Chip '2 Hot Chai'):", cartStep3);

        // 4. Test Tax & Discount Calculations
        const financialCalculation = await client.evaluate(`(() => {
            // Check GST calculation and discount
            const total = window.cart.reduce((s, i) => s + ((i.quantity || i.qty || 1) * i.price), 0);
            const gstPill = document.getElementById('gstPctPill') || document.querySelector('.gst-pct-pill');
            const cartTotalElem = document.getElementById('cartTotal') || document.getElementById('posTotal');
            return {
                subtotal: total,
                gstPillText: gstPill ? gstPill.innerText : null,
                cartTotalDisplayed: cartTotalElem ? cartTotalElem.innerText : null
            };
        })()`);
        console.log("  Financial Calculation UI:", financialCalculation);
        auditReport.posBillingResults = { cartStep1, cartStep2, cartStep3, financialCalculation };

        // ==========================================================================
        // FAST TENDER ENGINE AUDIT
        // ==========================================================================
        console.log("\n💵 --- TESTING FAST TENDER ENGINE & CASH DENOMINATIONS ---");
        const tenderAudit = await client.evaluate(`(() => {
            // Open Checkout Modal
            if (typeof window.openCheckoutModal === 'function') {
                window.openCheckoutModal();
            } else if (typeof window.showCheckoutModal === 'function') {
                window.showCheckoutModal();
            }

            const modal = document.getElementById('checkoutModal');
            const cashInput = document.getElementById('cashTenderedInput');
            const changeBox = document.getElementById('changeDueBox');
            const denominationPills = document.querySelectorAll('.denom-pill, .tender-pill');
            const upiQrContainer = document.getElementById('checkoutUpiQrContainer');

            // Test denomination engine
            let smartPills = [];
            if (typeof window.setupCheckoutTenderEngine === 'function') {
                window.setupCheckoutTenderEngine();
                const updatedPills = document.querySelectorAll('.denom-pill, .tender-pill');
                smartPills = Array.from(updatedPills).map(p => p.innerText.trim());
            }

            // Test change calculation for bill total
            const billTotal = window.cart.reduce((s, i) => s + ((i.quantity || i.qty || 1) * i.price), 0);
            
            // 1. Exact Change
            if (typeof window.setTenderAmount === 'function') {
                window.setTenderAmount(billTotal);
            } else if (cashInput) {
                cashInput.value = billTotal;
                if (typeof window.onCashTenderedChange === 'function') window.onCashTenderedChange();
            }
            const exactChangeText = changeBox ? changeBox.innerText : null;

            // 2. Excess Change (e.g., + ₹500)
            const excessAmount = billTotal + 500;
            if (typeof window.setTenderAmount === 'function') {
                window.setTenderAmount(excessAmount);
            } else if (cashInput) {
                cashInput.value = excessAmount;
                if (typeof window.onCashTenderedChange === 'function') window.onCashTenderedChange();
            }
            const excessChangeText = changeBox ? changeBox.innerText : null;

            // 3. Shortage (e.g. ₹5)
            const shortAmount = 5;
            if (typeof window.setTenderAmount === 'function') {
                window.setTenderAmount(shortAmount);
            } else if (cashInput) {
                cashInput.value = shortAmount;
                if (typeof window.onCashTenderedChange === 'function') window.onCashTenderedChange();
            }
            const shortChangeText = changeBox ? changeBox.innerText : null;

            // 4. Check UPI QR code URI
            let upiUri = null;
            if (typeof window.renderCheckoutUpiQr === 'function') {
                window.renderCheckoutUpiQr(billTotal);
                const qrImg = upiQrContainer ? upiQrContainer.querySelector('img') : null;
                const qrCanvas = upiQrContainer ? upiQrContainer.querySelector('canvas') : null;
                upiUri = (qrImg && qrImg.src) || (qrCanvas ? 'canvas-rendered' : null) || window.currentUpiString;
            }

            return {
                modalVisible: modal ? modal.style.display !== 'none' : false,
                billTotal,
                smartPills,
                exactChangeText,
                excessChangeText,
                shortChangeText,
                upiQrContainerPresent: !!upiQrContainer,
                upiUri
            };
        })()`);
        console.log("  Fast Tender Engine Audit:", tenderAudit);
        auditReport.fastTenderResults = tenderAudit;

        // Dismiss checkout modal
        await client.evaluate(`(() => {
            const modal = document.getElementById('checkoutModal');
            if (modal) modal.style.display = 'none';
        })()`);

        // ==========================================================================
        // FEATURE 2: TABLE MANAGEMENT & KOT TICKETING
        // ==========================================================================
        console.log("\n🍽️ --- TESTING FEATURE 2: TABLE MANAGEMENT & KOT TICKETING ---");
        const tableAudit = await client.evaluate(`(() => {
            // 1. Table status retrieval
            const tables = typeof window.tables !== 'undefined' ? window.tables : [];
            const tableGrid = document.getElementById('tableGridUI') || document.getElementById('tablesWrapper');
            const tableButtons = tableGrid ? Array.from(tableGrid.querySelectorAll('.table-btn, [data-table-id]')).map(b => ({
                text: b.innerText.trim(),
                classes: b.className
            })) : [];

            // 2. Select Table 1
            if (typeof window.selectTable === 'function') {
                window.selectTable(1);
            }

            const activeTableAfterSelect = window.activeTableId || window.currentTable;

            // 3. Add item to Table 1 order
            const item = window.menuItems[0];
            if (typeof window.addToCart === 'function') {
                window.addToCart(item);
            }

            // 4. Test Table Status transition to Occupied
            let table1Status = null;
            if (typeof window.tables !== 'undefined' && window.tables[0]) {
                table1Status = window.tables[0].status;
            }

            // 5. Test Table Switching (T1 -> T2)
            let tableSwitchResult = null;
            if (typeof window.switchTableState === 'function') {
                tableSwitchResult = window.switchTableState(1, 2);
            } else if (typeof window.transferTable === 'function') {
                tableSwitchResult = window.transferTable(1, 2);
            }

            // 6. Test KOT Generation
            let kotTicket = null;
            if (typeof window.generateKOT === 'function') {
                kotTicket = window.generateKOT(1);
            } else if (typeof window.createKOT === 'function') {
                kotTicket = window.createKOT(1);
            } else if (typeof window.printKOT === 'function') {
                kotTicket = 'printKOT invoked';
            }

            // Check KOT storage in local repository
            const storedKots = JSON.parse(localStorage.getItem('billnaw_kots') || '[]');

            return {
                tablesCount: tables.length,
                renderedTableButtons: tableButtons.slice(0, 5),
                activeTableAfterSelect,
                table1Status,
                tableSwitchResult,
                kotTicket,
                storedKotsCount: storedKots.length
            };
        })()`);
        console.log("  Table Management & KOT Audit:", tableAudit);
        auditReport.tableManagementResults = tableAudit;

        // ==========================================================================
        // VIEWPORT 2: TABLET (768 x 1024)
        // ==========================================================================
        console.log("\n📱 --- VIEWPORT 2: TABLET (768 x 1024) ---");
        await client.setViewport(768, 1024, true);
        auditReport.viewportsTested.push("Tablet (768x1024)");

        const tabletLayout = await client.evaluate(`(() => {
            const menuGrid = document.querySelector('.menu-grid');
            const posRight = document.querySelector('.pos-right');
            const bottomNav = document.querySelector('.bottom-nav, .mobile-bottom-nav');
            const floatingCart = document.getElementById('floatingCart');
            return {
                menuGridCols: menuGrid ? window.getComputedStyle(menuGrid).gridTemplateColumns.split(' ').length : 0,
                posRightDisplay: posRight ? window.getComputedStyle(posRight).display : null,
                posRightPosition: posRight ? window.getComputedStyle(posRight).position : null,
                bottomNavDisplay: bottomNav ? window.getComputedStyle(bottomNav).display : null,
                floatingCartDisplay: floatingCart ? window.getComputedStyle(floatingCart).display : null
            };
        })()`);
        console.log("  Tablet Layout State:", tabletLayout);

        // ==========================================================================
        // VIEWPORT 3: MOBILE (375 x 667 & 390 x 844)
        // ==========================================================================
        console.log("\n📲 --- VIEWPORT 3: MOBILE (375 x 667 & 390 x 844) ---");
        await client.setViewport(390, 844, true);
        auditReport.viewportsTested.push("Mobile (390x844)");

        const mobileLayout = await client.evaluate(`(() => {
            const menuGrid = document.querySelector('.menu-grid');
            const posRight = document.querySelector('.pos-right');
            const bottomNav = document.querySelector('.bottom-nav, .mobile-bottom-nav');
            const floatingCart = document.getElementById('floatingCart');
            const topbar = document.querySelector('.topbar');
            return {
                menuGridCols: menuGrid ? window.getComputedStyle(menuGrid).gridTemplateColumns.split(' ').length : 0,
                posRightPosition: posRight ? window.getComputedStyle(posRight).position : null,
                bottomNavDisplay: bottomNav ? window.getComputedStyle(bottomNav).display : null,
                bottomNavButtons: bottomNav ? bottomNav.querySelectorAll('button, a').length : 0,
                floatingCartDisplay: floatingCart ? window.getComputedStyle(floatingCart).display : null,
                topbarHeight: topbar ? window.getComputedStyle(topbar).height : null
            };
        })()`);
        console.log("  Mobile (390x844) Layout State:", mobileLayout);

        await client.setViewport(375, 667, true);
        auditReport.viewportsTested.push("Mobile (375x667)");

        const mobileSELayout = await client.evaluate(`(() => {
            const menuGrid = document.querySelector('.menu-grid');
            const bodyOverflowX = window.getComputedStyle(document.body).overflowX;
            return {
                menuGridCols: menuGrid ? window.getComputedStyle(menuGrid).gridTemplateColumns.split(' ').length : 0,
                bodyOverflowX,
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
                hasHorizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
            };
        })()`);
        console.log("  Mobile SE (375x667) Horizontal Overflow Check:", mobileSELayout);

        // ==========================================================================
        // SYSTEM INVARIANTS CHECK
        // ==========================================================================
        console.log("\n🛡️ --- SYSTEM INVARIANTS CHECK ---");
        const html = fs.readFileSync('index.html', 'utf8');
        
        // Invariant 1: 26 modal close buttons
        const closeMatches = html.match(/<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g) || [];
        const totalModalCloseClass = (html.match(/class=["'][^"']*modal-close-btn[^"']*["']/g) || []).length;
        console.log(`  Invariant 1: Exact 26 modal-close-btn SVGs: found ${closeMatches.length} (total class occurrences: ${totalModalCloseClass})`);

        // Invariant 2: Zero raw unicode emojis in buttons/tabs
        const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
        const buttonMatches = html.match(/<button\b[^>]*>([\s\S]*?)<\/button>/gi) || [];
        const buttonsWithRawEmoji = [];
        for (const btn of buttonMatches) {
            // strip out svgs
            const textOnly = btn.replace(/<svg[\s\S]*?<\/svg>/gi, '');
            if (emojiRegex.test(textOnly)) {
                buttonsWithRawEmoji.push(btn.slice(0, 100));
            }
        }
        console.log(`  Invariant 2: Zero raw emojis in operational buttons: found ${buttonsWithRawEmoji.length} raw emojis`);
        if (buttonsWithRawEmoji.length > 0) {
            console.log("    Sample buttons with emoji:", buttonsWithRawEmoji.slice(0, 3));
        }

        // Invariant 3: Non-breaking rupee space format
        const badRupeeMatches = html.match(/₹[^\s&]/g) || [];
        console.log(`  Invariant 3: Non-breaking rupee formatting (₹ ): found ${badRupeeMatches.length} unspaced rupee symbols in index.html`);

        auditReport.invariants = {
            modalCloseBtnCount: closeMatches.length,
            totalModalCloseClass,
            buttonsWithRawEmojiCount: buttonsWithRawEmoji.length,
            badRupeeMatchesCount: badRupeeMatches.length
        };

        // ==========================================================================
        // CONSOLE ERRORS & WARNINGS AUDIT
        // ==========================================================================
        console.log("\n📢 --- CONSOLE ERRORS & WARNINGS AUDIT ---");
        console.log(`  Total Console Messages: ${client.consoleMessages.length}`);
        console.log(`  Total Console Errors: ${client.errors.length}`);
        console.log(`  Total Console Warnings: ${client.warnings.length}`);
        if (client.errors.length > 0) {
            console.log("  Errors captured:", client.errors);
        }
        if (client.warnings.length > 0) {
            console.log("  Sample warnings:", client.warnings.slice(0, 5));
        }

        auditReport.consoleAudit = {
            totalMessages: client.consoleMessages.length,
            errors: client.errors,
            warnings: client.warnings
        };

        // Output overall summary
        console.log("\n==============================================================================");
        console.log("✅ AUDIT RUN COMPLETE. SUMMARY:");
        console.log(JSON.stringify(auditReport, null, 2));
        console.log("==============================================================================");

        // Write audit result to JSON for easy inspection
        fs.writeFileSync(path.join(process.cwd(), 'scratch', 'audit_run_results.json'), JSON.stringify(auditReport, null, 2));

        client.close();
    } finally {
        try { chrome.kill(); } catch (e) {}
        try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
    }
}

runAudit().catch(err => {
    console.error("Audit Execution Failed:", err);
    process.exit(1);
});
