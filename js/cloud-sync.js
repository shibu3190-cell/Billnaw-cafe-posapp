// js/cloud-sync.js - Multi-Device Staff Profile Gateway, Real-Time Presence & Background Sync
'use strict';

const _csEsc = (str) => (typeof escapeHtml === 'function')
    ? escapeHtml(str)
    : String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

// ============================================================================
// 1. CLOUD SYNC LOADING OVERLAY (Full-Screen Branded Hydration Screen)
// ============================================================================

let _cloudSyncHideTimer = null;

function showCloudSyncOverlay(message = 'Syncing Shop Profile, Menu & Active Tables...') {
    if (_cloudSyncHideTimer) {
        clearTimeout(_cloudSyncHideTimer);
        _cloudSyncHideTimer = null;
    }
    let overlay = document.getElementById('cloudSyncOverlay');
    const activeShopName = (typeof shopProfile !== 'undefined' && shopProfile?.name) || localStorage.getItem('billnaw_shop_name') || 'Billnaw POS';
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'cloudSyncOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:1000040;background:linear-gradient(135deg,#0F3D33 0%,#0B2E26 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFFFFF;font-family:inherit;padding:24px;box-sizing:border-box;text-align:center;';
        overlay.innerHTML = `
            <div style="width:72px;height:72px;border-radius:20px;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin-bottom:20px;box-shadow:0 12px 30px rgba(0,0,0,0.3);">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34D399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                </svg>
            </div>
            <h2 style="font-size:22px;font-weight:800;margin:0 0 8px 0;letter-spacing:0.2px;">${_csEsc(activeShopName)} Cloud Sync</h2>
            <p id="cloudSyncStatus" style="font-size:14px;color:rgba(255,255,255,0.78);margin:0 0 24px 0;max-width:320px;line-height:1.4;">${_csEsc(message)}</p>
            <div style="width:240px;height:6px;background:rgba(255,255,255,0.12);border-radius:99px;overflow:hidden;position:relative;">
                <div id="cloudSyncBar" style="height:100%;width:15%;background:linear-gradient(90deg,#10B981,#34D399);border-radius:99px;transition:width 0.35s ease;"></div>
            </div>
            <span id="cloudSyncPct" style="font-size:12px;font-weight:700;color:#A7F3D0;margin-top:10px;">15%</span>
        `;
        document.body.appendChild(overlay);
    } else {
        const titleEl = overlay.querySelector('h2');
        if (titleEl) titleEl.innerText = `${activeShopName} Cloud Sync`;
        setCloudSyncProgress(15, message);
    }
    if (typeof window.setActiveAuthOverlay === 'function') {
        window.setActiveAuthOverlay('cloudSyncOverlay');
    } else if (overlay) {
        overlay.style.zIndex = '1000040';
        overlay.style.display = 'flex';
    }
}

function hideCloudSyncOverlay(immediate = false) {
    if (_cloudSyncHideTimer) {
        clearTimeout(_cloudSyncHideTimer);
        _cloudSyncHideTimer = null;
    }
    const overlay = document.getElementById('cloudSyncOverlay');
    if (overlay) {
        setCloudSyncProgress(100, 'Cloud Sync Complete');
        if (immediate) {
            overlay.style.display = 'none';
        } else {
            _cloudSyncHideTimer = setTimeout(() => {
                _cloudSyncHideTimer = null;
                overlay.style.display = 'none';
            }, 250);
        }
    }
}

function setCloudSyncProgress(pct, message) {
    const bar = document.getElementById('cloudSyncBar');
    const pctEl = document.getElementById('cloudSyncPct');
    const statusEl = document.getElementById('cloudSyncStatus');
    if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    if (pctEl) pctEl.innerText = `${Math.round(pct)}%`;
    if (statusEl && message) statusEl.innerText = message;
}

window.showCloudSyncOverlay = showCloudSyncOverlay;
window.hideCloudSyncOverlay = hideCloudSyncOverlay;
window.setCloudSyncProgress = setCloudSyncProgress;

// ============================================================================
// 2. WHO'S WORKING? (Staff Profile Selector Gateway)
// ============================================================================

let _pendingSelectedStaff = null;

