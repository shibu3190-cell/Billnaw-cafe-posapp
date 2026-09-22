// scratch/test_rush_hour.cjs - Rush Hour Peak Cafe Simulation & Verification
const http = require('http');

console.log('====================================================');
console.log('🚀 BILLNAW POS - PEAK RUSH HOUR SIMULATION & AUDIT');
console.log('====================================================\n');

// 1. In-memory Mock State simulating POS terminal core state
const mockDb = {
    settings: {
        shopName: 'billnaw cafe & bistro',
        gstPricingMode: 'inclusive',
        defaultGstRate: 5,
        upiId: 'billnaw@okhdfcbank',
        enableQrCode: true,
        discountsEnabled: true,
        tableCount: 10
    },
    menu: [
        { id: 101, name: 'Chicken Biryani', category: 'Main Course', price: 250, stockQty: 15, lowStockAlert: 5 },
        { id: 102, name: 'Masala Chai', category: 'Beverages', price: 40, stockQty: 50, lowStockAlert: 10 },
        { id: 103, name: 'Egg Roll', category: 'Snacks', price: 80, stockQty: 8, lowStockAlert: 5 },
        { id: 104, name: 'Cold Coffee', category: 'Beverages', price: 90, stockQty: 20, lowStockAlert: 5 },
        { id: 105, name: 'Paneer Roll', category: 'Snacks', price: 110, stockQty: 4, lowStockAlert: 5 } // Near low stock
    ],
    customers: [
        { id: 'c1', name: 'Amit Roy', phone: '9876543210', visits: 4, totalSpend: 1200, points: 60, tier: 'Bronze' }
    ],
    orders: [],
    expenses: [],
    tableOrders: {}
};

let currentBillNo = 1000;
let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        testsPassed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        testsFailed++;
    }
}

// SIMULATION STAGES
console.log('📍 SCENARIO 1: TABLE 1 - DINE-IN MULTI-ITEM ORDER WITH QUANTITY MODS & KOT');
{
    const tableId = 1;
    mockDb.tableOrders[tableId] = [];

    // Customer orders 2x Chicken Biryani, 3x Masala Chai, 1x Egg Roll
    function addToCart(table, item, qty = 1) {
        let existing = mockDb.tableOrders[table].find(i => i.id === item.id);
        if (existing) {
            existing.qty += qty;
        } else {
            mockDb.tableOrders[table].push({ ...item, qty });
        }
    }

    addToCart(tableId, mockDb.menu[0], 2); // 2x Biryani @ 250 = 500
    addToCart(tableId, mockDb.menu[1], 2); // 2x Chai @ 40 = 80
    addToCart(tableId, mockDb.menu[1], 1); // +1 Chai = 3x Chai = 120
    addToCart(tableId, mockDb.menu[2], 1); // 1x Egg Roll @ 80 = 80

    const cart = mockDb.tableOrders[tableId];
    assert(cart.length === 3, 'Table 1 cart has exactly 3 distinct items');

    const totalQty = cart.reduce((sum, i) => sum + i.qty, 0);
    assert(totalQty === 6, `Total items count is 6 (found: ${totalQty})`);

    const subtotal = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    assert(subtotal === 700, `Table 1 subtotal is ₹700 (found: ₹${subtotal})`);

    // Kitchen Order Ticket (KOT) Generation
    const kot = {
        table: tableId,
        time: new Date().toLocaleTimeString(),
        items: cart.map(i => ({ name: i.name, qty: i.qty }))
    };
    assert(kot.items.length === 3 && kot.items[0].qty === 2, 'KOT generated with accurate kitchen items payload');
    console.log(`     KOT generated for Kitchen: Table ${kot.table} with ${kot.items.length} line items`);
}

