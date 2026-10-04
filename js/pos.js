// ============================================================
// 🛒 JS/POS.JS - Table Management, Cart, Checkout & Thermal Printing
// ============================================================

function switchFloor(floorName, btnEl) {
    if (typeof shopProfile !== 'undefined') shopProfile.activeFloor = floorName;
    const pills = document.querySelectorAll('#posFloorSelector .floor-pill');
    pills.forEach(p => p.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    if (typeof showToast === 'function') showToast(`Floor switched: ${floorName}`);
}
window.switchFloor = switchFloor;

function renderTables() {
    const grid = document.getElementById('tableGridUI');
    if (!grid) return;
    grid.innerHTML = '';
    const totalTables = shopProfile.tableCount || 5;

    const tablesWrapper = document.getElementById('tablesWrapper');
    if (tablesWrapper) {
        tablesWrapper.style.display = (shopProfile.showTablesInPos === false) ? 'none' : 'block';
    }
    
    let occupiedCount = 0;
    for (let i = 1; i <= totalTables; i++) {
        const tInfo = tablesInfo[i];
        if (tInfo && tInfo.items && tInfo.items.length > 0) occupiedCount++;
    }
    const statsEl = document.getElementById('tableStatsSummary');
    if (statsEl) {
        statsEl.innerHTML = `<strong>${occupiedCount}</strong> Active • <strong>${Math.max(0, totalTables - occupiedCount)}</strong> Vacant`;
    }

    const posActiveBadge = document.getElementById('posActiveTableBadge');
    if (posActiveBadge) {
        posActiveBadge.innerText = getTableName(activeTable);
    }

    for (let i = 1; i <= totalTables; i++) {
        const tInfo = tablesInfo[i];
        const tableName = getTableName(i);
        let classes = 'table-btn';
        let statusTag = 'VACANT';
        const hasItems = tInfo && tInfo.items && tInfo.items.length > 0;
        if (hasItems) {
            if (tInfo.status === 'billed' || tInfo.status === 'served') {
                classes += ' billed';
                statusTag = 'BILLED';
            } else {
                classes += ' occupied';
                if (tInfo.status === 'alert') {
                    classes += ' alert';
                } else if (tInfo.status === 'saved' || tInfo.status === 'kot') {
                    classes += ' kot';
                }
                const elapsedMinutes = tInfo.savedTime 
                    ? Math.max(1, Math.floor((Date.now() - tInfo.savedTime) / 60000)) 
                    : 1;
                statusTag = `${elapsedMinutes}m`;
            }
        } else {
            classes += ' empty';
            statusTag = 'VACANT';
        }
        if (i === activeTable) classes += ' selected';
        
        const itemCount = hasItems 
            ? tInfo.items.reduce((s, it) => s + it.qty, 0) 
            : 0;
        const countBadge = itemCount > 0 ? `<span class="table-item-badge">${itemCount}</span>` : '';

        grid.innerHTML += `
            <button type="button" id="table-btn-${i}" class="${classes}" onclick="selectTable(${i})" title="Table ${escapeHtml(tableName)}">
                <div class="table-status-dot"></div>
                <span class="table-num-pill">${i}</span>
                <span class="table-t-code">T${i}</span>
                <span class="table-status-tag">${statusTag}</span>
                <span class="table-btn-name" style="display:none;">${escapeHtml(tableName)}</span>
                ${countBadge}
            </button>
        `;
    }
}
window.renderTables = renderTables;

function syncTableUI() {
    const totalTables = shopProfile.tableCount || 5;
    let occupiedCount = 0;

    const tablesWrapper = document.getElementById('tablesWrapper');
    if (tablesWrapper) {
        tablesWrapper.style.display = (shopProfile.showTablesInPos === false) ? 'none' : 'block';
    }

    for (let i = 1; i <= totalTables; i++) {
        const tInfo = tablesInfo[i];
        const hasItems = tInfo && tInfo.items && tInfo.items.length > 0;
        if (hasItems) occupiedCount++;

        const tBtn = document.getElementById(`table-btn-${i}`);
        if (tBtn) {
            let classes = 'table-btn';
            let statusTag = 'VACANT';
            if (hasItems) {
                if (tInfo.status === 'billed' || tInfo.status === 'served') {
                    classes += ' billed';
                    statusTag = 'BILLED';
                } else {
                    classes += ' occupied';
                    if (tInfo.status === 'alert') {
                        classes += ' alert';
                    } else if (tInfo.status === 'saved' || tInfo.status === 'kot') {
                        classes += ' kot';
                    }
                    const elapsedMinutes = tInfo.savedTime 
                        ? Math.max(1, Math.floor((Date.now() - tInfo.savedTime) / 60000)) 
                        : 1;
                    statusTag = `${elapsedMinutes}m`;
                }
            } else {
                classes += ' empty';
                statusTag = 'VACANT';
            }
            if (i === activeTable) classes += ' selected';
            if (tBtn.className !== classes) tBtn.className = classes;

            // Status tag & T-code updates
            const tagEl = tBtn.querySelector('.table-status-tag');
            if (tagEl) tagEl.innerText = statusTag;
            const codeEl = tBtn.querySelector('.table-t-code');
            if (codeEl) codeEl.innerText = `T${i}`;

            // Name update
            const nameEl = tBtn.querySelector('.table-btn-name');
            if (nameEl) nameEl.innerText = getTableName(i);

            // Item count badge update
            const itemCount = hasItems 
                ? tInfo.items.reduce((s, it) => s + it.qty, 0) 
                : 0;
            const existingBadge = tBtn.querySelector('.table-item-badge');
            if (itemCount > 0) {
                if (existingBadge) {
                    existingBadge.innerText = itemCount;
                } else {
                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = 'table-item-badge';
                    badgeSpan.innerText = itemCount;
                    tBtn.appendChild(badgeSpan);
                }
            } else if (existingBadge) {
                existingBadge.remove();
            }
        }
    }

    const statsEl = document.getElementById('tableStatsSummary');
    if (statsEl) {
        statsEl.innerHTML = `<strong>${occupiedCount}</strong> Active • <strong>${Math.max(0, totalTables - occupiedCount)}</strong> Vacant`;
    }

    const currentTableName = getTableName(activeTable);
    const aTable = document.getElementById('activeTableUI'); if (aTable) aTable.innerText = currentTableName;
    const cartTableTitle = document.getElementById('cartTableTitle'); if (cartTableTitle) cartTableTitle.innerText = `Table ${currentTableName}`;
    const kTable = document.getElementById('kotTableNoDisplay'); if (kTable) kTable.innerText = currentTableName;
    const cTable = document.getElementById('checkoutTableNoDisplay'); if (cTable) cTable.innerText = currentTableName;
    const discountModalTableNo = document.getElementById('discountModalTableNo'); if (discountModalTableNo) discountModalTableNo.innerText = currentTableName;
    
    const posActiveBadge = document.getElementById('posActiveTableBadge');
    if (posActiveBadge) {
        posActiveBadge.innerText = currentTableName;
    }
    
    // Topbar Active Table Display & Occupied Status (Hidden hook preserved for compatibility)
    const topbarDisplay = document.getElementById('topbarTableDisplay');
    if (topbarDisplay) topbarDisplay.innerText = currentTableName;
    const topbarDot = document.getElementById('topbarTableDot');
    if (topbarDot) {
        const isOccupied = tablesInfo[activeTable] && tablesInfo[activeTable].items && tablesInfo[activeTable].items.length > 0;
        topbarDot.className = 'topbar-table-dot ' + (isOccupied ? 'occupied' : 'empty');
    }
    const topbarPill = document.getElementById('topbarTablePill');
    if (topbarPill) {
        topbarPill.style.display = 'none';
    }
}
window.syncTableUI = syncTableUI;

function triggerSmartMenuUpload() {
    if (typeof switchTab === 'function') switchTab('menu');
    const uploader = document.getElementById('aiMenuUploader') || document.getElementById('aiMenuFileInput');
    if (uploader) {
        try { uploader.value = null; } catch(e) {}
        uploader.click();
    }
}
window.triggerSmartMenuUpload = triggerSmartMenuUpload;

function selectTable(num) { 
    activeTable = num; 
    syncTableUI(); 
    updateCartUI(); 
    if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities(); 
}
window.selectTable = selectTable;

function bookTable() { 
    let tInfo = tablesInfo[activeTable]; 
    if(tInfo && tInfo.items.length > 0) return showToast("Cannot reserve active table!"); 
    if (tInfo) { 
        tInfo.status = tInfo.status === 'booked' ? 'empty' : 'booked'; 
        persistTables(); 
        syncTableUI(); 
    } 
}
window.bookTable = bookTable;

function addToCart(itemId, event) {
    if (event) event.stopPropagation();
    let tInfo = tablesInfo[activeTable]; 
    const menuItem = menuItems.find(m => m.id === itemId); 
    if(!menuItem || !tInfo) return;
    const existing = tInfo.items.find(i => i.id === itemId);
    if (menuItem.trackStock && (existing ? existing.qty + 1 : 1) > menuItem.stockQty) return showToast(`Only ${menuItem.stockQty} left!`);
    if(existing) existing.qty++; else tInfo.items.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, gstRate: menuItem.gstRate, qty: 1 });
    if(tInfo.status === 'empty' || tInfo.status === 'booked' || !tInfo.status) tInfo.status = 'occupied'; 
    if(!tInfo.savedTime) tInfo.savedTime = Date.now();
    persistTables(); 
    syncTableUI(); 
    updateCartUI(); 
    if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities();
}
window.addToCart = addToCart;

function modifyQty(itemId, delta, event) {
    if (event) event.stopPropagation();
    let tInfo = tablesInfo[activeTable]; 
    if (!tInfo) return;
    const item = tInfo.items.find(i => i.id === itemId); 
    const menuItem = menuItems.find(m => m.id === itemId);
    if (item) {
        if (delta > 0 && menuItem && menuItem.trackStock && (item.qty + delta) > menuItem.stockQty) return showToast(`Only ${menuItem.stockQty} left!`);
        item.qty += delta; 
        if(item.qty <= 0) tInfo.items = tInfo.items.filter(i => i.id !== itemId); 
        if(tInfo.items.length === 0 && tInfo.status !== 'booked') { 
            tInfo.status = 'empty'; 
            tInfo.savedTime = null; 
            tInfo.lastReminder = null; 
        } else if (tInfo.items.length > 0 && !tInfo.savedTime) {
            tInfo.savedTime = Date.now();
            if (tInfo.status === 'empty') tInfo.status = 'occupied';
        }
        persistTables(); 
        syncTableUI(); 
        updateCartUI(); 
        if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities();
    }
}
window.modifyQty = modifyQty;