function showStaffProfileSelector(shopName = '') {
    const overlay = document.getElementById('staffProfileSelector');
    if (!overlay) return;

    // Never flicker under/over higher-priority shop login, sync, pairing, or v3 update overlays
    const activeOv = (typeof window.getActiveAuthOverlay === 'function') ? window.getActiveAuthOverlay() : null;
    if (activeOv === 'shopAuthModal' || activeOv === 'appUpdateInstallOverlay' || activeOv === 'cloudSyncOverlay' || activeOv === 'devicePairingOverlay') {
        return;
    }

    const sName = shopName || (window.shopProfile && (window.shopProfile.name || window.shopProfile.shopName)) || 'BillNaw Cafe';
    const titleEl = document.getElementById('staffSelectorShopName');
    if (titleEl) titleEl.innerText = sName;

    // Hide the "Skip" link whenever terminal is locked / requires fresh PIN verification (prevents post-upgrade PIN bypass)
    const skipBtn = overlay.querySelector('button[onclick*="hideStaffProfileSelector"]');
    const mustVerifyPin = (typeof localStorage !== 'undefined') && (
        localStorage.getItem('billnaw_terminal_locked') === 'true' ||
        !localStorage.getItem('billnaw_pin_verified_at')
    );
    if (skipBtn) {
        skipBtn.style.display = mustVerifyPin ? 'none' : '';
    }

    _renderStaffProfileCards();
    if (typeof window.setActiveAuthOverlay === 'function') {
        window.setActiveAuthOverlay('staffProfileSelector');
    } else {
        overlay.style.zIndex = '1000001';
        overlay.style.display = 'flex';
    }
}

function hideStaffProfileSelector(force = false) {
    const mustVerifyPin = !force && (typeof localStorage !== 'undefined') && (
        localStorage.getItem('billnaw_terminal_locked') === 'true' ||
        !localStorage.getItem('billnaw_pin_verified_at')
    );
    if (mustVerifyPin) {
        if (typeof showToast === 'function') {
            showToast('Please select your staff profile and enter your 4-digit PIN.', 'warning');
        }
        return false;
    }
    const overlay = document.getElementById('staffProfileSelector');
    if (overlay) overlay.style.display = 'none';
    _cancelStaffPinEntry();
    return true;
}

