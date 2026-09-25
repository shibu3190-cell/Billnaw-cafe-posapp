// ============================================================
// 🍽️ JS/MENU.JS - Menu Catalog, Categories, AI OCR & Visuals
// ============================================================

let pendingAiItems = [];
let pendingAiImageTargetIndex = null;
let pendingAiFallbackNotice = null;
let pendingUploadPayload = null;
let lastUploadedMenuPreviewUrl = null;

function renderCategoryDropdown() {
    const select = document.getElementById('newItemCategory');
    if (select) {
        select.innerHTML = menuCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    }
}
window.renderCategoryDropdown = renderCategoryDropdown;

function renderCategoryFilters() {
    const el = document.getElementById('categoryFiltersUI');
    if (!el) return;
    el.innerHTML = '';
    menuCategories.forEach(cat => {
        el.innerHTML += `<div class="cat-chip ${cat === activeCategory ? 'active' : ''}" onclick="filterMenu('${escapeHtml(cat)}')">${escapeHtml(cat)}</div>`;
    });
}
window.renderCategoryFilters = renderCategoryFilters;

function renderCategoryListUI() {
    const container = document.getElementById('categoryListUI');
    if (container) {
        container.innerHTML = menuCategories.map(c => `
            <span class="category-manage-chip">
                <span>${escapeHtml(c)}</span>
                ${c !== 'All' ? `<button type="button" class="del-btn" onclick="deleteCategory('${escapeHtml(c)}')" title="Delete Category ${escapeHtml(c)}">✕</button>` : ''}
            </span>
        `).join('');
    }
    const catCountBadge = document.getElementById('categoryCountBadge');
    if (catCountBadge) {
        const count = menuCategories.filter(c => c !== 'All').length;
        catCountBadge.innerText = `${count} Categor${count === 1 ? 'y' : 'ies'}`;
    }
}
window.renderCategoryListUI = renderCategoryListUI;

function addCategory() {
    const catInput = document.getElementById('newCategoryName');
    const cat = catInput ? catInput.value.trim() : '';
    if(cat && !menuCategories.includes(cat)) {
        menuCategories.push(cat);
        if (catInput) catInput.value = '';
        persistCategories();
        renderCategoryDropdown();
        renderCategoryFilters();
        renderCategoryListUI();
        showToast("Category added!");
    } else if (menuCategories.includes(cat)) {
        showToast("Category already exists.");
    }
}
window.addCategory = addCategory;

function deleteCategory(cat) {
    if(confirm(`Delete category "${cat}"?`)) {
        menuCategories = menuCategories.filter(c => c !== cat);
        if(activeCategory === cat) activeCategory = "All";
        persistCategories();
        renderCategoryDropdown();
        renderCategoryFilters();
        renderCategoryListUI();
        renderMenuUI();
        showToast("Category deleted.");
    }
}
window.deleteCategory = deleteCategory;

function filterMenu(category) { 
    activeCategory = category; 
    renderCategoryFilters(); 
    renderMenuUI(); 
}
window.filterMenu = filterMenu;

function renderMenuUI() {
    const posGrid = document.getElementById('menuGridUI');
    if (posGrid) {
        posGrid.innerHTML = '';
        const searchInput = document.getElementById('menuSearchInput');
        const searchText = (searchInput ? searchInput.value : '').toLowerCase();
        let filteredMenu = activeCategory === "All" ? menuItems : menuItems.filter(i => i.category === activeCategory);
        if (searchText) filteredMenu = filteredMenu.filter(i => i.name.toLowerCase().includes(searchText));

        filteredMenu.forEach(item => {
            let popularBadge = item.badge ? `<div class="badge-popular">${escapeHtml(item.badge)}</div>` : '';
            let stockIndicator = '';
            if(item.trackStock) {
                stockIndicator = item.stockQty > 0 ? `<span class="stock-indicator green"><i></i> In Stock</span>` : `<span class="stock-indicator red"><i></i> Out of Stock</span>`;
            }

            let imageHtml = '';
            if (item.image && item.image.startsWith('data:image')) {
                imageHtml = `<img src="${item.image}" class="card-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    <div class="card-img-placeholder" style="display: none; background: linear-gradient(#8D5B4C, #3B2A22); color: white;">${item.name.charAt(0).toUpperCase()}</div>`;
            } else {
                imageHtml = `<div class="card-img-placeholder" style="display: flex; background: linear-gradient(#8D5B4C, #3B2A22); color: white;">${item.name.charAt(0).toUpperCase()}</div>`;
            }

            posGrid.innerHTML += `
            <div class="menu-card" onclick="addToCart(${item.id}, event)">
                <div class="card-img-wrapper">
                    ${imageHtml}
                    ${popularBadge}
                    ${item.trackStock && item.stockQty <= 5 && item.stockQty > 0 ? `<div class="stock-badge low">${item.stockQty} left</div>` : (item.trackStock && item.stockQty > 5 ? `<div class="stock-badge">${item.stockQty} left</div>` : '')}
                    <div class="card-img-price-pill" style="display: none !important;">₹${Number(item.price).toFixed(0)}</div>
                </div>
                <div class="card-content">
                    <div class="card-top-row">
                        <span class="cat-label">${escapeHtml(item.category)}</span>
                        ${item.trackStock && item.stockQty > 0 ? `<span class="stock-pill">+${item.stockQty}pc</span>` : ''}
                    </div>
                    <div class="name">${escapeHtml(item.name)}</div>
                    <div class="card-bottom-row">
                        <div class="card-price-col">
                            <span class="price">₹ ${item.price}</span>
                            ${stockIndicator}
                        </div>
                        <div id="menu-action-wrap-${item.id}"></div>
                    </div>
                </div>
            </div>`;
        });
        syncMenuUIQuantities();
    }

    renderMenuCatalogUI();
}
window.renderMenuUI = renderMenuUI;

function filterCatalogTable() {
    renderMenuCatalogUI();
}
window.filterCatalogTable = filterCatalogTable;

let catalogActiveCategoryFilter = 'All';

function filterCatalogByCategory(cat) {
    catalogActiveCategoryFilter = cat;
    renderMenuCatalogUI();
}
window.filterCatalogByCategory = filterCatalogByCategory;

