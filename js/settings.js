// ============================================================
// ⚙️ JS/SETTINGS.JS - Shop Profile, Backup/Restore, Settings & Quota
// ============================================================

const _settingsEsc = (str) => (typeof escapeHtml === 'function')
    ? escapeHtml(str)
    : String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

function _isValidStoreImageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;
    return /^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif);base64,|\/uploads\/|\.\/|assets\/)/i.test(raw);
}

function _getNormalizedCurrentRole() {
    const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
    if (!active || !active.role) return null;
    return (typeof normalizeRole === 'function') ? normalizeRole(active.role) : String(active.role).trim();
}

function _requireAdminAccess(actionLabel, modalName = 'settings') {
    if (checkFloorServerModalBlock(modalName)) return false;
    const normRole = _getNormalizedCurrentRole();
    if (normRole !== 'Admin') {
        if (typeof showToast === 'function') showToast(`Permission denied: Only Store Admin can ${actionLabel}.`, 'error');
        return false;
    }
    return true;
}

function _sanitizeStaticDbPlaceholders() {
    try {
        if (typeof document === 'undefined') return;
        const dbEl = document.getElementById('settingsFirestoreDbDisplay');
        if (dbEl && dbEl.innerText && dbEl.innerText.includes('ai-studio-billnawcafepos')) {
            dbEl.innerText = 'Billnaw Cloud (Encrypted)';
        }
        const switchModal = document.getElementById('switchStoreModal');
        if (switchModal) {
            switchModal.querySelectorAll('strong, code, span').forEach(el => {
                if (el.innerText && el.innerText.includes('ai-studio-billnawcafepos')) {
                    el.innerText = 'Billnaw Cloud (Encrypted)';
                }
            });
        }
    } catch (e) {}
}

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', _sanitizeStaticDbPlaceholders);
}

function updateProfileVisuals() {
    let currentName = (shopProfile && shopProfile.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') 
        ? shopProfile.name 
        : null;

    if (!currentName) {
        try {
            const sessRaw = localStorage.getItem('billnaw_shop_session');
            if (sessRaw) {
                const s = JSON.parse(sessRaw);
                if (s?.shop?.name && s.shop.name !== 'billnaw' && s.shop.name !== 'My Cafe') {
                    currentName = s.shop.name;
                    if (shopProfile) shopProfile.name = currentName;
                } else if (s?.shop?.profile?.name && s.shop.profile.name !== 'billnaw' && s.shop.profile.name !== 'My Cafe') {
                    currentName = s.shop.profile.name;
                    if (shopProfile) shopProfile.name = currentName;
                }
            }
        } catch(e) {}
    }
    if (!currentName) {
        const saved = localStorage.getItem('billnaw_shop_name');
        if (saved && saved !== 'billnaw' && saved !== 'My Cafe') {
            currentName = saved;
            if (shopProfile) shopProfile.name = currentName;
        }
    }
    if (!currentName) {
        try {
            const profRaw = localStorage.getItem('billnaw_store_profile');
            if (profRaw) {
                const p = JSON.parse(profRaw);
                if (p?.name && p.name !== 'billnaw' && p.name !== 'My Cafe') {
                    currentName = p.name;
                    if (shopProfile) shopProfile.name = currentName;
                }
            }
        } catch(e) {}
    }
    if (!currentName) {
        currentName = (shopProfile && shopProfile.name) || "billnaw";
    }

    if (!shopProfile.logo) {
        try {
            const savedLogo = localStorage.getItem('billnaw_shop_logo');
            if (savedLogo) shopProfile.logo = savedLogo;
            else {
                const sessRaw = localStorage.getItem('billnaw_shop_session');
                if (sessRaw) {
                    const s = JSON.parse(sessRaw);
                    if (s?.shop?.logo) shopProfile.logo = s.shop.logo;
                    else if (s?.shop?.profile?.logo) shopProfile.logo = s.shop.profile.logo;
                }
            }
        } catch(e) {}
    }

    const isGstActive = shopProfile.gstMode !== 'none';
    const docTitle = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE';
    
    const topShopName = document.getElementById('topbarShopName');
    if (topShopName) topShopName.innerText = currentName;

    const displayShopName = document.getElementById('displayShopName');
    if (displayShopName) displayShopName.innerText = currentName;

    const slideMenuStoreName = document.getElementById('slideMenuStoreName');
    if (slideMenuStoreName) slideMenuStoreName.innerText = currentName;

    const loginShopName = document.getElementById('loginShopNameDisplay');
    if (loginShopName) loginShopName.innerText = currentName;

    const invShopName = document.getElementById('invModalShopName');
    if (invShopName) invShopName.innerText = currentName;
    
    const printShopName = document.getElementById('printShopName');
    if (printShopName) printShopName.innerText = currentName;

    const waPreviewShopName = document.getElementById('waPreviewShopName');
    if (waPreviewShopName) waPreviewShopName.innerText = currentName;

    const waPreviewStoreName = document.getElementById('waPreviewStoreName');
    if (waPreviewStoreName) waPreviewStoreName.innerText = currentName;

    // Document Statutory Titles
    const printTitle = document.getElementById('printInvoiceTitle');
    if (printTitle) printTitle.innerText = docTitle;

    const invDocBadge = document.getElementById('invModalDocTypeBadge');
    if (invDocBadge) invDocBadge.innerText = docTitle;

    const invTitle = document.getElementById('invModalTitle');
    if (invTitle) invTitle.innerText = isGstActive ? 'Tax Invoice' : 'Retail Invoice';
    
    // Store Address
    const printAddress = document.getElementById('printAddress');
    if (printAddress) printAddress.innerText = shopProfile.address || "";

    const printShopAddress = document.getElementById('printShopAddress');
    if (printShopAddress) {
        printShopAddress.innerText = shopProfile.address || "";
        printShopAddress.style.display = shopProfile.address ? 'block' : 'none';
    }

    const invShopAddress = document.getElementById('invModalShopAddress');
    if (invShopAddress) {
        invShopAddress.innerText = shopProfile.address || "";
        invShopAddress.style.display = shopProfile.address ? 'block' : 'none';
    }

    // Store Phone
    const printShopPhone = document.getElementById('printShopPhone');
    if (printShopPhone) {
        if (shopProfile.phone) {
            printShopPhone.style.display = 'block';
            printShopPhone.innerText = `Tel: ${shopProfile.phone}`;
        } else {
            printShopPhone.style.display = 'none';
        }
    }

    const invShopPhone = document.getElementById('invModalShopPhone');
    if (invShopPhone) {
        if (shopProfile.phone) {
            invShopPhone.style.display = 'block';
            invShopPhone.innerText = `Tel: ${shopProfile.phone}`;
        } else {
            invShopPhone.style.display = 'none';
        }
    }
    
    // FSSAI License
    const printFssai = document.getElementById('printFssai');
    if (printFssai) {
        if (shopProfile.fssai) {
            printFssai.style.display = 'block';
            printFssai.innerText = `FSSAI Lic. No.: ${shopProfile.fssai}`;
        } else {
            printFssai.style.display = 'none';
        }
    }

    const invFssai = document.getElementById('invModalShopFssai');
    if (invFssai) {
        if (shopProfile.fssai) {
            invFssai.style.display = 'inline-block';
            invFssai.innerText = `FSSAI: ${shopProfile.fssai}`;
        } else {
            invFssai.style.display = 'none';
        }
    }
    
    // GSTIN (Suppressed when GST mode is none or blank)
    const printGstin = document.getElementById('printGstin');
    if (printGstin) {
        if (isGstActive && shopProfile.gstin) {
            printGstin.style.display = 'block';
            printGstin.innerText = `GSTIN: ${shopProfile.gstin}`;
        } else {
            printGstin.style.display = 'none';
        }
    }

    const invGstin = document.getElementById('invModalShopGstin');
    if (invGstin) {
        if (isGstActive && shopProfile.gstin) {
            invGstin.style.display = 'inline-block';
            invGstin.innerText = `GSTIN: ${shopProfile.gstin}`;
        } else {
            invGstin.style.display = 'none';
        }
    }
    
    const sidebarLogo = document.getElementById('sidebarLogo');
    const printLogo = document.getElementById('printLogo');
    if (shopProfile.logo) {
        if (sidebarLogo) { sidebarLogo.src = shopProfile.logo; sidebarLogo.style.display = 'block'; }
        if (printLogo) { printLogo.src = shopProfile.logo; printLogo.style.display = 'block'; }
    } else {
        if (sidebarLogo) { sidebarLogo.src = ''; sidebarLogo.style.display = 'none'; }
        if (printLogo) { printLogo.src = ''; printLogo.style.display = 'none'; }
    }

    // Sync Settings Hub summary header & avatar
    const settingsStoreName = document.getElementById('settingsStoreName');
    if (settingsStoreName) settingsStoreName.innerText = shopProfile.name || 'billnaw';
    const settingsStorePhone = document.getElementById('settingsStorePhone');
    if (settingsStorePhone && shopProfile.phone) settingsStorePhone.innerText = shopProfile.phone;
    const settingsStoreAvatar = document.getElementById('settingsStoreAvatar');
    if (settingsStoreAvatar) {
        if (shopProfile.logo && _isValidStoreImageUrl(shopProfile.logo)) {
            const img = document.createElement('img');
            img.src = shopProfile.logo;
            img.alt = 'Logo';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:inherit;';
            settingsStoreAvatar.replaceChildren(img);
        } else {
            settingsStoreAvatar.innerText = (shopProfile.name || 'B').charAt(0).toUpperCase();
        }
    }

    // Keep modal inputs synchronized with shopProfile so unopened modals never hold stale empty values
    const storeModal = document.getElementById('storeProfileModal');
    const gstModal = document.getElementById('gstConfigModal');
    const payModal = document.getElementById('paymentConfigModal');
    const isModalOpen = (el) => Boolean(el && el.style && el.style.display && el.style.display !== 'none');

    if (!isModalOpen(storeModal)) {
        const sName = document.getElementById('shopNameInput');
        if (sName && (!sName.value || sName.value === 'billnaw')) sName.value = shopProfile.name || 'billnaw';
        const sAddr = document.getElementById('shopAddressInput');
        if (sAddr && !sAddr.value && shopProfile.address) sAddr.value = shopProfile.address;
        const sPhone = document.getElementById('shopPhoneInput');
        if (sPhone && !sPhone.value && shopProfile.phone) sPhone.value = shopProfile.phone;
        const sFssai = document.getElementById('fssaiInput');
        if (sFssai && !sFssai.value && shopProfile.fssai) sFssai.value = shopProfile.fssai;
        const sGstin = document.getElementById('gstinInput');
        if (sGstin && !sGstin.value && shopProfile.gstin) sGstin.value = shopProfile.gstin;
        const sUpi = document.getElementById('shopUpiIdInput');
        if (sUpi && !sUpi.value && shopProfile.upiId) sUpi.value = shopProfile.upiId;
        const sQr = document.getElementById('shopShowQrInput');
        if (sQr) sQr.checked = Boolean(shopProfile.showQr);
    }
    if (!isModalOpen(payModal)) {
        const pUpi = document.getElementById('upiIdInput');
        if (pUpi && !pUpi.value && shopProfile.upiId) pUpi.value = shopProfile.upiId;
        const pQr = document.getElementById('enableQrCodeInput');
        if (pQr) pQr.checked = Boolean(shopProfile.showQr);
    }
    if (!isModalOpen(gstModal)) {
        const gMode = document.getElementById('gstPricingModeInput');
        if (gMode && shopProfile.gstMode) gMode.value = shopProfile.gstMode;
        const gRate = document.getElementById('defaultGstRateInput');
        if (gRate && (gRate.value === '' || gRate.value === undefined)) {
            gRate.value = (shopProfile.defaultGstRate !== undefined && shopProfile.defaultGstRate !== null) ? shopProfile.defaultGstRate : 5;
        }
    }
}
window.updateProfileVisuals = updateProfileVisuals;

async function loadLogo(event) { 
    const file = event.target.files[0]; 
    if (!file) return;
    try {
        if (typeof resizeAndCompressLogo === 'function') {
            const compressed = await resizeAndCompressLogo(file, 154, 35840);
            if (compressed) {
                shopProfile.logo = compressed;
                updateProfileVisuals();
                persistProfile();
                showToast("Logo updated & compressed (< 35 KB).");
                return;
            }
        }
    } catch (err) {
        console.warn('Logo compression error:', err);
    }

    // Direct fallback if resizeAndCompressLogo is not yet available
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_DIM = 154; let w = img.width, h = img.height;
            if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
            canvas.width = Math.round(w); canvas.height = Math.round(h);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            let q = 0.82;
            let dataUrl = canvas.toDataURL('image/jpeg', q);
            while (dataUrl.length * 0.75 > 35840 && q > 0.3) {
                q -= 0.12;
                dataUrl = canvas.toDataURL('image/jpeg', q);
            }
            shopProfile.logo = dataUrl; 
            updateProfileVisuals(); persistProfile(); showToast("Logo Updated.");
        };
        img.src = e.target.result;
    }; 
    reader.readAsDataURL(file); 
}
window.loadLogo = loadLogo;

function generateSettingsQRPreview() {
    const previewContainer = document.getElementById('settingsQrPreview');
    const previewText = document.getElementById('settingsQrText');
    const upiInput = document.getElementById('upiIdInput');
    const enableQrInput = document.getElementById('enableQrCodeInput');

    if (!previewContainer) return;
    previewContainer.innerHTML = '';

    const upiVal = upiInput ? upiInput.value.trim() : (shopProfile.upiId || '');
    const isEnabled = enableQrInput ? enableQrInput.checked : Boolean(shopProfile.showQr);

    if (!isEnabled || !upiVal) {
        if (previewText) previewText.innerText = isEnabled ? 'ENTER UPI ID' : 'DISABLED';
        previewContainer.innerHTML = '<span style="font-size: 28px; opacity: 0.35;">📱</span>';
        return;
    }

    try {
        const upiString = `upi://pay?pa=${upiVal}&pn=${encodeURIComponent(shopProfile.name || 'billnaw')}&cu=INR`;
        if (window.QRCode) {
            new QRCode(previewContainer, {
                text: upiString,
                width: 90,
                height: 90,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.M
            });
            if (previewText) previewText.innerText = 'ACTIVE QR';
        } else {
            if (previewText) previewText.innerText = 'PREVIEW';
            previewContainer.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">QR Ready</span>';
        }
    } catch (err) {
        console.warn("QR preview generation warning:", err);
        if (previewText) previewText.innerText = 'PREVIEW';
    }
}
window.generateSettingsQRPreview = generateSettingsQRPreview;