function _renderStaffProfileCards() {
    const grid = document.getElementById('staffProfileGrid');
    if (!grid) return;

    const staffSource = (typeof window !== 'undefined' && Array.isArray(window.staffList)) ? window.staffList : [];
    const deletedSet = new Set((typeof getDeletedStaffIds === 'function' ? getDeletedStaffIds() : []).map(String));
    const activeStoreCode = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (window.myClientID || (window.shopProfile && window.shopProfile.storeCode) || '');
    const activeEmail = String((window.shopProfile && (window.shopProfile.ownerEmail || window.shopProfile.email)) || '').toLowerCase().trim();
    const isAbhijitShop = activeStoreCode === 'SHOP_ABHIJITMODAK' || activeEmail.includes('abhijitmodak');
    const BAPI_QUARANTINE_IDS = new Set(['1793965135000', '1793965355981', '1794229462515', '1794307359978', '1794308489640', '1794308708078', '1794308990021', '1794309081290', '1794310972228']);

    // Always synthesize Admin Profile at the very top
    const adminStaff = {
        id: 'admin',
        name: (window.shopProfile && (window.shopProfile.ownerName || window.shopProfile.name)) || 'Store Admin',
        role: 'Admin',
        isAdmin: true
    };

    const seenIds = new Set(['admin', '1']);
    const nonAdminProfiles = [];
    for (const staff of staffSource) {
        if (!staff || !staff.id) continue;
        const sId = String(staff.id);
        if (staff.id === 'admin' || staff.role === 'Admin' || staff.id === 1) continue;
        if (deletedSet.has(sId)) continue;
        if (isAbhijitShop && BAPI_QUARANTINE_IDS.has(sId)) continue;
        if (seenIds.has(sId)) continue;
        seenIds.add(sId);
        nonAdminProfiles.push(staff);
    }

    const allProfiles = [
        adminStaff,
        ...nonAdminProfiles
    ];
    const sessions = (typeof window !== 'undefined' && window.activeStaffSessions) || [];

    grid.innerHTML = allProfiles.map(staff => {
        const isOnline = sessions.some(s => (s.staffId === staff.id || s.staffName === staff.name) && (s.status === 'online' || s.status === 'ONLINE'));
        const initials = (staff.name || 'ST').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
        
        const roleBadgeCls = staff.role === 'Admin' ? 'background:#143832;color:#FFF;' :
                             staff.role === 'Cashier' ? 'background:rgba(20,56,50,0.1);color:#143832;' :
                             (staff.role === 'Floor Server' || staff.role === 'Server') ? 'background:rgba(224,90,56,0.1);color:#E05A38;' :
                             'background:rgba(199,126,26,0.1);color:#C77E1A;';

        const roleBorder = staff.role === 'Admin' ? '#143832' :
                           staff.role === 'Cashier' ? '#2563EB' :
                           (staff.role === 'Floor Server' || staff.role === 'Server') ? '#E05A38' : '#C77E1A';

        return `
            <div class="staff-gateway-card" data-staff-id="${_csEsc(String(staff.id))}" data-staff-name="${_csEsc(staff.name || '')}" data-staff-role="${_csEsc(staff.role || '')}" onclick="onStaffProfileSelected(this.dataset.staffId, encodeURIComponent(this.dataset.staffName || ''), encodeURIComponent(this.dataset.staffRole || ''))" style="background:#FFFFFF;border:1.5px solid #E2E8F0;border-radius:16px;padding:16px 12px;text-align:center;cursor:pointer;position:relative;transition:all 0.2s ease;box-shadow:0 4px 14px rgba(0,0,0,0.04);">
                <div style="position:relative;width:52px;height:52px;margin:0 auto 10px auto;">
                    <div style="width:52px;height:52px;border-radius:16px;background:${roleBorder};color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;">${_csEsc(initials)}</div>
                    <span style="position:absolute;bottom:-2px;right:-2px;width:12px;height:12px;border-radius:50%;background:${isOnline ? '#22C55E' : '#94A3B8'};border:2px solid #FFFFFF;"></span>
                </div>
                <div style="font-weight:700;font-size:14px;color:#1E293B;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${_csEsc(staff.name)}</div>
                <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;${roleBadgeCls}">${_csEsc(staff.role)}</span>
            </div>
        `;
    }).join('');
}

function onStaffProfileSelected(staffId, encodedName, encodedRole) {
    const staffName = decodeURIComponent(encodedName);
    const staffRole = decodeURIComponent(encodedRole);

    _pendingSelectedStaff = { id: staffId, name: staffName, role: staffRole };

    const staffSource = (typeof window !== 'undefined' && Array.isArray(window.staffList)) ? window.staffList : [];
    const matched = staffSource.find(s => String(s.id) === String(staffId));
    const isFirstLogin = matched && (matched.mustChangePin === true || (matched.initialOtp && !matched.otpConsumed));

    // Prompt for 4-digit PIN / OTP verification
    const pinWrap = document.getElementById('staffPinEntryWrap');
    const pinNameEl = document.getElementById('staffPinName');
    const promptTextEl = pinWrap ? pinWrap.querySelector('p') : null;

    if (pinNameEl) pinNameEl.innerText = staffName;
    if (promptTextEl) {
        const safeStaffName = _csEsc(staffName);
        promptTextEl.innerHTML = isFirstLogin
            ? `Enter 4-Digit Onboarding OTP for <span id="staffPinName" style="color: var(--primary);">${safeStaffName}</span>`
            : `Enter 4-Digit PIN for <span id="staffPinName" style="color: var(--primary);">${safeStaffName}</span>`;
    }

    if (pinWrap) {
        pinWrap.style.display = 'block';
        const pInput = document.getElementById('staffGatewayPinInput');
        if (pInput) {
            pInput.value = '';
            pInput.placeholder = isFirstLogin ? 'OTP' : '••••';
            pInput.focus();
        }
    }
}