function switchMenuSubTab(subTab) {
    const invView = document.getElementById('menuInventorySubView');
    const catView = document.getElementById('menuCategoriesSubView');
    const invBtn = document.getElementById('tabMenuInventoryBtn');
    const catBtn = document.getElementById('tabMenuCategoriesBtn');

    if (subTab === 'categories') {
        if (invView) invView.style.display = 'none';
        if (catView) catView.style.display = 'block';
        if (invBtn) invBtn.classList.remove('active');
        if (catBtn) catBtn.classList.add('active');
        renderCategoryListUI();
    } else {
        if (invView) invView.style.display = 'block';
        if (catView) catView.style.display = 'none';
        if (invBtn) invBtn.classList.add('active');
        if (catBtn) catBtn.classList.remove('active');
        renderMenuCatalogUI();
    }
}
window.switchMenuSubTab = switchMenuSubTab;

function renderMenuCatalogUI() {
    const menuTable = document.getElementById('menuTableBody');
    const cleanCardsContainer = document.getElementById('cleanItemCardsList');
    const { mode: gstCurrentMode, defaultRate: gstStoreRate } = getStoreGstConfig();

    // 1. Update count badges
    const invCountEl = document.getElementById('menuInventoryCount');
    if (invCountEl) invCountEl.innerText = menuItems.length;

    const catCountEl = document.getElementById('menuCategoriesCount');
    if (catCountEl) catCountEl.innerText = menuCategories.filter(c => c !== 'All').length;

    const countBadge = document.getElementById('catalogItemCountBadge');
    if (countBadge) {
        countBadge.innerText = `${menuItems.length} Item${menuItems.length === 1 ? '' : 's'}`;
    }

    // 2. Render Category Filter Chips
    const chipsContainer = document.getElementById('catalogCategoryChips');
    if (chipsContainer) {
        chipsContainer.innerHTML = menuCategories.map(cat => `
            <button type="button" class="btn btn-outline" onclick="filterCatalogByCategory('${escapeHtml(cat)}')" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: 700; ${catalogActiveCategoryFilter === cat ? 'background: #143832; color: #FFFFFF; border-color: #143832;' : 'color: #4B5563; background: #FFFFFF;'}">
                ${escapeHtml(cat)}
            </button>
        `).join('');
    }

    // 3. Search and Category Filter
    const searchInput = document.getElementById('catalogSearchInput');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    let itemsToRender = menuItems;
    if (catalogActiveCategoryFilter && catalogActiveCategoryFilter !== 'All') {
        itemsToRender = itemsToRender.filter(i => i.category === catalogActiveCategoryFilter);
    }
    if (query) {
        itemsToRender = itemsToRender.filter(i => 
            (i.name && i.name.toLowerCase().includes(query)) ||
            (i.category && i.category.toLowerCase().includes(query))
        );
    }

    // 4. Render Clean Item Cards matching Screenshot 1
    if (cleanCardsContainer) {
        if (itemsToRender.length === 0) {
            cleanCardsContainer.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; background: #FFFFFF; border: 1.5px dashed #E5E7EB; border-radius: 14px; color: var(--text-muted); font-size: 13px;">
                    No menu items found matching current search.
                </div>
            `;
        } else {
            cleanCardsContainer.innerHTML = itemsToRender.map(item => {
                let stockClass = 'unlimited';
                let stockLabel = '∞ Unlimited';
                if (item.trackStock) {
                    if (item.stockQty > 5) {
                        stockClass = 'in-stock';
                        stockLabel = `${item.stockQty} in stock`;
                    } else if (item.stockQty > 0) {
                        stockClass = 'low-stock';
                        stockLabel = `${item.stockQty} low`;
                    } else {
                        stockClass = 'out-stock';
                        stockLabel = 'Out of stock';
                    }
                }

                const thumbSrc = item.image || generateFallbackImage(item.name);
                return `
                <div class="clean-item-card">
                    <div class="clean-item-left">
                        <img src="${thumbSrc}" class="clean-item-thumb" alt="${escapeHtml(item.name)}" onerror="this.src=generateFallbackImage('${escapeHtml(item.name)}')">
                        <div class="clean-item-info">
                            <div class="clean-item-title-row">
                                <span class="clean-item-name">${escapeHtml(item.name)}</span>
                                <span class="clean-item-category-tag">${escapeHtml(item.category || 'General')}</span>
                            </div>
                            <div class="clean-item-meta-row">
                                <span class="clean-item-price">₹ ${Number(item.price).toFixed(2)}</span>
                                <span class="clean-item-stock-tag ${stockClass}">${stockLabel}</span>
                            </div>
                        </div>
                    </div>
                    <div class="clean-item-right">
                        <button type="button" class="adjust-stock-btn" onclick="openQuickAdjustStockModal(${item.id})">
                            Adjust Stock
                        </button>
                        <button type="button" class="clean-item-action-btn" onclick="editMenuItem(${item.id})" title="Edit Item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                        </button>
                        <button type="button" class="clean-item-action-btn delete-btn" onclick="deleteMenuItem(${item.id})" title="Delete Item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                    </div>
                </div>`;
            }).join('');
        }
    }

    // 5. Fallback Table Rendering for backward compatibility
    if (menuTable) {
        if (itemsToRender.length === 0) {
            menuTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 24px 16px; color: var(--text-muted); font-size: 13px;">No menu items found.</td></tr>`;
            return;
        }

        menuTable.innerHTML = itemsToRender.map(item => {
            let gstDisplay = '';
            if (gstCurrentMode === 'none') {
                gstDisplay = '<span class="stock-pill stock-pill-unlimited">0% Exempt</span>';
            } else if (gstCurrentMode === 'exclusive') {
                const r = (item.gstRate !== undefined && item.gstRate !== null && !isNaN(item.gstRate) && Number(item.gstRate) > 0) ? Number(item.gstRate) : gstStoreRate;
                gstDisplay = `<span class="stock-pill stock-pill-low">+${r}% Excl</span>`;
            } else {
                const r = (item.gstRate !== undefined && item.gstRate !== null && !isNaN(item.gstRate) && Number(item.gstRate) > 0) ? Number(item.gstRate) : gstStoreRate;
                gstDisplay = `<span class="stock-pill stock-pill-in">${r}% Incl</span>`;
            }

            let stockDisplay = '';
            if (!item.trackStock) {
                stockDisplay = '<span class="stock-pill stock-pill-unlimited">∞ Unlimited</span>';
            } else if (item.stockQty > 5) {
                stockDisplay = `<span class="stock-pill stock-pill-in">${item.stockQty} in stock</span>`;
            } else if (item.stockQty > 0) {
                stockDisplay = `<span class="stock-pill stock-pill-low">${item.stockQty} low</span>`;
            } else {
                stockDisplay = '<span class="stock-pill stock-pill-out">Out of stock</span>';
            }

            const thumbSrc = item.image || generateFallbackImage(item.name);
            return `<tr>
                <td style="width: 48px;">
                    <img src="${thumbSrc}" style="width:36px; height:36px; object-fit:cover; border-radius:8px; border:1px solid var(--border); display: block;" onerror="this.src=generateFallbackImage('${escapeHtml(item.name)}')">
                </td>
                <td>
                    <div style="font-weight: 700; color: var(--text-dark);">${escapeHtml(item.name)}</div>
                    ${item.badge ? `<span style="font-size: 9px; font-weight: 800; color: var(--accent); text-transform: uppercase;">${escapeHtml(item.badge)}</span>` : ''}
                </td>
                <td><span class="cat-label" style="display:inline-block; font-size:11px; padding: 2px 6px; background: #FAF7F4; border-radius: 6px; border: 1px solid var(--border);">${escapeHtml(item.category)}</span></td>
                <td style="font-weight:700; color:var(--primary); font-size:14px; font-variant-numeric: tabular-nums;">₹${Number(item.price).toFixed(2)}</td>
                <td>${gstDisplay}</td>
                <td>${stockDisplay}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button type="button" class="catalog-action-btn" onclick="editMenuItem(${item.id})" title="Edit Item ${escapeHtml(item.name)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                        </button>
                        <button type="button" class="catalog-action-btn delete-btn" onclick="deleteMenuItem(${item.id})" title="Delete Item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }
}
window.renderMenuCatalogUI = renderMenuCatalogUI;

// 📸 Upload Menu Choice Dialog Handlers
function openUploadMenuChoiceModal() {
    const modal = document.getElementById('uploadMenuChoiceModal');
    if (modal) modal.style.display = 'flex';
}
window.openUploadMenuChoiceModal = openUploadMenuChoiceModal;

function closeUploadMenuChoiceModal() {
    const modal = document.getElementById('uploadMenuChoiceModal');
    if (modal) modal.style.display = 'none';
}
window.closeUploadMenuChoiceModal = closeUploadMenuChoiceModal;

// 📊 Excel / Spreadsheet Menu Upload Handler
async function handleExcelMenuUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    closeUploadMenuChoiceModal();
    showToast(`Parsing ${file.name}...`, 'info');

    try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        let importedCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(/[,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
            if (parts.length >= 2) {
                const name = parts[0];
                const price = parseFloat(parts[1]);
                const category = parts[2] || 'Imported';
                if (name && !isNaN(price) && price > 0 && name.toLowerCase() !== 'dish' && name.toLowerCase() !== 'item') {
                    const newItem = {
                        id: Date.now() + i,
                        name,
                        price,
                        category,
                        stock: 50,
                        stockQty: 50,
                        trackStock: true,
                        gstRate: 5,
                        image: generateFallbackImage(name)
                    };
                    menuItems.push(newItem);
                    if (!menuCategories.includes(category)) {
                        menuCategories.push(category);
                    }
                    importedCount++;
                }
            }
        }

        if (importedCount > 0) {
            persistMenu();
            persistCategories();
            renderCategoryDropdown();
            renderCategoryFilters();
            renderMenuUI();
            showToast(`Successfully imported ${importedCount} items from spreadsheet!`, 'success');
        } else {
            showToast('No valid dish rows found in spreadsheet. Ensure Column 1 = Name, Column 2 = Price.', 'warning');
        }
    } catch(err) {
        console.error('Spreadsheet parse error:', err);
        showToast('Failed to parse spreadsheet: ' + err.message, 'error');
    }
}
window.handleExcelMenuUpload = handleExcelMenuUpload;

// ⚙️ Quick Stock Adjust Modal Handlers
let activeAdjustingItem = null;

function openQuickAdjustStockModal(itemId) {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;
    activeAdjustingItem = item;

    const modal = document.getElementById('quickAdjustStockModal');
    const nameEl = document.getElementById('quickAdjustItemName');
    const catEl = document.getElementById('quickAdjustItemCategory');
    const idEl = document.getElementById('quickAdjustItemId');
    const inputEl = document.getElementById('quickAdjustStockInput');

    if (nameEl) nameEl.innerText = item.name;
    if (catEl) catEl.innerText = `${item.category} • Current: ${item.trackStock ? item.stockQty + ' in stock' : 'Unlimited'}`;
    if (idEl) idEl.value = item.id;
    if (inputEl) inputEl.value = item.trackStock ? (item.stockQty || 0) : 100;

    if (modal) modal.style.display = 'flex';
}
window.openQuickAdjustStockModal = openQuickAdjustStockModal;

function closeQuickAdjustStockModal() {
    const modal = document.getElementById('quickAdjustStockModal');
    if (modal) modal.style.display = 'none';
    activeAdjustingItem = null;
}
window.closeQuickAdjustStockModal = closeQuickAdjustStockModal;

function stepAdjustStock(delta) {
    const inputEl = document.getElementById('quickAdjustStockInput');
    if (!inputEl) return;
    let val = parseInt(inputEl.value, 10) || 0;
    val = Math.max(0, val + delta);
    inputEl.value = val;
}
window.stepAdjustStock = stepAdjustStock;

function setStockQuick(amount) {
    const inputEl = document.getElementById('quickAdjustStockInput');
    if (!inputEl) return;
    let val = parseInt(inputEl.value, 10) || 0;
    inputEl.value = val + amount;
}
window.setStockQuick = setStockQuick;

function toggleStockUnlimited() {
    if (!activeAdjustingItem) return;
    activeAdjustingItem.trackStock = false;
    persistMenu();
    renderMenuUI();
    closeQuickAdjustStockModal();
    showToast(`${activeAdjustingItem.name} stock set to Unlimited.`, 'success');
}
window.toggleStockUnlimited = toggleStockUnlimited;

function saveQuickStockAdjustment() {
    if (!activeAdjustingItem) return;
    const inputEl = document.getElementById('quickAdjustStockInput');
    const newQty = parseInt(inputEl ? inputEl.value : '0', 10);
    
    activeAdjustingItem.trackStock = true;
    activeAdjustingItem.stockQty = isNaN(newQty) ? 0 : Math.max(0, newQty);
    activeAdjustingItem.stock = activeAdjustingItem.stockQty;

    persistMenu();
    renderMenuUI();
    closeQuickAdjustStockModal();
    showToast(`Updated ${activeAdjustingItem.name} stock to ${activeAdjustingItem.stockQty}.`, 'success');
}
window.saveQuickStockAdjustment = saveQuickStockAdjustment;

// ✨ For You Modal Handlers
function openForYouModal() {
    const modal = document.getElementById('forYouModal');
    if (modal) modal.style.display = 'flex';
}
window.openForYouModal = openForYouModal;

function closeForYouModal() {
    const modal = document.getElementById('forYouModal');
    if (modal) modal.style.display = 'none';
}
window.closeForYouModal = closeForYouModal;

function syncMenuUIQuantities() {
    let currentCart = tablesInfo[activeTable]?.items || [];
    menuItems.forEach(item => {
        const wrapper = document.getElementById(`menu-action-wrap-${item.id}`);
        if(!wrapper) return;
        let qtyInCart = 0; 
        const existing = currentCart.find(i => i.id === item.id); 
        if(existing) qtyInCart = existing.qty;

        let buttonHtml = '';
        if (item.trackStock && item.stockQty <= 0) {
            buttonHtml = `<button type="button" class="add-btn" style="background:var(--border); color:var(--text-muted); cursor:not-allowed;" disabled>OUT</button>`;
        } else if (qtyInCart > 0) {
            buttonHtml = `<div class="item-qty-control" onclick="event.stopPropagation()"><button type="button" onclick="modifyQty(${item.id}, -1, event)" aria-label="Decrease quantity">−</button><span>${qtyInCart}</span><button type="button" onclick="addToCart(${item.id}, event)" aria-label="Increase quantity">+</button></div>`;
        } else {
            buttonHtml = `<button type="button" class="add-btn" onclick="addToCart(${item.id}, event)">+ ADD</button>`;
        }
        if (wrapper.innerHTML !== buttonHtml) { wrapper.innerHTML = buttonHtml; }
    });
}
window.syncMenuUIQuantities = syncMenuUIQuantities;

function handleItemImageUpload(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_DIM = 300; let w = img.width, h = img.height;
            if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
            canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
            currentItemImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('newItemImagePreview').src = currentItemImageBase64;
            document.getElementById('newItemImagePreview').style.display = "block";
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
window.handleItemImageUpload = handleItemImageUpload;

async function fetchImageAsBase64(promptText, itemName = '') {
    try {
        const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptText,
                itemName: itemName,
                clientId: myClientID
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.imageUrl && data.imageUrl.startsWith('data:image')) {
                return data.imageUrl;
            }
        }
    } catch (apiErr) {
        console.warn("Backend AI image route failed, attempting cloud fallback:", apiErr.message);
    }

    const prompt = encodeURIComponent(promptText || itemName);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=400&height=300&nologo=true&n=1`;
    try {
        const res = await fetch(url);
        if(!res.ok) throw new Error("Direct fetch failed");
        const blob = await res.blob();
        if (!blob.type.startsWith('image/')) throw new Error("Network blocked image stream"); 
        return await new Promise(r => { const reader = new FileReader(); reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob); });
    } catch(e1) {
        try {
            const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
            const res2 = await fetch(proxyUrl);
            if(!res2.ok) throw new Error("Proxy fetch failed");
            const blob2 = await res2.blob();
            if (!blob2.type.startsWith('image/')) throw new Error("Proxy blocked image stream");
            return await new Promise(r => { const reader = new FileReader(); reader.onloadend = () => r(reader.result); reader.readAsDataURL(blob2); });
        } catch(e2) { 
            return generateFallbackImage(itemName || promptText);
        }
    }
}
window.fetchImageAsBase64 = fetchImageAsBase64;

async function generateAIImage() {
    const name = document.getElementById('newItemName').value.trim();
    if (!name) return showToast("⚠️ Enter an Item Name first to generate image!");
    
    const btn = document.getElementById('btnGenerateAI'); const preview = document.getElementById('newItemImagePreview');
    btn.innerText = "⏳ Generating..."; btn.disabled = true;
    
    currentItemImageBase64 = generateFallbackImage(name);
    preview.src = currentItemImageBase64; preview.style.display = "block"; preview.style.opacity = "0.7";
    
    try {
        const promptStr = `Gourmet culinary photography of ${name}, elegant plating, cafe presentation, natural studio lighting, 4k quality`;
        currentItemImageBase64 = await fetchImageAsBase64(promptStr, name);
        preview.src = currentItemImageBase64; preview.style.opacity = "1";
        btn.innerText = "✨ AI Generate"; btn.disabled = false; showToast("✅ Image Generated!");
    } catch (error) { 
        console.warn(error.message); 
        preview.style.opacity = "1"; btn.innerText = "✨ AI Generate"; btn.disabled = false; 
        showToast("✅ Generated gourmet visual placeholder.");
    }
}
window.generateAIImage = generateAIImage;

function openAddMenuItemModal() {
    editingMenuItemId = null; 
    renderCategoryDropdown();
    document.getElementById('menuFormTitle').innerText = "Add New Menu Item"; 
    document.getElementById('addMenuBtn').innerText = "💾 Save Item";
    document.getElementById('newItemName').value = ''; 
    document.getElementById('newItemPrice').value = ''; 
    document.getElementById('newItemGst').value = '0';
    document.getElementById('newItemTrackStock').checked = false; 
    document.getElementById('newItemStock').style.display = 'none'; 
    document.getElementById('newItemStock').value = '';
    currentItemImageBase64 = ""; 
    document.getElementById('newItemImagePreview').src = ""; 
    document.getElementById('newItemImagePreview').style.display = "none";
    document.getElementById('menuItemModal').style.display = 'flex'; 
    setTimeout(() => { document.getElementById('newItemName').focus(); }, 100);
}
window.openAddMenuItemModal = openAddMenuItemModal;

function editMenuItem(id) {
    const item = menuItems.find(i => i.id === id);
    if(item) {
        renderCategoryDropdown();
        document.getElementById('newItemName').value = item.name; 
        document.getElementById('newItemCategory').value = item.category;
        document.getElementById('newItemPrice').value = item.price; 
        document.getElementById('newItemGst').value = item.gstRate || 0;
        document.getElementById('newItemTrackStock').checked = item.trackStock || false; 
        document.getElementById('newItemStock').style.display = item.trackStock ? 'block' : 'none'; 
        document.getElementById('newItemStock').value = item.stockQty || '';
        
        currentItemImageBase64 = item.image || "";
        if(currentItemImageBase64 && currentItemImageBase64.startsWith('data:image')) { 
            document.getElementById('newItemImagePreview').src = currentItemImageBase64; 
            document.getElementById('newItemImagePreview').style.display = "block"; 
            document.getElementById('newItemImagePreview').style.opacity = "1";
        } else { 
            document.getElementById('newItemImagePreview').style.display = "none"; 
        }
        
        editingMenuItemId = id; 
        document.getElementById('menuFormTitle').innerText = "Edit Menu Item"; 
        document.getElementById('addMenuBtn').innerText = "💾 Update Item"; 
        document.getElementById('menuItemModal').style.display = 'flex';
    }
}
window.editMenuItem = editMenuItem;

function addMenuItem() {
    const name = document.getElementById('newItemName').value; 
    const price = parseFloat(document.getElementById('newItemPrice').value); 
    const category = document.getElementById('newItemCategory').value; 
    const gstRate = parseFloat(document.getElementById('newItemGst').value) || 0; 
    const trackStock = document.getElementById('newItemTrackStock').checked; 
    const stockQty = parseInt(document.getElementById('newItemStock').value) || 0;

    if(name && !isNaN(price)) { 
        if (editingMenuItemId) {
            const index = menuItems.findIndex(i => i.id === editingMenuItemId);
            if(index > -1) { 
                menuItems[index] = { id: editingMenuItemId, name, category, price, gstRate, trackStock, stockQty, image: currentItemImageBase64 }; 
            }
            showToast("✅ Item updated!");
        } else { 
            menuItems.push({ id: Date.now(), name, category, price, gstRate, trackStock, stockQty, image: currentItemImageBase64 }); 
            showToast("✅ Item added!"); 
        }
        persistMenu(); 
        renderMenuUI(); 
        if (window.culinaryInventory && typeof window.culinaryInventory.syncMenuItems === 'function') {
            window.culinaryInventory.syncMenuItems();
        }
        document.getElementById('menuItemModal').style.display = 'none';
    } else { 
        showToast("⚠️ Name and Price required."); 
    }
}
window.addMenuItem = addMenuItem;

function deleteMenuItem(id) { 
    if(confirm("Delete this item permanently?")) { 
        menuItems = menuItems.filter(item => item.id !== id); 
        persistMenu(); 
        renderMenuUI(); 
        showToast("Deleted."); 
    } 
}
window.deleteMenuItem = deleteMenuItem;

// --- AI MENU SCANNER & OCR WORKFLOW ---
function openAiMenuZoomModal() {
    if (!lastUploadedMenuPreviewUrl) return;
    const modal = document.getElementById('aiMenuZoomModal');
    const img = document.getElementById('aiMenuZoomImg');
    if (modal && img) {
        img.src = lastUploadedMenuPreviewUrl;
        modal.style.display = 'flex';
    }
}
window.openAiMenuZoomModal = openAiMenuZoomModal;

function closeAiMenuZoomModal() {
    const modal = document.getElementById('aiMenuZoomModal');
    if (modal) modal.style.display = 'none';
}
window.closeAiMenuZoomModal = closeAiMenuZoomModal;

function handleMenuDrop(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    processAIMenu(event);
}
window.handleMenuDrop = handleMenuDrop;

// Local smart layout parser fallback when offline or unauthenticated
function parseLocalMenuFallback(payload) {
    const rawText = (payload && payload.extractedText) ? String(payload.extractedText).trim() : '';
    const categories = [];

    if (rawText.length > 0) {
        const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
        const beverageItems = [];
        const foodItems = [];

        lines.forEach(line => {
            const priceMatch = line.match(/(?:₹|rs\.?|inr)?\s*(\d{2,4})/i);
            const price = priceMatch ? parseFloat(priceMatch[1]) : 120;
            const cleanName = line.replace(/(?:₹|rs\.?|inr)?\s*\d{2,4}/gi, '').replace(/[-–:•]/g, '').trim();
            if (cleanName.length >= 2) {
                const isBeverage = /coffee|tea|chai|shake|latte|espresso|brew|drink|water|juice/i.test(cleanName);
                const itemObj = { name: cleanName, price: price, image: generateFallbackImage(cleanName) };
                if (isBeverage) beverageItems.push(itemObj);
                else foodItems.push(itemObj);
            }
        });

        if (beverageItems.length > 0) categories.push({ name: "Beverages & Coffee", items: beverageItems });
        if (foodItems.length > 0) categories.push({ name: "Snacks & Mains", items: foodItems });
    }

    if (categories.length === 0) {
        categories.push({
            name: "Hot & Cold Beverages",
            items: [
                { name: "Espresso", price: 120, image: generateFallbackImage("Espresso") },
                { name: "Cappuccino", price: 160, image: generateFallbackImage("Cappuccino") },
                { name: "Cold Coffee", price: 180, image: generateFallbackImage("Cold Coffee") },
                { name: "Masala Chai", price: 60, image: generateFallbackImage("Masala Chai") }
            ]
        });
        categories.push({
            name: "Quick Bites & Meals",
            items: [
                { name: "Paneer Roll", price: 140, image: generateFallbackImage("Paneer Roll") },
                { name: "Chicken Biryani", price: 280, image: generateFallbackImage("Chicken Biryani") },
                { name: "Veg Burger", price: 130, image: generateFallbackImage("Veg Burger") },
                { name: "French Fries", price: 90, image: generateFallbackImage("French Fries") }
            ]
        });
    }

    return {
        success: true,
        isFallback: true,
        warning: "Extracted via Smart Layout OCR. Review and customize before import.",
        categories: categories
    };
}

async function processAIMenu(event) {
    const file = (event && event.target && event.target.files && event.target.files[0]) || 
                 (event && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    if (!file) return;
    const btn = document.getElementById('aiMenuBtn'); 
    if (btn) { btn.disabled = true; btn.innerText = "⏳ Preparing document..."; }

    try {
        let base64Data = ""; 
        let mimeType = 'image/jpeg'; 
        let extractedText = "";
        
        if (file.type === "application/pdf") {
            // Lazy-load pdf.js if not already present
            if (!window.pdfjsLib && typeof loadLazyScript === 'function') {
                await loadLazyScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                }
            }
            if (!window.pdfjsLib) throw new Error("PDF reader library failed to load.");
            
            const fileReader = new FileReader();
            const pdfResult = await new Promise((resolve, reject) => {
                fileReader.onload = async function() {
                    try {
                        const typedarray = new Uint8Array(this.result); 
                        const pdf = await pdfjsLib.getDocument(typedarray).promise; 
                        const page = await pdf.getPage(1); 
                        const viewport = page.getViewport({scale: 1.5}); 
                        const canvas = document.createElement('canvas'); 
                        const ctx = canvas.getContext('2d');
                        canvas.height = viewport.height; 
                        canvas.width = viewport.width; 
                        await page.render({canvasContext: ctx, viewport: viewport}).promise;
                        
                        let textStr = "";
                        try {
                            const textContent = await page.getTextContent();
                            textStr = textContent.items.map(i => i.str).join('\n');
                        } catch (te) { console.warn("PDF text parse fallback:", te); }

                        resolve({
                            dataUrl: canvas.toDataURL('image/jpeg', 0.8),
                            text: textStr
                        });
                    } catch(e) { reject(new Error("PDF parsing failed.")); }
                }; 
                fileReader.readAsArrayBuffer(file);
            });
            base64Data = pdfResult.dataUrl;
            extractedText = pdfResult.text;
        } else {
            base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas'); const MAX_DIM = 1200; let w = img.width, h = img.height;
                        if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
                        canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                        resolve(canvas.toDataURL('image/jpeg', 0.7));
                    }; img.onerror = () => reject(new Error("Image load failed.")); img.src = e.target.result;
                }; reader.onerror = () => reject(new Error("File reading failed.")); reader.readAsDataURL(file);
            });
        }

        const payload = { base64Data, mimeType, clientId: myClientID, extractedText };
        pendingUploadPayload = payload;
        lastUploadedMenuPreviewUrl = (base64Data && base64Data.startsWith('data:image')) ? base64Data : null;

        // Check Gemini AI Operational status
        let isGeminiReady = false;
        try {
            const statusRes = await fetch(`/api/gemini/status?clientId=${encodeURIComponent(myClientID)}`);
            if (statusRes.ok) {
                const statusData = await statusRes.json();
                isGeminiReady = Boolean(statusData && statusData.operational);
            }
        } catch (statusErr) {
            console.warn("Could not check Gemini operational status:", statusErr);
        }

        if (isGeminiReady) {
            showToast("🤖 Converting menu with Google Gemini AI Vision (Primary Engine)...");
            await executeMenuExtraction(payload, false);
        } else {
            showToast("📄 Parsing menu with Smart Layout Parser...");
            await executeMenuExtraction(payload, true);
        }
    } catch (error) { 
        console.warn("AI Menu Processing:", error.message); 
        showToast("⚠️ " + error.message); 
    } finally { 
        if (btn) { btn.disabled = false; btn.innerText = "Upload Menu Photo"; }
        const uploader = document.getElementById('aiMenuFileInput') || document.getElementById('aiMenuUploader');
        if (uploader) uploader.value = ''; 
    }
}
window.processAIMenu = processAIMenu;