function saveSettings() {
    if (checkFloorServerModalBlock('storeProfileModal')) return;
    if (typeof currentStaff !== 'undefined' && currentStaff && currentStaff.role && typeof normalizeRole === 'function' && normalizeRole(currentStaff.role) !== 'Admin') {
        if (typeof showToast === 'function') showToast('Permission denied: Only Store Admin can modify store settings.', 'error');
        return;
    }
    if (typeof ensureShopProfileHydrated === 'function') {
        try { ensureShopProfileHydrated(); } catch (e) {}
    }

    const storeModal = document.getElementById('storeProfileModal');
    const gstModal = document.getElementById('gstConfigModal');
    const payModal = document.getElementById('paymentConfigModal');
    const isModalOpen = (el) => Boolean(el && el.style && el.style.display && el.style.display !== 'none');

    const storeOpen = isModalOpen(storeModal);
    const gstOpen = isModalOpen(gstModal);
    const payOpen = isModalOpen(payModal);
    const anyModalOpen = storeOpen || gstOpen || payOpen;

    const shopNameInput = document.getElementById('shopNameInput');
    if (shopNameInput) {
        const val = shopNameInput.value.trim();
        if (storeOpen || !anyModalOpen || (val && val !== 'billnaw')) {
            shopProfile.name = val || shopProfile.name || "billnaw";
        }
    }
    
    const shopAddressInput = document.getElementById('shopAddressInput');
    if (shopAddressInput) {
        const val = shopAddressInput.value.trim();
        if (storeOpen || (!anyModalOpen && val !== '') || val !== '') {
            shopProfile.address = val;
        }
    }
    
    const shopPhoneInput = document.getElementById('shopPhoneInput');
    if (shopPhoneInput) {
        const cleanPhone = shopPhoneInput.value.replace(/[^\d+]/g, '').trim();
        const finalPhone = cleanPhone || shopPhoneInput.value.trim();
        if (storeOpen || finalPhone !== '') {
            shopProfile.phone = finalPhone;
            shopProfile.ownerPhone = shopProfile.phone;
            try { localStorage.setItem('billnaw_auth_phone', shopProfile.phone); } catch(e) {}
        }
    }

    const fssaiInput = document.getElementById('fssaiInput');
    if (fssaiInput) {
        const val = fssaiInput.value.trim();
        if (storeOpen || val !== '') {
            shopProfile.fssai = val;
        }
    }
    
    const gstinInput = document.getElementById('gstinInput');
    if (gstinInput) {
        const val = gstinInput.value.trim().toUpperCase();
        if (storeOpen || val !== '') {
            shopProfile.gstin = val;
        }
    }
    
    const tableCountInput = document.getElementById('tableCountInput');
    if (tableCountInput) {
        const val = parseInt(tableCountInput.value);
        if (!isNaN(val) && val > 0) shopProfile.tableCount = val;
    }
    
    const startInvoiceInput = document.getElementById('startInvoiceInput');
    if (startInvoiceInput) {
        const newStartNo = parseInt(startInvoiceInput.value);
        if (newStartNo) shopProfile.startInvoiceNo = newStartNo;
    }
    
    const adminPinSetup = document.getElementById('adminPinSetup');
    if (adminPinSetup && adminPinSetup.value.length >= 4) {
        const enteredPinVal = adminPinSetup.value.trim();
        shopProfile.adminPinHash = hashString(enteredPinVal);
        try {
            localStorage.setItem('billnaw_admin_pin_hash', shopProfile.adminPinHash);
        } catch(e) {}
        adminPinSetup.value = '';

        // Synchronize Admin in staffList as well
        const sList = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList : (window.staffList || []);
        const adminStaff = sList.find(s => s.role === 'Admin');
        if (adminStaff) {
            if (typeof generatePinSalt === 'function' && typeof hashPin === 'function') {
                const salt = generatePinSalt();
                adminStaff.pin_salt = salt;
                adminStaff.pinSalt = salt;
                hashPin(enteredPinVal, salt).then(h => {
                    adminStaff.pin_hash = h;
                    adminStaff.pinHash = h;
                    delete adminStaff.pin;
                    if (typeof saveToLocal === 'function') saveToLocal();
                    if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_staff', sList).catch(() => {});
                    try { localStorage.setItem('billnaw_store_staff', JSON.stringify(sList)); } catch(e) {}
                    if (typeof persistStaffToFirestore === 'function') persistStaffToFirestore(adminStaff);
                }).catch(() => {});
            }
        }
    }
    
    const shopUpiIdInput = document.getElementById('shopUpiIdInput');
    const upiIdInput = document.getElementById('upiIdInput');
    if (storeOpen && !payOpen && shopUpiIdInput) {
        shopProfile.upiId = shopUpiIdInput.value.trim();
    } else if (payOpen && !storeOpen && upiIdInput) {
        shopProfile.upiId = upiIdInput.value.trim();
    } else {
        const sVal = shopUpiIdInput && shopUpiIdInput.value ? shopUpiIdInput.value.trim() : '';
        const pVal = upiIdInput && upiIdInput.value ? upiIdInput.value.trim() : '';
        const prevUpi = shopProfile.upiId || '';
        if (sVal && sVal !== prevUpi) {
            shopProfile.upiId = sVal;
        } else if (pVal && pVal !== prevUpi) {
            shopProfile.upiId = pVal;
        } else if (sVal || pVal) {
            shopProfile.upiId = sVal || pVal;
        }
    }
    if (shopUpiIdInput) shopUpiIdInput.value = shopProfile.upiId || '';
    if (upiIdInput) upiIdInput.value = shopProfile.upiId || '';
    
    const shopShowQrInput = document.getElementById('shopShowQrInput');
    const enableQrCodeInput = document.getElementById('enableQrCodeInput');
    if (storeOpen && !payOpen && shopShowQrInput) {
        shopProfile.showQr = Boolean(shopShowQrInput.checked);
    } else if (payOpen && !storeOpen && enableQrCodeInput) {
        shopProfile.showQr = Boolean(enableQrCodeInput.checked);
    } else if (shopShowQrInput && shopShowQrInput.offsetParent !== null) {
        shopProfile.showQr = Boolean(shopShowQrInput.checked);
    } else if (enableQrCodeInput && enableQrCodeInput.offsetParent !== null) {
        shopProfile.showQr = Boolean(enableQrCodeInput.checked);
    } else {
        const prevQr = Boolean(shopProfile.showQr);
        const sChecked = shopShowQrInput ? Boolean(shopShowQrInput.checked) : prevQr;
        const pChecked = enableQrCodeInput ? Boolean(enableQrCodeInput.checked) : prevQr;
        if (sChecked !== prevQr) {
            shopProfile.showQr = sChecked;
        } else if (pChecked !== prevQr) {
            shopProfile.showQr = pChecked;
        } else {
            shopProfile.showQr = Boolean(sChecked || pChecked);
        }
    }
    if (shopShowQrInput) shopShowQrInput.checked = Boolean(shopProfile.showQr);
    if (enableQrCodeInput) enableQrCodeInput.checked = Boolean(shopProfile.showQr);
    
    const gstPricingModeInput = document.getElementById('gstPricingModeInput');
    if (gstPricingModeInput && gstPricingModeInput.value) {
        if (gstOpen || !anyModalOpen || !shopProfile.gstMode) {
            shopProfile.gstMode = gstPricingModeInput.value || 'inclusive';
        }
    }
    
    const defaultGstRateInput = document.getElementById('defaultGstRateInput');
    if (defaultGstRateInput) {
        const rawRateStr = String(defaultGstRateInput.value ?? '').trim();
        if (rawRateStr !== '' && !isNaN(parseFloat(rawRateStr))) {
            shopProfile.defaultGstRate = parseFloat(rawRateStr);
        } else if (shopProfile.defaultGstRate === undefined || shopProfile.defaultGstRate === null || isNaN(Number(shopProfile.defaultGstRate))) {
            shopProfile.defaultGstRate = 5;
        }
        defaultGstRateInput.value = shopProfile.defaultGstRate;
    }
    
    for (let i = 1; i <= shopProfile.tableCount; i++) {
        if (!tablesInfo[i]) tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
    }
    
    persistProfile(); 
    persistTables(); 
    showToast("Settings Saved!"); 
    updateProfileVisuals();
    renderMenuUI(); 
    updateCartUI();
    refreshAiQuotaDisplay();
}
window.saveSettings = saveSettings;

function getCustomGeminiKey() {
    if (typeof localStorage === 'undefined') return '';
    return (localStorage.getItem('gemini_api_key') || localStorage.getItem('billnaw_gemini_api_key') || '').trim();
}
function setCustomGeminiKey(key) {
    if (typeof localStorage === 'undefined') return;
    const cleanKey = (key || '').trim();
    if (cleanKey.length > 0) {
        localStorage.setItem('gemini_api_key', cleanKey);
        localStorage.setItem('billnaw_gemini_api_key', cleanKey);
    } else {
        localStorage.removeItem('gemini_api_key');
        localStorage.removeItem('billnaw_gemini_api_key');
    }
}
window.getCustomGeminiKey = getCustomGeminiKey;
window.setCustomGeminiKey = setCustomGeminiKey;

async function refreshAiQuotaDisplay() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
        const customKey = getCustomGeminiKey();
        const activeShopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_store_code') : null) || '';
        const headers = {};
        if (customKey) headers['x-gemini-api-key'] = customKey;
        if (activeShopId) headers['x-shop-id'] = activeShopId;

        const res = await fetch(`/api/ai/quota?clientId=${encodeURIComponent(activeShopId)}`, { headers });
        if (!res.ok) return;
        const data = await res.json();
        
        const badge = document.getElementById('aiQuotaBadge');
        const cycle = document.getElementById('aiQuotaCycle');
        const used = document.getElementById('aiQuotaUsed');
        const limit = document.getElementById('aiQuotaLimit');
        const keyType = document.getElementById('aiQuotaKeyType');

        if (badge) badge.innerText = `${data.remaining}/${data.limit} SCANS LEFT`;
        if (cycle) cycle.innerText = data.month || data.resetMonth || '';
        if (used) used.innerText = data.used;
        if (limit) limit.innerText = data.limit;
        if (keyType) {
            const hasCustom = Boolean(customKey || data.hasCustomKey);
            const masked = customKey ? (customKey.length >= 12 ? `${customKey.substring(0, 7)}...${customKey.slice(-4)}` : 'Dedicated Key') : data.keyMasked;
            keyType.innerText = hasCustom ? `Dedicated Key (${masked})` : "Global Server Key (Default)";
            keyType.style.color = hasCustom ? "var(--success)" : "var(--primary)";
        }
    } catch (e) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        console.warn("Could not fetch AI quota status:", e.message);
    }
}
window.refreshAiQuotaDisplay = refreshAiQuotaDisplay;

function checkFloorServerModalBlock(modalName) {
    const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
    const normRole = (active && active.role)
        ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : String(active.role).trim())
        : null;
    const isBlocked = (typeof isFloorServerRole === 'function' && isFloorServerRole()) ||
        !normRole ||
        (normRole !== 'Admin' && normRole !== 'Manager');
    if (isBlocked) {
        if (typeof showToast === 'function') {
            showToast('Access restricted: Only Admin or Manager can modify this setting.', 'error');
        }
        return true;
    }
    return false;
}
window.checkFloorServerModalBlock = checkFloorServerModalBlock;

function applySettingsRoleRestrictions() {
    const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
    const role = (active && active.role)
        ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : active.role)
        : 'Floor Server';
    const isRestricted = (role !== 'Admin');
    const isFloorServer = (role === 'Floor Server');

    // 1. Profile header button ("Business & GST Settings")
    const storeProfileBtn = document.querySelector('#settings .settings-profile-header-card button');
    if (storeProfileBtn) {
        storeProfileBtn.style.display = isRestricted ? 'none' : 'inline-flex';
    }

    // 2. Subscription crown card
    const subCrownCard = document.querySelector('.subscription-crown-card');
    if (subCrownCard) {
        subCrownCard.style.display = isRestricted ? 'none' : 'block';
    }

    // 3. Settings tiles in .settings-tiles-grid
    const tilesGrid = document.querySelector('.settings-tiles-grid');
    if (tilesGrid) {
        const tiles = tilesGrid.querySelectorAll('.setting-tile-card');
        tiles.forEach(tile => {
            const isPrinterTile = tile.id === 'settingTilePrinterConfig' || 
                                  (tile.getAttribute('onclick') && tile.getAttribute('onclick').includes('openPrinterSettingsModal'));
            if (isRestricted) {
                if (isFloorServer && isPrinterTile) {
                    tile.style.display = 'flex';
                } else {
                    tile.style.display = 'none';
                }
            } else {
                tile.style.display = 'flex';
            }
        });
    }

    // 4. Reset & Clear All Data danger card
    const dangerCards = document.querySelectorAll('#settings .card');
    dangerCards.forEach(card => {
        if (card.querySelector('button[onclick*="openClearAllDataModal"]') || (card.innerText && card.innerText.includes('Reset & Clear All Data'))) {
            card.style.display = isRestricted ? 'none' : 'block';
        }
    });
}
window.applySettingsRoleRestrictions = applySettingsRoleRestrictions;

async function openClientQuotaModal() {
    if (checkFloorServerModalBlock('clientQuotaModal')) return;
    const modal = document.getElementById('clientQuotaModal');
    if (!modal) return;
    
    const activeShopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_store_code') : null) || '';

    const quotaTargetClientId = document.getElementById('quotaTargetClientId');
    if (quotaTargetClientId) quotaTargetClientId.value = activeShopId;
    
    const quotaMonthlyLimitInput = document.getElementById('quotaMonthlyLimitInput');
    if (quotaMonthlyLimitInput) quotaMonthlyLimitInput.value = 15;
    
    const quotaCurrentUsageDisplay = document.getElementById('quotaCurrentUsageDisplay');
    if (quotaCurrentUsageDisplay) quotaCurrentUsageDisplay.value = 'Loading...';
    
    const quotaRemainingInfo = document.getElementById('quotaRemainingInfo');
    if (quotaRemainingInfo) quotaRemainingInfo.innerText = '';
    
    const quotaCustomKeyInput = document.getElementById('quotaCustomKeyInput');
    const localKey = getCustomGeminiKey();
    if (quotaCustomKeyInput) quotaCustomKeyInput.value = localKey;

    const keyBadge = document.getElementById('quotaKeyVerificationBadge');
    if (keyBadge) {
        if (localKey && localKey.length >= 15) {
            keyBadge.innerText = 'Dedicated Key Active (Stored Locally)';
            keyBadge.style.color = 'var(--success)';
        } else {
            keyBadge.innerText = 'Shared Server Key (Default)';
            keyBadge.style.color = 'var(--text-muted)';
        }
    }

    modal.style.display = 'flex';

    try {
        const headers = {};
        if (localKey) headers['x-gemini-api-key'] = localKey;
        if (activeShopId) headers['x-shop-id'] = activeShopId;

        const res = await fetch(`/api/ai/quota?clientId=${encodeURIComponent(activeShopId)}`, { headers });
        if (res.ok) {
            const data = await res.json();
            if (quotaMonthlyLimitInput) quotaMonthlyLimitInput.value = data.limit || 15;
            if (quotaCurrentUsageDisplay) quotaCurrentUsageDisplay.value = `${data.used} used in ${data.month || data.resetMonth || ''}`;
            if (quotaRemainingInfo) quotaRemainingInfo.innerText = `${data.remaining} remaining this billing cycle`;
            if (data.hasCustomKey && quotaCustomKeyInput && !localKey) {
                quotaCustomKeyInput.placeholder = `Dedicated Key Active: ${data.keyMasked}`;
            }
        }
    } catch (e) {
        console.warn("Failed loading quota details for modal:", e.message);
    }
}
window.openClientQuotaModal = openClientQuotaModal;