function appendGatewayPin(digit) {
    const input = document.getElementById('staffGatewayPinInput');
    if (input && input.value.length < 4) {
        input.value += digit;
        if (input.value.length === 4) {
            confirmStaffProfilePin();
        }
    }
}

function clearGatewayPin() {
    const input = document.getElementById('staffGatewayPinInput');
    if (input) {
        input.value = '';
        input.focus();
    }
}

function backspaceGatewayPin() {
    const input = document.getElementById('staffGatewayPinInput');
    if (input && input.value.length > 0) {
        input.value = input.value.slice(0, -1);
    }
}

let _gatewayPinInFlight = false;
async function confirmStaffProfilePin() {
    if (_gatewayPinInFlight) return;
    if (!_pendingSelectedStaff) return;
    const input = document.getElementById('staffGatewayPinInput');
    const enteredPin = input ? input.value.trim() : '';

    if (enteredPin.length < 4) {
        if (typeof showToast === 'function') showToast("Please enter complete 4-digit PIN / OTP.", "warning");
        return;
    }

    _gatewayPinInFlight = true;
    try {
        let isValid = false;
        let targetStaff = null;

        if (_pendingSelectedStaff.role === 'Admin' || _pendingSelectedStaff.id === 'admin') {
            if (typeof verifyAdminPin === 'function') {
                isValid = await verifyAdminPin(enteredPin);
            } else {
                isValid = (enteredPin === '1234');
            }
            if (isValid) {
                const list = (typeof window !== 'undefined' && Array.isArray(window.staffList)) ? window.staffList : [];
                targetStaff = list.find(s => s && (s.role === 'Admin' || s.id === 'admin' || s.id === 1)) || _pendingSelectedStaff;
            }
        } else {
            const staffSource = (typeof window !== 'undefined' && Array.isArray(window.staffList)) ? window.staffList : [];
            const matched = staffSource.find(s => String(s.id) === String(_pendingSelectedStaff.id));
            if (matched) {
                if (typeof verifyStaffPin === 'function') {
                    isValid = await verifyStaffPin(matched, enteredPin);
                } else if (typeof verifyPin === 'function' && (matched.pin_salt || matched.pinSalt) && (matched.pin_hash || matched.pinHash)) {
                    isValid = await verifyPin(enteredPin, matched.pin_salt || matched.pinSalt, matched.pin_hash || matched.pinHash);
                }
                if (isValid) {
                    targetStaff = matched;
                }
            }
        }

        if (isValid && targetStaff) {
            const isFirstLogin = targetStaff.mustChangePin === true || (targetStaff.initialOtp && !targetStaff.otpConsumed);
            if (isFirstLogin) {
                _cancelStaffPinEntry();
                hideStaffProfileSelector(true);
                if (typeof openFirstLoginPinModal === 'function') {
                    openFirstLoginPinModal(targetStaff);
                } else {
                    activateStaffProfileSession(targetStaff);
                }
                return;
            }
            activateStaffProfileSession(targetStaff);
        } else {
            if (typeof showToast === 'function') showToast("Incorrect PIN / OTP. Please try again.", "error");
            clearGatewayPin();
        }
    } finally {
        _gatewayPinInFlight = false;
    }
}

function _cancelStaffPinEntry() {
    _pendingSelectedStaff = null;
    const pinWrap = document.getElementById('staffPinEntryWrap');
    if (pinWrap) pinWrap.style.display = 'none';
    clearGatewayPin();
}