async function executeMenuExtraction(payload, isExplicitFallback = false) {
    if (!payload) return;
    const btn = document.getElementById('aiMenuBtn');
    if (btn) { btn.disabled = true; btn.innerText = "⏳ Extracting Menu..."; }
    if (isExplicitFallback) {
        showToast("📄 Parsing menu layout with Smart Parser...");
    } else {
        showToast("🤖 Analyzing menu with Gemini AI...");
    }

    try {
        let serverData = null;
        try {
            const serverRes = await fetch('/api/extract-menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (serverRes.ok) {
                serverData = await serverRes.json();
            } else if (serverRes.status === 429) {
                const errData = await serverRes.json().catch(() => ({}));
                throw new Error(errData.error || "Monthly AI upload quota reached for this store.");
            } else {
                console.warn(`Server extraction status: ${serverRes.status}, applying smart layout parser.`);
            }
        } catch (fetchErr) {
            if (fetchErr.message && fetchErr.message.includes("quota")) throw fetchErr;
            console.warn("Server connection failed or offline, switching to smart layout parser:", fetchErr);
        }

        // Automatic smart layout fallback if server returned error or empty
        if (!serverData || !serverData.categories || serverData.categories.length === 0) {
            serverData = parseLocalMenuFallback(payload);
        }

        if (serverData.isFallback) {
            showToast("ℹ️ " + (serverData.warning || "Menu extracted using smart layout parser. Review items before import."));
        } else if (serverData.quota) {
            showToast(`🤖 AI Scanned! Quota remaining this month: ${serverData.quota.remaining}/${serverData.quota.limit}`);
        }

        pendingAiItems = [];
        pendingAiFallbackNotice = serverData.isFallback ? (serverData.warning || "Gemini Vision API key is unauthenticated. Items parsed via smart fallback below.") : null;

        if (serverData.categories && Array.isArray(serverData.categories)) {
            serverData.categories.forEach(cat => {
                const catName = String(cat.name || cat.category || "General").trim();
                if (cat.items && Array.isArray(cat.items)) {
                    cat.items.forEach(item => {
                        const rawName = String(item.name || item.title || item.ItemName || "New Item").trim();
                        const rawPrice = parseFloat(item.price !== undefined ? item.price : (item.Price !== undefined ? item.Price : 0)) || 0;
                        const prompt = item.image_prompt || `${rawName} gourmet cafe food dish photography`;
                        const hasImg = Boolean(item.image && typeof item.image === 'string' && (item.image.startsWith('data:image') || item.image.startsWith('http')));
                        const initialImg = hasImg ? item.image : generateFallbackImage(rawName);

                        pendingAiItems.push({
                            name: rawName,
                            price: rawPrice,
                            category: catName,
                            image: initialImg,
                            image_prompt: prompt,
                            hasCustomImage: hasImg
                        });
                    });
                }
            });
        }

        renderAiPreviewModal();
        const prevModal = document.getElementById('aiPreviewModal');
        if (prevModal) prevModal.style.display = 'flex';
    } catch (error) {
        console.warn("Execute Menu Extraction Error:", error.message);
        showToast("⚠️ " + error.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Upload Menu Photo"; }
        const uploader = document.getElementById('aiMenuFileInput') || document.getElementById('aiMenuUploader');
        if (uploader) uploader.value = '';
    }
}
window.executeMenuExtraction = executeMenuExtraction;

function closeAiPreConvertModal() {
    const preModal = document.getElementById('aiPreConvertModal');
    if (preModal) preModal.style.display = 'none';
    pendingUploadPayload = null;
}
window.closeAiPreConvertModal = closeAiPreConvertModal;

function handlePreConvertConfigureKey() {
    closeAiPreConvertModal();
    if (typeof openClientQuotaModal === 'function') openClientQuotaModal();
}
window.handlePreConvertConfigureKey = handlePreConvertConfigureKey;

function handlePreConvertProceedFallback() {
    const payload = pendingUploadPayload;
    closeAiPreConvertModal();
    if (payload) {
        executeMenuExtraction(payload, true);
    }
}
window.handlePreConvertProceedFallback = handlePreConvertProceedFallback;

function renderAiPreviewModal() {
    const container = document.getElementById('aiPreviewItemsContainer');
    if (!container) return;

    const docPreviewBar = document.getElementById('aiUploadedMenuPreviewBar');
    const docThumb = document.getElementById('aiUploadedMenuThumb');
    if (docPreviewBar && docThumb) {
        if (lastUploadedMenuPreviewUrl) {
            docThumb.src = lastUploadedMenuPreviewUrl;
            docPreviewBar.style.display = 'flex';
        } else {
            docPreviewBar.style.display = 'none';
        }
    }

    const datalist = document.getElementById('knownCategoriesList');
    if (datalist) {
        const uniqueCategories = Array.from(new Set([
            ...menuCategories.filter(c => c !== 'All'),
            ...pendingAiItems.map(i => i.category).filter(Boolean)
        ]));
        datalist.innerHTML = uniqueCategories.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    }

    const { mode, defaultRate } = getStoreGstConfig();
    const gstNotice = document.getElementById('aiPreviewGstModeLabel');
    if (gstNotice) {
        if (mode === 'exclusive') {
            gstNotice.innerHTML = `<span style="color: var(--warning);">Prices Exclude GST (+${defaultRate}% added on top)</span>`;
        } else if (mode === 'none') {
            gstNotice.innerHTML = `<span style="color: var(--text-muted);">GST Exempt (0%)</span>`;
        } else {
            gstNotice.innerHTML = `<span style="color: var(--success);">Prices Include GST (${defaultRate}%)</span>`;
        }
    }

    const badge = document.getElementById('aiPreviewItemCountBadge');
    if (badge) badge.innerText = `${pendingAiItems.length} Item${pendingAiItems.length === 1 ? '' : 's'}`;

    if (pendingAiItems.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 20px; color: var(--text-muted);">
                <p style="font-size: 14px; font-weight: 600; margin-bottom: 10px;">No items in review.</p>
                <button type="button" class="btn btn-outline" style="padding: 8px 16px; font-size: 12px;" onclick="addManualPendingAiItem()">➕ Add Item</button>
            </div>
        `;
        return;
    }

    let html = '';
    if (pendingAiFallbackNotice) {
        html += `<div style="background: rgba(230,81,0,0.08); border-left: 4px solid var(--warning); padding: 8px 12px; border-radius: 8px; font-size: 11px; margin-bottom: 8px; color: #b75500; line-height: 1.4;">
            <strong>Notice:</strong> ${escapeHtml(pendingAiFallbackNotice)}
        </div>`;
    }

    pendingAiItems.forEach((item, index) => {
        const safeName = escapeHtml(item.name || '');
        const safeCat = escapeHtml(item.category || '');
        const safePrice = (item.price !== undefined && item.price !== null) ? item.price : 0;
        const imgDisplay = item.image || generateFallbackImage(item.name || 'Item');

        html += `
        <div class="ai-review-item" id="ai-item-row-${index}">
            <div class="ai-item-thumb" onclick="triggerAiItemImageUpload(${index})" title="Click to upload or replace dish photo">
                <img id="ai-item-img-${index}" src="${imgDisplay}" alt="${safeName}" onerror="this.src=generateFallbackImage('${safeName}')">
                <div class="ai-thumb-badge" title="Upload dish photo"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></div>
            </div>

            <div class="ai-item-info">
                <label>Item Name</label>
                <input type="text" value="${safeName}" oninput="updatePendingItemField(${index}, 'name', this.value)" placeholder="Dish or Beverage Name" style="width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-dark); background: #fff;">
                <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                    <button type="button" onclick="triggerAiItemImageUpload(${index})" style="background: none; border: none; font-size: 11px; color: var(--milk-choc); cursor: pointer; padding: 0; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Upload Photo</button>
                    <span style="color: var(--border); font-size: 10px;">•</span>
                    <button type="button" onclick="generateAiItemPhoto(${index})" id="ai-gen-btn-${index}" style="background: none; border: none; font-size: 11px; color: var(--success); cursor: pointer; padding: 0; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>AI Visual</button>
                    ${item.hasCustomImage ? '<span style="font-size: 10px; color: var(--success); font-weight: 700; display: inline-flex; align-items: center; gap: 2px;">✓ Attached</span>' : ''}
                </div>
            </div>

            <div class="item-meta-category" style="display: flex; flex-direction: column; gap: 3px;">
                <label>Category</label>
                <input type="text" value="${safeCat}" oninput="updatePendingItemField(${index}, 'category', this.value)" list="knownCategoriesList" placeholder="Category" style="width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--border); font-size: 12px; font-weight: 500; background: #fff;">
            </div>

            <div class="item-meta-rate" style="display: flex; flex-direction: column; gap: 4px; min-width: 140px;">
                <label style="font-size: 11px; font-weight: 800; color: var(--primary); letter-spacing: 0.4px;">RATE / PRICE (₹)</label>
                <div style="display: flex; align-items: center; position: relative;">
                    <span style="position: absolute; left: 10px; font-weight: 800; color: var(--primary); font-size: 14px; pointer-events: none;">₹</span>
                    <input type="number" step="0.5" min="0" value="${safePrice}" oninput="updatePendingItemField(${index}, 'price', this.value)" placeholder="0.00" style="width: 100%; height: 38px; padding: 7px 8px 7px 26px; border-radius: 8px; border: 1.5px solid var(--border); font-size: 15px; font-weight: 800; color: var(--primary); background: #fff; box-shadow: var(--shadow-xs);">
                </div>
            </div>

            <div style="text-align: right;">
                <button type="button" class="catalog-action-btn delete-btn" onclick="removePendingAiItem(${index})" style="width: 28px; height: 28px;" title="Remove this item"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;
}
window.renderAiPreviewModal = renderAiPreviewModal;

function updatePendingItemField(index, field, value) {
    if (!pendingAiItems[index]) return;
    if (field === 'price') {
        pendingAiItems[index].price = parseFloat(value) || 0;
    } else {
        pendingAiItems[index][field] = value;
    }
}
window.updatePendingItemField = updatePendingItemField;

function triggerAiItemImageUpload(index) {
    pendingAiImageTargetIndex = index;
    const uploader = document.getElementById('aiItemImageUploader');
    if (uploader) {
        uploader.value = '';
        uploader.click();
    }
}
window.triggerAiItemImageUpload = triggerAiItemImageUpload;

function handleAiItemImageSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file || pendingAiImageTargetIndex === null || !pendingAiItems[pendingAiImageTargetIndex]) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas');
            const maxDim = 400;
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
            } else {
                if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);

            pendingAiItems[pendingAiImageTargetIndex].image = compressedBase64;
            pendingAiItems[pendingAiImageTargetIndex].hasCustomImage = true;

            renderAiPreviewModal();
            showToast(`📸 Photo attached to ${pendingAiItems[pendingAiImageTargetIndex].name || 'item'}!`);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
