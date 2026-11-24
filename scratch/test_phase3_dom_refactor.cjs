/**
 * scratch/test_phase3_dom_refactor.cjs
 * Comprehensive Verification Suite for Phase 3: DOM Refactor & Virtual Slicing
 * 
 * Verifies:
 * 1. 36-item windowed slicing for "All" category with Load More button & observer
 * 2. In-place targeted cart patching without innerHTML wiping on +/- taps
 * 3. Bounded FIFO cache for _failedMenuImageUrls (max 100 items)
 * 4. Microsecond benchmark & zero DOM element destruction on cart clicks
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================================');
console.log('🚀 RUNNING PHASE 3 DOM REFACTOR & VIRTUAL SLICING AUDIT');
console.log('====================================================================\n');

// --- Minimal Mock DOM Environment ---
class MockClassList {
    constructor() { this.classes = new Set(); }
    add(...cls) { cls.forEach(c => this.classes.add(c)); }
    remove(...cls) { cls.forEach(c => this.classes.delete(c)); }
    toggle(c, force) {
        if (force === undefined) {
            if (this.classes.has(c)) { this.classes.delete(c); return false; }
            else { this.classes.add(c); return true; }
        }
        if (force) this.classes.add(c);
        else this.classes.delete(c);
        return Boolean(force);
    }
    contains(c) { return this.classes.has(c); }
}

class MockElement {
    constructor(tagName, id = '') {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.classList = new MockClassList();
        this._innerHTML = '';
        this.innerText = '';
        this.textContent = '';
        this.value = '';
        this.style = {};
        this.dataset = {};
        this.children = [];
        this.attributes = new Map();
        this.parentElement = null;
    }

    get innerHTML() { return this._innerHTML; }
    set innerHTML(val) {
        this._innerHTML = String(val);
        // Simple parser to populate children for querySelector/querySelectorAll in tests
        this._parseInnerHtml(this._innerHTML);
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.has(k) ? this.attributes.get(k) : null; }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (this.parentElement) {
            const idx = this.parentElement.children.indexOf(this);
            if (idx !== -1) this.parentElement.children.splice(idx, 1);
            this.parentElement = null;
        }
    }

    querySelector(selector) {
        const matches = this.querySelectorAll(selector);
        return matches.length > 0 ? matches[0] : null;
    }

    querySelectorAll(selector) {
        const results = [];
        function walk(node) {
            for (const child of node.children) {
                if (matchesSelector(child, selector)) {
                    results.push(child);
                }
                walk(child);
            }
        }
        walk(this);
        return results;
    }

    _parseInnerHtml(html) {
        this.children = [];
        if (!html) return;
        // Parse .menu-card
        const cardRegex = /<div class="menu-card([^"]*)" id="([^"]*)" data-item-id="([^"]*)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
        let match;
        while ((match = cardRegex.exec(html)) !== null) {
            const cardEl = new MockElement('DIV', match[2]);
            cardEl.classList.add('menu-card');
            if (match[1].includes('is-out')) cardEl.classList.add('is-out');
            cardEl.setAttribute('data-item-id', match[3]);

            const nameEl = new MockElement('DIV');
            nameEl.classList.add('name');
            const nameMatch = match[0].match(/<div class="name">([^<]+)<\/div>/);
            nameEl.textContent = nameMatch ? nameMatch[1] : '';
            cardEl.appendChild(nameEl);

            const catEl = new MockElement('SPAN');
            catEl.classList.add('cat-label');
            const catMatch = match[0].match(/<span class="cat-label">([^<]+)<\/span>/);
            catEl.textContent = catMatch ? catMatch[1] : '';
            cardEl.appendChild(catEl);

            const priceEl = new MockElement('SPAN');
            priceEl.classList.add('price');
            const priceMatch = match[0].match(/<span class="price">([^<]+)<\/span>/);
            priceEl.textContent = priceMatch ? priceMatch[1] : '';
            cardEl.appendChild(priceEl);

            const imgEl = new MockElement('IMG');
            imgEl.classList.add('card-img');
            const imgSrcMatch = match[0].match(/src="([^"]+)"/);
            if (imgSrcMatch) {
                imgEl.src = imgSrcMatch[1];
                imgEl.setAttribute('src', imgSrcMatch[1]);
            }
            cardEl.appendChild(imgEl);

            this.appendChild(cardEl);
        }

        // Parse #menuLoadMoreContainer
        if (html.includes('id="menuLoadMoreContainer"')) {
            const loadMoreEl = new MockElement('DIV', 'menuLoadMoreContainer');
            const btnEl = new MockElement('BUTTON', 'menuLoadMoreBtn');
            const spanEl = new MockElement('SPAN');
            const spanMatch = html.match(/<span>Show More Dishes \(([^)]+)\)<\/span>/);
            spanEl.textContent = spanMatch ? `Show More Dishes (${spanMatch[1]})` : 'Show More Dishes';
            btnEl.appendChild(spanEl);
            loadMoreEl.appendChild(btnEl);
            this.appendChild(loadMoreEl);
        }

        // Parse .cart-item
        const cartRegex = /<div class="cart-item" data-cart-item-id="([^"]*)"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/g;
        while ((match = cartRegex.exec(html)) !== null) {
            const cartEl = new MockElement('DIV');
            cartEl.classList.add('cart-item');
            cartEl.setAttribute('data-cart-item-id', match[1]);

            const nameEl = new MockElement('DIV');
            nameEl.classList.add('cart-item-name');
            const nameMatch = match[0].match(/<div class="cart-item-name"[^>]*>([\s\S]*?)<\/div>/);
            nameEl.innerHTML = nameMatch ? nameMatch[1] : '';
            cartEl.appendChild(nameEl);

            const mathEl = new MockElement('DIV');
            mathEl.classList.add('cart-item-math');
            const mathMatch = match[0].match(/<div class="cart-item-math">([^<]+)<\/div>/);
            mathEl.textContent = mathMatch ? mathMatch[1] : '';
            cartEl.appendChild(mathEl);

            const priceEl = new MockElement('SPAN');
            priceEl.classList.add('cart-item-price');
            const priceMatch = match[0].match(/<span class="cart-item-price">([^<]+)<\/span>/);
            priceEl.textContent = priceMatch ? priceMatch[1] : '';
            cartEl.appendChild(priceEl);

            const pillEl = new MockElement('DIV');
            pillEl.classList.add('qty-pill');
            const spanEl = new MockElement('SPAN');
            const spanMatch = match[0].match(/<span>(\d+)<\/span>/);
            spanEl.textContent = spanMatch ? spanMatch[1] : '1';
            pillEl.appendChild(spanEl);
            cartEl.appendChild(pillEl);

            this.appendChild(cartEl);
        }
    }
}

function matchesSelector(el, sel) {
    if (sel.startsWith('#') && el.id === sel.slice(1)) return true;
    if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
    if (sel === 'img.card-img' && el.tagName === 'IMG' && el.classList.contains('card-img')) return true;
    if (sel === 'button span' && el.tagName === 'SPAN' && el.parentElement && el.parentElement.tagName === 'BUTTON') return true;
    if (sel === '.qty-pill span' && el.tagName === 'SPAN' && el.parentElement && el.parentElement.classList.contains('qty-pill')) return true;
    return false;
}

// Global DOM setup
const elements = new Map();
function getOrCreateElement(id, tag = 'DIV') {
    if (!elements.has(id)) {
        elements.set(id, new MockElement(tag, id));
    }
    return elements.get(id);
}

const mockDoc = {
    getElementById(id) { return getOrCreateElement(id); },
    querySelector(sel) {
        if (sel.startsWith('#')) return getOrCreateElement(sel.slice(1));
        return null;
    },
    querySelectorAll() { return []; },
    createElement(tag) { return new MockElement(tag); },
    addEventListener() {},
    removeEventListener() {}
};

global.document = mockDoc;
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.escapeHtml = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
global.generateFallbackImage = (name, cat) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(name || 'Food')}`;
global.getStoreGstConfig = () => ({ mode: 'exclusive', defaultRate: 5 });
global.shopProfile = { discountsEnabled: true };
global.activeTable = 'T1';
global.tablesInfo = { T1: { items: [], status: 'empty', savedTime: null } };
global.calculateOrderTotals = (items, disc) => {
    let sub = 0;
    (items || []).forEach(i => { sub += (i.price || 0) * (i.qty || 0); });
    let discAmt = 0;
    if (disc) {
        discAmt = disc.type === 'percent' ? (sub * disc.value / 100) : disc.value;
    }
    return { subtotal: sub, discountAmount: discAmt, finalTotal: Math.max(0, sub - discAmt) };
};
global.persistTables = () => {};
global.debouncedPersistTables = () => {};
global.syncTableUI = () => {};
global.showToast = () => {};
global.selectedCustomerForOrder = null;
global.getActiveTableCustomer = () => null;
global.getCustomerEligibleDiscountRate = () => 0;

// Load js/menu.js and js/pos.js
const menuCode = fs.readFileSync(path.join(__dirname, '../js/menu.js'), 'utf8');
const posCode = fs.readFileSync(path.join(__dirname, '../js/pos.js'), 'utf8');

// Execute files in global context
eval(menuCode);
eval(posCode);

// --- TEST 1: 36-Item Windowed Slicing in Menu UI ---
console.log('📍 CHECK 1: 36-Item Windowed Slicing for "All" Category (js/menu.js)');
{
    // Generate 200 items in "All" category
    const dishes = Array.from({ length: 200 }, (_, i) => ({
        id: 1000 + i,
        name: `Signature Dish ${i + 1}`,
        category: i < 50 ? 'Beverages' : (i < 100 ? 'Snacks' : 'Mains'),
        price: 120 + (i % 50),
        is_active: true,
        isAvailable: true
    }));
    window.menuItems = dishes;
    window.menuCategories = ['All', 'Beverages', 'Snacks', 'Mains'];
    global.activeCategory = 'All';

    // Initial render should slice to first 36 cards
    renderMenuUI();

    const menuGrid = document.getElementById('menuGridUI');
    const cards = menuGrid.querySelectorAll('.menu-card');
    assert.strictEqual(cards.length, 36, `Expected exactly 36 cards rendered on initial load of 200 items, got ${cards.length}`);

    const loadMoreBtn = menuGrid.querySelector('#menuLoadMoreContainer');
    assert.ok(loadMoreBtn, 'Expected #menuLoadMoreContainer to be rendered at bottom of menuGridUI');
    assert.ok(menuGrid.innerHTML.includes('164 remaining'), 'Expected load more button to display 164 remaining dishes');

    // Calling loadMoreMenuItems() should expand to 72 cards
    loadMoreMenuItems();
    const cardsAfterExpand = menuGrid.querySelectorAll('.menu-card');
    assert.strictEqual(cardsAfterExpand.length, 72, `Expected 72 cards after loadMoreMenuItems(), got ${cardsAfterExpand.length}`);
    assert.ok(menuGrid.innerHTML.includes('128 remaining'), 'Expected load more button to display 128 remaining dishes');

    // Filtering to 'Beverages' (50 items) with window limit reset
    filterMenu('Beverages');
    assert.strictEqual(global.activeCategory, 'Beverages');
    // For non-'All' category, windowing is disabled or active according to category size
    const bevCards = menuGrid.querySelectorAll('.menu-card');
    assert.strictEqual(bevCards.length, 50, `Expected all 50 Beverages to be displayed without windowing, got ${bevCards.length}`);
    const bevLoadMore = menuGrid.querySelector('#menuLoadMoreContainer');
    assert.strictEqual(bevLoadMore, null, 'Expected no Load More container for specific category');

    // Returning to 'All' should reset render limit to 36
    filterMenu('All');
    const resetCards = menuGrid.querySelectorAll('.menu-card');
    assert.strictEqual(resetCards.length, 36, `Expected render limit reset to 36 when switching back to All, got ${resetCards.length}`);

    console.log('  ✅ PASS: 36-item initial slicing, Load More expansion, and category filter reset verified cleanly.');
}

// --- TEST 2: Targeted Cart UI In-Place Patching ---
console.log('\n📍 CHECK 2: Targeted Cart UI In-Place Patching (js/pos.js)');
{
    const cartUI = document.getElementById('cartUI');
    tablesInfo['T1'] = {
        items: [
            { id: 1001, name: 'Espresso', price: 100, qty: 1 },
            { id: 1002, name: 'Croissant', price: 150, qty: 2 }
        ],
        status: 'occupied',
        savedTime: Date.now()
    };

    // Initial render of cart
    updateCartUI();
    const initialItems = cartUI.querySelectorAll('.cart-item');
    assert.strictEqual(initialItems.length, 2, 'Expected 2 initial cart items');
    assert.strictEqual(initialItems[0].getAttribute('data-cart-item-id'), '1001');
    assert.strictEqual(initialItems[1].getAttribute('data-cart-item-id'), '1002');

    // Store references to the exact DOM nodes
    const nodeItem1 = initialItems[0];
    const nodeItem2 = initialItems[1];

    // Modify quantity of item 1 (Croissant: 2 -> 3)
    tablesInfo['T1'].items[1].qty = 3;

    // Call updateCartUI() - MUST PATCH IN-PLACE WITHOUT WIPING INNERHTML
    updateCartUI();

    const afterPatchItems = cartUI.querySelectorAll('.cart-item');
    assert.strictEqual(afterPatchItems.length, 2, 'Still 2 cart items');

    // Verify node references were PRESERVED (zero DOM replacement/re-allocation)
    assert.strictEqual(afterPatchItems[0], nodeItem1, 'DOM node for item 1 must be preserved in-place');
    assert.strictEqual(afterPatchItems[1], nodeItem2, 'DOM node for item 2 must be preserved in-place');

    // Verify values were updated in-place
    const priceSpan = nodeItem2.querySelector('.cart-item-price');
    const qtySpan = nodeItem2.querySelector('.qty-pill span');
    assert.strictEqual(qtySpan.textContent, '3', 'Croissant quantity must be updated to 3');
    assert.strictEqual(priceSpan.textContent, '₹ 450.00', 'Croissant total must be updated to ₹ 450.00');

    // Total must be updated
    const totalEl = document.getElementById('totalUI');
    assert.strictEqual(totalEl.innerText, '550.00', 'Total must be updated to 550.00');

    // Empty cart should render empty state
    tablesInfo['T1'].items = [];
    updateCartUI();
    assert.ok(cartUI.innerHTML.includes('Select items from the menu'), 'Empty state rendered when items = []');

    console.log('  ✅ PASS: Cart items patched in-place without node recreation, totals updated, empty state preserved.');
}

// --- TEST 3: Bounded Failed Image Cache ---
console.log('\n📍 CHECK 3: Bounded Cache for _failedMenuImageUrls (js/menu.js)');
{
    assert.ok(typeof _failedMenuImageUrls !== 'undefined', '_failedMenuImageUrls Set must exist');
    _failedMenuImageUrls.clear();

    // Add 150 items to verify 100-entry ceiling and FIFO eviction
    for (let i = 1; i <= 150; i++) {
        _failedMenuImageUrls.add(`https://example.com/broken-image-${i}.jpg`);
    }

    assert.strictEqual(_failedMenuImageUrls.size, 100, `Expected size capped at 100, got ${_failedMenuImageUrls.size}`);
    assert.strictEqual(_failedMenuImageUrls.has('https://example.com/broken-image-1.jpg'), false, 'Oldest item 1 must have been evicted (FIFO)');
    assert.strictEqual(_failedMenuImageUrls.has('https://example.com/broken-image-50.jpg'), false, 'Oldest item 50 must have been evicted (FIFO)');
    assert.strictEqual(_failedMenuImageUrls.has('https://example.com/broken-image-51.jpg'), true, 'Item 51 must still be present');
    assert.strictEqual(_failedMenuImageUrls.has('https://example.com/broken-image-150.jpg'), true, 'Newest item 150 must be present');

    console.log('  ✅ PASS: _failedMenuImageUrls Set bounded at 100 entries with strict FIFO eviction.');
}

// --- TEST 4: Performance Benchmark ---
console.log('\n📍 CHECK 4: Microsecond Benchmark on Rapid Cart Quantity Modification');
{
    tablesInfo['T1'].items = [
        { id: 2001, name: 'Burger', price: 200, qty: 1 },
        { id: 2002, name: 'Fries', price: 100, qty: 1 },
        { id: 2003, name: 'Coke', price: 50, qty: 1 }
    ];
    updateCartUI();

    const start = process.hrtime.bigint();
    const ITERATIONS = 1000;
    for (let i = 0; i < ITERATIONS; i++) {
        tablesInfo['T1'].items[0].qty = (i % 10) + 1;
        updateCartUI();
    }
    const end = process.hrtime.bigint();
    const totalMs = Number(end - start) / 1e6;
    const perOpUs = (totalMs / ITERATIONS) * 1000;

    console.log(`  ⚡ In-place cart patching benchmark: ${ITERATIONS} updates took ${totalMs.toFixed(2)}ms (${perOpUs.toFixed(2)}µs per update)`);
    assert.ok(perOpUs < 500, `Expected in-place update < 500µs, got ${perOpUs.toFixed(2)}µs`);
    console.log('  ✅ PASS: In-place patching delivers microsecond-level render speed with zero DOM thrashing.');
}

console.log('\n====================================================================');
console.log('🎉 ALL 4 PHASE 3 CHECKS PASSED 100%!');
console.log('====================================================================');
process.exit(0);
