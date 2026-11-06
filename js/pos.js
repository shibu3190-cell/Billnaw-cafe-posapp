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
    const currentTableName = getTableName(activeTable);

    const delta = computeKotDelta(activeTable);
    if (!delta.hasNewItems) {
        showToast("KOT already sent for all items.", "info");
        const kotModal = document.getElementById('kotModal');
        if (kotModal) kotModal.style.display = 'none';
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24"><use href="#icon-printer"></use></svg><span class="btn-text">KOT Sent &#10003;</span>';
        }
        return;
    } 
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
    if(existing) existing.qty++; else tInfo.items.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, gstRate: menuItem.gstRate, qty: 1, image: menuItem.image || menuItem.image_url || '' });
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

function openQuickDiscountModal(bypassRoleCheck = false) {
    if (!bypassRoleCheck && typeof currentStaff !== 'undefined' && currentStaff) {
        const canDiscount = typeof hasPermission === 'function' ? hasPermission(currentStaff, 'can_apply_discount') : (currentStaff.role === 'Admin' || currentStaff.role === 'Manager');
        if (!canDiscount) {
            if (typeof requestManagerOverride === 'function') {
                requestManagerOverride({
                    title: "Manager Authorization Required",
                    actionDescription: `${currentStaff.role} role cannot apply discounts. Enter Manager or Admin PIN:`,
                    requiredRole: 'Manager',
                    onSuccess: () => {
                        openQuickDiscountModal(true);
                    }
                });
                return;
            }
        }
    }

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
        btn.innerText = currentDiscountModalType === 'percent' ? `${p}%` : `₹ ${p}`;
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

    if (grossEl) grossEl.innerText = `₹ ${totals.grossSubtotal.toFixed(2)}`;
    if (amtEl) amtEl.innerText = `-₹ ${totals.discountAmount.toFixed(2)}`;
    if (netEl) netEl.innerText = `₹ ${totals.finalTotal.toFixed(2)}`;
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
            return showToast(`⚠️ Fixed discount cannot exceed max limit of ₹ ${maxFixed}`);
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
    showToast(`🏷️ Discount of ${currentDiscountModalType === 'percent' ? val + '%' : '₹ ' + val} applied!`);
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
            const menuItem = (Array.isArray(window.menuItems) ? window.menuItems : []).find(m => String(m.id) === String(item.id));
            const itemImg = item.image || item.image_url || (menuItem && (menuItem.image || menuItem.image_url)) || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(item.name, item.category || (menuItem && menuItem.category)) : '') || '';
            const fallbackSrc = typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name, item.category || (menuItem && menuItem.category) || '') : 'assets/default-food.png';
            const finalThumbSrc = itemImg || fallbackSrc;
            const thumbHtml = `<img src="${finalThumbSrc}" alt="${escapeHtml(item.name)}" class="cart-item-thumb" loading="lazy" onerror="this.onerror=null; this.src='${fallbackSrc}';">`;

            cartDiv.innerHTML += `<div class="cart-item">
                ${thumbHtml}
                <div class="cart-item-info">
                    <div class="cart-item-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
                    <div class="cart-item-math">₹ ${item.price.toFixed(2)} each</div>
                </div>
                <div class="cart-item-right">
                    <span class="cart-item-price">₹ ${itemTotal.toFixed(2)}</span>
                    <div class="qty-pill">
                        <button type="button" onclick="modifyQty(${item.id}, -1, event)" aria-label="Decrease quantity">-</button>
                        <span>${item.qty}</span>
                        <button type="button" onclick="modifyQty(${item.id}, 1, event)" aria-label="Increase quantity">+</button>
                    </div>
                </div>
            </div>`;
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
                    : `₹ ${currentDiscount.value} Off`;
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
            if (discountAmt) discountAmt.innerText = `-₹ ${totals.discountAmount.toFixed(2)}`;
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
                    lossAlertMsg.innerHTML = `⚠️ Unclaimed Loyalty: Customer will forfeit <strong>₹ ${cashEst} VIP discount</strong> on this order. (Diner forfeits +${ptsEst} VIP points)`;
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
                ? `Subtotal ₹ ${totals.subtotal.toFixed(2)} + GST: ₹ ${totals.totalTax.toFixed(2)} <span class="gst-pct-pill">Just ${taxPct}%</span>` 
                : "No GST Applied";
        } else if (totals.gstMode === 'none') {
            gstBreakdownEl.innerText = "GST Exempt (0%)";
        } else {
            gstBreakdownEl.innerHTML = totals.totalTax > 0 
                ? `GST & Service: ₹ ${totals.totalTax.toFixed(2)} <span class="gst-pct-pill">Just ${taxPct}% of total</span>` 
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
            if (desktopBtnSub) desktopBtnSub.innerText = `₹ ${totals.finalTotal.toFixed(2)} ➔`;
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


// ============================================================================
// 3. DELTA-KOT ENGINE (Smart Incremental KOT Printing)
// ============================================================================

function computeKotDelta(tableId) {
    const tInfo = (typeof tablesInfo !== 'undefined') ? tablesInfo[tableId] : null;
    if (!tInfo || !Array.isArray(tInfo.items) || tInfo.items.length === 0) {
        return { deltaItems: [], totalDeltaCount: 0, hasNewItems: false, isAddon: false };
    }

    const deltaItems = [];
    let totalDeltaCount = 0;
    let anyPrintedBefore = false;

    tInfo.items.forEach(item => {
        const ordered = Number(item.qty || item.quantity || 0);
        const printed = Number(item.qtyKotPrinted || 0);
        if (printed > 0) anyPrintedBefore = true;

        if (ordered > printed) {
            const deltaQty = ordered - printed;
            totalDeltaCount += deltaQty;
            deltaItems.push({
                ...item,
                qty: deltaQty,
                quantity: deltaQty,
                _deltaQty: deltaQty
            });
        }
    });

    return {
        deltaItems,
        totalDeltaCount,
        hasNewItems: deltaItems.length > 0,
        isAddon: anyPrintedBefore
    };
}
window.computeKotDelta = computeKotDelta;

let _pendingKotRelayPayload = null;

function promptKotRelayFallback(kotPayload) {
    _pendingKotRelayPayload = kotPayload;
    const modal = document.getElementById('kotRelayFallbackModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

async function confirmKotRelayFallback() {
    const modal = document.getElementById('kotRelayFallbackModal');
    if (modal) modal.style.display = 'none';

    if (!_pendingKotRelayPayload) return;
    const payload = _pendingKotRelayPayload;
    _pendingKotRelayPayload = null;

    const cloudEnqueue = window.enqueueCloudKotPrintJob || (window.ThermalPrinterBridge && window.ThermalPrinterBridge.enqueueCloudKotPrintJob);
    if (typeof cloudEnqueue === 'function') {
        try {
            const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id) || 'default_shop';
            await cloudEnqueue(payload, { shopId });
            if (typeof showToast === 'function') {
                showToast("KOT queued to Cashier device!", 'success');
            }
        } catch (err) {
            console.error("Cloud print relay enqueue failed:", err);
            if (typeof showToast === 'function') showToast("Failed to queue KOT to Cashier.", 'error');
        }
    }
}

function cancelKotRelayFallback() {
    _pendingKotRelayPayload = null;
    const modal = document.getElementById('kotRelayFallbackModal');
    if (modal) modal.style.display = 'none';
}

window.promptKotRelayFallback = promptKotRelayFallback;
window.confirmKotRelayFallback = confirmKotRelayFallback;
window.cancelKotRelayFallback = cancelKotRelayFallback;

function sendToKitchen() { 
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || !Array.isArray(tInfo.items) || tInfo.items.length === 0) return showToast("Nothing to send!"); 
    
    const delta = computeKotDelta(activeTable);
    if (!delta.hasNewItems) {
        showToast("KOT already sent for all items.", "info");
        return;
    }

    tInfo.status = 'saved'; 
    persistTables(); 
    syncTableUI(); 

    const kTable = document.getElementById('kotTableNoDisplay');
    if (kTable) {
        kTable.innerText = String(activeTable) + (delta.isAddon ? ` (Add-on: +${delta.totalDeltaCount} items)` : '');
    }

    const btnSubmit = document.getElementById('btnKotPrintSubmit') || document.querySelector('#kotModal .btn-warning');
    if (btnSubmit) {
        const spanText = btnSubmit.querySelector('.btn-text') || btnSubmit.querySelector('span') || btnSubmit;
        if (delta.isAddon) {
            spanText.innerText = `Print New KOT (+${delta.totalDeltaCount} items)`;
        } else {
            spanText.innerText = 'Print KOT';
        }
    }

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
        const khataWrap = document.getElementById('checkoutKhataContainer');

        if (cashWrap) cashWrap.style.display = mode === 'Cash' ? 'block' : 'none';
        if (upiWrap) upiWrap.style.display = mode === 'UPI' ? 'flex' : 'none';
        if (cardWrap) cardWrap.style.display = mode === 'Card' ? 'block' : 'none';
        if (khataWrap) khataWrap.style.display = mode === 'Khata' ? 'block' : 'none';

        const cTot = parseFloat(document.getElementById('checkoutTotal')?.innerText) || 0;
        if (mode === 'Cash') {
            setupCheckoutTenderEngine(cTot);
        } else if (mode === 'UPI') {
            renderCheckoutUpiQr(cTot);
        } else if (mode === 'Khata') {
            const dueDateInput = document.getElementById('checkoutKhataDueDateInput');
            if (dueDateInput && !dueDateInput.value) {
                dueDateInput.value = getDueDefaultDate(7);
            }
            updateCheckoutKhataCustomerInfo();
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

function getDueDefaultDate(daysAhead = 7) {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
window.getDueDefaultDate = getDueDefaultDate;

function updateCheckoutKhataCustomerInfo() {
    const cId = document.getElementById('checkoutCustomerId')?.value;
    const cName = document.getElementById('checkoutCustomerName')?.value?.trim();
    const prevBadge = document.getElementById('checkoutKhataPrevDueBadge');
    const prevAmt = document.getElementById('checkoutKhataPrevDueAmt');
    const balInfo = document.getElementById('checkoutKhataBalanceInfo');
    const balDisplay = document.getElementById('checkoutKhataCustomerCreditBalance');

    let matched = null;
    if (typeof customersList !== 'undefined' && Array.isArray(customersList)) {
        if (cId) {
            matched = customersList.find(c => String(c.id) === String(cId));
        }
        if (!matched && cName) {
            const digits = (cName.match(/\d{6,15}/) || [''])[0];
            matched = customersList.find(c => (digits && c.phone && c.phone.includes(digits)) || (c.name && c.name.toLowerCase() === cName.toLowerCase()));
        }
    }

    if (matched) {
        const balance = Number(matched.balanceDue) || 0;
        if (prevAmt) prevAmt.innerText = balance.toFixed(2);
        if (prevBadge) prevBadge.style.display = balance > 0 ? 'inline-block' : 'none';
        if (balDisplay) balDisplay.innerText = `₹ ${balance.toFixed(2)}`;
        if (balInfo) balInfo.style.display = 'flex';
    } else {
        if (prevBadge) prevBadge.style.display = 'none';
        if (balInfo) balInfo.style.display = 'none';
    }
}
window.updateCheckoutKhataCustomerInfo = updateCheckoutKhataCustomerInfo;

function validateKhataCheckout(paymentMode, assignedCustomer) {
    if (paymentMode === 'Khata' && (!assignedCustomer || (!assignedCustomer.id && !assignedCustomer.name))) {
        return { valid: false, error: "Please select or add a customer to record this order on Khata / Udhar." };
    }
    return { valid: true };
}
window.validateKhataCheckout = validateKhataCheckout;

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
        const label = isExact ? `Exact (₹ ${orderTotal.toFixed(0)})` : `₹ ${d}`;
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
        dueDisplay.innerText = `₹ ${diff.toFixed(2)}`;
    } else {
        dueBox.classList.add('shortage');
        if (dueLabel) dueLabel.innerText = 'Amount Short:';
        dueDisplay.innerText = `₹ ${Math.abs(diff).toFixed(2)}`;
    }

    document.querySelectorAll('#checkoutDenomPills .denom-pill').forEach(p => {
        const text = p.innerText;
        if ((text.includes('Exact') && Math.abs(tendered - orderTotal) < 0.01) || text === `₹ ${tendered}` || text === `₹ ${tendered}`) {
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

function openCheckoutModal(bypassRoleCheck = false) {
    if (typeof canAccessStoreData === 'function' && !canAccessStoreData()) {
        if (typeof showToast === 'function') showToast("Transaction blocked: device pending authorization or revoked.");
        return;
    }
    if (!bypassRoleCheck && typeof currentStaff !== 'undefined' && currentStaff) {
        const canSettle = typeof hasPermission === 'function' ? hasPermission(currentStaff, 'can_settle_bills') : (currentStaff.role !== 'Waiter' && currentStaff.role !== 'Floor Server' && currentStaff.role !== 'Kitchen Chef');
        if (!canSettle) {
            if (typeof requestManagerOverride === 'function') {
                requestManagerOverride({
                    title: "Manager Authorization Required",
                    actionDescription: `${currentStaff.role} role cannot settle bills. Enter Manager or Admin PIN to authorize payment settlement:`,
                    requiredRole: 'Manager',
                    onSuccess: () => {
                        openCheckoutModal(true);
                    }
                });
                return;
            }
        }
    }

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
        if (grossSubEl) grossSubEl.innerText = `₹ ${totals.grossSubtotal.toFixed(2)}`;
        if (discLabelEl) {
            const dType = tInfo.discount.type === 'percent' ? `${tInfo.discount.value}%` : 'Fixed';
            discLabelEl.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg><span>Discount (${dType}${tInfo.discount.reason ? ' • ' + escapeHtml(tInfo.discount.reason) : ''}):</span>`;
        }
        if (discAmtEl) discAmtEl.innerText = `-₹ ${totals.discountAmount.toFixed(2)}`;
        if (gstNoteEl) {
            const taxPct = totals.finalTotal > 0 ? ((totals.totalTax / totals.finalTotal) * 100).toFixed(1) : '0';
            gstNoteEl.innerHTML = totals.gstMode === 'exclusive' 
                ? `+₹ ${totals.totalTax.toFixed(2)} GST Added <span class="gst-pct-pill">Just ${taxPct}%</span>` 
                : (totals.gstMode === 'none' ? 'Tax Exempt' : `Includes ₹ ${totals.totalTax.toFixed(2)} GST <span class="gst-pct-pill">Just ${taxPct}%</span>`);
        }
    } else {
        if (discBox) discBox.style.display = 'none';
        if (discPrompt) discPrompt.style.display = shopProfile.discountsEnabled !== false ? 'block' : 'none';
    }
    
    selectPayment('Cash', 'checkout');
    setupCheckoutTenderEngine(totals.finalTotal);
    
    // Initialize Khata state & default due date (7 days ahead)
    const khataDueDateEl = document.getElementById('checkoutKhataDueDateInput');
    if (khataDueDateEl) khataDueDateEl.value = getDueDefaultDate(7);
    const khataNotesEl = document.getElementById('checkoutKhataNotesInput');
    if (khataNotesEl) khataNotesEl.value = '';

    const custSelectEl = document.getElementById('checkoutCustomerSelect');
    if (custSelectEl && !custSelectEl._khataBound) {
        custSelectEl._khataBound = true;
        custSelectEl.addEventListener('change', () => updateCheckoutKhataCustomerInfo());
    }
    const custNameEl = document.getElementById('checkoutCustomerName');
    if (custNameEl && !custNameEl._khataBound) {
        custNameEl._khataBound = true;
        custNameEl.addEventListener('input', () => updateCheckoutKhataCustomerInfo());
    }

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
    updateCheckoutKhataCustomerInfo();
    
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
        if (shopProfile.showQr && shopProfile.upiId) {
            const qrCanvas = document.querySelector('#printQrCode canvas');
            const qrImg = document.querySelector('#printQrCode img');
            let qrSrc = '';
            if (qrCanvas && typeof qrCanvas.toDataURL === 'function') {
                qrSrc = qrCanvas.toDataURL('image/png');
            } else if (qrImg && qrImg.src) {
                qrSrc = qrImg.src;
            }
            if (qrSrc) {
                qrScript = `<div style="text-align:center; margin-top:14px; padding-top:8px; border-top:1px dashed #000;">
                    <div style="font-weight:bold; font-size:12px; margin-bottom:4px; letter-spacing:0.5px;">SCAN TO PAY VIA UPI</div>
                    <img src="${qrSrc}" style="margin:0 auto; display:block; width:160px; height:160px; image-rendering:pixelated;">
                    <div style="font-size:10px; margin-top:4px; font-weight:bold;">UPI: ${escapeHtml(shopProfile.upiId)}</div>
                </div>`;
            }
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
    if (typeof canAccessStoreData === 'function' && !canAccessStoreData()) {
        if (typeof showToast === 'function') showToast("Transaction blocked: device revoked or pending authorization.");
        throw new Error('Device revoked; transaction aborted');
    }
    let tInfo = tablesInfo[activeTable]; 
    if(!tInfo || tInfo.items.length === 0) return showToast(`Table ${activeTable} is empty!`);
    
    const pMode = document.getElementById('selectedPaymentMode')?.value || 'Cash';
    const cName = document.getElementById('checkoutCustomerName')?.value.trim() || '';
    const cId = document.getElementById('checkoutCustomerId')?.value || '';

    // Khata payment mode requires an assigned customer
    if (pMode === 'Khata') {
        const hasAssigned = cId || cName || (typeof currentCheckoutCustomer !== 'undefined' && currentCheckoutCustomer);
        if (!hasAssigned) {
            showToast("⚠️ Khata payment requires assigning a customer. Please select or add a diner.");
            const nameInput = document.getElementById('checkoutCustomerName');
            if (nameInput) nameInput.focus();
            return;
        }
    }

    const totals = calculateOrderTotals(tInfo.items, tInfo.discount);
    const total = totals.finalTotal;

    // Fast Cash Tender Validation
    if (pMode === 'Cash') {
        const tenderVal = parseFloat(document.getElementById('checkoutCashTenderedInput')?.value);
        const amountTendered = !isNaN(tenderVal) ? tenderVal : total;
        if (amountTendered < total - 0.01) {
            showToast(`Amount tendered (₹ ${amountTendered.toFixed(2)}) is less than total payable (₹ ${total.toFixed(2)})`);
            return;
        }
    }

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
        const itemNames = tInfo.items.map(i => `${i.name} (x${i.qty})`).join(', ');

        const oType = document.getElementById('checkoutOrderType')?.value || 'Dine-In'; 
        const tenderVal = parseFloat(document.getElementById('checkoutCashTenderedInput')?.value);
        const amountTendered = pMode === 'Cash' ? (!isNaN(tenderVal) ? tenderVal : total) : total;
        const changeReturned = pMode === 'Cash' ? Math.max(0, amountTendered - total) : 0;
        const bName = document.getElementById('checkoutBillerName')?.value.trim() || (currentStaff?.name || 'Admin');
        const bId = (currentStaff && currentStaff.id) ? currentStaff.id : 1;
        const bRole = (currentStaff && currentStaff.role) ? currentStaff.role : 'Admin';
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
            billerId: bId,
            billerName: bName,
            billerRole: bRole,
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
        let newCust = null;

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
            newCust = {
                id: Date.now(),
                name: cleanName || cName,
                phone: digits || '',
                notes: 'Registered from checkout',
                totalVisits: 1,
                totalSpend: total,
                loyaltyPoints: ptsEarned,
                balanceDue: 0,
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

        // --- KHATA / PAY LATER AUTO-RECORDING & DEBT SYNC ---
        if (pMode === 'Khata') {
            const effectiveCust = matchedCustomer || newCust;
            const effectiveCustId = effectiveCust ? effectiveCust.id : (cId || `CUST-${Date.now()}`);
            const effectiveCustName = effectiveCust ? effectiveCust.name : (cName || 'Diner');
            const effectiveCustPhone = effectiveCust ? (effectiveCust.phone || '') : '';
            const dueDateVal = document.getElementById('checkoutKhataDueDateInput')?.value || getDueDefaultDate(7);
            const khataNotesVal = document.getElementById('checkoutKhataNotesInput')?.value?.trim() || `Table ${finalTableStr} Bill #${generatedBillNo}`;

            const khataDueEntry = {
                id: `KHATA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                type: 'customer',
                entityId: effectiveCustId,
                customerId: effectiveCustId,
                name: effectiveCustName,
                phone: effectiveCustPhone,
                billNo: `BILL-${generatedBillNo}`,
                amount: total,
                balanceDue: total,
                dueDate: dueDateVal,
                status: 'Pending',
                createdDate: new Date().toISOString(),
                notes: khataNotesVal
            };

            if (effectiveCust) {
                effectiveCust.balanceDue = (Number(effectiveCust.balanceDue) || 0) + total;
                if (!effectiveCust.dues) effectiveCust.dues = [];
                effectiveCust.dues.unshift(khataDueEntry);
                persistCustomersFirebase(effectiveCust);
            }

            let currentKhata = window.khataList;
            if (!Array.isArray(currentKhata)) {
                try {
                    const rawK = localStorage.getItem('cafe_khata');
                    currentKhata = rawK ? JSON.parse(rawK) : [];
                } catch (e) {
                    currentKhata = [];
                }
                window.khataList = currentKhata;
            }
            currentKhata.unshift(khataDueEntry);
            window.khataList = currentKhata;

            try {
                localStorage.setItem('cafe_khata', JSON.stringify(currentKhata));
            } catch (e) {}
            if (typeof idb !== 'undefined' && idb.set) {
                try {
                    idb.set('cafe_khata', currentKhata);
                } catch (e) {}
            }
            if (typeof persistKhata === 'function') {
                persistKhata();
            }
            if (typeof renderKhataUI === 'function') {
                renderKhataUI();
            }
            showToast(`📝 ₹ ${total.toFixed(2)} added to ${effectiveCustName}'s Khata Due ledger!`);
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

        // Mark any active KOT for this settled table as SERVED
        try {
            const currentTName = getTableName(activeTable);
            const rawKots = localStorage.getItem('billnaw_active_kots');
            if (rawKots) {
                const kotList = JSON.parse(rawKots);
                let changed = false;
                kotList.forEach(k => {
                    if ((k.table_id === currentTName || k.table_id === `Table ${activeTable}`) && k.status !== 'CANCELLED') {
                        k.status = 'SERVED';
                        changed = true;
                    }
                });
                if (changed) {
                    localStorage.setItem('billnaw_active_kots', JSON.stringify(kotList));
                    window.dispatchEvent(new CustomEvent('billnaw:kot-status-changed', { detail: { table: currentTName, status: 'SERVED' } }));
                }
            }
        } catch(kotErr) {} 
        
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
window.settleOrder = confirmCheckout;

// --- THERMAL PRINTER ESC/POS UTILITIES ---
let bleDevice = null; 
let bleServer = null; 
let printCharacteristic = null;

// Multi-slot printer map in window
window.posPrinters = window.posPrinters || {
    printer1: { id: 'printer1', name: null, device: null, server: null, characteristic: null, status: 'DISCONNECTED' },
    printer2: { id: 'printer2', name: null, device: null, server: null, characteristic: null, status: 'DISCONNECTED' }
};

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

async function connectBluetoothPrinter(printerSlot = 'printer1') {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';
    const btn = document.getElementById(slotKey === 'printer2' ? 'btnBleStatus2' : 'btnBleStatus');
    const originalText = btn ? btn.innerHTML : 'Search & Pair Printer';
    try {
        if (!navigator.bluetooth) { 
            alert("❌ BLUETOOTH NOT SUPPORTED!\n\nApple iOS (iPhone/iPad) blocks Web Bluetooth. You must use Android Chrome, Windows Chrome, or Mac Chrome."); 
            return; 
        }
        if (!window.isSecureContext) { 
            alert("❌ INSECURE CONNECTION!\n\nWeb Bluetooth ONLY works on 'https://' websites or localhost."); 
            return; 
        }
        if (btn) btn.innerHTML = "Searching...";
        showToast(`Looking for ${slotKey === 'printer2' ? 'Kitchen (Printer 2)' : 'Receipt (Printer 1)'} BLE printer...`);

        // Universal thermal printer service UUIDs including Ezo BLE (0000ff00)
        const BLE_PRINTER_UUIDS = [
            '000018f0-0000-1000-8000-00805f9b34fb', // Rongta / POS-58
            'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Zijiang / Milestone
            '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
            '0000ff00-0000-1000-8000-00805f9b34fb', // Ezo BLE / Telink / Bekene
            '0000fee7-0000-1000-8000-00805f9b34fb'  // Tencent / WeChat AirSync
        ];

        const device = await navigator.bluetooth.requestDevice({ 
            acceptAllDevices: true, 
            optionalServices: BLE_PRINTER_UUIDS
        });

        device.addEventListener('gattserverdisconnected', () => {
            console.warn(`[BLE] Printer in slot ${slotKey} (${device.name || 'Printer'}) disconnected.`);
            if (window.posPrinters && window.posPrinters[slotKey]) {
                window.posPrinters[slotKey].status = 'DISCONNECTED';
                window.posPrinters[slotKey].device = null;
                window.posPrinters[slotKey].server = null;
                window.posPrinters[slotKey].characteristic = null;
            }
            if (slotKey === 'printer1' || (!window.posPrinters?.printer1?.characteristic && bleDevice === device)) {
                bleDevice = null;
                bleServer = null;
                printCharacteristic = null;
            }
            if (btn) {
                btn.innerHTML = "Search & Pair Printer";
                btn.style.background = "transparent";
                btn.style.color = "var(--accent)";
            }
            showToast(`⚠️ ${device.name || 'Printer'} (${slotKey}) Disconnected!`);
            if (typeof evaluateKitchenStationConsumer === 'function') {
                evaluateKitchenStationConsumer();
            }
        });

        const server = await device.gatt.connect();

        // Dynamic GATT Traversal across getPrimaryServices()
        let foundChar = null;
        let foundService = null;

        try {
            const services = await server.getPrimaryServices();
            for (const service of services) {
                try {
                    const characteristics = await service.getCharacteristics();
                    for (const char of characteristics) {
                        if (char.properties && (char.properties.write || char.properties.writeWithoutResponse)) {
                            foundChar = char;
                            foundService = service;
                            break;
                        }
                    }
                } catch (e) {
                    console.warn(`[BLE] Failed reading characteristics on service ${service.uuid}:`, e);
                }
                if (foundChar) break;
            }
        } catch (enumErr) {
            console.warn("[BLE] getPrimaryServices() dynamic enumeration failed, trying direct UUID fallback:", enumErr);
        }

        // Fallback: Targeted lookup across all known printer service UUIDs
        if (!foundChar) {
            for (const uuid of BLE_PRINTER_UUIDS) {
                try {
                    const service = await server.getPrimaryService(uuid);
                    const characteristics = await service.getCharacteristics();
                    for (const char of characteristics) {
                        if (char.properties && (char.properties.write || char.properties.writeWithoutResponse)) {
                            foundChar = char;
                            foundService = service;
                            break;
                        }
                    }
                } catch (e) {
                    // Service not found on this peripheral
                }
                if (foundChar) break;
            }
        }

        if (!foundChar) {
            try { device.gatt.disconnect(); } catch (_) {}
            alert("❌ Printer paired, but it does not support standard text printing.");
            if (btn) btn.innerHTML = originalText;
            return;
        }

        // Store in multi-slot map
        window.posPrinters[slotKey] = {
            id: slotKey,
            name: device.name || 'Bluetooth Thermal Printer',
            device: device,
            server: server,
            characteristic: foundChar,
            serviceUuid: foundService?.uuid || null,
            charUuid: foundChar.uuid,
            status: 'CONNECTED',
            transport: 'BLUETOOTH'
        };

        // Mirror to legacy globals if printer1 or if primary was null
        if (slotKey === 'printer1' || !printCharacteristic) {
            bleDevice = device;
            bleServer = server;
            printCharacteristic = foundChar;
        }

        // Mirror to ThermalPrinterBridge if loaded
        if (typeof ThermalPrinterBridge !== 'undefined' && ThermalPrinterBridge.printers) {
            ThermalPrinterBridge.printers[slotKey].device = device;
            ThermalPrinterBridge.printers[slotKey].server = server;
            ThermalPrinterBridge.printers[slotKey].characteristic = foundChar;
            ThermalPrinterBridge.printers[slotKey].status = 'CONNECTED';
            ThermalPrinterBridge.printers[slotKey].name = device.name || 'Bluetooth Printer';
            ThermalPrinterBridge.printers[slotKey].transport = 'BLUETOOTH';
            if (slotKey === 'printer1') {
                ThermalPrinterBridge.activeBluetoothDevice = device;
                ThermalPrinterBridge.activeCharacteristic = foundChar;
            }
        }

        showToast(`🖨️ ${device.name || 'Printer'} Connected to ${slotKey === 'printer2' ? 'Kitchen (Printer 2)' : 'Receipt (Printer 1)'}!`);
        if (typeof evaluateKitchenStationConsumer === 'function') {
            evaluateKitchenStationConsumer();
        }
        if (btn) {
            btn.innerHTML = "Connected";
            btn.style.background = "var(--success)";
            btn.style.color = "#fff";
        }
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

// --- DUAL THERMAL PRINTER SETTINGS & INTERACTIVE ROUTING (M2 R2) ---
function openPrinterSettingsModal() {
    const modal = document.getElementById('printerSettingsModal');
    if (!modal) return;

    let config = null;
    if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.loadPrinterSettings === 'function') {
        config = window.ThermalPrinterBridge.loadPrinterSettings();
    } else {
        try {
            const raw = localStorage.getItem('billnaw_printers_config') || localStorage.getItem('pos_dual_printers');
            if (raw) config = JSON.parse(raw);
        } catch (_) {}
    }

    const p1 = config?.printer1 || window.ThermalPrinterBridge?.printers?.printer1 || window.posPrinters?.printer1 || {};
    const p2 = config?.printer2 || window.ThermalPrinterBridge?.printers?.printer2 || window.posPrinters?.printer2 || {};
    const routing = config?.routing || window.ThermalPrinterBridge?.routing || {};

    // Printer 1
    const t1 = document.getElementById('printer1Transport'); if (t1 && p1.transport) t1.value = p1.transport;
    const w1 = document.getElementById('printer1PaperWidth'); if (w1 && p1.paperWidth) w1.value = p1.paperWidth;
    const h1 = document.getElementById('printer1Host'); if (h1 && p1.host) h1.value = p1.host;
    const prt1 = document.getElementById('printer1Port'); if (prt1 && p1.port) prt1.value = p1.port;

    // Printer 2
    const t2 = document.getElementById('printer2Transport'); if (t2 && p2.transport) t2.value = p2.transport;
    const w2 = document.getElementById('printer2PaperWidth'); if (w2 && p2.paperWidth) w2.value = p2.paperWidth;
    const h2 = document.getElementById('printer2Host'); if (h2 && p2.host) h2.value = p2.host;
    const prt2 = document.getElementById('printer2Port'); if (prt2 && p2.port) prt2.value = p2.port;

    // Routing
    const dr = document.getElementById('cfgDefaultReceiptPrinter'); if (dr && routing.defaultReceiptPrinter) dr.value = routing.defaultReceiptPrinter;
    const dk = document.getElementById('cfgDefaultKotPrinter'); if (dk && routing.defaultKotPrinter) dk.value = routing.defaultKotPrinter;

    const isSingle = Boolean(routing.singlePrinterMode || localStorage.getItem('billnaw_single_printer_mode') === 'true');
    const singleEl = document.getElementById('cfgSinglePrinterMode');
    if (singleEl) {
        singleEl.checked = isSingle;
        handleSinglePrinterToggle(isSingle);
    }

    const hubEl = document.getElementById('cfgMasterPrintHub');
    if (hubEl) hubEl.checked = localStorage.getItem('billnaw_master_print_hub') === 'true';
    const relayEl = document.getElementById('cfgKotRelayMode');
    if (relayEl) relayEl.value = localStorage.getItem('billnaw_kot_relay_mode') || 'ASK_ON_FAILURE';
    const ap = document.getElementById('cfgAlwaysPromptPrinters'); if (ap) ap.checked = Boolean(routing.alwaysPrompt);

    handlePrinterTransportChange('printer1');
    handlePrinterTransportChange('printer2');
    updatePrinterSlotBadges();

    modal.style.display = 'flex';
}
window.openPrinterSettingsModal = openPrinterSettingsModal;

function handleSinglePrinterToggle(isSingle) {
    const dr = document.getElementById('cfgDefaultReceiptPrinter');
    const dk = document.getElementById('cfgDefaultKotPrinter');
    const p2Card = document.getElementById('printer2SlotCard');
    const badge = document.getElementById('singlePrinterActiveBadge');
    if (isSingle) {
        if (dr) dr.value = 'printer1';
        if (dk) dk.value = 'printer1';
        if (p2Card) p2Card.style.opacity = '0.55';
        if (badge) {
            badge.innerText = 'UNIFIED ACTIVE';
            badge.style.background = 'rgba(20, 56, 50, 0.15)';
            badge.style.color = 'var(--primary)';
        }
    } else {
        if (p2Card) p2Card.style.opacity = '1';
        if (badge) {
            badge.innerText = 'DUAL MODE';
            badge.style.background = '#F1F5F9';
            badge.style.color = '#64748B';
        }
    }
}
window.handleSinglePrinterToggle = handleSinglePrinterToggle;

function closePrinterSettingsModal() {
    const modal = document.getElementById('printerSettingsModal');
    if (modal) modal.style.display = 'none';
}
window.closePrinterSettingsModal = closePrinterSettingsModal;

function handlePrinterTransportChange(slotKey) {
    const transportEl = document.getElementById(slotKey === 'printer2' ? 'printer2Transport' : 'printer1Transport');
    const netDiv = document.getElementById(slotKey === 'printer2' ? 'printer2NetworkSettings' : 'printer1NetworkSettings');
    const pairBtnText = document.getElementById(slotKey === 'printer2' ? 'btnPairPrinter2Text' : 'btnPairPrinter1Text');
    const val = transportEl ? transportEl.value : 'BLUETOOTH';

    if (netDiv) {
        netDiv.style.display = (val === 'NETWORK') ? 'block' : 'none';
    }
    if (pairBtnText) {
        if (val === 'BLUETOOTH') pairBtnText.innerText = 'Pair Bluetooth';
        else if (val === 'USB') pairBtnText.innerText = 'Connect USB OTG';
        else if (val === 'NETWORK') pairBtnText.innerText = 'Save Network IP';
        else if (val === 'SYSTEM_DIALOG') pairBtnText.innerText = 'System Dialog Active';
    }
    if (typeof evaluateKitchenStationConsumer === 'function') {
        evaluateKitchenStationConsumer();
    }
}
window.handlePrinterTransportChange = handlePrinterTransportChange;

function updatePrinterSlotBadges() {
    const b1 = document.getElementById('printer1StatusBadge');
    const b2 = document.getElementById('printer2StatusBadge');
    const name1 = document.getElementById('printer1DeviceNameDisplay');
    const name2 = document.getElementById('printer2DeviceNameDisplay');

    const p1 = window.ThermalPrinterBridge?.printers?.printer1 || window.posPrinters?.printer1 || {};
    const p2 = window.ThermalPrinterBridge?.printers?.printer2 || window.posPrinters?.printer2 || {};

    if (b1) {
        const isReady = p1.status === 'CONNECTED' || p1.transport === 'SYSTEM_DIALOG' || Boolean(p1.characteristic || p1.device || p1.host);
        b1.innerText = isReady ? (p1.transport === 'SYSTEM_DIALOG' ? 'SYSTEM DIALOG' : 'CONNECTED') : 'DISCONNECTED';
        b1.style.background = isReady ? '#DCFCE7' : '#F1F5F9';
        b1.style.color = isReady ? '#166534' : '#64748B';
    }
    if (name1 && p1.name) name1.innerText = p1.name;

    if (b2) {
        const isReady = p2.status === 'CONNECTED' || p2.transport === 'SYSTEM_DIALOG' || Boolean(p2.characteristic || p2.device || p2.host);
        b2.innerText = isReady ? (p2.transport === 'SYSTEM_DIALOG' ? 'SYSTEM DIALOG' : 'CONNECTED') : 'DISCONNECTED';
        b2.style.background = isReady ? '#DCFCE7' : '#F1F5F9';
        b2.style.color = isReady ? '#166534' : '#64748B';
    }
    if (name2 && p2.name) name2.innerText = p2.name;
}
window.updatePrinterSlotBadges = updatePrinterSlotBadges;

async function pairPrinterSlot(slotKey = 'printer1') {
    const transportEl = document.getElementById(slotKey === 'printer2' ? 'printer2Transport' : 'printer1Transport');
    const transport = transportEl ? transportEl.value : 'BLUETOOTH';

    if (transport === 'BLUETOOTH') {
        if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.connectBluetoothPrinter === 'function') {
            await window.ThermalPrinterBridge.connectBluetoothPrinter(slotKey);
            updatePrinterSlotBadges();
        } else {
            await connectBluetoothPrinter(slotKey);
        }
    } else if (transport === 'USB') {
        if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.connectUsbPrinter === 'function') {
            const res = await window.ThermalPrinterBridge.connectUsbPrinter(slotKey);
            if (res.success) {
                if (typeof showToast === 'function') showToast(`USB Printer connected on ${slotKey}!`, 'success');
            } else {
                if (typeof showToast === 'function') showToast(`USB connection failed: ${res.error?.message}`);
            }
            updatePrinterSlotBadges();
        }
    } else if (transport === 'NETWORK') {
        const hostInput = document.getElementById(slotKey === 'printer2' ? 'printer2Host' : 'printer1Host');
        const portInput = document.getElementById(slotKey === 'printer2' ? 'printer2Port' : 'printer1Port');
        const host = hostInput?.value?.trim();
        const port = Number(portInput?.value) || 9100;
        if (!host) {
            alert("Please enter a valid IP address or hostname for the Network Printer.");
            return;
        }
        if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.connectNetworkPrinter === 'function') {
            await window.ThermalPrinterBridge.connectNetworkPrinter(slotKey, host, port);
            if (typeof showToast === 'function') showToast(`Network Printer ${host}:${port} configured on ${slotKey}!`, 'success');
            updatePrinterSlotBadges();
        }
    } else if (transport === 'SYSTEM_DIALOG') {
        if (window.ThermalPrinterBridge && window.ThermalPrinterBridge.printers[slotKey]) {
            window.ThermalPrinterBridge.printers[slotKey].transport = 'SYSTEM_DIALOG';
            window.ThermalPrinterBridge.printers[slotKey].status = 'CONNECTED';
            window.ThermalPrinterBridge.persistPrinterConfig();
            updatePrinterSlotBadges();
            if (typeof showToast === 'function') showToast(`System Print Dialog selected for ${slotKey}`, 'success');
        }
    }
    if (typeof evaluateKitchenStationConsumer === 'function') {
        evaluateKitchenStationConsumer();
    }
}
window.pairPrinterSlot = pairPrinterSlot;

async function testPrinterSlot(slotKey = 'printer1') {
    const isKot = slotKey === 'printer2';
    const dummyPayload = isKot ? {
        table: 'T1',
        tableNo: 'T1',
        items: [
            { name: "Standard Espresso", qty: 2, notes: "Extra hot" },
            { name: "Club Sandwich", qty: 1, notes: "No onions" }
        ],
        biller: 'Counter Test',
        created_at: new Date().toISOString()
    } : {
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

    if (window.ThermalPrinterBridge) {
        if (typeof showToast === 'function') showToast(`Dispatching test print to ${slotKey}...`);
        const slotConfig = window.ThermalPrinterBridge.printers[slotKey] || {};
        const width = slotConfig.paperWidth || (isKot ? '58mm' : '80mm');
        const bytes = window.ThermalPrinterBridge.generateEscPosCommands(dummyPayload, width, { isKot });
        const res = await window.ThermalPrinterBridge.dispatchToPrinterSlot(slotKey, bytes);
        if (res && res.success) {
            if (typeof showToast === 'function') showToast(`Test print dispatched to ${slotKey}!`, 'success');
        } else {
            if (typeof showToast === 'function') showToast(`Test print to ${slotKey} failed: ${res?.error?.message || 'Disconnected'}`);
        }
    } else {
        testThermalPrinter();
    }
}
window.testPrinterSlot = testPrinterSlot;

function savePrinterSettingsFromUi() {
    const t1 = document.getElementById('printer1Transport')?.value || 'BLUETOOTH';
    const w1 = document.getElementById('printer1PaperWidth')?.value || '80mm';
    const h1 = document.getElementById('printer1Host')?.value?.trim() || '';
    const prt1 = Number(document.getElementById('printer1Port')?.value) || 9100;

    const t2 = document.getElementById('printer2Transport')?.value || 'BLUETOOTH';
    const w2 = document.getElementById('printer2PaperWidth')?.value || '58mm';
    const h2 = document.getElementById('printer2Host')?.value?.trim() || '';
    const prt2 = Number(document.getElementById('printer2Port')?.value) || 9100;

    const isSingle = Boolean(document.getElementById('cfgSinglePrinterMode')?.checked);
    localStorage.setItem('billnaw_single_printer_mode', isSingle ? 'true' : 'false');

    const dr = isSingle ? 'printer1' : (document.getElementById('cfgDefaultReceiptPrinter')?.value || 'printer1');
    const dk = isSingle ? 'printer1' : (document.getElementById('cfgDefaultKotPrinter')?.value || 'printer2');
    const ap = Boolean(document.getElementById('cfgAlwaysPromptPrinters')?.checked);

    const config = {
        printer1: { transport: t1, paperWidth: w1, host: h1, port: prt1 },
        printer2: { transport: t2, paperWidth: w2, host: h2, port: prt2 },
        routing: { defaultReceiptPrinter: dr, defaultKotPrinter: dk, alwaysPrompt: ap, singlePrinterMode: isSingle }
    };

    const isMasterHub = Boolean(document.getElementById('cfgMasterPrintHub')?.checked);
    const kotRelayMode = document.getElementById('cfgKotRelayMode')?.value || 'ASK_ON_FAILURE';
    localStorage.setItem('billnaw_master_print_hub', isMasterHub ? 'true' : 'false');
    localStorage.setItem('billnaw_kot_relay_mode', kotRelayMode);

    if (isMasterHub && typeof startCloudKotQueueConsumer === 'function') {
        const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id);
        if (shopId) startCloudKotQueueConsumer(shopId);
    }

    if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.savePrinterSettings === 'function') {
        window.ThermalPrinterBridge.savePrinterSettings(config);
    } else {
        localStorage.setItem('billnaw_printers_config', JSON.stringify(config));
        localStorage.setItem('pos_dual_printers', JSON.stringify(config));
    }

    if (typeof showToast === 'function') {
        showToast(isSingle ? "Single printer configuration saved! Both Bills and KOT will print on Printer 1." : "Dual printer configuration saved successfully!", 'success');
    }
    closePrinterSettingsModal();
    if (typeof evaluateKitchenStationConsumer === 'function') {
        evaluateKitchenStationConsumer();
    }
}
window.savePrinterSettingsFromUi = savePrinterSettingsFromUi;

let _printerSelectCallback = null;
function openPrinterSelectModal(role, onSelect) {
    _printerSelectCallback = onSelect;
    const modal = document.getElementById('printerSelectModal');
    if (!modal) return;

    const label = document.getElementById('printerSelectRoleLabel');
    if (label) label.innerText = (role === 'KOT') ? 'Kitchen KOT Ticket' : 'Customer Receipt';

    const p1 = window.ThermalPrinterBridge?.printers?.printer1 || window.posPrinters?.printer1 || {};
    const p2 = window.ThermalPrinterBridge?.printers?.printer2 || window.posPrinters?.printer2 || {};

    const p1Details = document.getElementById('printer1SelectDetails');
    if (p1Details) p1Details.innerText = `${p1.paperWidth || '80mm'} • ${p1.transport || 'Bluetooth'}`;
    const p2Details = document.getElementById('printer2SelectDetails');
    if (p2Details) p2Details.innerText = `${p2.paperWidth || '58mm'} • ${p2.transport || 'Bluetooth'}`;

    modal.style.display = 'flex';
}
window.openPrinterSelectModal = openPrinterSelectModal;

function closePrinterSelectModal(selectedSlot = null) {
    const modal = document.getElementById('printerSelectModal');
    if (modal) modal.style.display = 'none';
    if (typeof _printerSelectCallback === 'function') {
        const cb = _printerSelectCallback;
        _printerSelectCallback = null;
        cb(selectedSlot);
    }
}
window.closePrinterSelectModal = closePrinterSelectModal;

function handleInteractivePrinterSelect(selectedSlot) {
    closePrinterSelectModal(selectedSlot);
}
window.handleInteractivePrinterSelect = handleInteractivePrinterSelect;


/**
 * Non-Blocking ESC/POS Thermal Receipt Generator
 * Strictly transmits text-only ESC/POS commands with zero raster graphics overhead for food images.
 * Food photography is completely omitted from thermal transmission to guarantee 0ms print queue delay.
 * 
 * STATUTORY COMPLIANCE & SECURITY INVARIANT:
 * Customer bills, receipts, and settled invoices must strictly and exclusively print locally
 * (via local physical thermal printer or local browser print dialog).
 * Customer receipts NEVER queue to Distributed Cloud Print Relay.
 */
async function sendEscPosToPrinter(order) {
    if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
    let gstSummary = {}; 
    const gstMode = order.gstMode || getStoreGstConfig().mode;
    const isGstActive = gstMode !== 'none';
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
            const upiString = `upi://pay?pa=${shopProfile.upiId}&pn=${encodeURIComponent(shopProfile.name || 'billnaw')}&am=${order.amount.toFixed(2)}&cu=INR`;
            new QRCode(qrCodeDiv, { text: upiString, width: 256, height: 256, colorDark : "#000000", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.L });
            await new Promise(r => setTimeout(r, 50)); 
        }
    }

    if (!printCharacteristic) {
        // Document & Business Headers
        const pInvoiceTitle = document.getElementById('printInvoiceTitle');
        if (pInvoiceTitle) pInvoiceTitle.innerText = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE';

        const pShopName = document.getElementById('printShopName');
        if (pShopName) pShopName.innerText = shopProfile.name || 'billnaw';

        const pShopAddr = document.getElementById('printShopAddress');
        if (pShopAddr) {
            pShopAddr.innerText = shopProfile.address || '';
            pShopAddr.style.display = shopProfile.address ? 'block' : 'none';
        }

        const pShopPhone = document.getElementById('printShopPhone');
        if (pShopPhone) {
            pShopPhone.innerText = shopProfile.phone ? `Tel: ${shopProfile.phone}` : '';
            pShopPhone.style.display = shopProfile.phone ? 'block' : 'none';
        }

        const pFssai = document.getElementById('printFssai');
        if (pFssai) {
            pFssai.innerText = shopProfile.fssai ? `FSSAI Lic. No.: ${shopProfile.fssai}` : '';
            pFssai.style.display = shopProfile.fssai ? 'block' : 'none';
        }

        const pGstin = document.getElementById('printGstin');
        if (pGstin) {
            pGstin.innerText = (isGstActive && shopProfile.gstin) ? `GSTIN: ${shopProfile.gstin}` : '';
            pGstin.style.display = (isGstActive && shopProfile.gstin) ? 'block' : 'none';
        }

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
                if (!isGstActive) gst = 0;

                printItemsEl.innerHTML += `<div class="print-row"><span>${escapeHtml(item.name)} x${item.qty}</span><span>₹ ${itemTotal.toFixed(2)}</span></div>`; 
            });

            // Use order totals if available, otherwise recalculate
            const totals = calculateOrderTotals(order.rawItems, order.discount || (hasDiscount ? { type: 'fixed', value: discountAmount } : null));
            rawSubtotal = totals.subtotal;
            totalTax = totals.totalTax;
            gstSummary = totals.gstSummary || {};

            if (hasDiscount || (isGstActive && gstMode === 'exclusive')) {
                printItemsEl.innerHTML += `<div class="print-line"></div>`;
                if (hasDiscount) {
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Gross Subtotal</span><span>₹ ${grossSubtotal.toFixed(2)}</span></div>`;
                    const dLabel = order.discount && order.discount.type === 'percent' ? `Discount (${order.discount.value}%)` : 'Discount (Flat)';
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600; color:#c00;"><span>${dLabel}</span><span>-₹ ${discountAmount.toFixed(2)}</span></div>`;
                }
                if (isGstActive && gstMode === 'exclusive' && totalTax > 0) {
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Net Taxable Subtotal</span><span>₹ ${rawSubtotal.toFixed(2)}</span></div>`;
                    printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Total GST</span><span>₹ ${totalTax.toFixed(2)}</span></div>`;
                }
            }

            if(Object.keys(gstSummary).length > 0 && isGstActive) {
                let htmlGstContent = '<div class="print-line"></div><div style="font-weight:700; font-size:11px; margin-bottom:5px; text-align:center;">--- GST BREAKDOWN ---</div>';
                for(let rate in gstSummary) {
                    let slab = gstSummary[rate];
                    let base = Number(slab.base || 0).toFixed(2);
                    let cgst = Number(slab.cgst || (slab.tax / 2)).toFixed(2);
                    let sgst = Number(slab.sgst || (slab.tax / 2)).toFixed(2);
                    let halfRate = Number(rate) / 2;
                    htmlGstContent += `<div style="font-size:11px; color:#333; margin-bottom:4px;">
                        <div style="display:flex; justify-content:space-between;"><span>Taxable Value (${rate}%)</span><span>₹ ${base}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>CGST @ ${halfRate}%</span><span>₹ ${cgst}</span></div>
                        <div style="display:flex; justify-content:space-between;"><span>SGST @ ${halfRate}%</span><span>₹ ${sgst}</span></div>
                    </div>`;
                }
                printItemsEl.innerHTML += htmlGstContent;
            }

            if (order.paymentMode === 'Cash' && order.amountTendered && order.amountTendered > order.amount) {
                printItemsEl.innerHTML += `<div class="print-line"></div>`;
                printItemsEl.innerHTML += `<div class="print-row" style="font-weight:600;"><span>Cash Tendered</span><span>₹ ${Number(order.amountTendered).toFixed(2)}</span></div>`;
                printItemsEl.innerHTML += `<div class="print-row" style="font-weight:700; color:#266838;"><span>Change Due</span><span>₹ ${Number(order.changeReturned).toFixed(2)}</span></div>`;
            } else if (order.paymentMode === 'Khata') {
                printItemsEl.innerHTML += `<div class="print-line"></div>`;
                printItemsEl.innerHTML += `<div class="print-row" style="font-weight:700; color:#b45309;"><span>Khata Due (Pay Later)</span><span>₹ ${Number(order.amount).toFixed(2)}</span></div>`;
            }
        }
        const pTot = document.getElementById('printTotal'); if (pTot) pTot.innerText = `₹ ${order.amount.toFixed(2)}`;
        
        // Route print job through ThermalPrinterBridge if available
        if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.routePrintJob === 'function') {
            const routeResult = await window.ThermalPrinterBridge.routePrintJob(order, { role: 'RECEIPT' });
            if (routeResult && (routeResult.data?.printed || routeResult.data?.cancelled)) {
                if (routeResult.data?.method === 'BROWSER_DIALOG') {
                    await executeHtmlPrint('print-receipt');
                }
                return routeResult;
            }
        }

        await executeHtmlPrint('print-receipt');
        return;
    }

    const ESC = '\x1B'; const GS = '\x1D'; const INIT = ESC + '@'; 
    const ALIGN_CENTER = ESC + 'a\x01'; const ALIGN_LEFT = ESC + 'a\x00'; const BOLD_ON = ESC + 'E\x01'; const BOLD_OFF = ESC + 'E\x00'; const DOUBLE_SIZE = GS + '!\x11'; const NORMAL_SIZE = GS + '!\x00';

    let receiptText = INIT;
    receiptText += ALIGN_CENTER + DOUBLE_SIZE + BOLD_ON + (shopProfile.name || 'billnaw') + '\n' + NORMAL_SIZE + BOLD_OFF;
    if(shopProfile.address) receiptText += shopProfile.address + '\n';
    if(shopProfile.phone) receiptText += 'Tel: ' + shopProfile.phone + '\n';
    if(shopProfile.fssai) receiptText += 'FSSAI Lic. No.: ' + shopProfile.fssai + '\n';
    if(isGstActive && shopProfile.gstin) receiptText += 'GSTIN: ' + shopProfile.gstin + '\n';
    receiptText += '--------------------------------\n'; 
    receiptText += ALIGN_CENTER + BOLD_ON + (isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE') + '\n' + BOLD_OFF;
    receiptText += '--------------------------------\n'; 
    receiptText += ALIGN_LEFT;
    receiptText += BOLD_ON + 'Invoice: #' + (order.billNo || 'TEST') + '\n' + BOLD_OFF;
    if(order.orderType !== 'Takeaway') receiptText += 'Table: ' + String(order.table).replace('Table ', '') + '\n';
    receiptText += 'Date: ' + order.date + '\n';
    receiptText += 'Type: ' + (order.orderType || 'Dine-In') + '\n';
    receiptText += 'Payment: ' + (order.paymentMode || 'Cash') + '\n';
    if (order.paymentMode === 'Khata') receiptText += 'Balance Due: Rs.' + Number(order.amount).toFixed(2) + '\n';
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

    const targetChar = window.posPrinters?.printer1?.characteristic || printCharacteristic;
    const CHUNK_SIZE = 100; 
    try { 
        for (let i = 0; i < finalPayload.length; i += CHUNK_SIZE) { 
            const chunk = finalPayload.slice(i, i + CHUNK_SIZE); 
            if (targetChar) {
                if (typeof targetChar.writeValueWithoutResponse === 'function' && targetChar.properties && targetChar.properties.writeWithoutResponse) {
                    await targetChar.writeValueWithoutResponse(chunk);
                } else if (typeof targetChar.writeValue === 'function') {
                    await targetChar.writeValue(chunk);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 25)); 
        } 
    } catch(e) { 
        console.error(e); 
        showToast("❌ Print Failed. Printer might be off."); 
    }
}
window.sendEscPosToPrinter = sendEscPosToPrinter;

/**
 * Non-Blocking Kitchen Order Ticket (KOT) Generator
 * Strictly text-only ESC/POS command stream with zero raster graphics overhead.
 * When local kitchen printer is disconnected or out of range, seamlessly falls back
 * to Distributed Cloud Print Relay via enqueueCloudKotPrintJob.
 */
async function sendKotToPrinter(tableNo, items, options = {}) {
    const billerName = (currentStaff && currentStaff.name) ? currentStaff.name : 'Admin';
    const billerRole = (currentStaff && currentStaff.role) ? currentStaff.role : 'Server';
    const kotId = `KOT-${Date.now()}`;
    const isAddon = Boolean(options.isAddon);
    const kotHeader = options.kotHeader || (isAddon ? `ADD-ON / RUNNING ORDER - TABLE ${tableNo}` : `KITCHEN ORDER TICKET - TABLE ${tableNo}`);

    const kotJobPayload = {
        jobType: 'KOT',
        kotId: kotId,
        table: tableNo,
        tableNo: tableNo,
        items: items,
        rawItems: items,
        biller: billerName,
        server_staff_id: billerName,
        billerName: billerName,
        billerRole: billerRole,
        isAddon: isAddon,
        kotHeader: kotHeader,
        date: new Date().toLocaleTimeString(),
        created_at: new Date().toISOString()
    };

    // 1. Route KOT print job through ThermalPrinterBridge if available
    if (window.ThermalPrinterBridge && typeof window.ThermalPrinterBridge.routePrintJob === 'function') {
        try {
            const routeResult = await window.ThermalPrinterBridge.routePrintJob(kotJobPayload, { role: 'KOT' });
            if (routeResult && (routeResult.data?.printed || routeResult.data?.cancelled)) {
                if (routeResult.data?.method === 'BROWSER_DIALOG') {
                    const kotTable = document.getElementById('printKotTableNo'); if (kotTable) kotTable.innerText = tableNo;
                    const kotTime = document.getElementById('printKotTime'); if (kotTime) kotTime.innerText = new Date().toLocaleTimeString();
                    const kotBiller = document.getElementById('printKotBiller'); if (kotBiller) kotBiller.innerText = `${billerName} (${billerRole})`;
                    let itemsHtml = '';
                    items.forEach(item => {
                        itemsHtml += `<div style="display:flex; justify-content:space-between; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px;"><span>${item.name}</span><span style="font-size:18px;">x${item.qty}</span></div>`;
                    });
                    const kotItems = document.getElementById('printKotItems');
                    if (kotItems) kotItems.innerHTML = itemsHtml;
                    await executeHtmlPrint('print-kot');
                }
                return routeResult;
            }

            // If routeResult indicates failure to print (e.g. printer disconnected or out of range)
            if (routeResult && !routeResult.success) {
                const relayMode = localStorage.getItem('billnaw_kot_relay_mode') || 'ASK_ON_FAILURE';
                if (relayMode === 'ASK_ON_FAILURE' && typeof promptKotRelayFallback === 'function') {
                    promptKotRelayFallback(kotJobPayload);
                    return { success: true, queuedToCloud: false, prompted: true };
                }

                const cloudEnqueue = window.enqueueCloudKotPrintJob || (window.ThermalPrinterBridge && window.ThermalPrinterBridge.enqueueCloudKotPrintJob);
                if (typeof cloudEnqueue === 'function') {
                    try {
                        const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || shopProfile?.id || 'default_shop';
                        const enqueueRes = await cloudEnqueue(kotJobPayload, { shopId });
                        if (typeof showToast === 'function') {
                            showToast("Kitchen printer out of range. KOT queued to Cloud Print Relay!", 'success');
                        }
                        return { success: true, queuedToCloud: true, jobId: enqueueRes.jobId };
                    } catch (cloudErr) {
                        console.error("Cloud print relay enqueue fallback failed:", cloudErr);
                    }
                }
            }
        } catch (routeErr) {
            console.warn("routePrintJob failed or threw, falling back to direct / cloud relay:", routeErr);
        }
    }

    const isSinglePrinter = Boolean(
        window.ThermalPrinterBridge?.routing?.singlePrinterMode ||
        localStorage.getItem('billnaw_single_printer_mode') === 'true'
    );
    const targetKotChar = isSinglePrinter
        ? (window.posPrinters?.printer1?.characteristic || printCharacteristic || window.posPrinters?.printer2?.characteristic)
        : (window.posPrinters?.printer2?.characteristic || window.posPrinters?.printer1?.characteristic || printCharacteristic);
    if (!targetKotChar) {
        const relayMode = localStorage.getItem('billnaw_kot_relay_mode') || 'ASK_ON_FAILURE';
        if (relayMode === 'ASK_ON_FAILURE' && typeof promptKotRelayFallback === 'function') {
            promptKotRelayFallback(kotJobPayload);
            return { success: true, queuedToCloud: false, prompted: true };
        }

        // No local printer connection: Attempt Distributed Cloud Print Relay fallback
        const cloudEnqueue = window.enqueueCloudKotPrintJob || (window.ThermalPrinterBridge && window.ThermalPrinterBridge.enqueueCloudKotPrintJob);
        if (typeof cloudEnqueue === 'function') {
            try {
                const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || shopProfile?.id || 'default_shop';
                const enqueueRes = await cloudEnqueue(kotJobPayload, { shopId });
                if (typeof showToast === 'function') {
                    showToast("Kitchen printer out of range. KOT queued to Cloud Print Relay!", 'success');
                }
                return { success: true, queuedToCloud: true, jobId: enqueueRes.jobId };
            } catch (cloudErr) {
                console.error("Cloud print relay enqueue failed:", cloudErr);
            }
        }

        // Secondary fallback to browser HTML print dialog if cloud relay unavailable
        const kotTable = document.getElementById('printKotTableNo'); if (kotTable) kotTable.innerText = tableNo;
        const kotTime = document.getElementById('printKotTime'); if (kotTime) kotTime.innerText = new Date().toLocaleTimeString();
        const kotBiller = document.getElementById('printKotBiller'); if (kotBiller) kotBiller.innerText = `${billerName} (${billerRole})`;
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
    kotText += `Time: ${new Date().toLocaleTimeString()} • Server: ${billerName}\n`; 
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
            if (targetKotChar) {
                if (typeof targetKotChar.writeValueWithoutResponse === 'function' && targetKotChar.properties && targetKotChar.properties.writeWithoutResponse) {
                    await targetKotChar.writeValueWithoutResponse(chunk);
                } else if (typeof targetKotChar.writeValue === 'function') {
                    await targetKotChar.writeValue(chunk);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 25)); 
        } 
    } catch(e) { 
        console.error("KOT direct print error:", e); 
        // Fallback to Cloud Print Relay if direct Bluetooth transmission fails
        const cloudEnqueue = window.enqueueCloudKotPrintJob || (window.ThermalPrinterBridge && window.ThermalPrinterBridge.enqueueCloudKotPrintJob);
        if (typeof cloudEnqueue === 'function') {
            try {
                const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || shopProfile?.id || 'default_shop';
                const enqueueRes = await cloudEnqueue(kotJobPayload, { shopId });
                if (typeof showToast === 'function') {
                    showToast("Kitchen printer out of range. KOT queued to Cloud Print Relay!", 'success');
                }
                return { success: true, queuedToCloud: true, jobId: enqueueRes.jobId };
            } catch (cloudErr) {
                console.error("Cloud print relay enqueue fallback failed:", cloudErr);
            }
        }
        showToast("❌ KOT Print Failed."); 
    }
}
window.sendKotToPrinter = sendKotToPrinter;