function closeClientQuotaModal() {
    const modal = document.getElementById('clientQuotaModal');
    if (modal) modal.style.display = 'none';
}
window.closeClientQuotaModal = closeClientQuotaModal;

async function testGeminiApiKey() {
    const keyInput = document.getElementById('quotaCustomKeyInput');
    const keyVal = (keyInput ? keyInput.value : getCustomGeminiKey()).trim();
    if (!keyVal || keyVal.length < 15) {
        showToast("⚠️ Please enter a valid Gemini API key to test.", "warning");
        return;
    }

    const badge = document.getElementById('quotaKeyVerificationBadge');
    if (badge) {
        badge.innerText = "Verifying Key...";
        badge.style.color = "var(--primary)";
    }

    try {
        const res = await fetch('/api/gemini/status', {
            headers: { 'x-gemini-api-key': keyVal }
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.operational) {
            showToast("✅ Gemini API key is valid & operational!");
            if (badge) {
                badge.innerText = "Verified Operational";
                badge.style.color = "var(--success)";
            }
        } else {
            showToast("❌ Key verification failed. Check credentials.", "error");
            if (badge) {
                badge.innerText = "Invalid Key Credentials";
                badge.style.color = "var(--danger)";
            }
        }
    } catch (err) {
        showToast("❌ Key verification request failed: " + err.message, "error");
        if (badge) {
            badge.innerText = "Verification Failed";
            badge.style.color = "var(--danger)";
        }
    }
}
window.testGeminiApiKey = testGeminiApiKey;

function toggleApiKeyVisibility() {
    const input = document.getElementById('quotaCustomKeyInput');
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    const icon = document.getElementById('apiKeyVisibilityIcon');
    if (icon) {
        icon.innerHTML = isPass
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle>';
    }
}
window.toggleApiKeyVisibility = toggleApiKeyVisibility;

async function saveClientQuotaSettings() {
    if (!_requireAdminAccess('update AI quota settings', 'clientQuotaModal')) return;
    const clientId = document.getElementById('quotaTargetClientId').value.trim() || (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : '') || '';
    const limitVal = parseInt(document.getElementById('quotaMonthlyLimitInput').value, 10);
    const keyVal = document.getElementById('quotaCustomKeyInput').value.trim();

    if (keyVal.length > 0 && keyVal.length < 15) {
        alert("Please enter a valid Gemini API key (at least 15 characters).");
        return;
    }

    setCustomGeminiKey(keyVal);

    const payload = { clientId, shopId: clientId };
    if (!isNaN(limitVal)) payload.aiMonthlyLimit = limitVal;
    payload.customGeminiKey = keyVal;

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (keyVal) headers['x-gemini-api-key'] = keyVal;

        const res = await fetch('/api/admin/client-quota', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to update quota");

        if (keyVal.length > 0) {
            showToast("✅ Dedicated Gemini API key saved successfully!");
        } else {
            showToast("ℹ️ Custom key cleared. Using global shared Gemini key.");
        }
        closeClientQuotaModal();
        refreshAiQuotaDisplay();
    } catch (err) {
        alert("Error updating client quota: " + err.message);
    }
}
window.saveClientQuotaSettings = saveClientQuotaSettings;

function openStoreProfileModal() {
    if (checkFloorServerModalBlock('storeProfileModal')) return;
    const el = document.getElementById('storeProfileModal');
    if (el) {
        const nameInput = document.getElementById('shopNameInput');
        if (nameInput) {
            nameInput.value = shopProfile.name || 'billnaw';
            setTimeout(() => nameInput.focus(), 80);
        }
        const emailInput = document.getElementById('shopEmailInput');
        if (emailInput) {
            emailInput.value = shopProfile.ownerEmail || shopProfile.email || localStorage.getItem('billnaw_auth_email') || localStorage.getItem('billnaw_owner_email') || localStorage.getItem('billnaw_shop_email') || '';
        }
        const storeCodeInput = document.getElementById('shopStoreCodeInput');
        if (storeCodeInput) {
            storeCodeInput.value = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || shopProfile.storeCode || localStorage.getItem('billnaw_store_code') || '';
        }
        const phoneInput = document.getElementById('shopPhoneInput');
        if (phoneInput) {
            phoneInput.value = shopProfile.phone || shopProfile.ownerPhone || localStorage.getItem('billnaw_auth_phone') || '';
        }
        const addrInput = document.getElementById('shopAddressInput');
        if (addrInput) addrInput.value = shopProfile.address || '';
        const fssaiInput = document.getElementById('fssaiInput');
        if (fssaiInput) fssaiInput.value = shopProfile.fssai || '';
        const gstinInput = document.getElementById('gstinInput');
        if (gstinInput) gstinInput.value = shopProfile.gstin || '';
        const shopUpiInput = document.getElementById('shopUpiIdInput');
        if (shopUpiInput) shopUpiInput.value = shopProfile.upiId || '';
        const shopQrToggle = document.getElementById('shopShowQrInput');
        if (shopQrToggle) shopQrToggle.checked = Boolean(shopProfile.showQr);
        el.style.display = 'flex';
    }
}
window.openStoreProfileModal = openStoreProfileModal;

function closeStoreProfileModal() {
    const el = document.getElementById('storeProfileModal');
    if (el) el.style.display = 'none';
}
window.closeStoreProfileModal = closeStoreProfileModal;

function openStaffManagementModal() {
    if (checkFloorServerModalBlock('staffManagementDetailModal')) return;
    const el = document.getElementById('staffManagementDetailModal');
    if (el) {
        if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
        el.style.display = 'flex';
    }
}
window.openStaffManagementModal = openStaffManagementModal;

function closeStaffManagementModal() {
    const el = document.getElementById('staffManagementDetailModal');
    if (el) el.style.display = 'none';
}
window.closeStaffManagementModal = closeStaffManagementModal;

let currentBillingCycle = 'monthly';

function setBillingCycle(cycle) {
    currentBillingCycle = cycle === 'annual' ? 'annual' : 'monthly';
    const isAnnual = currentBillingCycle === 'annual';

    const btnMonthly = document.getElementById('btnMonthlyBilling');
    const btnAnnual = document.getElementById('btnAnnualBilling');
    if (btnMonthly) {
        if (!isAnnual) btnMonthly.classList.add('active');
        else btnMonthly.classList.remove('active');
    }
    if (btnAnnual) {
        if (isAnnual) btnAnnual.classList.add('active');
        else btnAnnual.classList.remove('active');
    }

    const pricePro = document.getElementById('pricePro');
    const periodPro = document.getElementById('periodPro');
    const proBilledInfo = document.getElementById('proBilledInfo');
    const priceEnterprise = document.getElementById('priceEnterprise');
    const periodEnterprise = document.getElementById('periodEnterprise');
    const enterpriseBilledInfo = document.getElementById('enterpriseBilledInfo');

    if (pricePro) pricePro.innerText = isAnnual ? '₹ 399' : '₹ 499';
    if (periodPro) periodPro.innerText = isAnnual ? '/mo (billed annually)' : '/mo';
    if (proBilledInfo) proBilledInfo.innerText = isAnnual ? '₹ 4,788 billed annually (Save ₹ 1,200)' : 'Billed monthly, cancel anytime';

    if (priceEnterprise) priceEnterprise.innerText = isAnnual ? '₹ 1,199' : '₹ 1,499';
    if (periodEnterprise) periodEnterprise.innerText = isAnnual ? '/mo (billed annually)' : '/mo';
    if (enterpriseBilledInfo) enterpriseBilledInfo.innerText = isAnnual ? '₹ 14,388 billed annually (Save ₹ 3,600)' : 'Billed monthly, cancel anytime';
}
window.setBillingCycle = setBillingCycle;
window.toggleBillingCycle = setBillingCycle;

function selectPricingTier(tierName, price) {
    if (typeof showToast === 'function') {
        if (tierName === 'Starter') {
            showToast('Starter plan is already active (Free Forever).', 'info');
        } else {
            showToast(`Selected ${tierName} plan (${currentBillingCycle === 'annual' ? 'Annual' : 'Monthly'}). Redirecting to secure checkout...`, 'success');
        }
    }
}
window.selectPricingTier = selectPricingTier;

function refreshCurrentStoreSubscriptionUI() {
    const code = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (localStorage.getItem('billnaw_store_code') || '');
    const sub = window.currentSubscriptionState || null;

    const codeEl = document.getElementById('subModalStoreCodeDisp');
    if (codeEl) codeEl.innerText = code;

    const badgeEl = document.getElementById('subModalStatusBadge');
    const planEl = document.getElementById('subModalPlanDisp');
    const termEl = document.getElementById('subModalTerminalsDisp');
    const aiEl = document.getElementById('subModalAiScansDisp');

    if (sub) {
        const rawStatus = (sub.status || 'ACTIVE').toUpperCase();
        if (badgeEl) {
            badgeEl.innerText = rawStatus;
            if (rawStatus === 'ACTIVE' || rawStatus === 'RESUMED') {
                badgeEl.style.background = '#ECFDF5';
                badgeEl.style.color = '#065F46';
                badgeEl.style.border = '1px solid #A7F3D0';
            } else if (rawStatus === 'PAUSED') {
                badgeEl.style.background = '#FEF3C7';
                badgeEl.style.color = '#92400E';
                badgeEl.style.border = '1px solid #FCD34D';
            } else {
                badgeEl.style.background = '#FEE2E2';
                badgeEl.style.color = '#991B1B';
                badgeEl.style.border = '1px solid #FCA5A5';
            }
        }
        if (planEl) planEl.innerText = sub.plan || 'billnaw Pro (Free Tier)';
        if (termEl) termEl.innerText = `${sub.features?.maxTerminals || 10} Included`;
        if (aiEl) aiEl.innerText = `${sub.features?.aiMenuScansPerMonth || 15}/mo`;
    }
}
window.refreshCurrentStoreSubscriptionUI = refreshCurrentStoreSubscriptionUI;

function prefillAdminSubTarget() {
    const code = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : '';
    const email = (window.shopProfile && window.shopProfile.email) || (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_shop_email') || localStorage.getItem('ownerEmail')) : '') || '';
    const targetShopInput = document.getElementById('adminSubTargetShopId');
    const targetEmailInput = document.getElementById('adminSubTargetEmail');
    if (targetShopInput) targetShopInput.value = code;
    if (targetEmailInput) targetEmailInput.value = email;
    if (typeof showToast === 'function') showToast(`Pre-filled with active store: ${code}`);
}
window.prefillAdminSubTarget = prefillAdminSubTarget;

async function lookupAdminClientSubscription() {
    if (!_requireAdminAccess('lookup subscriptions', 'subscriptionDetailModal')) return;
    const shopId = (document.getElementById('adminSubTargetShopId')?.value || '').trim();
    const email = (document.getElementById('adminSubTargetEmail')?.value || '').trim();

    if (!shopId && !email) {
        if (typeof showToast === 'function') showToast('Please enter a Shop ID or Email to look up.', 'warning');
        return;
    }

    const btn = document.getElementById('btnAdminSubLookup');
    if (btn) { btn.disabled = true; btn.innerText = 'Searching...'; }

    try {
        const query = new URLSearchParams();
        if (shopId) query.set('shopId', shopId);
        if (email) query.set('email', email);

        const res = await fetch(`/api/subscription/status?${query.toString()}`);
        const data = await res.json();

        if (res.ok && data.success && data.subscription) {
            const sub = data.subscription;
            const container = document.getElementById('adminSubResultContainer');
            if (container) container.style.display = 'block';

            const statusDisp = document.getElementById('adminSubFoundStatus');
            if (statusDisp) {
                statusDisp.innerText = sub.status || 'ACTIVE';
                statusDisp.style.color = (sub.status === 'REVOKED') ? 'var(--danger)' : (sub.status === 'PAUSED' ? '#D97706' : 'var(--primary)');
            }

            const shopDisp = document.getElementById('adminSubFoundShop');
            if (shopDisp) shopDisp.innerText = sub.shopId || shopId || 'N/A';

            const emailDisp = document.getElementById('adminSubFoundEmail');
            if (emailDisp) emailDisp.innerText = sub.shopEmail || email || 'N/A';

            const actionSelect = document.getElementById('adminSubActionSelect');
            if (actionSelect) actionSelect.value = sub.status || 'ACTIVE';

            const planSelect = document.getElementById('adminSubPlanSelect');
            if (planSelect) planSelect.value = sub.plan || 'billnaw Pro';

            const reasonInput = document.getElementById('adminSubReasonInput');
            if (reasonInput) reasonInput.value = sub.statusReason || '';

            if (typeof showToast === 'function') showToast(`Found subscription: ${sub.shopId} (${sub.status})`, 'success');
        } else {
            if (typeof showToast === 'function') showToast(data.error || 'Shop subscription not found.', 'error');
        }
    } catch (err) {
        if (typeof showToast === 'function') showToast('Network error querying subscription service.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Lookup Subscription'; }
    }
}
window.lookupAdminClientSubscription = lookupAdminClientSubscription;

async function submitAdminSubscriptionUpdate() {
    if (!_requireAdminAccess('update subscriptions', 'subscriptionDetailModal')) return;
    const shopId = (document.getElementById('adminSubTargetShopId')?.value || '').trim();
    const email = (document.getElementById('adminSubTargetEmail')?.value || '').trim();
    const action = document.getElementById('adminSubActionSelect')?.value || 'ACTIVE';
    const plan = document.getElementById('adminSubPlanSelect')?.value || 'billnaw Pro';
    const reason = (document.getElementById('adminSubReasonInput')?.value || '').trim();

    if (!shopId && !email) {
        if (typeof showToast === 'function') showToast('Shop ID or Email is required.', 'warning');
        return;
    }

    const btn = document.getElementById('btnAdminSubSave');
    if (btn) { btn.disabled = true; btn.innerText = 'Updating Cloud...'; }

    try {
        const payload = {
            shopId: shopId || undefined,
            shopEmail: email || undefined,
            action,
            reason,
            plan,
            updatedBy: (window.currentStaff && window.currentStaff.name) ? `${window.currentStaff.name} (Admin)` : 'Master Admin'
        };

        const res = await fetch('/api/subscription/manage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (res.ok && data.success) {
            if (typeof showToast === 'function') {
                showToast(`Subscription updated: ${action} for ${shopId || email}!`, 'success');
            }
            // If the updated shop is current shop, apply changes immediately
            const myStore = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : '';
            if (data.subscription && (shopId === myStore || (email && email === (window.shopProfile && window.shopProfile.email)))) {
                if (typeof applySubscriptionStatus === 'function') {
                    applySubscriptionStatus(data.subscription);
                }
                refreshCurrentStoreSubscriptionUI();
            }
            // Refresh lookup view
            lookupAdminClientSubscription();
        } else {
            if (typeof showToast === 'function') {
                showToast(data.error || 'Failed to update subscription.', 'error');
            }
        }
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Network error saving subscription.', 'error');
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Save & Update Cloud Subscription'; }
    }
}
window.submitAdminSubscriptionUpdate = submitAdminSubscriptionUpdate;

function openSubscriptionModal() {
    if (checkFloorServerModalBlock('subscriptionDetailModal')) return;
    const el = document.getElementById('subscriptionDetailModal') || document.getElementById('subscriptionModal');
    if (el) {
        refreshCurrentStoreSubscriptionUI();
        el.style.display = 'flex';
    }
}
window.openSubscriptionModal = openSubscriptionModal;

function closeSubscriptionModal() {
    const el = document.getElementById('subscriptionDetailModal') || document.getElementById('subscriptionModal');
    if (el) el.style.display = 'none';
}
window.closeSubscriptionModal = closeSubscriptionModal;

function openExpensesDetailModal() {
    if (checkFloorServerModalBlock('expensesDetailModal')) return;
    const el = document.getElementById('expensesDetailModal');
    if (el) {
        if (typeof renderExpensesUI === 'function') renderExpensesUI();
        const totEl = document.getElementById('expensesModalTotal');
        if (totEl && Array.isArray(dailyExpenses)) {
            const todayISO = (typeof getLocalISODate === 'function') ? getLocalISODate() : '';
            const todayExp = dailyExpenses.filter(e => e.filterDate === todayISO || (e.date && e.date.startsWith(new Date().toLocaleDateString())));
            const sum = todayExp.reduce((s, e) => s + (Number(e.cost) || 0), 0);
            totEl.innerText = `Today's Total: ₹ ${sum.toFixed(2)}`;
        }
        el.style.display = 'flex';
    }
}
window.openExpensesDetailModal = openExpensesDetailModal;

function closeExpensesDetailModal() {
    const el = document.getElementById('expensesDetailModal');
    if (el) el.style.display = 'none';
}
window.closeExpensesDetailModal = closeExpensesDetailModal;

function openDiscountSettingsModal() {
    if (checkFloorServerModalBlock('discountConfigModal')) return;
    const el = document.getElementById('discountConfigModal');
    if (el) {
        const enableInput = document.getElementById('settingDiscountsEnabled');
        if (enableInput) enableInput.checked = shopProfile.discountsEnabled !== false;

        const maxPercentInput = document.getElementById('settingMaxDiscountPercent');
        if (maxPercentInput) maxPercentInput.value = shopProfile.maxDiscountPercent || 50;

        const maxFixedInput = document.getElementById('settingMaxDiscountFixed');
        if (maxFixedInput) maxFixedInput.value = shopProfile.maxDiscountFixed || 1000;

        const percentPresetsInput = document.getElementById('settingDiscountPercentPresets');
        if (percentPresetsInput) {
            percentPresetsInput.value = (shopProfile.discountPercentPresets || [5, 10, 15, 20, 25]).join(', ');
        }

        const fixedPresetsInput = document.getElementById('settingDiscountFixedPresets');
        if (fixedPresetsInput) {
            fixedPresetsInput.value = (shopProfile.discountFixedPresets || [20, 50, 100, 200]).join(', ');
        }

        const autoTierInput = document.getElementById('settingAutoTierDiscounts');
        if (autoTierInput) autoTierInput.checked = shopProfile.autoTierDiscounts !== false;

        const tierRates = shopProfile.tierDiscountRates || { Platinum: 15, Gold: 10, Silver: 5, Bronze: 0 };
        const platInput = document.getElementById('settingTierRatePlatinum');
        if (platInput) platInput.value = tierRates.Platinum !== undefined ? tierRates.Platinum : 15;
        const goldInput = document.getElementById('settingTierRateGold');
        if (goldInput) goldInput.value = tierRates.Gold !== undefined ? tierRates.Gold : 10;
        const silverInput = document.getElementById('settingTierRateSilver');
        if (silverInput) silverInput.value = tierRates.Silver !== undefined ? tierRates.Silver : 5;
        const bronzeInput = document.getElementById('settingTierRateBronze');
        if (bronzeInput) bronzeInput.value = tierRates.Bronze !== undefined ? tierRates.Bronze : 0;

        el.style.display = 'flex';
    }
}
window.openDiscountSettingsModal = openDiscountSettingsModal;

function closeDiscountSettingsModal() {
    const el = document.getElementById('discountConfigModal');
    if (el) el.style.display = 'none';
}
window.closeDiscountSettingsModal = closeDiscountSettingsModal;

function saveDiscountSettings() {
    if (!_requireAdminAccess('save discount settings', 'discountConfigModal')) return;
    const enableInput = document.getElementById('settingDiscountsEnabled');
    if (enableInput) shopProfile.discountsEnabled = enableInput.checked;

    const maxPercentInput = document.getElementById('settingMaxDiscountPercent');
    if (maxPercentInput) {
        const val = parseFloat(maxPercentInput.value);
        if (!isNaN(val) && val > 0) shopProfile.maxDiscountPercent = val;
    }

    const maxFixedInput = document.getElementById('settingMaxDiscountFixed');
    if (maxFixedInput) {
        const val = parseFloat(maxFixedInput.value);
        if (!isNaN(val) && val > 0) shopProfile.maxDiscountFixed = val;
    }

    const percentPresetsInput = document.getElementById('settingDiscountPercentPresets');
    if (percentPresetsInput && percentPresetsInput.value.trim()) {
        const arr = percentPresetsInput.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (arr.length > 0) shopProfile.discountPercentPresets = arr;
    }

    const fixedPresetsInput = document.getElementById('settingDiscountFixedPresets');
    if (fixedPresetsInput && fixedPresetsInput.value.trim()) {
        const arr = fixedPresetsInput.value.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (arr.length > 0) shopProfile.discountFixedPresets = arr;
    }

    const autoTierInput = document.getElementById('settingAutoTierDiscounts');
    if (autoTierInput) shopProfile.autoTierDiscounts = autoTierInput.checked;

    const platInput = document.getElementById('settingTierRatePlatinum');
    const goldInput = document.getElementById('settingTierRateGold');
    const silverInput = document.getElementById('settingTierRateSilver');
    const bronzeInput = document.getElementById('settingTierRateBronze');

    if (!shopProfile.tierDiscountRates) shopProfile.tierDiscountRates = {};
    if (platInput) shopProfile.tierDiscountRates.Platinum = parseFloat(platInput.value) || 0;
    if (goldInput) shopProfile.tierDiscountRates.Gold = parseFloat(goldInput.value) || 0;
    if (silverInput) shopProfile.tierDiscountRates.Silver = parseFloat(silverInput.value) || 0;
    if (bronzeInput) shopProfile.tierDiscountRates.Bronze = parseFloat(bronzeInput.value) || 0;

    persistProfile();
    closeDiscountSettingsModal();
    if (typeof updateCartUI === 'function') updateCartUI();
    showToast("✅ Discount rules & triggers saved!");
}
window.saveDiscountSettings = saveDiscountSettings;

function openGstConfigModal() {
    if (checkFloorServerModalBlock('gstConfigModal')) return;
    const el = document.getElementById('gstConfigModal');
    if (el) {
        const modeSel = document.getElementById('gstPricingModeInput');
        if (modeSel) modeSel.value = shopProfile.gstMode || 'inclusive';
        const rateInp = document.getElementById('defaultGstRateInput');
        if (rateInp) rateInp.value = shopProfile.defaultGstRate !== undefined ? shopProfile.defaultGstRate : 5;
        el.style.display = 'flex';
    }
}
window.openGstConfigModal = openGstConfigModal;

function closeGstConfigModal() {
    const el = document.getElementById('gstConfigModal');
    if (el) el.style.display = 'none';
}
window.closeGstConfigModal = closeGstConfigModal;

function openPaymentConfigModal() {
    if (checkFloorServerModalBlock('paymentConfigModal')) return;
    const el = document.getElementById('paymentConfigModal');
    if (el) {
        const upiInp = document.getElementById('upiIdInput');
        if (upiInp) upiInp.value = shopProfile.upiId || '';
        const qrChk = document.getElementById('enableQrCodeInput');
        if (qrChk) qrChk.checked = Boolean(shopProfile.showQr);
        generateSettingsQRPreview();
        el.style.display = 'flex';
    }
}
window.openPaymentConfigModal = openPaymentConfigModal;

function closePaymentConfigModal() {
    const el = document.getElementById('paymentConfigModal');
    if (el) el.style.display = 'none';
}
window.closePaymentConfigModal = closePaymentConfigModal;

// ============================================================
// 🪑 TABLE TABS & SEATING CONFIGURATION HANDLERS
// ============================================================
let draftTableCount = 5;
let draftCustomNames = {};

function openTableConfigModal() {
    if (checkFloorServerModalBlock('tableConfigModal')) return;
    if (typeof openTableManagementModal === 'function') {
        openTableManagementModal();
    } else {
        const modal = document.getElementById('tableManagementModal') || document.getElementById('tableConfigModal');
        if (modal) modal.style.display = 'flex';
    }
}
window.openTableConfigModal = openTableConfigModal;

function closeTableConfigModal() {
    if (typeof closeTableManagementModal === 'function') {
        closeTableManagementModal();
    }
    const modal = document.getElementById('tableConfigModal');
    if (modal) modal.style.display = 'none';
}
window.closeTableConfigModal = closeTableConfigModal;

function renderTableConfigList() {
    const container = document.getElementById('tableConfigList');
    if (!container) return;
    
    const countInput = document.getElementById('settingTableCountInput');
    if (countInput) countInput.value = draftTableCount;
    
    const summaryCount = document.getElementById('tableConfigTotalCountDisplay');
    if (summaryCount) summaryCount.innerText = `${draftTableCount} Tables`;

    let html = '';
    for (let i = 1; i <= draftTableCount; i++) {
        const currentName = draftCustomNames[i] !== undefined && draftCustomNames[i] !== '' 
            ? draftCustomNames[i] 
            : (getTableName(i) || `T${i}`);
        
        const tInfo = tablesInfo[i];
        const hasActiveOrder = tInfo && tInfo.items && tInfo.items.length > 0;
        const statusBadge = hasActiveOrder 
            ? `<span class="custom-pill table-pill-dinein" style="font-size: 10px;">Active (${tInfo.items.reduce((s, it) => s + it.qty, 0)} items)</span>` 
            : `<span style="font-size: 11px; color: var(--text-muted);">Vacant</span>`;

        html += `
            <div class="table-config-row" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 70px;">
                    <span style="font-size: 12px; font-weight: 800; color: var(--text-muted); width: 26px;">#${i}</span>
                    <span style="font-size: 16px;">🪑</span>
                </div>
                
                <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
                    <input type="text" id="tblCustomNameInput_${i}" 
                           value="${escapeHtml(currentName)}" 
                           placeholder="e.g. T${i}, AC-${i}, Garden-${i}" 
                           oninput="onTableDraftNameChange(${i}, this.value)"
                           style="width: 100%; padding: 8px 12px; font-size: 13px; font-weight: 700; border: 1px solid var(--border); border-radius: 8px; color: var(--primary);">
                </div>

                <div style="min-width: 90px; text-align: right;">
                    ${statusBadge}
                </div>

                <div>
                    ${i === draftTableCount && !hasActiveOrder && draftTableCount > 1 ? `
                        <button type="button" class="btn btn-outline" style="padding: 6px 10px; font-size: 11px; color: var(--danger); border-color: rgba(167,50,50,0.3); display: inline-flex; align-items: center; justify-content: center;" onclick="removeLastTableInSettings()" title="Delete Table #${i}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}
window.renderTableConfigList = renderTableConfigList;

function onTableDraftNameChange(tableIndex, val) {
    draftCustomNames[tableIndex] = val.trim();
}
window.onTableDraftNameChange = onTableDraftNameChange;

function changeTableCountInSettings(delta) {
    const newCount = Math.max(1, Math.min(50, draftTableCount + delta));
    if (newCount === draftTableCount) return;
    
    // If decreasing, verify if any table being removed has active orders
    if (newCount < draftTableCount) {
        for (let i = newCount + 1; i <= draftTableCount; i++) {
            const tInfo = tablesInfo[i];
            if (tInfo && tInfo.items && tInfo.items.length > 0) {
                return alert(`Cannot reduce tables: Table #${i} (${getTableName(i)}) has an active order in progress! Clear the table bill first.`);
            }
        }
    }
    
    draftTableCount = newCount;
    renderTableConfigList();
}
window.changeTableCountInSettings = changeTableCountInSettings;

function onTableCountInputChanged(val) {
    const num = parseInt(val, 10);
    if (isNaN(num) || num < 1 || num > 50) return;
    
    if (num < draftTableCount) {
        for (let i = num + 1; i <= draftTableCount; i++) {
            const tInfo = tablesInfo[i];
            if (tInfo && tInfo.items && tInfo.items.length > 0) {
                alert(`Cannot reduce tables: Table #${i} (${getTableName(i)}) has an active order in progress!`);
                const input = document.getElementById('settingTableCountInput');
                if (input) input.value = draftTableCount;
                return;
            }
        }
    }
    draftTableCount = num;
    renderTableConfigList();
}
window.onTableCountInputChanged = onTableCountInputChanged;

function addNewTableInSettings() {
    changeTableCountInSettings(1);
    showToast(`➕ Added Table #${draftTableCount}`);
}
window.addNewTableInSettings = addNewTableInSettings;

function removeLastTableInSettings() {
    changeTableCountInSettings(-1);
}
window.removeLastTableInSettings = removeLastTableInSettings;

function applyTableNamingPreset(prefix) {
    for (let i = 1; i <= draftTableCount; i++) {
        if (prefix === 'T') {
            draftCustomNames[i] = `T${i}`;
        } else if (prefix === 'Table') {
            draftCustomNames[i] = `Table ${i}`;
        } else if (prefix === 'D') {
            draftCustomNames[i] = `D${i}`;
        } else if (prefix === 'C') {
            draftCustomNames[i] = `C${i}`;
        } else if (prefix === 'AC') {
            draftCustomNames[i] = `AC-${i}`;
        }
    }
    renderTableConfigList();
    showToast(`Applied preset '${prefix}1, ${prefix}2...'`);
}
window.applyTableNamingPreset = applyTableNamingPreset;

// saveTableSettings eliminated in Milestone 1: Authoritative handler is defined in index.html for #tableManagementModal


function openCloudSyncDetailModal() {
    if (checkFloorServerModalBlock('cloudSyncDetailModal')) return;
    const el = document.getElementById('cloudSyncDetailModal');
    if (el) {
        const storeCode = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (localStorage.getItem('billnaw_store_code') || 'N/A');
        const codeEl = document.getElementById('settingsCurrentShopCode');
        if (codeEl) codeEl.innerText = storeCode;

        const dbEl = document.getElementById('settingsFirestoreDbDisplay');
        if (dbEl) dbEl.innerText = 'Billnaw Cloud (Encrypted)';

        const lastSyncEl = document.getElementById('settingsLastSyncTime');
        if (lastSyncEl) {
            lastSyncEl.innerText = (typeof lastCloudSyncTime !== 'undefined' && lastCloudSyncTime) 
                ? new Date(lastCloudSyncTime).toLocaleTimeString() 
                : 'Just now';
        }

        const sCount = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList.length : 0;
        const tCount = (typeof tablesInfo !== 'undefined' && tablesInfo && typeof tablesInfo === 'object') ? Object.keys(tablesInfo).length : 0;
        const mCount = (typeof menuItems !== 'undefined' && Array.isArray(menuItems)) ? menuItems.length : 0;

        const staffStat = document.getElementById('syncStatStaff');
        if (staffStat) staffStat.innerText = `Staff: ${sCount}`;
        const tableStat = document.getElementById('syncStatTables');
        if (tableStat) tableStat.innerText = `Tables: ${tCount}`;
        const menuStat = document.getElementById('syncStatMenu');
        if (menuStat) menuStat.innerText = `Menu: ${mCount}`;

        el.style.display = 'flex';
    }
}
window.openCloudSyncDetailModal = openCloudSyncDetailModal;

function copyStoreCode() {
    const code = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (document.getElementById('settingsCurrentShopCode')?.innerText || '');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            if (typeof showToast === 'function') showToast('Store code copied: ' + code);
        }).catch(() => {
            if (typeof showToast === 'function') showToast('Store code: ' + code);
        });
    } else {
        if (typeof showToast === 'function') showToast('Store code: ' + code);
    }
}
window.copyStoreCode = copyStoreCode;

function closeCloudSyncDetailModal() {
    const el = document.getElementById('cloudSyncDetailModal');
    if (el) el.style.display = 'none';
}
window.closeCloudSyncDetailModal = closeCloudSyncDetailModal;

function openContactModal() {
    if (checkFloorServerModalBlock('contactSupportModal')) return;
    const el = document.getElementById('contactSupportModal');
    if (el) el.style.display = 'flex';
}
window.openContactModal = openContactModal;

function closeContactModal() {
    const el = document.getElementById('contactSupportModal');
    if (el) el.style.display = 'none';
}
window.closeContactModal = closeContactModal;

function _stripProtoPollutionKeys(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(_stripProtoPollutionKeys);
    const clean = {};
    for (const key of Object.keys(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        clean[key] = _stripProtoPollutionKeys(obj[key]);
    }
    return clean;
}

function exportFullShopBackupJSON() {
    if (!_requireAdminAccess('export shop backups', 'cloudSyncDetailModal')) return;

    const safeProfile = shopProfile ? JSON.parse(JSON.stringify(shopProfile)) : {};
    ['adminPinHash', 'openAiKey', 'customGeminiKey', 'token', 'authToken', 'customToken', 'sessionToken'].forEach(k => delete safeProfile[k]);

    const safeStaff = (Array.isArray(staffList) ? staffList : []).map(member => {
        if (!member || typeof member !== 'object') return member;
        const copy = { ...member };
        ['pin_salt', 'pinSalt', 'pin_hash', 'pinHash', 'pin', 'initialOtp', 'otp', 'token', 'passwordHash', 'salt'].forEach(k => delete copy[k]);
        return copy;
    });

    const fullBackup = {
        version: "2.4.0",
        exportDate: new Date().toISOString(),
        menuVersion: Number(localStorage.getItem('billnaw_menu_version') || shopProfile?.menuVersion || 1),
        deletedMenuIds: (typeof getDeletedMenuItemIds === 'function') ? getDeletedMenuItemIds() : [],
        deletedMenuNames: (typeof getDeletedMenuItemNames === 'function') ? getDeletedMenuItemNames() : [],
        deletedStaffIds: (typeof getDeletedStaffIds === 'function') ? getDeletedStaffIds() : [],
        profile: safeProfile,
        menu: menuItems,
        categories: menuCategories,
        customers: customersList,
        staff: safeStaff,
        expenses: dailyExpenses,
        history: orderHistory,
        tables: tablesInfo
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `billnaw_backup_${getLocalISODate()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("💾 Shop JSON Backup downloaded!");
}
window.exportFullShopBackupJSON = exportFullShopBackupJSON;

function handleRestoreShopBackup(event) {
    if (!_requireAdminAccess('restore shop backups', 'cloudSyncDetailModal')) {
        if (event && event.target) event.target.value = '';
        return;
    }
    const file = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!file) return;
    if (typeof file.size === 'number' && file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast('Backup file exceeds 10MB limit.', 'error');
        if (event && event.target) event.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const rawParsed = JSON.parse(e.target.result);
            if (!rawParsed || typeof rawParsed !== 'object' || Array.isArray(rawParsed)) {
                throw new Error('Invalid backup structure: root must be a JSON object.');
            }
            const data = _stripProtoPollutionKeys(rawParsed);
            const recognizedKeys = ['profile', 'menu', 'categories', 'customers', 'staff', 'expenses', 'history', 'tables'];
            const hasRecognized = recognizedKeys.some(k => data[k] !== undefined);
            if (!hasRecognized) {
                throw new Error('Invalid backup file: no recognized store data fields found.');
            }
            if (data.profile !== undefined && (!data.profile || typeof data.profile !== 'object' || Array.isArray(data.profile))) {
                throw new Error('Invalid backup schema: profile must be an object.');
            }
            ['menu', 'categories', 'customers', 'staff', 'expenses', 'history'].forEach(arrKey => {
                if (data[arrKey] !== undefined && !Array.isArray(data[arrKey])) {
                    throw new Error(`Invalid backup schema: ${arrKey} must be an array.`);
                }
            });
            if (data.tables !== undefined && (!data.tables || typeof data.tables !== 'object' || Array.isArray(data.tables))) {
                throw new Error('Invalid backup schema: tables must be an object.');
            }

            if (data.profile) {
                const safeIncoming = { ...data.profile };
                ['storeCode', 'id', 'shopId', 'ownerEmail', 'email', 'ownerUid', 'adminPinHash',
                 'openAiKey', 'customGeminiKey', 'token', 'authToken', 'customToken', 'sessionToken', 'menuVersion'].forEach(k => delete safeIncoming[k]);
                shopProfile = { ...(shopProfile || {}), ...safeIncoming };
                window.shopProfile = shopProfile;
            }
            if (Array.isArray(data.menu)) {
                menuItems = data.menu
                    .filter(item => item && typeof item === 'object' && String(item.name || '').trim() !== '' && Number.isFinite(Number(item.price)) && Number(item.price) >= 0)
                    .map((item, idx) => ({
                        ...item,
                        id: item.id || (Date.now() + idx),
                        name: String(item.name).trim(),
                        price: Number(item.price),
                        isDeleted: false,
                        isAvailable: item.isAvailable !== false,
                        is_active: item.is_active !== false,
                        deletedAt: null,
                        updatedAt: Date.now()
                    }));
                window.menuItems = menuItems;
            }
            if (Array.isArray(data.categories)) {
                const cleanedCats = data.categories.map(c => String(c || '').trim()).filter(Boolean);
                const uniqueCats = Array.from(new Set(cleanedCats.filter(c => c !== 'All')));
                menuCategories = ['All', ...uniqueCats];
                window.menuCategories = menuCategories;
            }
            if (Array.isArray(data.customers)) {
                customersList = data.customers.filter(c => c && typeof c === 'object');
                window.customersList = customersList;
            }
            if (Array.isArray(data.staff)) {
                const existingAdmins = Array.isArray(staffList) ? staffList.filter(s => s && s.role === 'Admin' && (s.pin_hash || s.pinHash)) : [];
                const cleanedStaff = data.staff
                    .filter(s => s && typeof s === 'object' && String(s.name || '').trim() !== '' && String(s.role || '').trim() !== '')
                    .map(s => {
                        const copy = { ...s };
                        delete copy.pin;
                        delete copy.initialOtp;
                        delete copy.otp;
                        return copy;
                    });
                if (!cleanedStaff.some(s => s.role === 'Admin') && existingAdmins.length > 0) {
                    cleanedStaff.unshift(existingAdmins[0]);
                }
                staffList = cleanedStaff;
                window.staffList = staffList;
            }
            if (Array.isArray(data.expenses)) {
                dailyExpenses = data.expenses.filter(ex => ex && typeof ex === 'object');
                window.dailyExpenses = dailyExpenses;
            }
            if (Array.isArray(data.history)) {
                orderHistory = data.history.filter(o => o && typeof o === 'object');
                window.orderHistory = orderHistory;
            }
            if (data.tables) {
                const cleanTables = {};
                Object.entries(data.tables).forEach(([tKey, tVal]) => {
                    if (tVal && typeof tVal === 'object' && Array.isArray(tVal.items)) {
                        cleanTables[tKey] = tVal;
                    }
                });
                tablesInfo = cleanTables;
                window.tablesInfo = tablesInfo;
            }

            // Clear tombstones, mark menu customized, and bump menuVersion so cloud sync does not re-delete restored items
            localStorage.removeItem('billnaw_deleted_menu_ids');
            localStorage.removeItem('billnaw_deleted_menu_names');
            localStorage.removeItem('billnaw_deleted_staff_ids');
            if (typeof markMenuCustomized === 'function') markMenuCustomized();
            else localStorage.setItem('billnaw_menu_customized', 'true');
            const prevVer = Number(localStorage.getItem('billnaw_menu_version') || shopProfile?.menuVersion || 1);
            const nextVer = prevVer + 1;
            localStorage.setItem('billnaw_menu_version', String(nextVer));
            if (shopProfile) shopProfile.menuVersion = nextVer;
            window.currentMenuVersion = nextVer;

            if (typeof persistProfile === 'function') persistProfile();
            if (typeof saveToLocal === 'function') saveToLocal();
            if (typeof updateAllUI === 'function') updateAllUI();
            if (typeof persistAllToFirestore === 'function') await persistAllToFirestore();
            showToast("✅ Store backup restored successfully!");
            closeCloudSyncDetailModal();
        } catch (err) {
            alert("Failed to parse backup file: " + err.message);
        } finally {
            if (event && event.target) event.target.value = '';
        }
    };
    reader.readAsText(file);
}
window.handleRestoreShopBackup = handleRestoreShopBackup;

function switchTab(tabId) { 
    if (typeof canAccessStoreData === 'function' && !canAccessStoreData()) {
        console.warn('[ZeroStoreDataGate] Blocked tab navigation to ' + tabId + ' while device is pending or revoked.');
        const isAuth = (typeof getDeviceStatus === 'function' ? getDeviceStatus() : localStorage.getItem('billnaw_device_status')) === 'AUTHORIZED' && (typeof checkDeviceAuthExpiration !== 'function' || !checkDeviceAuthExpiration());
        if (!isAuth && typeof showDevicePairingOverlay === 'function') {
            showDevicePairingOverlay();
        }
        return;
    }

    if (tabId === 'more') {
        openMoreHub();
        return;
    }

    // Role-Based Access Control (RBAC) Guard with Spot Manager PIN Override (Fail-Closed when currentStaff is null)
    const activeStaffForTab = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
    if (typeof canStaffAccessTab === 'function' && !canStaffAccessTab(activeStaffForTab, tabId)) {
        if (activeStaffForTab && typeof requestManagerOverride === 'function') {
            const tabNames = {
                dashboard: 'Reports & Business Insights',
                settings: 'Terminal Settings',
                menu: 'Menu Management',
                inventory: 'Inventory & Commissary',
                khata: 'Khata Due Ledger',
                staff: 'Staff Management',
                devices: 'Authorized Devices Hub',
                tables: 'Floor Tables Overview'
            };
            const isAdminOnlyTab = ['dashboard', 'settings', 'staff', 'devices', 'whatsapp', 'menu'].includes(tabId);
            requestManagerOverride({
                title: isAdminOnlyTab ? 'Admin Authorization Required' : 'Manager Approval Required',
                actionDescription: `Staff role (${activeStaffForTab.role}) is restricted from accessing ${tabNames[tabId] || tabId}. Enter ${isAdminOnlyTab ? 'Admin' : 'Manager or Admin'} PIN:`,
                requiredRole: isAdminOnlyTab ? 'Admin' : 'Manager',
                grantMenuSession: tabId === 'menu',
                onSuccess: () => {
                    if (tabId === 'menu') {
                        const authUntil = Date.now() + (30 * 60 * 1000);
                        if (typeof window !== 'undefined') window._menuAdminPinAuthorizedUntil = authUntil;
                        try { sessionStorage.setItem('billnaw_admin_pin_auth_until', String(authUntil)); } catch (e) {}
                        const navMenuEl = document.getElementById('nav-menu');
                        if (navMenuEl) navMenuEl.classList.remove('locked');
                    }
                    switchTabDirect(tabId);
                }
            });
            return;
        }
        if (typeof showToast === 'function') showToast('Access restricted for your role.', 'error');
        return;
    }

    switchTabDirect(tabId);
}

function switchTabDirect(tabId) {
    // Track navigation history for physical/gesture back button support
    if (!window._isNavigatingBack) {
        if (!window._appNavHistory) window._appNavHistory = ['pos'];
        const safeTarget = tabId || 'pos';
        if (window._appNavHistory[window._appNavHistory.length - 1] !== safeTarget) {
            window._appNavHistory.push(safeTarget);
            if (window._appNavHistory.length > 25) window._appNavHistory.shift();
        }
    }

    document.body?.classList.remove('cart-drawer-from-tables');
    document.getElementById('cartDrawer')?.classList.remove('open');
    document.getElementById('cartDrawerOverlay')?.classList.remove('show');
    document.querySelectorAll('.nav-btn, .tab-btn').forEach(btn => btn.classList.remove('active')); 
    document.querySelectorAll('.view, .tab-content').forEach(c => c.classList.remove('active')); 
    
    const targetNavBtn = document.getElementById(`nav-${tabId}`) || document.getElementById(`tab-${tabId}`);
    if (['customers', 'settings', 'whatsapp'].includes(tabId)) {
        const moreNavBtn = document.getElementById('nav-more');
        if (moreNavBtn) moreNavBtn.classList.add('active');
    }
    if (targetNavBtn) targetNavBtn.classList.add('active');
    
    const targetContent = document.getElementById(tabId);
    if (targetContent) {
        targetContent.classList.add('active');
        try { targetContent.scrollTop = 0; } catch(e) {}
    }
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        try { mainContent.scrollTop = 0; } catch(e) {}
    }
    window.scrollTo(0, 0); 
    
    // Always keep topbar active table indicator synced across all tab views
    if (typeof syncTableUI === 'function') syncTableUI();

    if (tabId === 'tables') {
        if (typeof renderTablesView === 'function') renderTablesView();
    }
    if (tabId === 'dashboard') {
        if (typeof renderDashboardAnalytics === 'function') renderDashboardAnalytics();
    }
    if (tabId === 'customers') {
        if (typeof renderCustomersUI === 'function') renderCustomersUI();
    }
    if (tabId === 'pos') {
        if (typeof renderTables === 'function') renderTables();
        if (typeof renderMenuUI === 'function') renderMenuUI();
        if (typeof updateCartUI === 'function') updateCartUI();
    }
    if (tabId === 'menu' || tabId === 'menuManage') {
        if (typeof renderCategoryDropdown === 'function') renderCategoryDropdown();
        if (typeof renderCategoryFilters === 'function') renderCategoryFilters();
        if (typeof renderCategoryListUI === 'function') renderCategoryListUI();
        if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
    }
    if (tabId === 'whatsapp') {
        if (typeof renderWhatsAppHubUI === 'function') renderWhatsAppHubUI();
    }
    if (tabId === 'inventory') {
        if (typeof renderInventoryTelemetryUI === 'function') renderInventoryTelemetryUI();
    }
    if (tabId === 'staff') {
        if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
    }
    if (tabId === 'khata') {
        if (typeof renderKhataUI === 'function') renderKhataUI();
    }
    if (tabId === 'settings') {
        if (typeof applySettingsRoleRestrictions === 'function') applySettingsRoleRestrictions();
        if (typeof refreshAiQuotaDisplay === 'function') refreshAiQuotaDisplay();
        if (typeof generateSettingsQRPreview === 'function') generateSettingsQRPreview();
        if (typeof renderSettingsProfileHeader === 'function') renderSettingsProfileHeader();
    }
    if (tabId === 'kds') {
        if (typeof renderKdsUI === 'function') renderKdsUI();
    }
}
window.switchTab = switchTab;
window.switchTabDirect = switchTabDirect;

function factoryReset() {
    if (!_requireAdminAccess('perform factory reset', 'settings')) return;
    if (confirm("⚠️ EXTREME WARNING: This will permanently wipe all Menu, Orders, Customers, Expenses and Settings on this browser. Proceed?")) {
        if (typeof window.detachFirestoreListener === 'function') try { window.detachFirestoreListener(); } catch (e) {}
        if (typeof window.stopBackgroundSync === 'function') try { window.stopBackgroundSync(); } catch (e) {}
        if (typeof window.stopSessionHeartbeat === 'function') try { window.stopSessionHeartbeat(); } catch (e) {}
        if (typeof window.stopStaffPresenceHeartbeat === 'function') try { window.stopStaffPresenceHeartbeat(); } catch (e) {}
        indexedDB.deleteDatabase('CafePOS_DB');
        localStorage.clear();
        location.reload();
    }
}
window.factoryReset = factoryReset;

function openClearAllDataModal() {
    if (!_requireAdminAccess('clear all store data', 'clearAllDataConfirmModal')) return;
    const modal = document.getElementById('clearAllDataConfirmModal');
    if (modal) modal.style.display = 'flex';
}
window.openClearAllDataModal = openClearAllDataModal;

function closeClearAllDataModal() {
    const modal = document.getElementById('clearAllDataConfirmModal');
    if (modal) modal.style.display = 'none';
}
window.closeClearAllDataModal = closeClearAllDataModal;

async function confirmClearAllData() {
    if (!_requireAdminAccess('clear all store data', 'clearAllDataConfirmModal')) return;
    closeClearAllDataModal();
    try {
        const activeToken = localStorage.getItem('billnaw_auth_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('billnaw_auth_token') : null);
        const isAuthenticatedShop = Boolean(activeToken && localStorage.getItem('billnaw_auth_mode') === 'authenticated');
        const activeStoreCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || window.myClientID;
        const prevVer = Number(localStorage.getItem('billnaw_menu_version') || shopProfile?.menuVersion || 1);

        // 1. Wipe cloud server store collections if authenticated
        if (isAuthenticatedShop && typeof fetch === 'function') {
            const res = await fetch('/api/store/reset-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${activeToken}`
                },
                body: JSON.stringify({ storeCode: activeStoreCode })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (typeof showToast === 'function') {
                    showToast(errData.error || `Server rejected reset (HTTP ${res.status}).`, 'error');
                }
                return;
            }
        }

        // 2. Clear transactional, table, KOT, khata, tombstone, version & sync queue state
        if (typeof tablesInfo !== 'undefined') tablesInfo = {};
        window.tablesInfo = {};
        if (typeof currentCart !== 'undefined') currentCart = [];
        window.cart = [];
        if (typeof clearCart === 'function') { try { clearCart(); } catch (e) {} }
        if (typeof orderHistory !== 'undefined') orderHistory = [];
        window.orderHistory = [];
        if (typeof dailyExpenses !== 'undefined') dailyExpenses = [];
        window.dailyExpenses = [];
        if (typeof customersList !== 'undefined') customersList = [];
        window.customersList = [];

        [
            'billnaw_active_kots', 'billnaw_last_kot_no', 'billnaw_active_cart',
            'billnaw_offline_orders', 'cafe_khata', 'billnaw_culinary_materials',
            'billnaw_culinary_batches', 'billnaw_culinary_recipes', 'billnaw_culinary_subs',
            'billnaw_deleted_menu_ids', 'billnaw_deleted_menu_names', 'billnaw_deleted_staff_ids',
            'billnaw_menu_version', 'billnaw_menu_customized', 'billnaw_offline_sync_queue',
            'pos_order_history'
        ].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });

        if (typeof idb !== 'undefined') {
            const clearKeys = ['cafe_history', 'cafe_expenses', 'cafe_customers', 'cafe_tables', 'cafe_khata', 'cafe_unsettled_orders', 'cafe_raw_materials', 'cafe_sub_recipes'];
            await Promise.all(clearKeys.map(k => (typeof idb.clear === 'function' ? idb.clear(k).catch(() => {}) : Promise.resolve())));
            if (idb.db && idb.db.objectStoreNames) {
                ['orders', 'kot_records', 'menu_items'].forEach(storeName => {
                    if (idb.db.objectStoreNames.contains(storeName)) {
                        try {
                            const tx = idb.db.transaction(storeName, 'readwrite');
                            tx.objectStore(storeName).clear();
                        } catch (e) {}
                    }
                });
            }
        }

        if (isAuthenticatedShop) {
            // Authenticated shops: leave menu empty (NEVER reseed demo Samosa/Tea items)
            const nextVer = prevVer + 1;
            if (typeof menuItems !== 'undefined') menuItems = [];
            window.menuItems = [];
            if (typeof menuCategories !== 'undefined') menuCategories = ['All'];
            window.menuCategories = ['All'];
            if (shopProfile) shopProfile.menuVersion = nextVer;
            window.currentMenuVersion = nextVer;
            localStorage.setItem('billnaw_menu_version', String(nextVer));
            if (typeof markMenuCustomized === 'function') markMenuCustomized();
            else localStorage.setItem('billnaw_menu_customized', 'true');

            if (typeof idb !== 'undefined' && idb.set) {
                await idb.set('cafe_menu', []);
                await idb.set('cafe_categories', ['All']);
                await idb.set('cafe_tables', {});
            }

            const cleanPayload = {
                menu: [],
                categories: ['All'],
                tables: {},
                history: [],
                expenses: [],
                customers: [],
                kots: [],
                deletedMenuIds: [],
                deletedMenuNames: [],
                menuVersion: nextVer,
                updatedAt: new Date().toISOString()
            };
            if (typeof dispatchBackendStoreSync === 'function') {
                await dispatchBackendStoreSync(cleanPayload, true);
            }
            if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc && typeof getStoreDocRef === 'function') {
                const storeDocRef = getStoreDocRef();
                if (storeDocRef) {
                    await window.firestoreSetDoc(storeDocRef, cleanPayload, { merge: true }).catch(() => {});
                }
                if (activeStoreCode && typeof getStoreCollectionName === 'function') {
                    const rootCol = getStoreCollectionName(activeStoreCode);
                    const metaDocRef = window.firestoreDoc(window.firestoreDB, rootCol, activeStoreCode, 'menu_meta', 'version');
                    if (metaDocRef) {
                        await window.firestoreSetDoc(metaDocRef, {
                            version: nextVer,
                            itemCount: 0,
                            updatedAt: new Date().toISOString()
                        }, { merge: true }).catch(() => {});
                    }
                }
            }
        } else {
            // Unauthenticated / demo mode: reset to clean demo items
            const cleanDemoItems = [
                { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
                { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
                { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, /* baseline price: 150 */ stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
                { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
            ];
            const cleanCats = ["All", "Snacks", "Beverages", "Main Course"];
            if (typeof menuItems !== 'undefined') menuItems = cleanDemoItems;
            window.menuItems = cleanDemoItems;
            if (typeof menuCategories !== 'undefined') menuCategories = cleanCats;
            window.menuCategories = cleanCats;
            if (typeof idb !== 'undefined' && idb.set) {
                await idb.set('cafe_menu', cleanDemoItems);
                await idb.set('cafe_categories', cleanCats);
                await idb.set('cafe_tables', {});
            }
        }

        if (typeof renderMenuUI === 'function') renderMenuUI();
        if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
        if (typeof showToast === 'function') {
            showToast('All store data deleted from local terminal and cloud server.', 'success');
        }
        setTimeout(() => location.reload(), 500);
    } catch (err) {
        console.error('Clear all data error:', err);
        showToast('Reset failed: ' + err.message, 'error');
    }
}
window.confirmClearAllData = confirmClearAllData;

function renderSettingsProfileHeader() {
    const avatar = document.getElementById('settingsStoreAvatar');
    const nameEl = document.getElementById('settingsStoreName');
    const phoneEl = document.getElementById('settingsStorePhone');
    if (avatar && window.shopProfile) {
        avatar.innerText = (window.shopProfile.name ? window.shopProfile.name.charAt(0) : 'B').toUpperCase();
    }
    if (nameEl && window.shopProfile) {
        nameEl.innerText = window.shopProfile.name || 'Billnaw Cafe';
    }
    if (phoneEl && window.shopProfile) {
        phoneEl.innerText = `${window.shopProfile.phone || '+91 98765 43210'} • Active Terminal`;
    }
}
window.renderSettingsProfileHeader = renderSettingsProfileHeader;

// ============================================================
// 🚀 ONBOARDING: GOAL GRADIENT 2-STEP SETUP WIZARD
// ============================================================
let onboardUploadedLogo = '';

async function handleOnboardLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        if (typeof resizeAndCompressLogo === 'function') {
            const compressed = await resizeAndCompressLogo(file, 154, 35840);
            if (compressed) {
                onboardUploadedLogo = compressed;
                const statusEl = document.getElementById('onboardLogoStatus');
                if (statusEl) statusEl.innerText = '✅ Logo selected & optimized (< 35 KB)!';
                return;
            }
        }
    } catch (err) {
        console.warn('Onboarding logo compression error:', err);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        onboardUploadedLogo = e.target.result;
        const statusEl = document.getElementById('onboardLogoStatus');
        if (statusEl) statusEl.innerText = '✅ Logo selected!';
    };
    reader.readAsDataURL(file);
}
window.handleOnboardLogoUpload = handleOnboardLogoUpload;