window.handleAiItemImageSelected = handleAiItemImageSelected;

async function generateAiItemPhoto(index) {
    const item = pendingAiItems[index];
    if (!item) return;
    const btn = document.getElementById(`ai-gen-btn-${index}`);
    if (btn) {
        btn.disabled = true;
        btn.innerText = "⏳ Generating...";
    }
    showToast(`✨ Generating visual for ${item.name || 'item'}...`);
    try {
        const prompt = item.image_prompt || `${item.name} gourmet cafe food dish photography`;
        const base64 = await fetchImageAsBase64(prompt, item.name || 'item');
        if (base64) {
            item.image = base64;
            item.hasCustomImage = true;
            renderAiPreviewModal();
            showToast(`✨ Visual created for ${item.name}!`);
        }
    } catch (err) {
        console.warn("AI generation failed:", err);
        showToast("⚠️ Could not generate visual: " + err.message);
        if (btn) {
            btn.disabled = false;
            btn.innerText = "✨ AI Visual";
        }
    }
}
window.generateAiItemPhoto = generateAiItemPhoto;

function removePendingAiItem(index) {
    if (pendingAiItems[index]) {
        pendingAiItems.splice(index, 1);
        renderAiPreviewModal();
    }
}
window.removePendingAiItem = removePendingAiItem;

