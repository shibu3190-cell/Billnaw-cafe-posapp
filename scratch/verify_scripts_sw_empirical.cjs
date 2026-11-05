/**
 * scratch/verify_scripts_sw_empirical.cjs
 * Empirical Challenger Verification Harness
 * Tests:
 * 1. Offline SW PWA Cache Integrity & MIME Verification
 * 2. Script Extraction Syntax & Global Exports
 * 3. Inline HTML Event Handler Resolution & Defensive Stubs
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');

const MIME_MAP = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = [];

function check(title, assertion) {
    totalChecks++;
    try {
        const res = assertion();
        if (res !== false) {
            passedChecks++;
            console.log(`  ✅ PASS: ${title}`);
            return true;
        } else {
            failedChecks.push({ title, reason: 'Assertion returned false' });
            console.error(`  ❌ FAIL: ${title}`);
            return false;
        }
    } catch (err) {
        failedChecks.push({ title, reason: err.message, stack: err.stack });
        console.error(`  ❌ FAIL: ${title} -> ${err.message}`);
        return false;
    }
}

console.log('====================================================');
console.log('🧪 EMPIRICAL CHALLENGER VERIFICATION HARNESS');
console.log('====================================================\n');

// ------------------------------------------------------------------
// SECTION 1: SERVICE WORKER & STATIC SHELL ASSETS AUDIT
// ------------------------------------------------------------------
console.log('📍 SECTION 1: SERVICE WORKER MANIFEST & ASSET AUDIT');

const swPathRoot = path.join(ROOT_DIR, 'service-worker.js');
const swPathPublic = path.join(ROOT_DIR, 'public', 'sw.js');

check('SW-01: service-worker.js exists and is readable', () => {
    return fs.existsSync(swPathRoot) && fs.statSync(swPathRoot).size > 0;
});

check('SW-02: public/sw.js exists and is readable', () => {
    return fs.existsSync(swPathPublic) && fs.statSync(swPathPublic).size > 0;
});

const swRootContent = fs.readFileSync(swPathRoot, 'utf8');
const swPublicContent = fs.readFileSync(swPathPublic, 'utf8');

// Extract CACHE_VERSION
const rootVersionMatch = swRootContent.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);
const publicVersionMatch = swPublicContent.match(/CACHE_VERSION\s*=\s*['"]([^'"]+)['"]/);

check('SW-03: CACHE_VERSION in service-worker.js is billnaw-pos-shell-v3.3.0', () => {
    return rootVersionMatch && rootVersionMatch[1] === 'billnaw-pos-shell-v3.3.0';
});

check('SW-04: CACHE_VERSION in public/sw.js is billnaw-pos-shell-v3.3.0', () => {
    return publicVersionMatch && publicVersionMatch[1] === 'billnaw-pos-shell-v3.3.0';
});

// Extract STATIC_SHELL_ASSETS array
function extractStaticAssets(content) {
    const arrayMatch = content.match(/STATIC_SHELL_ASSETS\s*=\s*\[([\s\S]*?)\];/);
    if (!arrayMatch) throw new Error('STATIC_SHELL_ASSETS array not found');
    return arrayMatch[1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.startsWith("'./") || l.startsWith('"./'))
        .map(l => l.replace(/['",]/g, '').trim());
}

const rootAssets = extractStaticAssets(swRootContent);
const publicAssets = extractStaticAssets(swPublicContent);

check('SW-05: STATIC_SHELL_ASSETS has identical asset lists in root and public SWs', () => {
    if (rootAssets.length !== publicAssets.length) return false;
    return rootAssets.every((a, idx) => a === publicAssets[idx]);
});

console.log(`\n  Checking all ${rootAssets.length} cached static assets on disk...`);

const requiredExtractedScripts = [
    './js/defensive-stubs.js',
    './js/firebase-init.js',
    './js/sw-register.js',
    './js/shop-auth.js',
    './js/feature-controllers.js'
];

check('SW-06: STATIC_SHELL_ASSETS explicitly includes all 5 extracted scripts', () => {
    return requiredExtractedScripts.every(script => rootAssets.includes(script));
});

check('SW-07: STATIC_SHELL_ASSETS explicitly includes modular KotUI and TablesUI files', () => {
    return rootAssets.includes('./src/features/kot/kot.ui.js') &&
           rootAssets.includes('./src/features/tables/tables.ui.js');
});

// Verify every file on disk
rootAssets.forEach((assetRel, i) => {
    const assetClean = assetRel === './' ? 'index.html' : assetRel.replace(/^\.\//, '');
    const diskPath = path.join(ROOT_DIR, assetClean);
    check(`SW-ASSET-${String(i + 1).padStart(2, '0')}: File exists on disk: ${assetRel}`, () => {
        if (!fs.existsSync(diskPath)) {
            throw new Error(`File not found: ${diskPath}`);
        }
        const stat = fs.statSync(diskPath);
        if (stat.size === 0) {
            throw new Error(`File is empty (0 bytes): ${diskPath}`);
        }
        const ext = path.extname(diskPath);
        const mime = MIME_MAP[ext];
        if (!mime) {
            throw new Error(`Unmapped or invalid file extension '${ext}' for ${diskPath}`);
        }
        return true;
    });
});

// ------------------------------------------------------------------
// SECTION 2: EXTRACTED SCRIPT SYNTAX & EVALUATION
// ------------------------------------------------------------------
console.log('\n📍 SECTION 2: EXTRACTED SCRIPTS SYNTAX & LOAD EVALUATION');

const extractedScripts = [
    { name: 'defensive-stubs', relPath: 'js/defensive-stubs.js', isModule: false },
    { name: 'firebase-init', relPath: 'js/firebase-init.js', isModule: true },
    { name: 'sw-register', relPath: 'js/sw-register.js', isModule: false },
    { name: 'shop-auth', relPath: 'js/shop-auth.js', isModule: false },
    { name: 'feature-controllers', relPath: 'js/feature-controllers.js', isModule: true }
];

extractedScripts.forEach((sc, idx) => {
    const filePath = path.join(ROOT_DIR, sc.relPath);
    check(`SCRIPT-SYNTAX-${idx + 1}: ${sc.relPath} exists, >0 bytes, valid JS syntax`, () => {
        if (!fs.existsSync(filePath)) throw new Error(`Not found: ${filePath}`);
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.length === 0) throw new Error(`Empty file: ${filePath}`);
        
        // Check syntax via node --check
        execSync(`node --check "${filePath}"`, { stdio: 'pipe' });
        return true;
    });
});

// ------------------------------------------------------------------
// SECTION 3: RUNTIME GLOBALS BINDING EVALUATION
// ------------------------------------------------------------------
console.log('\n📍 SECTION 3: RUNTIME GLOBALS BINDING EVALUATION');

function createMockElement(id = 'mock-el') {
    return {
        id,
        classList: {
            add: () => {},
            remove: () => {},
            contains: () => false,
            toggle: () => {}
        },
        style: {
            setProperty: () => {},
            display: ''
        },
        dataset: {},
        value: '',
        innerText: '',
        innerHTML: '',
        disabled: false,
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => null,
        removeAttribute: () => {},
        focus: () => {},
        blur: () => {},
        querySelector: () => null,
        querySelectorAll: () => []
    };
}

const mockWindow = {
    location: { href: 'http://localhost:5000', search: '', pathname: '/', reload: () => {} },
    history: { replaceState: () => {} },
    navigator: {
        serviceWorker: {
            ready: Promise.resolve({ active: null, postMessage: () => {} }),
            register: () => Promise.resolve({ scope: '/', update: () => Promise.resolve() }),
            addEventListener: () => {}
        }
    },
    document: {
        addEventListener: () => {},
        getElementById: (id) => createMockElement(id),
        querySelector: () => createMockElement('qs-el'),
        querySelectorAll: () => [createMockElement('qsa-el')]
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
    },
    sessionStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
        clear: () => {}
    },
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {} },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    setInterval: (fn) => setInterval(fn, 0),
    clearInterval: (id) => clearInterval(id)
};
mockWindow.window = mockWindow;
mockWindow.globalThis = mockWindow;

const context = vm.createContext(mockWindow);

// Execute defensive-stubs.js in context
const defensiveCode = fs.readFileSync(path.join(ROOT_DIR, 'js/defensive-stubs.js'), 'utf8');
vm.runInContext(defensiveCode, context);

check('GLOBAL-01: defensive-stubs.js attaches openAuthorizedDevicesModal to window', () => {
    return typeof context.openAuthorizedDevicesModal === 'function';
});

check('GLOBAL-02: defensive-stubs.js attaches toggleKdsSound to window', () => {
    return typeof context.toggleKdsSound === 'function';
});

check('GLOBAL-03: defensive-stubs.js attaches openStatementModal to window', () => {
    return typeof context.openStatementModal === 'function';
});

check('GLOBAL-04: defensive-stubs.js attaches openSwitchStoreModal to window', () => {
    return typeof context.openSwitchStoreModal === 'function';
});

check('GLOBAL-05: defensive-stubs.js attaches forceCheckAppUpdate to window', () => {
    return typeof context.forceCheckAppUpdate === 'function';
});

// Now execute shop-auth.js in context
const shopAuthCode = fs.readFileSync(path.join(ROOT_DIR, 'js/shop-auth.js'), 'utf8');
vm.runInContext(shopAuthCode, context);

check('GLOBAL-06: shop-auth.js defines openShopAuthModal on window', () => {
    return typeof context.openShopAuthModal === 'function';
});

check('GLOBAL-07: shop-auth.js defines resetLoginOtpView on window', () => {
    return typeof context.resetLoginOtpView === 'function';
});

check('GLOBAL-08: shop-auth.js defines resetSignupOtpView on window', () => {
    return typeof context.resetSignupOtpView === 'function';
});

check('GLOBAL-09: shop-auth.js defines logoutShop on window', () => {
    return typeof context.logoutShop === 'function';
});

check('GLOBAL-10: shop-auth.js defines logoutShopCloudAccount on window', () => {
    return typeof context.logoutShopCloudAccount === 'function';
});

check('GLOBAL-11: shop-auth.js defines openActiveSessionsModal on window', () => {
    return typeof context.openActiveSessionsModal === 'function';
});

check('GLOBAL-12: shop-auth.js defines openTableManagementModal on window', () => {
    return typeof context.openTableManagementModal === 'function';
});

check('GLOBAL-13: shop-auth.js defines dismissAppUpdatePopup and applyAppUpdate', () => {
    return typeof context.dismissAppUpdatePopup === 'function' &&
           typeof context.applyAppUpdate === 'function';
});

// Check firebase-init.js code for firestoreDB and related exports
const firebaseInitCode = fs.readFileSync(path.join(ROOT_DIR, 'js/firebase-init.js'), 'utf8');

check('GLOBAL-14: js/firebase-init.js assigns window.firestoreDB and window.firebaseApp', () => {
    return firebaseInitCode.includes('window.firestoreDB =') &&
           firebaseInitCode.includes('window.firebaseApp =');
});

check('GLOBAL-15: js/firebase-init.js exports firestore document/collection primitives', () => {
    return firebaseInitCode.includes('window.firestoreDoc =') &&
           firebaseInitCode.includes('window.firestoreCollection =') &&
           firebaseInitCode.includes('window.firestoreOnSnapshot =');
});

// Check feature-controllers.js code for KotUI, TablesUI, and toggleKdsSound
const featureControllersCode = fs.readFileSync(path.join(ROOT_DIR, 'js/feature-controllers.js'), 'utf8');

check('GLOBAL-16: js/feature-controllers.js imports KotUI and TablesUI', () => {
    return (featureControllersCode.includes("from '../src/features/kot/kot.ui.js'") || featureControllersCode.includes('from "../src/features/kot/kot.ui.js"')) &&
           (featureControllersCode.includes("from '../src/features/tables/tables.ui.js'") || featureControllersCode.includes('from "../src/features/tables/tables.ui.js"'));
});

check('GLOBAL-17: js/feature-controllers.js binds KotUI and TablesUI to window', () => {
    return featureControllersCode.includes('window.KotUI = KotUI') &&
           featureControllersCode.includes('window.TablesUI = TablesUI');
});

check('GLOBAL-18: js/feature-controllers.js binds renderKdsUI and renderTablesFloorUI to window', () => {
    return featureControllersCode.includes('window.renderKdsUI =') &&
           featureControllersCode.includes('window.renderTablesFloorUI =');
});

// ------------------------------------------------------------------
// SECTION 4: INLINE HTML EVENT HANDLER AUDIT
// ------------------------------------------------------------------
console.log('\n📍 SECTION 4: INLINE HTML EVENT HANDLER AUDIT');

const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');

// Match all inline event attributes like onclick="...", onchange="...", etc.
const eventRegex = /\s(on[a-z]+)="([^"]*)"/gi;
const eventHandlers = [];
let match;
while ((match = eventRegex.exec(indexHtml)) !== null) {
    eventHandlers.push({
        event: match[1],
        code: match[2].trim()
    });
}

console.log(`  Found ${eventHandlers.length} inline event handlers in index.html.`);

// Extract function calls from event handler strings
// Match functions preceded by start of string, semicolon, parenthesis, space, etc. but NOT a dot
const callRegex = /(?:^|[^a-zA-Z0-9_$.])([a-zA-Z0-9_$]+)\s*\(/g;
const invokedFunctions = new Set();
const jsBuiltins = new Set([
    'if', 'for', 'while', 'switch', 'return', 'typeof', 'catch',
    'event', 'parseInt', 'parseFloat', 'alert', 'confirm', 'prompt',
    'encodeURIComponent', 'decodeURIComponent', 'Math', 'Date', 'String', 'Number', 'Boolean', 'Array', 'Object'
]);
eventHandlers.forEach(h => {
    let fnMatch;
    while ((fnMatch = callRegex.exec(h.code)) !== null) {
        const fnName = fnMatch[1];
        if (!jsBuiltins.has(fnName)) {
            invokedFunctions.add(fnName);
        }
    }
});

console.log(`  Found ${invokedFunctions.size} unique functions invoked by inline event handlers.`);

// Read all scripts that are loaded by index.html:
const loadedScriptFiles = [
    'js/defensive-stubs.js',
    'js/sw-register.js',
    'js/core.js',
    'js/staff.js',
    'js/pos.js',
    'js/menu.js',
    'js/customers.js',
    'js/dashboard.js',
    'js/marketing_inventory.js',
    'js/culinary_inventory.js',
    'js/settings.js',
    'app.js',
    'js/shop-auth.js',
    'js/firebase-init.js',
    'js/feature-controllers.js'
];

const scriptCodeCombined = loadedScriptFiles
    .map(p => fs.readFileSync(path.join(ROOT_DIR, p), 'utf8'))
    .join('\n');

const missingFunctions = [];
invokedFunctions.forEach(fn => {
    const isDeclared = (
        scriptCodeCombined.includes(`function ${fn}`) ||
        scriptCodeCombined.includes(`window.${fn}`) ||
        scriptCodeCombined.includes(`${fn} =`) ||
        scriptCodeCombined.includes(`${fn}:`) ||
        typeof context[fn] === 'function' ||
        jsBuiltins.has(fn)
    );
    if (!isDeclared) {
        missingFunctions.push(fn);
    }
});

check('EVENT-01: Zero undefined function calls in inline HTML event handlers', () => {
    if (missingFunctions.length > 0) {
        throw new Error(`Missing function definitions for: ${missingFunctions.join(', ')}`);
    }
    return true;
});

check('EVENT-02: Critical operational globals exist and are accessible', () => {
    const criticalFns = [
        'openAuthorizedDevicesModal',
        'toggleKdsSound',
        'openShopAuthModal',
        'resetLoginOtpView',
        'resetSignupOtpView',
        'logoutShop',
        'logoutShopCloudAccount',
        'applyAppUpdate',
        'dismissAppUpdatePopup'
    ];
    for (const fn of criticalFns) {
        if (!scriptCodeCombined.includes(`window.${fn} =`) && !scriptCodeCombined.includes(`function ${fn}`)) {
            throw new Error(`Critical global ${fn} not defined!`);
        }
    }
    return true;
});

// ------------------------------------------------------------------
// SECTION 5: EARLY-CLICK DEFENSIVE STUB RESILIENCE
// ------------------------------------------------------------------
console.log('\n📍 SECTION 5: EARLY-CLICK DEFENSIVE STUB RESILIENCE');

// Create a bare sandbox with ONLY defensive-stubs loaded
const stubSandbox = {
    window: {},
    document: {
        getElementById: () => createMockElement('stub-el'),
        querySelector: () => null,
        querySelectorAll: () => []
    },
    localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    },
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout: (id) => clearTimeout(id),
    console: { warn: () => {}, log: () => {} }
};
stubSandbox.window = stubSandbox;
stubSandbox.globalThis = stubSandbox;
const stubContext = vm.createContext(stubSandbox);
vm.runInContext(defensiveCode, stubContext);

const earlyStubsToTest = [
    'openAuthorizedDevicesModal',
    'closeAuthorizedDevicesModal',
    'toggleKdsSound',
    'openStatementModal',
    'closeStatementModal',
    'openSwitchStoreModal',
    'confirmSwitchShopCode',
    'forceCheckAppUpdate',
    'openRestockExpenseModal',
    'closeInventoryHubSubView',
    'generateSecureUniqueStaffPin',
    'promptAdminAuthorizeTerminal',
    'openAdminForgotPinModal',
    'closeAdminForgotPinModal'
];

earlyStubsToTest.forEach(fnName => {
    check(`DEFENSIVE-STUB: Early invocation of ${fnName}() does not throw ReferenceError`, () => {
        if (typeof stubContext[fnName] !== 'function') {
            throw new Error(`${fnName} is not a function in early stub stage`);
        }
        stubContext[fnName]();
        return true;
    });
});

console.log('\n====================================================');
console.log(`🎯 EMPIRICAL AUDIT COMPLETE: ${passedChecks} PASSED, ${failedChecks.length} FAILED (TOTAL: ${totalChecks})`);
console.log('====================================================\n');

if (failedChecks.length > 0) {
    console.error('Failure Details:');
    failedChecks.forEach(f => console.error(`  - ${f.title}: ${f.reason}`));
    process.exit(1);
} else {
    console.log('✨ ALL EMPIRICAL SCRIPT & SW INVARIANTS VERIFIED 100% GREEN!');
    process.exit(0);
}