function activateSoftware() {
    const keyInput = document.getElementById('activationKeyInput');
    const enteredKey = keyInput ? keyInput.value.trim() : '';
    
    // Dismiss activation overlay
    const actOverlay = document.getElementById('activationOverlay');
    if (actOverlay) actOverlay.style.display = 'none';

    try {
        localStorage.setItem('billnaw_license_active', 'true');
        if (enteredKey) localStorage.setItem('billnaw_license_key', enteredKey);
    } catch(e) {}

    showToast("🚀 Step 1: Terminal Connected ✓ (20% Completed)");

    // Launch Step 2: Goal Gradient Quick Setup Wizard
    const wizardModal = document.getElementById('onboardingWizardModal');
    if (wizardModal) {
        const nameInput = document.getElementById('onboardStoreName');
        const upiInput = document.getElementById('onboardUpiId');
        if (nameInput) nameInput.value = shopProfile.shopName || 'billnaw';
        if (upiInput) upiInput.value = shopProfile.upiId || '';
        wizardModal.style.display = 'flex';
    }
}
window.activateSoftware = activateSoftware;

function skipActivationSoftware() {
    const actOverlay = document.getElementById('activationOverlay');
    if (actOverlay) actOverlay.style.display = 'none';
    showToast("⚡ Demo POS Session Active");
}
window.skipActivationSoftware = skipActivationSoftware;

