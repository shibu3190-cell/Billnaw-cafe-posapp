// ============================================================
// 🍽️ JS/MENU.JS - Menu Catalog, Categories, AI OCR & Visuals
// ============================================================

const _menuEsc = (str) => (typeof escapeHtml === 'function')
    ? escapeHtml(str)
    : String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

function _sanitizeMenuImgUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return '';
    if (/^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);|\/uploads\/|\.\/|assets\/)/i.test(raw)) {
        return raw;
    }
    return '';
}

function canCurrentStaffManageMenu() {
    if (typeof window !== 'undefined' && window._menuAdminPinAuthorizedUntil && Date.now() < window._menuAdminPinAuthorizedUntil) {
        return true;
    }
    try {
        if (typeof sessionStorage !== 'undefined') {
            const authUntil = Number(sessionStorage.getItem('billnaw_admin_pin_auth_until') || 0);
            if (authUntil > Date.now()) return true;
        }
    } catch (e) {}
    if (typeof currentStaff === 'undefined') {
        return (typeof hasPermission !== 'function');
    }
    const active = currentStaff || (typeof window !== 'undefined' ? window.currentStaff : null);
    if (!active || !active.role) {
        return (typeof hasPermission !== 'function' && !active);
    }
    const r = String(active.role).trim().toLowerCase();
    if (r === 'admin' || r === 'owner' || r === 'manager' || r === 'cashier') {
        return true;
    }
    if (typeof hasPermission === 'function') {
        return hasPermission(active, 'can_manage_menu');
    }
    return false;
}
window.canCurrentStaffManageMenu = canCurrentStaffManageMenu;

function _requireMenuPermission(actionLabel, onAuthorized) {
    if (canCurrentStaffManageMenu()) return true;
    if (typeof requestManagerOverride === 'function') {
        requestManagerOverride({
            title: 'Admin Authorization Required',
            actionDescription: `Enter 4-Digit Admin PIN to ${actionLabel}:`,
            requiredRole: 'Admin',
            grantMenuSession: true,
            onSuccess: () => {
                const authUntil = Date.now() + (30 * 60 * 1000);
                if (typeof window !== 'undefined') window._menuAdminPinAuthorizedUntil = authUntil;
                try { sessionStorage.setItem('billnaw_admin_pin_auth_until', String(authUntil)); } catch (e) {}
                if (typeof onAuthorized === 'function') onAuthorized();
            }
        });
    } else if (typeof showToast === 'function') {
        showToast('Permission denied: Admin authorization required.', 'error');
    }
    return false;
}

let pendingAiItems = [];
let pendingAiImageTargetIndex = null;
let pendingAiFallbackNotice = null;
let pendingUploadPayload = null;
let lastUploadedMenuPreviewUrl = null;

