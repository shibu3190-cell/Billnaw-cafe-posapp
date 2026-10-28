// ============================================================
// 📊 JS/DASHBOARD.JS - Analytics, Chart Engine, Expenses & Reports
// ============================================================

let currentDashboardRange = 'today';
let currentDashboardMetric = 'all';

function addExpense() {
    const nameEl = document.getElementById('quickExpenseNameInput') || document.getElementById('expenseName'); 
    const costEl = document.getElementById('quickExpenseCostInput') || document.getElementById('expenseCost'); 
    if (!nameEl || !costEl) {
        if (typeof openQuickExpenseModal === 'function') openQuickExpenseModal();
        return;
    }
    const name = nameEl.value ? nameEl.value.trim() : ''; 
    const cost = parseFloat(costEl.value); 
    if (name && !isNaN(cost) && cost > 0) { 
        const bName = (typeof currentStaff !== 'undefined' && currentStaff?.name) ? currentStaff.name : 'Admin';
        const bId = (typeof currentStaff !== 'undefined' && currentStaff?.id) ? currentStaff.id : 1;
        const bRole = (typeof currentStaff !== 'undefined' && currentStaff?.role) ? currentStaff.role : 'Admin';

        const newExpense = { 
            id: Date.now(), 
            date: new Date().toLocaleDateString(), 
            filterDate: (typeof getLocalISODate === 'function') ? getLocalISODate() : '', 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
            name: name, 
            cost: cost,
            biller: bName,
            billerId: bId,
            billerName: bName,
            billerRole: bRole
        };
        dailyExpenses.unshift(newExpense); 
        if (typeof pushToGoogleSheetsQueue === 'function') pushToGoogleSheetsQueue('addExpense', newExpense); 
        if (typeof persistExpensesFirebase === 'function') persistExpensesFirebase(newExpense); 
        if (typeof saveToLocal === 'function') saveToLocal(); 
        nameEl.value = ''; 
        costEl.value = ''; 
        renderExpensesUI(); 
        if (typeof renderDashboardAnalytics === 'function') renderDashboardAnalytics();
        showToast("Expense recorded."); 
    } else { 
        showToast("Please enter Item Name and Cost."); 
    }
}
window.addExpense = addExpense;

function editExpense(id) { 
    const exp = dailyExpenses.find(e => e.id === id); 
    if (!exp) return;
    const modal = document.getElementById('quickExpenseModal');
    if (modal) {
        const editId = document.getElementById('quickExpenseEditId');
        const nameInput = document.getElementById('quickExpenseNameInput') || document.getElementById('quickExpenseName');
        const costInput = document.getElementById('quickExpenseCostInput') || document.getElementById('quickExpenseCost');
        const title = document.getElementById('quickExpenseModalTitle');
        if (editId) editId.value = exp.id;
        if (nameInput) nameInput.value = exp.name || '';
        if (costInput) costInput.value = exp.cost || '';
        if (title) title.innerText = 'Edit Expense';
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => nameInput?.focus(), 50);
        return;
    }
    const nameEl = document.getElementById('expenseName');
    const costEl = document.getElementById('expenseCost');
    if (nameEl) nameEl.value = exp.name;
    if (costEl) costEl.value = exp.cost;
}
window.editExpense = editExpense;

function deleteExpense(id) { 
    if(confirm("Delete this expense?")) { 
        dailyExpenses = dailyExpenses.filter(e => e.id !== id); 
        persistExpensesFirebase(); 
        renderExpensesUI(); 
        showToast("Expense deleted."); 
    } 
}
window.deleteExpense = deleteExpense;

function renderExpensesUI() { 
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;
    tbody.innerHTML = dailyExpenses.map((exp, index) => {
        if(!exp.id) exp.id = Date.now() + index;
        return `<tr><td style="color: var(--text-muted);">${exp.time}</td><td style="font-weight: 600; color: var(--text-dark);">${escapeHtml(exp.name)}</td><td style="color: var(--danger); font-weight: 800;">-₹${exp.cost.toFixed(2)}</td><td><button class="btn btn-outline" style="padding: 6px 10px; font-size: 12px; margin-right: 5px;" onclick="editExpense(${exp.id})">Edit</button><button class="btn btn-danger" style="padding: 6px 10px; font-size: 12px;" onclick="deleteExpense(${exp.id})">Del</button></td></tr>`;
    }).join(''); 
}
window.renderExpensesUI = renderExpensesUI;

function openQuickExpenseModal() {
    const modal = document.getElementById('quickExpenseModal');
    if (modal) {
        const editId = document.getElementById('quickExpenseEditId');
        if (editId) editId.value = '';
        const title = document.getElementById('quickExpenseModalTitle');
        if (title) title.innerText = 'Record Expense';
        const n = document.getElementById('quickExpenseNameInput') || document.getElementById('quickExpenseName');
        const c = document.getElementById('quickExpenseCostInput') || document.getElementById('quickExpenseCost');
        if (n) n.value = '';
        if (c) c.value = '';
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        setTimeout(() => n?.focus(), 50);
    }
}
window.openQuickExpenseModal = openQuickExpenseModal;