function saveOnboardingProfile() {
    const nameInput = document.getElementById('onboardStoreName');
    const upiInput = document.getElementById('onboardUpiId');
    if (nameInput && nameInput.value.trim()) {
        shopProfile.shopName = nameInput.value.trim();
        const topbarName = document.getElementById('topbarShopName');
        if (topbarName) topbarName.innerText = shopProfile.shopName;
    }
    if (upiInput && upiInput.value.trim()) {
        shopProfile.upiId = upiInput.value.trim();
        shopProfile.showQr = true;
    }
    if (onboardUploadedLogo) {
        shopProfile.logo = onboardUploadedLogo;
    }
    persistProfile();

    const wizardModal = document.getElementById('onboardingWizardModal');
    if (wizardModal) wizardModal.style.display = 'none';

    showToast("🎉 Store Setup Complete! Ready for Rush Hour.");
    if (typeof switchTab === 'function') switchTab('pos');
}
window.saveOnboardingProfile = saveOnboardingProfile;

function skipOnboardingWizard() {
    const wizardModal = document.getElementById('onboardingWizardModal');
    if (wizardModal) wizardModal.style.display = 'none';
    showToast("Ready to take orders on POS.");
}
window.skipOnboardingWizard = skipOnboardingWizard;

// ============================================================
// 📱 AUTHORIZED DEVICES HUB & 1-CLICK APPROVAL / REVOCATION (F7 & F8)
// ============================================================

