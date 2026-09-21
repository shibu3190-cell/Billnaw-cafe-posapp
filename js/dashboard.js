// ============================================================
// 📊 JS/DASHBOARD.JS - Analytics, Chart Engine, Expenses & Reports
// ============================================================

let currentDashboardRange = 'today';
let currentDashboardMetric = 'all';

function addExpense() {
    const name = document.getElementById('expenseName').value; 
    const cost = parseFloat(document.getElementById('expenseCost').value); 
    if(name && cost) { 
        const newExpense = { 
            id: Date.now(), 
            date: new Date().toLocaleDateString(), 
            filterDate: getLocalISODate(), 
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), 
            name: name, 
            cost: cost 
        };
        if (editingExpenseId) { 
            const index = dailyExpenses.findIndex(e => e.id === editingExpenseId); 
            if(index > -1) { 
                dailyExpenses[index].name = name; 
                dailyExpenses[index].cost = cost; 
            } 
            editingExpenseId = null; 
            document.getElementById('addExpenseBtn').innerText = "- Record"; 
            showToast("Expense updated."); 
            persistExpensesFirebase(); 
        } else { 
            dailyExpenses.unshift(newExpense); 
            pushToGoogleSheetsQueue('addExpense', newExpense); 
            persistExpensesFirebase(newExpense); 
            showToast("Expense recorded."); 
        }
        document.getElementById('expenseName').value = ''; 
        document.getElementById('expenseCost').value = ''; 
        renderExpensesUI(); 
    } else { 
        showToast("Please enter Item Name and Cost."); 
    }
}
window.addExpense = addExpense;

function editExpense(id) { 
    const exp = dailyExpenses.find(e => e.id === id); 
    if(exp) { 
        document.getElementById('expenseName').value = exp.name; 
        document.getElementById('expenseCost').value = exp.cost; 
        editingExpenseId = id; 
        document.getElementById('addExpenseBtn').innerText = "💾 Update"; 
        window.scrollTo(0,0); 
    } 
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
        const n = document.getElementById('quickExpenseName');
        const c = document.getElementById('quickExpenseCost');
        if (n) n.value = '';
        if (c) c.value = '';
        modal.style.display = 'flex';
        setTimeout(() => n?.focus(), 50);
    }
}
window.openQuickExpenseModal = openQuickExpenseModal;

function closeQuickExpenseModal() {
    const modal = document.getElementById('quickExpenseModal');
    if (modal) modal.style.display = 'none';
}
window.closeQuickExpenseModal = closeQuickExpenseModal;

function saveQuickExpense() {
    const name = document.getElementById('quickExpenseName')?.value.trim();
    const cost = parseFloat(document.getElementById('quickExpenseCost')?.value);
    if (!name || isNaN(cost) || cost <= 0) {
        return showToast("Please enter a valid item name and amount.");
    }
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
    showToast(`Recorded expense: ${name} (₹${cost.toFixed(2)})`);
}
window.saveQuickExpense = saveQuickExpense;