function activateStaffProfileSession(staff) {
    _cancelStaffPinEntry();
    hideStaffProfileSelector(true);

    if (typeof ensureShopProfileHydrated === 'function') {
        Promise.resolve(ensureShopProfileHydrated()).then(() => {
            if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
        }).catch(() => {});
    }

    // 1. Set global active staff (normalized role + Firebase/derived permissions cached locally)
    const normRole = (typeof normalizeRole === 'function') ? normalizeRole(staff.role) : (staff.role || 'Cashier');
    const accessProfile = (typeof buildStaffAccessProfile === 'function')
        ? buildStaffAccessProfile({ ...staff, role: normRole })
        : { id: staff.id, name: staff.name, role: normRole };
    const activeObj = {
        id: staff.id,
        name: staff.name,
        role: normRole,
        permissions: accessProfile.permissions,
        allowedTabs: accessProfile.allowedTabs
    };
    const resolvedRoleFlag = (normRole === 'Admin') ? 'admin' : 'staff';
    window.currentStaff = activeObj;
    window.currentRole = resolvedRoleFlag;
    window.currentStaffAccess = accessProfile;
    try { currentStaff = activeObj; } catch (_) {}
    try { currentRole = resolvedRoleFlag; } catch (_) {}

    const devId = (typeof getDeviceId === 'function' ? getDeviceId() : null) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_device_id') : null) || 'DEV_' + Math.random().toString(36).substring(2, 9);
    const sessionId = (typeof window !== 'undefined' && window.currentSessionId) || 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    window.currentSessionId = sessionId;

    // Align station profile to the unlocked staff's actual role so stale WAITER_MOBILE tags never trap a Cashier/Admin
    const derivedStationProfile = normRole === 'Kitchen Chef' ? 'KDS'
        : (normRole === 'Floor Server' ? 'WAITER_MOBILE'
        : (normRole === 'Admin' ? 'ADMIN' : 'BILLING_COUNTER'));

    try {
        localStorage.setItem('billnaw_active_staff', JSON.stringify(activeObj));
        localStorage.setItem('billnaw_staff_access_cache', JSON.stringify(accessProfile));
        localStorage.setItem('billnaw_station_profile', derivedStationProfile);
        localStorage.setItem('billnaw_last_staff_id', String(staff.id));
        localStorage.setItem('billnaw_current_session_id', sessionId);
        localStorage.setItem('billnaw_pin_verified_at', Date.now().toString());
        localStorage.removeItem('billnaw_terminal_locked');
    } catch(e) {}

    const nowIso = new Date().toISOString();
    const sessionRecord = {
        sessionId: sessionId,
        staffId: staff.id,
        staffName: staff.name,
        staffRole: staff.role || 'Cashier',
        deviceId: devId,
        deviceName: localStorage.getItem('billnaw_station_name') || 'Terminal',
        stationProfile: localStorage.getItem('billnaw_station_profile') || 'GENERAL_STATION',
        status: 'ONLINE',
        shiftStartedAt: nowIso,
        lastActiveAt: nowIso,
        isLocked: false
    };

    if (typeof syncSessionRecordToCloud === 'function') {
        syncSessionRecordToCloud(sessionRecord);
    }
    if (typeof startSessionHeartbeat === 'function') {
        startSessionHeartbeat(sessionRecord);
    }

    // 2. Register staffSession in Firebase
    registerStaffSessionCloud(staff);

    // 3. Update UI topbars & RBAC restrictions
    if (typeof updateStaffTopbarDisplay === 'function') {
        updateStaffTopbarDisplay(staff.name, staff.role);
    }
    const hdrStaff = document.getElementById('hdrActionStaffName');
    if (hdrStaff) hdrStaff.innerText = staff.name;
    const slideStaff = document.getElementById('slideStaffName');
    if (slideStaff) slideStaff.innerText = staff.name;

    if (typeof applyStationProfileRestrictions === 'function') {
        applyStationProfileRestrictions();
    }
    if (typeof enforcePermissions === 'function') {
        enforcePermissions();
    }

    if (typeof showToast === 'function') {
        showToast(`Signed in as ${staff.name} (${staff.role})`, "success");
    }
}

// ============================================================================
// 3. REAL-TIME STAFF PRESENCE & 60-SECOND HEARTBEAT (staffSessions node)
// ============================================================================

let _staffPresenceHeartbeatTimer = null;
let _currentSessionStaffId = null;
let _sessionStartTime = Date.now();
let _cachedActiveMinutes = 0;