function openAuthorizedDevicesModal(targetDeviceId = null) {
    if (checkFloorServerModalBlock('authorizedDevicesModal')) return;
    const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
    if (!active || !active.role) {
        if (typeof showToast === 'function') showToast('Permission denied: Admin access required to manage devices.', 'error');
        return;
    }
    const canManage = (typeof hasPermission === 'function' && hasPermission(active, 'can_manage_devices')) ||
        (typeof normalizeRole === 'function' ? normalizeRole(active.role) === 'Admin' : String(active.role).toLowerCase() === 'admin');
    if (!canManage) {
        showToast('Permission denied: Admin access required to manage devices.');
        return;
    }
    const devices = window.authorizedDevices || [];
    const pendingDevices = devices.filter(d => d.status === 'PENDING');
    if (targetDeviceId && typeof openDeviceApprovalModal === 'function') {
        openDeviceApprovalModal(targetDeviceId);
        return;
    }
    if (pendingDevices.length === 1 && typeof openDeviceApprovalModal === 'function') {
        openDeviceApprovalModal(pendingDevices[0].deviceId || pendingDevices[0].id);
        return;
    }
    const modal = document.getElementById('authorizedDevicesModal');
    if (modal) {
        modal.style.display = 'flex';
        renderAuthorizedDevicesHub();
    }
}
window.openAuthorizedDevicesModal = openAuthorizedDevicesModal;