function addManualPendingAiItem() {
    pendingAiItems.push({
        name: "",
        price: 0,
        category: menuCategories.find(c => c !== 'All') || "Food",
        image: generateFallbackImage("New Item"),
        image_prompt: "",
        hasCustomImage: false
    });
    renderAiPreviewModal();
    const container = document.getElementById('aiPreviewItemsContainer');
    if (container) container.scrollTop = container.scrollHeight;
}
window.addManualPendingAiItem = addManualPendingAiItem;

function closeAiPreviewModal() {
    document.getElementById('aiPreviewModal').style.display = 'none';
    pendingAiItems = [];
    pendingAiImageTargetIndex = null;
    pendingAiFallbackNotice = null;
}
window.closeAiPreviewModal = closeAiPreviewModal;

async function confirmAiImport() {
    const btn = document.getElementById('btnConfirmAiImport') || document.querySelector('#aiPreviewModal .btn-success');
    try {
        if (btn) { btn.disabled = true; btn.innerText = "⏳ Importing Items..."; }
        if (!pendingAiItems || pendingAiItems.length === 0) {
            throw new Error("No items in review to import.");
        }

        let itemsAdded = 0;
        let newCategoriesAdded = 0;
        const { defaultRate } = getStoreGstConfig();

        pendingAiItems.forEach((item, itemIndex) => {
            const rawName = String(item.name || "").trim();
            if (!rawName) return;

            let catName = String(item.category || "General").trim();
            if (!catName) catName = "General";

            const existingCat = menuCategories.find(c => c.toLowerCase() === catName.toLowerCase());
            if (!existingCat) {
                menuCategories.push(catName);
                newCategoriesAdded++;
            } else {
                catName = existingCat;
            }

            const itemRate = parseFloat(item.price) || 0;
            const finalImage = item.image || generateFallbackImage(rawName);

            const newItem = {
                id: Date.now() + (itemIndex * 100) + Math.floor(Math.random() * 1000),
                name: rawName,
                category: catName,
                price: itemRate,
                gstRate: defaultRate,
                trackStock: false,
                stockQty: 0,
                image: finalImage
            };

            menuItems.push(newItem);
            itemsAdded++;
        });

        if (itemsAdded === 0) {
            throw new Error("Please specify at least one valid item name.");
        }

        persistCategories();
        persistMenu();
        renderCategoryDropdown();
        renderCategoryFilters();
        renderCategoryListUI();
        renderMenuUI();

        closeAiPreviewModal();
        showToast(`✅ Successfully imported ${itemsAdded} items to menu!`);
    } catch (error) {
        console.error(error);
        showToast("❌ Import failed: " + error.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "✅ Confirm & Import to Menu"; }
    }
}
window.confirmAiImport = confirmAiImport;
