// ============================================================
// ⚙️ JS/SETTINGS.JS - Shop Profile, Backup/Restore, Settings & Quota
// ============================================================

function updateProfileVisuals() {
    const currentName = shopProfile.name || "billnaw";
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
        if (shopProfile.logo) {
            settingsStoreAvatar.innerHTML = `<img src="${shopProfile.logo}" alt="Logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
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

function loadLogo(event) { 
    const file = event.target.files[0]; 
    if (!file) return;
    const reader = new FileReader(); 
    reader.onload = (e) => { 
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_DIM = 250; let w = img.width, h = img.height;
            if (w > h && w > MAX_DIM) { h *= MAX_DIM / w; w = MAX_DIM; } else if (h > MAX_DIM) { w *= MAX_DIM / h; h = MAX_DIM; }
            canvas.width = Math.round(w); canvas.height = Math.round(h);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            shopProfile.logo = canvas.toDataURL('image/jpeg', 0.85); 
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

async function refreshAiQuotaDisplay() {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    try {
        const res = await fetch(`/api/ai/quota?clientId=${encodeURIComponent(myClientID || 'BONGBHOJ-TERMINAL')}`);
        if (!res.ok) return;
        const data = await res.json();
        
        const badge = document.getElementById('aiQuotaBadge');
        const cycle = document.getElementById('aiQuotaCycle');
        const used = document.getElementById('aiQuotaUsed');
        const limit = document.getElementById('aiQuotaLimit');
        const keyType = document.getElementById('aiQuotaKeyType');

        if (badge) badge.innerText = `${data.remaining}/${data.limit} SCANS LEFT`;
        if (cycle) cycle.innerText = data.month;
        if (used) used.innerText = data.used;
        if (limit) limit.innerText = data.limit;
        if (keyType) {
            keyType.innerText = data.hasCustomKey ? `Dedicated Key (${data.keyMasked})` : "Global Server Key (Default)";
            keyType.style.color = data.hasCustomKey ? "var(--success)" : "var(--primary)";
        }
    } catch (e) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
        console.warn("Could not fetch AI quota status:", e.message);
    }
}
window.refreshAiQuotaDisplay = refreshAiQuotaDisplay;

async function openClientQuotaModal() {
    const modal = document.getElementById('clientQuotaModal');
    if (!modal) return;
    
    const quotaTargetClientId = document.getElementById('quotaTargetClientId');
    if (quotaTargetClientId) quotaTargetClientId.value = myClientID || 'BONGBHOJ-TERMINAL';
    
    const quotaMonthlyLimitInput = document.getElementById('quotaMonthlyLimitInput');
    if (quotaMonthlyLimitInput) quotaMonthlyLimitInput.value = 10;
    
    const quotaCurrentUsageDisplay = document.getElementById('quotaCurrentUsageDisplay');
    if (quotaCurrentUsageDisplay) quotaCurrentUsageDisplay.value = 'Loading...';
    
    const quotaRemainingInfo = document.getElementById('quotaRemainingInfo');
    if (quotaRemainingInfo) quotaRemainingInfo.innerText = '';
    
    const quotaCustomKeyInput = document.getElementById('quotaCustomKeyInput');
    if (quotaCustomKeyInput) quotaCustomKeyInput.value = '';

    modal.style.display = 'flex';

    try {
        const res = await fetch(`/api/ai/quota?clientId=${encodeURIComponent(myClientID || 'BONGBHOJ-TERMINAL')}`);
        if (res.ok) {
            const data = await res.json();
            if (quotaMonthlyLimitInput) quotaMonthlyLimitInput.value = data.limit;
            if (quotaCurrentUsageDisplay) quotaCurrentUsageDisplay.value = `${data.used} used in ${data.month}`;
            if (quotaRemainingInfo) quotaRemainingInfo.innerText = `${data.remaining} remaining this billing cycle`;
            if (data.hasCustomKey && quotaCustomKeyInput) {
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

async function saveClientQuotaSettings() {
    const clientId = document.getElementById('quotaTargetClientId').value.trim() || myClientID || 'BONGBHOJ-TERMINAL';
    const limitVal = parseInt(document.getElementById('quotaMonthlyLimitInput').value, 10);
    const keyVal = document.getElementById('quotaCustomKeyInput').value.trim();

    const payload = { clientId };
    if (!isNaN(limitVal)) payload.aiMonthlyLimit = limitVal;
    payload.customGeminiKey = keyVal;

    try {
        const res = await fetch('/api/admin/client-quota', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to update quota");

        if (keyVal.length > 0) {
            showToast("✅ Dedicated Gemini API key saved for this store!");
        } else {
            showToast("✅ Using global default Gemini backend key!");
        }
        closeClientQuotaModal();
        refreshAiQuotaDisplay();
    } catch (err) {
        alert("Error updating client quota: " + err.message);
    }
}
window.saveClientQuotaSettings = saveClientQuotaSettings;

function openStoreProfileModal() {
    const el = document.getElementById('storeProfileModal');
    if (el) {
        const nameInput = document.getElementById('shopNameInput');
        if (nameInput) {
            nameInput.value = shopProfile.name || 'billnaw';
            setTimeout(() => nameInput.focus(), 80);
        }
        const emailInput = document.getElementById('shopEmailInput');
        if (emailInput) {
            emailInput.value = shopProfile.ownerEmail || shopProfile.email || localStorage.getItem('billnaw_auth_email') || 'owner@cafe.com';
        }
        const storeCodeInput = document.getElementById('shopStoreCodeInput');
        if (storeCodeInput) {
            storeCodeInput.value = shopProfile.storeCode || localStorage.getItem('billnaw_store_code') || 'SHOP-DEFAULT';
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

function openSubscriptionModal() {
    const el = document.getElementById('subscriptionDetailModal') || document.getElementById('subscriptionModal');
    if (el) el.style.display = 'flex';
}
window.openSubscriptionModal = openSubscriptionModal;

function closeSubscriptionModal() {
    const el = document.getElementById('subscriptionDetailModal') || document.getElementById('subscriptionModal');
    if (el) el.style.display = 'none';
}
window.closeSubscriptionModal = closeSubscriptionModal;

function openExpensesDetailModal() {
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
    const el = document.getElementById('cloudSyncDetailModal');
    if (el) {
        const codeEl = document.getElementById('settingsCurrentShopCode');
        if (codeEl) codeEl.innerText = myClientID || 'BONGBHOJ-TERMINAL';
        el.style.display = 'flex';
    }
}
window.openCloudSyncDetailModal = openCloudSyncDetailModal;

function closeCloudSyncDetailModal() {
    const el = document.getElementById('cloudSyncDetailModal');
    if (el) el.style.display = 'none';
}
window.closeCloudSyncDetailModal = closeCloudSyncDetailModal;

function openContactModal() {
    const el = document.getElementById('contactSupportModal');
    if (el) el.style.display = 'flex';
}
window.openContactModal = openContactModal;

function closeContactModal() {
    const el = document.getElementById('contactSupportModal');
    if (el) el.style.display = 'none';
}
window.closeContactModal = closeContactModal;

function exportFullShopBackupJSON() {
    const fullBackup = {
        version: "2.4.0",
        exportDate: new Date().toISOString(),
        profile: shopProfile,
        menu: menuItems,
        categories: menuCategories,
        customers: customersList,
        staff: staffList,
        expenses: dailyExpenses,
        history: orderHistory,
        tables: tablesInfo
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(fullBackup, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `bongbhoj_backup_${getLocalISODate()}.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast("💾 Shop JSON Backup downloaded!");
}
window.exportFullShopBackupJSON = exportFullShopBackupJSON;

function handleRestoreShopBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.profile) shopProfile = { ...shopProfile, ...data.profile };
            if (Array.isArray(data.menu)) menuItems = data.menu;
            if (Array.isArray(data.categories)) menuCategories = data.categories;
            if (Array.isArray(data.customers)) customersList = data.customers;
            if (Array.isArray(data.staff)) staffList = data.staff;
            if (Array.isArray(data.expenses)) dailyExpenses = data.expenses;
            if (Array.isArray(data.history)) orderHistory = data.history;
            if (data.tables && typeof data.tables === 'object') tablesInfo = data.tables;
            
            saveToLocal();
            if (typeof updateAllUI === 'function') updateAllUI();
            if (typeof persistAllToFirestore === 'function') persistAllToFirestore();
            showToast("✅ Store backup restored successfully!");
            closeCloudSyncDetailModal();
        } catch (err) {
            alert("Failed to parse backup file: " + err.message);
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

    // Role-Based Access Control (RBAC) Guard with Spot Manager PIN Override
    if (typeof canStaffAccessTab === 'function' && typeof currentStaff !== 'undefined' && currentStaff && !canStaffAccessTab(currentStaff, tabId)) {
        if (typeof requestManagerOverride === 'function') {
            const tabNames = {
                dashboard: 'Reports & Business Insights',
                settings: 'Terminal Settings',
                menu: 'Menu Management',
                inventory: 'Inventory & Commissary',
                khata: 'Khata Due Ledger',
                staff: 'Staff Management',
                devices: 'Authorized Devices Hub'
            };
            const isAdminOnlyTab = ['dashboard', 'settings', 'staff', 'devices', 'whatsapp'].includes(tabId);
            requestManagerOverride({
                title: isAdminOnlyTab ? 'Admin Authorization Required' : 'Manager Approval Required',
                actionDescription: `Staff role (${currentStaff.role}) is restricted from accessing ${tabNames[tabId] || tabId}. Enter ${isAdminOnlyTab ? 'Admin' : 'Manager or Admin'} PIN:`,
                requiredRole: isAdminOnlyTab ? 'Admin' : 'Manager',
                onSuccess: () => {
                    switchTabDirect(tabId);
                }
            });
            return;
        }
    }

    switchTabDirect(tabId);
}

