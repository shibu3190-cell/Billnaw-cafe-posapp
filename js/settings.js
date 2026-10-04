// ============================================================
// ⚙️ JS/SETTINGS.JS - Shop Profile, Backup/Restore, Settings & Quota
// ============================================================

function updateProfileVisuals() {
    const currentName = shopProfile.name || "billnaw";
    
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
    
    const printAddress = document.getElementById('printAddress');
    if (printAddress) printAddress.innerText = shopProfile.address || "";
    
    const printFssai = document.getElementById('printFssai');
    if (printFssai) printFssai.innerText = shopProfile.fssai ? `FSSAI: ${shopProfile.fssai}` : "";
    
    const printGstin = document.getElementById('printGstin');
    if (printGstin) printGstin.innerText = shopProfile.gstin ? `GSTIN: ${shopProfile.gstin}` : "";
    
    if (shopProfile.logo) {
        const sidebarLogo = document.getElementById('sidebarLogo');
        if (sidebarLogo) { sidebarLogo.src = shopProfile.logo; sidebarLogo.style.display = 'block'; }
        const printLogo = document.getElementById('printLogo');
        if (printLogo) { printLogo.src = shopProfile.logo; printLogo.style.display = 'block'; }
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
            canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
            shopProfile.logo = canvas.toDataURL('image/jpeg', 0.8); 
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
    const shopNameInput = document.getElementById('shopNameInput');
    if (shopNameInput) {
        const val = shopNameInput.value.trim();
        shopProfile.name = val || "billnaw";
    }
    
    const shopAddressInput = document.getElementById('shopAddressInput');
    if (shopAddressInput) shopProfile.address = shopAddressInput.value;
    
    const shopPhoneInput = document.getElementById('shopPhoneInput');
    if (shopPhoneInput) {
        const cleanPhone = shopPhoneInput.value.replace(/\D/g, '');
        shopProfile.phone = cleanPhone || shopPhoneInput.value.trim();
        shopProfile.ownerPhone = shopProfile.phone;
        try { localStorage.setItem('billnaw_auth_phone', shopProfile.phone); } catch(e) {}
    }

    const fssaiInput = document.getElementById('fssaiInput');
    if (fssaiInput) shopProfile.fssai = fssaiInput.value;
    
    const gstinInput = document.getElementById('gstinInput');
    if (gstinInput) shopProfile.gstin = gstinInput.value;
    
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
        shopProfile.adminPinHash = hashString(adminPinSetup.value);
        adminPinSetup.value = '';
    }
    
    const upiIdInput = document.getElementById('upiIdInput');
    if (upiIdInput) shopProfile.upiId = upiIdInput.value.trim();
    
    const enableQrCodeInput = document.getElementById('enableQrCodeInput');
    if (enableQrCodeInput) shopProfile.showQr = enableQrCodeInput.checked;
    
    const gstPricingModeInput = document.getElementById('gstPricingModeInput');
    if (gstPricingModeInput) shopProfile.gstMode = gstPricingModeInput.value || 'inclusive';
    
    const defaultGstRateInput = document.getElementById('defaultGstRateInput');
    if (defaultGstRateInput) shopProfile.defaultGstRate = parseFloat(defaultGstRateInput.value) || 0;
    
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

    if (pricePro) pricePro.innerText = isAnnual ? '₹399' : '₹499';
    if (periodPro) periodPro.innerText = isAnnual ? '/mo (billed annually)' : '/mo';
    if (proBilledInfo) proBilledInfo.innerText = isAnnual ? '₹4,788 billed annually (Save ₹1,200)' : 'Billed monthly, cancel anytime';

    if (priceEnterprise) priceEnterprise.innerText = isAnnual ? '₹1,199' : '₹1,499';
    if (periodEnterprise) periodEnterprise.innerText = isAnnual ? '/mo (billed annually)' : '/mo';
    if (enterpriseBilledInfo) enterpriseBilledInfo.innerText = isAnnual ? '₹14,388 billed annually (Save ₹3,600)' : 'Billed monthly, cancel anytime';
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
            totEl.innerText = `Today's Total: ₹${sum.toFixed(2)}`;
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
    const modal = document.getElementById('tableConfigModal');
    if (!modal) return;
    
    draftTableCount = parseInt(shopProfile.tableCount, 10) || 5;
    draftCustomNames = JSON.parse(JSON.stringify(shopProfile.customTableNames || {}));
    
    const countInput = document.getElementById('settingTableCountInput');
    if (countInput) countInput.value = draftTableCount;
    
    renderTableConfigList();
    modal.style.display = 'flex';
}
window.openTableConfigModal = openTableConfigModal;

function closeTableConfigModal() {
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
                        <button type="button" class="btn btn-outline" style="padding: 6px 10px; font-size: 11px; color: var(--danger); border-color: rgba(167,50,50,0.3);" onclick="removeLastTableInSettings()" title="Delete Table #${i}">
                            🗑️
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

function saveTableSettings() {
    // Read from inputs
    for (let i = 1; i <= draftTableCount; i++) {
        const inp = document.getElementById(`tblCustomNameInput_${i}`);
        if (inp) {
            draftCustomNames[i] = inp.value.trim() || `T${i}`;
        }
    }
    
    shopProfile.tableCount = draftTableCount;
    shopProfile.customTableNames = JSON.parse(JSON.stringify(draftCustomNames));
    shopProfile.tableNamingPrefix = "T";
    
    // Ensure all tables initialized
    for (let i = 1; i <= draftTableCount; i++) {
        if (!tablesInfo[i]) {
            tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
        }
    }
    
    // Clamp activeTable if out of range
    if (activeTable > draftTableCount) {
        activeTable = 1;
    }

    persistProfile();
    persistTables();
    
    closeTableConfigModal();
    renderTables();
    syncTableUI();
    updateCartUI();
    
    showToast("✅ Table tabs & seating saved successfully!");
}
window.saveTableSettings = saveTableSettings;

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

function openMoreHub() {
    const modal = document.getElementById('moreHubModal');
    if (modal) modal.style.display = 'flex';
}
window.openMoreHub = openMoreHub;

function closeMoreHub() {
    const modal = document.getElementById('moreHubModal');
    if (modal) modal.style.display = 'none';
}
window.closeMoreHub = closeMoreHub;

function switchTab(tabId) { 
    if (tabId === 'more') {
        openMoreHub();
        return;
    }

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
    if (tabId === 'settings') {
        if (typeof refreshAiQuotaDisplay === 'function') refreshAiQuotaDisplay();
        if (typeof generateSettingsQRPreview === 'function') generateSettingsQRPreview();
        if (typeof renderSettingsProfileHeader === 'function') renderSettingsProfileHeader();
    }
}
window.switchTab = switchTab;

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