function clearTable() {
    if(confirm("Clear this entire order?")) {
        tablesInfo[activeTable] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
        persistTables();
        syncTableUI();
        updateCartUI();
        if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities();
        const drawer = document.getElementById('cartDrawer'); if (drawer) drawer.classList.remove('open');
        const overlay = document.getElementById('cartDrawerOverlay'); if (overlay) overlay.classList.remove('show');
    }
}
window.clearTable = clearTable;

// ============================================================
// 🏷️ QUICK DISCOUNT HANDLERS & PRICING GLUE
// ============================================================
let currentDiscountModalType = 'percent';

function getActiveTableCustomer() {
    let tInfo = tablesInfo[activeTable];
    if (tInfo && tInfo.customer) return tInfo.customer;
    if (selectedCustomerForOrder) {
        return customersList.find(c => String(c.id) === String(selectedCustomerForOrder)) || null;
    }
    return null;
}
window.getActiveTableCustomer = getActiveTableCustomer;

function getCustomerEligibleDiscountRate(cust) {
    if (!cust) return 0;
    if (cust.customDiscountRate !== undefined && cust.customDiscountRate !== null && !isNaN(cust.customDiscountRate) && Number(cust.customDiscountRate) > 0) {
        return Number(cust.customDiscountRate);
    }
    const tierRates = shopProfile.tierDiscountRates || { Platinum: 15, Gold: 10, Silver: 5, Bronze: 0 };
    const tier = cust.tier || (typeof calculateCustomerTier === 'function' ? calculateCustomerTier(cust.totalVisits || 0).name : 'Bronze');
    return tierRates[tier] || 0;
}
window.getCustomerEligibleDiscountRate = getCustomerEligibleDiscountRate;

function openQuickDiscountModal() {
    let tInfo = tablesInfo[activeTable];
    if (!tInfo || !tInfo.items || tInfo.items.length === 0) {
        return showToast(`Table ${activeTable} is empty! Add items first.`);
    }
    const modal = document.getElementById('quickDiscountModal');
    if (!modal) return;
    
    const tableNoEl = document.getElementById('discountModalTableNo');
    if (tableNoEl) tableNoEl.innerText = activeTable;

    const currentDiscount = tInfo.discount || null;
    currentDiscountModalType = currentDiscount ? currentDiscount.type : 'percent';
    
    setDiscountModalType(currentDiscountModalType, false);
    
    const inputVal = document.getElementById('discountCustomValInput');
    if (inputVal) {
        inputVal.value = currentDiscount ? currentDiscount.value : '';
    }

    const reasonSelect = document.getElementById('discountReasonSelect');
    const customReasonInput = document.getElementById('discountCustomReasonInput');
    if (reasonSelect) {
        if (currentDiscount && currentDiscount.reason) {
            const hasOption = Array.from(reasonSelect.options).some(o => o.value === currentDiscount.reason);
            if (hasOption) {
                reasonSelect.value = currentDiscount.reason;
                if (customReasonInput) customReasonInput.style.display = 'none';
            } else {
                reasonSelect.value = 'custom';
                if (customReasonInput) {
                    customReasonInput.style.display = 'block';
                    customReasonInput.value = currentDiscount.reason;
                }
            }
        } else {
            reasonSelect.value = 'Regular Customer';
            if (customReasonInput) {
                customReasonInput.style.display = 'none';
                customReasonInput.value = '';
            }
        }
    }

    const removeBtn = document.getElementById('btnRemoveDiscountInModal');
    if (removeBtn) {
        removeBtn.style.display = currentDiscount ? 'inline-block' : 'none';
    }

    updateDiscountPreview();
    modal.style.display = 'flex';
}
window.openQuickDiscountModal = openQuickDiscountModal;

function closeQuickDiscountModal() {
    const modal = document.getElementById('quickDiscountModal');
    if (modal) modal.style.display = 'none';
}
window.closeQuickDiscountModal = closeQuickDiscountModal;

function setDiscountModalType(type, shouldRecalc = true) {
    currentDiscountModalType = type;
    const btnPercent = document.getElementById('discountTypePercentBtn');
    const btnFixed = document.getElementById('discountTypeFixedBtn');
    const label = document.getElementById('discountCustomInputLabel');
    const suffix = document.getElementById('discountInputSuffix');

    if (type === 'percent') {
        if (btnPercent) { btnPercent.className = 'btn active'; btnPercent.style.background = 'var(--primary)'; btnPercent.style.color = '#fff'; }
        if (btnFixed) { btnFixed.className = 'btn btn-outline'; btnFixed.style.background = 'transparent'; btnFixed.style.color = 'var(--text-dark)'; }
        if (label) label.innerText = 'Discount Percentage (%)';
        if (suffix) suffix.innerText = '%';
    } else {
        if (btnPercent) { btnPercent.className = 'btn btn-outline'; btnPercent.style.background = 'transparent'; btnPercent.style.color = 'var(--text-dark)'; }
        if (btnFixed) { btnFixed.className = 'btn active'; btnFixed.style.background = 'var(--primary)'; btnFixed.style.color = '#fff'; }
        if (label) label.innerText = 'Flat Cash Discount Amount (₹)';
        if (suffix) suffix.innerText = '₹';
    }

    renderDiscountPresetPills();
    if (shouldRecalc) {
        updateDiscountPreview();
    }
}
window.setDiscountModalType = setDiscountModalType;

function renderDiscountPresetPills() {
    const container = document.getElementById('discountPresetPillsContainer');
    if (!container) return;
    container.innerHTML = '';

    const presets = currentDiscountModalType === 'percent'
        ? (shopProfile.discountPercentPresets || [5, 10, 15, 20, 25])
        : (shopProfile.discountFixedPresets || [20, 50, 100, 200]);

    const currentVal = parseFloat(document.getElementById('discountCustomValInput')?.value) || 0;

    presets.forEach(p => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'filter-pill' + (currentVal === p ? ' active' : '');
        btn.style.fontSize = '12px';
        btn.style.padding = '6px 12px';
        btn.innerText = currentDiscountModalType === 'percent' ? `${p}%` : `₹${p}`;
        btn.onclick = () => {
            const input = document.getElementById('discountCustomValInput');
            if (input) input.value = p;
            renderDiscountPresetPills();
            updateDiscountPreview();
        };
        container.appendChild(btn);
    });
}
window.renderDiscountPresetPills = renderDiscountPresetPills;

function onDiscountInputChanged() {
    renderDiscountPresetPills();
    updateDiscountPreview();
}
window.onDiscountInputChanged = onDiscountInputChanged;

function onDiscountReasonSelected(val) {
    const customInput = document.getElementById('discountCustomReasonInput');
    if (!customInput) return;
    if (val === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
    }
}
window.onDiscountReasonSelected = onDiscountReasonSelected;

function updateDiscountPreview() {
    let tInfo = tablesInfo[activeTable];
    const items = tInfo?.items || [];
    const val = parseFloat(document.getElementById('discountCustomValInput')?.value) || 0;

    let discountObj = null;
    if (val > 0) {
        discountObj = {
            type: currentDiscountModalType,
            value: val
        };
    }

    const totals = calculateOrderTotals(items, discountObj);

    const grossEl = document.getElementById('discountPreviewGross');
    const amtEl = document.getElementById('discountPreviewAmt');
    const netEl = document.getElementById('discountPreviewNet');

    if (grossEl) grossEl.innerText = `₹${totals.grossSubtotal.toFixed(2)}`;
    if (amtEl) amtEl.innerText = `-₹${totals.discountAmount.toFixed(2)}`;
    if (netEl) netEl.innerText = `₹${totals.finalTotal.toFixed(2)}`;
}
window.updateDiscountPreview = updateDiscountPreview;

function applyQuickDiscount() {
    let tInfo = tablesInfo[activeTable];
    if (!tInfo || !tInfo.items || tInfo.items.length === 0) return showToast("Cart is empty!");

    const val = parseFloat(document.getElementById('discountCustomValInput')?.value) || 0;
    if (val <= 0) {
        return showToast("Please enter a valid discount value greater than 0");
    }

    if (currentDiscountModalType === 'percent') {
        const maxPercent = shopProfile.maxDiscountPercent || 50;
        if (val > maxPercent) {
            return showToast(`⚠️ Discount cannot exceed max limit of ${maxPercent}%`);
        }
    } else {
        const maxFixed = shopProfile.maxDiscountFixed || 1000;
        if (val > maxFixed) {
            return showToast(`⚠️ Fixed discount cannot exceed max limit of ₹${maxFixed}`);
        }
    }

    let reason = document.getElementById('discountReasonSelect')?.value || 'Discount';
    if (reason === 'custom') {
        reason = document.getElementById('discountCustomReasonInput')?.value.trim() || 'Custom Discount';
    }

    const totals = calculateOrderTotals(tInfo.items, { type: currentDiscountModalType, value: val });

    tInfo.discount = {
        type: currentDiscountModalType,
        value: val,
        amount: totals.discountAmount,
        reason: reason
    };

    persistTables();
    updateCartUI();
    closeQuickDiscountModal();
    showToast(`🏷️ Discount of ${currentDiscountModalType === 'percent' ? val + '%' : '₹' + val} applied!`);
}
window.applyQuickDiscount = applyQuickDiscount;

function removeQuickDiscount() {
    let tInfo = tablesInfo[activeTable];
    if (tInfo) {
        tInfo.discount = null;
        persistTables();
        updateCartUI();
        showToast("Discount removed.");
    }
}
window.removeQuickDiscount = removeQuickDiscount;

function applyCustomerSuggestedDiscount() {
    let tInfo = tablesInfo[activeTable];
    if (!tInfo || !tInfo.items || tInfo.items.length === 0) return showToast("Cart is empty!");

    const cust = getActiveTableCustomer();
    if (!cust) return showToast("No customer selected for this order.");

    const discountRate = getCustomerEligibleDiscountRate(cust);
    if (discountRate <= 0) return showToast("Customer is not eligible for a discount.");

    const totals = calculateOrderTotals(tInfo.items, { type: 'percent', value: discountRate });
    tInfo.discount = {
        type: 'percent',
        value: discountRate,
        amount: totals.discountAmount,
        reason: `${cust.name} (${cust.tier || 'VIP'} Loyalty)`
    };

    persistTables();
    updateCartUI();
    showToast(`🎁 Applied ${discountRate}% VIP discount for ${cust.name}!`);
}
window.applyCustomerSuggestedDiscount = applyCustomerSuggestedDiscount;