function closeQuickExpenseModal() {
    const modal = document.getElementById('quickExpenseModal');
    if (modal) {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
    const editId = document.getElementById('quickExpenseEditId');
    if (editId) editId.value = '';
    const title = document.getElementById('quickExpenseModalTitle');
    if (title) title.innerText = 'Record Expense';
}
window.closeQuickExpenseModal = closeQuickExpenseModal;

function saveQuickExpense() {
    const editIdEl = document.getElementById('quickExpenseEditId');
    const editId = editIdEl && editIdEl.value ? parseInt(editIdEl.value, 10) : null;
    const name = (document.getElementById('quickExpenseNameInput') || document.getElementById('quickExpenseName'))?.value.trim();
    const cost = parseFloat((document.getElementById('quickExpenseCostInput') || document.getElementById('quickExpenseCost'))?.value);
    if (!name || isNaN(cost) || cost <= 0) {
        return showToast("Please enter a valid item name and amount.");
    }
    if (editId) {
        const exp = dailyExpenses.find(e => e.id === editId);
        if (exp) {
            exp.name = name;
            exp.cost = cost;
        }
        if (editIdEl) editIdEl.value = '';
        showToast("Expense updated.");
    } else {
        const newExpense = {
            id: Date.now(),
            date: new Date().toLocaleDateString(),
            filterDate: (typeof getLocalISODate === 'function') ? getLocalISODate() : '',
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            name: name,
            cost: cost
        };
        dailyExpenses.unshift(newExpense);
        if (typeof pushToGoogleSheetsQueue === 'function') pushToGoogleSheetsQueue('addExpense', newExpense);
        if (typeof persistExpensesFirebase === 'function') persistExpensesFirebase(newExpense);
        showToast(`Recorded expense: ${name} (₹${cost.toFixed(2)})`);
    }
    if (typeof saveToLocal === 'function') saveToLocal();
    renderExpensesUI();
    renderDashboardAnalytics();
    closeQuickExpenseModal();
    const totEl = document.getElementById('expensesModalTotal');
    if (totEl && Array.isArray(dailyExpenses)) {
        const todayISO = (typeof getLocalISODate === 'function') ? getLocalISODate() : '';
        const todayExp = dailyExpenses.filter(e => e.filterDate === todayISO || (e.date && e.date.startsWith(new Date().toLocaleDateString())));
        const sum = todayExp.reduce((s, e) => s + (Number(e.cost) || 0), 0);
        totEl.innerText = `Today's Total: ₹${sum.toFixed(2)}`;
    }
}
window.saveQuickExpense = saveQuickExpense;

function openInteractiveCustomDatePicker() {
    const modal = document.getElementById('reportCustomDatePickerModal');
    if (!modal) return;
    const today = getLocalISODate();
    const startInput = document.getElementById('calendarPickerStartDate');
    const endInput = document.getElementById('calendarPickerEndDate');
    const customStart = document.getElementById('reportCustomStartDate')?.value;
    const customEnd = document.getElementById('reportCustomEndDate')?.value;
    if (startInput) startInput.value = customStart || today;
    if (endInput) endInput.value = customEnd || today;
    modal.style.display = 'flex';
}
window.openInteractiveCustomDatePicker = openInteractiveCustomDatePicker;

function closeInteractiveCustomDatePicker() {
    const modal = document.getElementById('reportCustomDatePickerModal');
    if (modal) modal.style.display = 'none';
}
window.closeInteractiveCustomDatePicker = closeInteractiveCustomDatePicker;

function setCustomCalendarPreset(preset) {
    const startInput = document.getElementById('calendarPickerStartDate');
    const endInput = document.getElementById('calendarPickerEndDate');
    if (!startInput || !endInput) return;
    const now = new Date();
    const todayISO = getLocalISODate(now);
    endInput.value = todayISO;

    if (preset === '7days') {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        startInput.value = getLocalISODate(d);
    } else if (preset === '30days') {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        startInput.value = getLocalISODate(d);
    } else if (preset === 'thisMonth') {
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        startInput.value = `${y}-${m}-01`;
    } else if (preset === 'lastMonth') {
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const y = lastMonthDate.getFullYear();
        const m = String(lastMonthDate.getMonth() + 1).padStart(2, '0');
        const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
        startInput.value = `${y}-${m}-01`;
        endInput.value = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }
}
window.setCustomCalendarPreset = setCustomCalendarPreset;

function applyInteractiveCustomDateRange() {
    const startVal = document.getElementById('calendarPickerStartDate')?.value;
    const endVal = document.getElementById('calendarPickerEndDate')?.value;
    const repStart = document.getElementById('reportCustomStartDate');
    const repEnd = document.getElementById('reportCustomEndDate');
    if (repStart) repStart.value = startVal || '';
    if (repEnd) repEnd.value = endVal || '';
    closeInteractiveCustomDatePicker();
    setDashboardDateRange('custom', true);
}
window.applyInteractiveCustomDateRange = applyInteractiveCustomDateRange;

function setDashboardDateRange(range, fromCalendar = false) {
    currentDashboardRange = range;
    ['today', 'yesterday', 'week', 'month', 'all', 'custom'].forEach(r => {
        const btn = document.getElementById(`fRange-${r}`);
        if (btn) {
            if (r === range) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    const customWrap = document.getElementById('reportCustomDateWrap');
    if (customWrap) {
        customWrap.style.display = (range === 'custom') ? 'inline-flex' : 'none';
    }
    if (range === 'custom' && !fromCalendar) {
        const customStart = document.getElementById('reportCustomStartDate')?.value;
        const customEnd = document.getElementById('reportCustomEndDate')?.value;
        if (!customStart && !customEnd) {
            openInteractiveCustomDatePicker();
            return;
        }
    }
    renderDashboardAnalytics();
}
window.setDashboardDateRange = setDashboardDateRange;

function applyCustomDashboardDateRange() {
    currentDashboardRange = 'custom';
    renderDashboardAnalytics();
}
window.applyCustomDashboardDateRange = applyCustomDashboardDateRange;

function filterDashboardByMetric(metric) {
    if (metric === 'expenses') {
        openExpensesDetailModal();
        return;
    }
    currentDashboardMetric = (currentDashboardMetric === metric) ? 'all' : metric;
    
    const kpiCards = document.querySelectorAll('.dashboard-kpi-card');
    kpiCards.forEach(card => card.classList.remove('kpi-selected'));
    
    if (currentDashboardMetric !== 'all') {
        const targetCard = document.getElementById(`kpiCard-${currentDashboardMetric}`);
        if (targetCard) targetCard.classList.add('kpi-selected');
    }
    
    renderDashboardAnalytics();
}
window.filterDashboardByMetric = filterDashboardByMetric;

function onDashboardMonthChanged() {
    currentDashboardRange = 'month';
    ['today', 'yesterday', 'week', 'all', 'custom'].forEach(r => {
        const btn = document.getElementById(`fRange-${r}`);
        if (btn) btn.classList.remove('active');
    });
    const mBtn = document.getElementById('fRange-month');
    if (mBtn) mBtn.classList.add('active');
    const customWrap = document.getElementById('reportCustomDateWrap');
    if (customWrap) customWrap.style.display = 'none';
    renderDashboardAnalytics();
}
window.onDashboardMonthChanged = onDashboardMonthChanged;

async function renderDashboardAnalytics() {
    const todayISO = getLocalISODate();
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yesterdayISO = getLocalISODate(d);
    
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = getLocalISODate(weekAgo);
    
    const selectedMonth = document.getElementById('reportDateSelect')?.value || getLocalISOMonth();
    const customStart = document.getElementById('reportCustomStartDate')?.value || '';
    const customEnd = document.getElementById('reportCustomEndDate')?.value || '';
    
    // 1. Date Range Filtering
    let filteredOrders = orderHistory.filter(o => {
        const fDate = o.filterDate || (o.date ? o.date.split(',')[0].trim() : '');
        if (currentDashboardRange === 'today') return fDate === todayISO;
        if (currentDashboardRange === 'yesterday') return fDate === yesterdayISO;
        if (currentDashboardRange === 'week') return fDate >= weekAgoISO && fDate <= todayISO;
        if (currentDashboardRange === 'month') return fDate.startsWith(selectedMonth);
        if (currentDashboardRange === 'custom') {
            if (customStart && customEnd) return fDate >= customStart && fDate <= customEnd;
            if (customStart) return fDate >= customStart;
            if (customEnd) return fDate <= customEnd;
            return true;
        }
        return true;
    });

    let filteredExpenses = dailyExpenses.filter(e => {
        const fDate = e.filterDate || (e.date ? e.date.split(',')[0].trim() : '');
        if (currentDashboardRange === 'today') return fDate === todayISO;
        if (currentDashboardRange === 'yesterday') return fDate === yesterdayISO;
        if (currentDashboardRange === 'week') return fDate >= weekAgoISO && fDate <= todayISO;
        if (currentDashboardRange === 'month') return fDate.startsWith(selectedMonth);
        if (currentDashboardRange === 'custom') {
            if (customStart && customEnd) return fDate >= customStart && fDate <= customEnd;
            if (customStart) return fDate >= customStart;
            if (customEnd) return fDate <= customEnd;
            return true;
        }
        return true;
    });

    // 2. Compute Aggregates
    const totalSales = filteredOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
    const netProfit = totalSales - totalExpenses;
    const orderCount = filteredOrders.length;
    const avgOrderVal = orderCount > 0 ? (totalSales / orderCount) : 0;
    const profitMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;

    // 3. Update KPI Card DOM
    const kpiSalesEl = document.getElementById('kpiGrossSales');
    const kpiExpEl = document.getElementById('kpiTotalExpenses');
    const kpiProfitEl = document.getElementById('kpiNetProfit');
    const kpiOrdersEl = document.getElementById('kpiTotalOrders');
    const kpiAvgEl = document.getElementById('kpiAvgOrderValue');
    
    if (kpiSalesEl) kpiSalesEl.innerText = `₹${totalSales.toFixed(2)}`;
    if (kpiExpEl) kpiExpEl.innerText = `₹${totalExpenses.toFixed(2)}`;
    if (kpiProfitEl) {
        kpiProfitEl.innerText = `₹${netProfit.toFixed(2)}`;
        kpiProfitEl.style.color = (netProfit < 0) ? 'var(--danger)' : 'var(--success)';
    }
    if (kpiOrdersEl) kpiOrdersEl.innerText = orderCount;
    if (kpiAvgEl) kpiAvgEl.innerText = `₹${avgOrderVal.toFixed(2)}`;

    const kpiGrossSub = document.getElementById('kpiGrossSub');
    if (kpiGrossSub) kpiGrossSub.innerText = `From ${orderCount} transactions`;

    const kpiExpenseSub = document.getElementById('kpiExpenseSub');
    if (kpiExpenseSub) kpiExpenseSub.innerText = `${filteredExpenses.length} expense entries`;

    const kpiProfitSub = document.getElementById('kpiProfitSub');
    if (kpiProfitSub) kpiProfitSub.innerText = `${profitMargin}% operating margin`;

    const kpiOrdersSub = document.getElementById('kpiOrdersSub');
    if (kpiOrdersSub) kpiOrdersSub.innerText = `Avg ticket ₹${avgOrderVal.toFixed(0)}`;

    if (document.getElementById('statSales')) document.getElementById('statSales').innerText = `₹${totalSales.toFixed(2)}`;
    if (document.getElementById('statExpenses')) document.getElementById('statExpenses').innerText = `₹${totalExpenses.toFixed(2)}`;
    if (document.getElementById('statProfit')) document.getElementById('statProfit').innerText = `₹${netProfit.toFixed(2)}`;

    // 4. Secondary Filters
    const payModeFilter = document.getElementById('dashPayModeFilter')?.value || 'all';
    const orderTypeFilter = document.getElementById('dashOrderTypeFilter')?.value || 'all';
    const searchKeyword = (document.getElementById('dashSearchInput')?.value || '').trim().toLowerCase();

    let displayOrders = filteredOrders.filter(o => {
        if (payModeFilter !== 'all' && (o.paymentMode || 'Cash').toLowerCase() !== payModeFilter.toLowerCase()) return false;
        if (orderTypeFilter !== 'all' && (o.orderType || 'Dine-In').toLowerCase() !== orderTypeFilter.toLowerCase()) return false;
        if (searchKeyword) {
            const billStr = String(o.billNo || '');
            const custStr = (o.customer || '').toLowerCase();
            const itemsStr = (o.items || '').toLowerCase();
            const tableStr = String(o.table || '').toLowerCase();
            if (!billStr.includes(searchKeyword) && !custStr.includes(searchKeyword) && !itemsStr.includes(searchKeyword) && !tableStr.includes(searchKeyword)) {
                return false;
            }
        }
        return true;
    });

    const subtitleEl = document.getElementById('dashLogCountSubtitle');
    if (subtitleEl) subtitleEl.innerText = `Showing ${displayOrders.length} of ${orderCount} recorded sales`;

    // 5. Render History Table Body
    const tbody = document.getElementById('historyTableBody');
    if (tbody) {
        if (displayOrders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px; font-weight: 500;">No transactions found matching the selected range and filters.</td></tr>`;
        } else {
            tbody.innerHTML = displayOrders.map(order => {
                let tableStr = String(order.table || 'Takeaway');
                let badgeClass = tableStr === 'Takeaway' ? 'table-pill-takeaway' : 'table-pill-dinein';
                let isTakeaway = tableStr === 'Takeaway';
                let tableIconSvg = isTakeaway
                    ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -1px;"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`
                    : `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: -1px;"><path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3"/><path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v5Z"/><path d="M5 18v3"/><path d="M19 18v3"/></svg>`;
                let tableDisplayText = isTakeaway ? 'Takeaway' : (tableStr.startsWith('Table') ? tableStr : `Table ${tableStr}`);
                let tableLabel = `${tableIconSvg}<span>${tableDisplayText}</span>`;
                
                let payBadgeClass = 'pay-badge-cash';
                if ((order.paymentMode || '').toLowerCase() === 'upi') payBadgeClass = 'pay-badge-upi';
                if ((order.paymentMode || '').toLowerCase() === 'card') payBadgeClass = 'pay-badge-card';

                let custHtml = `<span style="display: inline-flex; align-items: center; gap: 4px; color: var(--text-muted); font-size: 12px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.7;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>Walk-in</span>`;
                if (order.customer) {
                    custHtml = `<span style="display: inline-flex; align-items: center; gap: 4px; font-weight: 600; color: var(--text-dark); font-size: 13px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-muted);"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${escapeHtml(order.customer)}</span>`;
                }

                const timeStr = order.date.includes(',') ? order.date.split(',')[1].trim() : order.date;

                const discountBadge = (order.discountAmount && Number(order.discountAmount) > 0)
                    ? `<span style="display:inline-block; font-size:10px; font-weight:700; color:var(--success); background:rgba(30,138,76,0.12); padding:2px 6px; border-radius:6px; margin-top:2px;">-${order.discount?.type === 'percent' ? order.discount.value + '%' : '₹' + order.discountAmount}</span>`
                    : '';

                return `
                    <tr class="compact-ledger-row" onclick="openTransactionActionSheet(${order.id})" style="cursor: pointer;" title="Tap to view bill actions">
                        <td class="ledger-date" style="text-align: center; font-size: 12px; color: var(--text-muted); white-space: nowrap;">${timeStr}</td>
                        <td><strong style="color: var(--primary); font-size: 14px; font-family: monospace;">#${order.billNo || '-'}</strong></td>
                        <td><span class="custom-pill ${badgeClass}" style="display: inline-flex; align-items: center;">${tableLabel}</span></td>
                        <td>${custHtml}</td>
                        <td style="font-size: 12px; max-width: 200px; color: var(--text-dark); white-space: normal;">${escapeHtml(order.items || '-')}</td>
                        <td><span class="custom-pill ${payBadgeClass}">${order.paymentMode || 'Cash'}</span></td>
                        <td class="ledger-amount" style="font-weight: 800; color: var(--success); font-size: 14px; text-align: right; font-variant-numeric: tabular-nums;">
                            <div>₹${Number(order.amount).toFixed(2)}</div>
                            ${discountBadge}
                        </td>
                        <td class="ledger-actions" style="text-align: center; white-space: nowrap; position: relative;" onclick="event.stopPropagation();">
                            <div class="action-dropdown">
                                <button type="button" class="action-dropdown-btn" onclick="toggleActionDropdown(event, ${order.id})" title="Actions" aria-label="Order actions">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
                                </button>
                                <div class="action-dropdown-menu" id="actionDropdown-${order.id}">
                                    <button type="button" class="action-dropdown-item" onclick="closeAllActionDropdowns(); viewOrderInvoiceModal(${order.id});">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                        <span>View Bill</span>
                                    </button>
                                    <button type="button" class="action-dropdown-item" onclick="closeAllActionDropdowns(); openEditOrderModal(${order.id});">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                        <span>Edit Order</span>
                                    </button>
                                    <button type="button" class="action-dropdown-item" onclick="closeAllActionDropdowns(); reprintReceipt(${order.id});">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                        <span>Print Receipt</span>
                                    </button>
                                    <button type="button" class="action-dropdown-item danger" onclick="closeAllActionDropdowns(); voidTransaction(${order.id});">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                        <span>Void Order</span>
                                    </button>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 6. Top Selling Items
    const topListEl = document.getElementById('dashTopSellingList');
    if (topListEl) {
        let itemFrequency = {};
        filteredOrders.forEach(o => {
            if (Array.isArray(o.rawItems)) {
                o.rawItems.forEach(i => {
                    if (!itemFrequency[i.name]) itemFrequency[i.name] = { qty: 0, revenue: 0 };
                    itemFrequency[i.name].qty += (Number(i.qty) || 1);
                    itemFrequency[i.name].revenue += ((Number(i.price) || 0) * (Number(i.qty) || 1));
                });
            } else if (o.items) {
                const parts = o.items.split(',');
                parts.forEach(p => {
                    const match = p.match(/(.+?)\s*\(x(\d+)\)/);
                    if (match) {
                        const name = match[1].trim();
                        const qty = parseInt(match[2]);
                        if (!itemFrequency[name]) itemFrequency[name] = { qty: 0, revenue: 0 };
                        itemFrequency[name].qty += qty;
                    }
                });
            }
        });

        const sortedItems = Object.entries(itemFrequency).sort((a, b) => b[1].qty - a[1].qty).slice(0, 5);

        if (sortedItems.length === 0) {
            topListEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 15px;">No item data recorded in this period.</div>`;
        } else {
            const rankEmojis = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
            topListEl.innerHTML = sortedItems.map(([name, data], idx) => {
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px dashed var(--border-color); font-size: 13px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span>${rankEmojis[idx]}</span>
                            <span style="font-weight: 600; color: var(--text-dark);">${escapeHtml(name)}</span>
                        </div>
                        <div style="text-align: right;">
                            <span style="font-weight: 700; color: var(--primary);">${data.qty} sold</span>
                            ${data.revenue > 0 ? `<span style="font-size: 11px; color: var(--text-muted); margin-left: 6px;">(₹${data.revenue.toFixed(0)})</span>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 7. Render Interactive Sales Chart & Vertical Progress Meters
    renderVerticalProgressMeters(filteredOrders);
    await renderDashboardChart(filteredOrders, filteredExpenses, selectedMonth);
}
window.renderDashboardAnalytics = renderDashboardAnalytics;

async function renderDashboardChart(orders, expenses, selectedMonth) {
    const ctx = document.getElementById('monthlySalesChart');
    if (!ctx) return;

    if (!window.Chart && typeof loadLazyScript === 'function') {
        try {
            await loadLazyScript('https://cdn.jsdelivr.net/npm/chart.js');
        } catch (e) {
            console.warn("Could not lazy-load Chart.js:", e);
            return;
        }
    }
    if (!window.Chart) return;

    let labels = [];
    let salesData = [];
    let expenseData = [];

    if (currentDashboardRange === 'today' || currentDashboardRange === 'yesterday') {
        for (let h = 8; h <= 23; h++) {
            const hourLabel = `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`;
            labels.push(hourLabel);
            
            const salesHour = orders.filter(o => {
                const timeMatch = o.date.match(/(\d+):(\d+):?(\d+)?\s*(AM|PM)?/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[4];
                    if (ampm && ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
                    if (ampm && ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
                    return hour === h;
                }
                return false;
            }).reduce((sum, o) => sum + (Number(o.amount) || 0), 0);

            salesData.push(salesHour);
            expenseData.push(0);
        }
    } else if (currentDashboardRange === 'week') {
        for (let i = 6; i >= 0; i--) {
            const dt = new Date();
            dt.setDate(dt.getDate() - i);
            const iso = getLocalISODate(dt);
            const dayLabel = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
            labels.push(dayLabel);
            
            const dSales = orders.filter(o => o.filterDate === iso).reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
            const dExp = expenses.filter(e => e.filterDate === iso).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
            salesData.push(dSales);
            expenseData.push(dExp);
        }
    } else {
        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);
        const daysInMonth = new Date(year, month, 0).getDate();

        for (let i = 1; i <= daysInMonth; i++) {
            const dayStr = String(i).padStart(2, '0');
            const targetDate = `${selectedMonth}-${dayStr}`;
            labels.push(dayStr);
            
            const dSales = orders.filter(o => o.filterDate === targetDate).reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
            const dExp = expenses.filter(e => e.filterDate === targetDate).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
            salesData.push(dSales);
            expenseData.push(dExp);
        }
    }

    if (monthlyChartInstance) {
        monthlyChartInstance.destroy();
    }

    monthlyChartInstance = new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Revenue (₹)',
                    data: salesData,
                    backgroundColor: 'rgba(58, 125, 68, 0.85)',
                    borderColor: '#3A7D44',
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: 'Expenses (₹)',
                    data: expenseData,
                    backgroundColor: 'rgba(181, 59, 59, 0.85)',
                    borderColor: '#B53B3B',
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(0, 0, 0, 0.05)' },
                    ticks: { callback: val => `₹${val}` }
                },
                x: {
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11, weight: 'bold' } } },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toFixed(2)}`
                    }
                }
            }
        }
    });

    // Render interactive Donut chart alongside bar timeline
    await renderDonutChart(orders, expenses);
}
window.renderDashboardChart = renderDashboardChart;

let donutChartInstance = null;
let currentDonutDataset = 'margin'; // 'margin' | 'category' | 'payment' | 'channel'
let lastDonutOrders = [];
let lastDonutExpenses = [];

function getCategoryForDishName(dishName) {
    if (!dishName) return 'General';
    if (typeof menu !== 'undefined' && Array.isArray(menu)) {
        const found = menu.find(m => m.name && m.name.toLowerCase() === dishName.toLowerCase());
        if (found && found.category) return found.category;
    }
    const lower = dishName.toLowerCase();
    if (lower.includes('chai') || lower.includes('tea') || lower.includes('coffee') || lower.includes('shake') || lower.includes('juice') || lower.includes('drink')) return 'Beverages';
    if (lower.includes('samosa') || lower.includes('roll') || lower.includes('sandwich') || lower.includes('burger') || lower.includes('fries') || lower.includes('snack')) return 'Snacks';
    if (lower.includes('biryani') || lower.includes('rice') || lower.includes('thali') || lower.includes('curry') || lower.includes('meal')) return 'Mains';
    if (lower.includes('cake') || lower.includes('brownie') || lower.includes('pastry') || lower.includes('sweet') || lower.includes('dessert')) return 'Desserts';
    return 'Specialties';
}

async function renderDonutChart(orders, expenses) {
    if (orders) lastDonutOrders = orders;
    if (expenses) lastDonutExpenses = expenses;

    const canvas = document.getElementById('dashDonutChart') || document.getElementById('revenueDistributionDonut');
    if (!canvas) return;

    if (!window.Chart && typeof loadLazyScript === 'function') {
        try {
            await loadLazyScript('https://cdn.jsdelivr.net/npm/chart.js');
        } catch (e) {
            console.warn("Could not lazy-load Chart.js for Donut:", e);
            return;
        }
    }
    if (!window.Chart) return;

    let labels = [];
    let datasetData = [];
    let backgroundColors = [];
    let isCurrency = true;

    if (currentDonutDataset === 'margin') {
        const totalSales = (lastDonutOrders || []).reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
        const totalExp = (lastDonutExpenses || []).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
        const netProfit = Math.max(0, totalSales - totalExp);

        if (totalSales === 0 && totalExp === 0) {
            labels = ['No Financial Data'];
            datasetData = [1];
            backgroundColors = ['#E2E8F0'];
            isCurrency = false;
        } else {
            labels = ['Net Margin (Profit)', 'Operating Expenses'];
            datasetData = [netProfit, totalExp];
            backgroundColors = ['#143832', '#B53B3B'];
        }
    } else if (currentDonutDataset === 'category') {
        const catMap = {};
        (lastDonutOrders || []).forEach(o => {
            if (Array.isArray(o.rawItems)) {
                o.rawItems.forEach(i => {
                    const cat = i.category || getCategoryForDishName(i.name) || 'General Menu';
                    const rev = (Number(i.price) || 0) * (Number(i.qty) || 1);
                    catMap[cat] = (catMap[cat] || 0) + rev;
                });
            } else if (o.items) {
                const parts = o.items.split(',');
                parts.forEach(p => {
                    const match = p.match(/(.+?)\s*\(x(\d+)\)/);
                    if (match) {
                        const name = match[1].trim();
                        const cat = getCategoryForDishName(name) || 'General Menu';
                        const qty = parseInt(match[2]) || 1;
                        catMap[cat] = (catMap[cat] || 0) + (qty * 50);
                    }
                });
            }
        });

        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        if (sortedCats.length === 0) {
            labels = ['No Category Sales'];
            datasetData = [1];
            backgroundColors = ['#E2E8F0'];
            isCurrency = false;
        } else {
            labels = sortedCats.map(c => c[0]);
            datasetData = sortedCats.map(c => c[1]);
            const palette = ['#143832', '#2D6A4F', '#52796F', '#E76F51', '#F4A261', '#2A9D8F', '#457B9D', '#1D3557'];
            backgroundColors = labels.map((_, i) => palette[i % palette.length]);
        }
    } else if (currentDonutDataset === 'payment') {
        const payMap = { 'Cash': 0, 'UPI': 0, 'Card': 0 };
        (lastDonutOrders || []).forEach(o => {
            const mode = (o.paymentMode || 'Cash').trim();
            const normalized = mode.toUpperCase() === 'UPI' ? 'UPI' : (mode.toUpperCase() === 'CARD' ? 'Card' : 'Cash');
            payMap[normalized] = (payMap[normalized] || 0) + (Number(o.amount) || 0);
        });

        labels = ['Cash', 'UPI', 'Card'];
        datasetData = [payMap['Cash'], payMap['UPI'], payMap['Card']];
        backgroundColors = ['#2D6A4F', '#4361EE', '#F77F00'];
        if (datasetData.every(v => v === 0)) {
            labels = ['No Payment Data'];
            datasetData = [1];
            backgroundColors = ['#E2E8F0'];
            isCurrency = false;
        }
    } else if (currentDonutDataset === 'channel') {
        const typeMap = { 'Dine-In': 0, 'Takeaway': 0 };
        (lastDonutOrders || []).forEach(o => {
            const isTakeaway = (o.orderType && o.orderType.toLowerCase() === 'takeaway') || (o.table === 'Takeaway');
            const key = isTakeaway ? 'Takeaway' : 'Dine-In';
            typeMap[key] = (typeMap[key] || 0) + (Number(o.amount) || 0);
        });

        labels = ['Dine-In', 'Takeaway'];
        datasetData = [typeMap['Dine-In'], typeMap['Takeaway']];
        backgroundColors = ['#143832', '#E76F51'];
        if (datasetData.every(v => v === 0)) {
            labels = ['No Channel Data'];
            datasetData = [1];
            backgroundColors = ['#E2E8F0'];
            isCurrency = false;
        }
    }

    if (donutChartInstance) {
        donutChartInstance.destroy();
        donutChartInstance = null;
    }

    donutChartInstance = new Chart(canvas.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: datasetData,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '65%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 10,
                        padding: 8,
                        font: { size: 11, weight: 'bold' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (!isCurrency) return ` ${ctx.label}`;
                            return ` ${ctx.label}: ₹${Number(ctx.raw).toFixed(2)}`;
                        }
                    }
                }
            }
        }
    });

    // Update Central Donut Total and Percentage in hole (Decision 2)
    const centerValEl = document.getElementById('donutCenterValue');
    const centerLabelEl = document.getElementById('donutCenterLabel');
    const centerSubEl = document.getElementById('donutCenterSub');

    if (centerValEl && centerLabelEl) {
        if (currentDonutDataset === 'margin') {
            const totalRev = (lastDonutOrders || []).reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
            const totalExp = (lastDonutExpenses || []).reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
            const netProfit = Math.max(0, totalRev - totalExp);
            const marginPct = totalRev > 0 ? Math.round((netProfit / totalRev) * 100) : 0;
            centerLabelEl.innerText = "Net Margin";
            centerValEl.innerText = `₹${Math.round(netProfit).toLocaleString('en-IN')}`;
            if (centerSubEl) centerSubEl.innerText = `${marginPct}% Margin`;
        } else if (currentDonutDataset === 'category') {
            const catSum = isCurrency ? datasetData.reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
            centerLabelEl.innerText = "Category Total";
            centerValEl.innerText = `₹${Math.round(catSum).toLocaleString('en-IN')}`;
            const topPct = (isCurrency && catSum > 0) ? Math.round(((datasetData[0] || 0) / catSum) * 100) : 0;
            if (centerSubEl) centerSubEl.innerText = `${topPct}% Top Share`;
        } else if (currentDonutDataset === 'payment') {
            const paySum = isCurrency ? datasetData.reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
            centerLabelEl.innerText = "Settled Total";
            centerValEl.innerText = `₹${Math.round(paySum).toLocaleString('en-IN')}`;
            const cashVal = isCurrency ? (Number(datasetData[0]) || 0) : 0;
            const cashPct = (isCurrency && paySum > 0) ? Math.round((cashVal / paySum) * 100) : 0;
            if (centerSubEl) centerSubEl.innerText = `${cashPct}% Cash`;
        } else if (currentDonutDataset === 'channel') {
            const chanSum = isCurrency ? datasetData.reduce((sum, v) => sum + (Number(v) || 0), 0) : 0;
            centerLabelEl.innerText = "Orders Volume";
            centerValEl.innerText = `₹${Math.round(chanSum).toLocaleString('en-IN')}`;
            const dineInVal = isCurrency ? (Number(datasetData[0]) || 0) : 0;
            const dineInPct = (isCurrency && chanSum > 0) ? Math.round((dineInVal / chanSum) * 100) : 0;
            if (centerSubEl) centerSubEl.innerText = `${dineInPct}% Dine-In`;
        }
    }
}
window.renderDonutChart = renderDonutChart;
window.renderDashboardDonut = renderDonutChart;