function renderCategoryDropdown(selectedCategory) {
    const select = document.getElementById('newItemCategory');
    if (select) {
        const currentVal = selectedCategory || select.value;
        const validCats = (Array.isArray(menuCategories) ? menuCategories : []).filter(c => c !== 'All');
        let html = validCats.map(c => `<option value="${escapeHtml(c)}" ${c === currentVal ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('');
        html += `<option value="__NEW_CATEGORY__">+ Add New Category...</option>`;
        select.innerHTML = html;
        if (currentVal && validCats.includes(currentVal)) {
            select.value = currentVal;
        } else if (validCats.length > 0 && (!select.value || select.value === '__NEW_CATEGORY__')) {
            select.value = validCats[0];
        }
    }
}
window.renderCategoryDropdown = renderCategoryDropdown;

function promptAddNewCategoryFromModal() {
    const cat = prompt("Enter new category name (e.g., Desserts, Soups, Specials):");
    if (cat && cat.trim()) {
        const cleanName = cat.trim();
        const added = addCategory(cleanName);
        if (added) {
            renderCategoryDropdown(cleanName);
            const select = document.getElementById('newItemCategory');
            if (select) select.value = cleanName;
        }
    } else {
        renderCategoryDropdown();
    }
}
window.promptAddNewCategoryFromModal = promptAddNewCategoryFromModal;

function handleItemCategorySelectChange(selectEl) {
    if (selectEl && selectEl.value === '__NEW_CATEGORY__') {
        promptAddNewCategoryFromModal();
    }
}
window.handleItemCategorySelectChange = handleItemCategorySelectChange;

function openAddDishModal() {
    return openAddMenuItemModal();
}
window.openAddDishModal = openAddDishModal;

function renderCategoryFilters() {
    const el = document.getElementById('categoryFiltersUI');
    if (!el) return;
    el.innerHTML = (Array.isArray(menuCategories) ? menuCategories : []).map(cat =>
        `<div class="cat-chip ${cat === activeCategory ? 'active' : ''}" data-category="${_menuEsc(cat)}" onclick="filterMenu(this.dataset.category)">${_menuEsc(cat)}</div>`
    ).join('');
}
window.renderCategoryFilters = renderCategoryFilters;

function renderCategoryListUI() {
    const container = document.getElementById('categoryListUI');
    const validCats = Array.isArray(menuCategories) ? menuCategories : [];
    if (container) {
        container.innerHTML = validCats.map(c => `
            <span class="category-manage-chip">
                <span>${_menuEsc(c)}</span>
                ${c !== 'All' ? `<button type="button" class="del-btn" data-category="${_menuEsc(c)}" onclick="deleteCategory(this.dataset.category)" title="Delete Category ${_menuEsc(c)}" style="display:inline-flex;align-items:center;justify-content:center;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>` : ''}
            </span>
        `).join('');
    }
    const catCountBadge = document.getElementById('categoryCountBadge');
    if (catCountBadge) {
        const count = validCats.filter(c => c !== 'All').length;
        catCountBadge.innerText = `${count} Categor${count === 1 ? 'y' : 'ies'}`;
    }
    const menuCategoriesCount = document.getElementById('menuCategoriesCount');
    if (menuCategoriesCount) {
        menuCategoriesCount.innerText = validCats.filter(c => c !== 'All').length;
    }
}
window.renderCategoryListUI = renderCategoryListUI;

function addCategory(customName, bypassRoleCheck = false) {
    if (!bypassRoleCheck && !_requireMenuPermission('add menu categories', () => addCategory(customName, true))) {
        return false;
    }
    const catInput = document.getElementById('newCategoryName');
    let cat = (customName && typeof customName === 'string') ? customName.trim() : (catInput ? catInput.value.trim() : '');
    if (!cat) {
        showToast("Please enter a category name.");
        return false;
    }
    if (cat.toLowerCase() === 'all') {
        showToast("'All' is a reserved category filter.");
        return false;
    }
    if (!Array.isArray(menuCategories)) {
        menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
    }
    const exists = menuCategories.some(c => c.toLowerCase() === cat.toLowerCase());
    if (exists) {
        showToast(`Category "${cat}" already exists.`);
        return false;
    }

    menuCategories.push(cat);
    window.menuCategories = menuCategories;
    if (catInput) catInput.value = '';

    persistCategories();
    renderCategoryDropdown(cat);
    renderCategoryFilters();
    renderCategoryListUI();
    if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();

    showToast(`Category "${cat}" added!`);
    return true;
}
window.addCategory = addCategory;

function deleteCategory(cat, bypassRoleCheck = false) {
    if (!bypassRoleCheck && !_requireMenuPermission('delete menu categories', () => deleteCategory(cat, true))) return;
    if (cat === 'All') return;
    if (confirm(`Delete category "${cat}"?`)) {
        menuCategories = (Array.isArray(menuCategories) ? menuCategories : []).filter(c => c !== cat);
        window.menuCategories = menuCategories;
        if (activeCategory === cat) {
            activeCategory = "All";
            _menuRenderLimit = _MENU_PAGE_SIZE;
        }
        persistCategories();
        renderCategoryDropdown();
        renderCategoryFilters();
        renderCategoryListUI();
        if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
        renderMenuUI();
        showToast("Category deleted.");
    }
}
window.deleteCategory = deleteCategory;

function filterMenu(category) { 
    if (typeof window !== 'undefined' && Array.isArray(window.menuItems) && window.menuItems.length > 0 && (!Array.isArray(menuItems) || menuItems.length === 0)) {
        menuItems = window.menuItems;
    }
    _menuRenderLimit = _MENU_PAGE_SIZE;
    activeCategory = category; 
    renderCategoryFilters(); 
    renderMenuUI(); 
}
window.filterMenu = filterMenu;

// ⚡ BOUNDED FIFO CACHE FOR FAILED IMAGES (Prevents RAM growth in long shifts on low-memory devices)
const _MAX_FAILED_MENU_IMG_URLS = 100;
const _failedMenuImageUrls = new Set();
const _origFailedUrlsAdd = _failedMenuImageUrls.add.bind(_failedMenuImageUrls);
_failedMenuImageUrls.add = function(url) {
    if (!url || typeof url !== 'string' || url.startsWith('data:') || this.has(url)) return this;
    if (this.size >= _MAX_FAILED_MENU_IMG_URLS) {
        const oldest = this.keys().next().value;
        if (oldest) this.delete(oldest);
    }
    return _origFailedUrlsAdd(url);
};

function _resolveStableMenuThumb(item) {
    const rawThumb = item.image || item.image_url || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(item.name, item.category) : generateFallbackImage(item.name, item.category));
    const sanitized = _sanitizeMenuImgUrl(rawThumb);
    if (!sanitized || _failedMenuImageUrls.has(sanitized)) {
        return generateFallbackImage(item.name, item.category);
    }
    return sanitized;
}

function _handleMenuImgError(imgEl) {
    if (!imgEl) return;
    imgEl.onerror = null;
    const failedUrl = (imgEl.dataset && imgEl.dataset.resolvedSrc) || imgEl.getAttribute('src') || '';
    if (failedUrl && !failedUrl.startsWith('data:')) {
        _failedMenuImageUrls.add(failedUrl);
    }
    const fallback = generateFallbackImage((imgEl.dataset && imgEl.dataset.itemName) || '', (imgEl.dataset && imgEl.dataset.itemCat) || '');
    if (imgEl.dataset) {
        imgEl.dataset.resolvedSrc = fallback;
    }
    if (imgEl.src !== fallback) {
        imgEl.src = fallback;
    }
}
if (typeof window !== 'undefined') {
    window._handleMenuImgError = _handleMenuImgError;
    window._failedMenuImageUrls = _failedMenuImageUrls;
}

function _isMenuCatalogViewActive() {
    if (typeof document === 'undefined') return false;
    const menuView = document.getElementById('menu');
    return Boolean(menuView && menuView.classList.contains('active'));
}

// ⚡ WINDOWED RENDERING & DEBOUNCE CONTROLLERS
const _MENU_PAGE_SIZE = 36;
let _menuRenderLimit = _MENU_PAGE_SIZE;
let _menuInfiniteScrollObserver = null;

function loadMoreMenuItems() {
    _menuRenderLimit += _MENU_PAGE_SIZE;
    renderMenuUI();
}

function _attachMenuInfiniteScrollObserver() {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;
    const loadMoreContainer = document.getElementById('menuLoadMoreContainer');
    if (!loadMoreContainer) {
        if (_menuInfiniteScrollObserver) {
            _menuInfiniteScrollObserver.disconnect();
            _menuInfiniteScrollObserver = null;
        }
        return;
    }
    if (_menuInfiniteScrollObserver) {
        _menuInfiniteScrollObserver.disconnect();
    }
    _menuInfiniteScrollObserver = new IntersectionObserver((entries) => {
        if (entries && entries[0] && entries[0].isIntersecting) {
            loadMoreMenuItems();
        }
    }, { rootMargin: '250px' });
    _menuInfiniteScrollObserver.observe(loadMoreContainer);
}

if (typeof window !== 'undefined') {
    window.loadMoreMenuItems = loadMoreMenuItems;
    window._MENU_PAGE_SIZE = _MENU_PAGE_SIZE;
    Object.defineProperty(window, '_menuRenderLimit', {
        get() { return _menuRenderLimit; },
        set(val) { _menuRenderLimit = Number(val) || _MENU_PAGE_SIZE; },
        configurable: true,
        enumerable: true
    });
}

let _menuSearchDebounceTimer = null;

function debouncedMenuSearch(immediate = false) {
    _menuRenderLimit = _MENU_PAGE_SIZE;
    if (_menuSearchDebounceTimer) {
        clearTimeout(_menuSearchDebounceTimer);
        _menuSearchDebounceTimer = null;
    }
    if (immediate === true) {
        renderMenuUI();
        return;
    }
    _menuSearchDebounceTimer = setTimeout(() => {
        _menuSearchDebounceTimer = null;
        renderMenuUI();
    }, 200);
}
if (typeof window !== 'undefined') {
    window.debouncedMenuSearch = debouncedMenuSearch;
}

function renderMenuUI() {
    if (typeof window !== 'undefined' && Array.isArray(window.menuItems) && window.menuItems.length > 0 && (!Array.isArray(menuItems) || menuItems.length === 0)) {
        menuItems = window.menuItems;
    } else if (Array.isArray(menuItems) && typeof window !== 'undefined' && (!window.menuItems || window.menuItems.length !== menuItems.length)) {
        window.menuItems = menuItems;
    }
    const posGrid = document.getElementById('menuGridUI');
    if (!posGrid) return;

    // Zero phantom data: render welcoming empty slate if no active user-created menu items exist
    const activeItems = (Array.isArray(menuItems) ? menuItems : []).filter(i => !i.isDeleted && i.isAvailable !== false && !i.is_template && i.source !== 'template' && i.is_active !== false);
    if (activeItems.length === 0) {
        if (_menuInfiniteScrollObserver) {
            _menuInfiniteScrollObserver.disconnect();
            _menuInfiniteScrollObserver = null;
        }
        posGrid.innerHTML = `
            <div id="posMenuEmptyState" style="grid-column: 1 / -1; text-align: center; padding: 40px 16px; background: #FFFFFF; border: 1.5px dashed #CBD5E1; border-radius: 16px; margin: 10px 0;">
                <div style="width: 52px; height: 52px; border-radius: 50%; background: #F0FDF4; color: #143832; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; border: 1px solid #BBF7D0;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 style="font-size: 16px; font-weight: 700; color: #0F172A; margin: 0 0 6px 0;">No Dishes Added Yet</h3>
                <p style="font-size: 13px; color: #64748B; margin: 0 0 16px 0; max-width: 320px; margin-inline: auto;">Start your menu fresh by scanning with AI or creating your first dish manually.</p>
                <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" onclick="openUploadMenuChoiceModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 13px;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                        <span>Import Menu with AI</span>
                    </button>
                    <button type="button" class="btn btn-outline" onclick="openAddDishModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; font-weight: 600; font-size: 13px;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>Add First Dish</span>
                    </button>
                </div>
            </div>
        `;
        if (_isMenuCatalogViewActive()) renderMenuCatalogUI();
        return;
    }

    // Auto-reset category if activeCategory has no matching items
    if (activeCategory !== "All" && !activeItems.some(i => i.category === activeCategory)) {
        activeCategory = "All";
        window.activeCategory = "All";
        _menuRenderLimit = _MENU_PAGE_SIZE;
        if (typeof renderCategoryFilters === 'function') renderCategoryFilters();
    }

    const searchInput = document.getElementById('menuSearchInput');
    const searchText = (searchInput ? searchInput.value : '').toLowerCase().trim();
    let filteredMenu = activeCategory === "All" ? activeItems : activeItems.filter(i => i.category === activeCategory);
    if (searchText) filteredMenu = filteredMenu.filter(i => i.name.toLowerCase().includes(searchText));

    if (filteredMenu.length === 0) {
        if (_menuInfiniteScrollObserver) {
            _menuInfiniteScrollObserver.disconnect();
            _menuInfiniteScrollObserver = null;
        }
        posGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 36px 16px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border-radius: var(--radius-lg); border: 1.5px dashed var(--border); margin: 8px 0;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: #F1F5F9; color: #64748B; display: inline-flex; align-items: center; justify-content: center; margin: 0 auto 8px auto;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                <div style="font-size: 14px; font-weight: 700; color: var(--text-dark);">No menu items found</div>
                <div style="font-size: 12px; margin-top: 4px;">Click below to display all available dishes.</div>
                <button type="button" class="btn btn-emerald" style="margin-top: 10px; border-radius: 20px; font-size: 11.5px; padding: 6px 16px;" onclick="if(document.getElementById('menuSearchInput')) document.getElementById('menuSearchInput').value=''; filterMenu('All');">
                    Show All Dishes
                </button>
            </div>
        `;
        if (_isMenuCatalogViewActive()) renderMenuCatalogUI();
        return;
    }

    // ⚡ WINDOWED SLICING: Cap initial render of "All" category to _menuRenderLimit (36) to prevent low-RAM WebViews from freezing
    const totalMatching = filteredMenu.length;
    const isWindowed = activeCategory === "All" && (typeof window === 'undefined' || !window._disableMenuWindowing);
    const shouldWindow = isWindowed && totalMatching > _menuRenderLimit;
    const visibleMenu = shouldWindow ? filteredMenu.slice(0, _menuRenderLimit) : filteredMenu;

    // ⚡ FLICKER-FREE TARGETED DOM DIFFING & IN-PLACE PATCHING (preserves <img> nodes)
    const existingCards = (posGrid.querySelectorAll && typeof posGrid.querySelectorAll === 'function') 
        ? posGrid.querySelectorAll('.menu-card') 
        : [];
    const existingCardIds = Array.from(existingCards).map(c => c.getAttribute('data-item-id'));
    const targetCardIds = visibleMenu.map(i => String(i.id));

    const canPatchInPlace = existingCardIds.length === targetCardIds.length &&
                            existingCardIds.every((id, idx) => id === targetCardIds[idx]);

    if (canPatchInPlace) {
        visibleMenu.forEach((item, idx) => {
            const cardEl = existingCards[idx];
            if (!cardEl) return;

            // Patch name & category only when changed
            const nameEl = cardEl.querySelector ? cardEl.querySelector('.name') : null;
            if (nameEl && nameEl.textContent !== item.name) {
                nameEl.textContent = item.name;
            }
            const catEl = cardEl.querySelector ? cardEl.querySelector('.cat-label') : null;
            const expectedCat = item.category || '';
            if (catEl && catEl.textContent !== expectedCat) {
                catEl.textContent = expectedCat;
            }

            // Patch image ONLY if resolved source genuinely changed (zero flicker; re-arm onerror)
            const imgEl = cardEl.querySelector ? cardEl.querySelector('img.card-img') : null;
            if (imgEl) {
                const expectedThumb = _resolveStableMenuThumb(item);
                const currentResolved = (imgEl.dataset && imgEl.dataset.resolvedSrc) || imgEl.getAttribute('src');
                if (imgEl.dataset ? (imgEl.dataset.resolvedSrc !== expectedThumb) : (currentResolved !== expectedThumb)) {
                    if (imgEl.dataset) {
                        imgEl.dataset.resolvedSrc = expectedThumb;
                        imgEl.dataset.itemName = item.name || '';
                        imgEl.dataset.itemCat = item.category || '';
                    }
                    imgEl.onerror = function() { _handleMenuImgError(this); };
                    imgEl.src = expectedThumb;
                }
            }

            // Patch sold-out state & overlay
            const isOut = Boolean(item.trackStock && item.stockQty <= 0);
            if (cardEl.classList && typeof cardEl.classList.toggle === 'function') {
                cardEl.classList.toggle('is-out', isOut);
            }
            const imgWrap = cardEl.querySelector ? cardEl.querySelector('.card-img-wrapper') : null;
            if (imgWrap) {
                let soldOverlay = imgWrap.querySelector ? imgWrap.querySelector('.sold-overlay') : null;
                if (isOut && !soldOverlay) {
                    soldOverlay = document.createElement('div');
                    soldOverlay.className = 'sold-overlay';
                    soldOverlay.innerHTML = '<span class="sold-badge">Sold Out</span>';
                    imgWrap.appendChild(soldOverlay);
                } else if (!isOut && soldOverlay && typeof soldOverlay.remove === 'function') {
                    soldOverlay.remove();
                }
            }

            // Patch rate/price directly
            const priceEl = cardEl.querySelector ? cardEl.querySelector('.card-price-col .price') : null;
            const expectedPrice = `₹ ${item.price}`;
            if (priceEl && priceEl.textContent !== expectedPrice) {
                priceEl.textContent = expectedPrice;
            }

            // Patch stock badge without rebuilding card
            const stockBadge = cardEl.querySelector ? cardEl.querySelector('.stock-badge') : null;
            if (item.trackStock && item.stockQty <= 5 && item.stockQty > 0) {
                if (stockBadge) {
                    stockBadge.className = 'stock-badge low';
                    stockBadge.textContent = `${item.stockQty} left`;
                    stockBadge.style.display = '';
                }
            } else if (item.trackStock && item.stockQty > 5) {
                if (stockBadge) {
                    stockBadge.className = 'stock-badge';
                    stockBadge.textContent = `${item.stockQty} left`;
                    stockBadge.style.display = '';
                }
            } else if (stockBadge) {
                stockBadge.style.display = 'none';
            }
        });

        // Manage Load More button when patching in place
        const existingLoadMore = posGrid.querySelector ? posGrid.querySelector('#menuLoadMoreContainer') : document.getElementById('menuLoadMoreContainer');
        if (shouldWindow) {
            const remainingCount = totalMatching - visibleMenu.length;
            if (existingLoadMore) {
                const btnSpan = existingLoadMore.querySelector ? existingLoadMore.querySelector('button span') : null;
                if (btnSpan) btnSpan.textContent = `Show More Dishes (${remainingCount} remaining)`;
            } else if (typeof document !== 'undefined') {
                const loadMoreDiv = document.createElement('div');
                loadMoreDiv.id = 'menuLoadMoreContainer';
                loadMoreDiv.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: 20px 0 28px 0;';
                loadMoreDiv.innerHTML = `
                    <button type="button" class="btn btn-outline" id="menuLoadMoreBtn" onclick="loadMoreMenuItems()" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 24px; border-radius: 12px; font-weight: 700; font-size: 13px; background: #FFFFFF; border: 1.5px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); color: var(--text-dark); cursor: pointer;">
                        <span>Show More Dishes (${remainingCount} remaining)</span>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                `;
                posGrid.appendChild(loadMoreDiv);
            }
        } else if (existingLoadMore && typeof existingLoadMore.remove === 'function') {
            existingLoadMore.remove();
        }

        syncMenuUIQuantities();
        _attachMenuInfiniteScrollObserver();
        if (_isMenuCatalogViewActive()) renderMenuCatalogUI();
        return;
    }

    // Single-assignment DOM build (avoids O(N^2) innerHTML += layout destruction)
    const cardsHtml = visibleMenu.map(item => {
        let popularBadge = item.badge ? `<div class="badge-popular">${escapeHtml(item.badge)}</div>` : '';
        let stockIndicator = '';
        if(item.trackStock) {
            stockIndicator = item.stockQty > 0 ? `<span class="stock-indicator green"><i></i> In Stock</span>` : `<span class="stock-indicator red"><i></i> Out of Stock</span>`;
        }

        const thumbSrc = _resolveStableMenuThumb(item);
        const safeItemId = _menuEsc(String(item.id));
        const isOut = Boolean(item.trackStock && item.stockQty <= 0);
        const imageHtml = `<img src="${_menuEsc(thumbSrc)}" data-resolved-src="${_menuEsc(thumbSrc)}" class="card-img" alt="${_menuEsc(item.name)}" loading="lazy" decoding="async" data-item-name="${_menuEsc(item.name || '')}" data-item-cat="${_menuEsc(item.category || '')}" onerror="_handleMenuImgError(this)">`;

        return `
        <div class="menu-card${isOut ? ' is-out' : ''}" id="menu-card-${safeItemId}" data-item-id="${safeItemId}" onclick="addToCart(this.dataset.itemId, event)">
            <div class="card-img-wrapper">
                ${imageHtml}
                ${popularBadge}
                ${item.trackStock && item.stockQty <= 5 && item.stockQty > 0 ? `<div class="stock-badge low">${Number(item.stockQty)} left</div>` : (item.trackStock && item.stockQty > 5 ? `<div class="stock-badge">${Number(item.stockQty)} left</div>` : '')}
                ${isOut ? '<div class="sold-overlay"><span class="sold-badge">Sold Out</span></div>' : ''}
                <div class="card-img-price-pill" style="display: none !important;">₹ ${Number(item.price).toFixed(0)}</div>
            </div>
            <div class="card-content">
                <div class="card-top-row">
                    <span class="cat-label">${_menuEsc(item.category)}</span>
                    ${item.trackStock && item.stockQty > 0 ? `<span class="stock-pill">+${item.stockQty}pc</span>` : ''}
                </div>
                <div class="name">${_menuEsc(item.name)}</div>
                <div class="card-bottom-row">
                    <div class="card-price-col">
                        <span class="price">₹ ${item.price}</span>
                        ${stockIndicator}
                    </div>
                    <div id="menu-action-wrap-${safeItemId}"></div>
                </div>
            </div>
        </div>`;
    });

    let loadMoreHtml = '';
    if (shouldWindow) {
        const remainingCount = totalMatching - visibleMenu.length;
        loadMoreHtml = `
            <div id="menuLoadMoreContainer" style="grid-column: 1 / -1; text-align: center; padding: 20px 0 28px 0;">
                <button type="button" class="btn btn-outline" id="menuLoadMoreBtn" onclick="loadMoreMenuItems()" style="display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 10px 24px; border-radius: 12px; font-weight: 700; font-size: 13px; background: #FFFFFF; border: 1.5px solid var(--border); box-shadow: 0 1px 3px rgba(0,0,0,0.05); color: var(--text-dark); cursor: pointer;">
                    <span>Show More Dishes (${remainingCount} remaining)</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
            </div>
        `;
    }

    posGrid.innerHTML = cardsHtml.join('') + loadMoreHtml;
    syncMenuUIQuantities();
    _attachMenuInfiniteScrollObserver();
    if (_isMenuCatalogViewActive()) renderMenuCatalogUI();
}
window.renderMenuUI = renderMenuUI;

const _CATALOG_PAGE_SIZE = 40;
let _catalogRenderLimit = _CATALOG_PAGE_SIZE;

function loadMoreCatalogItems() {
    _catalogRenderLimit += _CATALOG_PAGE_SIZE;
    renderMenuCatalogUI();
}
if (typeof window !== 'undefined') {
    window.loadMoreCatalogItems = loadMoreCatalogItems;
    window._CATALOG_PAGE_SIZE = _CATALOG_PAGE_SIZE;
    Object.defineProperty(window, '_catalogRenderLimit', {
        get() { return _catalogRenderLimit; },
        set(val) { _catalogRenderLimit = Number(val) || _CATALOG_PAGE_SIZE; },
        configurable: true,
        enumerable: true
    });
}

function filterCatalogTable() {
    _catalogRenderLimit = _CATALOG_PAGE_SIZE;
    renderMenuCatalogUI();
}
window.filterCatalogTable = filterCatalogTable;

let catalogActiveCategoryFilter = 'All';

function filterCatalogByCategory(cat) {
    _catalogRenderLimit = _CATALOG_PAGE_SIZE;
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
    if (typeof window !== 'undefined' && Array.isArray(window.menuItems) && window.menuItems.length > 0 && (!Array.isArray(menuItems) || menuItems.length === 0)) {
        menuItems = window.menuItems;
    } else if (Array.isArray(menuItems) && typeof window !== 'undefined' && (!window.menuItems || window.menuItems.length !== menuItems.length)) {
        window.menuItems = menuItems;
    }
    const cleanCardsContainer = document.getElementById('cleanItemCardsList');
    const { mode: gstCurrentMode, defaultRate: gstStoreRate } = getStoreGstConfig();
    const activeCatalogItems = (Array.isArray(menuItems) ? menuItems : []).filter(i => !i.isDeleted && i.isAvailable !== false && !i.is_template && i.source !== 'template' && i.is_active !== false);

    // 1. Update count badges
    const invCountEl = document.getElementById('menuInventoryCount');
    if (invCountEl) invCountEl.innerText = activeCatalogItems.length;

    const catCountEl = document.getElementById('menuCategoriesCount');
    if (catCountEl) catCountEl.innerText = menuCategories.filter(c => c !== 'All').length;

    const countBadge = document.getElementById('catalogItemCountBadge');
    if (countBadge) {
        countBadge.innerText = `${activeCatalogItems.length} Item${activeCatalogItems.length === 1 ? '' : 's'}`;
    }
    if (typeof refreshAiMenuQuotaPill === 'function') {
        refreshAiMenuQuotaPill();
    }

    // 2. Render Category Filter Chips (skip rebuild when unchanged)
    const chipsContainer = document.getElementById('catalogCategoryChips');
    if (chipsContainer) {
        const catsArr = Array.isArray(menuCategories) ? menuCategories : [];
        const chipsSig = `${catalogActiveCategoryFilter || 'All'}||${catsArr.join('|')}`;
        if (!chipsContainer.dataset || chipsContainer.dataset.renderSig !== chipsSig) {
            const chipsHtml = catsArr.map(cat => `
                <button type="button" class="btn btn-outline" data-category="${_menuEsc(cat)}" onclick="filterCatalogByCategory(this.dataset.category)" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: 700; ${catalogActiveCategoryFilter === cat ? 'background: #143832; color: #FFFFFF; border-color: #143832;' : 'color: #4B5563; background: #FFFFFF;'}">
                    ${_menuEsc(cat)}
                </button>
            `).join('');
            const addBtnHtml = `
                <button type="button" class="btn btn-outline" onclick="promptAddNewCategoryFromModal()" title="Add New Category" style="font-size: 11px; padding: 4px 10px; border-radius: 12px; font-weight: 700; color: #143832; background: #E6F4EA; border: 1px dashed #34A853;">
                    + Category
                </button>
            `;
            chipsContainer.innerHTML = chipsHtml + addBtnHtml;
            if (chipsContainer.dataset) chipsContainer.dataset.renderSig = chipsSig;
        }
    }

    // 3. Search and Category Filter
    const searchInput = document.getElementById('catalogSearchInput');
    const query = (searchInput ? searchInput.value : '').toLowerCase().trim();

    let itemsToRender = activeCatalogItems;
    if (catalogActiveCategoryFilter && catalogActiveCategoryFilter !== 'All') {
        itemsToRender = itemsToRender.filter(i => i.category === catalogActiveCategoryFilter);
    }
    if (query) {
        itemsToRender = itemsToRender.filter(i => 
            (i.name && i.name.toLowerCase().includes(query)) ||
            (i.category && i.category.toLowerCase().includes(query))
        );
    }

    // 4. Render Clean Item Cards with flicker-free keyed in-place DOM diffing
    if (cleanCardsContainer) {
        if (!Array.isArray(menuItems) || menuItems.length === 0) {
            cleanCardsContainer.innerHTML = `
                <div id="catalogMenuEmptyState" style="text-align: center; padding: 48px 20px; background: #FFFFFF; border: 1.5px dashed #CBD5E1; border-radius: 16px; margin: 12px 0;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: #F0FDF4; color: #143832; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; border: 1px solid #BBF7D0;">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    </div>
                    <h3 style="font-size: 17px; font-weight: 800; color: #0F172A; margin: 0 0 6px 0;">Your Menu is Fresh &amp; Ready</h3>
                    <p style="font-size: 13px; color: #64748B; margin: 0 0 20px 0; max-width: 360px; margin-inline: auto;">No dishes exist yet. Import your physical menu using AI OCR or add your dishes manually.</p>
                    <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap;">
                        <button type="button" class="btn btn-primary" onclick="openUploadMenuChoiceModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 13px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                            <span>Import Menu with AI</span>
                        </button>
                        <button type="button" class="btn btn-outline" onclick="openAddDishModal()" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 10px; font-weight: 600; font-size: 13px;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span>Add First Dish</span>
                        </button>
                    </div>
                </div>
            `;
        } else if (itemsToRender.length === 0) {
            cleanCardsContainer.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; background: #FFFFFF; border: 1.5px dashed #E5E7EB; border-radius: 14px; color: var(--text-muted); font-size: 13px;">
                    No menu items found matching current search.
                </div>
            `;
        } else {
            const getCatalogStockMeta = (item) => {
                if (!item.trackStock) return { cls: 'unlimited', label: '∞ Unlimited' };
                if (item.stockQty > 5) return { cls: 'in-stock', label: `${item.stockQty} in stock` };
                if (item.stockQty > 0) return { cls: 'low-stock', label: `${item.stockQty} low` };
                return { cls: 'out-stock', label: 'Out of stock' };
            };

            const totalCatalogMatching = itemsToRender.length;
            const isCatalogWindowed = (typeof window === 'undefined' || !window._disableMenuWindowing);
            const shouldWindowCatalog = isCatalogWindowed && totalCatalogMatching > _catalogRenderLimit;
            const visibleCatalogItems = shouldWindowCatalog ? itemsToRender.slice(0, _catalogRenderLimit) : itemsToRender;

            const existingCatalogCards = (cleanCardsContainer.querySelectorAll && typeof cleanCardsContainer.querySelectorAll === 'function')
                ? cleanCardsContainer.querySelectorAll('.clean-item-card[data-catalog-item-id]')
                : [];
            const existingIds = Array.from(existingCatalogCards).map(el => el.getAttribute('data-catalog-item-id'));
            const targetIds = visibleCatalogItems.map(item => String(item.id));
            const hadLoadMoreBtn = Boolean(typeof document !== 'undefined' && document.getElementById('catalogLoadMoreContainer'));
            const canPatchCatalog = existingIds.length === targetIds.length &&
                                    existingIds.every((id, idx) => id === targetIds[idx]) &&
                                    (shouldWindowCatalog === hadLoadMoreBtn);

            if (canPatchCatalog) {
                visibleCatalogItems.forEach((item, idx) => {
                    const cardEl = existingCatalogCards[idx];
                    if (!cardEl) return;

                    const nameEl = cardEl.querySelector('.clean-item-name');
                    if (nameEl && nameEl.textContent !== item.name) nameEl.textContent = item.name;

                    const catEl = cardEl.querySelector('.clean-item-category-tag');
                    const expectedCat = item.category || 'General';
                    if (catEl && catEl.textContent !== expectedCat) catEl.textContent = expectedCat;

                    const priceEl = cardEl.querySelector('.clean-item-price');
                    const expectedPrice = `₹ ${Number(item.price).toFixed(2)}`;
                    if (priceEl && priceEl.textContent !== expectedPrice) priceEl.textContent = expectedPrice;

                    const stockMeta = getCatalogStockMeta(item);
                    const stockEl = cardEl.querySelector('.clean-item-stock-tag');
                    if (stockEl) {
                        const expectedCls = `clean-item-stock-tag ${stockMeta.cls}`;
                        if (stockEl.className !== expectedCls) stockEl.className = expectedCls;
                        if (stockEl.textContent !== stockMeta.label) stockEl.textContent = stockMeta.label;
                    }

                    const imgEl = cardEl.querySelector('img.clean-item-thumb');
                    if (imgEl) {
                        const expectedThumb = _resolveStableMenuThumb(item);
                        const currentResolved = (imgEl.dataset && imgEl.dataset.resolvedSrc) || imgEl.getAttribute('src');
                        if (imgEl.dataset ? (imgEl.dataset.resolvedSrc !== expectedThumb) : (currentResolved !== expectedThumb)) {
                            if (imgEl.dataset) {
                                imgEl.dataset.resolvedSrc = expectedThumb;
                                imgEl.dataset.itemName = item.name || '';
                                imgEl.dataset.itemCat = item.category || '';
                            }
                            imgEl.onerror = function() { _handleMenuImgError(this); };
                            imgEl.src = expectedThumb;
                        }
                    }
                });
                return;
            }

            const catalogCardsHtml = visibleCatalogItems.map(item => {
                const stockMeta = getCatalogStockMeta(item);
                const thumbSrc = _resolveStableMenuThumb(item);
                const safeItemId = _menuEsc(String(item.id));
                return `
                <div class="clean-item-card" data-catalog-item-id="${safeItemId}">
                    <div class="clean-item-left">
                        <img src="${_menuEsc(thumbSrc)}" data-resolved-src="${_menuEsc(thumbSrc)}" class="clean-item-thumb" alt="${_menuEsc(item.name)}" loading="lazy" decoding="async" data-item-name="${_menuEsc(item.name || '')}" data-item-cat="${_menuEsc(item.category || '')}" onerror="_handleMenuImgError(this)">
                        <div class="clean-item-info">
                            <div class="clean-item-title-row">
                                <span class="clean-item-name">${_menuEsc(item.name)}</span>
                                <span class="clean-item-category-tag">${_menuEsc(item.category || 'General')}</span>
                            </div>
                            <div class="clean-item-meta-row">
                                <span class="clean-item-price">₹ ${Number(item.price).toFixed(2)}</span>
                                <span class="clean-item-stock-tag ${stockMeta.cls}">${stockMeta.label}</span>
                            </div>
                        </div>
                    </div>
                    <div class="clean-item-right">
                        <div class="action-dropdown" style="position: relative; display: inline-block;">
                            <button type="button" class="action-dropdown-btn clean-item-more-btn" data-item-id="${safeItemId}" onclick="event.stopPropagation(); toggleMenuItemDropdown(event, this.dataset.itemId)" title="Item Options" aria-label="Item options" aria-haspopup="true">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="1.5"></circle>
                                    <circle cx="12" cy="5" r="1.5"></circle>
                                    <circle cx="12" cy="19" r="1.5"></circle>
                                </svg>
                            </button>
                            <div class="action-dropdown-menu" id="menuItemDropdown-${safeItemId}" style="display: none; position: absolute; right: 0; top: calc(100% + 4px); z-index: 1050; min-width: 155px;">
                                <button type="button" class="action-dropdown-item" data-item-id="${safeItemId}" onclick="event.stopPropagation(); closeAllMenuActionDropdowns(); openQuickAdjustStockModal(this.dataset.itemId);">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                                    <span>Adjust Stock</span>
                                </button>
                                <button type="button" class="action-dropdown-item" data-item-id="${safeItemId}" onclick="event.stopPropagation(); closeAllMenuActionDropdowns(); editMenuItem(this.dataset.itemId);">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                                    <span>Edit Item</span>
                                </button>
                                <button type="button" class="action-dropdown-item danger" data-item-id="${safeItemId}" onclick="event.stopPropagation(); closeAllMenuActionDropdowns(); deleteMenuItem(this.dataset.itemId);">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>Delete Item</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            let catalogLoadMoreHtml = '';
            if (shouldWindowCatalog) {
                const remainingCat = totalCatalogMatching - visibleCatalogItems.length;
                catalogLoadMoreHtml = `
                    <div id="catalogLoadMoreContainer" style="text-align: center; padding: 16px 0 24px 0;">
                        <button type="button" class="btn btn-outline" id="catalogLoadMoreBtn" onclick="loadMoreCatalogItems()" style="display: inline-flex; align-items: center; gap: 8px; padding: 9px 22px; border-radius: 12px; font-weight: 700; font-size: 13px; background: #FFFFFF; border: 1.5px solid var(--border); color: var(--text-dark); cursor: pointer;">
                            <span>Show More Items (${remainingCat} remaining)</span>
                        </button>
                    </div>
                `;
            }
            cleanCardsContainer.innerHTML = catalogCardsHtml + catalogLoadMoreHtml;
        }
    }
}
window.renderMenuCatalogUI = renderMenuCatalogUI;

// ⚡ Menu Item Action Dropdown Toggle Handlers (3-Dot Menu)
function toggleMenuItemDropdown(event, itemId) {
    if (event) {
        event.stopPropagation();
    }
    const targetMenu = document.getElementById(`menuItemDropdown-${itemId}`);
    const parentCard = targetMenu ? targetMenu.closest('.clean-item-card') : null;
    const isVisible = targetMenu && (targetMenu.style.display === 'block' || targetMenu.classList.contains('show'));
    
    closeAllMenuActionDropdowns();
    
    if (targetMenu && !isVisible) {
        targetMenu.style.display = 'block';
        targetMenu.classList.add('show');
        if (parentCard) {
            parentCard.classList.add('dropdown-open');
        }
    }
}
window.toggleMenuItemDropdown = toggleMenuItemDropdown;

function closeAllMenuActionDropdowns() {
    document.querySelectorAll('[id^="menuItemDropdown-"]').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('show');
    });
    document.querySelectorAll('.clean-item-card.dropdown-open').forEach(card => {
        card.classList.remove('dropdown-open');
    });
}
window.closeAllMenuActionDropdowns = closeAllMenuActionDropdowns;