function updateCartUI() {
    const cartDiv = document.getElementById('cartUI');
    if (!cartDiv) return;
    cartDiv.innerHTML = '';
    if (!tablesInfo[activeTable]) {
        tablesInfo[activeTable] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
    }
    let tInfo = tablesInfo[activeTable];
    let currentCart = tInfo?.items || [];
    let currentDiscount = tInfo?.discount || null;

    if (currentCart.length === 0) {
        cartDiv.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 40px; font-weight: 600;">Select items from the menu to start an order.</div>`;
    } else {
        currentCart.forEach((item) => {
            let itemTotal = item.price * item.qty;
            cartDiv.innerHTML += `<div class="cart-item"><div class="cart-item-top"><span class="cart-item-name">${escapeHtml(item.name)}</span><span class="cart-item-price">₹${itemTotal.toFixed(2)}</span></div><div class="cart-item-bottom"><span class="cart-item-math">₹${item.price.toFixed(2)} each</span><div class="qty-pill"><button onclick="modifyQty(${item.id}, -1)">-</button><span>${item.qty}</span><button onclick="modifyQty(${item.id}, 1)">+</button></div></div></div>`;
        });
    }
    
    const totals = calculateOrderTotals(currentCart, currentDiscount);
    const totalEl = document.getElementById('totalUI');
    if (totalEl) totalEl.innerText = totals.finalTotal.toFixed(2); 

    // Quick Discount Button in Action Bar
    const discountBtn = document.getElementById('cartDiscountBtn');
    if (discountBtn) {
        if (shopProfile.discountsEnabled === false) {
            discountBtn.style.display = 'none';
        } else {
            discountBtn.style.display = 'inline-block';
            const btnTextEl = discountBtn.querySelector('.btn-text');
            if (currentDiscount && totals.discountAmount > 0) {
                discountBtn.classList.add('active');
                const label = currentDiscount.type === 'percent' 
                    ? `${currentDiscount.value}% Off` 
                    : `₹${currentDiscount.value} Off`;
                if (btnTextEl) {
                    btnTextEl.textContent = label;
                } else {
                    discountBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span class="btn-text">${label}</span>`;
                }
                discountBtn.style.background = 'var(--success)';
                discountBtn.style.color = '#fff';
            } else {
                discountBtn.classList.remove('active');
                if (btnTextEl) {
                    btnTextEl.textContent = 'Discount';
                } else {
                    discountBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span class="btn-text">Discount</span>`;
                }
                discountBtn.style.background = '';
                discountBtn.style.color = '';
            }
        }
    }

    // Discount Breakdown Line Row in Cart Footer
    const discountLineRow = document.getElementById('cartDiscountLineRow');
    const discountDesc = document.getElementById('cartDiscountDesc');
    const discountAmt = document.getElementById('cartDiscountAmt');
    if (discountLineRow) {
        if (currentDiscount && totals.discountAmount > 0) {
            discountLineRow.style.display = 'flex';
            if (discountDesc) {
                const typeLabel = currentDiscount.type === 'percent' ? `${currentDiscount.value}%` : 'Flat';
                const reasonLabel = currentDiscount.reason ? ` (${escapeHtml(currentDiscount.reason)})` : '';
                discountDesc.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span>Discount ${typeLabel}${reasonLabel}:</span>`;
            }
            if (discountAmt) discountAmt.innerText = `-₹${totals.discountAmount.toFixed(2)}`;
        } else {
            discountLineRow.style.display = 'none';
        }
    }

    // Customer Special Discount Prompt Banner in Cart
    const custBanner = document.getElementById('cartCustomerDiscountBanner');
    const custBannerText = document.getElementById('cartCustomerDiscountText');
    if (custBanner) {
        const activeCust = getActiveTableCustomer();
        const eligibleRate = getCustomerEligibleDiscountRate(activeCust);
        if (shopProfile.discountsEnabled !== false && activeCust && eligibleRate > 0 && (!currentDiscount || currentDiscount.value !== eligibleRate)) {
            custBanner.style.display = 'flex';
            if (custBannerText) {
                custBannerText.innerText = `🎁 ${escapeHtml(activeCust.name)} (${activeCust.tier || 'Loyalty'}): ${eligibleRate}% VIP discount available`;
            }
        } else {
            custBanner.style.display = 'none';
        }
    }

    // 🧠 Factor 3: Psychological Loss Aversion Alert (Protects Diner Loyalty)
    const lossAlertEl = document.getElementById('cartLossAversionAlert');
    const lossAlertMsg = document.getElementById('cartLossAversionMsg');
    if (lossAlertEl) {
        const activeCust = getActiveTableCustomer();
        if (currentCart.length > 0 && totals.finalTotal > 0) {
            if (!activeCust || !activeCust.phone) {
                const ptsEst = Math.max(1, Math.floor(totals.finalTotal / 50));
                const cashEst = Math.max(5, Math.round(totals.finalTotal * 0.05));
                if (lossAlertMsg) {
                    lossAlertMsg.innerHTML = `⚠️ Unclaimed Loyalty: Customer will forfeit <strong>₹${cashEst} VIP discount</strong> on this order. (Diner forfeits +${ptsEst} VIP points)`;
                }
                lossAlertEl.style.display = 'flex';
            } else {
                lossAlertEl.style.display = 'none';
            }
        } else {
            lossAlertEl.style.display = 'none';
        }
    }

    // 📊 Factor 4: Relative Evaluation Contrast (Transparent GST Percentage Framing)
    const gstBreakdownEl = document.getElementById('gstBreakdownUI');
    if (gstBreakdownEl) {
        const taxPct = totals.finalTotal > 0 ? ((totals.totalTax / totals.finalTotal) * 100).toFixed(1) : '0';
        if (totals.gstMode === 'exclusive') {
            gstBreakdownEl.innerHTML = totals.totalTax > 0 
                ? `Subtotal ₹${totals.subtotal.toFixed(2)} + GST: ₹${totals.totalTax.toFixed(2)} <span class="gst-pct-pill">Just ${taxPct}%</span>` 
                : "No GST Applied";
        } else if (totals.gstMode === 'none') {
            gstBreakdownEl.innerText = "GST Exempt (0%)";
        } else {
            gstBreakdownEl.innerHTML = totals.totalTax > 0 
                ? `GST & Service: ₹${totals.totalTax.toFixed(2)} <span class="gst-pct-pill">Just ${taxPct}% of total</span>` 
                : "No GST Applied";
        }
    }
    
    let totalItems = currentCart.reduce((sum, item) => sum + item.qty, 0);
    const fc = document.getElementById('floatingCart');
    const desktopBtn = document.getElementById('desktopCheckoutBtn');
    const desktopBtnSub = document.getElementById('desktopCheckoutBtnSub');

    if (desktopBtn) {
        if (totalItems > 0) {
            desktopBtn.disabled = false;
            if (desktopBtnSub) desktopBtnSub.innerText = `₹${totals.finalTotal.toFixed(2)} ➔`;
        } else {
            desktopBtn.disabled = true;
            if (desktopBtnSub) desktopBtnSub.innerText = `(Empty)`;
        }
    }
    
    if (fc) {
        if (totalItems > 0) {
            fc.style.display = 'flex';
            const fcCount = document.getElementById('fc-count'); if (fcCount) fcCount.innerText = `${totalItems} ITEMS`;
            const fcTot = document.getElementById('fc-total'); if (fcTot) fcTot.innerText = `${totals.finalTotal.toFixed(2)}`;
            fc.classList.remove('pop-animation');
            void fc.offsetWidth;
            fc.classList.add('pop-animation');
        } else {
            fc.style.display = 'none';
            const drawer = document.getElementById('cartDrawer'); if (drawer) drawer.classList.remove('open');
            const overlay = document.getElementById('cartDrawerOverlay'); if (overlay) overlay.classList.remove('show');
        }
    }
    cartDiv.scrollTop = cartDiv.scrollHeight;
}
window.updateCartUI = updateCartUI;

function toggleCartDrawer() { 
    const drawer = document.getElementById('cartDrawer'); 
    const overlay = document.getElementById('cartDrawerOverlay');
    if (drawer) drawer.classList.toggle('open'); 
    if (overlay && drawer) {
        if (drawer.classList.contains('open')) overlay.classList.add('show'); 
        else overlay.classList.remove('show');
    }
}
window.toggleCartDrawer = toggleCartDrawer;

function markServed() { 
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || tInfo.items.length === 0) return showToast("Table empty!"); 
    tInfo.status = 'served'; 
    tInfo.lastReminder = Date.now(); 
    persistTables(); 
    syncTableUI(); 
    document.getElementById('cartDrawer')?.classList.remove('open'); 
    document.getElementById('cartDrawerOverlay')?.classList.remove('show'); 
    showToast(`Table ${activeTable} served. Timer started.`); 
}
window.markServed = markServed;

setInterval(() => { 
    if (shopProfile.unpaidTableAlert === false) return;
    const now = Date.now(); 
    let needsSync = false; 
    const total = shopProfile.tableCount || 5;
    for(let i = 1; i <= total; i++) { 
        let tInfo = tablesInfo[i]; 
        if(tInfo && (tInfo.status === 'served' || tInfo.status === 'alert' || tInfo.status === 'saved' || tInfo.status === 'occupied')) { 
            const timeBase = tInfo.lastReminder || tInfo.savedTime;
            if(timeBase && (now - timeBase) >= ALERT_THRESHOLD_MS) { 
                tInfo.status = 'alert'; 
                tInfo.lastReminder = now; 
                needsSync = true; 
                showToast(`⚠️ Table ${i} unpaid!`); 
            } 
        } 
    } 
    if(needsSync) { 
        persistTables(); 
        syncTableUI(); 
    } 
}, 5000);

function sendToKitchen() { 
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || tInfo.items.length === 0) return showToast("Nothing to send!"); 
    tInfo.status = 'saved'; 
    persistTables(); 
    syncTableUI(); 
    const kTable = document.getElementById('kotTableNoDisplay');
    if (kTable) kTable.innerText = activeTable; 
    document.getElementById('cartDrawer')?.classList.remove('open'); 
    document.getElementById('cartDrawerOverlay')?.classList.remove('show'); 
    const kotModal = document.getElementById('kotModal');
    if (kotModal) kotModal.style.display = 'flex';
}
window.sendToKitchen = sendToKitchen;

function selectPayment(mode, context) {
    if(context === 'checkout') { 
        const pModeInput = document.getElementById('selectedPaymentMode');
        if (pModeInput) pModeInput.value = mode; 
        document.querySelectorAll('#checkoutModal .pay-btn').forEach(b => b.classList.remove('selected')); 
        const btn = document.getElementById('btnPay' + mode);
        if (btn) btn.classList.add('selected'); 

        const cashWrap = document.getElementById('checkoutCashTenderContainer');
        const upiWrap = document.getElementById('checkoutUpiQrContainer');
        const cardWrap = document.getElementById('checkoutCardContainer');

        if (cashWrap) cashWrap.style.display = mode === 'Cash' ? 'block' : 'none';
        if (upiWrap) upiWrap.style.display = mode === 'UPI' ? 'flex' : 'none';
        if (cardWrap) cardWrap.style.display = mode === 'Card' ? 'block' : 'none';

        const cTot = parseFloat(document.getElementById('checkoutTotal')?.innerText) || 0;
        if (mode === 'Cash') {
            setupCheckoutTenderEngine(cTot);
        } else if (mode === 'UPI') {
            renderCheckoutUpiQr(cTot);
        }
    } else if (context === 'edit') { 
        const editModeInput = document.getElementById('editSelectedPaymentMode');
        if (editModeInput) editModeInput.value = mode; 
        document.querySelectorAll('#editOrderModal .pay-btn').forEach(b => b.classList.remove('selected')); 
        const btn = document.getElementById('editBtnPay' + mode);
        if (btn) btn.classList.add('selected'); 
    }
}
window.selectPayment = selectPayment;

// ⚡ Factor 5: Fast Cash Tender Engine
function setupCheckoutTenderEngine(orderTotal) {
    const denomRow = document.getElementById('checkoutDenomPills');
    const tenderInput = document.getElementById('checkoutCashTenderedInput');
    if (!tenderInput) return;

    tenderInput.value = orderTotal > 0 ? orderTotal.toFixed(2) : '';
    onCashTenderedChange(tenderInput.value);

    if (!denomRow) return;

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

    const sorted = Array.from(denoms).sort((a, b) => a - b).slice(0, 5);

    denomRow.innerHTML = sorted.map(d => {
        const isExact = Math.abs(d - orderTotal) < 0.01;
        const label = isExact ? `Exact (₹${orderTotal.toFixed(0)})` : `₹${d}`;
        const activeClass = isExact ? 'active' : '';
        return `<button type="button" class="denom-pill ${activeClass}" onclick="setTenderAmount(${d}, this)">${label}</button>`;
    }).join('');
}
window.setupCheckoutTenderEngine = setupCheckoutTenderEngine;

function setTenderAmount(amount, btnEl) {
    const tenderInput = document.getElementById('checkoutCashTenderedInput');
    if (tenderInput) {
        tenderInput.value = Number(amount).toFixed(2);
        onCashTenderedChange(tenderInput.value);
    }
    if (btnEl) {
        document.querySelectorAll('#checkoutDenomPills .denom-pill').forEach(p => p.classList.remove('active'));
        btnEl.classList.add('active');
    }
}
window.setTenderAmount = setTenderAmount;

function onCashTenderedChange(val) {
    const orderTotal = parseFloat(document.getElementById('checkoutTotal')?.innerText) || 0;
    const tendered = parseFloat(val) || 0;
    const diff = tendered - orderTotal;

    const dueBox = document.getElementById('checkoutChangeDueBox');
    const dueLabel = document.getElementById('checkoutChangeDueLabel');
    const dueDisplay = document.getElementById('checkoutChangeDueDisplay');

    if (!dueBox || !dueDisplay) return;

    if (diff >= 0) {
        dueBox.classList.remove('shortage');
        if (dueLabel) dueLabel.innerText = 'Change Due to Diner:';
        dueDisplay.innerText = `₹${diff.toFixed(2)}`;
    } else {
        dueBox.classList.add('shortage');
        if (dueLabel) dueLabel.innerText = 'Amount Short:';
        dueDisplay.innerText = `₹${Math.abs(diff).toFixed(2)}`;
    }

    document.querySelectorAll('#checkoutDenomPills .denom-pill').forEach(p => {
        const text = p.innerText;
        if ((text.includes('Exact') && Math.abs(tendered - orderTotal) < 0.01) || text === `₹${tendered}`) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });
}
window.onCashTenderedChange = onCashTenderedChange;

// 📱 Factor 5: In-Modal Dynamic UPI QR Preview
function renderCheckoutUpiQr(amount) {
    const canvasHolder = document.getElementById('checkoutModalQrCanvas');
    const amtDisplay = document.getElementById('checkoutUpiAmtDisplay');
    if (amtDisplay) amtDisplay.innerText = amount.toFixed(2);
    if (!canvasHolder) return;
    canvasHolder.innerHTML = '';

    const upiId = shopProfile.upiId || '';
    if (!upiId) {
        canvasHolder.innerHTML = `<div style="padding: 16px 8px; color: var(--text-muted); font-size: 11px; max-width: 180px;">No UPI ID configured.<br><a href="#" onclick="document.getElementById('checkoutModal').style.display='none'; openSettingsModal(); return false;" style="color: var(--primary); font-weight: 700; text-decoration: underline; margin-top: 6px; display: inline-block;">Configure in Settings</a></div>`;
        return;
    }

    const shopName = shopProfile.name || shopProfile.shopName || 'billnaw';
    const upiString = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName)}&am=${amount.toFixed(2)}&cu=INR`;

    if (window.QRCode) {
        new QRCode(canvasHolder, {
            text: upiString,
            width: 160,
            height: 160,
            colorDark: "#2B1C15",
            colorLight: "#FFFFFF",
            correctLevel: QRCode.CorrectLevel.M
        });
    } else {
        canvasHolder.innerHTML = `<div style="font-size:11px; color:var(--text-muted);">QR Code Generator Loading...</div>`;
    }
}
window.renderCheckoutUpiQr = renderCheckoutUpiQr;

function openCheckoutModal() {
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || tInfo.items.length === 0) return showToast(`Table ${activeTable} is empty!`);
    const totals = calculateOrderTotals(tInfo.items, tInfo.discount);
    
    const cTot = document.getElementById('checkoutTotal'); if (cTot) cTot.innerText = totals.finalTotal.toFixed(2); 
    const cTable = document.getElementById('checkoutTableNoDisplay'); if (cTable) cTable.innerText = activeTable; 
    const cItems = document.getElementById('checkoutTotalItems'); if (cItems) cItems.innerText = tInfo.items.length;
    const cType = document.getElementById('checkoutOrderType'); if (cType) cType.value = "Dine-In"; 

    // Checkout Discount Breakdown
    const discBox = document.getElementById('checkoutDiscountBreakdown');
    const discPrompt = document.getElementById('checkoutAddDiscountPrompt');
    const grossSubEl = document.getElementById('checkoutGrossSubtotal');
    const discLabelEl = document.getElementById('checkoutDiscountLabel');
    const discAmtEl = document.getElementById('checkoutDiscountAmt');
    const gstNoteEl = document.getElementById('checkoutGstNote');

    if (tInfo.discount && totals.discountAmount > 0) {
        if (discBox) discBox.style.display = 'block';
        if (discPrompt) discPrompt.style.display = 'none';
        if (grossSubEl) grossSubEl.innerText = `₹${totals.grossSubtotal.toFixed(2)}`;
        if (discLabelEl) {
            const dType = tInfo.discount.type === 'percent' ? `${tInfo.discount.value}%` : 'Fixed';
            discLabelEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span>Discount (${dType}${tInfo.discount.reason ? ' • ' + escapeHtml(tInfo.discount.reason) : ''}):</span>`;
        }
        if (discAmtEl) discAmtEl.innerText = `-₹${totals.discountAmount.toFixed(2)}`;
        if (gstNoteEl) {
            const taxPct = totals.finalTotal > 0 ? ((totals.totalTax / totals.finalTotal) * 100).toFixed(1) : '0';
            gstNoteEl.innerHTML = totals.gstMode === 'exclusive' 
                ? `+₹${totals.totalTax.toFixed(2)} GST Added <span class="gst-pct-pill">Just ${taxPct}%</span>` 
                : (totals.gstMode === 'none' ? 'Tax Exempt' : `Includes ₹${totals.totalTax.toFixed(2)} GST <span class="gst-pct-pill">Just ${taxPct}%</span>`);
        }
    } else {
        if (discBox) discBox.style.display = 'none';
        if (discPrompt) discPrompt.style.display = shopProfile.discountsEnabled !== false ? 'block' : 'none';
    }
    
    selectPayment('Cash', 'checkout');
    setupCheckoutTenderEngine(totals.finalTotal);
    
    if (typeof populateCheckoutCustomerDropdown === 'function') {
        populateCheckoutCustomerDropdown();
    }
    if (selectedCustomerForOrder) {
        const cust = customersList.find(c => String(c.id) === String(selectedCustomerForOrder));
        if (cust) {
            const selectEl = document.getElementById('checkoutCustomerSelect');
            if (selectEl) selectEl.value = cust.id;
            if (typeof onCheckoutCustomerSelect === 'function') onCheckoutCustomerSelect(cust.id);
        } else {
            if (typeof resetCheckoutCustomerFields === 'function') resetCheckoutCustomerFields();
        }
    } else {
        if (typeof resetCheckoutCustomerFields === 'function') resetCheckoutCustomerFields();
    }
    
    const bNameInput = document.getElementById('checkoutBillerName');
    if (bNameInput) bNameInput.value = currentStaff ? currentStaff.name : 'Admin';
    
    document.getElementById('cartDrawer')?.classList.remove('open'); 
    document.getElementById('cartDrawerOverlay')?.classList.remove('show'); 
    const cModal = document.getElementById('checkoutModal');
    if (cModal) cModal.style.display = 'flex';
}
window.openCheckoutModal = openCheckoutModal;

function executeHtmlPrint(divId) {
    return new Promise(resolve => {
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
        
        let qrScript = '';
        const qrCanvas = document.querySelector('#printQrCode canvas');
        if (qrCanvas && shopProfile.showQr && shopProfile.upiId) {
            qrScript = `<div style="text-align:center; margin-top:15px;"><div style="font-weight:bold;font-size:14px;margin-bottom:5px;">SCAN TO PAY</div><img src="${qrCanvas.toDataURL('image/png')}" style="margin:0 auto; display:block; width:180px; height:180px; image-rendering: pixelated;"></div>`;
        }
        
        const printElem = document.getElementById(divId);
        const content = printElem ? printElem.innerHTML : '';
        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(`<html><head><title>Receipt</title><style>body{font-family:'Courier New',Courier,monospace;font-size:12px;color:#000;margin:0;padding:10px;width:300px;}.print-center{text-align:center;}.print-row{display:flex;justify-content:space-between;margin-bottom:5px;}.print-line{border-bottom:1px dashed #000;margin:8px 0;}img{max-width:50px;filter:grayscale(100%) contrast(200%);margin-bottom:5px;}</style></head><body>${content} ${qrScript}</body></html>`);
        doc.close();
        setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print(); resolve(); }, 500);
    });
}
window.executeHtmlPrint = executeHtmlPrint;

async function confirmCheckout() {
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || tInfo.items.length === 0) return showToast(`Table ${activeTable} is empty!`);
    
    const payBtn = document.querySelector('#checkoutModal .btn-success');
    if (payBtn) {
        payBtn.disabled = true; 
        payBtn.innerHTML = printCharacteristic 
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Printing Receipt...</span>' 
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Generating Receipt...</span>';
    }
    const cModal = document.getElementById('checkoutModal');
    if (cModal) cModal.style.display = 'none';
    
    try {
        const totals = calculateOrderTotals(tInfo.items, tInfo.discount);
        const total = totals.finalTotal;
        const itemNames = tInfo.items.map(i => `${i.name} (x${i.qty})`).join(', ');

        const oType = document.getElementById('checkoutOrderType')?.value || 'Dine-In'; 
        const pMode = document.getElementById('selectedPaymentMode')?.value || 'Cash';
        const tenderVal = parseFloat(document.getElementById('checkoutCashTenderedInput')?.value);
        const amountTendered = pMode === 'Cash' ? (!isNaN(tenderVal) ? tenderVal : total) : total;
        const changeReturned = pMode === 'Cash' ? Math.max(0, amountTendered - total) : 0;
        const cName = document.getElementById('checkoutCustomerName')?.value.trim() || '';
        const cId = document.getElementById('checkoutCustomerId')?.value || '';
        const bName = document.getElementById('checkoutBillerName')?.value.trim() || (currentStaff?.name || 'Admin');
        const fullDateStr = new Date().toLocaleString(); 
        const safeFilterDate = getLocalISODate(); 
        const finalTableStr = oType === 'Takeaway' ? 'Takeaway' : getTableName(activeTable);

        const currentStartNo = shopProfile.startInvoiceNo || 1001; 
        const highestExistingBill = orderHistory.length > 0 ? Math.max(...orderHistory.map(o => o.billNo || 0)) : 0;
        const generatedBillNo = Math.max(currentStartNo, highestExistingBill + 1);

        const newOrder = { 
            id: Date.now(), 
            billNo: generatedBillNo, 
            date: fullDateStr, 
            filterDate: safeFilterDate, 
            table: finalTableStr, 
            tableId: activeTable,
            orderType: oType, 
            paymentMode: pMode, 
            amountTendered: amountTendered,
            changeReturned: changeReturned,
            customer: cName, 
            biller: bName, 
            items: itemNames, 
            rawItems: JSON.parse(JSON.stringify(tInfo.items)), 
            amount: total,
            grossSubtotal: totals.grossSubtotal,
            discount: tInfo.discount ? JSON.parse(JSON.stringify(tInfo.discount)) : null,
            discountAmount: totals.discountAmount,
            subtotal: totals.subtotal,
            tax: totals.totalTax,
            gstMode: totals.gstMode
        };
        
        // --- CUSTOMER & LOYALTY HISTORY RECORDING ---
        let matchedCustomer = null;
        if (cId) {
            matchedCustomer = customersList.find(c => String(c.id) === String(cId));
        }
        if (!matchedCustomer && cName) {
            const digits = (cName.match(/\d{6,15}/) || [''])[0];
            matchedCustomer = customersList.find(c => (digits && c.phone && c.phone.includes(digits)) || (c.name && c.name.toLowerCase() === cName.toLowerCase()));
        }

        const ptsEarned = Math.max(1, Math.floor(total / 50));

        if (matchedCustomer) {
            matchedCustomer.totalVisits = (matchedCustomer.totalVisits || 0) + 1;
            matchedCustomer.totalSpend = (matchedCustomer.totalSpend || 0) + total;
            matchedCustomer.loyaltyPoints = (matchedCustomer.loyaltyPoints || 0) + ptsEarned;
            matchedCustomer.lastVisitDate = new Date().toLocaleDateString();
            if (!matchedCustomer.history) matchedCustomer.history = [];
            matchedCustomer.history.unshift({
                orderId: newOrder.id,
                billNo: generatedBillNo,
                date: fullDateStr,
                amount: total,
                items: itemNames,
                pointsEarned: ptsEarned
            });
            persistCustomersFirebase(matchedCustomer);
            if (typeof renderCustomersUI === 'function') renderCustomersUI();
            if (typeof populateCheckoutCustomerDropdown === 'function') populateCheckoutCustomerDropdown();
            showToast(`⭐ +${ptsEarned} Loyalty Pts added for ${matchedCustomer.name}!`);
        } else if (cName) {
            const digits = (cName.match(/\d{10}/) || [''])[0];
            const cleanName = cName.replace(/\(\d+\)/g, '').trim();
            const newCust = {
                id: Date.now(),
                name: cleanName || cName,
                phone: digits || '',
                notes: 'Registered from checkout',
                totalVisits: 1,
                totalSpend: total,
                loyaltyPoints: ptsEarned,
                createdDate: new Date().toISOString().split('T')[0],
                lastVisitDate: new Date().toLocaleDateString(),
                history: [{
                    orderId: newOrder.id,
                    billNo: generatedBillNo,
                    date: fullDateStr,
                    amount: total,
                    items: itemNames,
                    pointsEarned: ptsEarned
                }]
            };
            customersList.unshift(newCust);
            persistCustomersFirebase(newCust);
            if (typeof renderCustomersUI === 'function') renderCustomersUI();
            if (typeof populateCheckoutCustomerDropdown === 'function') populateCheckoutCustomerDropdown();
        }
        selectedCustomerForOrder = null;

        tInfo.items.forEach(cartItem => { 
            const mItem = menuItems.find(m => m.id === cartItem.id); 
            if (mItem && mItem.trackStock) { 
                mItem.stockQty -= cartItem.qty; 
                if (mItem.stockQty < 0) mItem.stockQty = 0; 
            } 
        });
        persistMenu(); 
        orderHistory.unshift(newOrder); 
        persistHistoryFirebase(newOrder); 
        if (typeof deductInventoryForOrder === 'function') deductInventoryForOrder(newOrder);
        tablesInfo[activeTable] = { items: [], status: 'empty', savedTime: null, lastReminder: null }; 
        persistTables(); 
        
        if (typeof pushToGoogleSheetsQueue === 'function') pushToGoogleSheetsQueue('addOrder', newOrder); 
        syncTableUI(); 
        updateCartUI(); 
        if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities();
        
        showToast("✅ Payment recorded & Table cleared.");
        await sendEscPosToPrinter(newOrder);

    } catch (e) { 
        console.error(e); 
        showToast("❌ Error processing checkout."); 
    } 
    finally { 
        if (payBtn) {
            payBtn.disabled = false; 
            payBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg><span class="btn-text">Pay &amp; Print</span>'; 
        }
    }
}
window.confirmCheckout = confirmCheckout;