function toggleDonutDataset(datasetType) {
    currentDonutDataset = datasetType || 'margin';
    document.querySelectorAll('.donut-pill').forEach(btn => {
        if (btn.getAttribute('data-donut') === currentDonutDataset) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    renderDonutChart(lastDonutOrders, lastDonutExpenses);
}
window.toggleDonutDataset = toggleDonutDataset;

function renderStatements() {
    renderDashboardAnalytics();
}
window.renderStatements = renderStatements;

function exportFilteredSalesCSV() {
    if (orderHistory.length === 0) return showToast("No sales data available to export.");

    const todayISO = getLocalISODate();
    const d = new Date(); d.setDate(d.getDate() - 1);
    const yesterdayISO = getLocalISODate(d);
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoISO = getLocalISODate(weekAgo);
    const selectedMonth = document.getElementById('reportDateSelect')?.value || getLocalISOMonth();

    let exportSet = orderHistory.filter(o => {
        const fDate = o.filterDate || (o.date ? o.date.split(',')[0].trim() : '');
        if (currentDashboardRange === 'today') return fDate === todayISO;
        if (currentDashboardRange === 'yesterday') return fDate === yesterdayISO;
        if (currentDashboardRange === 'week') return fDate >= weekAgoISO && fDate <= todayISO;
        if (currentDashboardRange === 'month') return fDate.startsWith(selectedMonth);
        return true;
    });

    if (exportSet.length === 0) return showToast("No transactions found in this period to download.");

    let csv = "Invoice No,Date & Time,Table / Type,Order Type,Payment Mode,Customer Name,Biller / Staff,Subtotal (INR),GST Tax (INR),Total Amount (INR),Items Summary\n";

    exportSet.forEach(o => {
        const itemsClean = `"${(o.items || '').replace(/"/g, '""')}"`;
        const custClean = `"${(o.customer || 'Walk-in').replace(/"/g, '""')}"`;
        const billerClean = `"${(o.biller || 'Staff').replace(/"/g, '""')}"`;
        const tableClean = `"${(o.table || 'Takeaway').replace(/"/g, '""')}"`;

        csv += `"${o.billNo || ''}","${o.date}","${tableClean}","${o.orderType || 'Dine-In'}","${o.paymentMode || 'Cash'}",${custClean},${billerClean},${(o.subtotal || o.amount).toFixed(2)},${(o.tax || 0).toFixed(2)},${o.amount.toFixed(2)},${itemsClean}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `RoyalCafe_Sales_${currentDashboardRange}_${getLocalISODate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("📥 Sales report downloaded!");
}
window.exportFilteredSalesCSV = exportFilteredSalesCSV;

function exportExpensesCSV() {
    if (dailyExpenses.length === 0) return showToast("No expenses recorded yet.");

    let csv = "Date,Time,Expense / Vendor Name,Category,Payment Mode,Cost (INR)\n";
    dailyExpenses.forEach(e => {
        const nameClean = `"${(e.name || '').replace(/"/g, '""')}"`;
        csv += `"${e.date}","${e.time || ''}",${nameClean},"${e.category || 'Supplies'}","${e.paymentMode || 'Cash'}",${e.cost.toFixed(2)}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `RoyalCafe_Expenses_${getLocalISODate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("📥 Expenses log downloaded!");
}
window.exportExpensesCSV = exportExpensesCSV;

function printDailyZReport() {
    const todayISO = getLocalISODate();
    const todayOrders = orderHistory.filter(o => (o.filterDate === todayISO || (o.date && o.date.startsWith(new Date().toLocaleDateString()))));
    const todayExpenses = dailyExpenses.filter(e => (e.filterDate === todayISO || (e.date && e.date.startsWith(new Date().toLocaleDateString()))));

    const totalGross = todayOrders.reduce((sum, o) => sum + o.amount, 0);
    const totalExp = todayExpenses.reduce((sum, e) => sum + e.cost, 0);
    const totalTax = todayOrders.reduce((sum, o) => sum + (o.tax || 0), 0);

    const cashSales = todayOrders.filter(o => (o.paymentMode || 'Cash').toLowerCase() === 'cash').reduce((sum, o) => sum + o.amount, 0);
    const upiSales = todayOrders.filter(o => (o.paymentMode || '').toLowerCase() === 'upi').reduce((sum, o) => sum + o.amount, 0);
    const cardSales = todayOrders.filter(o => (o.paymentMode || '').toLowerCase() === 'card').reduce((sum, o) => sum + o.amount, 0);

    const dineInCount = todayOrders.filter(o => (o.orderType || 'Dine-In') === 'Dine-In').length;
    const takeawayCount = todayOrders.filter(o => (o.orderType || '') === 'Takeaway').length;

    const netCashInDrawer = cashSales - totalExp;

    const zReportHtml = `
        <div style="text-align: center; font-family: monospace; font-size: 13px; line-height: 1.4; padding: 15px; width: 300px; margin: 0 auto;">
            <div style="font-size: 16px; font-weight: bold;">${shopProfile.name || 'Royal Cafe'}</div>
            <div style="font-size: 11px;">DAILY CLOSE (Z-REPORT)</div>
            <div>Date: ${new Date().toLocaleDateString()} | ${new Date().toLocaleTimeString()}</div>
            <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
            
            <div style="display: flex; justify-content: space-between;"><span>Total Orders:</span><strong>${todayOrders.length}</strong></div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;"><span>• Dine-In Bills:</span><span>${dineInCount}</span></div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;"><span>• Takeaway Bills:</span><span>${takeawayCount}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>

            <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: bold;"><span>GROSS SALES:</span><span>₹${totalGross.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between; font-size: 11px;"><span>Total GST Tax:</span><span>₹${totalTax.toFixed(2)}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>

            <div style="font-weight: bold; text-align: left; margin-bottom: 4px;">PAYMENT BREAKDOWN:</div>
            <div style="display: flex; justify-content: space-between;"><span>💵 Cash:</span><span>₹${cashSales.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>📱 UPI / QR:</span><span>₹${upiSales.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between;"><span>💳 Card:</span><span>₹${cardSales.toFixed(2)}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>

            <div style="display: flex; justify-content: space-between; color: #B53B3B;"><span>Total Expenses:</span><span>-₹${totalExp.toFixed(2)}</span></div>
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 4px;"><span>EST. CASH IN DRAWER:</span><span>₹${netCashInDrawer.toFixed(2)}</span></div>
            <div style="border-bottom: 1px dashed #000; margin: 8px 0;"></div>
            
            <div style="font-size: 11px; margin-top: 10px;">Generated by Royal Cafe POS</div>
        </div>
    `;

    let iframe = document.getElementById('print-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
    }
    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`<html><head><title>Daily Z-Report</title><style>body{margin:0;padding:10px;font-family:monospace;}</style></head><body>${zReportHtml}</body></html>`);
    doc.close();
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
    }, 400);
}
window.printDailyZReport = printDailyZReport;

let currentEditingOrderItems = [];

function editOrderItemQty(index, delta) {
    if (!currentEditingOrderItems[index]) return;
    currentEditingOrderItems[index].qty = Math.max(0, (currentEditingOrderItems[index].qty || 1) + delta);
    renderEditOrderItems();
}
window.editOrderItemQty = editOrderItemQty;

function renderEditOrderItems() {
    const container = document.getElementById('editOrderItemsContainer');
    if (!container) return;
    if (!currentEditingOrderItems || currentEditingOrderItems.length === 0) {
        container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); padding: 8px;">No items in this order.</div>';
        return;
    }
    let html = '<div style="font-size: 12px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px;">Ordered Items & Quantities</div>';
    html += '<div style="display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto; padding: 4px;">';
    currentEditingOrderItems.forEach((item, idx) => {
        const itemTotal = (item.price || 0) * (item.qty || 0);
        html += `
            <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg); padding: 8px 12px; border-radius: 10px; border: 1px solid var(--border);">
                <div>
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-main);">${item.name}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">₹${item.price} each • ₹${itemTotal}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button type="button" class="btn btn-outline" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: 800;" onclick="editOrderItemQty(${idx}, -1)">−</button>
                    <span style="font-size: 13px; font-weight: 800; min-width: 20px; text-align: center;">${item.qty || 0}</span>
                    <button type="button" class="btn btn-outline" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; font-weight: 800;" onclick="editOrderItemQty(${idx}, 1)">+</button>
                </div>
            </div>
        `;
    });
    html += '</div>';
    container.innerHTML = html;
}

function openEditOrderModal(id) {
    const order = orderHistory.find(o => o.id === id); if(!order) return;
    document.getElementById('editOrderId').value = id; 
    document.getElementById('editBillNoDisplay').innerText = order.billNo || 'N/A';
    document.getElementById('editOrderType').value = order.orderType || (order.table === 'Takeaway' ? 'Takeaway' : 'Dine-In'); 
    selectPayment(order.paymentMode || 'Cash', 'edit'); 
    document.getElementById('editCustomerName').value = order.customer || ''; 
    document.getElementById('editBillerName').value = order.biller || ''; 
    currentEditingOrderItems = JSON.parse(JSON.stringify(order.items || []));
    renderEditOrderItems();
    document.getElementById('editOrderModal').style.display = 'flex';
}
window.openEditOrderModal = openEditOrderModal;

function saveEditedOrder() {
    const id = parseInt(document.getElementById('editOrderId').value); 
    const order = orderHistory.find(o => o.id === id);
    if(order) {
        order.orderType = document.getElementById('editOrderType').value; 
        order.paymentMode = document.getElementById('editSelectedPaymentMode').value;
        order.customer = document.getElementById('editCustomerName').value.trim(); 
        order.biller = document.getElementById('editBillerName').value.trim();
        if(order.orderType === 'Takeaway') order.table = 'Takeaway'; 
        if (currentEditingOrderItems && currentEditingOrderItems.length > 0) {
            order.items = currentEditingOrderItems.filter(i => (i.qty || 0) > 0);
            order.amount = Math.max(0, order.items.reduce((sum, i) => sum + ((i.price || 0) * (i.qty || 0)), 0));
        }
        persistHistoryFirebase(); 
        renderDashboardAnalytics(); 
        showToast("Bill updated."); 
        document.getElementById('editOrderModal').style.display = 'none';
    }
}
window.saveEditedOrder = saveEditedOrder;

function exportHistoryToExcel() {
    exportFilteredSalesCSV();
}
window.exportHistoryToExcel = exportHistoryToExcel;

// --- MOBILE-FIRST TRANSACTION BOTTOM ACTION SHEET CONTROLLER ---
let currentActionSheetOrderId = null;

function openTransactionActionSheet(orderId) {
    const order = orderHistory.find(o => String(o.id) === String(orderId));
    if (!order) return;
    currentActionSheetOrderId = order.id;

    const modal = document.getElementById('transactionActionSheetModal');
    if (!modal) return;

    const billEl = document.getElementById('txnSheetBillNo');
    if (billEl) billEl.innerText = `Bill #${order.billNo || order.id || '-'}`;

    const tableBadge = document.getElementById('txnSheetTableBadge');
    if (tableBadge) {
        let tableStr = String(order.table || 'Takeaway');
        tableBadge.innerText = tableStr === 'Takeaway' ? 'Takeaway' : (tableStr.startsWith('Table') ? tableStr : `Table ${tableStr}`);
        tableBadge.className = tableStr === 'Takeaway' ? 'custom-pill table-pill-takeaway' : 'custom-pill table-pill-dinein';
    }

    const dateEl = document.getElementById('txnSheetDateTime');
    if (dateEl) dateEl.innerText = order.date || '';

    const custEl = document.getElementById('txnSheetCustomer');
    if (custEl) custEl.innerText = order.customer || 'Walk-in';

    const payEl = document.getElementById('txnSheetPayment');
    if (payEl) {
        payEl.innerText = order.paymentMode || 'Cash';
        let payBadgeClass = 'pay-badge-cash';
        if ((order.paymentMode || '').toLowerCase() === 'upi') payBadgeClass = 'pay-badge-upi';
        if ((order.paymentMode || '').toLowerCase() === 'card') payBadgeClass = 'pay-badge-card';
        payEl.className = `custom-pill ${payBadgeClass}`;
    }

    const itemsEl = document.getElementById('txnSheetItemsList');
    if (itemsEl) itemsEl.innerText = order.items || '-';

    const amtEl = document.getElementById('txnSheetTotalAmount');
    if (amtEl) amtEl.innerText = `₹${Number(order.amount || 0).toFixed(2)}`;

    // Direct Action Button bindings
    const btnEdit = document.getElementById('txnSheetBtnEdit');
    if (btnEdit) {
        btnEdit.onclick = () => {
            closeTransactionActionSheet();
            openEditOrderModal(order.id);
        };
    }
    const btnInvoice = document.getElementById('txnSheetBtnInvoice');
    if (btnInvoice) {
        btnInvoice.onclick = () => {
            closeTransactionActionSheet();
            viewOrderInvoiceModal(order.id);
        };
    }
    const btnPrint = document.getElementById('txnSheetBtnPrint');
    if (btnPrint) {
        btnPrint.onclick = () => {
            reprintReceipt(order.id);
        };
    }
    const btnVoid = document.getElementById('txnSheetBtnVoid');
    if (btnVoid) {
        btnVoid.onclick = () => {
            voidTransaction(order.id);
        };
    }

    modal.style.display = 'flex';
}
window.openTransactionActionSheet = openTransactionActionSheet;

function closeTransactionActionSheet() {
    const modal = document.getElementById('transactionActionSheetModal');
    if (modal) modal.style.display = 'none';
}
window.closeTransactionActionSheet = closeTransactionActionSheet;

function voidTransaction(orderId, bypassRoleCheck = false) {
    const order = orderHistory.find(o => String(o.id) === String(orderId));
    if (!order) return;

    if (!bypassRoleCheck && typeof currentStaff !== 'undefined' && currentStaff && currentStaff.role !== 'Admin' && currentStaff.role !== 'Manager') {
        if (typeof requestManagerOverride === 'function') {
            requestManagerOverride({
                title: "Manager Authorization Required",
                actionDescription: `Enter Manager or Admin PIN to void Bill #${order.billNo || order.id}:`,
                onSuccess: () => {
                    voidTransaction(orderId, true);
                }
            });
            return;
        }
    }

    const confirmVoid = confirm(`⚠️ Are you sure you want to cancel / void Bill #${order.billNo || order.id} (₹${order.amount})?\n\nThis will remove it from sales records and recalculate revenue.`);
    if (!confirmVoid) return;

    // Remove from orderHistory
    orderHistory = orderHistory.filter(o => String(o.id) !== String(orderId));
    saveToLocal();
    if (typeof persistAllToFirestore === 'function') persistAllToFirestore();

    closeTransactionActionSheet();
    if (typeof showToast === 'function') showToast(`Bill #${order.billNo || orderId} has been cancelled / voided.`);
    renderDashboardAnalytics();
    if (typeof updateAllUI === 'function') updateAllUI();
}
window.voidTransaction = voidTransaction;

// --- ACTION DROPDOWN & ACCOUNT POPOVER CONTROLLERS (M2) ---
function toggleActionDropdown(event, orderId) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    const currentMenu = document.getElementById(`actionDropdown-${orderId}`);
    const wasOpen = currentMenu && currentMenu.classList.contains('show');
    closeAllActionDropdowns();
    if (currentMenu && !wasOpen) {
        currentMenu.classList.add('show');
    }
}
window.toggleActionDropdown = toggleActionDropdown;

function closeAllActionDropdowns() {
    document.querySelectorAll('.action-dropdown-menu.show').forEach(m => m.classList.remove('show'));
    if (typeof closeAllMenuActionDropdowns === 'function') {
        closeAllMenuActionDropdowns();
    }
}
window.closeAllActionDropdowns = closeAllActionDropdowns;

function toggleAccountPopover(event, forceState) {
    if (event) {
        event.stopPropagation();
    }
    const popover = document.getElementById('accountPopoverCard');
    if (!popover) return;

    const staffNameEl = document.getElementById('activeStaffName');
    const popStaffName = document.getElementById('popoverStaffName');
    if (staffNameEl && popStaffName) {
        popStaffName.innerText = staffNameEl.innerText || 'Admin Cashier';
    }

    if (typeof forceState === 'boolean') {
        popover.style.display = forceState ? 'block' : 'none';
    } else {
        const isShown = popover.style.display === 'block';
        popover.style.display = isShown ? 'none' : 'block';
    }
}
window.toggleAccountPopover = toggleAccountPopover;

function setDashboardPaymentFilter(mode) {
    const sel = document.getElementById('dashPayModeFilter');
    if (sel) {
        sel.value = mode;
    }
    document.querySelectorAll('.dashPayFilterPill').forEach(pill => {
        if (pill.getAttribute('data-mode') === mode) {
            pill.classList.add('active');
        } else {
            pill.classList.remove('active');
        }
    });
    renderDashboardAnalytics();
}
window.setDashboardPaymentFilter = setDashboardPaymentFilter;

// --- Decision 2: Clean Vertical Progress Meters for Categories & Payment Channels ---
function renderVerticalProgressMeters(orders) {
    const catContainer = document.getElementById('categoryVerticalMeters');
    const payContainer = document.getElementById('paymentVerticalMeters');
    const catTotalEl = document.getElementById('catMetersTotal');
    const payTotalEl = document.getElementById('paymentMetersTotal');

    if (!catContainer && !payContainer) return;

    const list = Array.isArray(orders) ? orders : [];

    // 1. Calculate Categories: Snacks, Beverages, Main Course, Others
    const catTotals = {
        'Snacks': 0,
        'Beverages': 0,
        'Main Course': 0,
        'Others': 0
    };

    list.forEach(o => {
        if (Array.isArray(o.rawItems)) {
            o.rawItems.forEach(i => {
                const dishCat = (i.category || getCategoryForDishName(i.name) || '').toLowerCase();
                const rev = (Number(i.price) || 0) * (Number(i.qty) || 1);
                if (dishCat.includes('snack') || dishCat.includes('roll') || dishCat.includes('burger') || dishCat.includes('sandwich')) {
                    catTotals['Snacks'] += rev;
                } else if (dishCat.includes('beverage') || dishCat.includes('tea') || dishCat.includes('coffee') || dishCat.includes('drink')) {
                    catTotals['Beverages'] += rev;
                } else if (dishCat.includes('main') || dishCat.includes('curry') || dishCat.includes('biryani') || dishCat.includes('rice') || dishCat.includes('thali')) {
                    catTotals['Main Course'] += rev;
                } else {
                    catTotals['Others'] += rev;
                }
            });
        } else if (o.items) {
            const rev = Number(o.amount) || 0;
            const lower = (o.items || '').toLowerCase();
            if (lower.includes('tea') || lower.includes('coffee') || lower.includes('shake') || lower.includes('chai')) {
                catTotals['Beverages'] += rev;
            } else if (lower.includes('samosa') || lower.includes('sandwich') || lower.includes('burger') || lower.includes('snack')) {
                catTotals['Snacks'] += rev;
            } else if (lower.includes('biryani') || lower.includes('paneer') || lower.includes('curry') || lower.includes('thali') || lower.includes('roti')) {
                catTotals['Main Course'] += rev;
            } else {
                catTotals['Others'] += rev;
            }
        }
    });

    const totalCatRev = Object.values(catTotals).reduce((a, b) => a + b, 0);
    if (catTotalEl) catTotalEl.innerText = `Total: ₹${Math.round(totalCatRev).toLocaleString('en-IN')}`;

    if (catContainer) {
        const catConfig = [
            { key: 'Snacks', label: 'Snacks', color: '#143832' },
            { key: 'Beverages', label: 'Beverages', color: '#0284C7' },
            { key: 'Main Course', label: 'Mains', color: '#D97706' },
            { key: 'Others', label: 'Others', color: '#8B5CF6' }
        ];

        catContainer.innerHTML = catConfig.map(c => {
            const val = catTotals[c.key] || 0;
            const pct = totalCatRev > 0 ? Math.round((val / totalCatRev) * 100) : 0;
            const barHeight = val > 0 ? Math.max(6, Math.min(100, pct)) : 0;
            return `
                <div class="vertical-meter-col">
                    <span class="meter-val-text">₹${Math.round(val)}</span>
                    <div class="meter-track-vertical">
                        <div class="meter-fill-vertical" style="height: ${barHeight}%; background: ${c.color};"></div>
                    </div>
                    <span class="meter-pct-badge">${pct}%</span>
                    <span class="meter-label-bottom" title="${c.label}">${c.label}</span>
                </div>
            `;
        }).join('');
    }

    // 2. Calculate Payment Channels: Cash, UPI, Card
    const payTotals = { 'Cash': 0, 'UPI': 0, 'Card': 0 };
    list.forEach(o => {
        const mode = (o.paymentMode || 'Cash').trim().toUpperCase();
        if (mode === 'UPI') payTotals['UPI'] += (Number(o.amount) || 0);
        else if (mode === 'CARD') payTotals['Card'] += (Number(o.amount) || 0);
        else payTotals['Cash'] += (Number(o.amount) || 0);
    });

    const totalPayRev = Object.values(payTotals).reduce((a, b) => a + b, 0);
    if (payTotalEl) payTotalEl.innerText = `Total: ₹${Math.round(totalPayRev).toLocaleString('en-IN')}`;

    if (payContainer) {
        const payConfig = [
            { key: 'Cash', label: 'Cash', color: '#10B981' },
            { key: 'UPI', label: 'UPI / QR', color: '#4361EE' },
            { key: 'Card', label: 'Card / POS', color: '#F77F00' }
        ];

        payContainer.innerHTML = payConfig.map(p => {
            const val = payTotals[p.key] || 0;
            const pct = totalPayRev > 0 ? Math.round((val / totalPayRev) * 100) : 0;
            const barHeight = val > 0 ? Math.max(6, Math.min(100, pct)) : 0;
            return `
                <div class="vertical-meter-col">
                    <span class="meter-val-text">₹${Math.round(val)}</span>
                    <div class="meter-track-vertical">
                        <div class="meter-fill-vertical" style="height: ${barHeight}%; background: ${p.color};"></div>
                    </div>
                    <span class="meter-pct-badge">${pct}%</span>
                    <span class="meter-label-bottom" title="${p.label}">${p.label}</span>
                </div>
            `;
        }).join('');
    }
}
window.renderVerticalProgressMeters = renderVerticalProgressMeters;

// --- Decision 1: Master Header Unified Actions Dropdown Handlers ---
function toggleHeaderActionsDropdown(event) {
    if (event) {
        event.stopPropagation();
    }
    const dropdown = document.getElementById('headerActionsDropdown');
    const trigger = document.getElementById('headerActionsBtn');
    if (!dropdown) return;

    const isVisible = dropdown.style.display === 'block';
    dropdown.style.display = isVisible ? 'none' : 'block';
    if (trigger) trigger.setAttribute('aria-expanded', isVisible ? 'false' : 'true');

    if (!isVisible) {
        // Sync active cashier name
        const activeName = document.getElementById('activeStaffName')?.innerText || 'Admin';
        const hdrStaff = document.getElementById('hdrActionStaffName');
        if (hdrStaff) hdrStaff.innerText = activeName;

        // Sync unread notification count
        const notifBadge = document.getElementById('topbarNotificationBadge');
        const count = notifBadge ? parseInt(notifBadge.innerText) || 0 : 0;
        const hdrBadge = document.getElementById('headerDropdownNotificationBadge');
        if (hdrBadge) {
            hdrBadge.innerText = count;
            hdrBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }
        const noticeDot = document.getElementById('headerActionsNoticeDot');
        if (noticeDot) {
            noticeDot.style.display = count > 0 ? 'block' : 'none';
        }
    }
}
window.toggleHeaderActionsDropdown = toggleHeaderActionsDropdown;

function closeHeaderActionsDropdown() {
    const dropdown = document.getElementById('headerActionsDropdown');
    const trigger = document.getElementById('headerActionsBtn');
    if (dropdown) dropdown.style.display = 'none';
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
}
window.closeHeaderActionsDropdown = closeHeaderActionsDropdown;

// Global click-outside listener to dismiss .action-dropdown menus, #accountPopoverCard, and #headerActionsDropdown
document.addEventListener('click', (event) => {
    // Action dropdowns dismissal
    if (!event.target.closest('.action-dropdown')) {
        closeAllActionDropdowns();
    }
    // Account Popover dismissal
    const popover = document.getElementById('accountPopoverCard');
    const trigger = document.getElementById('topbarStaffDisplay');
    if (popover && popover.style.display === 'block') {
        if (!popover.contains(event.target) && (!trigger || !trigger.contains(event.target))) {
            popover.style.display = 'none';
        }
    }
    // Header Actions Dropdown dismissal
    const hdrDropdown = document.getElementById('headerActionsDropdown');
    const hdrTrigger = document.getElementById('headerActionsBtn');
    if (hdrDropdown && hdrDropdown.style.display === 'block') {
        if (!hdrDropdown.contains(event.target) && (!hdrTrigger || !hdrTrigger.contains(event.target))) {
            closeHeaderActionsDropdown();
        }
    }
});

// Window resize listener to dismiss mobile dropdown on wide screens
window.addEventListener('resize', () => {
    if (window.innerWidth >= 1080) {
        closeHeaderActionsDropdown();
    }
});

// Escape key listener for accessible dismissal of open dropdowns
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeHeaderActionsDropdown();
        closeAllActionDropdowns();
        const popover = document.getElementById('accountPopoverCard');
        if (popover) popover.style.display = 'none';
        if (typeof toggleWaPreviewExpand === 'function') {
            toggleWaPreviewExpand(false);
        }
    }
});