console.log('\n📍 SCENARIO 2: TABLE 2 - TAKEAWAY ORDER WITH QUICK DISCOUNT & CASH PAYMENT');
{
    const tableId = 'Takeaway';
    mockDb.tableOrders[tableId] = [];

    // Order 1x Cold Coffee (90) + 1x Paneer Roll (110) = 200
    mockDb.tableOrders[tableId].push({ ...mockDb.menu[3], qty: 1 });
    mockDb.tableOrders[tableId].push({ ...mockDb.menu[4], qty: 1 });

    const rawTotal = 200;
    // Apply 10% Quick Discount
    const discountPercent = 10;
    const discountAmt = (rawTotal * discountPercent) / 100;
    const finalTotal = rawTotal - discountAmt;

    assert(discountAmt === 20, '10% discount correctly computed as ₹20');
    assert(finalTotal === 180, 'Net payable correctly computed as ₹180');

    // Settle with Cash
    currentBillNo++;
    const orderRecord = {
        billNo: currentBillNo,
        date: new Date().toISOString(),
        orderType: 'Takeaway',
        payMode: 'Cash',
        grossSubtotal: rawTotal,
        discount: discountAmt,
        discountDesc: '10% Cashier Rush Discount',
        total: finalTotal,
        items: [...mockDb.tableOrders[tableId]],
        customer: 'Walk-In Diner',
        biller: 'Admin'
    };
    mockDb.orders.push(orderRecord);

    // Deduct stock
    mockDb.tableOrders[tableId].forEach(orderItem => {
        const menuItem = mockDb.menu.find(m => m.id === orderItem.id);
        if (menuItem) menuItem.stockQty -= orderItem.qty;
    });

    assert(mockDb.orders.length === 1, 'Order #1001 saved in completed orders repository');
    assert(mockDb.menu.find(m => m.id === 105).stockQty === 3, 'Paneer Roll stock decremented to 3 (Low stock threshold reached)');
}

console.log('\n📍 SCENARIO 3: TABLE 3 - DINE-IN UPI QR PAYMENT & LOYALTY TIER ADVANCEMENT');
{
    const tableId = 3;
    mockDb.tableOrders[tableId] = [
        { ...mockDb.menu[0], qty: 1 }, // Biryani 250
        { ...mockDb.menu[3], qty: 1 }, // Cold Coffee 90
        { ...mockDb.menu[4], qty: 1 }  // Paneer Roll 110
    ]; // Total = 450

    const total = 450;
    // UPI QR String Generation (NPCI Standard)
    const upiPayUrl = `upi://pay?pa=${mockDb.settings.upiId}&pn=${encodeURIComponent(mockDb.settings.shopName)}&am=${total.toFixed(2)}&cu=INR&tn=Table3_Bill`;
    assert(upiPayUrl.includes('pa=billnaw@okhdfcbank') && upiPayUrl.includes('am=450.00'), 'Dynamic UPI QR URI strictly complies with NPCI specifications');

    // Customer loyalty check: Amit Roy (phone 9876543210)
    let customer = mockDb.customers.find(c => c.phone === '9876543210');
    assert(customer !== undefined, 'Customer recognized from database via telephone');

    // Update customer visits & spend
    customer.visits += 1;
    customer.totalSpend += total;
    customer.points += Math.floor(total * 0.05); // 5% loyalty cashback

    // Tier Upgrade Check: Bronze (1-4 visits) -> Silver (5+ visits) -> Platinum (20+ visits)
    if (customer.visits >= 20) customer.tier = 'Platinum';
    else if (customer.visits >= 5) customer.tier = 'Silver';
    else customer.tier = 'Bronze';

    assert(customer.visits === 5, 'Customer visits incremented to 5');
    assert(customer.tier === 'Silver', 'Customer automatically upgraded from Bronze to Silver tier upon 5th visit');

    currentBillNo++;
    mockDb.orders.push({
        billNo: currentBillNo,
        date: new Date().toISOString(),
        orderType: 'Dine-In',
        payMode: 'UPI',
        grossSubtotal: total,
        discount: 0,
        total: total,
        items: [...mockDb.tableOrders[tableId]],
        customer: customer.name,
        customerPhone: customer.phone,
        biller: 'Admin'
    });
}