// --- THERMAL PRINTER ESC/POS UTILITIES ---
let bleDevice = null; 
let bleServer = null; 
let printCharacteristic = null;

async function getLogoBytes(base64Image) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); 
            const ctx = canvas.getContext('2d');
            const maxWidth = 200; 
            let width = img.width; 
            let height = img.height;
            if (width > maxWidth) { 
                const ratio = maxWidth / width; 
                width = maxWidth; 
                height = height * ratio; 
            }
            width = Math.floor(width / 8) * 8; 
            height = Math.floor(height);
            canvas.width = width; 
            canvas.height = height;
            ctx.fillStyle = 'white'; 
            ctx.fillRect(0, 0, width, height); 
            ctx.imageSmoothingEnabled = false; 
            ctx.drawImage(img, 0, 0, width, height);
            const imgData = ctx.getImageData(0, 0, width, height).data; 
            const widthBytes = width / 8;
            const data = new Uint8Array(8 + (widthBytes * height));
            data[0] = 0x1D; data[1] = 0x76; data[2] = 0x30; data[3] = 0x00;
            data[4] = widthBytes & 0xFF; data[5] = (widthBytes >> 8) & 0xFF;
            data[6] = height & 0xFF; data[7] = (height >> 8) & 0xFF;
            let offset = 8;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x += 8) {
                    let byte = 0;
                    for (let b = 0; b < 8; b++) {
                        const idx = ((y * width) + x + b) * 4;
                        const brightness = (imgData[idx] * 0.299 + imgData[idx + 1] * 0.587 + imgData[idx + 2] * 0.114);
                        if (brightness < 128) byte |= (1 << (7 - b)); 
                    }
                    data[offset++] = byte;
                }
            }
            resolve(data);
        };
        img.onerror = () => resolve(null); 
        img.src = base64Image;
    });
}
window.getLogoBytes = getLogoBytes;