// Global document click listener to close menu item action dropdowns
document.addEventListener('click', (event) => {
    if (!event.target.closest('.clean-item-right .action-dropdown')) {
        closeAllMenuActionDropdowns();
    }
});

// 📸 Upload Menu Choice Dialog Handlers & Quota Telemetry Pill
let _lastAiQuotaFetchAt = 0;
let _lastAiQuotaShopId = '';
async function refreshAiMenuQuotaPill() {
    const force = arguments[0] === true;
    try {
        const activeShopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || 
                             (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || 
                             (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_store_code') || localStorage.getItem('storeCode')) : null) || 
                             'SHOP-BILLNAW-01';
        const now = Date.now();
        if (!force && activeShopId === _lastAiQuotaShopId && (now - _lastAiQuotaFetchAt) < 60000) {
            return;
        }
        _lastAiQuotaShopId = activeShopId;
        _lastAiQuotaFetchAt = now;
        const res = await fetch(`/api/ai/quota?shopId=${encodeURIComponent(activeShopId)}`).catch(() => null);
        if (!res || !res.ok) return;
        const data = await res.json().catch(() => null);
        if (!data) return;
        const remaining = typeof data.remaining === 'number' ? data.remaining : (data.limit !== undefined && data.used !== undefined ? Math.max(0, data.limit - data.used) : 15);
        const limit = data.limit || 15;
        const pillText = document.getElementById('aiMenuQuotaPillText');
        if (pillText) {
            pillText.innerText = `${remaining} / ${limit} scans left this month`;
        }
        const modalStatus = document.getElementById('modalAiQuotaStatus');
        if (modalStatus) {
            modalStatus.innerText = `Quota: ${remaining}/${limit} remaining this month`;
            modalStatus.style.color = remaining <= 2 ? '#DC2626' : 'var(--primary)';
        }
    } catch (e) {
        // Non-critical telemetry UI update
    }
}
window.refreshAiMenuQuotaPill = refreshAiMenuQuotaPill;

function openUploadMenuChoiceModal() {
    if (!_requireMenuPermission('import menu items', () => openUploadMenuChoiceModal())) return;
    const modal = document.getElementById('uploadMenuChoiceModal');
    if (modal) modal.style.display = 'flex';
    if (typeof refreshAiMenuQuotaPill === 'function') {
        refreshAiMenuQuotaPill(true);
    }
}
window.openUploadMenuChoiceModal = openUploadMenuChoiceModal;

function closeUploadMenuChoiceModal() {
    const modal = document.getElementById('uploadMenuChoiceModal');
    if (modal) modal.style.display = 'none';
}
window.closeUploadMenuChoiceModal = closeUploadMenuChoiceModal;

function openMenuFilePicker(inputId) {
    const input = document.getElementById(inputId);
    if (input) {
        input.value = '';
        input.click();
    }
    closeUploadMenuChoiceModal();
}
window.openMenuFilePicker = openMenuFilePicker;

// 📊 Excel / Spreadsheet Menu Upload Handler
async function handleExcelMenuUpload(event) {
    if (!canCurrentStaffManageMenu()) {
        _requireMenuPermission('import menu items');
        if (event && event.target) event.target.value = '';
        return;
    }
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    closeUploadMenuChoiceModal();
    showToast(`Parsing ${file.name}...`, 'info');

    try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        let importedCount = 0;
        if (!Array.isArray(menuItems)) menuItems = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const parts = line.split(/[,\t]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
            if (parts.length >= 2) {
                const name = parts[0];
                const price = parseFloat(parts[1]);
                const category = parts[2] || 'Imported';
                if (name && Number.isFinite(price) && price > 0 && name.toLowerCase() !== 'dish' && name.toLowerCase() !== 'item') {
                    const existingIdx = menuItems.findIndex(m => m && m.name && m.name.trim().toLowerCase() === name.toLowerCase());
                    const imgUrl = (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(name, category) : generateFallbackImage(name, category));
                    let targetId = null;
                    if (existingIdx >= 0) {
                        const existing = menuItems[existingIdx];
                        existing.price = price;
                        existing.category = category;
                        if (!existing.image) existing.image = imgUrl;
                        existing.is_active = true;
                        existing.isDeleted = false;
                        existing.isAvailable = true;
                        existing.deletedAt = null;
                        existing.updatedAt = Date.now();
                        targetId = existing.id;
                    } else {
                        targetId = Date.now() + i;
                        const newItem = {
                            id: targetId,
                            name,
                            price,
                            category,
                            stock: 50,
                            stockQty: 50,
                            trackStock: true,
                            gstRate: 5,
                            image: imgUrl,
                            is_active: true,
                            isDeleted: false,
                            isAvailable: true,
                            deletedAt: null,
                            updatedAt: Date.now()
                        };
                        menuItems.push(newItem);
                    }
                    if (targetId && typeof removeDeletedMenuItemId === 'function') {
                        removeDeletedMenuItemId(targetId);
                    }
                    if (typeof removeDeletedMenuItemName === 'function') {
                        removeDeletedMenuItemName(name);
                    }
                    if (!menuCategories.includes(category)) {
                        menuCategories.push(category);
                    }
                    importedCount++;
                }
            }
        }

        if (importedCount > 0) {
            window.menuItems = menuItems;
            persistMenu();
            persistCategories();
            renderCategoryDropdown();
            renderCategoryFilters();
            renderMenuCatalogUI();
            renderMenuUI();
            if (window.culinaryInventory && typeof window.culinaryInventory.syncMenuItems === 'function') {
                window.culinaryInventory.syncMenuItems();
            }
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
    if (!_requireMenuPermission('adjust menu stock', () => openQuickAdjustStockModal(itemId))) return;
    const item = (Array.isArray(menuItems) ? menuItems : []).find(i => String(i.id) === String(itemId));
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
    if (!canCurrentStaffManageMenu()) {
        if (typeof showToast === 'function') showToast('Permission denied: Manager or Admin authorization required.', 'error');
        return;
    }
    if (!activeAdjustingItem) {
        const idEl = document.getElementById('quickAdjustItemId');
        if (idEl && idEl.value && Array.isArray(menuItems)) {
            activeAdjustingItem = menuItems.find(i => String(i.id) === String(idEl.value));
        }
    }
    if (!activeAdjustingItem) {
        closeQuickAdjustStockModal();
        return;
    }
    const itemName = activeAdjustingItem.name || 'Item';
    activeAdjustingItem.trackStock = false;
    activeAdjustingItem.updatedAt = Date.now();
    persistMenu();
    renderMenuUI();
    closeQuickAdjustStockModal();
    showToast(`${itemName} stock set to Unlimited.`, 'success');
}
window.toggleStockUnlimited = toggleStockUnlimited;

function saveQuickStockAdjustment() {
    if (!canCurrentStaffManageMenu()) {
        if (typeof showToast === 'function') showToast('Permission denied: Manager or Admin authorization required.', 'error');
        return;
    }
    if (!activeAdjustingItem) {
        const idEl = document.getElementById('quickAdjustItemId');
        if (idEl && idEl.value && Array.isArray(menuItems)) {
            activeAdjustingItem = menuItems.find(i => String(i.id) === String(idEl.value));
        }
    }
    if (!activeAdjustingItem) {
        closeQuickAdjustStockModal();
        return;
    }
    const inputEl = document.getElementById('quickAdjustStockInput');
    const newQty = parseInt(inputEl ? inputEl.value : '0', 10);
    
    activeAdjustingItem.trackStock = true;
    activeAdjustingItem.stockQty = isNaN(newQty) ? 0 : Math.max(0, newQty);
    activeAdjustingItem.stock = activeAdjustingItem.stockQty;
    activeAdjustingItem.updatedAt = Date.now();

    const itemName = activeAdjustingItem.name || 'Item';
    const finalQty = activeAdjustingItem.stockQty;

    persistMenu();
    renderMenuUI();
    closeQuickAdjustStockModal();
    showToast(`Updated ${itemName} stock to ${finalQty}.`, 'success');
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
    const currentCart = tablesInfo[activeTable]?.items || [];
    const cartQtyById = new Map();
    for (let c = 0; c < currentCart.length; c++) {
        const ci = currentCart[c];
        if (ci && ci.id !== undefined) {
            cartQtyById.set(String(ci.id), Number(ci.qty) || 0);
        }
    }
    menuItems.forEach(item => {
        const wrapper = document.getElementById(`menu-action-wrap-${item.id}`);
        if(!wrapper) return;
        const qtyInCart = cartQtyById.get(String(item.id)) || 0;

        const safeItemId = _menuEsc(String(item.id));
        let buttonHtml = '';
        if (item.trackStock && item.stockQty <= 0) {
            buttonHtml = `<button type="button" class="add-btn is-out-btn" disabled>OUT</button>`;
        } else if (qtyInCart > 0) {
            buttonHtml = `<div class="item-qty-control" onclick="event.stopPropagation()"><button type="button" data-item-id="${safeItemId}" onclick="modifyQty(this.dataset.itemId, -1, event)" aria-label="Decrease quantity">−</button><span>${qtyInCart}</span><button type="button" data-item-id="${safeItemId}" onclick="addToCart(this.dataset.itemId, event)" aria-label="Increase quantity">+</button></div>`;
        } else {
            buttonHtml = `<button type="button" class="add-btn" data-item-id="${safeItemId}" onclick="addToCart(this.dataset.itemId, event)">+ ADD</button>`;
        }
        if (wrapper.innerHTML !== buttonHtml) { wrapper.innerHTML = buttonHtml; }
    });
}
window.syncMenuUIQuantities = syncMenuUIQuantities;

// --- 📸 FOOD IMAGE MANAGER (MILESTONE M3) HELPERS & STATE ---
currentItemImageBase64 = "";
window.currentItemImageBase64 = currentItemImageBase64;
let currentItemImageMetadata = null;
window.currentItemImageMetadata = currentItemImageMetadata;
let originalDishImage = "";
let originalImageMetadata = null;
let isGeneratingFoodImage = false;

function toggleDietaryPill(btn) {
    if (!btn) return;
    btn.classList.toggle('active');
}
window.toggleDietaryPill = toggleDietaryPill;

function getSelectedDietaryTags() {
    const container = document.getElementById('fimDietaryPills');
    if (!container) return [];
    const activePills = container.querySelectorAll('.fim-dietary-pill.active');
    return Array.from(activePills).map(p => p.getAttribute('data-diet') || p.innerText.trim()).filter(Boolean);
}
window.getSelectedDietaryTags = getSelectedDietaryTags;

function updateFimStatusPill(statusText, statusClass) {
    const pill = document.getElementById('fimStatusPill');
    if (!pill) return;
    pill.className = `fim-status-pill ${statusClass || 'status-none'}`;
    pill.innerText = statusText;
}
window.updateFimStatusPill = updateFimStatusPill;

function setFimActionDockVisible(visible) {
    const dock = document.getElementById('fimActionDock');
    if (dock) {
        dock.style.display = visible ? 'grid' : 'none';
    }
}
window.setFimActionDockVisible = setFimActionDockVisible;

async function compressImageToWebP(file, maxDim = 600, quality = 0.82) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                let w = img.width, h = img.height;
                if (w > h && w > maxDim) {
                    h *= maxDim / w;
                    w = maxDim;
                } else if (h > maxDim) {
                    w *= maxDim / h;
                    h = maxDim;
                }
                canvas.width = Math.round(w);
                canvas.height = Math.round(h);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                let webpData = '';
                try {
                    webpData = canvas.toDataURL('image/webp', quality);
                } catch(err) {}
                if (!webpData || !webpData.startsWith('data:image/webp')) {
                    webpData = canvas.toDataURL('image/jpeg', quality);
                }
                resolve(webpData);
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
window.compressImageToWebP = compressImageToWebP;

async function handleItemImageUpload(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Size validation <= 3MB
    if (file.size > 3 * 1024 * 1024) {
        showToast("⚠️ Image file exceeds 3MB limit!");
        return;
    }

    // MIME type validation
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMimes.includes(file.type)) {
        showToast("⚠️ Only JPEG, PNG, and WebP images are allowed!");
        return;
    }

    try {
        const compressedBase64 = await compressImageToWebP(file, 600, 0.82);
        const mimeType = compressedBase64.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';

        const preview = document.getElementById('newItemImagePreview');
        const placeholder = document.getElementById('fimPlaceholder');
        if (preview) {
            preview.src = compressedBase64;
            preview.style.display = 'block';
            preview.style.opacity = '1';
        }
        if (placeholder) placeholder.style.display = 'none';

        const dishId = editingMenuItemId ? String(editingMenuItemId) : ('dish_' + Date.now());

        // Attempt server upload
        try {
            const uploadResp = await fetch('/api/food-images/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dishId,
                    base64Data: compressedBase64,
                    mimeType: mimeType,
                    filename: file.name
                })
            });
            if (uploadResp.ok) {
                const uploadData = await uploadResp.json();
                if (uploadData.success && uploadData.image) {
                    currentItemImageBase64 = uploadData.image.url;
                    window.currentItemImageBase64 = currentItemImageBase64;
                    currentItemImageMetadata = uploadData.image;
                    window.currentItemImageMetadata = currentItemImageMetadata;
                    if (preview) preview.src = currentItemImageBase64;
                    updateFimStatusPill("Device Upload (WebP)", "status-upload");
                    setFimActionDockVisible(true);
                    showToast("✅ Image optimized (WebP) & saved!");
                    return;
                }
            }
        } catch (uploadErr) {
            console.warn("[FoodImageManager] Upload endpoint unreachable, retaining local copy:", uploadErr.message);
        }

        // Local fallback if offline or server unreachable
        currentItemImageBase64 = compressedBase64;
        window.currentItemImageBase64 = currentItemImageBase64;
        currentItemImageMetadata = {
            id: 'img_upload_' + Date.now(),
            url: compressedBase64,
            source: 'upload',
            approved: true,
            createdAt: new Date().toISOString()
        };
        window.currentItemImageMetadata = currentItemImageMetadata;
        updateFimStatusPill("Device Upload (WebP)", "status-upload");
        setFimActionDockVisible(true);
        showToast("✅ Photo optimized (WebP) & loaded!");
    } catch(err) {
        showToast("⚠️ Could not process image.");
    }
}
window.handleItemImageUpload = handleItemImageUpload;