function closeAuthorizedDevicesModal() {
    const modal = document.getElementById('authorizedDevicesModal');
    if (modal) modal.style.display = 'none';
}
window.closeAuthorizedDevicesModal = closeAuthorizedDevicesModal;

function renderAuthorizedDevicesHub() {
    const pendingListEl = document.getElementById('pendingDevicesList');
    const authListEl = document.getElementById('authorizedDevicesList');
    const pendingCountEl = document.getElementById('pendingDevicesCount');
    const authCountEl = document.getElementById('authorizedDevicesCount');
    const pendingBadge = document.getElementById('pendingDeviceCountBadge');
    const staffBadge = document.getElementById('staffModalPendingBadge');

    const devices = window.authorizedDevices || [];
    const pendingDevices = devices.filter(d => d.status === 'PENDING');
    const authorizedDevices = devices.filter(d => d.status === 'AUTHORIZED' || d.isMaster === true);

    if (pendingCountEl) pendingCountEl.innerText = pendingDevices.length;
    if (authCountEl) authCountEl.innerText = authorizedDevices.length;

    if (pendingBadge) {
        if (pendingDevices.length > 0) {
            pendingBadge.innerText = `${pendingDevices.length} Pending`;
            pendingBadge.style.display = 'inline-block';
        } else {
            pendingBadge.style.display = 'none';
        }
    }
    if (staffBadge) {
        staffBadge.style.display = pendingDevices.length > 0 ? 'inline-block' : 'none';
    }

    // Live In-App Notification Banner Update
    try {
        const banner = document.getElementById('adminPairingNotificationBanner');
        const bannerText = document.getElementById('adminPairingBannerText');
        if (banner && bannerText) {
            const isMaster = (typeof isMasterTerminal === 'function') ? isMasterTerminal() : (localStorage.getItem('billnaw_is_master') === 'true');
            if (isMaster && pendingDevices.length > 0) {
                banner.style.display = 'flex';
                bannerText.innerText = `${pendingDevices.length} device${pendingDevices.length === 1 ? '' : 's'} requesting pairing authorization`;
            } else {
                banner.style.display = 'none';
            }
        }
    } catch (bannerErr) {}

    // 1. Render Pending Devices
    if (pendingListEl) {
        if (pendingDevices.length === 0) {
            pendingListEl.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.02); border: 1px dashed var(--border); border-radius: 12px; padding: 18px; text-align: center; color: var(--text-muted); font-size: 12px;">
                    No pending pairing requests. New secondary terminals will appear here automatically.
                </div>
            `;
        } else {
            pendingListEl.innerHTML = pendingDevices.map(dev => {
                const defaultName = `Counter ${authorizedDevices.length + 1}`;
                const safeDevId = _settingsEsc(String(dev.deviceId || ''));
                const safePairCode = _settingsEsc(String(dev.pairingCode || '------'));
                return `
                    <div class="pending-device-card" style="background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 12px; padding: 14px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong style="font-size: 14px; color: #92400E; font-family: monospace;">${safeDevId}</strong>
                                    <span style="font-size: 11px; font-weight: 700; background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 6px;">Pairing Code: ${safePairCode}</span>
                                </div>
                                <p style="font-size: 11px; color: #B45309; margin: 4px 0 0 0;">Requested: ${_settingsEsc(new Date(dev.registeredAt || dev.lastSeenAt || Date.now()).toLocaleTimeString())}</p>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: center; margin-top: 10px;">
                            <div>
                                <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400E; margin-bottom: 4px;">Station Name</label>
                                <input type="text" id="devName_${safeDevId}" value="${_settingsEsc(defaultName)}" style="width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 600; border: 1px solid #FCD34D; border-radius: 8px; background: #FFFFFF;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400E; margin-bottom: 4px;">Station Profile</label>
                                <select id="devProfile_${safeDevId}" style="width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 600; border: 1px solid #FCD34D; border-radius: 8px; background: #FFFFFF;">
                                    <option value="BILLING_COUNTER" selected>Billing Counter</option>
                                    <option value="KDS">Kitchen Display (KDS)</option>
                                    <option value="WAITER_MOBILE">Waiter Mobile</option>
                                    <option value="GENERAL_STATION">General Station</option>
                                    <option value="ADMIN">Admin Terminal</option>
                                </select>
                            </div>
                            <div style="display: flex; gap: 6px; align-self: flex-end;">
                                <button type="button" class="btn btn-success js-approve-device-btn" data-device-id="${safeDevId}" style="padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Approve</span>
                                </button>
                                <button type="button" class="btn btn-outline js-reject-device-btn" data-device-id="${safeDevId}" style="padding: 7px 10px; font-size: 12px; border-radius: 8px; color: var(--danger); border-color: rgba(220, 38, 38, 0.3);" title="Reject Pairing">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            if (typeof pendingListEl.querySelectorAll === 'function') {
                pendingListEl.querySelectorAll('.js-approve-device-btn').forEach(btn => {
                    btn.addEventListener('click', () => openDeviceApprovalModal(btn.getAttribute('data-device-id')));
                });
                pendingListEl.querySelectorAll('.js-reject-device-btn').forEach(btn => {
                    btn.addEventListener('click', () => rejectPendingDevice(btn.getAttribute('data-device-id')));
                });
            }
        }
    }

    // 2. Render Authorized Devices
    if (authListEl) {
        if (authorizedDevices.length === 0) {
            authListEl.innerHTML = `
                <div style="background: rgba(0, 0, 0, 0.02); border: 1px dashed var(--border); border-radius: 12px; padding: 18px; text-align: center; color: var(--text-muted); font-size: 12px;">
                    No authorized terminals registered yet.
                </div>
            `;
        } else {
            authListEl.innerHTML = authorizedDevices.map(dev => {
                const isMaster = Boolean(dev.isMaster);
                const isRevoked = (dev.status === 'REVOKED');
                const profileBadge = dev.stationProfile || 'GENERAL_STATION';
                const nameDisplay = _settingsEsc(dev.deviceName || 'Terminal');
                const safeDevId = _settingsEsc(String(dev.deviceId || ''));

                // Cross-reference with active staff sessions to display current staff
                const sessions = (typeof window !== 'undefined' && Array.isArray(window.activeStaffSessions)) ? window.activeStaffSessions : [];
                const activeSessionForDev = sessions.find(s => (s.deviceId === dev.deviceId || s.deviceId === dev.id) && s.status !== 'REVOKED');
                const staffInfoStr = activeSessionForDev ? ` • Staff: ${activeSessionForDev.staffName} (${activeSessionForDev.staffRole || 'Staff'})` : '';

                // Activity / Last Seen Telemetry
                const now = Date.now();
                const lastSeenMs = dev.lastSeenAt ? new Date(dev.lastSeenAt).getTime() : 0;
                const diffM = lastSeenMs ? Math.floor((now - lastSeenMs) / 60000) : 0;
                const isOnline = !isRevoked && (isMaster || (lastSeenMs && (now - lastSeenMs) <= 15 * 60 * 1000));

                let telemetryText = '';
                if (isRevoked) {
                    telemetryText = `Revoked ${dev.revokedAt ? new Date(dev.revokedAt).toLocaleTimeString() : 'by Admin'}`;
                } else if (isOnline) {
                    telemetryText = '🟢 Active now';
                } else if (lastSeenMs) {
                    telemetryText = diffM < 60 ? `⚪ Inactive for ${Math.max(1, diffM)}m` : `⚪ Inactive for ${Math.floor(diffM / 60)}h`;
                } else {
                    telemetryText = '⚪ Offline';
                }

                return `
                    <div class="auth-device-card" style="background: var(--bg-surface); border: 1px solid ${isRevoked ? '#FECACA' : 'var(--border)'}; border-radius: 12px; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 40px; height: 40px; border-radius: 10px; background: ${isMaster ? 'rgba(20, 56, 50, 0.1)' : (isRevoked ? 'rgba(220, 38, 38, 0.1)' : 'rgba(37, 99, 235, 0.1)')}; color: ${isMaster ? 'var(--primary)' : (isRevoked ? 'var(--danger)' : '#2563EB')}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                    <line x1="8" y1="21" x2="16" y2="21"></line>
                                    <line x1="12" y1="17" x2="12" y2="21"></line>
                                </svg>
                            </div>
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong style="font-size: 14px; color: var(--text-dark);">${nameDisplay}</strong>
                                    ${isMaster ? '<span style="font-size: 10px; font-weight: 700; background: #DCFCE7; color: #15803D; padding: 2px 7px; border-radius: 10px;">Master Terminal</span>' : (isRevoked ? '<span style="font-size: 10px; font-weight: 700; background: #FEE2E2; color: #B91C1C; padding: 2px 7px; border-radius: 10px;">REVOKED</span>' : `<span style="font-size: 10px; font-weight: 700; background: #EFF6FF; color: #1D4ED8; padding: 2px 7px; border-radius: 10px;">${_settingsEsc(profileBadge)}</span>`)}
                                </div>
                                <p style="font-size: 11px; color: var(--text-muted); margin: 3px 0 0 0; font-family: monospace;">ID: ${safeDevId} • ${_settingsEsc(telemetryText)}${_settingsEsc(staffInfoStr)}</p>
                            </div>
                        </div>
                        <div>
                            ${isMaster ? '' : (isRevoked ? `
                                <button type="button" class="btn btn-outline js-resume-device-btn" data-device-id="${safeDevId}" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; color: #16A34A; border-color: rgba(22, 163, 74, 0.3); display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Resume</span>
                                </button>
                            ` : `
                                <button type="button" class="btn btn-outline js-revoke-device-btn" data-device-id="${safeDevId}" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; color: var(--danger); border-color: rgba(220, 38, 38, 0.3); display: inline-flex; align-items: center; gap: 6px;">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                    <span>Revoke</span>
                                </button>
                            `)}
                        </div>
                    </div>
                `;
            }).join('');
            if (typeof authListEl.querySelectorAll === 'function') {
                authListEl.querySelectorAll('.js-resume-device-btn').forEach(btn => {
                    btn.addEventListener('click', () => resumeAuthorizedDevice(btn.getAttribute('data-device-id')));
                });
                authListEl.querySelectorAll('.js-revoke-device-btn').forEach(btn => {
                    btn.addEventListener('click', () => revokeAuthorizedDevice(btn.getAttribute('data-device-id')));
                });
            }
        }
    }
}
window.renderAuthorizedDevicesHub = renderAuthorizedDevicesHub;

function openDeviceApprovalModal(deviceId) {
    if (!_requireAdminAccess('approve devices', 'deviceApprovalPinModal')) return;
    if (!deviceId) return;
    const dev = (window.authorizedDevices || []).find(d => d.deviceId === deviceId || d.id === deviceId);
    const modal = document.getElementById('deviceApprovalPinModal');
    if (!modal) return;

    const targetInput = document.getElementById('approvalTargetDeviceId');
    if (targetInput) targetInput.value = deviceId;

    const idDisplay = document.getElementById('approvalDeviceIdDisplay');
    if (idDisplay) idDisplay.innerText = deviceId;

    const pairingInput = document.getElementById('approvalPairingCodeInput');
    if (pairingInput) {
        pairingInput.value = dev?.pairingCode || '';
        setTimeout(() => {
            if (pairingInput.value) {
                document.getElementById('approvalAdminPinInput')?.focus();
            } else {
                pairingInput.focus();
            }
        }, 80);
    }

    const profileSelect = document.getElementById('approvalStationProfileSelect');
    const hubProfile = document.getElementById(`devProfile_${deviceId}`)?.value;
    if (profileSelect) profileSelect.value = hubProfile || dev?.stationProfile || 'BILLING_COUNTER';

    const nameInput = document.getElementById('approvalStationNameInput');
    const hubName = document.getElementById(`devName_${deviceId}`)?.value;
    const defaultName = dev?.deviceName || `Counter ${(window.authorizedDevices || []).length + 1}`;
    if (nameInput) nameInput.value = hubName || defaultName;

    const pinInput = document.getElementById('approvalAdminPinInput');
    if (pinInput) pinInput.value = '';

    const codeFeedback = document.getElementById('approvalPairingCodeFeedback');
    if (codeFeedback) codeFeedback.innerText = '';
    const pinFeedback = document.getElementById('approvalAdminPinFeedback');
    if (pinFeedback) pinFeedback.innerText = '';

    modal.style.display = 'flex';
}
window.openDeviceApprovalModal = openDeviceApprovalModal;

function closeDeviceApprovalModal() {
    const modal = document.getElementById('deviceApprovalPinModal');
    if (modal) modal.style.display = 'none';
}
window.closeDeviceApprovalModal = closeDeviceApprovalModal;