async function connectBluetoothPrinter() {
    const btn = document.getElementById('btnBleStatus');
    const originalText = btn ? btn.innerHTML : '📡 Search & Pair Printer';
    try {
        if (!navigator.bluetooth) { 
            alert("❌ BLUETOOTH NOT SUPPORTED!\n\nApple iOS (iPhone/iPad) blocks Web Bluetooth. You must use Android Chrome, Windows Chrome, or Mac Chrome."); 
            return; 
        }
        if (!window.isSecureContext) { 
            alert("❌ INSECURE CONNECTION!\n\nWeb Bluetooth ONLY works on 'https://' websites."); 
            return; 
        }
        if (btn) btn.innerHTML = "⏳ Searching...";
        showToast("Looking for printers...");
        bleDevice = await navigator.bluetooth.requestDevice({ 
            acceptAllDevices: true, 
            optionalServices: [ 
                '000018f0-0000-1000-8000-00805f9b34fb', 
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2', 
                '49535343-fe7d-4ae5-8fa9-9fafd205e455', 
                '0000fee7-0000-1000-8000-00805f9b34fb' 
            ] 
        });
        bleDevice.addEventListener('gattserverdisconnected', () => {
            alert("⚠️ Printer Disconnected!");
            printCharacteristic = null;
            if (btn) {
                btn.innerHTML = "📡 Search & Pair Printer";
                btn.style.background = "transparent";
                btn.style.color = "var(--accent)";
            }
        });
        bleServer = await bleDevice.gatt.connect();
        const services = await bleServer.getPrimaryServices();
        for (let service of services) {
            const characteristics = await service.getCharacteristics();
            for (let characteristic of characteristics) {
                if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                    printCharacteristic = characteristic;
                    showToast("🖨️ Printer Connected Successfully!");
                    if (btn) {
                        btn.innerHTML = "✅ Connected";
                        btn.style.background = "var(--success)";
                        btn.style.color = "#fff";
                    }
                    return;
                }
            }
        }
        alert("❌ Printer paired, but it does not support standard text printing.");
        if (btn) btn.innerHTML = originalText;
        bleDevice.gatt.disconnect();
    } catch (error) { 
        console.error(error);
        if (btn) btn.innerHTML = originalText;
        if(error.name === 'NotFoundError') { showToast("❌ Pairing cancelled by user."); }
        else if (error.name === 'SecurityError') { alert("❌ SECURITY ERROR: Browser blocked Bluetooth access."); }
        else if (error.name === 'NotAllowedError') { alert("❌ PERMISSION DENIED: Grant Bluetooth permissions in device settings."); }
        else { alert("❌ BLUETOOTH ERROR:\n" + error.message); }
    }
}
window.connectBluetoothPrinter = connectBluetoothPrinter;