// ============================================================================
// 🛰️ DISTRIBUTED CLOUD PRINT RELAY: OPERATIONAL KITCHEN QUEUE CONSUMER (M3 R3)
// ============================================================================
let _kotQueueUnsubscribe = null;
let _currentKotConsumerShopId = null;
let _isProcessingKotQueue = false;
const _kotJobProcessingSet = new Set(); // Local in-flight & cooldown job cache

/**
 * Checks whether this station has an active, ready kitchen printer.
 * Evaluates defaultKotPrinter slot (printer2 by default).
 * @returns {boolean}
 */
function isKitchenPrinterConnected() {
    const bridge = window.ThermalPrinterBridge;
    const kotSlot = bridge?.routing?.defaultKotPrinter || 'printer2';
    const slot = bridge?.printers?.[kotSlot] || window.posPrinters?.[kotSlot];
    if (!slot) return false;

    if (bridge && typeof bridge.isPrinterReady === 'function') {
        return bridge.isPrinterReady(kotSlot);
    }

    return slot.status === 'CONNECTED' ||
           Boolean(slot.characteristic) ||
           Boolean(slot.device) ||
           (slot.transport === 'NETWORK' && Boolean(slot.host)) ||
           slot.transport === 'SYSTEM_DIALOG';
}
window.isKitchenPrinterConnected = isKitchenPrinterConnected;