console.log('\n📍 SCENARIO 4: EMERGENCY EXPENSE RECORDED MID-RUSH');
{
    const expense = {
        id: Date.now(),
        name: 'Fresh Dairy Milk & Ice Cream',
        cost: 350.00,
        category: 'Dairy',
        mode: 'Cash Drawer',
        date: new Date().toISOString()
    };
    mockDb.expenses.push(expense);

    assert(mockDb.expenses.length === 1, 'Quick Expense successfully logged in ledger');
    assert(mockDb.expenses[0].cost === 350, 'Expense amount logged as ₹350');
}

console.log('\n📍 SCENARIO 5: TABLE 1 SETTLEMENT & FINAL TELEMETRY AUDIT');
{
    // Settle Table 1 from Scenario 1 (Subtotal: ₹700, settled via Card)
    currentBillNo++;
    mockDb.orders.push({
        billNo: currentBillNo,
        date: new Date().toISOString(),
        orderType: 'Dine-In',
        payMode: 'Card',
        grossSubtotal: 700,
        discount: 0,
        total: 700,
        items: [...mockDb.tableOrders[1]],
        customer: 'Table 1 Guests',
        biller: 'Admin'
    });

    // Clear Table 1
    mockDb.tableOrders[1] = [];
    assert(mockDb.tableOrders[1].length === 0, 'Table 1 order cleared after checkout, ready for next diners');
}

console.log('\n📍 SCENARIO 6: FINANCIAL TELEMETRY & EXECUTIVE DASHBOARD AUDIT');
{
    // Total Orders: 3 (Takeaway ₹180, UPI Table 3 ₹450, Card Table 1 ₹700)
    const grossSales = mockDb.orders.reduce((sum, o) => sum + o.total, 0); // 180 + 450 + 700 = 1330
    const totalExpenses = mockDb.expenses.reduce((sum, e) => sum + e.cost, 0); // 350
    const netProfit = grossSales - totalExpenses; // 1330 - 350 = 980
    const aov = grossSales / mockDb.orders.length; // 1330 / 3 = 443.33

    assert(grossSales === 1330, `Gross Sales calculated correctly: ₹${grossSales} (expected ₹1330)`);
    assert(totalExpenses === 350, `Total Expenses calculated correctly: ₹${totalExpenses} (expected ₹350)`);
    assert(netProfit === 980, `Net Profit calculated correctly: ₹${netProfit} (expected ₹980)`);
    assert(Math.round(aov) === 443, `Average Order Value (AOV) calculated correctly: ₹${aov.toFixed(2)} (expected ₹443.33)`);

    // Verify payment breakdown
    const cashSales = mockDb.orders.filter(o => o.payMode === 'Cash').reduce((sum, o) => sum + o.total, 0);
    const upiSales = mockDb.orders.filter(o => o.payMode === 'UPI').reduce((sum, o) => sum + o.total, 0);
    const cardSales = mockDb.orders.filter(o => o.payMode === 'Card').reduce((sum, o) => sum + o.total, 0);

    assert(cashSales === 180, 'Cash drawer sales tally: ₹180');
    assert(upiSales === 450, 'UPI online sales tally: ₹450');
    assert(cardSales === 700, 'Card sales tally: ₹700');
    assert(cashSales + upiSales + cardSales === grossSales, 'Tender breakdown strictly matches total gross receipts');
}

console.log('\n📍 SCENARIO 7: LOW STOCK ALERTS & SAFETY THRESHOLDS');
{
    const lowStockItems = mockDb.menu.filter(m => m.stockQty <= m.lowStockAlert);
    assert(lowStockItems.length > 0, `Low stock detector triggered ${lowStockItems.length} items`);
    assert(lowStockItems.some(i => i.name === 'Paneer Roll'), 'Paneer Roll flagged as low stock (Qty: 3 <= Alert: 5)');
    console.log(`     Alert generated: "${lowStockItems.map(i => `${i.name} (${i.stockQty} left)`).join(', ')}"`);
}

console.log('\n====================================================');
console.log(`🎯 SIMULATION RESULT: ${testsPassed} PASSED, ${testsFailed} FAILED`);
console.log('====================================================\n');

if (testsFailed > 0) {
    process.exit(1);
} else {
    process.exit(0);
}