async function sendEscPosToPrinter(order) {
    let gstSummary = {}; 
    const gstMode = order.gstMode || getStoreGstConfig().mode;
    const { defaultRate } = getStoreGstConfig();
    let rawSubtotal = 0;
    let totalTax = 0;
    const hasDiscount = order.discountAmount && Number(order.discountAmount) > 0;
    const discountAmount = hasDiscount ? Number(order.discountAmount) : 0;
    const grossSubtotal = order.grossSubtotal || (order.rawItems.reduce((s, i) => s + (i.price * i.qty), 0));

    const qrCodeDiv = document.getElementById('printQrCode');
    if (qrCodeDiv) {
        qrCodeDiv.innerHTML = '';
        if (shopProfile.showQr && shopProfile.upiId && window.QRCode) {
            const upiString = `upi://pay?pa=${shopProfile.upiId}&pn=${encodeURIComponent(shopProfile.name)}&am=${order.amount.toFixed(2)}&cu=INR`;
            new QRCode(qrCodeDiv, { text: upiString, width: 256, height: 256, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L });
            await new Promise(r => setTimeout(r, 50)); 
        }
    }

    if (!printCharacteristic) {
        const pBillNo = document.getElementById('printBillNo'); if (pBillNo) pBillNo.innerText = order.billNo;
        const pDate = document.getElementById('printDate'); if (pDate) pDate.innerText = order.date;
        const pTableNoRow = document.getElementById('printTableNoRow');
        const pTableNo = document.getElementById('printTableNo');
        if (pTableNoRow) {
            if(order.orderType === 'Takeaway') { pTableNoRow.style.display = 'none'; }
            else { pTableNoRow.style.display = 'block'; if (pTableNo) pTableNo.innerText = String(order.table || 'T1'); }
        }
        const pOrderType = document.getElementById('printOrderType'); if (pOrderType) pOrderType.innerText = order.orderType;
        const pPayMode = document.getElementById('printPayMode'); if (pPayMode) pPayMode.innerText = order.paymentMode;
        const pCustRow = document.getElementById('printCustomerRow');
        const pCust = document.getElementById('printCustomer');
        if (pCustRow) { if(order.customer) { pCustRow.style.display = 'block'; if (pCust) pCust.innerText = order.customer; } else { pCustRow.style.display = 'none'; } }
        const pBillerRow = document.getElementById('printBillerRow');
        const pBiller = document.getElementById('printBiller');
        if (pBillerRow) { if(order.biller) { pBillerRow.style.display = 'block'; if (pBiller) pBiller.innerText = order.biller; } else { pBillerRow.style.display = 'none'; } }
        
        const printItemsEl = document.getElementById('printItems');
        if (printItemsEl) {
            printItemsEl.innerHTML = ''; 
            order.rawItems.forEach(item => { 
                let itemTotal = item.price * item.qty; 
                let gst = (item.gstRate !== undefined && item.gstRate !== null && !isNaN(item.gstRate) && Number(item.gstRate) > 0) ? Number(item.gstRate) : defaultRate;
                if (gstMode === 'none') gst = 0;

                printItemsEl.innerHTML += `<div class="print-row"><span>${escapeHtml(item.name)} x${item.qty}</span><span>₹${itemTotal.toFixed(2)}</span></div>`; 
            });

            // Use order totals if available, otherwise recalculate
            const totals = calculateOrderTotals(order.rawItems, order.discount || (hasDiscount ? { type: 'fixed', value: discountAmount } : null));
            rawSubtotal = totals.subtotal;
            totalTax = totals.totalTax;
            gstSummary = totals.gstSummary || {};

            if (hasDiscount || gstMode === 'exclusive') {
                printItemsEl.innerHTML += `<div class="print-line"></div>`;
                if (hasDiscount) {
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Gross Subtotal</span><span>₹${grossSubtotal.toFixed(2)}</span></div>`;
                    const dLabel = order.discount && order.discount.type === 'percent' ? `Discount (${order.discount.value}%)` : 'Discount (Flat)';
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600; color:#c00;"><span>${dLabel}</span><span>-₹${discountAmount.toFixed(2)}</span></div>`;
                }
                if (gstMode === 'exclusive' && totalTax > 0) {
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Net Taxable Subtotal</span><span>₹${rawSubtotal.toFixed(2)}</span></div>`;
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Total GST</span><span>₹${totalTax.toFixed(2)}</span></div>`;
                }
            }

            if(Object.keys(gstSummary).length > 0 && gstMode !== 'none') {
                let htmlGstContent = '<div class="print-line"></div><div style="font-weight:600; font-size:12px; margin-bottom:5px;">--- GST Breakdown ---</div>';
                for(let rate in gstSummary) {
                    let base = gstSummary[rate].base.toFixed(2); let half = (gstSummary[rate].tax / 2).toFixed(2);
                    htmlGstContent += `<div style="font-size:11px; color:#444; margin-bottom:6px;"><div style="display:flex; justify-content:space-between;"><span>Taxable Value (${rate}%)</span><span>₹${base}</span></div><div style="display:flex; justify-content:space-between;"><span>CGST @ ${rate/2}%</span><span>₹${half}</span></div><div style="display:flex; justify-content:space-between;"><span>SGST @ ${rate/2}%</span><span>₹${half}</span></div></div>`;
                }
                printItemsEl.innerHTML += htmlGstContent;
            }

            if (order.paymentMode === 'Cash' && order.amountTendered && order.amountTendered > order.amount) {
                printItemsEl.innerHTML += `<div class="print-line"></div>`;
                printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Cash Tendered</span><span>₹${Number(order.amountTendered).toFixed(2)}</span></div>`;
                printItemsEl.innerHTML += `<div class="print-row" style="font-weight:700; color:#266838;"><span>Change Due</span><span>₹${Number(order.changeReturned).toFixed(2)}</span></div>`;
            }
        }
        const pTot = document.getElementById('printTotal'); if (pTot) pTot.innerText = `₹${order.amount.toFixed(2)}`;
        
        await executeHtmlPrint('print-receipt');
        return;
    }

    const ESC = '\x1B'; const GS = '\x1D'; const INIT = ESC + '@'; 
    const ALIGN_CENTER = ESC + 'a\x01'; const ALIGN_LEFT = ESC + 'a\x00'; const BOLD_ON = ESC + 'E\x01'; const BOLD_OFF = ESC + 'E\x00'; const DOUBLE_SIZE = GS + '!\x11'; const NORMAL_SIZE = GS + '!\x00';

    let receiptText = INIT;
    receiptText += ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON + shopProfile.name + '\n' + NORMAL_SIZE + BOLD_OFF;
    if(shopProfile.address) receiptText += shopProfile.address + '\n';
    if(shopProfile.fssai) receiptText += 'FSSAI: ' + shopProfile.fssai + '\n';
    if(shopProfile.gstin) receiptText += 'GSTIN: ' + shopProfile.gstin + '\n';
    receiptText += '--------------------------------\n'; 
    receiptText += ALIGN_LEFT;
    receiptText += BOLD_ON + 'Invoice: #' + (order.billNo || 'TEST') + '\n' + BOLD_OFF;
    if(order.orderType !== 'Takeaway') receiptText += 'Table: ' + String(order.table).replace('Table ', '') + '\n';
    receiptText += 'Date: ' + order.date + '\n';
    receiptText += 'Type: ' + (order.orderType || 'Dine-In') + '\n';
    receiptText += 'Payment: ' + (order.paymentMode || 'Cash') + '\n';
    if(order.customer) receiptText += 'Customer: ' + order.customer + '\n';
    if(order.biller) receiptText += 'Staff: ' + order.biller + '\n';
    receiptText += '--------------------------------\n';

    order.rawItems.forEach(item => {
        let qtyName = `${item.qty}x ${item.name}`; 
        let priceStr = (item.price * item.qty).toFixed(2);
        if (qtyName.length + priceStr.length > 31) { 
            receiptText += qtyName.substring(0, 32) + '\n'; 
            receiptText += priceStr.padStart(32, ' ') + '\n'; 
        } else { 
            receiptText += qtyName.padEnd(32 - priceStr.length, ' ') + priceStr + '\n'; 
        }
    });

    const calculatedTotals = calculateOrderTotals(order.rawItems, order.discount || (hasDiscount ? { type: 'fixed', value: discountAmount } : null));
    rawSubtotal = calculatedTotals.subtotal;
    totalTax = calculatedTotals.totalTax;
    gstSummary = calculatedTotals.gstSummary || {};

    receiptText += '--------------------------------\n';
    if (hasDiscount) {
        receiptText += `Gross Amount:`.padEnd(20, ' ') + `Rs.${grossSubtotal.toFixed(2)}`.padStart(12, ' ') + '\n';
        const dLabel = order.discount && order.discount.type === 'percent' ? `Discount (${order.discount.value}%):` : `Discount:`;
        receiptText += dLabel.padEnd(20, ' ') + `-Rs.${discountAmount.toFixed(2)}`.padStart(12, ' ') + '\n';
    }
    if (gstMode === 'exclusive' && totalTax > 0) {
        receiptText += `Subtotal:`.padEnd(20, ' ') + `Rs.${rawSubtotal.toFixed(2)}`.padStart(12, ' ') + '\n';
        receiptText += `GST Tax:`.padEnd(20, ' ') + `Rs.${totalTax.toFixed(2)}`.padStart(12, ' ') + '\n';
    }
    if (hasDiscount || (gstMode === 'exclusive' && totalTax > 0)) {
        receiptText += '--------------------------------\n';
    }

    if (Object.keys(gstSummary).length > 0 && gstMode !== 'none') {
        receiptText += ALIGN_CENTER + '--- GST BREAKDOWN ---\n' + ALIGN_LEFT;
        for(let rate in gstSummary) {
            let base = gstSummary[rate].base.toFixed(2); 
            let halfGst = (gstSummary[rate].tax / 2).toFixed(2);
            receiptText += `Taxable Value (${rate}%)`.padEnd(22, ' ') + base.padStart(10, ' ') + '\n';
            receiptText += `CGST @ ${rate/2}%`.padEnd(22, ' ') + halfGst.padStart(10, ' ') + '\n';
            receiptText += `SGST @ ${rate/2}%`.padEnd(22, ' ') + halfGst.padStart(10, ' ') + '\n';
            receiptText += '\n';
        }
        receiptText += '--------------------------------\n';
    }

    receiptText += ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON + `TOTAL: Rs.${order.amount.toFixed(2)}\n` + NORMAL_SIZE + BOLD_OFF;
    receiptText += '--------------------------------\n';

    if (order.paymentMode === 'Cash' && order.amountTendered && order.amountTendered > order.amount) {
        receiptText += ALIGN_LEFT;
        receiptText += `Cash Tendered:`.padEnd(20, ' ') + `Rs.${Number(order.amountTendered).toFixed(2)}`.padStart(12, ' ') + '\n';
        receiptText += `Change Due:`.padEnd(20, ' ') + `Rs.${Number(order.changeReturned).toFixed(2)}`.padStart(12, ' ') + '\n';
        receiptText += '--------------------------------\n';
    }

    let payloads = [];
    
    if (shopProfile.logo) {
        const logoBytes = await getLogoBytes(shopProfile.logo);
        if (logoBytes) { 
            payloads.push(new Uint8Array([0x1B, 0x61, 0x01])); 
            payloads.push(logoBytes); 
            payloads.push(new Uint8Array([0x0A])); 
        }
    }

    payloads.push(new TextEncoder().encode(receiptText));

    if (shopProfile.showQr && shopProfile.upiId) {
        const qrCanvas = qrCodeDiv ? qrCodeDiv.querySelector('canvas') : null;
        if (qrCanvas) {
            const qrBytes = await getLogoBytes(qrCanvas.toDataURL('image/jpeg', 1.0));
            if (qrBytes) {
                payloads.push(new Uint8Array([0x1B, 0x61, 0x01]));
                payloads.push(new TextEncoder().encode("\nScan to Pay\n"));
                payloads.push(qrBytes);
                payloads.push(new Uint8Array([0x0A]));
            }
        }
    }

    payloads.push(new TextEncoder().encode(ALIGN_CENTER + 'Thank You! Visit Again\n\x0A\x0A\x0A\x0A\x1B\x6D'));

    let totalLength = payloads.reduce((sum, p) => sum + p.length, 0);
    let finalPayload = new Uint8Array(totalLength);
    let offset = 0; 
    for (let p of payloads) { 
        finalPayload.set(p, offset); 
        offset += p.length; 
    }

    const CHUNK_SIZE = 100; 
    try { 
        for (let i = 0; i < finalPayload.length; i += CHUNK_SIZE) { 
            const chunk = finalPayload.slice(i, i + CHUNK_SIZE); 
            await printCharacteristic.writeValue(chunk); 
            await new Promise(resolve => setTimeout(resolve, 40)); 
        } 
    } catch(e) { 
        console.error(e); 
        showToast("❌ Print Failed. Printer might be off."); 
    }
}
window.sendEscPosToPrinter = sendEscPosToPrinter;

async function sendKotToPrinter(tableNo, items) {
    if (!printCharacteristic) {
        const kotTable = document.getElementById('printKotTableNo'); if (kotTable) kotTable.innerText = tableNo;
        const kotTime = document.getElementById('printKotTime'); if (kotTime) kotTime.innerText = new Date().toLocaleTimeString();
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<div style="display:flex; justify-content:space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px;"><span>${item.name}</span><span style="font-size:18px;">x${item.qty}</span></div>`;
        });
        const kotItems = document.getElementById('printKotItems');
        if (kotItems) kotItems.innerHTML = itemsHtml;
        await executeHtmlPrint('print-kot');
        return;
    }

    const ESC = '\x1B'; const GS = '\x1D'; const INIT = ESC + '@'; const ALIGN_CENTER = ESC + 'a\x01'; const ALIGN_LEFT = ESC + 'a\x00'; const BOLD_ON = ESC + 'E\x01'; const BOLD_OFF = ESC + 'E\x00'; const DOUBLE_SIZE = GS + '!\x11'; const NORMAL_SIZE = GS + '!\x00'; const FEED_AND_CUT = '\x0A\x0A\x0A\x0A' + ESC + 'm'; 

    let kotText = INIT; 
    kotText += ALIGN_CENTER + BOLD_ON + "KITCHEN TICKET\n" + BOLD_OFF; 
    kotText += "--------------------------------\n"; 
    kotText += DOUBLE_SIZE + BOLD_ON + `TABLE: ${tableNo}\n` + NORMAL_SIZE + BOLD_OFF; 
    kotText += `Time: ${new Date().toLocaleTimeString()}\n`; 
    kotText += "--------------------------------\n"; 
    kotText += ALIGN_LEFT;
    items.forEach(item => { 
        kotText += DOUBLE_SIZE + `${item.qty}x ${item.name}\n` + NORMAL_SIZE; 
        kotText += "--------------------------------\n"; 
    });
    kotText += ALIGN_CENTER + "*** END OF KOT ***\n" + FEED_AND_CUT;
    const encoder = new TextEncoder(); 
    const payload = encoder.encode(kotText); 
    const CHUNK_SIZE = 100; 
    try { 
        for (let i = 0; i < payload.length; i += CHUNK_SIZE) { 
            const chunk = payload.slice(i, i + CHUNK_SIZE); 
            await printCharacteristic.writeValue(chunk); 
            await new Promise(resolve => setTimeout(resolve, 40)); 
        } 
    } catch(e) { 
        console.error(e); 
        showToast("❌ KOT Print Failed."); 
    }
}
window.sendKotToPrinter = sendKotToPrinter;