function switchTabDirect(tabId) {
    document.querySelectorAll('.nav-btn, .tab-btn').forEach(btn => btn.classList.remove('active')); 
    document.querySelectorAll('.view, .tab-content').forEach(c => c.classList.remove('active')); 
    
    const targetNavBtn = document.getElementById(`nav-${tabId}`) || document.getElementById(`tab-${tabId}`);
    if (['customers', 'settings', 'whatsapp', 'tables'].includes(tabId)) {
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
        if (typeof refreshAiQuotaDisplay === 'function') refreshAiQuotaDisplay();
        if (typeof generateSettingsQRPreview === 'function') generateSettingsQRPreview();
        if (typeof renderSettingsProfileHeader === 'function') renderSettingsProfileHeader();
    }
    if (tabId === 'kds') {
        if (typeof renderKdsUI === 'function') renderKdsUI();
    }
    if (tabId === 'tables') {
        if (typeof renderTablesFloorUI === 'function') renderTablesFloorUI();
    }
}
window.switchTab = switchTab;
window.switchTabDirect = switchTabDirect;

function factoryReset() {
    if (confirm("⚠️ EXTREME WARNING: This will permanently wipe all Menu, Orders, Customers, Expenses and Settings on this browser. Proceed?")) {
        indexedDB.deleteDatabase('CafePOS_DB');
        localStorage.clear();
        location.reload();
    }
}
window.factoryReset = factoryReset;

