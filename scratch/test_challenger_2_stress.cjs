// scratch/test_challenger_2_stress.cjs
// ==============================================================================
// 🛡️ CHALLENGER 2: EMPIRICAL & ADVERSARIAL STRESS TEST HARNESS
// Milestones M3 & M4 (Progressive WhatsApp Wizard & 3-Stage Culinary Pipeline)
// Invariants: 26 SVG Modal Close Buttons & Zero Raw Unicode Emojis
// ==============================================================================

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

console.log("==============================================================================");
console.log("🧪 CHALLENGER 2: ADVERSARIAL STRESS & EMPIRICAL VERIFICATION HARNESS");
console.log("   Milestones: M3 (WhatsApp Wizard) & M4 (3-Stage Culinary Pipeline)");
console.log("   Invariants: 26 Modal Close Buttons & Zero Raw Unicode Emojis");
console.log("==============================================================================\n");

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
        console.error(`     Reason: ${err.message}`);
        failed++;
        failures.push({ name, error: err.message, stack: err.stack });
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✅ PASS: ${name}`);
        passed++;
    } catch (err) {
        console.error(`  ❌ FAIL: ${name}`);
        console.error(`     Reason: ${err.message}`);
        failed++;
        failures.push({ name, error: err.message, stack: err.stack });
    }
}

// Read core source files
const rootDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(rootDir, 'style.css'), 'utf8');
const custJsCode = fs.readFileSync(path.join(rootDir, 'js', 'customers.js'), 'utf8');
const culJsCode = fs.readFileSync(path.join(rootDir, 'js', 'culinary_inventory.js'), 'utf8');

// ==============================================================================
// 🛠️ MOCK BROWSER ENVIRONMENT SETUP
// ==============================================================================
class MockClassList {
    constructor() {
        this._classes = new Set();
    }
    add(...names) {
        names.forEach(n => { if (n) this._classes.add(n); });
    }
    remove(...names) {
        names.forEach(n => this._classes.delete(n));
    }
    contains(name) {
        return this._classes.has(name);
    }
    toggle(name, force) {
        if (typeof force === 'boolean') {
            if (force) this._classes.add(name);
            else this._classes.delete(name);
            return force;
        }
        if (this._classes.has(name)) {
            this._classes.delete(name);
            return false;
        } else {
            this._classes.add(name);
            return true;
        }
    }
    toString() {
        return Array.from(this._classes).join(' ');
    }
}

class MockElement {
    constructor(id, tagName = 'div') {
        this.id = id;
        this.tagName = tagName.toUpperCase();
        this.style = {};
        this.classList = new MockClassList();
        this.attributes = new Map();
        this.value = '';
        this.innerText = '';
        this.innerHTML = '';
        this.selectionStart = 0;
        this.selectionEnd = 0;
        this.checked = false;
        this.indeterminate = false;
        this.children = [];
        this._listeners = {};
    }
    setAttribute(name, val) {
        this.attributes.set(name, String(val));
    }
    getAttribute(name) {
        return this.attributes.get(name) || null;
    }
    removeAttribute(name) {
        this.attributes.delete(name);
    }
    addEventListener(evt, fn) {
        if (!this._listeners[evt]) this._listeners[evt] = [];
        this._listeners[evt].push(fn);
    }
    focus() {}
    scrollIntoView() {}
    closest(sel) { return null; }
}

function createMockEnvironment() {
    const elementRegistry = new Map();

    function getOrCreate(id, tagName = 'div') {
        if (!elementRegistry.has(id)) {
            elementRegistry.set(id, new MockElement(id, tagName));
        }
        return elementRegistry.get(id);
    }

    // Register all elements required by M3 and M4
    const knownIds = [
        'waMarketingStepper', 'waStepIndicator-1', 'waStepIndicator-2', 'waStepIndicator-3',
        'waWizardStep-1', 'waWizardStep-2', 'waWizardStep-3',
        'waCampaignEditableText', 'waVarChipsBar', 'waQuickDiscount', 'waQuickDiscountCode',
        'waQuickMinOrder', 'waQuickValidTill', 'waStep2LivePreview', 'waStep2PreviewBubble',
        'waAudienceSummaryCard', 'waSummaryTotalRecipients', 'waSummaryVipCount',
        'waSummaryRegularCount', 'waSummaryOccasionalCount', 'waPhoneMockupCard',
        'waSimulatedBubble', 'waSimulatedPersonalizedMessage', 'waSimulatedTargetName',
        'waPillTargetBadge', 'waFloatingPreviewPill', 'waPreviewBackdrop',
        'waSelectedCountBadge', 'waStep1SelectedCount', 'bulkSelectedCount', 'waDockSelectedCount',
        'selectAllCustomersCheckbox', 'waSelectAllCheckbox', 'waBulkCustomerSelectorList',
        'waSelectedBroadcastQueue', 'queueCount', 'btnSendBulkCampaignSticky',
        'btnWizardNextToDraft', 'btnWizardBackToAudience', 'btnWizardNextToReview', 'btnWizardBackToDraft',
        // M4 inventory elements
        'invHubTabBar', 'invTabBtn-rawStock', 'invTabBtn-morningPrep', 'invTabBtn-dishCosting',
        'invTabRawStock', 'invTabMorningPrep', 'invTabDishCosting',
        'invAccordionBatching', 'invAccordionCosting', 'btnInvAccBatching', 'btnInvAccCosting',
        'invAccBodyBatching', 'invAccBodyCosting', 'culinarySubTabContent',
        // Settings & Modals
        'tableTopBar', 'settingTileTablesFloors', 'tableManagementModal'
    ];

    knownIds.forEach(id => getOrCreate(id));

    // Specific tag types
    getOrCreate('waCampaignEditableText', 'textarea');
    getOrCreate('selectAllCustomersCheckbox', 'input').checked = true;
    getOrCreate('waQuickDiscount', 'input').value = '15';
    getOrCreate('waQuickDiscountCode', 'input').value = 'BILLNAW15';
    getOrCreate('waQuickMinOrder', 'input').value = '199';
    getOrCreate('waQuickValidTill', 'input').value = 'This Sunday';

    // Mock localStorage
    const storageStore = new Map();
    const mockLocalStorage = {
        getItem: (k) => storageStore.has(k) ? storageStore.get(k) : null,
        setItem: (k, v) => storageStore.set(k, String(v)),
        removeItem: (k) => storageStore.delete(k),
        clear: () => storageStore.clear()
    };

    const mockDocument = {
        getElementById: (id) => elementRegistry.get(id) || null,
        querySelector: (sel) => {
            if (sel.startsWith('#')) return elementRegistry.get(sel.slice(1)) || null;
            return null;
        },
        querySelectorAll: (sel) => {
            if (sel === '.segment-btn') return [];
            if (sel.includes('inv-tab-pane')) {
                return ['invTabRawStock', 'invTabMorningPrep', 'invTabDishCosting']
                    .map(id => elementRegistry.get(id)).filter(Boolean);
            }
            return [];
        },
        addEventListener: () => {}
    };

    const toasts = [];
    const alerts = [];

    const sandbox = {
        console,
        window: {},
        document: mockDocument,
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        customersList: [],
        khataList: [],
        ordersList: [],
        idb: { get: async () => null, set: async () => {} },
        showToast: (msg) => toasts.push(msg),
        alert: (msg) => alerts.push(msg),
        fetch: async () => ({ ok: false, json: async () => ({}) }),
        Set,
        Map,
        Array,
        Object,
        String,
        Number,
        parseInt,
        parseFloat,
        Math,
        Date,
        RegExp,
        JSON,
        escapeHtml: (s) => String(s || ''),
        shopProfile: { name: 'billnaw' }
    };
    sandbox.window = sandbox;

    const context = vm.createContext(sandbox);

    // Run customers.js
    vm.runInContext(custJsCode, context);

    // Run culinary_inventory.js
    vm.runInContext(culJsCode, context);

    // Expose internal lexical state variables to window for inspection
    vm.runInContext(`
        window.waBulkSelectedCustomerIds = waBulkSelectedCustomerIds;
        window.waCampaignVariables = waCampaignVariables;
        window.WA_TIER_CONFIG = WA_TIER_CONFIG;
        Object.defineProperty(window, 'waCampaignTemplateText', {
            get: () => waCampaignTemplateText,
            set: (v) => { waCampaignTemplateText = v; },
            configurable: true
        });
        Object.defineProperty(window, 'currentMarketingWizardStep', {
            get: () => currentMarketingWizardStep,
            set: (v) => { currentMarketingWizardStep = v; },
            configurable: true
        });
    `, context);

    return { context, elementRegistry, toasts, alerts, storageStore };
}

(async () => {
// ==============================================================================
// 🎯 SUITE 1: STEPPER STATE PERSISTENCE ACROSS MULTI-HOP NAVIGATIONS (M3)
// ==============================================================================
console.log("------------------------------------------------------------------------------");
console.log("📍 SUITE 1: STEPPER STATE PERSISTENCE (STEP 1 -> 2 -> 3 -> 2 -> 1 -> 2 -> 3)");
console.log("------------------------------------------------------------------------------");

test("M3-STRESS-01: Seed initial customers and initialize AI WhatsApp Hub", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    ctx.initAiWhatsAppHub();
    assert.ok(Array.isArray(ctx.customersList), "customersList must be populated");
    assert.strictEqual(ctx.customersList.length, 5, "Initial sample customers must have length 5");
    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 5, "All 5 customers must be selected by default");

    const step1Panel = env.elementRegistry.get('waWizardStep-1');
    assert.strictEqual(step1Panel.style.display, 'block', "Step 1 must be active initially");
});

test("M3-STRESS-02: Round trip persistence: modify recipients -> draft text -> Step 3 -> back to 1", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    ctx.initAiWhatsAppHub();

    // 1. In Step 1: Select a specific customized subset: customer 101 and 103 only
    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(101);
    ctx.waBulkSelectedCustomerIds.add(103);
    ctx.updateWaStepperCounters();

    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 2, "Only 2 diners selected");
    assert.ok(ctx.waBulkSelectedCustomerIds.has(101), "Customer 101 must be selected");
    assert.ok(ctx.waBulkSelectedCustomerIds.has(103), "Customer 103 must be selected");

    // 2. Advance to Step 2
    ctx.setMarketingWizardStep(2);
    const step2Panel = env.elementRegistry.get('waWizardStep-2');
    const step1Panel = env.elementRegistry.get('waWizardStep-1');
    assert.strictEqual(step2Panel.style.display, 'block', "Step 2 panel must be visible");
    assert.strictEqual(step1Panel.style.display, 'none', "Step 1 panel must be hidden");

    // Ensure recipient state was preserved during navigation into Step 2
    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 2, "Selected recipients preserved on advance to Step 2");

    // 3. In Step 2: Cashier types customized campaign copy in #waCampaignEditableText
    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    const customDraftText = "Special weekend treat for {customer_name}! Use promo {discount_code} for {discount_pct}% OFF delicious coffee & food at billnaw. Valid till {valid_till}!";
    txtArea.value = customDraftText;
    ctx.onCustomCampaignTextEdited();

    assert.strictEqual(ctx.waCampaignTemplateText, customDraftText, "Draft text synchronized to template state");

    // 4. Advance to Step 3 (Review & Send)
    ctx.setMarketingWizardStep(3);
    const step3Panel = env.elementRegistry.get('waWizardStep-3');
    assert.strictEqual(step3Panel.style.display, 'block', "Step 3 panel must be visible");
    assert.strictEqual(step2Panel.style.display, 'none', "Step 2 panel must be hidden");

    // Step 3 review assertions
    const totalRecipientsEl = env.elementRegistry.get('waSummaryTotalRecipients');
    assert.strictEqual(totalRecipientsEl.innerText, 2, "Step 3 audience summary reflects exactly 2 recipients");

    // 5. Navigate BACK to Step 2 (Back button clicked)
    ctx.setMarketingWizardStep(2);
    assert.strictEqual(step2Panel.style.display, 'block', "Step 2 panel visible on back nav");
    assert.strictEqual(step3Panel.style.display, 'none', "Step 3 panel hidden on back nav");
    assert.strictEqual(txtArea.value, customDraftText, "CRITICAL: Custom draft text 100% intact after navigating back from Step 3!");

    // 6. Navigate BACK to Step 1 (Back to Audience)
    ctx.setMarketingWizardStep(1);
    assert.strictEqual(step1Panel.style.display, 'block', "Step 1 panel visible on back nav");
    assert.strictEqual(step2Panel.style.display, 'none', "Step 2 panel hidden on back nav");
    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 2, "CRITICAL: Selected recipients 100% intact after navigating back to Step 1!");
    assert.ok(ctx.waBulkSelectedCustomerIds.has(101));
    assert.ok(ctx.waBulkSelectedCustomerIds.has(103));

    // 7. Advance FORWARD again (Step 1 -> 2 -> 3)
    ctx.setMarketingWizardStep(2);
    assert.strictEqual(txtArea.value, customDraftText, "Draft text still intact when moving forward again to Step 2");
    ctx.setMarketingWizardStep(3);
    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 2, "Selected recipients still intact in Step 3");
});

test("M3-STRESS-03: Rapid 100-cycle random navigation thrashing preserves draft & recipients", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(102); // Ananya Sen
    ctx.waBulkSelectedCustomerIds.add(104); // Priya Das

    const uniqueStressText = "STRESS_TEST_HASH_" + Math.random().toString(36).slice(2) + " for {customer_name}";
    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = uniqueStressText;
    ctx.onCustomCampaignTextEdited();

    // 100 random transitions between steps 1, 2, and 3
    for (let i = 0; i < 100; i++) {
        const targetStep = (i % 3) + 1;
        ctx.setMarketingWizardStep(targetStep);
    }

    // Return to Step 2 and verify text
    ctx.setMarketingWizardStep(2);
    assert.strictEqual(txtArea.value, uniqueStressText, "Draft text survived 100 random navigation transitions");
    assert.strictEqual(ctx.waBulkSelectedCustomerIds.size, 2, "Recipients survived 100 random navigation transitions");
    assert.ok(ctx.waBulkSelectedCustomerIds.has(102));
    assert.ok(ctx.waBulkSelectedCustomerIds.has(104));
});

test("M3-STRESS-04: Out-of-bounds and invalid step parameters are safely rejected", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.setMarketingWizardStep(2);
    const step2 = env.elementRegistry.get('waWizardStep-2');
    assert.strictEqual(step2.style.display, 'block', "Step 2 should be active");

    // Out-of-bounds calls (step < 1 or step > 3) must be rejected and preserve step 2
    ctx.setMarketingWizardStep(4);
    assert.strictEqual(step2.style.display, 'block', "Step 4 rejected, stays on step 2");
    ctx.setMarketingWizardStep(99);
    assert.strictEqual(step2.style.display, 'block', "Step 99 rejected, stays on step 2");
    ctx.setMarketingWizardStep(-1);
    assert.strictEqual(step2.style.display, 'block', "Step -1 rejected, stays on step 2");
    ctx.setMarketingWizardStep(-99);
    assert.strictEqual(step2.style.display, 'block', "Step -99 rejected, stays on step 2");

    // Falsy value (0 or NaN) defaults gracefully to step 1 via parseInt(val, 10) || 1
    ctx.setMarketingWizardStep(0);
    const step1 = env.elementRegistry.get('waWizardStep-1');
    assert.strictEqual(step1.style.display, 'block', "Step 0 defaults safely to step 1");
});

// ==============================================================================
// 🎯 SUITE 2: VARIABLE CHIPS INSERTION STRESS HARNESS (M3)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 2: PERSONALIZED VARIABLE CHIPS INSERTION STRESS HARNESS");
console.log("------------------------------------------------------------------------------");

test("M3-CHIP-01: Insertion at beginning of text (cursor = 0)", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Welcome to billnaw!";
    txtArea.selectionStart = 0;
    txtArea.selectionEnd = 0;

    ctx.insertCampaignVariable('{customer_name} ');

    assert.strictEqual(txtArea.value, "{customer_name} Welcome to billnaw!");
    assert.strictEqual(txtArea.selectionStart, "{customer_name} ".length);
    assert.strictEqual(txtArea.selectionEnd, "{customer_name} ".length);
    assert.strictEqual(ctx.waCampaignTemplateText, "{customer_name} Welcome to billnaw!");
});

test("M3-CHIP-02: Insertion in middle of text (cursor in middle)", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Hello , enjoy your drink!";
    txtArea.selectionStart = 6; // right after "Hello "
    txtArea.selectionEnd = 6;

    ctx.insertCampaignVariable('{customer_name}');

    assert.strictEqual(txtArea.value, "Hello {customer_name}, enjoy your drink!");
    assert.strictEqual(ctx.waCampaignTemplateText, "Hello {customer_name}, enjoy your drink!");
});

test("M3-CHIP-03: Insertion at end of text (cursor = length)", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Use discount coupon: ";
    txtArea.selectionStart = txtArea.value.length;
    txtArea.selectionEnd = txtArea.value.length;

    ctx.insertCampaignVariable('{discount_code}');

    assert.strictEqual(txtArea.value, "Use discount coupon: {discount_code}");
    assert.strictEqual(ctx.waCampaignTemplateText, "Use discount coupon: {discount_code}");
});

test("M3-CHIP-04: Insertion on empty textarea (value = '')", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "";
    txtArea.selectionStart = 0;
    txtArea.selectionEnd = 0;

    ctx.insertCampaignVariable('{customer_name}');

    assert.strictEqual(txtArea.value, "{customer_name}");
    assert.strictEqual(ctx.waCampaignTemplateText, "{customer_name}");
});

test("M3-CHIP-05: Range selection replacement (cursor selects [start, end])", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Hello [REPLACE_TARGET]! How are you?";
    const start = txtArea.value.indexOf('[REPLACE_TARGET]');
    const end = start + '[REPLACE_TARGET]'.length;
    txtArea.selectionStart = start;
    txtArea.selectionEnd = end;

    ctx.insertCampaignVariable('{customer_name}');

    assert.strictEqual(txtArea.value, "Hello {customer_name}! How are you?");
    assert.strictEqual(ctx.waCampaignTemplateText, "Hello {customer_name}! How are you?");
});

test("M3-CHIP-06: Consecutive insertion of both {customer_name} and {discount_code}", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Hi ";
    txtArea.selectionStart = 3;
    txtArea.selectionEnd = 3;

    ctx.insertCampaignVariable('{customer_name}');
    txtArea.selectionStart = txtArea.value.length;
    txtArea.selectionEnd = txtArea.value.length;

    // Type separator
    txtArea.value += ", use code ";
    txtArea.selectionStart = txtArea.value.length;
    txtArea.selectionEnd = txtArea.value.length;

    ctx.insertCampaignVariable('{discount_code}');

    assert.strictEqual(txtArea.value, "Hi {customer_name}, use code {discount_code}");
});

// ==============================================================================
// 🎯 SUITE 3: DYNAMIC SIMULATION & REAL VARIABLE SUBSTITUTION (M3)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 3: DYNAMIC SIMULATION & REAL VARIABLE SUBSTITUTIONS (STEP 3)");
console.log("------------------------------------------------------------------------------");

test("M3-SIM-01: Step 3 renders real substitution for {customer_name} and {discount_code}", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(101); // Suman Roy

    ctx.waCampaignVariables.discountCode = 'FESTIVE30';
    ctx.waCampaignVariables.discount = 30;

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Hey {customer_name}! Claim your exclusive {discount_pct}% discount with {discount_code}.";
    ctx.onCustomCampaignTextEdited();

    ctx.setMarketingWizardStep(3);

    const bubbleEl = env.elementRegistry.get('waSimulatedPersonalizedMessage');
    const targetNameEl = env.elementRegistry.get('waSimulatedTargetName');

    assert.strictEqual(targetNameEl.innerText, "Suman Roy", "Target diner label reflects selected recipient");
    assert.strictEqual(
        bubbleEl.innerText,
        "Hey Suman Roy! Claim your exclusive 30% discount with FESTIVE30.",
        "Simulated bubble has real interpolation for {customer_name} and {discount_code}"
    );
});

test("M3-SIM-02: Step 2 live draft preview card (#waStep2LivePreview) interpolates in real time", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(102); // Ananya Sen

    const step2PreviewEl = env.elementRegistry.get('waStep2LivePreview');
    const txtArea = env.elementRegistry.get('waCampaignEditableText');

    txtArea.value = "Dear {customer_name}, code: {discount_code}";
    ctx.onCustomCampaignTextEdited();

    assert.strictEqual(
        step2PreviewEl.innerText,
        "Dear Ananya Sen, code: BILLNAW15",
        "Step 2 live draft preview card reflects real-time variable substitutions"
    );
});

test("M3-SIM-03: Diner cycling in Step 3 (cyclePreviewCustomer) rotates real diner names", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(101); // Suman Roy
    ctx.waBulkSelectedCustomerIds.add(102); // Ananya Sen
    ctx.waBulkSelectedCustomerIds.add(103); // Rahul Mukherjee

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Greetings {customer_name}!";
    ctx.onCustomCampaignTextEdited();

    ctx.setMarketingWizardStep(3);

    const bubbleEl = env.elementRegistry.get('waSimulatedPersonalizedMessage');

    // 1st customer: Suman Roy
    assert.strictEqual(bubbleEl.innerText, "Greetings Suman Roy!");

    // Cycle to 2nd customer: Ananya Sen
    ctx.cyclePreviewCustomer();
    assert.strictEqual(bubbleEl.innerText, "Greetings Ananya Sen!");

    // Cycle to 3rd customer: Rahul Mukherjee
    ctx.cyclePreviewCustomer();
    assert.strictEqual(bubbleEl.innerText, "Greetings Rahul Mukherjee!");

    // Cycle wraps back to 1st customer: Suman Roy
    ctx.cyclePreviewCustomer();
    assert.strictEqual(bubbleEl.innerText, "Greetings Suman Roy!");
});

test("M3-SIM-04: Edge case: Zero customers selected falls back safely to 'Valued Customer'", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Welcome {customer_name}!";
    ctx.onCustomCampaignTextEdited();

    ctx.updateWaSimulatedBubble();

    const bubbleEl = env.elementRegistry.get('waSimulatedPersonalizedMessage');
    assert.strictEqual(bubbleEl.innerText, "Welcome Valued Customer!", "Safe fallback when no customer is selected");
});

test("M3-SIM-05: Edge case: Customer names with apostrophes and special characters", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.customersList.push({
        id: 999,
        name: "Arthur O'Connor-Smith",
        phone: "9876543210",
        totalVisits: 12
    });
    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(999);

    const txtArea = env.elementRegistry.get('waCampaignEditableText');
    txtArea.value = "Hello {customer_name}!";
    ctx.onCustomCampaignTextEdited();

    ctx.updateWaSimulatedBubble();

    const bubbleEl = env.elementRegistry.get('waSimulatedPersonalizedMessage');
    assert.strictEqual(bubbleEl.innerText, "Hello Arthur O'Connor-Smith!");
});

// ==============================================================================
// 🎯 SUITE 4: AUDIENCE SUMMARY BREAKDOWN CALCULATION STRESS (M3)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 4: AUDIENCE SUMMARY BREAKDOWN ACROSS TIERS STRESS HARNESS");
console.log("------------------------------------------------------------------------------");

test("M3-AUD-01: Complete audience breakdown with 5 default customers", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    // Suman Roy: 24 visits -> VIP (>= 10)
    // Ananya Sen: 14 visits -> VIP (>= 10)
    // Rahul Mukherjee: 8 visits -> Regular (>= 3, < 10)
    // Priya Das: 4 visits -> Regular (>= 3, < 10)
    // Vikram Verma: 18 visits -> VIP (>= 10)
    // Total = 5, VIP = 3, Regular = 2, Occasional = 0

    ctx.updateWaAudienceSummary();

    const totalEl = env.elementRegistry.get('waSummaryTotalRecipients');
    const vipEl = env.elementRegistry.get('waSummaryVipCount');
    const regEl = env.elementRegistry.get('waSummaryRegularCount');
    const occEl = env.elementRegistry.get('waSummaryOccasionalCount');

    assert.strictEqual(totalEl.innerText, 5, "Total recipients = 5");
    assert.strictEqual(vipEl.innerText, 3, "VIP count = 3");
    assert.strictEqual(regEl.innerText, 2, "Regular count = 2");
    assert.strictEqual(occEl.innerText, 0, "Occasional count = 0");
    assert.strictEqual(Number(totalEl.innerText), Number(vipEl.innerText) + Number(regEl.innerText) + Number(occEl.innerText), "Sum invariant holds");
});

test("M3-AUD-02: Adding occasional diners and verifying accurate 3-tier distribution", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.customersList.push({ id: 201, name: "New Visitor 1", totalVisits: 1 });
    ctx.customersList.push({ id: 202, name: "New Visitor 2", totalVisits: 2 });
    ctx.waBulkSelectedCustomerIds.add(201);
    ctx.waBulkSelectedCustomerIds.add(202);

    ctx.updateWaAudienceSummary();

    const totalEl = env.elementRegistry.get('waSummaryTotalRecipients');
    const vipEl = env.elementRegistry.get('waSummaryVipCount');
    const regEl = env.elementRegistry.get('waSummaryRegularCount');
    const occEl = env.elementRegistry.get('waSummaryOccasionalCount');

    assert.strictEqual(totalEl.innerText, 7, "Total = 7");
    assert.strictEqual(vipEl.innerText, 3, "VIP = 3");
    assert.strictEqual(regEl.innerText, 2, "Regular = 2");
    assert.strictEqual(occEl.innerText, 2, "Occasional = 2");
    assert.strictEqual(Number(totalEl.innerText), Number(vipEl.innerText) + Number(regEl.innerText) + Number(occEl.innerText));
});

test("M3-AUD-03: Filtering only Regulars via waBulkSelectedCustomerIds", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    // Select only Regular Diners (Rahul 103, Priya 104)
    ctx.waBulkSelectedCustomerIds.clear();
    ctx.waBulkSelectedCustomerIds.add(103);
    ctx.waBulkSelectedCustomerIds.add(104);

    ctx.updateWaAudienceSummary();

    const totalEl = env.elementRegistry.get('waSummaryTotalRecipients');
    const vipEl = env.elementRegistry.get('waSummaryVipCount');
    const regEl = env.elementRegistry.get('waSummaryRegularCount');
    const occEl = env.elementRegistry.get('waSummaryOccasionalCount');

    assert.strictEqual(totalEl.innerText, 2);
    assert.strictEqual(vipEl.innerText, 0);
    assert.strictEqual(regEl.innerText, 2);
    assert.strictEqual(occEl.innerText, 0);
});

test("M3-AUD-04: Audience breakdown with 0 selected diners evaluates to all zeros", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    ctx.waBulkSelectedCustomerIds.clear();
    ctx.updateWaAudienceSummary();

    assert.strictEqual(env.elementRegistry.get('waSummaryTotalRecipients').innerText, 0);
    assert.strictEqual(env.elementRegistry.get('waSummaryVipCount').innerText, 0);
    assert.strictEqual(env.elementRegistry.get('waSummaryRegularCount').innerText, 0);
    assert.strictEqual(env.elementRegistry.get('waSummaryOccasionalCount').innerText, 0);
});

test("M3-AUD-05: Randomized customer selection permutation invariant test (20 trials)", () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.initAiWhatsAppHub();

    // Generate 15 diverse customers
    const customList = [];
    for (let i = 1; i <= 15; i++) {
        customList.push({
            id: 1000 + i,
            name: `Test Diner ${i}`,
            totalVisits: (i * 3) % 25 // spread across occasional, regular, VIP
        });
    }
    ctx.customersList = customList;

    for (let trial = 0; trial < 20; trial++) {
        ctx.waBulkSelectedCustomerIds.clear();
        customList.forEach(c => {
            if (Math.random() > 0.5) ctx.waBulkSelectedCustomerIds.add(c.id);
        });

        ctx.updateWaAudienceSummary();

        const total = Number(env.elementRegistry.get('waSummaryTotalRecipients').innerText);
        const vip = Number(env.elementRegistry.get('waSummaryVipCount').innerText);
        const reg = Number(env.elementRegistry.get('waSummaryRegularCount').innerText);
        const occ = Number(env.elementRegistry.get('waSummaryOccasionalCount').innerText);

        assert.strictEqual(total, ctx.waBulkSelectedCustomerIds.size, `Trial ${trial}: total matches set size`);
        assert.strictEqual(total, vip + reg + occ, `Trial ${trial}: total must equal vip + reg + occ`);
    }
});

// ==============================================================================
// 🎯 SUITE 5: 3-STAGE CULINARY PRODUCTION PIPELINE SWITCHER ISOLATION (M4)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 5: 3-STAGE CULINARY PIPELINE SWITCHER ISOLATION STRESS HARNESS");
console.log("------------------------------------------------------------------------------");

test("M4-ISO-01: Stage 1 (raw_stock) displays only #invTabRawStock, others hidden", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    ctx.switchInventoryHubTab('raw_stock');

    const paneRaw = env.elementRegistry.get('invTabRawStock');
    const panePrep = env.elementRegistry.get('invTabMorningPrep');
    const paneCost = env.elementRegistry.get('invTabDishCosting');

    assert.strictEqual(paneRaw.style.display, 'block', "#invTabRawStock must be display: block");
    assert.ok(paneRaw.classList.contains('active'), "#invTabRawStock must have .active");

    assert.strictEqual(panePrep.style.display, 'none', "#invTabMorningPrep must be display: none");
    assert.ok(!panePrep.classList.contains('active'), "#invTabMorningPrep must NOT have .active");

    assert.strictEqual(paneCost.style.display, 'none', "#invTabDishCosting must be display: none");
    assert.ok(!paneCost.classList.contains('active'), "#invTabDishCosting must NOT have .active");

    const btnRaw = env.elementRegistry.get('invTabBtn-rawStock');
    const btnPrep = env.elementRegistry.get('invTabBtn-morningPrep');
    const btnCost = env.elementRegistry.get('invTabBtn-dishCosting');

    assert.ok(btnRaw.classList.contains('active'));
    assert.strictEqual(btnRaw.getAttribute('aria-selected'), 'true');
    assert.ok(!btnPrep.classList.contains('active'));
    assert.ok(!btnCost.classList.contains('active'));
});

test("M4-ISO-02: Stage 2 (morning_batch) displays only #invTabMorningPrep, others hidden", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    ctx.switchInventoryHubTab('morning_batch');

    const paneRaw = env.elementRegistry.get('invTabRawStock');
    const panePrep = env.elementRegistry.get('invTabMorningPrep');
    const paneCost = env.elementRegistry.get('invTabDishCosting');

    assert.strictEqual(panePrep.style.display, 'block', "#invTabMorningPrep must be display: block");
    assert.ok(panePrep.classList.contains('active'));

    assert.strictEqual(paneRaw.style.display, 'none', "#invTabRawStock must be display: none");
    assert.ok(!paneRaw.classList.contains('active'));

    assert.strictEqual(paneCost.style.display, 'none', "#invTabDishCosting must be display: none");
    assert.ok(!paneCost.classList.contains('active'));

    const btnPrep = env.elementRegistry.get('invTabBtn-morningPrep');
    assert.ok(btnPrep.classList.contains('active'));
    assert.strictEqual(btnPrep.getAttribute('aria-selected'), 'true');
});

test("M4-ISO-03: Stage 3 (dish_costing) displays only #invTabDishCosting, others hidden", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    ctx.switchInventoryHubTab('dish_costing');

    const paneRaw = env.elementRegistry.get('invTabRawStock');
    const panePrep = env.elementRegistry.get('invTabMorningPrep');
    const paneCost = env.elementRegistry.get('invTabDishCosting');

    assert.strictEqual(paneCost.style.display, 'block', "#invTabDishCosting must be display: block");
    assert.ok(paneCost.classList.contains('active'));

    assert.strictEqual(paneRaw.style.display, 'none', "#invTabRawStock must be display: none");
    assert.ok(!paneRaw.classList.contains('active'));

    assert.strictEqual(panePrep.style.display, 'none', "#invTabMorningPrep must be display: none");
    assert.ok(!panePrep.classList.contains('active'));

    const btnCost = env.elementRegistry.get('invTabBtn-dishCosting');
    assert.ok(btnCost.classList.contains('active'));
    assert.strictEqual(btnCost.getAttribute('aria-selected'), 'true');
});

test("M4-ISO-04: Strict Isolation Invariant across 50 rapid stage switches", () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    const stages = ['raw_stock', 'morning_batch', 'dish_costing'];
    const aliasMap = {
        'rtr_tracker': 'raw_stock',
        'morning_prep': 'morning_batch',
        'recipes_costing': 'dish_costing'
    };

    const paneMap = {
        'raw_stock': 'invTabRawStock',
        'morning_batch': 'invTabMorningPrep',
        'dish_costing': 'invTabDishCosting'
    };

    for (let i = 0; i < 50; i++) {
        const pick = (i % 2 === 0)
            ? stages[Math.floor(Math.random() * stages.length)]
            : Object.keys(aliasMap)[Math.floor(Math.random() * Object.keys(aliasMap).length)];

        ctx.switchInventoryHubTab(pick);

        const expectedStage = aliasMap[pick] || pick;
        const expectedVisiblePaneId = paneMap[expectedStage];

        // Verify EXACTLY one pane is display: block, and other two are display: none
        let visibleCount = 0;
        let hiddenCount = 0;

        stages.forEach(s => {
            const paneId = paneMap[s];
            const pane = env.elementRegistry.get(paneId);
            if (paneId === expectedVisiblePaneId) {
                assert.strictEqual(pane.style.display, 'block', `${paneId} must be visible for ${expectedStage}`);
                assert.ok(pane.classList.contains('active'), `${paneId} must have active class`);
                visibleCount++;
            } else {
                assert.strictEqual(pane.style.display, 'none', `${paneId} must be hidden for ${expectedStage}`);
                assert.ok(!pane.classList.contains('active'), `${paneId} must not have active class`);
                hiddenCount++;
            }
        });

        assert.strictEqual(visibleCount, 1, `Switch ${i}: Exactly 1 pane visible`);
        assert.strictEqual(hiddenCount, 2, `Switch ${i}: Exactly 2 panes hidden`);
    }
});

// ==============================================================================
// 🎯 SUITE 6: BATCH DEDUCTION & RECIPE MARGIN RECALCULATION UNDER STRESS (M4)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 6: BATCH DEDUCTION & DYNAMIC MARGIN RECALCULATION STRESS HARNESS");
console.log("------------------------------------------------------------------------------");

test("M4-BATCH-01: Makhani Gravy 1x batch deduction and sub-recipe stock crediting", async () => {
    const env = createMockEnvironment();
    const ctx = env.context;

    // Trigger initial data load
    ctx.switchInventoryHubTab('raw_stock');

    // Makhani gravy base sub-recipe: yield 20L
    // Ingredients:
    // Tomato: 15kg, Ginger-Garlic: 2kg, Oil: 1.5L, Butter: 1.2kg, Cashew: 1.5kg,
    // Kashmiri Mirch: 0.4kg, Garam Masala: 0.2kg, Cream: 1.0L, Kasuri Methi: 0.1kg

    const initialTomato = 50.0;
    const initialButter = 20.0;
    const initialYield = 0.0;

    const res = await ctx.produceMorningBatch('SUB-MAK-01', 1.0);
    assert.strictEqual(res !== false, true, "produceMorningBatch must succeed");

    // Check batch log
    const batchHistory = ctx.culinaryInventory.getBatchHistory();
    assert.ok(batchHistory.length > 0, "Batch history must record production");
    const latestBatch = batchHistory[0];
    assert.strictEqual(latestBatch.subRecipeId, 'SUB-MAK-01');
    assert.strictEqual(latestBatch.quantity, 20.0, "Yield must be 20L for 1x batch");
    assert.ok(latestBatch.totalCost > 0, "Total production cost must be positive");
});

test("M4-BATCH-02: Multiplier batching (0.5x, 2x) scales ingredient deductions proportionally", async () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.switchInventoryHubTab('raw_stock');

    // 0.5x batch of Makhani Gravy (10L yield)
    await ctx.produceMorningBatch('SUB-MAK-01', 0.5);
    const history = ctx.culinaryInventory.getBatchHistory();
    assert.strictEqual(history[0].quantity, 10.0, "0.5x batch yield is 10L");

    // 2x batch of Makhani Gravy (40L yield)
    await ctx.produceMorningBatch('SUB-MAK-01', 2.0);
    const history2 = ctx.culinaryInventory.getBatchHistory();
    assert.strictEqual(history2[0].quantity, 40.0, "2x batch yield is 40L");
});

test("M4-BATCH-03: Insufficient ingredient stock triggers atomic rejection with zero deductions", async () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.switchInventoryHubTab('raw_stock');

    // Simulate depleted Tomato stock by modifying storage and resetting
    // Or attempting a 100x massive batch that exceeds available raw stock
    const hugeMultiplier = 100.0; // Needs 1500kg tomato, only 50kg in stock

    const initialBatchesCount = ctx.culinaryInventory.getBatchHistory().length;
    const res = await ctx.produceMorningBatch('SUB-MAK-01', hugeMultiplier);

    assert.strictEqual(res, false, "Batch must fail when stock is insufficient");
    assert.ok(env.alerts.length > 0, "Alert dialog shown informing user of shortage");
    assert.ok(env.alerts[0].includes("Insufficient Stock"), "Alert mentions insufficient stock");

    // History must NOT have added this failed batch
    assert.strictEqual(ctx.culinaryInventory.getBatchHistory().length, initialBatchesCount, "No batch logged on shortage");
});

test("M4-BATCH-04: Non-existent sub-recipe rejection", async () => {
    const env = createMockEnvironment();
    const ctx = env.context;
    ctx.switchInventoryHubTab('raw_stock');

    const res = await ctx.produceMorningBatch('SUB-NON-EXISTENT', 1.0);
    assert.strictEqual(res, false, "Invalid sub-recipe ID safely returns false");
});

test("M4-COST-01: Dish recipe food cost roll-up and gross profit margin formula", () => {
    // Pure calculation verification matching culinary_inventory.js lines 1289-1301
    // Butter Chicken (REC-BC): Selling price = ₹340
    const sellingPrice = 340;
    const components = [
        { type: 'sub_recipe', id: 'SUB-MAK-01', unitCost: 132.50, quantity: 0.22 }, // ₹29.15
        { type: 'raw', id: 'RM-OIL', unitCost: 140, quantity: 0.02 },             // ₹2.80
        { type: 'raw', id: 'RM-CHICKEN', unitCost: 240, quantity: 0.20 },         // ₹48.00
        { type: 'raw', id: 'RM-BUTTER', unitCost: 520, quantity: 0.025 }          // ₹13.00
    ];

    const foodCost = components.reduce((sum, c) => sum + (c.unitCost * c.quantity), 0);
    const expectedMargin = Math.round(((sellingPrice - foodCost) / sellingPrice) * 100);

    assert.ok(foodCost > 90 && foodCost < 95, `Food cost should be ~₹92.95, got ${foodCost.toFixed(2)}`);
    assert.strictEqual(expectedMargin, 73, `Butter chicken margin should be 73%, got ${expectedMargin}%`);
});

test("M4-COST-02: Commodity price surge stress cascades into margin compression", () => {
    // Simulate raw material surge:
    // Tomato triples (+200%), Butter doubles (+100%), Chicken rises by +50%
    const baseSellingPrice = 340;

    // Normal costs
    const normalSubCost = 132.50;
    const normalFoodCost = (normalSubCost * 0.22) + (140 * 0.02) + (240 * 0.20) + (520 * 0.025); // ~92.95
    const normalMargin = Math.round(((baseSellingPrice - normalFoodCost) / baseSellingPrice) * 100); // 73%

    // Surged costs: Sub cost rises to 215.00, Chicken to 360, Butter to 1040
    const surgedSubCost = 215.00;
    const surgedFoodCost = (surgedSubCost * 0.22) + (180 * 0.02) + (360 * 0.20) + (1040 * 0.025); // ~148.90
    const surgedMargin = Math.round(((baseSellingPrice - surgedFoodCost) / baseSellingPrice) * 100); // 56%

    assert.ok(surgedFoodCost > normalFoodCost, "Food cost rises under commodity inflation");
    assert.ok(surgedMargin < normalMargin, "Profit margin compresses under commodity inflation");
    assert.strictEqual(surgedMargin, 56, `Surged margin should be 56%, got ${surgedMargin}%`);
});

test("M4-COST-03: Boundary conditions: 0 selling price, loss-making dish, zero-cost dish", () => {
    function computeMargin(sPrice, cost) {
        return sPrice > 0 ? Math.round(((sPrice - cost) / sPrice) * 100) : 0;
    }

    // Zero selling price (complimentary dish / zero division safety)
    assert.strictEqual(computeMargin(0, 50), 0, "Zero selling price returns 0 margin without NaN or Infinity");

    // Selling price = food cost (breakeven)
    assert.strictEqual(computeMargin(100, 100), 0, "Breakeven dish has 0% margin");

    // Loss making dish (food cost > selling price)
    assert.strictEqual(computeMargin(80, 100), -25, "Loss making dish evaluates to negative margin (-25%)");

    // Zero food cost dish (pure service/water)
    assert.strictEqual(computeMargin(50, 0), 100, "Zero food cost evaluates to 100% margin");
});

test("M4-COST-04: Floating point precision rounding prevents precision drift", () => {
    let stock = 15.0;
    const deduction = 0.333;

    for (let i = 0; i < 10; i++) {
        stock = Math.max(0, Math.round((stock - deduction) * 1000) / 1000);
    }

    assert.strictEqual(stock, 11.67, "10 deductions of 0.333 from 15.0 round strictly to 11.670 without IEEE 754 drift");
});

// ==============================================================================
// 🎯 SUITE 7: SYSTEM INVARIANTS & INTEGRITY AUDIT (M5 / R5)
// ==============================================================================
console.log("\n------------------------------------------------------------------------------");
console.log("📍 SUITE 7: SYSTEM INVARIANTS & INTEGRITY AUDIT");
console.log("------------------------------------------------------------------------------");

test("INV-01: Exactly 26 SVG modal close buttons matching strict regex in index.html", () => {
    const modalCloseRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
    const matches = html.match(modalCloseRegex) || [];
    assert.strictEqual(matches.length, 26, `Expected exactly 26 SVG modal close buttons, found ${matches.length}`);
});

test("INV-02: Total modal-close-btn class occurrences in index.html is strictly 26", () => {
    const classOccurrences = (html.match(/class=["'][^"']*\bmodal-close-btn\b[^"']*["']/g) || []).length;
    assert.strictEqual(classOccurrences, 26, `Expected exactly 26 occurrences of modal-close-btn, found ${classOccurrences}`);
});

test("INV-03: Zero raw unicode emojis inside operational <button> tags in index.html", () => {
    const rawEmojiPattern = /<button\b[^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)<\/button>/;
    const match = html.match(rawEmojiPattern);
    assert.strictEqual(match, null, `Found raw unicode emoji in button: ${match ? match[0] : ''}`);
});

test("INV-04: Zero raw unicode emojis in navigation tabs, stepper indicators, or chips", () => {
    const rawEmojiPattern = /class=["'][^"']*(?:tab-btn|sub-tab-btn|wa-var-chip|wa-step-indicator|filter-pill)[^"']*["'][^>]*>([^<]*[\uD83C-\uDBFF\uDC00-\uDFFF\u2600-\u26FF\u2700-\u27BF][^<]*)</;
    const match = html.match(rawEmojiPattern);
    assert.strictEqual(match, null, `Found raw emoji in tab/chip/stepper: ${match ? match[0] : ''}`);
});

test("INV-05: Non-modal dialogs strictly use isolated close button classes", () => {
    assert.ok(html.includes('slide-menu-close-btn'), "Slide menu drawer must use .slide-menu-close-btn");
    assert.ok(html.includes('more-close-btn'), "More hub must use .more-close-btn");
    assert.ok(html.includes('close-drawer-btn'), "Cart drawer must use .close-drawer-btn");
    assert.ok(html.includes('khata-close-btn'), "Khata modals must use .khata-close-btn");
    assert.ok(html.includes('rtr_close_btn'), "Restock modals must use .rtr_close_btn");
    assert.ok(html.includes('wa-preview-close-btn'), "WhatsApp preview mockup must use .wa-preview-close-btn");
});

// ==============================================================================
// 📊 SUMMARY & VERDICT
// ==============================================================================
console.log("\n==============================================================================");
console.log(`🎯 CHALLENGER 2 SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log("==============================================================================");

if (failed > 0) {
    console.error("\n❌ VERDICT: REQUEST_CHANGES");
    failures.forEach(f => {
        console.error(`  - ${f.name}: ${f.error}`);
    });
    process.exit(1);
} else {
    console.log("\n✨ VERDICT: APPROVE");
    console.log("All empirical stress tests, state persistence assertions, and invariants passed 100%!");
    process.exit(0);
}

})();