function setDashboardDateRange(range) {
    currentDashboardRange = range;
    ['today', 'yesterday', 'week', 'month', 'all'].forEach(r => {
        const btn = document.getElementById(`fRange-${r}`);
        if (btn) {
            if (r === range) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
    renderDashboardAnalytics();
}
window.setDashboardDateRange = setDashboardDateRange;

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
    ['today', 'yesterday', 'week', 'all'].forEach(r => {
        const btn = document.getElementById(`fRange-${r}`);
        if (btn) btn.classList.remove('active');
    });
    const mBtn = document.getElementById('fRange-month');
    if (mBtn) mBtn.classList.add('active');
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
    
    // 1. Date Range Filtering
    let filteredOrders = orderHistory.filter(o => {
        const fDate = o.filterDate || (o.date ? o.date.split(',')[0].trim() : '');
        if (currentDashboardRange === 'today') return fDate === todayISO;
        if (currentDashboardRange === 'yesterday') return fDate === yesterdayISO;
        if (currentDashboardRange === 'week') return fDate >= weekAgoISO && fDate <= todayISO;
        if (currentDashboardRange === 'month') return fDate.startsWith(selectedMonth);
        return true;
    });

    let filteredExpenses = dailyExpenses.filter(e => {
        const fDate = e.filterDate || (e.date ? e.date.split(',')[0].trim() : '');
        if (currentDashboardRange === 'today') return fDate === todayISO;
        if (currentDashboardRange === 'yesterday') return fDate === yesterdayISO;
        if (currentDashboardRange === 'week') return fDate >= weekAgoISO && fDate <= todayISO;
        if (currentDashboardRange === 'month') return fDate.startsWith(selectedMonth);
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
                let tableLabel = tableStr === 'Takeaway' ? '🛍️ Takeaway' : (tableStr.startsWith('Table') ? tableStr : `🪑 ${tableStr}`);
                
                let payBadgeClass = 'pay-badge-cash';
                if ((order.paymentMode || '').toLowerCase() === 'upi') payBadgeClass = 'pay-badge-upi';
                if ((order.paymentMode || '').toLowerCase() === 'card') payBadgeClass = 'pay-badge-card';

                let custHtml = '<span style="color: var(--text-muted); font-size: 12px;">Walk-in</span>';
                if (order.customer) {
                    custHtml = `<span style="font-weight: 600; color: var(--text-dark); font-size: 13px;">${escapeHtml(order.customer)}</span>`;
                }

                const timeStr = order.date.includes(',') ? order.date.split(',')[1].trim() : order.date;

                const discountBadge = (order.discountAmount && Number(order.discountAmount) > 0)
                    ? `<span style="display:inline-block; font-size:10px; font-weight:700; color:var(--success); background:rgba(30,138,76,0.12); padding:2px 6px; border-radius:6px; margin-top:2px;">-${order.discount?.type === 'percent' ? order.discount.value + '%' : '₹' + order.discountAmount}</span>`
                    : '';

                return `
                    <tr>
                        <td style="font-size: 12px; color: var(--text-muted); white-space: nowrap;">${timeStr}</td>
                        <td><strong style="color: var(--primary); font-size: 14px; font-family: monospace;">#${order.billNo || '-'}</strong></td>
                        <td><span class="custom-pill ${badgeClass}">${tableLabel}</span></td>
                        <td>${custHtml}</td>
                        <td style="font-size: 12px; max-width: 200px; color: var(--text-dark); white-space: normal;">${escapeHtml(order.items || '-')}</td>
                        <td><span class="custom-pill ${payBadgeClass}">${order.paymentMode || 'Cash'}</span></td>
                        <td style="font-weight: 800; color: var(--success); font-size: 14px; text-align: right;">
                            <div>₹${Number(order.amount).toFixed(2)}</div>
                            ${discountBadge}
                        </td>
                        <td style="text-align: center; white-space: nowrap;">
                            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" onclick="viewOrderInvoiceModal(${order.id})" title="View Full Bill & Invoice Breakdown">🧾 Bill</button>
                            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; margin-right: 4px;" onclick="openEditOrderModal(${order.id})">✏️ Edit</button>
                            <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="reprintReceipt(${order.id})">🖨️ Receipt</button>
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

    // 7. Render Interactive Sales Chart
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
}
window.renderDashboardChart = renderDashboardChart;

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

function openEditOrderModal(id) {
    const order = orderHistory.find(o => o.id === id); if(!order) return;
    document.getElementById('editOrderId').value = id; 
    document.getElementById('editBillNoDisplay').innerText = order.billNo || 'N/A';
    document.getElementById('editOrderType').value = order.orderType || (order.table === 'Takeaway' ? 'Takeaway' : 'Dine-In'); 
    selectPayment(order.paymentMode || 'Cash', 'edit'); 
    document.getElementById('editCustomerName').value = order.customer || ''; 
    document.getElementById('editBillerName').value = order.biller || ''; 
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