async function printKitchenTicket() {
    const btn = document.querySelector('#kotModal .btn-warning'); 
    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = printCharacteristic 
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Printing KOT...</span>' 
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Generating KOT...</span>';
    }
    let tInfo = tablesInfo[activeTable];
    const currentTableName = getTableName(activeTable);
    try { 
        await sendKotToPrinter(currentTableName, tInfo.items); 
        const kotModal = document.getElementById('kotModal');
        if (kotModal) kotModal.style.display = 'none'; 
        showToast(`Table ${currentTableName} KOT Processed.`); 
    } catch(e) { 
        console.error(e); 
        showToast("Error processing KOT."); 
    } finally { 
        if (btn) {
            btn.disabled = false; 
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg><span class="btn-text">Print KOT</span>'; 
        }
    }
}
window.printKitchenTicket = printKitchenTicket;

function reprintReceipt(orderId) { 
    const order = orderHistory.find(o => o.id === orderId); 
    if (!order || !order.rawItems) return showToast("Cannot print old order details."); 
    sendEscPosToPrinter(order); 
}
window.reprintReceipt = reprintReceipt;

// ============================================================
// 🧾 BILL INVOICE PREVIEW MODAL HANDLERS
// ============================================================
let currentInvoiceOrder = null;

function viewOrderInvoiceModal(orderId) {
    const order = orderHistory.find(o => o.id === orderId);
    if (!order) return showToast("❌ Invoice details not found.");

    currentInvoiceOrder = order;
    const modal = document.getElementById('billInvoiceModal');
    if (!modal) return;

    // Set business headers
    const invShopName = document.getElementById('invModalShopName');
    if (invShopName) invShopName.innerText = shopProfile.name || "billnaw";

    const invShopAddr = document.getElementById('invModalShopAddress');
    if (invShopAddr) invShopAddr.innerText = shopProfile.address || "";

    const invShopFssai = document.getElementById('invModalShopFssai');
    if (invShopFssai) {
        if (shopProfile.fssai) {
            invShopFssai.style.display = 'block';
            invShopFssai.innerText = `FSSAI: ${shopProfile.fssai}`;
        } else {
            invShopFssai.style.display = 'none';
        }
    }

    const invShopGstin = document.getElementById('invModalShopGstin');
    if (invShopGstin) {
        if (shopProfile.gstin) {
            invShopGstin.style.display = 'block';
            invShopGstin.innerText = `GSTIN: ${shopProfile.gstin}`;
        } else {
            invShopGstin.style.display = 'none';
        }
    }

    // Invoice Meta
    const invBillNo = document.getElementById('invModalBillNo');
    if (invBillNo) invBillNo.innerText = `#${order.billNo || order.id}`;

    const invDate = document.getElementById('invModalDate');
    if (invDate) invDate.innerText = order.date || "";

    const invTable = document.getElementById('invModalTable');
    if (invTable) {
        invTable.innerText = order.orderType === 'Takeaway' ? 'Takeaway' : (order.table || 'Table 1');
    }

    const invOrderType = document.getElementById('invModalOrderType');
    if (invOrderType) invOrderType.innerText = order.orderType || 'Dine-In';

    const invPayMode = document.getElementById('invModalPayMode');
    if (invPayMode) invPayMode.innerText = order.paymentMode || 'Cash';

    const invCustomer = document.getElementById('invModalCustomer');
    if (invCustomer) invCustomer.innerText = order.customer || 'Walk-in Guest';

    const invBiller = document.getElementById('invModalBiller');
    if (invBiller) invBiller.innerText = order.biller || 'Cashier';

    // Items table rows
    const itemsTableBody = document.getElementById('invModalItemsBody');
    if (itemsTableBody && Array.isArray(order.rawItems)) {
        let itemsHtml = '';
        order.rawItems.forEach(item => {
            const itemTotal = (item.price || 0) * (item.qty || 1);
            itemsHtml += `
                <tr>
                    <td style="padding: 10px 8px; border-bottom: 1px solid var(--border); font-size: 13px;">
                        <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(item.name)}</div>
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: center; font-size: 13px; font-weight: 700;">
                        x${item.qty}
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: right; font-size: 13px; font-family: monospace;">
                        ₹${Number(item.price).toFixed(2)}
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: right; font-size: 13px; font-weight: 700; font-family: monospace;">
                        ₹${itemTotal.toFixed(2)}
                    </td>
                </tr>
            `;
        });
        itemsTableBody.innerHTML = itemsHtml;
    }

    // Calculations & Discounts
    const hasDiscount = Boolean(order.discountAmount && Number(order.discountAmount) > 0);
    const grossSubtotal = order.grossSubtotal !== undefined 
        ? order.grossSubtotal 
        : (Array.isArray(order.rawItems) ? order.rawItems.reduce((s, i) => s + (i.price * i.qty), 0) : order.amount);
    
    const grossEl = document.getElementById('invModalGrossSubtotal');
    if (grossEl) grossEl.innerText = `₹${grossSubtotal.toFixed(2)}`;

    const discountRow = document.getElementById('invModalDiscountRow');
    const discountLabel = document.getElementById('invModalDiscountLabel');
    const discountAmtEl = document.getElementById('invModalDiscountAmt');
    if (discountRow) {
        if (hasDiscount) {
            discountRow.style.display = 'flex';
            const typeStr = order.discount && order.discount.type === 'percent' ? `${order.discount.value}%` : 'Flat';
            const reasonStr = order.discount && order.discount.reason ? ` (${escapeHtml(order.discount.reason)})` : '';
            if (discountLabel) discountLabel.innerText = `🏷️ Discount ${typeStr}${reasonStr}:`;
            if (discountAmtEl) discountAmtEl.innerText = `-₹${Number(order.discountAmount).toFixed(2)}`;
        } else {
            discountRow.style.display = 'none';
        }
    }

    const netTaxableRow = document.getElementById('invModalTaxableRow');
    const netTaxableEl = document.getElementById('invModalTaxableAmt');
    if (netTaxableRow && netTaxableEl) {
        if (order.gstMode === 'exclusive' && (order.tax || 0) > 0) {
            netTaxableRow.style.display = 'flex';
            netTaxableEl.innerText = `₹${(order.subtotal || (order.amount - order.tax)).toFixed(2)}`;
        } else {
            netTaxableRow.style.display = 'none';
        }
    }

    const taxRow = document.getElementById('invModalTaxRow');
    const taxAmtEl = document.getElementById('invModalTaxAmt');
    if (taxRow && taxAmtEl) {
        if ((order.tax || 0) > 0) {
            taxRow.style.display = 'flex';
            taxAmtEl.innerText = `₹${Number(order.tax).toFixed(2)}`;
        } else {
            taxRow.style.display = 'none';
        }
    }

    const grandTotalEl = document.getElementById('invModalGrandTotal');
    if (grandTotalEl) grandTotalEl.innerText = `₹${Number(order.amount).toFixed(2)}`;

    // Set action buttons
    const printBtn = document.getElementById('invModalPrintBtn');
    if (printBtn) {
        printBtn.onclick = () => {
            sendEscPosToPrinter(order);
        };
    }

    modal.style.display = 'flex';
}
window.viewOrderInvoiceModal = viewOrderInvoiceModal;