async function confirmApproveDevicePairing(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!_requireAdminAccess('approve device pairings', 'deviceApprovalPinModal')) return;

    const targetDeviceId = document.getElementById('approvalTargetDeviceId')?.value;
    const enteredPairingCode = document.getElementById('approvalPairingCodeInput')?.value.trim();
    const selectedProfile = document.getElementById('approvalStationProfileSelect')?.value || 'BILLING_COUNTER';
    const enteredName = document.getElementById('approvalStationNameInput')?.value.trim();
    const enteredAdminPin = document.getElementById('approvalAdminPinInput')?.value.trim();

    const targetDev = (window.authorizedDevices || []).find(d => d.deviceId === targetDeviceId || d.id === targetDeviceId);
    if (!targetDev) {
        if (typeof showToast === 'function') showToast('Device request not found.', 'error');
        return;
    }

    // 1. Verify Pairing Code
    const expectedCode = String(targetDev.pairingCode || '').trim();
    if (!enteredPairingCode || (expectedCode && enteredPairingCode !== expectedCode)) {
        const fb = document.getElementById('approvalPairingCodeFeedback');
        if (fb) {
            fb.innerText = 'Pairing code does not match code shown on device';
            fb.className = 'validation-feedback error';
        }
        if (typeof showToast === 'function') showToast('Incorrect pairing code.', 'error');
        return;
    }

    // 2. Verify Master Admin PIN (do not fall back to '1234' when a custom Admin PIN hash exists)
    const hasStoredAdminPin = Boolean(
        shopProfile?.adminPinHash ||
        localStorage.getItem('billnaw_admin_pin_hash') ||
        (Array.isArray(staffList) && staffList.some(s => s && s.role === 'Admin' && (s.pin_hash || s.pinHash || s.pin)))
    );
    let isPinValid = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(enteredAdminPin)
        : ((typeof hashString === 'function' && (shopProfile?.adminPinHash || localStorage.getItem('billnaw_admin_pin_hash')) && hashString(enteredAdminPin) === (shopProfile?.adminPinHash || localStorage.getItem('billnaw_admin_pin_hash'))) || (!hasStoredAdminPin && enteredAdminPin === '1234'));
    if (!isPinValid && Array.isArray(staffList)) {
        for (const s of staffList) {
            if (s.role === 'Admin') {
                if (typeof verifyStaffPin === 'function') {
                    if (await verifyStaffPin(s, enteredAdminPin)) {
                        isPinValid = true;
                        break;
                    }
                } else if (s.pin === enteredAdminPin) {
                    isPinValid = true;
                    break;
                }
            }
        }
    }

    if (!isPinValid) {
        const fb = document.getElementById('approvalAdminPinFeedback');
        if (fb) {
            fb.innerText = 'Invalid Admin PIN. Approval rejected.';
            fb.className = 'validation-feedback error';
        }
        if (typeof showToast === 'function') showToast('Invalid Admin PIN.', 'error');
        return;
    }

    closeDeviceApprovalModal();
    await approveDevicePairing(targetDeviceId, {
        stationName: enteredName,
        stationProfile: selectedProfile
    });
}
window.confirmApproveDevicePairing = confirmApproveDevicePairing;

async function approveDevicePairing(deviceId, options = {}) {
    if (!_requireAdminAccess('approve devices', 'authorizedDevicesModal')) return;
    if (!deviceId) return;
    const nameInput = document.getElementById(`devName_${deviceId}`);
    const profileSelect = document.getElementById(`devProfile_${deviceId}`);

    let stationName = options.stationName || (nameInput ? nameInput.value : '');
    stationName = (stationName || '').trim().slice(0, 50);
    if (!stationName) stationName = 'Terminal';
    stationName = typeof escapeHtml === 'function' ? escapeHtml(stationName) : stationName;

    const validProfiles = ['BILLING_COUNTER', 'KDS', 'WAITER_MOBILE', 'GENERAL_STATION', 'ADMIN'];
    let stationProfile = options.stationProfile || (profileSelect ? profileSelect.value : 'BILLING_COUNTER');
    if (!validProfiles.includes(stationProfile)) stationProfile = 'GENERAL_STATION';

    const updates = {
        deviceId: deviceId,
        deviceName: stationName,
        stationProfile: stationProfile,
        status: 'AUTHORIZED',
        approvedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
    };

    // 1. Optimistic local update
    if (window.authorizedDevices) {
        const idx = window.authorizedDevices.findIndex(d => d.deviceId === deviceId || d.id === deviceId);
        if (idx >= 0) {
            window.authorizedDevices[idx] = { ...window.authorizedDevices[idx], ...updates };
        }
    }
    renderAuthorizedDevicesHub();

    // 2. Cloud update to Firestore
    try {
        if (typeof setTenantDevice === 'function') {
            await setTenantDevice(deviceId, updates);
        } else if (window.firestoreDB && window.firestoreSetDoc && typeof getStoreSubdocRef === 'function') {
            const devRef = getStoreSubdocRef('devices', deviceId);
            if (devRef) await window.firestoreSetDoc(devRef, updates, { merge: true });
        }
        if (typeof showToast === 'function') showToast(`Terminal "${stationName}" approved successfully.`, 'success');
    } catch (err) {
        console.error('Error approving device:', err);
        if (typeof showToast === 'function') showToast('Failed to sync device approval to cloud: ' + err.message, 'error');
    }
}
window.approveDevicePairing = approveDevicePairing;

async function revokeAuthorizedDevice(deviceId) {
    if (!_requireAdminAccess('revoke devices', 'authorizedDevicesModal')) return;
    if (!deviceId) return;

    // Safety: Master cannot be revoked
    const dev = (window.authorizedDevices || []).find(d => d.deviceId === deviceId || d.id === deviceId);
    if (dev && dev.isMaster) {
        if (typeof showToast === 'function') showToast('Master Admin Terminal cannot revoke itself.');
        return;
    }

    if (typeof confirm === 'function' && !confirm(`Are you sure you want to revoke access for terminal "${dev ? dev.deviceName : deviceId}"? This will immediately disconnect the device and wipe all its local data.`)) {
        return;
    }

    const updates = {
        status: 'REVOKED',
        revokedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
    };

    // 1. Optimistic local update
    if (window.authorizedDevices) {
        const idx = window.authorizedDevices.findIndex(d => d.deviceId === deviceId || d.id === deviceId);
        if (idx >= 0) {
            window.authorizedDevices[idx] = { ...window.authorizedDevices[idx], ...updates };
        }
    }
    renderAuthorizedDevicesHub();

    // 2. Cloud update to Firestore
    try {
        if (typeof setTenantDevice === 'function') {
            await setTenantDevice(deviceId, updates);
        } else if (window.firestoreDB && window.firestoreSetDoc && typeof getStoreSubdocRef === 'function') {
            const devRef = getStoreSubdocRef('devices', deviceId);
            if (devRef) await window.firestoreSetDoc(devRef, updates, { merge: true });
        }
        if (typeof showToast === 'function') showToast('Terminal access revoked.');
    } catch (err) {
        console.error('Error revoking device:', err);
        if (typeof showToast === 'function') showToast('Failed to revoke device: ' + err.message);
    }
}
window.revokeAuthorizedDevice = revokeAuthorizedDevice;

async function resumeAuthorizedDevice(deviceId) {
    if (!_requireAdminAccess('resume devices', 'authorizedDevicesModal')) return;
    if (!deviceId) return;
    const dev = (window.authorizedDevices || []).find(d => d.deviceId === deviceId || d.id === deviceId);

    const updates = {
        status: 'AUTHORIZED',
        resumedAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString()
    };

    if (window.authorizedDevices) {
        const idx = window.authorizedDevices.findIndex(d => d.deviceId === deviceId || d.id === deviceId);
        if (idx >= 0) {
            window.authorizedDevices[idx] = { ...window.authorizedDevices[idx], ...updates };
        }
    }
    renderAuthorizedDevicesHub();

    try {
        if (typeof setTenantDevice === 'function') {
            await setTenantDevice(deviceId, updates);
        } else if (window.firestoreDB && window.firestoreSetDoc && typeof getStoreSubdocRef === 'function') {
            const devRef = getStoreSubdocRef('devices', deviceId);
            if (devRef) await window.firestoreSetDoc(devRef, updates, { merge: true });
        }
        if (typeof showToast === 'function') showToast(`Terminal "${dev ? dev.deviceName : deviceId}" access resumed!`, 'success');
    } catch (err) {
        console.error('Error resuming device:', err);
        if (typeof showToast === 'function') showToast('Failed to resume device: ' + err.message, 'error');
    }
}
window.resumeAuthorizedDevice = resumeAuthorizedDevice;

async function rejectPendingDevice(deviceId) {
    if (!_requireAdminAccess('reject pending devices', 'authorizedDevicesModal')) return;
    if (!deviceId) return;
    const updates = { status: 'REVOKED', revokedAt: new Date().toISOString() };
    if (window.authorizedDevices) {
        window.authorizedDevices = window.authorizedDevices.filter(d => d.deviceId !== deviceId);
    }
    renderAuthorizedDevicesHub();
    try {
        if (typeof setTenantDevice === 'function') {
            await setTenantDevice(deviceId, updates);
        } else if (window.firestoreDB && window.firestoreSetDoc && typeof getStoreSubdocRef === 'function') {
            const devRef = getStoreSubdocRef('devices', deviceId);
            if (devRef) await window.firestoreSetDoc(devRef, updates, { merge: true });
        }
    } catch (e) {}
}
window.rejectPendingDevice = rejectPendingDevice;

// ============================================================
// 🏢 STORE CONNECTION, STATEMENTS & SYSTEM UTILITIES
// ============================================================

function openSwitchStoreModal() {
    if (!_requireAdminAccess('switch stores', 'switchStoreModal')) return;
    _sanitizeStaticDbPlaceholders();
    const modal = document.getElementById('switchStoreModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('targetStoreCodeInput');
        if (input) {
            input.value = (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || localStorage.getItem('bongbhoj_client_id') || '';
            setTimeout(() => input.focus(), 60);
        }
    }
}
window.openSwitchStoreModal = openSwitchStoreModal;

async function switchActiveShopCloudStore(newCode) {
    const cleanCode = String(newCode || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(cleanCode)) {
        if (typeof showToast === 'function') showToast('Invalid Shop Store Code format (3-64 alphanumeric, _ or -).', 'error');
        return false;
    }

    if (!_requireAdminAccess('switch stores', 'switchStoreModal')) return false;

    const activeToken = localStorage.getItem('billnaw_auth_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('billnaw_auth_token') : null);
    const authMode = localStorage.getItem('billnaw_auth_mode');
    if (!activeToken || authMode !== 'authenticated') {
        if (typeof showToast === 'function') showToast('Authentication required: Please sign in before switching cloud stores.', 'error');
        if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
        return false;
    }

    const currentCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || localStorage.getItem('billnaw_store_code') || '';
    if (currentCode && currentCode.toUpperCase() === cleanCode) {
        if (typeof showToast === 'function') showToast(`Already connected to store: ${cleanCode}`, 'info');
        return true;
    }

    // Verify current token is authorized by the backend for target storeCode
    if (typeof fetch === 'function') {
        try {
            const res = await fetch(`/api/sync/store-data?storeCode=${encodeURIComponent(cleanCode)}`, {
                headers: { 'Authorization': `Bearer ${activeToken}`, 'x-shop-id': cleanCode }
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (typeof showToast === 'function') {
                    showToast(errData.error || `Not authorized for store ${cleanCode}. Please log out and sign in with that store's account.`, 'error');
                }
                return false;
            }
        } catch (netErr) {
            if (typeof showToast === 'function') showToast('Cannot verify store access while offline.', 'error');
            return false;
        }
    }

    // Authorized switch: stop listeners/heartbeats and wipe previous tenant data (R1.4)
    const prevEmail = localStorage.getItem('billnaw_auth_email') || '';
    const prevIsMaster = localStorage.getItem('billnaw_is_master') || 'false';
    if (typeof window.detachFirestoreListener === 'function') try { window.detachFirestoreListener(); } catch (e) {}
    if (typeof window.stopBackgroundSync === 'function') try { window.stopBackgroundSync(); } catch (e) {}
    if (typeof window.stopSessionHeartbeat === 'function') try { window.stopSessionHeartbeat(); } catch (e) {}
    if (typeof window.stopStaffPresenceHeartbeat === 'function') try { window.stopStaffPresenceHeartbeat(); } catch (e) {}

    if (typeof clearAllTenantLocalData === 'function') {
        await clearAllTenantLocalData();
    }

    // Re-apply only verified auth & target store identity
    localStorage.setItem('billnaw_auth_mode', 'authenticated');
    localStorage.setItem('billnaw_auth_token', activeToken);
    if (prevEmail) {
        localStorage.setItem('billnaw_auth_email', prevEmail);
        localStorage.setItem('billnaw_last_device_email', prevEmail);
    }
    localStorage.setItem('billnaw_is_master', prevIsMaster);
    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
    localStorage.setItem('billnaw_store_code', cleanCode);
    localStorage.setItem('billnaw_last_store_code', cleanCode);
    localStorage.setItem('bongbhoj_client_id', cleanCode);
    if (typeof shopProfile !== 'undefined') {
        shopProfile = { name: '', storeCode: cleanCode };
        window.shopProfile = shopProfile;
    }

    if (typeof showToast === 'function') showToast(`Connected to store: ${cleanCode}. Syncing...`, 'success');
    setTimeout(() => window.location.reload(), 300);
    return true;
}
window.switchActiveShopCloudStore = switchActiveShopCloudStore;

async function confirmSwitchShopCode() {
    if (!_requireAdminAccess('switch stores', 'switchStoreModal')) return;
    const input = document.getElementById('targetStoreCodeInput');
    const newCode = (input ? input.value : '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{3,64}$/.test(newCode)) {
        if (typeof showToast === 'function') showToast('Please enter a valid Shop Store Code (3-64 alphanumeric, _ or -).', 'error');
        return;
    }
    const modal = document.getElementById('switchStoreModal');
    if (modal) modal.style.display = 'none';
    await switchActiveShopCloudStore(newCode);
}
window.confirmSwitchShopCode = confirmSwitchShopCode;

function openStatementModal() {
    if (!_requireAdminAccess('view financial statements', 'statementModal')) return;
    const modal = document.getElementById('statementModal');
    if (modal) {
        modal.style.display = 'flex';
        if (typeof renderStatements === 'function') renderStatements();
    }
}
window.openStatementModal = openStatementModal;

function closeStatementModal() {
    const modal = document.getElementById('statementModal');
    if (modal) modal.style.display = 'none';
}
window.closeStatementModal = closeStatementModal;

async function forceCheckAppUpdate() {
    if (typeof showToast === 'function') showToast('Checking for updates & clearing cache...', 'info');
    try {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        if (navigator.serviceWorker) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
                await reg.update();
                if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
        }
    } catch (e) {
        console.warn('forceCheckAppUpdate warning:', e);
    }
    if (typeof showToast === 'function') showToast('App cache purged! Reloading latest version...', 'success');
    setTimeout(() => {
        window.location.reload(true);
    }, 300);
}
window.forceCheckAppUpdate = forceCheckAppUpdate;

function openRestockExpenseModal(matId = null) {
    if (window.culinaryInventory && typeof window.culinaryInventory.openRestockModal === 'function') {
        window.culinaryInventory.openRestockModal(matId);
    } else if (typeof openRestockModal === 'function') {
        openRestockModal(matId);
    } else if (typeof showToast === 'function') {
        showToast('Opening restock...', 'info');
    }
}
window.openRestockExpenseModal = openRestockExpenseModal;

function closeInventoryHubSubView() {
    const el = document.getElementById('inventoryDetailedSubView');
    if (el) el.style.display = 'none';
}
window.closeInventoryHubSubView = closeInventoryHubSubView;