/**
 * Processes a single KOT print job: claim -> format -> dispatch -> complete.
 * @param {Object} job - Queued job payload (with id / jobId)
 * @param {string} [shopId] - Shop tenant ID
 * @param {Object} [options={}] - Options (e.g. { db, workerDeviceId, dispatchFn, ignoreConnectionCheck, force })
 * @returns {Promise<{ success: boolean, jobId: string, status: string, error?: string }>}
 */
async function processCloudKotJob(job, shopId, options = {}) {
    if (!job || (!job.id && !job.jobId)) return { success: false, error: 'Invalid job' };
    const jobId = job.id || job.jobId;
    if (_kotJobProcessingSet.has(jobId) && !options.force) {
        return { success: false, jobId, error: 'Job already in processing cache' };
    }

    // Guard: Verify kitchen printer is still physically connected (unless bypassed in tests)
    if (!options.ignoreConnectionCheck && !isKitchenPrinterConnected()) {
        console.warn(`[CloudKotConsumer] Kitchen printer not connected. Aborting claim for job ${jobId}`);
        return { success: false, jobId, error: 'Kitchen printer not connected' };
    }

    _kotJobProcessingSet.add(jobId);

    const resolvedShopId = shopId || _currentKotConsumerShopId ||
                           (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) ||
                           (typeof shopProfile !== 'undefined' && shopProfile?.id) ||
                           (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_store_code') || localStorage.getItem('storeId')) : null) ||
                           'default_shop';

    const bridge = window.ThermalPrinterBridge;
    const claimFn = (bridge && typeof bridge.claimPrintJob === 'function')
        ? bridge.claimPrintJob.bind(bridge)
        : (typeof window.claimPrintJob === 'function' ? window.claimPrintJob : null);
    const completeFn = (bridge && typeof bridge.completePrintJob === 'function')
        ? bridge.completePrintJob.bind(bridge)
        : (typeof window.completePrintJob === 'function' ? window.completePrintJob : null);

    if (!claimFn || !completeFn) {
        console.error("[CloudKotConsumer] claimPrintJob or completePrintJob API missing.");
        _kotJobProcessingSet.delete(jobId);
        return { success: false, jobId, error: 'Platform bridge API missing' };
    }

    const targetDb = options.db || (typeof window !== 'undefined' ? (window.firestoreDB || window.firebaseDB) : null);
    const workerDeviceId = options.workerDeviceId ||
                           (typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : null) ||
                           (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id')) : null) ||
                           `kitchen_station_${Math.random().toString(36).substring(2, 8)}`;

    let claimedRecord = null;
    try {
        claimedRecord = await claimFn(targetDb, resolvedShopId, jobId, workerDeviceId, options);
    } catch (claimErr) {
        // Natural outcome in multi-station race: another station claimed this job
        console.debug(`[CloudKotConsumer] Job ${jobId} claim bypassed:`, claimErr.message);
        setTimeout(() => _kotJobProcessingSet.delete(jobId), 10000);
        return { success: false, jobId, error: claimErr.message };
    }

    if (!claimedRecord) {
        _kotJobProcessingSet.delete(jobId);
        return { success: false, jobId, error: 'Claim returned null record' };
    }

    console.info(`[CloudKotConsumer] Claimed job ${jobId} for table ${claimedRecord.tableNo || job.tableNo}`);
    if (typeof showToast === 'function') {
        showToast(`Auto-Printing KOT for Table ${claimedRecord.tableNo || job.tableNo || '1'} (from Floor Server)...`, 'info');
    }

    // Resolve target kitchen printer slot and paper width
    const kotSlot = bridge?.routing?.defaultKotPrinter || 'printer2';
    const slotConfig = bridge?.printers?.[kotSlot] || window.posPrinters?.[kotSlot] || {};
    const paperWidth = slotConfig.paperWidth || '58mm';

    let printSuccess = false;
    let printError = null;

    try {
        let bytes = null;
        if (bridge && typeof bridge.generateEscPosCommands === 'function') {
            bytes = bridge.generateEscPosCommands(claimedRecord, paperWidth, { isKot: true });
        }

        if (options.dispatchFn && typeof options.dispatchFn === 'function') {
            const customRes = await options.dispatchFn(kotSlot, bytes, claimedRecord);
            printSuccess = Boolean(customRes && (customRes.success !== false));
            if (!printSuccess) printError = customRes?.error || 'Custom dispatch failed';
        } else if (bridge && typeof bridge.dispatchToPrinterSlot === 'function') {
            const dispatchRes = await bridge.dispatchToPrinterSlot(kotSlot, bytes);
            printSuccess = Boolean(dispatchRes && dispatchRes.success && dispatchRes.data?.printed);
            if (!printSuccess) {
                printError = dispatchRes?.error?.message || dispatchRes?.error || 'Dispatch returned failure';
            }
        } else {
            // Direct write fallback using characteristic
            const targetChar = window.posPrinters?.[kotSlot]?.characteristic ||
                               window.posPrinters?.printer2?.characteristic ||
                               window.printCharacteristic;
            if (targetChar) {
                const payloadBytes = bytes || new TextEncoder().encode(`KOT: Table ${claimedRecord.tableNo || 'T1'}\n\n`);
                const CHUNK_SIZE = 100;
                for (let i = 0; i < payloadBytes.length; i += CHUNK_SIZE) {
                    const chunk = payloadBytes.slice(i, i + CHUNK_SIZE);
                    if (typeof targetChar.writeValueWithoutResponse === 'function' && targetChar.properties?.writeWithoutResponse) {
                        await targetChar.writeValueWithoutResponse(chunk);
                    } else if (typeof targetChar.writeValue === 'function') {
                        await targetChar.writeValue(chunk);
                    }
                    await new Promise(r => setTimeout(r, 25));
                }
                printSuccess = true;
            } else {
                printError = "No writable printer characteristic available";
            }
        }
    } catch (err) {
        printSuccess = false;
        printError = err.message || String(err);
        console.error(`[CloudKotConsumer] Physical printing error for job ${jobId}:`, err);
    }

    // Complete job status in Firestore
    let completeRes = null;
    try {
        completeRes = await completeFn(targetDb, resolvedShopId, jobId, printSuccess, printError, options);
        if (printSuccess) {
            if (typeof showToast === 'function') {
                showToast(`🖨️ Remote KOT (Table ${claimedRecord.tableNo || ''}) printed at kitchen!`, 'success');
            }
        } else {
            if (typeof showToast === 'function') {
                showToast(`⚠️ Remote KOT print failed: ${printError}`);
            }
        }
    } catch (completeErr) {
        console.error(`[CloudKotConsumer] Failed to update job status for ${jobId}:`, completeErr);
    } finally {
        // Cooldown in cache to prevent immediate re-trigger on local snapshot echo
        setTimeout(() => _kotJobProcessingSet.delete(jobId), 15000);
    }

    return {
        success: printSuccess,
        jobId,
        status: completeRes?.status || (printSuccess ? 'printed' : 'failed'),
        error: printError
    };
}
window.processCloudKotJob = processCloudKotJob;

/**
 * Starts listening to the Firestore print queue for the specified shopId.
 * Idempotent: If already listening to this shopId, no-op.
 * @param {string} shopId
 * @returns {boolean}
 */
function startCloudKotQueueConsumer(shopId) {
    if (!shopId || typeof shopId !== 'string') return false;

    // Idempotency check: Already listening to this shop
    if (_kotQueueUnsubscribe && _currentKotConsumerShopId === shopId) {
        return true;
    }

    // If switching stores, teardown previous listener
    if (_kotQueueUnsubscribe) {
        stopCloudKotQueueConsumer();
    }

    const bridge = window.ThermalPrinterBridge;
    const listenFn = (bridge && typeof bridge.listenPrintQueue === 'function')
        ? bridge.listenPrintQueue.bind(bridge)
        : (typeof window.listenPrintQueue === 'function' ? window.listenPrintQueue : null);

    if (!listenFn) {
        console.warn("[CloudKotConsumer] listenPrintQueue API unavailable.");
        return false;
    }

    const db = (typeof window !== 'undefined' ? (window.firestoreDB || window.firebaseDB) : null) || null;
    _currentKotConsumerShopId = shopId;

    try {
        _kotQueueUnsubscribe = listenFn(db, shopId, async (incomingJobs) => {
            if (_isProcessingKotQueue) return;
            _isProcessingKotQueue = true;
            try {
                const jobs = Array.isArray(incomingJobs) ? incomingJobs : (incomingJobs ? [incomingJobs] : []);
                const queuedJobs = jobs.filter(j => j && j.status === 'queued' && !_kotJobProcessingSet.has(j.id));
                if (queuedJobs.length === 0) return;

                // Process jobs sequentially (FIFO) to prevent hardware write collisions
                for (const job of queuedJobs) {
                    await processCloudKotJob(job, shopId);
                }
            } finally {
                _isProcessingKotQueue = false;
            }
        });

        console.info(`[CloudKotConsumer] Active kitchen queue consumer listening for shop: ${shopId}`);
        return true;
    } catch (err) {
        console.error("[CloudKotConsumer] Failed to start queue consumer:", err);
        _kotQueueUnsubscribe = null;
        _currentKotConsumerShopId = null;
        return false;
    }
}
window.startCloudKotQueueConsumer = startCloudKotQueueConsumer;

/**
 * Stops the active print queue consumer and releases the Firestore snapshot subscription.
 */
function stopCloudKotQueueConsumer() {
    if (_kotQueueUnsubscribe) {
        try {
            _kotQueueUnsubscribe();
            console.info(`[CloudKotConsumer] Stopped queue consumer for shop: ${_currentKotConsumerShopId}`);
        } catch (e) {
            console.warn("[CloudKotConsumer] Error unsubscribing from queue:", e);
        }
        _kotQueueUnsubscribe = null;
    }
    _currentKotConsumerShopId = null;
    _kotJobProcessingSet.clear();
}
window.stopCloudKotQueueConsumer = stopCloudKotQueueConsumer;

/**
 * Re-evaluates station printer readiness and manages consumer lifecycle.
 */
function evaluateKitchenStationConsumer() {
    const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) ||
                   (typeof shopProfile !== 'undefined' && shopProfile?.id) ||
                   (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_store_code') || localStorage.getItem('storeId')) : null) ||
                   'default_shop';

    if (isKitchenPrinterConnected()) {
        startCloudKotQueueConsumer(shopId);
    } else {
        stopCloudKotQueueConsumer();
    }
}
window.evaluateKitchenStationConsumer = evaluateKitchenStationConsumer;

// Auto-evaluate station consumer on initial load or Firebase authentication
if (typeof window !== 'undefined') {
    window.addEventListener('firebaseLoaded', () => {
        if (typeof evaluateKitchenStationConsumer === 'function') {
            evaluateKitchenStationConsumer();
        }
    });
    if (typeof document !== 'undefined') {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(() => { if (typeof evaluateKitchenStationConsumer === 'function') evaluateKitchenStationConsumer(); }, 500);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                setTimeout(() => { if (typeof evaluateKitchenStationConsumer === 'function') evaluateKitchenStationConsumer(); }, 500);
            });
        }
    }
}