function closeOrderInvoiceModal() {
    const modal = document.getElementById('billInvoiceModal');
    if (modal) modal.style.display = 'none';
}
window.closeOrderInvoiceModal = closeOrderInvoiceModal;

function printCurrentInvoiceModal() {
    if (currentInvoiceOrder) {
        sendEscPosToPrinter(currentInvoiceOrder);
    }
}
window.printCurrentInvoiceModal = printCurrentInvoiceModal;

function testThermalPrinter() { 
    const dummyOrder = { 
        billNo: 'TEST-999', 
        date: new Date().toLocaleString(), 
        orderType: 'Dine-In', 
        paymentMode: 'Cash', 
        amount: 270, 
        rawItems: [ 
            { name: "Standard Espresso", qty: 1, price: 80, gstRate: 5 }, 
            { name: "Water Bottle", qty: 2, price: 20, gstRate: 0 } 
        ] 
    }; 
    sendEscPosToPrinter(dummyOrder); 
}
window.testThermalPrinter = testThermalPrinter;

function markBilled(tableId) {
    const t = tableId || activeTable;
    let tInfo = tablesInfo[t];
    if (!tInfo || !tInfo.items || tInfo.items.length === 0) return (typeof showToast === 'function' ? showToast("Table empty!") : null);
    tInfo.status = 'billed';
    persistTables();
    syncTableUI();
    if (typeof showToast === 'function') showToast(`Table ${t} marked as Billed`);
}
window.markBilled = markBilled;

function renderLowStockNotifications() {
    const listEl = document.getElementById('lowStockAlertsList');
    const badgeEl = document.getElementById('topbarNotificationBadge');
    let alertCount = 0;
    let alertsHtml = '';

    // 1. Raw Materials Low Stock
    const rawMaterials = window.rawMaterials || (window.CULINARY_INVENTORY_ENGINE && window.CULINARY_INVENTORY_ENGINE.rawMaterials) || [];
    if (Array.isArray(rawMaterials)) {
        rawMaterials.forEach(rm => {
            const current = Number(rm.current_stock ?? rm.currentStock ?? 0);
            const min = Number(rm.min_threshold ?? rm.minStock ?? 5);
            if (current <= min) {
                alertCount++;
                alertsHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: #FEF2F2; border: 1px solid #FECACA; padding: 10px 12px; border-radius: 10px;">
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: #991B1B;">⚠️ ${rm.name || rm.material_id}</div>
                            <div style="font-size: 11px; color: #B91C1C;">Stock: ${current} ${rm.consumption_unit || rm.unit || 'units'} (Min: ${min})</div>
                        </div>
                        <button type="button" class="btn btn-outline" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 700; background: #FFFFFF; color: #991B1B; border-color: #FECACA;" onclick="if(window.openRestockModal) window.openRestockModal('${rm.material_id || rm.id}')">Restock</button>
                    </div>
                `;
            }
        });
    }

    // 2. Menu Items Low Stock
    const items = window.menuItems || [];
    if (Array.isArray(items)) {
        items.forEach(item => {
            if (item.trackStock && (Number(item.stockQty ?? item.stock ?? 0) <= 3)) {
                alertCount++;
                alertsHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: #FFFBEB; border: 1px solid #FDE68A; padding: 10px 12px; border-radius: 10px;">
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: #92400E;">📦 ${item.name}</div>
                            <div style="font-size: 11px; color: #B45309;">Only ${item.stockQty ?? item.stock ?? 0} left in stock</div>
                        </div>
                    </div>
                `;
            }
        });
    }

    if (listEl) {
        listEl.innerHTML = alertsHtml || '<div style="font-size: 13px; color: var(--text-muted); padding: 12px; text-align: center; background: var(--bg); border-radius: 10px;">All stock levels optimal ✅</div>';
    }

    // 3. Unpaid Table Alerts (>15 mins)
    const unpaidListEl = document.getElementById('unpaidTableAlertsList');
    let unpaidHtml = '';
    const now = Date.now();
    const currentTables = window.tablesInfo || {};
    for (let t = 1; t <= 12; t++) {
        const table = currentTables[t];
        const startTime = table ? (table.occupiedSince || table.savedTime) : null;
        if (table && table.status === 'occupied' && startTime) {
            const elapsedMins = Math.floor((now - startTime) / 60000);
            if (elapsedMins >= 15) {
                alertCount++;
                unpaidHtml += `
                    <div style="display: flex; align-items: center; justify-content: space-between; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 10px 12px; border-radius: 10px;">
                        <div>
                            <div style="font-size: 13px; font-weight: 700; color: #1E40AF;">🪑 Table ${t} (${elapsedMins}m)</div>
                            <div style="font-size: 11px; color: #3B82F6;">Occupied since ${new Date(startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                        </div>
                        <button type="button" class="btn btn-outline" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; font-weight: 700; background: #FFFFFF; color: #1E40AF; border-color: #BFDBFE;" onclick="selectTable(${t}); toggleNotificationDrawer(false);">View</button>
                    </div>
                `;
            }
        }
    }
    if (unpaidListEl) {
        unpaidListEl.innerHTML = unpaidHtml || '<div style="font-size: 13px; color: var(--text-muted); padding: 12px; text-align: center; background: var(--bg); border-radius: 10px;">No unpaid table alerts</div>';
    }

    if (badgeEl) {
        badgeEl.innerText = alertCount;
        badgeEl.style.display = alertCount > 0 ? 'inline-flex' : 'none';
    }
}
window.renderLowStockNotifications = renderLowStockNotifications;

function toggleNotificationDrawer(openState) {
    const drawer = document.getElementById('bellNotificationDrawer') || document.getElementById('notificationDrawer');
    const overlay = document.getElementById('notificationDrawerOverlay');
    const isOpen = drawer ? (drawer.classList.contains('open') || drawer.style.display === 'block') : false;
    const shouldOpen = typeof openState === 'boolean' ? openState : !isOpen;
    if (drawer) {
        if (shouldOpen) {
            renderLowStockNotifications();
            drawer.style.display = 'block';
            drawer.classList.add('open');
        } else {
            drawer.style.display = 'none';
            drawer.classList.remove('open');
        }
    }
    if (overlay) {
        if (shouldOpen) {
            overlay.style.display = 'block';
            overlay.classList.add('show');
        } else {
            overlay.style.display = 'none';
            overlay.classList.remove('show');
        }
    }
}
window.toggleNotificationDrawer = toggleNotificationDrawer;
window.closeNotificationDrawer = () => toggleNotificationDrawer(false);