async function registerStaffSessionCloud(staff) {
    if (!staff || !staff.id) return;
    _currentSessionStaffId = staff.id;
    _sessionStartTime = Date.now();
    _cachedActiveMinutes = 0;

    const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id) || 'default_shop';
    const shortDevId = (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_device_id')) || 'dev-' + Math.random().toString(36).slice(2, 8);
    const devInfo = `${navigator.userAgent.slice(0, 60)} | ${(navigator.userAgentData?.platform || navigator.platform || 'web')}`;

    const sessionPayload = {
        staffId: String(staff.id),
        staffName: staff.name,
        role: staff.role,
        status: 'online',
        deviceInfo: devInfo,
        shortDeviceId: shortDevId,
        loginTimestamp: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
        totalActiveMinutesToday: 0
    };

    // Write to Firestore /shops/{shopId}/staffSessions/{staffId}
    try {
        if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
            const docRef = window.firestoreDoc(window.firestoreDB, 'shops', shopId, 'staffSessions', String(staff.id));
            if (docRef) {
                await window.firestoreSetDoc(docRef, sessionPayload, { merge: true });
            }
        }
    } catch(e) {
        console.warn("[Presence] Cloud registration offline fallback:", e.message);
    }

    // Start 60-second presence heartbeat
    _startStaffPresenceHeartbeat(shopId, String(staff.id));
}

function _startStaffPresenceHeartbeat(shopId, staffId) {
    if (_staffPresenceHeartbeatTimer) {
        clearInterval(_staffPresenceHeartbeatTimer);
        _staffPresenceHeartbeatTimer = null;
    }

    _staffPresenceHeartbeatTimer = setInterval(async () => {
        if (!_currentSessionStaffId || !shopId) return;

        const isHidden = (typeof document !== 'undefined' && document.visibilityState === 'hidden');
        const status = isHidden ? 'away' : 'online';
        const elapsedMins = Math.floor((Date.now() - _sessionStartTime) / 60000);
        const totalMinutes = _cachedActiveMinutes + elapsedMins;

        try {
            if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
                const docRef = window.firestoreDoc(window.firestoreDB, 'shops', shopId, 'staffSessions', staffId);
                if (docRef) {
                    await window.firestoreSetDoc(docRef, {
                        status: status,
                        lastHeartbeat: new Date().toISOString(),
                        totalActiveMinutesToday: totalMinutes
                    }, { merge: true });
                }
            }
        } catch(e) {
            console.warn("[Presence] Heartbeat sync failed:", e.message);
        }
    }, 60000);
}

function stopStaffPresenceHeartbeat() {
    if (_staffPresenceHeartbeatTimer) {
        clearInterval(_staffPresenceHeartbeatTimer);
        _staffPresenceHeartbeatTimer = null;
    }

    if (_currentSessionStaffId) {
        const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id);
        if (shopId && window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
            const docRef = window.firestoreDoc(window.firestoreDB, 'shops', shopId, 'staffSessions', String(_currentSessionStaffId));
            if (docRef) {
                window.firestoreSetDoc(docRef, {
                    status: 'offline',
                    lastHeartbeat: new Date().toISOString()
                }, { merge: true }).catch(() => {});
            }
        }
        _currentSessionStaffId = null;
    }
}

// Window visibility and unload listeners
if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
        stopStaffPresenceHeartbeat();
    });

    document.addEventListener('visibilitychange', () => {
        if (_currentSessionStaffId) {
            const shopId = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id);
            if (shopId && window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
                const docRef = window.firestoreDoc(window.firestoreDB, 'shops', shopId, 'staffSessions', String(_currentSessionStaffId));
                if (docRef) {
                    const status = document.visibilityState === 'hidden' ? 'away' : 'online';
                    window.firestoreSetDoc(docRef, {
                        status: status,
                        lastHeartbeat: new Date().toISOString()
                    }, { merge: true }).catch(() => {});
                }
            }
        }
    });
}

window.showStaffProfileSelector = showStaffProfileSelector;
window.hideStaffProfileSelector = hideStaffProfileSelector;
window.onStaffProfileSelected = onStaffProfileSelected;
window.appendGatewayPin = appendGatewayPin;
window.clearGatewayPin = clearGatewayPin;
window.backspaceGatewayPin = backspaceGatewayPin;
window.confirmStaffProfilePin = confirmStaffProfilePin;
window._cancelStaffPinEntry = _cancelStaffPinEntry;
window.registerStaffSessionCloud = registerStaffSessionCloud;
window.stopStaffPresenceHeartbeat = stopStaffPresenceHeartbeat;