let dishImageVariationCounters = {};
window.dishImageVariationCounters = dishImageVariationCounters;

async function fetchImageAsBase64(promptText, itemName = '', variationIndex = 0, category = '') {
    const dishName = String(itemName || promptText || '').trim();
    const vIdx = Math.max(0, parseInt(variationIndex, 10) || 0);
    const cat = String(category || '').trim();

    // 1. Direct Curated Gourmet Culinary Photo Library matching locally (for first 4 variations)
    if (typeof getCuratedFoodPhoto === 'function') {
        const directCurated = getCuratedFoodPhoto(dishName, cat, vIdx, false);
        if (directCurated) return directCurated;
    }

    // 2. Try Backend AI Classifier / Image Generator Route
    try {
        const res = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt: promptText,
                itemName: dishName,
                category: cat,
                variation: vIdx,
                clientId: typeof myClientID !== 'undefined' ? myClientID : ''
            })
        });
        if (res.ok) {
            const data = await res.json();
            if (data.imageUrl && (data.imageUrl.startsWith('data:image') || data.imageUrl.startsWith('http'))) {
                return data.imageUrl;
            }
        }
    } catch (apiErr) {
        console.warn("Backend AI image route fallback:", apiErr.message);
    }

    // 3. Category Fallback / High-Definition Canvas Culinary Graphics Fallback
    if (typeof getCuratedFoodPhoto === 'function') {
        const catFallback = getCuratedFoodPhoto(dishName, cat, vIdx, true);
        if (catFallback) return catFallback;
    }
    if (typeof getGourmetFoodImage === 'function') {
        return getGourmetFoodImage(dishName, cat, vIdx);
    }
    if (typeof generateFallbackImage === 'function') {
        return generateFallbackImage(dishName, cat, vIdx);
    }

    return "";
}
window.fetchImageAsBase64 = fetchImageAsBase64;