async function printKitchenTicket() {
    const btn = document.querySelector('#kotModal .btn-warning'); 
    let tInfo = (typeof tablesInfo !== 'undefined') ? tablesInfo[activeTable] : null;
    const currentTableName = (typeof getTableName === 'function') ? getTableName(activeTable) : String(activeTable || 1);

    const delta = (typeof computeKotDelta === 'function')
        ? computeKotDelta(activeTable)
        : { deltaItems: tInfo?.items || [], isAddon: false, hasNewItems: Boolean(tInfo?.items?.length) };

    if (!delta.hasNewItems) {
        if (typeof showToast === 'function') showToast("KOT already sent for all items.", "info");
        const kotModal = document.getElementById('kotModal');
        if (kotModal) kotModal.style.display = 'none';
        return;
    }

    if (btn) {
        btn.disabled = true; 
        btn.innerHTML = (window.posPrinters?.printer2?.characteristic || window.posPrinters?.printer1?.characteristic || printCharacteristic)
            ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>Printing KOT...</span>' 
            : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Generating KOT...</span>';
    }

    try { 
        const kotHeader = delta.isAddon ? `ADD-ON / RUNNING ORDER - TABLE ${currentTableName}` : `KITCHEN ORDER TICKET - TABLE ${currentTableName}`;
        await sendKotToPrinter(currentTableName, delta.deltaItems, { isAddon: delta.isAddon, kotHeader });

        // Update qtyKotPrinted for each line item on the table
        if (tInfo && Array.isArray(tInfo.items)) {
            tInfo.items.forEach(item => {
                item.qtyKotPrinted = Number(item.qty || item.quantity || 0);
            });
            tInfo.status = 'kot';
            persistTables();
            syncTableUI();
        }

        // Dispatch to Kitchen Display System (KDS) & persist ticket
        if (window.kotUIInstance && typeof window.kotUIInstance.handleDispatchKot === 'function') {
            await window.kotUIInstance.handleDispatchKot(currentTableName, (tInfo.items || []).map(it => ({
                name: it.name,
                quantity: it.qty || it.quantity || 1,
                notes: it.notes || ''
            })), tInfo.notes || '');
        } else {
            const raw = localStorage.getItem('billnaw_active_kots');
            const list = raw ? JSON.parse(raw) : [];
            const kotId = `KOT-${Date.now().toString().slice(-6)}`;
            const newKot = {
                kot_id: kotId,
                table_id: currentTableName,
                items: (tInfo.items || []).map(it => ({ name: it.name, quantity: it.qty || 1, notes: it.notes || '' })),
                status: 'PENDING',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            list.unshift(newKot);
            localStorage.setItem('billnaw_active_kots', JSON.stringify(list.slice(0, 100)));
            window.dispatchEvent(new CustomEvent('billnaw:kot-created', { detail: { kot: newKot } }));
            if (typeof playKdsAudioChime === 'function') playKdsAudioChime();
        }

        const kotModal = document.getElementById('kotModal');
        if (kotModal) kotModal.style.display = 'none'; 
        showToast(`Table ${currentTableName} KOT sent to Kitchen!`, 'success'); 
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

    const isGstActive = (order.gstMode || getStoreGstConfig().mode) !== 'none';
    const invTitle = document.getElementById('invModalTitle');
    if (invTitle) invTitle.innerText = isGstActive ? 'Tax Invoice' : 'Retail Invoice';

    const invDocBadge = document.getElementById('invModalDocTypeBadge');
    if (invDocBadge) invDocBadge.innerText = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE';

    // Set business headers
    const invShopName = document.getElementById('invModalShopName');
    if (invShopName) invShopName.innerText = shopProfile.name || "billnaw";

    const invShopAddr = document.getElementById('invModalShopAddress');
    if (invShopAddr) {
        invShopAddr.innerText = shopProfile.address || "";
        invShopAddr.style.display = shopProfile.address ? 'block' : 'none';
    }

    const invShopPhone = document.getElementById('invModalShopPhone');
    if (invShopPhone) {
        invShopPhone.innerText = shopProfile.phone ? `Tel: ${shopProfile.phone}` : "";
        invShopPhone.style.display = shopProfile.phone ? 'block' : 'none';
    }

    const invShopFssai = document.getElementById('invModalShopFssai');
    if (invShopFssai) {
        if (shopProfile.fssai) {
            invShopFssai.style.display = 'inline-block';
            invShopFssai.innerText = `FSSAI: ${shopProfile.fssai}`;
        } else {
            invShopFssai.style.display = 'none';
        }
    }

    const invShopGstin = document.getElementById('invModalShopGstin');
    if (invShopGstin) {
        if (isGstActive && shopProfile.gstin) {
            invShopGstin.style.display = 'inline-block';
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
                        ₹ ${Number(item.price).toFixed(2)}
                    </td>
                    <td style="padding: 10px 8px; border-bottom: 1px solid var(--border); text-align: right; font-size: 13px; font-weight: 700; font-family: monospace;">
                        ₹ ${itemTotal.toFixed(2)}
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
    if (grossEl) grossEl.innerText = `₹ ${grossSubtotal.toFixed(2)}`;

    const discountRow = document.getElementById('invModalDiscountRow');
    const discountLabel = document.getElementById('invModalDiscountLabel');
    const discountAmtEl = document.getElementById('invModalDiscountAmt');
    if (discountRow) {
        if (hasDiscount) {
            discountRow.style.display = 'flex';
            const typeStr = order.discount && order.discount.type === 'percent' ? `${order.discount.value}%` : 'Flat';
            const reasonStr = order.discount && order.discount.reason ? ` (${escapeHtml(order.discount.reason)})` : '';
            if (discountLabel) discountLabel.innerText = `🏷️ Discount ${typeStr}${reasonStr}:`;
            if (discountAmtEl) discountAmtEl.innerText = `-₹ ${Number(order.discountAmount).toFixed(2)}`;
        } else {
            discountRow.style.display = 'none';
        }
    }

    const netTaxableRow = document.getElementById('invModalTaxableRow');
    const netTaxableEl = document.getElementById('invModalTaxableAmt');
    if (netTaxableRow && netTaxableEl) {
        if (order.gstMode === 'exclusive' && (order.tax || 0) > 0) {
            netTaxableRow.style.display = 'flex';
            netTaxableEl.innerText = `₹ ${(order.subtotal || (order.amount - order.tax)).toFixed(2)}`;
        } else {
            netTaxableRow.style.display = 'none';
        }
    }

    const taxRow = document.getElementById('invModalTaxRow');
    const taxAmtEl = document.getElementById('invModalTaxAmt');
    if (taxRow && taxAmtEl) {
        if (isGstActive && (order.tax || 0) > 0) {
            taxRow.style.display = 'flex';
            taxAmtEl.innerText = `₹ ${Number(order.tax).toFixed(2)}`;
        } else {
            taxRow.style.display = 'none';
        }
    }

    // Itemized GST breakdown in invoice modal
    const invGstBreakdown = document.getElementById('invModalGstBreakdown');
    if (invGstBreakdown) {
        const modalTotals = calculateOrderTotals(order.rawItems, order.discount || (hasDiscount ? { type: 'fixed', value: discountAmount } : null));
        if (isGstActive && modalTotals.gstSummary && Object.keys(modalTotals.gstSummary).length > 0) {
            let breakdownHtml = '<div style="font-weight:700; font-size:10px; text-transform:uppercase; color:var(--text-muted); margin-bottom:2px; letter-spacing:0.5px;">Tax Breakdown</div>';
            for (let r in modalTotals.gstSummary) {
                let slab = modalTotals.gstSummary[r];
                let base = Number(slab.base || 0).toFixed(2);
                let half = Number(slab.cgst || (slab.tax / 2)).toFixed(2);
                let halfRate = Number(r) / 2;
                breakdownHtml += `
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>Taxable (${r}%):</span>
                        <span style="font-family:monospace; font-weight:600;">₹ ${base}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>CGST @ ${halfRate}%:</span>
                        <span style="font-family:monospace;">₹ ${half}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; margin-bottom:2px;">
                        <span>SGST @ ${halfRate}%:</span>
                        <span style="font-family:monospace;">₹ ${half}</span>
                    </div>
                `;
            }
            invGstBreakdown.innerHTML = breakdownHtml;
            invGstBreakdown.style.display = 'flex';
        } else {
            invGstBreakdown.style.display = 'none';
        }
    }

    const grandTotalEl = document.getElementById('invModalGrandTotal');
    if (grandTotalEl) grandTotalEl.innerText = `₹ ${Number(order.amount).toFixed(2)}`;

    // Dynamic QR Preview inside modal
    const invQrWrap = document.getElementById('invModalQrWrap');
    const invQrCode = document.getElementById('invModalQrCode');
    const invQrCaption = document.getElementById('invModalQrCaption');
    if (invQrWrap && invQrCode) {
        if (shopProfile.showQr && shopProfile.upiId && window.QRCode) {
            invQrCode.innerHTML = '';
            const upiString = `upi://pay?pa=${encodeURIComponent(shopProfile.upiId)}&pn=${encodeURIComponent(shopProfile.name || 'billnaw')}&am=${order.amount.toFixed(2)}&cu=INR`;
            new QRCode(invQrCode, {
                text: upiString,
                width: 130,
                height: 130,
                colorDark: "#2B1C15",
                colorLight: "#FFFFFF",
                correctLevel: QRCode.CorrectLevel.M
            });
            if (invQrCaption) invQrCaption.innerText = `Scan to Pay ₹ ${order.amount.toFixed(2)} via UPI (${shopProfile.upiId})`;
            invQrWrap.style.display = 'block';
        } else {
            invQrWrap.style.display = 'none';
        }
    }

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

// ============================================================================
// POS Catalog Tiles, Item Cards & Search Filtering with Lazy Loading & Fallbacks
// ============================================================================

/**
 * Render a single POS catalog tile / item card with lazy loading and instant SVG onerror fallback.
 */
function renderCatalogTile(item) {
    if (!item) return '';
    const thumbSrc = item.image || item.image_url || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(item.name, item.category) : (typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name, item.category) : 'assets/default-food.png'));
    const fallbackSrc = typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name, item.category || '') : 'assets/default-food.png';
    const popularBadge = item.badge ? `<div class="badge-popular">${escapeHtml(item.badge)}</div>` : '';
    const stockBadge = item.trackStock && item.stockQty <= 5 && item.stockQty > 0 
        ? `<div class="stock-badge low">${item.stockQty} left</div>` 
        : (item.trackStock && item.stockQty > 5 ? `<div class="stock-badge">${item.stockQty} left</div>` : '');

    return `
    <div class="menu-card clean-item-card" onclick="addToCart(${item.id}, event)">
        <div class="card-img-wrapper">
            <img src="${thumbSrc}" class="card-img" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackSrc}';">
            ${popularBadge}
            ${stockBadge}
        </div>
        <div class="card-content">
            <div class="card-top-row">
                <span class="cat-label">${escapeHtml(item.category || 'General')}</span>
                ${item.trackStock && item.stockQty > 0 ? `<span class="stock-pill">+${item.stockQty}pc</span>` : ''}
            </div>
            <div class="name">${escapeHtml(item.name)}</div>
            <div class="card-bottom-row">
                <div class="card-price-col">
                    <span class="price">₹ ${item.price}</span>
                </div>
            </div>
        </div>
    </div>`;
}
window.renderCatalogTile = renderCatalogTile;

/**
 * Filter POS catalog items by search term and category.
 */
function filterPosCatalogItems(searchTerm, category = 'All') {
    const term = (searchTerm || '').toLowerCase().trim();
    const items = (Array.isArray(window.menuItems) ? window.menuItems : []).filter(i => !i.is_template && i.source !== 'template' && i.is_active !== false);
    return items.filter(item => {
        const matchesCat = category === 'All' || item.category === category;
        const matchesSearch = !term || (item.name && item.name.toLowerCase().includes(term)) || (item.category && item.category.toLowerCase().includes(term));
        return matchesCat && matchesSearch;
    });
}
window.filterPosCatalogItems = filterPosCatalogItems;

/**
 * Render live search suggestions with dish thumbnails and instant fallbacks.
 */
function renderPosSearchSuggestions(query, targetElementId = 'posSearchSuggestions') {
    const container = typeof targetElementId === 'string' ? document.getElementById(targetElementId) : targetElementId;
    if (!container) return;
    const term = (query || '').toLowerCase().trim();
    if (!term) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }
    const matches = filterPosCatalogItems(term).slice(0, 6);
    if (matches.length === 0) {
        container.innerHTML = '<div style="padding: 10px 14px; font-size: 12px; color: var(--text-muted);">No matching dishes found.</div>';
        container.style.display = 'block';
        return;
    }
    container.innerHTML = matches.map(item => {
        const thumbSrc = item.image || item.image_url || (typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name, item.category) : 'assets/default-food.png');
        const fallbackSrc = typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name, item.category || '') : 'assets/default-food.png';
        return `<div class="pos-search-suggestion-item" onclick="addToCart(${item.id}, event); if(document.getElementById('${targetElementId}')) document.getElementById('${targetElementId}').style.display='none';" style="display: flex; align-items: center; gap: 10px; padding: 8px 12px; cursor: pointer; border-bottom: 1px solid var(--border-subtle);">
            <img src="${thumbSrc}" class="suggestion-thumb" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackSrc}';" style="width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0;">
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 13px; font-weight: 700; color: var(--text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(item.name)}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.category || '')}</div>
            </div>
            <div style="font-size: 13px; font-weight: 800; color: #143832;">₹ ${item.price}</div>
        </div>`;
    }).join('');
    container.style.display = 'block';
}
window.renderPosSearchSuggestions = renderPosSearchSuggestions;