function openClearAllDataModal() {
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
    closeClearAllDataModal();
    try {
        const activeToken = localStorage.getItem('billnaw_auth_token');
        const activeStoreCode = (window.shopProfile && window.shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || window.myClientID;

        // 1. Wipe cloud server store collections & reseed on server
        if (typeof fetch === 'function') {
            await fetch('/api/store/reset-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                },
                body: JSON.stringify({ storeCode: activeStoreCode })
            }).catch(e => console.warn('Server reset-data error:', e));
        }

        // 2. Wipe local IndexedDB tables & re-seed exactly 2 demo items
        if (typeof idb !== 'undefined') {
            const cleanDemoItems = [
                { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
                { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
                { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, /* baseline price: 150 */ stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
                { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
            ];
            const cleanCats = ["All", "Snacks", "Beverages", "Main Course"];

            await idb.set('cafe_menu', cleanDemoItems);
            await idb.set('cafe_categories', cleanCats);
            await idb.set('cafe_history', []);
            await idb.set('cafe_expenses', []);
            await idb.set('cafe_customers', []);

            window.menuItems = cleanDemoItems;
            window.menuCategories = cleanCats;
            window.orderHistory = [];
            window.dailyExpenses = [];
            window.customersList = [];
        }

        if (typeof renderMenuUI === 'function') renderMenuUI();
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

function handleOnboardLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
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
    if (typeof hasPermission === 'function' && typeof currentStaff !== 'undefined' && currentStaff) {
        if (!hasPermission(currentStaff, 'can_manage_devices') && (!currentStaff.role || currentStaff.role.toLowerCase() !== 'admin')) {
            showToast('Permission denied: Admin access required to manage devices.');
            return;
        }
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
                return `
                    <div class="pending-device-card" style="background: #FFFBEB; border: 1px solid #FCD34D; border-radius: 12px; padding: 14px 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong style="font-size: 14px; color: #92400E; font-family: monospace;">${dev.deviceId}</strong>
                                    <span style="font-size: 11px; font-weight: 700; background: #FEF3C7; color: #B45309; padding: 2px 8px; border-radius: 6px;">Pairing Code: ${dev.pairingCode || '------'}</span>
                                </div>
                                <p style="font-size: 11px; color: #B45309; margin: 4px 0 0 0;">Requested: ${new Date(dev.registeredAt || dev.lastSeenAt || Date.now()).toLocaleTimeString()}</p>
                            </div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: center; margin-top: 10px;">
                            <div>
                                <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400E; margin-bottom: 4px;">Station Name</label>
                                <input type="text" id="devName_${dev.deviceId}" value="${defaultName}" style="width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 600; border: 1px solid #FCD34D; border-radius: 8px; background: #FFFFFF;">
                            </div>
                            <div>
                                <label style="display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #92400E; margin-bottom: 4px;">Station Profile</label>
                                <select id="devProfile_${dev.deviceId}" style="width: 100%; padding: 7px 10px; font-size: 12px; font-weight: 600; border: 1px solid #FCD34D; border-radius: 8px; background: #FFFFFF;">
                                    <option value="BILLING_COUNTER" selected>Billing Counter</option>
                                    <option value="KDS">Kitchen Display (KDS)</option>
                                    <option value="WAITER_MOBILE">Waiter Mobile</option>
                                    <option value="GENERAL_STATION">General Station</option>
                                    <option value="ADMIN">Admin Terminal</option>
                                </select>
                            </div>
                            <div style="display: flex; gap: 6px; align-self: flex-end;">
                                <button type="button" class="btn btn-success" style="padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;" onclick="openDeviceApprovalModal('${dev.deviceId}')">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Approve</span>
                                </button>
                                <button type="button" class="btn btn-outline" style="padding: 7px 10px; font-size: 12px; border-radius: 8px; color: var(--danger); border-color: rgba(220, 38, 38, 0.3);" onclick="rejectPendingDevice('${dev.deviceId}')" title="Reject Pairing">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
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
                const nameDisplay = typeof escapeHtml === 'function' ? escapeHtml(dev.deviceName || 'Terminal') : (dev.deviceName || 'Terminal');
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
                                    ${isMaster ? '<span style="font-size: 10px; font-weight: 700; background: #DCFCE7; color: #15803D; padding: 2px 7px; border-radius: 10px;">Master Terminal</span>' : (isRevoked ? '<span style="font-size: 10px; font-weight: 700; background: #FEE2E2; color: #B91C1C; padding: 2px 7px; border-radius: 10px;">REVOKED</span>' : `<span style="font-size: 10px; font-weight: 700; background: #EFF6FF; color: #1D4ED8; padding: 2px 7px; border-radius: 10px;">${profileBadge}</span>`)}
                                </div>
                                <p style="font-size: 11px; color: var(--text-muted); margin: 3px 0 0 0; font-family: monospace;">ID: ${dev.deviceId} • ${isMaster ? 'Permanent' : (isRevoked ? `Revoked: ${dev.revokedAt ? new Date(dev.revokedAt).toLocaleTimeString() : 'Inactive'}` : `Approved: ${dev.approvedAt ? new Date(dev.approvedAt).toLocaleDateString() : 'Active'}`)}</p>
                            </div>
                        </div>
                        <div>
                            ${isMaster ? '' : (isRevoked ? `
                                <button type="button" class="btn btn-outline" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; color: #16A34A; border-color: rgba(22, 163, 74, 0.3); display: inline-flex; align-items: center; gap: 6px;" onclick="resumeAuthorizedDevice('${dev.deviceId}')">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                    <span>Resume</span>
                                </button>
                            ` : `
                                <button type="button" class="btn btn-outline" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 8px; color: var(--danger); border-color: rgba(220, 38, 38, 0.3); display: inline-flex; align-items: center; gap: 6px;" onclick="revokeAuthorizedDevice('${dev.deviceId}')">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                                    <span>Revoke</span>
                                </button>
                            `)}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}
window.renderAuthorizedDevicesHub = renderAuthorizedDevicesHub;

function openDeviceApprovalModal(deviceId) {
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

    // 2. Verify Master Admin PIN
    let isPinValid = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(enteredAdminPin)
        : ((typeof hashString === 'function' && hashString(enteredAdminPin) === shopProfile?.adminPinHash) || (enteredAdminPin === '1234'));
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
    const modal = document.getElementById('switchStoreModal');
    if (modal) {
        modal.style.display = 'flex';
        const input = document.getElementById('targetStoreCodeInput');
        if (input) {
            input.value = (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || localStorage.getItem('bongbhoj_client_id') || '';
            setTimeout(() => input.focus(), 60);
        }
    }
}
window.openSwitchStoreModal = openSwitchStoreModal;

async function confirmSwitchShopCode() {
    const input = document.getElementById('targetStoreCodeInput');
    const newCode = (input ? input.value : '').trim().toUpperCase();
    if (!newCode) {
        if (typeof showToast === 'function') showToast('Please enter a valid Shop Store Code.', 'error');
        return;
    }
    const modal = document.getElementById('switchStoreModal');
    if (modal) modal.style.display = 'none';
    if (typeof switchActiveShopCloudStore === 'function') {
        await switchActiveShopCloudStore(newCode);
    } else {
        if (typeof shopProfile !== 'undefined') shopProfile.storeCode = newCode;
        localStorage.setItem('bongbhoj_client_id', newCode);
        localStorage.setItem('billnaw_store_code', newCode);
        if (typeof showToast === 'function') showToast(`Connected to store: ${newCode}. Syncing...`, 'success');
        setTimeout(() => window.location.reload(), 400);
    }
}
window.confirmSwitchShopCode = confirmSwitchShopCode;

function openStatementModal() {
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