async function generateAIImage() {
    const nameInput = document.getElementById('newItemName');
    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) return showToast("⚠️ Enter an Item Name first to generate image!");

    // Prevent duplicate concurrent generation clicks
    if (isGeneratingFoodImage) return;
    isGeneratingFoodImage = true;
    
    const catInput = document.getElementById('newItemCategory');
    const cat = catInput ? catInput.value : '';

    const cuisine = document.getElementById('newItemCuisine')?.value.trim() || '';
    const servingStyle = document.getElementById('newItemServingStyle')?.value.trim() || '';
    const dietary = getSelectedDietaryTags();

    const btn = document.getElementById('btnGenerateAI'); 
    const regenBtn = document.getElementById('btnRegenAI');
    const preview = document.getElementById('newItemImagePreview');
    const placeholder = document.getElementById('fimPlaceholder');
    const shimmer = document.getElementById('fimShimmer');

    // Loading / shimmer state
    if (shimmer) shimmer.style.display = 'flex';
    if (btn) {
        btn.innerHTML = `<svg class="fim-spinner" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span>Generating Imagen 3...</span>`; 
        btn.disabled = true;
    }
    if (regenBtn) regenBtn.disabled = true;
    updateFimStatusPill("Generating...", "status-generating");
    
    // Cycle variation index on each successive click
    const normKey = name.toLowerCase().trim();
    if (dishImageVariationCounters[normKey] === undefined) {
        dishImageVariationCounters[normKey] = 0;
    } else {
        dishImageVariationCounters[normKey] = dishImageVariationCounters[normKey] + 1;
    }
    const currentVarIndex = dishImageVariationCounters[normKey];
    const totalVars = typeof getDishVariationCount === 'function' ? getDishVariationCount(name, cat) : 4;
    const varNum = (currentVarIndex % totalVars) + 1;

    // Prepare reliable curated fallback image for offline / rate-limit resilience
    const curatedFallback = (typeof getCuratedFoodPhoto === 'function' ? getCuratedFoodPhoto(name, cat, currentVarIndex, false) : '') ||
        (typeof getCuratedFoodPhoto === 'function' ? getCuratedFoodPhoto(name, cat, currentVarIndex, true) : '') ||
        (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(name, cat, currentVarIndex) : '') ||
        (typeof generateFallbackImage === 'function' ? generateFallbackImage(name, cat, currentVarIndex) : '');

    try {
        let apiSuccess = false;
        let serverData = null;

        // Call protected server-side Imagen 3 endpoint
        try {
            const resp = await fetch('/api/food-images/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dishName: name,
                    cuisine,
                    servingStyle,
                    dietary,
                    aspectRatio: '1:1',
                    variation: currentVarIndex,
                    clientId: typeof myClientID !== 'undefined' ? myClientID : 'admin_pos'
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data.success && data.imageUrl) {
                    apiSuccess = true;
                    serverData = data;
                } else if (data.fallbackUrl) {
                    serverData = data;
                } else if (data.rateLimited || data.cooldown) {
                    showToast(data.error || "⏳ Please wait before generating another image.");
                }
            }
        } catch (netErr) {
            console.warn("[FoodImageManager] Imagen 3 network note:", netErr.message);
        }

        if (apiSuccess && serverData && serverData.imageUrl) {
            currentItemImageBase64 = serverData.imageUrl;
            window.currentItemImageBase64 = currentItemImageBase64;
            currentItemImageMetadata = {
                id: 'img_' + Date.now(),
                url: serverData.imageUrl,
                source: serverData.isAiGenerated ? (serverData.source || 'gemini-ai') : 'authentic-curated',
                createdAt: new Date().toISOString(),
                approved: false
            };
            window.currentItemImageMetadata = currentItemImageMetadata;

            if (preview) {
                preview.src = currentItemImageBase64;
                preview.style.display = 'block';
                preview.style.opacity = '1';
            }
            if (placeholder) placeholder.style.display = 'none';

            if (serverData.isAiGenerated) {
                updateFimStatusPill("✨ AI Generated (Gemini)", "status-ai");
                showToast(`✨ AI image generated for ${name}`);
            } else {
                const statusLabel = serverData.isFreeTierQuota ? "📸 Authentic Photo (Free Tier Key)" : "📸 Authentic Photo";
                updateFimStatusPill(statusLabel, "status-fallback");
                showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${name}`);
            }

            const noticeEl = document.getElementById('fimTierNotice');
            if (noticeEl) {
                if (serverData.isFreeTierQuota && serverData.notice) {
                    noticeEl.style.display = 'flex';
                    noticeEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg><span>${_menuEsc(serverData.notice)}</span>`;
                } else {
                    noticeEl.style.display = 'none';
                }
            }

            setFimActionDockVisible(true);
        } else {
            // Offline / fallback path
            const fallbackUrl = (serverData && serverData.fallbackUrl) || curatedFallback;
            currentItemImageBase64 = fallbackUrl;
            window.currentItemImageBase64 = currentItemImageBase64;
            currentItemImageMetadata = {
                id: 'img_curated_' + Date.now(),
                url: fallbackUrl,
                source: 'curated',
                createdAt: new Date().toISOString(),
                approved: false
            };
            window.currentItemImageMetadata = currentItemImageMetadata;

            if (preview && fallbackUrl) {
                preview.src = currentItemImageBase64;
                preview.style.display = 'block';
                preview.style.opacity = '1';
            }
            if (placeholder) placeholder.style.display = 'none';

            updateFimStatusPill("📸 Authentic Photo", "status-fallback");
            setFimActionDockVisible(true);
            showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${name}`);
        }
    } catch (err) {
        console.warn("[FoodImageManager] Generation error:", err.message);
        currentItemImageBase64 = curatedFallback;
        window.currentItemImageBase64 = currentItemImageBase64;
        if (preview && curatedFallback) {
            preview.src = currentItemImageBase64;
            preview.style.display = 'block';
            preview.style.opacity = '1';
        }
        if (placeholder) placeholder.style.display = 'none';
        updateFimStatusPill("📸 Authentic Photo", "status-fallback");
        setFimActionDockVisible(true);
        showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${name}`);
    } finally {
        isGeneratingFoodImage = false;
        if (shimmer) shimmer.style.display = 'none';
        if (btn) {
            btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg><span>Next Photo</span>`; 
            btn.disabled = false;
        }
        if (regenBtn) regenBtn.disabled = false;
    }
}
window.generateAIImage = generateAIImage;

async function approveAndSaveFoodImage() {
    if (!currentItemImageBase64) {
        showToast("⚠️ No image available to approve!");
        return;
    }

    const dishId = editingMenuItemId ? String(editingMenuItemId) : ('dish_' + Date.now());
    const dishName = document.getElementById('newItemName')?.value.trim() || 'dish';

    // If current image is raw base64 from AI generator or local canvas, persist to server disk
    if (currentItemImageBase64.startsWith('data:image')) {
        try {
            const resp = await fetch('/api/food-images/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dishId,
                    dishName,
                    base64Data: currentItemImageBase64,
                    mimeType: 'image/jpeg'
                })
            });

            if (resp.ok) {
                const data = await resp.json();
                if (data.success && data.image) {
                    currentItemImageBase64 = data.image.url;
                    window.currentItemImageBase64 = currentItemImageBase64;
                    currentItemImageMetadata = data.image;
                    window.currentItemImageMetadata = currentItemImageMetadata;
                    const preview = document.getElementById('newItemImagePreview');
                    if (preview) preview.src = currentItemImageBase64;
                    updateFimStatusPill("Approved & Saved", "status-approved");
                    showToast("✅ Food image approved & saved to disk!");
                    return;
                }
            }
        } catch (saveErr) {
            console.warn("[FoodImageManager] Save image error:", saveErr.message);
        }
    }

    // Static URL (/uploads/food-images/...) or curated remote URL
    currentItemImageMetadata = currentItemImageMetadata || {
        id: 'img_' + dishId,
        url: currentItemImageBase64,
        source: currentItemImageBase64.startsWith('/uploads/') ? (currentItemImageBase64.includes('upload') ? 'upload' : 'gemini-imagen') : 'curated',
        createdAt: new Date().toISOString(),
        approved: true
    };
    currentItemImageMetadata.approved = true;
    window.currentItemImageMetadata = currentItemImageMetadata;
    updateFimStatusPill("Approved & Saved", "status-approved");
    showToast("✅ Food image approved!");
}
window.approveAndSaveFoodImage = approveAndSaveFoodImage;

function discardFoodImage() {
    const preview = document.getElementById('newItemImagePreview');
    const placeholder = document.getElementById('fimPlaceholder');

    const noticeEl = document.getElementById('fimTierNotice');
    if (noticeEl) noticeEl.style.display = 'none';

    if (originalDishImage) {
        currentItemImageBase64 = originalDishImage;
        window.currentItemImageBase64 = currentItemImageBase64;
        currentItemImageMetadata = originalImageMetadata;
        window.currentItemImageMetadata = currentItemImageMetadata;
        if (preview) {
            preview.src = originalDishImage;
            preview.style.display = 'block';
            preview.style.opacity = '1';
        }
        if (placeholder) placeholder.style.display = 'none';
        const isAppr = originalImageMetadata && originalImageMetadata.approved;
        updateFimStatusPill(isAppr ? "Approved & Saved" : "AI Generated (Imagen 3)", isAppr ? "status-approved" : "status-ai");
        setFimActionDockVisible(true);
        showToast("Image restored to previous saved state.");
    } else {
        currentItemImageBase64 = "";
        window.currentItemImageBase64 = currentItemImageBase64;
        currentItemImageMetadata = null;
        window.currentItemImageMetadata = currentItemImageMetadata;
        if (preview) {
            preview.removeAttribute('src');
            preview.style.display = 'none';
        }
        if (placeholder) placeholder.style.display = 'flex';
        updateFimStatusPill("No Image", "status-none");
        setFimActionDockVisible(false);
        showToast("Image discarded.");
    }
}
window.discardFoodImage = discardFoodImage;

function closeAddMenuItemModal() {
    const modal = document.getElementById('menuItemModal');
    if (modal) modal.style.display = 'none';
    editingMenuItemId = null;
    isGeneratingFoodImage = false;
}
window.closeAddMenuItemModal = closeAddMenuItemModal;

function openAddMenuItemModal() {
    if (!_requireMenuPermission('add menu items', () => openAddMenuItemModal())) return;
    editingMenuItemId = null; 
    renderCategoryDropdown();
    document.getElementById('menuFormTitle').innerText = "Add New Menu Item"; 
    document.getElementById('addMenuBtn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Save Item</span>';
    const nameEl = document.getElementById('newItemName');
    if (nameEl) nameEl.value = ''; 
    const priceEl = document.getElementById('newItemPrice');
    if (priceEl) priceEl.value = ''; 
    const gstEl = document.getElementById('newItemGst');
    if (gstEl) gstEl.value = '0';
    const trackStockEl = document.getElementById('newItemTrackStock');
    if (trackStockEl) trackStockEl.checked = false; 
    const stockEl = document.getElementById('newItemStock');
    if (stockEl) {
        stockEl.style.display = 'none'; 
        stockEl.value = '';
    }

    // Reset Food Image Manager state to clean initial state
    currentItemImageBase64 = ""; 
    window.currentItemImageBase64 = currentItemImageBase64;
    currentItemImageMetadata = null;
    window.currentItemImageMetadata = currentItemImageMetadata;
    originalDishImage = "";
    originalImageMetadata = null;
    isGeneratingFoodImage = false;

    const noticeEl = document.getElementById('fimTierNotice');
    if (noticeEl) noticeEl.style.display = 'none';

    const cuisineInput = document.getElementById('newItemCuisine');
    if (cuisineInput) cuisineInput.value = '';
    const servingStyleInput = document.getElementById('newItemServingStyle');
    if (servingStyleInput) servingStyleInput.value = '';

    const dietaryPills = document.querySelectorAll('.fim-dietary-pill');
    dietaryPills.forEach(pill => pill.classList.remove('active'));

    const preview = document.getElementById('newItemImagePreview');
    if (preview) {
        preview.removeAttribute('src');
        preview.style.display = "none";
    }
    const placeholder = document.getElementById('fimPlaceholder');
    if (placeholder) placeholder.style.display = "flex";
    const shimmer = document.getElementById('fimShimmer');
    if (shimmer) shimmer.style.display = "none";

    updateFimStatusPill("No Image", "status-none");
    setFimActionDockVisible(false);

    const genBtn = document.getElementById('btnGenerateAI');
    if (genBtn) {
        genBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg><span>Generate Food Image</span>`;
        genBtn.disabled = false;
    }
    document.getElementById('menuItemModal').style.display = 'flex'; 
    setTimeout(() => { document.getElementById('newItemName').focus(); }, 100);
}
window.openAddMenuItemModal = openAddMenuItemModal;

function editMenuItem(id) {
    if (!_requireMenuPermission('edit menu items', () => editMenuItem(id))) return;
    const item = (Array.isArray(menuItems) ? menuItems : []).find(i => String(i.id) === String(id));
    if(item) {
        renderCategoryDropdown();
        const nameEl = document.getElementById('newItemName');
        if (nameEl) nameEl.value = item.name || ''; 
        const catEl = document.getElementById('newItemCategory');
        if (catEl) catEl.value = item.category || '';
        const priceEl = document.getElementById('newItemPrice');
        if (priceEl) priceEl.value = item.price ?? ''; 
        const gstEl = document.getElementById('newItemGst');
        if (gstEl) gstEl.value = item.gstRate || 0;
        const trackStockEl = document.getElementById('newItemTrackStock');
        if (trackStockEl) trackStockEl.checked = item.trackStock || false; 
        const stockEl = document.getElementById('newItemStock');
        if (stockEl) {
            stockEl.style.display = item.trackStock ? 'block' : 'none'; 
            stockEl.value = item.stockQty || '';
        }

        // Context fields
        const cuisineInput = document.getElementById('newItemCuisine');
        if (cuisineInput) cuisineInput.value = item.cuisine || '';
        const servingStyleInput = document.getElementById('newItemServingStyle');
        if (servingStyleInput) servingStyleInput.value = item.servingStyle || '';

        const dietaryTags = Array.isArray(item.dietary) ? item.dietary : [];
        const dietaryPills = document.querySelectorAll('.fim-dietary-pill');
        dietaryPills.forEach(pill => {
            const tag = pill.getAttribute('data-diet') || pill.innerText.trim();
            if (dietaryTags.includes(tag)) {
                pill.classList.add('active');
            } else {
                pill.classList.remove('active');
            }
        });
        
        currentItemImageBase64 = item.image || "";
        window.currentItemImageBase64 = currentItemImageBase64;
        originalDishImage = item.image || "";
        currentItemImageMetadata = item.imageMetadata || null;
        window.currentItemImageMetadata = currentItemImageMetadata;
        originalImageMetadata = item.imageMetadata || null;
        isGeneratingFoodImage = false;

        const preview = document.getElementById('newItemImagePreview');
        const placeholder = document.getElementById('fimPlaceholder');
        const shimmer = document.getElementById('fimShimmer');
        if (shimmer) shimmer.style.display = 'none';

        if(currentItemImageBase64 && (currentItemImageBase64.startsWith('data:image') || currentItemImageBase64.startsWith('http') || currentItemImageBase64.startsWith('/'))) { 
            if (preview) {
                preview.src = currentItemImageBase64; 
                preview.style.display = "block"; 
                preview.style.opacity = "1";
            }
            if (placeholder) placeholder.style.display = "none";
            updateFimStatusPill("Approved & Saved", "status-approved");
            setFimActionDockVisible(true);
        } else { 
            if (preview) {
                preview.removeAttribute('src');
                preview.style.display = "none";
            }
            if (placeholder) placeholder.style.display = "flex";
            updateFimStatusPill("No Image", "status-none");
            setFimActionDockVisible(false);
        }
        
        const genBtn = document.getElementById('btnGenerateAI');
        if (genBtn) {
            genBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg><span>Next Photo</span>`;
            genBtn.disabled = false;
        }
        
        editingMenuItemId = id; 
        document.getElementById('menuFormTitle').innerText = "Edit Menu Item"; 
        document.getElementById('addMenuBtn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px; vertical-align: middle;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg><span>Update Item</span>'; 
        document.getElementById('menuItemModal').style.display = 'flex';
    }
}
window.editMenuItem = editMenuItem;

function addMenuItem(bypassRoleCheck = false) {
    if (!bypassRoleCheck && !canCurrentStaffManageMenu()) {
        _requireMenuPermission('save menu items', () => addMenuItem(true));
        return;
    }
    const name = document.getElementById('newItemName')?.value?.trim() || ''; 
    const rawPriceStr = document.getElementById('newItemPrice')?.value?.trim() || '';
    const price = rawPriceStr === '' ? NaN : Number(rawPriceStr);
    const category = document.getElementById('newItemCategory')?.value || ''; 
    const rawGst = parseFloat(document.getElementById('newItemGst')?.value);
    const gstRate = (Number.isFinite(rawGst) && rawGst >= 0) ? rawGst : 0; 
    const trackStock = Boolean(document.getElementById('newItemTrackStock')?.checked); 
    const rawStock = parseInt(document.getElementById('newItemStock')?.value, 10);
    const stockQty = (Number.isFinite(rawStock) && rawStock >= 0) ? rawStock : 0;
    const cuisine = document.getElementById('newItemCuisine')?.value.trim() || '';
    const servingStyle = document.getElementById('newItemServingStyle')?.value.trim() || '';
    const dietary = getSelectedDietaryTags();

    if (name && Number.isFinite(price) && price >= 0) { 
        let savedDishId = null;
        const previewEl = document.getElementById('newItemImagePreview');
        const rawPreviewAttr = previewEl && typeof previewEl.getAttribute === 'function' ? (previewEl.getAttribute('src') || '').trim() : '';
        const previewSrc = (previewEl && (!previewEl.style || previewEl.style.display !== 'none') && rawPreviewAttr && !rawPreviewAttr.includes('placeholder') && !rawPreviewAttr.startsWith('data:image/svg+xml')) ? (previewEl.src || rawPreviewAttr) : '';
        const dishPhoto = currentItemImageBase64 || previewSrc || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(name, category) : generateFallbackImage(name, category));

        const now = Date.now();
        const imgMeta = currentItemImageMetadata || {
            id: 'img_' + (editingMenuItemId || now),
            url: dishPhoto,
            source: dishPhoto.startsWith('/uploads/') ? (dishPhoto.includes('upload') ? 'upload' : 'gemini-imagen') : 'curated',
            createdAt: new Date().toISOString(),
            approved: true
        };

        if (editingMenuItemId) {
            let index = (Array.isArray(menuItems) ? menuItems : []).findIndex(i => String(i.id) === String(editingMenuItemId));
            if (index === -1) {
                index = (Array.isArray(menuItems) ? menuItems : []).findIndex(i => i.name && i.name.trim().toLowerCase() === name.toLowerCase());
            }
            if(index > -1) { 
                menuItems[index] = {
                    ...menuItems[index],
                    id: menuItems[index].id || editingMenuItemId,
                    name,
                    category,
                    price,
                    gstRate,
                    trackStock,
                    stockQty,
                    cuisine,
                    servingStyle,
                    dietary,
                    image: dishPhoto,
                    imageMetadata: imgMeta,
                    updatedAt: now,
                    is_active: true,
                    isDeleted: false,
                    isAvailable: true,
                    deletedAt: null
                }; 
                savedDishId = menuItems[index].id;
            } else {
                savedDishId = editingMenuItemId || now;
                menuItems.push({
                    id: savedDishId,
                    name,
                    category,
                    price,
                    gstRate,
                    trackStock,
                    stockQty,
                    cuisine,
                    servingStyle,
                    dietary,
                    image: dishPhoto,
                    imageMetadata: imgMeta,
                    updatedAt: now,
                    is_active: true,
                    isDeleted: false,
                    isAvailable: true,
                    deletedAt: null
                });
            }
            showToast("✅ Item updated!");
        } else { 
            // Deduplicate by case-insensitive name so accidental duplicate items are updated rather than duplicated
            const existingIndex = (Array.isArray(menuItems) ? menuItems : []).findIndex(i => i.name && i.name.trim().toLowerCase() === name.toLowerCase());
            if (existingIndex > -1) {
                menuItems[existingIndex] = {
                    ...menuItems[existingIndex],
                    category,
                    price,
                    gstRate,
                    trackStock,
                    stockQty,
                    cuisine,
                    servingStyle,
                    dietary,
                    image: dishPhoto,
                    imageMetadata: imgMeta,
                    updatedAt: now,
                    is_active: true,
                    isDeleted: false,
                    isAvailable: true,
                    deletedAt: null
                };
                savedDishId = menuItems[existingIndex].id;
                showToast("✅ Existing item updated!");
            } else {
                savedDishId = now;
                menuItems.push({
                    id: savedDishId,
                    name,
                    category,
                    price,
                    gstRate,
                    trackStock,
                    stockQty,
                    cuisine,
                    servingStyle,
                    dietary,
                    image: dishPhoto,
                    imageMetadata: imgMeta,
                    updatedAt: now,
                    is_active: true,
                    isDeleted: false,
                    isAvailable: true,
                    deletedAt: null
                }); 
                showToast("✅ Item added!"); 
            }
        }
        if (savedDishId && typeof removeDeletedMenuItemId === 'function') {
            removeDeletedMenuItemId(savedDishId);
        }
        if (editingMenuItemId && String(editingMenuItemId) !== String(savedDishId) && typeof removeDeletedMenuItemId === 'function') {
            removeDeletedMenuItemId(editingMenuItemId);
        }
        if (name && typeof removeDeletedMenuItemName === 'function') {
            removeDeletedMenuItemName(name);
        }
        if (typeof markMenuCustomized === 'function') {
            markMenuCustomized();
        } else if (typeof localStorage !== 'undefined') {
            localStorage.setItem('billnaw_menu_customized', 'true');
        }
        window.menuItems = menuItems;
        persistMenu(); 
        renderMenuUI(); 
        if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
        if (window.culinaryInventory) {
            if (typeof window.culinaryInventory.registerNewDishRecipe === 'function') {
                window.culinaryInventory.registerNewDishRecipe({ id: savedDishId, name, category, price });
            }
            if (typeof window.culinaryInventory.syncMenuItems === 'function') {
                window.culinaryInventory.syncMenuItems();
            }
        }
        closeAddMenuItemModal();
    } else { 
        showToast("⚠️ Valid item Name and non-negative Price required."); 
    }
}
window.addMenuItem = addMenuItem;

function deleteMenuItem(id, bypassRoleCheck = false) { 
    if (!bypassRoleCheck && !canCurrentStaffManageMenu()) {
        _requireMenuPermission('delete this menu item', () => deleteMenuItem(id, true));
        return;
    }
    if(confirm("Delete this item permanently?")) { 
        if (typeof recordDeletedMenuItemId === 'function') {
            recordDeletedMenuItemId(id);
        }
        // Soft-delete to preserve item integrity for open tables, active KOTs, and historical billing
        const targetItem = (Array.isArray(menuItems) ? menuItems : []).find(item => String(item.id) === String(id));
        if (targetItem) {
            targetItem.isDeleted = true;
            targetItem.isAvailable = false;
            targetItem.is_active = false;
            targetItem.deletedAt = new Date().toISOString();
            targetItem.updatedAt = Date.now();
            if (targetItem.name && typeof recordDeletedMenuItemName === 'function') {
                recordDeletedMenuItemName(targetItem.name);
            }
        }
        // Maintain referential integrity: retain item as soft-deleted if active table cart references it
        menuItems = (Array.isArray(menuItems) ? menuItems : []).filter(item => {
            if (String(item.id) === String(id)) {
                let isReferencedInOpenTables = false;
                if (typeof tablesInfo !== 'undefined' && tablesInfo) {
                    Object.values(tablesInfo).forEach(t => {
                        if (t && Array.isArray(t.items) && t.items.some(it => String(it.id) === String(id))) {
                            isReferencedInOpenTables = true;
                        }
                    });
                }
                return isReferencedInOpenTables;
            }
            return true;
        });
        if (typeof markMenuCustomized === 'function') {
            markMenuCustomized();
        } else if (typeof localStorage !== 'undefined') {
            localStorage.setItem('billnaw_menu_customized', 'true');
        }
        window.menuItems = menuItems;
        persistMenu(); 
        renderMenuUI(); 
        if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
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
    if (!canCurrentStaffManageMenu()) {
        _requireMenuPermission('import menu items', () => processAIMenu(event));
        return;
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
                const itemObj = { name: cleanName, price: price, image: (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(cleanName, isBeverage ? 'Beverages' : 'Snacks') : generateFallbackImage(cleanName)) };
                if (isBeverage) beverageItems.push(itemObj);
                else foodItems.push(itemObj);
            }
        });

        if (beverageItems.length > 0) categories.push({ name: "Beverages & Coffee", items: beverageItems });
        if (foodItems.length > 0) categories.push({ name: "Snacks & Mains", items: foodItems });
    }

    if (categories.length === 0) {
        return {
            success: false,
            isFallback: true,
            warning: "No items could be auto-detected from this document. Please ensure the menu photo is clear, or add items manually.",
            categories: []
        };
    }

    return {
        success: true,
        isFallback: true,
        warning: "Extracted via Smart Layout Parser. Review and customize before import.",
        categories: categories
    };
}

const MAX_AI_PDF_PAGES = 10;
const MAX_UPLOAD_DATAURL_CHARS = 3400000;
const MAX_CLIENT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PAGE_EXTRACTED_TEXT_CHARS = 25000;
const MAX_COMBINED_PDF_TEXT_CHARS = 100000;

let _aiScanGeneration = 0;
let _activeAiScanController = null;

function _setAiUploadButtonsDisabled(disabled) {
    ['aiMenuBtn', 'aiMenuCameraBtn', 'aiMenuPdfBtn', 'aiMenuExcelBtn', 'menuCatalogAutoDetectBtn'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = Boolean(disabled);
    });
}

function _resetAiScanUi(hideOverlay = true) {
    if (hideOverlay) {
        const scanOverlay = document.getElementById('aiScanningOverlay');
        if (scanOverlay) scanOverlay.style.display = 'none';
    }
    _setAiUploadButtonsDisabled(false);
    ['aiMenuFileInput', 'aiMenuCameraInput', 'aiMenuPdfInput', 'aiMenuUploader', 'aiMenuExcelInput'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function cancelAiMenuScan() {
    _aiScanGeneration++;
    if (_activeAiScanController) {
        try { _activeAiScanController.abort('USER_CANCELLED'); } catch (_) {}
        _activeAiScanController = null;
    }
    _resetAiScanUi(true);
}
window.cancelAiMenuScan = cancelAiMenuScan;

async function _loadPdfJsWithFallback() {
    if (window.pdfjsLib) return window.pdfjsLib;
    if (typeof loadLazyScript !== 'function') {
        throw new Error("PDF reader library failed to load.");
    }
    const cdnSources = [
        {
            lib: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
            worker: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
        },
        {
            lib: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
            worker: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
        }
    ];
    for (const cdn of cdnSources) {
        try {
            await loadLazyScript(cdn.lib);
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = cdn.worker;
                return window.pdfjsLib;
            }
        } catch (cdnErr) {
            // Remove failed <script> tag so loadLazyScript does not short-circuit subsequent retries
            if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
                document.querySelectorAll(`script[src="${cdn.lib}"]`).forEach(el => {
                    if (el && typeof el.remove === 'function') el.remove();
                });
            }
            console.warn("PDF.js CDN load failed, trying fallback:", cdn.lib, cdnErr?.message || cdnErr);
        }
    }
    throw new Error("PDF reader library failed to load.");
}

function _encodeCanvasForUpload(canvas, initialQuality = 0.82) {
    let working = canvas;
    const ownedTempCanvases = [];
    try {
        for (let pass = 0; pass < 3; pass++) {
            const qualities = pass === 0 ? [initialQuality, 0.68, 0.55] : [0.68, 0.55];
            for (const q of qualities) {
                const candidate = working.toDataURL('image/jpeg', q);
                if (candidate.length <= MAX_UPLOAD_DATAURL_CHARS) {
                    return candidate;
                }
            }
            if ((working.width || 0) <= 640 && (working.height || 0) <= 640) {
                break;
            }
            const nextCanvas = document.createElement('canvas');
            nextCanvas.width = Math.max(1, Math.round(working.width * 0.75));
            nextCanvas.height = Math.max(1, Math.round(working.height * 0.75));
            const nctx = nextCanvas.getContext('2d');
            if (!nctx) {
                nextCanvas.width = 0;
                nextCanvas.height = 0;
                break;
            }
            nctx.drawImage(working, 0, 0, nextCanvas.width, nextCanvas.height);
            ownedTempCanvases.push(nextCanvas);
            working = nextCanvas;
        }
        throw new Error("Menu image could not be compressed under upload size limit.");
    } finally {
        ownedTempCanvases.forEach(c => { c.width = 0; c.height = 0; });
        canvas.width = 0;
        canvas.height = 0;
    }
}

async function _extractPdfPages(file, onProgress = null, scanGen = _aiScanGeneration) {
    if (typeof file?.size === 'number' && file.size > MAX_CLIENT_FILE_BYTES) {
        throw new Error("PDF file exceeds 25MB limit. Please split or compress it first.");
    }
    const pdfLib = await _loadPdfJsWithFallback();
    const arrayBuffer = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onabort = () => reject(new Error("PDF reading aborted."));
            reader.onerror = () => reject(new Error("PDF reading failed."));
            reader.readAsArrayBuffer(file);
        });

    let pdf = null;
    try {
        pdf = await pdfLib.getDocument({
            data: new Uint8Array(arrayBuffer),
            isEvalSupported: false
        }).promise;
        const totalPages = pdf.numPages || 1;
        const pagesToScan = Math.min(totalPages, MAX_AI_PDF_PAGES);
        const pages = [];
        const textChunks = [];
        let combinedLen = 0;

        for (let pageNum = 1; pageNum <= pagesToScan; pageNum++) {
            if (scanGen !== _aiScanGeneration) {
                throw new Error("Scan cancelled.");
            }
            if (typeof onProgress === 'function') {
                onProgress(pageNum, pagesToScan, totalPages);
            }
            let page = null;
            const canvas = document.createElement('canvas');
            try {
                page = await pdf.getPage(pageNum);
                const baseViewport = page.getViewport({ scale: 1 });
                const maxSide = Math.max(baseViewport.width || 800, baseViewport.height || 800, 1);
                const safeScale = Math.min(1.5, 1400 / maxSide);
                const viewport = page.getViewport({ scale: safeScale });
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error("Canvas context unavailable for PDF rendering.");
                canvas.height = Math.round(viewport.height);
                canvas.width = Math.round(viewport.width);
                await page.render({ canvasContext: ctx, viewport }).promise;

                let textStr = '';
                try {
                    const textContent = await page.getTextContent();
                    textStr = textContent.items.map(i => i.str).join('\n').slice(0, MAX_PAGE_EXTRACTED_TEXT_CHARS);
                } catch (te) {
                    console.warn(`PDF page ${pageNum} text parse fallback:`, te);
                }
                if (textStr && combinedLen < MAX_COMBINED_PDF_TEXT_CHARS) {
                    const slice = textStr.slice(0, MAX_COMBINED_PDF_TEXT_CHARS - combinedLen);
                    textChunks.push(slice);
                    combinedLen += slice.length;
                }

                const dataUrl = _encodeCanvasForUpload(canvas, 0.8);
                pages.push({ pageNumber: pageNum, base64Data: dataUrl, mimeType: 'image/jpeg', extractedText: textStr });
            } finally {
                canvas.width = 0;
                canvas.height = 0;
                if (page && typeof page.cleanup === 'function') {
                    try { page.cleanup(); } catch (_) {}
                }
            }
        }

        return { pages, totalPages, scannedPages: pagesToScan, combinedText: textChunks.join('\n') };
    } finally {
        if (pdf && typeof pdf.destroy === 'function') {
            try { await pdf.destroy(); } catch (_) {}
        }
    }
}

async function _encodeImageFileForUpload(file) {
    if (typeof file?.size === 'number' && file.size > MAX_CLIENT_FILE_BYTES) {
        throw new Error("Image file exceeds 25MB limit. Please choose a smaller photo.");
    }
    return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const rawResult = e?.target?.result;
                if (typeof rawResult !== 'string') {
                    reject(new Error("Image reading produced invalid data."));
                    return;
                }
                const img = new Image();
                const cleanupImg = () => { img.onload = null; img.onerror = null; };
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    try {
                        const MAX_DIM = 1600;
                        let w = img.width || 1;
                        let h = img.height || 1;
                        if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
                        canvas.width = Math.round(w);
                        canvas.height = Math.round(h);
                        const ctx = canvas.getContext('2d');
                        if (!ctx) throw new Error("Canvas context unavailable for image processing.");
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        resolve({ dataUrl: _encodeCanvasForUpload(canvas, 0.82), mimeType: 'image/jpeg' });
                    } catch (encodeErr) {
                        reject(encodeErr);
                    } finally {
                        canvas.width = 0;
                        canvas.height = 0;
                        cleanupImg();
                    }
                };
                img.onerror = () => {
                    cleanupImg();
                    if (rawResult.startsWith('data:image') && rawResult.length <= MAX_UPLOAD_DATAURL_CHARS) {
                        resolve({ dataUrl: rawResult, mimeType: file.type || 'image/jpeg' });
                    } else {
                        reject(new Error("Image load failed."));
                    }
                };
                img.src = rawResult;
            } catch (loadErr) {
                reject(loadErr);
            }
        };
        reader.onabort = () => reject(new Error("File reading aborted."));
        reader.onerror = () => reject(new Error("File reading failed."));
        reader.readAsDataURL(file);
    });
}

function _buildAiScanContext() {
    const customKey = (typeof getCustomGeminiKey === 'function' ? getCustomGeminiKey() : (typeof localStorage !== 'undefined' ? (localStorage.getItem('gemini_api_key') || localStorage.getItem('billnaw_gemini_api_key')) : '')) || '';
    const activeShopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_store_code') : null) || null;
    const activeShopEmail = (typeof shopProfile !== 'undefined' && shopProfile.email) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_shop_email') : null) || '';
    return { customKey, activeShopId, activeShopEmail };
}

function _buildScanPayload(base64Data, mimeType, extractedText, ctx) {
    return {
        base64Data,
        mimeType,
        clientId: ctx?.activeShopId || null,
        shopId: ctx?.activeShopId || null,
        extractedText: String(extractedText || '').slice(0, MAX_COMBINED_PDF_TEXT_CHARS)
    };
}

function _appendNormalizedCategories(categories, targetItems, seenKeys = null) {
    if (!Array.isArray(categories)) return 0;
    let addedCount = 0;
    categories.forEach(cat => {
        if (!cat || typeof cat !== 'object' || !Array.isArray(cat.items)) return;
        const catName = String(cat.name || cat.category || "").trim() || "General";
        cat.items.forEach(item => {
            if (!item || typeof item !== 'object') return;
            const rawName = String(item.name || item.title || item.ItemName || "New Item").trim() || "New Item";
            const rawPrice = parseFloat(item.price !== undefined ? item.price : (item.Price !== undefined ? item.Price : 0)) || 0;
            const dedupeKey = `${catName.toLowerCase()}::${rawName.toLowerCase()}::${rawPrice}`;
            if (seenKeys) {
                if (seenKeys.has(dedupeKey)) return;
                seenKeys.add(dedupeKey);
            }
            const prompt = item.image_prompt || `${rawName} gourmet cafe food dish photography`;
            const sanitizedItemUrl = item.image ? _sanitizeMenuImgUrl(item.image) : '';
            const safeCustomUrl = sanitizedItemUrl && !/["'\r\n<>]/.test(sanitizedItemUrl) ? sanitizedItemUrl : '';
            const hasImg = Boolean(safeCustomUrl);
            const initialImg = hasImg ? safeCustomUrl : (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(rawName, catName) : generateFallbackImage(rawName, catName));

            let isVeg = null;
            if (typeof item.isVeg === 'boolean') isVeg = item.isVeg;
            else if (typeof item.is_veg === 'boolean') isVeg = item.is_veg;
            else if (typeof item.veg === 'boolean') isVeg = item.veg;

            targetItems.push({
                name: rawName,
                price: rawPrice,
                category: catName,
                image: initialImg,
                image_prompt: prompt,
                hasCustomImage: hasImg,
                isVeg: isVeg
            });
            addedCount++;
        });
    });
    return addedCount;
}

async function _requestAiScanEndpoint(payload, customKey, activeShopId, activeShopEmail, { timeoutMs = 60000 } = {}) {
    const requestHeaders = { 'Content-Type': 'application/json' };
    const reqBody = { ...payload };
    delete reqBody.apiKey;
    if (customKey) {
        requestHeaders['x-gemini-api-key'] = customKey;
    }
    if (activeShopId) {
        requestHeaders['x-shop-id'] = activeShopId;
        requestHeaders['x-store-code'] = activeShopId;
        requestHeaders['x-client-id'] = activeShopId;
        reqBody.shopId = activeShopId;
        reqBody.storeCode = activeShopId;
        reqBody.clientId = activeShopId;
    }
    if (activeShopEmail) {
        requestHeaders['x-shop-email'] = activeShopEmail;
        reqBody.shopEmail = activeShopEmail;
    }

    const scanController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (scanController) {
        _activeAiScanController = scanController;
    }
    let timedOut = false;
    const scanTimer = scanController ? setTimeout(() => {
        timedOut = true;
        scanController.abort('TIMEOUT');
    }, timeoutMs) : null;

    let serverRes = null;
    try {
        serverRes = await fetch('/api/ai/scan-menu', {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(reqBody),
            signal: scanController ? scanController.signal : undefined
        }).catch(() => null);

        const isAborted = Boolean(scanController && scanController.signal && scanController.signal.aborted);
        if (!isAborted && (!serverRes || serverRes.status === 404)) {
            serverRes = await fetch('/api/extract-menu', {
                method: 'POST',
                headers: requestHeaders,
                body: JSON.stringify(reqBody),
                signal: scanController ? scanController.signal : undefined
            }).catch(() => null);
        }
    } finally {
        if (scanTimer) clearTimeout(scanTimer);
        if (_activeAiScanController === scanController) {
            _activeAiScanController = null;
        }
    }

    const wasUserCancelled = Boolean(scanController && scanController.signal && scanController.signal.aborted && !timedOut);
    if (wasUserCancelled) {
        const cancelErr = new Error("Scan cancelled.");
        cancelErr.cancelled = true;
        throw cancelErr;
    }
    if (serverRes && serverRes.ok) {
        try {
            return { serverData: await serverRes.json(), httpDiagnosticWarning: null };
        } catch (_) {
            return { serverData: null, httpDiagnosticWarning: "AI server returned an unreadable response format." };
        }
    }
    if (serverRes && serverRes.status === 429) {
        const errData = await serverRes.json().catch(() => ({}));
        const quotaErr = new Error(errData.error || "Monthly scan quota of 15 scans reached for this shop.");
        quotaErr.status = 429;
        throw quotaErr;
    }
    if (serverRes && (serverRes.status === 401 || serverRes.status === 403)) {
        const errData = await serverRes.json().catch(() => ({}));
        const keyErr = new Error(errData.error || "Invalid or unauthorized Gemini API key. Please check your key in Settings.");
        keyErr.status = serverRes.status;
        throw keyErr;
    }
    if (serverRes && serverRes.status === 413) {
        return {
            serverData: null,
            httpDiagnosticWarning: "Menu file is too large for upload (HTTP 413). Please crop or upload a smaller image/PDF."
        };
    }
    if (timedOut || (serverRes && (serverRes.status === 502 || serverRes.status === 504))) {
        const codeLabel = timedOut ? 'client timeout' : `HTTP ${serverRes.status}`;
        return {
            serverData: null,
            httpDiagnosticWarning: `AI menu scan timed out on the server (${codeLabel}). Try scanning one page or a closer crop of the menu.`
        };
    }
    if (serverRes && serverRes.status >= 400) {
        const errJson = await serverRes.json().catch(() => ({}));
        const detail = errJson.error || errJson.warning || `HTTP ${serverRes.status}`;
        return {
            serverData: null,
            httpDiagnosticWarning: `AI server scan failed (${detail}).`
        };
    }
    return { serverData: null, httpDiagnosticWarning: null };
}

async function processAIMenu(event) {
    if (!canCurrentStaffManageMenu()) {
        _requireMenuPermission('import menu items', () => processAIMenu(event));
        return;
    }
    const file = (event && event.target && event.target.files && event.target.files[0]) ||
                 (event && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    if (!file) return;

    const scanGen = ++_aiScanGeneration;
    if (_activeAiScanController) {
        try { _activeAiScanController.abort('SUPERSEDED'); } catch (_) {}
        _activeAiScanController = null;
    }
    _setAiUploadButtonsDisabled(true);

    const scanOverlay = document.getElementById('aiScanningOverlay');
    const scanText = document.getElementById('aiScanningOverlayText');
    if (scanOverlay) {
        scanOverlay.style.display = 'flex';
        if (scanText) scanText.innerText = "Uploading & analyzing menu document...";
    }

    try {
        const ctx = _buildAiScanContext();
        if (file.type === "application/pdf") {
            const pdfResult = await _extractPdfPages(file, (pageNum, scannedPages) => {
                if (scanText && scanGen === _aiScanGeneration) {
                    scanText.innerText = scannedPages > 1
                        ? `Preparing PDF page ${pageNum} of ${scannedPages}...`
                        : "Preparing PDF menu page...";
                }
            }, scanGen);
            if (scanGen !== _aiScanGeneration) return;

            if (pdfResult.pages.length <= 1) {
                const firstPage = pdfResult.pages[0] || { base64Data: '', mimeType: 'image/jpeg', extractedText: '' };
                const payload = _buildScanPayload(firstPage.base64Data, firstPage.mimeType, firstPage.extractedText, ctx);
                pendingUploadPayload = payload;
                lastUploadedMenuPreviewUrl = (firstPage.base64Data && firstPage.base64Data.startsWith('data:image')) ? firstPage.base64Data : null;
                if (scanText) {
                    scanText.innerText = ctx.customKey ? "Scanning menu using Dedicated Gemini API Key..." : "Uploading & analyzing menu with Gemini AI Vision...";
                }
                await executeMenuExtraction(payload, false, scanGen);
                return;
            }
            await executeMultiPagePdfExtraction(pdfResult, { customKey: ctx.customKey, activeShopId: ctx.activeShopId, scanText, scanGen });
            return;
        }

        const encodedImage = await _encodeImageFileForUpload(file);
        if (scanGen !== _aiScanGeneration) return;

        const payload = _buildScanPayload(encodedImage.dataUrl, encodedImage.mimeType, '', ctx);
        pendingUploadPayload = payload;
        lastUploadedMenuPreviewUrl = (encodedImage.dataUrl && encodedImage.dataUrl.startsWith('data:image')) ? encodedImage.dataUrl : null;
        if (scanText) {
            scanText.innerText = ctx.customKey ? "Scanning menu using Dedicated Gemini API Key..." : "Uploading & analyzing menu with Gemini AI Vision...";
        }
        await executeMenuExtraction(payload, false, scanGen);
    } catch (error) {
        if (scanGen === _aiScanGeneration && !error?.cancelled) {
            console.warn("AI Menu Processing:", error.message);
            showToast((error.status === 401 || error.status === 403 ? "❌ " : "⚠️ ") + error.message, error.status ? "error" : undefined);
        }
    } finally {
        if (scanGen === _aiScanGeneration) {
            _resetAiScanUi(true);
        }
    }
}
window.processAIMenu = processAIMenu;

async function executeMultiPagePdfExtraction(pdfResult, { customKey, activeShopId, scanText, scanGen } = {}) {
    const activeGen = scanGen !== undefined ? scanGen : ++_aiScanGeneration;
    const ctx = _buildAiScanContext();
    const resolvedKey = customKey !== undefined ? customKey : ctx.customKey;
    const resolvedShopId = activeShopId !== undefined ? activeShopId : ctx.activeShopId;

    pendingAiItems = [];
    pendingAiFallbackNotice = null;
    lastUploadedMenuPreviewUrl = pdfResult.pages[0]?.base64Data || null;

    const seenKeys = new Set();
    let lastQuota = null;
    let lastDiagnosticWarning = null;
    let firstSuccessfulPreviewUrl = null;
    let pagesWithAiSuccess = 0;

    if (pdfResult.totalPages > pdfResult.scannedPages) {
        showToast(`PDF has ${pdfResult.totalPages} pages — scanning first ${pdfResult.scannedPages} pages.`);
    }

    for (const page of pdfResult.pages) {
        if (activeGen !== _aiScanGeneration) return;
        if (scanText) {
            scanText.innerText = `Scanning PDF page ${page.pageNumber} of ${pdfResult.scannedPages}...`;
        }
        const pagePayload = _buildScanPayload(page.base64Data, page.mimeType, page.extractedText, { activeShopId: resolvedShopId });
        pendingUploadPayload = pagePayload;

        const scanOutcome = await _requestAiScanEndpoint(pagePayload, resolvedKey, resolvedShopId, ctx.activeShopEmail);
        if (activeGen !== _aiScanGeneration) return;

        const serverData = scanOutcome.serverData;
        if (scanOutcome.httpDiagnosticWarning && !lastDiagnosticWarning) {
            lastDiagnosticWarning = scanOutcome.httpDiagnosticWarning;
        }
        if (serverData && serverData.warning) {
            lastDiagnosticWarning = serverData.warning;
        }
        if (serverData && serverData.quota) {
            lastQuota = serverData.quota;
        }

        const isStarterTemplate = Boolean(serverData && serverData.fallbackSource === 'starter_template');
        let pageAddedCount = 0;
        if (serverData && Array.isArray(serverData.categories) && serverData.categories.length > 0 && !isStarterTemplate) {
            pageAddedCount = _appendNormalizedCategories(serverData.categories, pendingAiItems, seenKeys);
            if (pageAddedCount > 0 && !firstSuccessfulPreviewUrl && page.base64Data) {
                firstSuccessfulPreviewUrl = page.base64Data;
            }
            if (!serverData.isFallback) pagesWithAiSuccess++;
        } else if (page.extractedText) {
            const localPage = parseLocalMenuFallback(pagePayload);
            if (localPage.categories && localPage.categories.length > 0) {
                _appendNormalizedCategories(localPage.categories, pendingAiItems, seenKeys);
            }
        }

        const fatalServerAiCode = serverData && ['BILLING_DEPLETED', 'INVALID_API_KEY', 'GEMINI_RATE_LIMIT', 'VISION_FAILED'].includes(serverData.aiErrorCode);
        if (fatalServerAiCode || scanOutcome.httpDiagnosticWarning) {
            break;
        }
    }

    if (activeGen !== _aiScanGeneration) return;
    if (firstSuccessfulPreviewUrl) {
        lastUploadedMenuPreviewUrl = firstSuccessfulPreviewUrl;
    }

    if (pendingAiItems.length === 0 && pdfResult.combinedText) {
        const localAll = parseLocalMenuFallback({ extractedText: pdfResult.combinedText });
        if (localAll.categories && localAll.categories.length > 0) {
            _appendNormalizedCategories(localAll.categories, pendingAiItems, seenKeys);
            pendingAiFallbackNotice = lastDiagnosticWarning || localAll.warning;
        }
    } else if (lastDiagnosticWarning && pagesWithAiSuccess === 0) {
        pendingAiFallbackNotice = lastDiagnosticWarning;
    }

    _resetAiScanUi(true);
    if (pendingAiItems.length > 0) {
        const quotaNote = lastQuota ? ` (${lastQuota.remaining}/${lastQuota.limit} scans left)` : '';
        showToast(`🤖 Scanned ${pdfResult.scannedPages} PDF pages: ${pendingAiItems.length} items ready${quotaNote}`);
    } else if (lastDiagnosticWarning) {
        pendingAiFallbackNotice = lastDiagnosticWarning;
        showToast("⚠️ " + lastDiagnosticWarning, "error");
    } else {
        showToast("ℹ️ No clear dishes detected in PDF pages. Try uploading a sharper menu PDF or add items manually.");
    }

    renderAiPreviewModal();
    const prevModal = document.getElementById('aiPreviewModal');
    if (prevModal) prevModal.style.display = 'flex';
    if (typeof refreshAiMenuQuotaPill === 'function') {
        refreshAiMenuQuotaPill();
    }
}

async function executeMenuExtraction(payload, isExplicitFallback = false, scanGen = undefined) {
    if (!payload) return;
    const activeGen = scanGen !== undefined ? scanGen : ++_aiScanGeneration;
    _setAiUploadButtonsDisabled(true);

    const ctx = _buildAiScanContext();
    const customKey = ctx.customKey || payload.apiKey || '';
    const activeShopId = payload.shopId || ctx.activeShopId || null;
    const activeShopEmail = ctx.activeShopEmail || '';
    if (payload.base64Data && !lastUploadedMenuPreviewUrl) {
        lastUploadedMenuPreviewUrl = (payload.base64Data.startsWith('data:image')) ? payload.base64Data : null;
    }

    if (isExplicitFallback) {
        showToast("📄 Parsing menu layout with Smart Parser...");
    } else if (customKey) {
        showToast("🤖 Analyzing menu with Dedicated Gemini Key...");
    } else {
        showToast("🤖 Analyzing menu with Gemini AI...");
    }

    try {
        let serverData = null;
        let httpDiagnosticWarning = null;
        if (!isExplicitFallback) {
            try {
                const outcome = await _requestAiScanEndpoint(payload, customKey, activeShopId, activeShopEmail);
                if (activeGen !== _aiScanGeneration) return;
                serverData = outcome.serverData;
                httpDiagnosticWarning = outcome.httpDiagnosticWarning;
            } catch (fetchErr) {
                if (fetchErr?.cancelled || activeGen !== _aiScanGeneration) return;
                if (fetchErr.status === 401 || fetchErr.status === 403 || fetchErr.status === 429) {
                    throw fetchErr;
                }
                console.warn("Server connection failed or offline, switching to smart layout parser:", fetchErr);
            }
        }

        const serverDiagnosticWarning = (serverData && serverData.warning) || httpDiagnosticWarning || null;
        const serverAiErrorCode = (serverData && serverData.aiErrorCode) || (httpDiagnosticWarning ? 'SERVER_GATEWAY_ERROR' : null);
        if (!serverData || !serverData.categories || serverData.categories.length === 0) {
            const localFallback = parseLocalMenuFallback(payload);
            serverData = {
                ...localFallback,
                warning: serverDiagnosticWarning || localFallback.warning,
                aiErrorCode: serverAiErrorCode || null
            };
        }

        if (serverData.isFallback) {
            const fallbackMsg = serverData.warning || "Menu extracted using smart layout parser. Review items before import.";
            const isErr = ['BILLING_DEPLETED', 'INVALID_API_KEY', 'GEMINI_RATE_LIMIT', 'SERVER_GATEWAY_ERROR', 'VISION_FAILED'].includes(serverData.aiErrorCode);
            showToast((isErr ? '⚠️ ' : 'ℹ️ ') + fallbackMsg, isErr ? 'error' : 'info');
        } else if (serverData.quota) {
            showToast(`🤖 AI Scanned! Quota remaining this month: ${serverData.quota.remaining}/${serverData.quota.limit}`);
        } else if (customKey) {
            showToast("✨ Menu digitized successfully using Dedicated Gemini Key!");
        }

        pendingAiItems = [];
        pendingAiFallbackNotice = serverData.isFallback ? (serverData.warning || "Menu digitized using Smart Layout Parser.") : null;

        const isStarterTemplate = Boolean(serverData.isFallback && serverData.fallbackSource === 'starter_template');
        if (!isStarterTemplate && serverData.categories && Array.isArray(serverData.categories)) {
            _appendNormalizedCategories(serverData.categories, pendingAiItems, new Set());
        }

        const scanOverlay = document.getElementById('aiScanningOverlay');
        if (scanOverlay) scanOverlay.style.display = 'none';

        if (pendingAiItems.length === 0) {
            if (!serverDiagnosticWarning) {
                showToast("ℹ️ No clear dishes detected. Please upload a high resolution photo or add items manually.");
            }
            if (serverAiErrorCode || serverDiagnosticWarning) {
                renderAiPreviewModal();
                const prevModal = document.getElementById('aiPreviewModal');
                if (prevModal) prevModal.style.display = 'flex';
            }
            return;
        }

        renderAiPreviewModal();
        const prevModal = document.getElementById('aiPreviewModal');
        if (prevModal) prevModal.style.display = 'flex';
    } catch (error) {
        if (activeGen === _aiScanGeneration && !error?.cancelled) {
            console.warn("Execute Menu Extraction Error:", error.message);
            showToast((error.status === 401 || error.status === 403 ? "❌ " : "⚠️ ") + error.message, error.status ? "error" : undefined);
        }
    } finally {
        if (activeGen === _aiScanGeneration) {
            _resetAiScanUi(true);
            if (typeof refreshAiMenuQuotaPill === 'function') {
                refreshAiMenuQuotaPill();
            }
        }
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

    let noticeHtml = '';
    if (pendingAiFallbackNotice) {
        const isError = /could not be|failed|invalid|depleted|402|429|unauthorized|rate.?limit/i.test(pendingAiFallbackNotice);
        const bg = isError ? 'rgba(220,38,38,0.08)' : 'rgba(20,56,50,0.06)';
        const border = isError ? '#DC2626' : 'var(--primary)';
        const textCol = isError ? '#991B1B' : 'var(--primary)';
        noticeHtml = `<div style="background: ${bg}; border-left: 4px solid ${border}; padding: 10px 12px; border-radius: 8px; font-size: 12px; margin-bottom: 10px; color: ${textCol}; line-height: 1.45; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <div style="display: flex; align-items: flex-start; gap: 8px;">
                <svg width="16" height="16" style="flex-shrink:0; margin-top:2px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                <span>${escapeHtml(pendingAiFallbackNotice)}</span>
            </div>
            <button type="button" onclick="closeAiPreviewModal(); openClientQuotaModal();" style="background: #FFFFFF; border: 1px solid ${border}; color: ${textCol}; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; transition: opacity 0.15s;" title="Configure Gemini AI Key">Configure AI Key</button>
        </div>`;
    }

    if (pendingAiItems.length === 0) {
        container.innerHTML = `
            ${noticeHtml}
            <div style="text-align: center; padding: 24px 20px; color: var(--text-muted);">
                <p style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">No items detected yet.</p>
                <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                    <button type="button" class="btn btn-primary" style="padding: 8px 16px; font-size: 12px;" onclick="closeAiPreviewModal(); openClientQuotaModal();">Configure Dedicated Gemini Key</button>
                    <button type="button" class="btn btn-outline" style="padding: 8px 16px; font-size: 12px;" onclick="addManualPendingAiItem()">Add Item Manually</button>
                </div>
            </div>
        `;
        return;
    }

    let html = noticeHtml;

    pendingAiItems.forEach((item, index) => {
        const safeName = _menuEsc(item.name || '');
        const safeCat = _menuEsc(item.category || '');
        const parsedPreviewPrice = Number(item.price);
        const safePrice = (Number.isFinite(parsedPreviewPrice) && parsedPreviewPrice >= 0) ? parsedPreviewPrice : 0;
        const rawImg = item.image || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(item.name || 'Item', item.category) : generateFallbackImage(item.name || 'Item', item.category));
        const imgDisplay = _sanitizeMenuImgUrl(rawImg) || generateFallbackImage(item.name || 'Item', item.category);

        html += `
        <div class="ai-review-item" id="ai-item-row-${index}">
            <div class="ai-item-thumb" onclick="triggerAiItemImageUpload(${index})" title="Click to upload or replace dish photo">
                <img id="ai-item-img-${index}" src="${_menuEsc(imgDisplay)}" alt="${safeName}" loading="lazy" decoding="async" data-item-name="${safeName}" data-item-cat="${safeCat}" onerror="this.onerror=null; this.src=generateFallbackImage(this.dataset.itemName, this.dataset.itemCat);">
                <div class="ai-thumb-badge" title="Upload dish photo"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg></div>
            </div>

            <div class="ai-item-info">
                <label>Item Name</label>
                <input type="text" value="${safeName}" oninput="updatePendingItemField(${index}, 'name', this.value)" placeholder="Dish or Beverage Name" style="width: 100%; padding: 7px 9px; border-radius: 8px; border: 1px solid var(--border); font-size: 12px; font-weight: 600; color: var(--text-dark); background: #fff;">
                <div style="display: flex; gap: 8px; align-items: center; margin-top: 2px; flex-wrap: wrap;">
                    <button type="button" onclick="triggerAiItemImageUpload(${index})" style="background: none; border: none; font-size: 11px; color: var(--milk-choc); cursor: pointer; padding: 0; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Upload Photo</button>
                    <span style="color: var(--border); font-size: 10px;">•</span>
                    <button type="button" onclick="generateAiItemPhoto(${index})" id="ai-gen-btn-${index}" style="background: none; border: none; font-size: 11px; color: var(--success); cursor: pointer; padding: 0; text-decoration: underline; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg>${item.hasCustomImage || item._varIndex ? 'Next Photo' : 'AI Visual'}</button>
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
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3Z"></path></svg> Generating...`;
    }
    
    item._varIndex = (item._varIndex !== undefined) ? (item._varIndex + 1) : 1;
    const totalVars = typeof getDishVariationCount === 'function' ? getDishVariationCount(item.name, item.category) : 4;
    const varNum = (item._varIndex % totalVars) + 1;

    const instantPhoto = typeof getGourmetFoodImage === 'function'
        ? getGourmetFoodImage(item.name || 'Item', item.category || '', item._varIndex)
        : (typeof generateFallbackImage === 'function' ? generateFallbackImage(item.name || 'Item', item.category || '', item._varIndex) : '');
    
    if (instantPhoto) {
        item.image = instantPhoto;
        item.hasCustomImage = true;
        const imgEl = document.getElementById(`ai-item-img-${index}`);
        if (imgEl) {
            imgEl.src = instantPhoto;
        }
    }

    try {
        const prompt = item.image_prompt || `${item.name} gourmet cafe food dish photography variation ${varNum}`;
        const base64 = await fetchImageAsBase64(prompt, item.name || 'item', item._varIndex, item.category || '');
        if (base64) {
            item.image = base64;
            item.hasCustomImage = true;
        }
        renderAiPreviewModal();
        showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${item.name || 'item'}`);
    } catch (err) {
        console.warn("AI generation note:", err);
        renderAiPreviewModal();
        showToast(`📸 Variation ${varNum} of ${totalVars} selected for ${item.name || 'item'}`);
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
        image: (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage("New Item") : generateFallbackImage("New Item")),
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

async function confirmAiImport(bypassRoleCheck = false) {
    if (!bypassRoleCheck && !canCurrentStaffManageMenu()) {
        _requireMenuPermission('import AI menu items', () => confirmAiImport(true));
        return;
    }
    const btn = document.getElementById('btnConfirmAiImport') || document.querySelector('#aiPreviewModal .btn-success');
    try {
        if (btn) { btn.disabled = true; btn.innerText = "Importing Items..."; }
        if (!pendingAiItems || pendingAiItems.length === 0) {
            throw new Error("No items in review to import.");
        }

        let itemsAdded = 0;
        let itemsUpdated = 0;
        let newCategoriesAdded = 0;
        const { defaultRate } = getStoreGstConfig();

        // If the menu currently only contains the pristine default demo items,
        // clear them so the shop owner's real menu replaces the template baseline.
        if (typeof isDefaultTemplateMenu === 'function' && isDefaultTemplateMenu(menuItems)) {
            menuItems = [];
            window.menuItems = menuItems;
        }

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

            const parsedRate = parseFloat(item.price);
            const itemRate = (Number.isFinite(parsedRate) && parsedRate >= 0) ? parsedRate : 0;
            const finalImage = item.image || (typeof getGourmetFoodImage === 'function' ? getGourmetFoodImage(rawName, catName) : generateFallbackImage(rawName, catName));

            // Intelligent Deduplication & Upsert: check if item with same name exists (case-insensitive)
            const existingItemIndex = menuItems.findIndex(m => m.name && m.name.trim().toLowerCase() === rawName.toLowerCase());
            let importedId = null;

            if (existingItemIndex >= 0) {
                const existing = menuItems[existingItemIndex];
                existing.price = itemRate;
                existing.category = catName;
                if (item.image) existing.image = item.image;
                if (item.gstRate !== undefined) existing.gstRate = Number(item.gstRate);
                existing.updatedAt = Date.now();
                existing.is_active = true;
                existing.isDeleted = false;
                existing.isAvailable = true;
                existing.deletedAt = null;
                importedId = existing.id;
                itemsUpdated++;
            } else {
                const newItem = {
                    id: Date.now() + (itemIndex * 100) + Math.floor(Math.random() * 1000),
                    name: rawName,
                    category: catName,
                    price: itemRate,
                    gstRate: defaultRate,
                    trackStock: false,
                    stockQty: 0,
                    image: finalImage,
                    updatedAt: Date.now(),
                    is_active: true,
                    isDeleted: false,
                    isAvailable: true,
                    deletedAt: null
                };
                menuItems.push(newItem);
                importedId = newItem.id;
                itemsAdded++;
            }
            if (importedId && typeof removeDeletedMenuItemId === 'function') {
                removeDeletedMenuItemId(importedId);
            }
            if (typeof removeDeletedMenuItemName === 'function') {
                removeDeletedMenuItemName(rawName);
            }
        });

        if (itemsAdded === 0 && itemsUpdated === 0) {
            throw new Error("Please specify at least one valid item name.");
        }

        if (typeof markMenuCustomized === 'function') {
            markMenuCustomized();
        } else if (typeof localStorage !== 'undefined') {
            localStorage.setItem('billnaw_menu_customized', 'true');
        }
        window.menuItems = menuItems;
        persistCategories();
        persistMenu();
        renderCategoryDropdown();
        renderCategoryFilters();
        renderCategoryListUI();
        renderMenuCatalogUI();
        renderMenuUI();
        if (window.culinaryInventory && typeof window.culinaryInventory.syncMenuItems === 'function') {
            window.culinaryInventory.syncMenuItems();
        }

        closeAiPreviewModal();
        const toastMsg = itemsUpdated > 0
            ? `Successfully imported ${itemsAdded} new items & updated ${itemsUpdated} existing items!`
            : `Successfully imported ${itemsAdded} items to menu!`;
        showToast(toastMsg, "success");
    } catch (error) {
        console.error(error);
        showToast("Import failed: " + error.message, "error");
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Confirm & Import to Menu"; }
    }
}
window.confirmAiImport = confirmAiImport;

function handleAiIngestCardClick(event) {
    if (event && event.target && event.target.closest('button')) return;
    if (typeof window !== 'undefined' && window.innerWidth <= 640) {
        const card = document.getElementById('aiIngestCollapsibleCard');
        if (card) {
            card.classList.toggle('is-expanded');
            return;
        }
    }
    if (typeof openUploadMenuChoiceModal === 'function') {
        openUploadMenuChoiceModal();
    }
}
window.handleAiIngestCardClick = handleAiIngestCardClick;
