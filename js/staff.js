// ============================================================
// 👥 JS/STAFF.JS - Two-Tier POS Staff, Cryptographic PIN & RBAC
// ============================================================

// 🔑 Salted SHA-256 Cryptographic PIN Engine (Compatible with src/core/rbac.js)
function generatePinSalt() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const arr = new Uint8Array(16);
        crypto.getRandomValues(arr);
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, () => ((Math.random() * 16) | 0).toString(16));
}
window.generatePinSalt = generatePinSalt;
window.generateSalt = generatePinSalt;

function timingSafeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
}
window.timingSafeEqual = timingSafeEqual;

async function hashPin(pin, salt) {
    const cleanPin = String(pin).trim();
    const actualSalt = salt !== undefined ? String(salt).trim() : generatePinSalt();
    const cleanSalt = actualSalt;
    const data = new TextEncoder().encode(`${cleanPin}:${cleanSalt}:billnaw_pin_v2`);
    let hashHex = '';
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } else {
        if (typeof hashString === 'function') {
            hashHex = hashString(cleanPin + cleanSalt);
        } else {
            hashHex = cleanPin;
        }
    }
    if (salt === undefined) {
        return { pinHash: hashHex, salt: actualSalt };
    }
    return hashHex;
}
window.hashPin = hashPin;

async function verifyPin(enteredPin, salt, expectedHash) {
    if (!enteredPin || !salt || !expectedHash) return false;
    const computedHash = await hashPin(enteredPin, salt);
    return timingSafeEqual(computedHash, expectedHash);
}
window.verifyPin = verifyPin;

function generateSecureUniqueStaffPin() {
    const trivial = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);
    let pin;
    let count = 0;
    do {
        pin = String(Math.floor(1000 + Math.random() * 9000));
        count++;
        if (count > 200) break;
    } while (
        trivial.has(pin) ||
        /^(\d)\1{3}$/.test(pin) ||
        (typeof staffList !== 'undefined' && Array.isArray(staffList) && staffList.some(s => s.pin === pin))
    );
    return pin;
}
window.generateSecureUniqueStaffPin = generateSecureUniqueStaffPin;

const ROLES = {
    ADMIN: 'Admin',
    MANAGER: 'Manager',
    CASHIER: 'Cashier',
    CHEF: 'Kitchen Chef',
    SERVER: 'Floor Server',
    WAITER: 'Floor Server',
    KITCHEN: 'Kitchen Chef'
};
window.ROLES = ROLES;

const ROLE_PERMISSIONS = {
    [ROLES.ADMIN]: ['can_take_orders', 'can_settle_bills', 'can_apply_discount', 'can_void_invoice', 'can_manage_menu', 'can_view_reports', 'can_view_expenses', 'can_change_settings', 'can_manage_devices', 'can_manage_staff', 'can_view_kds', 'can_update_prep_status', 'can_dispatch_kot', 'can_view_tables'],
    [ROLES.MANAGER]: ['can_take_orders', 'can_settle_bills', 'can_apply_discount', 'can_void_invoice', 'can_manage_menu'],
    [ROLES.CASHIER]: ['can_take_orders', 'can_settle_bills'],
    [ROLES.CHEF]: ['can_view_kds', 'can_update_prep_status'],
    [ROLES.SERVER]: ['can_take_orders', 'can_dispatch_kot', 'can_view_tables']
};
window.ROLE_PERMISSIONS = ROLE_PERMISSIONS;

function normalizeRole(roleInput) {
    if (!roleInput || typeof roleInput !== 'string') return ROLES.CASHIER;
    const clean = roleInput.trim().toLowerCase();
    if (clean === 'admin' || clean === 'owner') return ROLES.ADMIN;
    if (clean === 'manager') return ROLES.MANAGER;
    if (clean === 'cashier') return ROLES.CASHIER;
    if (clean === 'kitchen' || clean === 'kitchen chef' || clean === 'chef') return ROLES.CHEF;
    if (clean === 'waiter' || clean === 'server' || clean === 'floor server' || clean === 'waiters') return ROLES.SERVER;
    return ROLES.CASHIER;
}
window.normalizeRole = normalizeRole;

function hasPermission(userOrRole, permission) {
    if (!userOrRole) return false;
    const rawRole = typeof userOrRole === 'string' ? userOrRole : userOrRole.role;
    if (!rawRole) return false;
    const normRole = normalizeRole(rawRole);
    const allowed = ROLE_PERMISSIONS[normRole] || [];
    return allowed.includes(permission);
}
window.hasPermission = hasPermission;

function checkPermission(roleOrUser, permission) {
    return hasPermission(roleOrUser, permission);
}
window.checkPermission = checkPermission;

async function verifyAdminPin(enteredPin) {
    if (!enteredPin) return false;
    const cleanPin = String(enteredPin).trim();
    if (!cleanPin) return false;

    // 1. Direct check against in-memory shopProfile.adminPinHash
    if (typeof shopProfile !== 'undefined' && shopProfile && shopProfile.adminPinHash) {
        if (typeof hashString === 'function' && hashString(cleanPin) === shopProfile.adminPinHash) {
            return true;
        }
    }

    // 2. Redundant LocalStorage backup adminPinHash
    const backupPinHash = (typeof localStorage !== 'undefined') ? localStorage.getItem('billnaw_admin_pin_hash') : null;
    if (backupPinHash && typeof hashString === 'function' && hashString(cleanPin) === backupPinHash) {
        return true;
    }

    // 3. Admin staff in staffList (both salted SHA-256 and legacy representations)
    const list = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList : (window.staffList || []);
    const adminStaff = list.find(s => s && (s.role === 'Admin' || s.role === 'Owner'));
    if (adminStaff) {
        const hash = adminStaff.pin_hash || adminStaff.pinHash;
        const salt = adminStaff.pin_salt || adminStaff.pinSalt || '';
        if (hash && salt && typeof verifyPin === 'function') {
            const isMatch = await verifyPin(cleanPin, salt, hash);
            if (isMatch) return true;
        }
        if (adminStaff.pin && String(adminStaff.pin).trim() === cleanPin) {
            return true;
        }
        if (hash && !salt && typeof hashString === 'function' && hashString(cleanPin) === hash) {
            return true;
        }
    }

    // 4. Default fallback admin PIN '1234' only if no custom admin pin set
    const hasCustomAdminPin = (shopProfile && shopProfile.adminPinHash) || backupPinHash || (adminStaff && (adminStaff.pin_hash || adminStaff.pin));
    if (!hasCustomAdminPin && cleanPin === '1234') {
        return true;
    }

    return false;
}
window.verifyAdminPin = verifyAdminPin;

async function verifyStaffPin(staff, enteredPin) {
    if (!staff || !enteredPin) return false;
    const cleanPin = String(enteredPin).trim();
    if (!cleanPin) return false;

    // If staff is Admin or Owner, also allow valid Master Admin PIN
    if (staff.role === 'Admin' || staff.role === 'Owner') {
        const isAdminMatch = await verifyAdminPin(cleanPin);
        if (isAdminMatch) return true;
    }

    // Legacy on-the-fly migration: if staff has plaintext pin, migrate to salted SHA-256
    if (staff.pin) {
        if (String(staff.pin).trim() === cleanPin) {
            const salt = staff.pin_salt || staff.pinSalt || generatePinSalt();
            const hash = await hashPin(cleanPin, salt);
            staff.pin_salt = salt;
            staff.pin_hash = hash;
            staff.pinSalt = salt;
            staff.pinHash = hash;
            delete staff.pin;
            if (typeof saveToLocal === 'function') saveToLocal();
            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_staff', staffList).catch(() => {});
            if (typeof persistStaffToFirestore === 'function') persistStaffToFirestore(staff);
            return true;
        }
    }
    const hash = staff.pin_hash || staff.hash || staff.pinHash;
    const salt = staff.pin_salt || staff.salt || staff.pinSalt || '';
    if (hash && salt) {
        return verifyPin(cleanPin, salt, hash);
    }
    if (hash && !salt && typeof hashString === 'function' && hashString(cleanPin) === hash) {
        return true;
    }
    return false;
}
window.verifyStaffPin = verifyStaffPin;

// Global state for terminal lock & RBAC mode
let isTerminalLocked = false;
window.isTerminalLocked = isTerminalLocked;
window.STRICT_RBAC_MODE = true;
if (typeof selectedLoginStaffId === 'undefined') {
    globalThis.selectedLoginStaffId = null;
}
if (typeof window !== 'undefined') {
    window.selectedLoginStaffId = selectedLoginStaffId;
}
let failedPinAttempts = 0;
let pinLockoutUntil = null;

function renderStaffManagementUI() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    if (!staffList || staffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No staff members added yet. Click "Add Staff Member" to add one.</td></tr>`;
        return;
    }

    const sessions = (typeof window !== 'undefined' && window.activeStaffSessions) || [];
    const devices = (typeof window !== 'undefined' && Array.isArray(window.authorizedDevices)) ? window.authorizedDevices : (function() {
        try { return JSON.parse(localStorage.getItem('billnaw_authorized_devices') || '[]'); } catch(e) { return []; }
    })();
    const esc = typeof escapeHtml === 'function' ? escapeHtml : (str => String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));

    tbody.innerHTML = staffList.map(staff => {
        const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
        const roleCls = staff.role ? `role-${staff.role.toLowerCase()}` : 'role-cashier';
        const isActive = staff.status !== 'Inactive' && staff.status !== 'Suspended';
        const liveSess = sessions.find(s => String(s.staffId) === String(staff.id) || (s.staffName && s.staffName.toLowerCase() === staff.name.toLowerCase()));

        // Resolve Assigned Terminal / Station Profile
        const staffDevId = staff.deviceId || staff.assignedDeviceId;
        let assignedDev = devices.find(d => d.deviceId === staffDevId || d.id === staffDevId);
        if (!assignedDev && liveSess && liveSess.deviceId) {
            assignedDev = devices.find(d => d.deviceId === liveSess.deviceId || d.id === liveSess.deviceId);
        }
        if (!assignedDev && staff.role === 'Admin') {
            assignedDev = devices.find(d => d.isMaster === true);
        }
        if (!assignedDev) {
            if (staff.role === 'Kitchen Chef' || staff.role === 'Chef') assignedDev = devices.find(d => d.stationProfile === 'KDS');
            else if (staff.role === 'Floor Server' || staff.role === 'Server') assignedDev = devices.find(d => d.stationProfile === 'WAITER_MOBILE');
            else if (staff.role === 'Cashier') assignedDev = devices.find(d => d.stationProfile === 'BILLING_COUNTER' && !d.isMaster);
        }

        const stationProfile = (assignedDev && assignedDev.stationProfile) || staff.stationProfile || (
            staff.role === 'Kitchen Chef' ? 'KDS' :
            (staff.role === 'Floor Server' ? 'WAITER_MOBILE' :
            (staff.role === 'Admin' ? 'ADMIN_MASTER' : 'BILLING_COUNTER'))
        );
        const stationLabel = stationProfile === 'KDS' ? 'Kitchen KDS' :
            (stationProfile === 'WAITER_MOBILE' ? 'Waiter Mobile' :
            (stationProfile === 'ADMIN_MASTER' || stationProfile === 'ADMIN' ? 'Master Terminal' : 'Billing Register'));

        let terminalDisplay = '';
        if (assignedDev) {
            const isAuth = assignedDev.status === 'AUTHORIZED';
            terminalDisplay = `
                <div style="display: flex; flex-direction: column; gap: 2px;">
                    <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-dark);">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                        <strong>${esc(assignedDev.deviceName || 'Terminal')}</strong>
                    </span>
                    <span style="font-size: 10px; color: ${isAuth ? '#059669' : '#D97706'}; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                        <span style="width: 5px; height: 5px; border-radius: 50%; background: ${isAuth ? '#059669' : '#D97706'};"></span>
                        ${esc(assignedDev.status || 'AUTHORIZED')}
                    </span>
                </div>
            `;
        } else {
            terminalDisplay = `
                <span style="font-size: 11px; color: var(--text-muted); font-style: italic; display: inline-flex; align-items: center; gap: 4px;">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    Dynamic / Any
                </span>
            `;
        }

        let presenceBadge = '';
        if (liveSess) {
            const isLocked = liveSess.status === 'LOCKED' || liveSess.isLocked === true;
            if (isLocked) {
                presenceBadge = `<span style="display: block; font-size: 10px; color: #DC2626; font-weight: 700; margin-top: 2px;">🔴 Locked (${esc(liveSess.deviceName || 'Terminal')})</span>`;
            } else if (liveSess.status === 'ONLINE' || isSessionOnline(liveSess.lastActiveAt)) {
                presenceBadge = `<span style="display: block; font-size: 10px; color: #059669; font-weight: 700; margin-top: 2px;">🟢 Online (${esc(liveSess.deviceName || 'Terminal')})</span>`;
            } else {
                presenceBadge = `<span style="display: block; font-size: 10px; color: #D97706; font-weight: 600; margin-top: 2px;">🟡 Idle (${esc(liveSess.deviceName || 'Terminal')})</span>`;
            }
        }

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="staff-avatar">${initials}</div>
                        <div>
                            <strong style="font-size: 14px; color: var(--text-dark);">${staff.name}</strong>
                            ${staff.id === currentStaff?.id ? '<span style="margin-left: 6px; font-size: 10px; background: rgba(74, 51, 42, 0.1); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-weight: 700;">ACTIVE SESSION</span>' : ''}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="staff-badge ${roleCls}">${staff.role}</span>
                    <span style="display: block; font-size: 10px; color: var(--text-muted); font-weight: 600; margin-top: 3px;">Station: ${esc(stationLabel)}</span>
                </td>
                <td>${terminalDisplay}</td>
                <td style="font-size: 13px;">
                    <div>${staff.phone || '-'}</div>
                    <span style="font-family: monospace; letter-spacing: 2px; font-size: 11px; color: var(--text-muted);">••••</span>
                </td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: ${isActive ? 'var(--success)' : 'var(--danger)'};">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isActive ? 'var(--success)' : 'var(--danger)'};"></span>
                        ${isActive ? 'Active' : (staff.status || 'Inactive')}
                    </span>
                    ${presenceBadge}
                </td>
                <td>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px; margin-right: 5px; display: inline-flex; align-items: center; gap: 4px;" onclick="openEditStaffModal(${staff.id})"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg><span>Edit</span></button>
                    ${staff.role !== 'Admin' ? `<button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px; color: var(--danger); border-color: var(--danger); display: inline-flex; align-items: center; justify-content: center;" onclick="deleteStaffMember(${staff.id})" title="Delete Staff Member"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
                </td>
            </tr>
        `;
    }).join('');
}
window.renderStaffManagementUI = renderStaffManagementUI;

function renderLoginStaffPicker() {
    const container = document.getElementById('loginStaffPicker');
    if (!container) return;

    if (!staffList || staffList.length === 0) {
        container.innerHTML = `<p style="color: var(--text-muted); font-size: 12px;">No staff registered yet. Default Admin access.</p>`;
        return;
    }

    // Smart Defaults: Station Profile matching (KDS -> Kitchen Chef, WAITER_MOBILE -> Floor Server) or last active staff
    const stationProfile = (typeof localStorage !== 'undefined') ? localStorage.getItem('billnaw_station_profile') : null;
    const savedStaffId = parseInt(localStorage.getItem('billnaw_last_staff_id'), 10);
    if (!selectedLoginStaffId || !staffList.some(s => s.id === selectedLoginStaffId)) {
        if (stationProfile === 'KDS') {
            const chef = staffList.find(s => s.role === 'Kitchen Chef' || s.role === 'Chef');
            if (chef) selectedLoginStaffId = chef.id;
        } else if (stationProfile === 'WAITER_MOBILE') {
            const waiter = staffList.find(s => s.role === 'Floor Server' || s.role === 'Server');
            if (waiter) selectedLoginStaffId = waiter.id;
        }
        if (!selectedLoginStaffId) {
            if (savedStaffId && staffList.some(s => s.id === savedStaffId)) {
                selectedLoginStaffId = savedStaffId;
            } else if (staffList.length > 0) {
                selectedLoginStaffId = staffList[0].id;
            }
        }
    }

    container.innerHTML = staffList.map(staff => {
        const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
        const roleCls = staff.role ? `role-${staff.role.toLowerCase()}` : 'role-cashier';
        const isSelected = (staff.id === selectedLoginStaffId);
        return `
            <div class="staff-card ${isSelected ? 'selected' : ''}" onclick="selectLoginStaff(${staff.id})">
                <div class="staff-avatar" style="margin: 0 auto 6px auto;">${initials}</div>
                <div class="staff-name">${staff.name}</div>
                <div style="margin-top: 4px;"><span class="staff-badge ${roleCls}">${staff.role}</span></div>
            </div>
        `;
    }).join('');

    // Auto-Advance Focus: Focus immediately on 4-digit PIN input
    setTimeout(() => {
        const pinInput = document.getElementById('staffLoginPinInput');
        if (pinInput && document.getElementById('loginOverlay') && document.getElementById('loginOverlay').style.display !== 'none') {
            pinInput.focus();
        }
    }, 80);
}
window.renderLoginStaffPicker = renderLoginStaffPicker;

function selectLoginStaff(staffId) {
    selectedLoginStaffId = staffId;
    renderLoginStaffPicker();
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
    }
}
window.selectLoginStaff = selectLoginStaff;

// 🔒 Fast Unlock & Smart PIN Recognition
async function confirmStaffLogin() {
    if (pinLockoutUntil && Date.now() < pinLockoutUntil) {
        const remainingSec = Math.ceil((pinLockoutUntil - Date.now()) / 1000);
        showToast(`Keypad locked due to failed attempts. Try again in ${remainingSec}s.`, "error");
        return;
    }

    const pinInput = document.getElementById('staffLoginPinInput');
    const enteredPin = pinInput ? pinInput.value.trim() : '';

    if (!enteredPin) {
        return showToast("Please enter your 4-digit PIN.");
    }

    let staffToLogin = null;

    // 1. Check pre-selected staff first
    const preselected = (staffList || []).find(s => s.id === selectedLoginStaffId);
    if (preselected && await verifyStaffPin(preselected, enteredPin)) {
        staffToLogin = preselected;
    }

    // 2. SMART AUTO-RECOGNITION: Scan all staff members in current store
    // Recognizes staff automatically by their unique PIN without needing manual avatar pre-selection!
    if (!staffToLogin && Array.isArray(staffList)) {
        for (const s of staffList) {
            if (await verifyStaffPin(s, enteredPin)) {
                staffToLogin = s;
                selectedLoginStaffId = s.id;
                renderLoginStaffPicker(); // Visual auto-selection feedback
                break;
            }
        }
    }

    // 3. Admin PIN Fallback
    const isValidAdminPin = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(enteredPin)
        : ((typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash) || (enteredPin === '1234'));
    if (!staffToLogin && isValidAdminPin) {
        staffToLogin = (staffList || []).find(s => s.role === 'Admin') || { id: 1, name: "Admin", role: "Admin" };
        selectedLoginStaffId = staffToLogin.id;
        renderLoginStaffPicker();
    }

    if (staffToLogin) {
        failedPinAttempts = 0;
        pinLockoutUntil = null;
        if (staffToLogin.mustChangePin === true) {
            openFirstLoginPinModal(staffToLogin);
            return;
        }
        unlockTerminal(staffToLogin);
    } else {
        failedPinAttempts++;
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        const authBox = document.querySelector('#loginOverlay .auth-box');
        if (authBox) {
            authBox.classList.remove('pin-shake');
            void authBox.offsetWidth;
            authBox.classList.add('pin-shake');
            setTimeout(() => authBox.classList.remove('pin-shake'), 400);
        }
        if (failedPinAttempts >= 5) {
            pinLockoutUntil = Date.now() + 30000;
            showToast("5 failed PIN attempts. Keypad throttled for 30 seconds.", "error");
        } else {
            showToast(`❌ Incorrect PIN. (${5 - failedPinAttempts} attempts remaining)`);
        }
    }
}
window.confirmStaffLogin = confirmStaffLogin;
window.submitStaffPinLogin = confirmStaffLogin;

function unlockTerminal(staff) {
    isTerminalLocked = false;
    window.isTerminalLocked = false;
    try {
        localStorage.removeItem('billnaw_terminal_locked');
        localStorage.setItem('billnaw_last_staff_id', staff.id);
        localStorage.setItem('billnaw_active_staff', JSON.stringify({ id: staff.id, name: staff.name, role: staff.role }));
    } catch (e) {}

    currentStaff = staff;
    window.currentStaff = currentStaff;
    if (currentStaff.role === 'Admin' || currentStaff.role === 'Manager') {
        currentRole = 'admin';
    } else {
        currentRole = 'staff';
    }

    // Milestone 4: Staff Session Lifecycle & Cloud Sync
    const devId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (localStorage.getItem('bongbhoj_device_id') || 'DEV_MASTER');
    const sessionId = `sess_${devId}_${staff.id}`;
    window.currentSessionId = sessionId;
    try {
        localStorage.setItem('billnaw_current_session_id', sessionId);
    } catch (e) {}

    const devName = localStorage.getItem('billnaw_station_name') || (window.currentDeviceRecord && window.currentDeviceRecord.deviceName) || 'Counter 1';
    const stationProfile = (typeof getStationProfile === 'function' ? getStationProfile() : null) || localStorage.getItem('billnaw_station_profile') || (window.currentDeviceRecord && window.currentDeviceRecord.stationProfile) || 'GENERAL_STATION';
    const nowIso = new Date().toISOString();
    const sessionRecord = {
        sessionId: sessionId,
        staffId: staff.id,
        staffName: staff.name,
        staffRole: staff.role || 'Cashier',
        deviceId: devId,
        deviceName: devName,
        stationProfile: stationProfile,
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

    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput) pinInput.value = '';

    enforcePermissions();
    updateStaffTopbarDisplay();

    // Milestone 3: Route immediately to tailored station view
    const initialView = (typeof resolveInitialViewForStation === 'function')
        ? resolveInitialViewForStation(typeof getStationProfile === 'function' ? getStationProfile() : null, staff ? staff.role : null)
        : 'pos';
    if (typeof switchView === 'function') {
        switchView(initialView);
    } else if (typeof switchTab === 'function') {
        switchTab(initialView);
    }
    if (typeof applyStationProfileRestrictions === 'function') {
        applyStationProfileRestrictions();
    }

    showToast(`Welcome, ${currentStaff.name}! (${currentStaff.role || 'Staff'})`);
}
window.unlockTerminal = unlockTerminal;

function lockTerminal(notify = true) {
    isTerminalLocked = true;
    window.isTerminalLocked = true;
    try {
        localStorage.setItem('billnaw_terminal_locked', 'true');
    } catch (e) {}

    const overlay = document.getElementById('loginOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.zIndex = '1000005';
    }
    renderLoginStaffPicker();
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 80);
    }
    if (notify && typeof showToast === 'function') {
        showToast("🔒 POS Terminal Locked. Enter staff PIN to resume.", "info");
    }
}
window.lockTerminal = lockTerminal;

// ============================================================================
// 📡 Milestone 4: Session Heartbeat, Remote Lockout & Live Session Hub
// ============================================================================

let sessionHeartbeatInterval = null;
let lastLocalActivityTimestamp = Date.now();
let lastCloudHeartbeatTimestamp = 0;
let currentSessionRecord = null;

function trackUserInteraction() {
    lastLocalActivityTimestamp = Date.now();
}

function startSessionHeartbeat(sessionRecord) {
    stopSessionHeartbeat();
    currentSessionRecord = sessionRecord;
    lastLocalActivityTimestamp = Date.now();
    lastCloudHeartbeatTimestamp = Date.now();

    if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pointerdown', trackUserInteraction, { passive: true });
        window.addEventListener('keydown', trackUserInteraction, { passive: true });
        window.addEventListener('touchstart', trackUserInteraction, { passive: true });
    }

    sessionHeartbeatInterval = setInterval(async () => {
        if (!currentSessionRecord || !currentSessionRecord.sessionId) return;
        if (isTerminalLocked) return;

        const now = Date.now();
        const inactiveMs = now - lastLocalActivityTimestamp;
        const timeSinceCloudHeartbeat = now - lastCloudHeartbeatTimestamp;

        if (timeSinceCloudHeartbeat >= 90 * 1000) {
            if (inactiveMs <= 5 * 60 * 1000) {
                const nowIso = new Date().toISOString();
                currentSessionRecord.lastActiveAt = nowIso;
                currentSessionRecord.status = 'ONLINE';
                lastCloudHeartbeatTimestamp = now;
                if (typeof syncSessionRecordToCloud === 'function') {
                    await syncSessionRecordToCloud(currentSessionRecord);
                }
            } else if (currentSessionRecord.status === 'ONLINE') {
                currentSessionRecord.status = 'IDLE';
                lastCloudHeartbeatTimestamp = now;
                if (typeof syncSessionRecordToCloud === 'function') {
                    await syncSessionRecordToCloud(currentSessionRecord);
                }
            }
        }
    }, 30 * 1000);
}
window.startSessionHeartbeat = startSessionHeartbeat;

function stopSessionHeartbeat() {
    if (sessionHeartbeatInterval) {
        clearInterval(sessionHeartbeatInterval);
        sessionHeartbeatInterval = null;
    }
    currentSessionRecord = null;
    if (typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('pointerdown', trackUserInteraction);
        window.removeEventListener('keydown', trackUserInteraction);
        window.removeEventListener('touchstart', trackUserInteraction);
    }
}
window.stopSessionHeartbeat = stopSessionHeartbeat;

function formatShiftDuration(shiftStartedAt, now = new Date()) {
    if (!shiftStartedAt) return '0m';
    const start = new Date(shiftStartedAt).getTime();
    if (isNaN(start)) return '0m';
    const current = new Date(now).getTime();
    const diffMs = Math.max(0, current - start);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins === 0) return '0m';
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours === 0) return `${mins}m`;
    return `${hours}h ${mins}m`;
}
window.formatShiftDuration = formatShiftDuration;

function isSessionOnline(lastActiveAt, now = new Date(), thresholdMinutes = 5) {
    if (!lastActiveAt) return false;
    const last = new Date(lastActiveAt).getTime();
    if (isNaN(last)) return false;
    const current = new Date(now).getTime();
    const diffMinutes = (current - last) / (1000 * 60);
    return diffMinutes <= thresholdMinutes;
}
window.isSessionOnline = isSessionOnline;

function formatLastActiveTime(lastActiveAt, now = new Date()) {
    if (!lastActiveAt) return 'Active just now';
    const last = new Date(lastActiveAt).getTime();
    if (isNaN(last)) return 'Active just now';
    const current = new Date(now).getTime();
    const diffMs = Math.max(0, current - last);
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins <= 0) return 'Active just now';
    if (diffMins < 60) return `Active ${diffMins}m ago`;
    const hours = Math.floor(diffMins / 60);
    return `Active ${hours}h ago`;
}
window.formatLastActiveTime = formatLastActiveTime;

function lockTerminalByRemote(lockedSession) {
    if (typeof isMasterTerminal === 'function' && isMasterTerminal()) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_is_master') === 'true') return;

    // 1. Clear in-progress cart (Customer Privacy)
    if (typeof clearCart === 'function') clearCart();
    if (typeof window !== 'undefined' && typeof window.clearCart === 'function') window.clearCart();
    if (typeof window !== 'undefined') window.cart = [];
    if (typeof currentCart !== 'undefined') currentCart = [];
    if (typeof renderCart === 'function') renderCart();
    try { localStorage.removeItem('billnaw_active_cart'); } catch (e) {}

    // 2. Purge active staff
    if (typeof stopSessionHeartbeat === 'function') stopSessionHeartbeat();
    if (typeof window !== 'undefined') {
        window.currentSessionId = null;
        window.currentStaff = null;
        window.currentRole = null;
    }
    try {
        localStorage.removeItem('billnaw_current_session_id');
        localStorage.removeItem('billnaw_active_staff');
        localStorage.removeItem('billnaw_last_staff_id');
    } catch (e) {}
    currentStaff = null;
    currentRole = null;
    if (typeof updateStaffTopbarDisplay === 'function') updateStaffTopbarDisplay();

    // 3. Dismiss open modals
    if (typeof document !== 'undefined') {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.id !== 'loginOverlay') m.style.display = 'none';
        });
    }

    // 4. Set locked flags
    isTerminalLocked = true;
    if (typeof window !== 'undefined') window.isTerminalLocked = true;
    try { localStorage.setItem('billnaw_terminal_locked', 'true'); } catch (e) {}

    // 5. Engage #loginOverlay
    const overlay = typeof document !== 'undefined' ? document.getElementById('loginOverlay') : null;
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.zIndex = '1000005';
    }

    // 6. Render login staff picker
    if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();

    // 7. Clear & focus PIN input
    const pinInput = typeof document !== 'undefined' ? document.getElementById('staffLoginPinInput') : null;
    if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 80);
    }

    // 8. Operator notification
    if (typeof showToast === 'function') {
        showToast("🔒 Session remotely locked by Administrator. Enter staff PIN to resume.", "warning");
    }

    // Enforce locked permissions
    if (typeof enforcePermissions === 'function') enforcePermissions();

    // 9. Dispatch event
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('billnaw:terminal-remotely-locked', {
            detail: { session: lockedSession, timestamp: new Date().toISOString() }
        }));
    }
}
window.lockTerminalByRemote = lockTerminalByRemote;

async function remoteLockStaffSession(sessionId) {
    if (!sessionId) return { error: { code: 'INVALID_ID', message: 'sessionId is required' } };

    // RBAC validation: only Admin can execute remote lock
    const canManage = (currentStaff && (currentStaff.role === 'Admin' || hasPermission(currentStaff, 'can_manage_staff'))) ||
                      (currentRole === 'admin') ||
                      (typeof isMasterTerminal === 'function' && isMasterTerminal()) ||
                      (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_is_master') === 'true');
    if (!canManage) {
        if (typeof showToast === 'function') showToast('Only Administrators can remotely lock sessions.', 'warning');
        return { error: { code: 'UNAUTHORIZED', message: 'Admin role required' } };
    }

    // Retrieve active sessions list
    let sessions = (typeof window !== 'undefined' && window.activeStaffSessions) || [];
    if ((!sessions || sessions.length === 0) && typeof localStorage !== 'undefined') {
        try {
            const cached = localStorage.getItem('billnaw_active_sessions');
            if (cached) sessions = JSON.parse(cached);
        } catch (e) {}
    }

    const session = sessions.find(s => s.sessionId === sessionId || s.id === sessionId);
    if (!session) {
        if (typeof showToast === 'function') showToast('Session not found', 'warning');
        return { data: null, error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } };
    }

    // Master Admin protection guard
    const myDevId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (typeof localStorage !== 'undefined' ? localStorage.getItem('bongbhoj_device_id') : null);
    const isMaster = (typeof isMasterTerminal === 'function' && isMasterTerminal()) || (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_is_master') === 'true');
    if (session.isMaster === true || session.deviceId === 'DEV_MASTER_01' || (session.deviceId === myDevId && isMaster)) {
        if (typeof showToast === 'function') showToast('Master Admin Terminal cannot be remotely locked.', 'warning');
        return { error: { code: 'IMMUNE_TARGET', message: 'Master Admin Terminal cannot be remotely locked' } };
    }

    // Idempotency: if already ended, do not reactivate
    if (session.status === 'ENDED') {
        return { data: session, error: null };
    }
    // If already locked, return idempotently
    if (session.status === 'LOCKED' && session.isLocked === true) {
        return { data: session, error: null };
    }

    const updates = {
        status: 'LOCKED',
        isLocked: true,
        lockedAt: new Date().toISOString(),
        lockedByAdminId: currentStaff ? currentStaff.id : 'admin'
    };

    // Optimistic local update
    Object.assign(session, updates);
    if (typeof window !== 'undefined' && window.activeStaffSessions) {
        const idx = window.activeStaffSessions.findIndex(s => s.sessionId === sessionId || s.id === sessionId);
        if (idx >= 0) window.activeStaffSessions[idx] = { ...window.activeStaffSessions[idx], ...updates };
    }
    try {
        localStorage.setItem('billnaw_active_sessions', JSON.stringify(sessions));
    } catch (e) {}

    // Cloud synchronization
    try {
        if (typeof setTenantSession === 'function') {
            await setTenantSession(sessionId, updates);
        } else if (typeof syncSessionRecordToCloud === 'function') {
            await syncSessionRecordToCloud({ sessionId, ...updates });
        } else if (typeof window !== 'undefined' && window.firestoreDB && window.firestoreSetDoc && typeof getStoreSubdocRef === 'function') {
            const sRef = getStoreSubdocRef('sessions', sessionId);
            if (sRef) await window.firestoreSetDoc(sRef, updates, { merge: true });
        }
    } catch (err) {
        console.warn('remoteLockStaffSession cloud sync error:', err.message);
    }

    if (typeof renderLiveSessionCards === 'function') renderLiveSessionCards();
    if (typeof showToast === 'function') {
        showToast(`🔒 Remote lock signal dispatched to ${session.staffName || 'session'}.`, 'success');
    }
    return { data: session, error: null };
}
window.remoteLockStaffSession = remoteLockStaffSession;
window.remoteLockSession = remoteLockStaffSession;

function renderLiveSessionCards() {
    const container = typeof document !== 'undefined' ? document.getElementById('activeSessionsListContainer') : null;
    if (!container) return;

    let sessions = (typeof window !== 'undefined' && window.activeStaffSessions) || [];
    if ((!sessions || sessions.length === 0) && typeof localStorage !== 'undefined') {
        try {
            const cached = localStorage.getItem('billnaw_active_sessions');
            if (cached) sessions = JSON.parse(cached);
        } catch (e) {}
    }

    if (!Array.isArray(sessions) || sessions.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
                No active staff sessions found. This device is the primary counter terminal.
            </div>
        `;
        return;
    }

    const esc = typeof escapeHtml === 'function' ? escapeHtml : (str => String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
    const myDevId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (typeof localStorage !== 'undefined' ? localStorage.getItem('bongbhoj_device_id') : null);
    const mySessId = (typeof window !== 'undefined' && window.currentSessionId) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_current_session_id') : null);
    const isMaster = (typeof isMasterTerminal === 'function' && isMasterTerminal()) || (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_is_master') === 'true');

    container.innerHTML = sessions.map(s => {
        const staffName = s.staffName || 'Staff Member';
        const staffRole = s.staffRole || 'Cashier';
        const initials = staffName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() || 'ST';
        const devName = s.deviceName || (s.deviceId ? `Terminal ${s.deviceId.slice(-4)}` : 'POS Terminal');
        const devId = s.deviceId || '';
        const isCurrent = Boolean((s.sessionId && s.sessionId === mySessId) || (devId && devId === myDevId));
        const isMasterDevice = Boolean(s.isMaster || devId === 'DEV_MASTER_01' || (isMaster && isCurrent));

        const isLocked = s.status === 'LOCKED' || s.isLocked === true;
        const isOnline = !isLocked && (s.status === 'ONLINE' || isSessionOnline(s.lastActiveAt));
        const isIdle = !isLocked && !isOnline;

        let dotClass = 'presence-dot online';
        let statusTitle = 'Online';
        if (isLocked) {
            dotClass = 'presence-dot locked';
            statusTitle = 'Locked';
        } else if (isIdle) {
            dotClass = 'presence-dot idle';
            statusTitle = 'Idle';
        }

        const durationStr = formatShiftDuration(s.shiftStartedAt);
        const lastActiveStr = isLocked ? 'Locked' : formatLastActiveTime(s.lastActiveAt);

        const roleClean = String(staffRole).toLowerCase().replace(/\s+/g, '-');
        const roleBadgeClass = `staff-badge role-${roleClean}`;

        let actionHtml = '';
        if (isMasterDevice) {
            actionHtml = `<span class="session-current-badge">Master Terminal (Protected)</span>`;
        } else if (isCurrent) {
            actionHtml = `<span class="session-current-badge">Current Device</span>`;
        } else if (isLocked) {
            actionHtml = `<span class="presence-dot locked" style="margin-right: 4px;"></span><span style="font-size: 11px; font-weight: 700; color: var(--danger);">Remotely Locked</span>`;
        } else {
            actionHtml = `
                <button type="button" class="btn btn-outline session-remote-lock-btn" onclick="remoteLockStaffSession('${esc(s.sessionId)}')" aria-label="Remote Lock ${esc(staffName)}">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span>Remote Lock</span>
                </button>
            `;
        }

        return `
            <div class="session-card ${isLocked ? 'is-locked' : ''}">
                <div class="session-staff-col">
                    <div class="session-avatar">${esc(initials)}</div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="session-meta-name">
                            <span class="${dotClass}" title="${statusTitle}"></span>
                            <span>${esc(staffName)}</span>
                            <span class="${roleBadgeClass}" style="font-size: 10px; padding: 2px 7px; border-radius: 8px;">${esc(staffRole)}</span>
                        </div>
                        <div class="session-telemetry">
                            <span class="session-telemetry-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                                <span>${esc(devName)}${devId ? ` (${esc(devId)})` : ''}</span>
                            </span>
                            <span class="session-telemetry-item">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span>Shift: ${esc(durationStr)} • ${esc(lastActiveStr)}</span>
                            </span>
                        </div>
                    </div>
                </div>
                <div>
                    ${actionHtml}
                </div>
            </div>
        `;
    }).join('');
}
window.renderLiveSessionCards = renderLiveSessionCards;

function quickStaffLoginAsSelected() {
    if (window.STRICT_RBAC_MODE !== false) {
        showToast("Strict RBAC active: PIN entry required to unlock terminal.", "warning");
        const pinInput = document.getElementById('staffLoginPinInput');
        if (pinInput) pinInput.focus();
        return;
    }
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId) || staffList[0];
    if (matchedStaff && matchedStaff.mustChangePin === true) {
        showToast("First-time login requires PIN verification. Enter temporary PIN.", "warning");
        const pinInput = document.getElementById('staffLoginPinInput');
        if (pinInput) pinInput.focus();
        return;
    }
    unlockTerminal(matchedStaff || { id: 2, name: "Staff", role: "Cashier" });
    showToast(`Quick POS Session: ${currentStaff.name}`);
}
window.quickStaffLoginAsSelected = quickStaffLoginAsSelected;

function updateStaffTopbarDisplay() {
    const el = document.getElementById('activeStaffName');
    const slideStaffName = document.getElementById('slideStaffName');
    const popoverStaffName = document.getElementById('popoverStaffName');
    const roleBadge = currentStaff ? currentStaff.role : 'Admin';
    const name = currentStaff ? currentStaff.name : 'Admin';

    if (el) {
        el.innerHTML = `${name} <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px; background: rgba(20,56,50,0.1); color: var(--primary); margin-left: 4px;">${roleBadge}</span>`;
    }
    if (slideStaffName) slideStaffName.innerText = `${name} (${roleBadge})`;
    if (popoverStaffName) popoverStaffName.innerText = `${name} (${roleBadge})`;
}
window.updateStaffTopbarDisplay = updateStaffTopbarDisplay;

// 🔢 Keypad Touch Handlers for Terminal PIN Pad
function appendTerminalPin(digit) {
    const pinInput = document.getElementById('staffLoginPinInput');
    if (!pinInput) return;
    if (pinInput.value.length < 4) {
        pinInput.value += digit;
    }
    if (pinInput.value.length === 4) {
        confirmStaffLogin();
    }
}
window.appendTerminalPin = appendTerminalPin;

function clearTerminalPin() {
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
    }
}
window.clearTerminalPin = clearTerminalPin;

function backspaceTerminalPin() {
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput && pinInput.value.length > 0) {
        pinInput.value = pinInput.value.slice(0, -1);
    }
}
window.backspaceTerminalPin = backspaceTerminalPin;

// 🔄 Quick Staff Switch Modal Handlers
function selectQuickSwitchStaff(staffId) {
    selectedLoginStaffId = staffId;
    if (typeof window !== 'undefined') window.selectedLoginStaffId = staffId;
    const list = document.getElementById('quickSwitchStaffList');
    if (list) {
        list.querySelectorAll('.staff-card').forEach(card => card.classList.remove('selected'));
        const selectedCard = list.querySelector(`[data-staff-id="${staffId}"]`);
        if (selectedCard) selectedCard.classList.add('selected');
    }
    const pinInput = document.getElementById('quickSwitchPinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
    }
}
window.selectQuickSwitchStaff = selectQuickSwitchStaff;

function openStaffSwitchModal() {
    const list = document.getElementById('quickSwitchStaffList');
    const staffSource = (typeof window !== 'undefined' && Array.isArray(window.staffList) && window.staffList.length > 0)
        ? window.staffList
        : (typeof staffList !== 'undefined' && Array.isArray(staffList) ? staffList : []);

    if (!selectedLoginStaffId && staffSource.length > 0) {
        selectedLoginStaffId = (currentStaff && currentStaff.id) ? currentStaff.id : staffSource[0].id;
    }
    if (list && staffSource.length > 0) {
        list.innerHTML = staffSource.map(staff => {
            const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
            const roleCls = staff.role ? `role-${staff.role.toLowerCase()}` : 'role-cashier';
            const isSelected = (staff.id === selectedLoginStaffId);
            return `
                <div class="staff-card ${isSelected ? 'selected' : ''}" data-staff-id="${staff.id}" onclick="selectQuickSwitchStaff(${staff.id}); document.getElementById('quickSwitchPinInput').focus();">
                    <div class="staff-avatar" style="margin: 0 auto 6px auto;">${initials}</div>
                    <div class="staff-name">${staff.name}</div>
                    <div style="margin-top: 4px;"><span class="staff-badge ${roleCls}">${staff.role}</span></div>
                </div>
            `;
        }).join('');
    }
    const pinInput = document.getElementById('quickSwitchPinInput');
    if (pinInput) pinInput.value = '';
    const modal = document.getElementById('staffSwitchModal');
    if (modal) modal.style.display = 'flex';
}
window.openStaffSwitchModal = openStaffSwitchModal;

async function confirmQuickStaffSwitch() {
    const pinInput = document.getElementById('quickSwitchPinInput');
    const enteredPin = pinInput ? pinInput.value.trim() : '';
    const staffSource = (typeof window !== 'undefined' && Array.isArray(window.staffList) && window.staffList.length > 0)
        ? window.staffList
        : (typeof staffList !== 'undefined' && Array.isArray(staffList) ? staffList : []);
    const matchedStaff = staffSource.find(s => s.id === selectedLoginStaffId) || (staffSource.length > 0 ? staffSource[0] : null);
    if (!matchedStaff) {
        showToast("Select a staff member.");
        return false;
    }

    if (!enteredPin) {
        showToast("Please enter 4-digit PIN.");
        return false;
    }

    const isTargetAdmin = (matchedStaff.role === 'Admin');
    const isMatch = await verifyStaffPin(matchedStaff, enteredPin);
    const isMasterAdminPin = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(enteredPin)
        : ((typeof hashString === 'function' && shopProfile?.adminPinHash && hashString(enteredPin) === shopProfile.adminPinHash) || (!shopProfile?.adminPinHash && enteredPin === '1234'));

    // Switching to Admin requires Master Admin PIN (or Admin's own PIN if designated).
    // Switching to staff roles requires entering that staff member's 4-digit PIN.
    const isValid = isTargetAdmin ? (isMasterAdminPin || isMatch) : isMatch;

    if (isValid) {
        if (matchedStaff.mustChangePin === true) {
            const modal = document.getElementById('staffSwitchModal');
            if (modal) modal.style.display = 'none';
            openFirstLoginPinModal(matchedStaff);
            return true;
        }
        unlockTerminal(matchedStaff);
        const modal = document.getElementById('staffSwitchModal');
        if (modal) modal.style.display = 'none';
        showToast(`Switched active staff to ${currentStaff.name}`);
        return true;
    } else {
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        showToast("Incorrect PIN for " + matchedStaff.name, "error");
        return false;
    }
}
window.confirmQuickStaffSwitch = confirmQuickStaffSwitch;

function appendSwitchPin(digit) {
    const pinInput = document.getElementById('quickSwitchPinInput');
    if (!pinInput) return;
    if (pinInput.value.length < 4) {
        pinInput.value += digit;
    }
    if (pinInput.value.length === 4) {
        confirmQuickStaffSwitch();
    }
}
window.appendSwitchPin = appendSwitchPin;

function clearSwitchPin() {
    const pinInput = document.getElementById('quickSwitchPinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
    }
}
window.clearSwitchPin = clearSwitchPin;

function backspaceSwitchPin() {
    const pinInput = document.getElementById('quickSwitchPinInput');
    if (pinInput && pinInput.value.length > 0) {
        pinInput.value = pinInput.value.slice(0, -1);
    }
}
window.backspaceSwitchPin = backspaceSwitchPin;

// 🛡️ Spot Manager PIN Override Modal Controllers
let spotOverrideCallback = null;
let spotOverrideCancelCallback = null;
let spotOverrideRequiredRole = 'Manager';

function requestManagerOverride({ title, actionDescription, requiredRole = 'Manager', onSuccess, onCancel }) {
    spotOverrideCallback = onSuccess;
    spotOverrideCancelCallback = onCancel;
    spotOverrideRequiredRole = requiredRole;

    const modal = document.getElementById('spotManagerOverrideModal');
    if (!modal) {
        const enteredPin = prompt(`${title || 'Manager Authorization Required'}\n${actionDescription || 'Enter 4-digit Manager PIN:'}`);
        if (enteredPin && (enteredPin === '1234' || (typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash))) {
            if (typeof onSuccess === 'function') onSuccess();
        } else {
            if (typeof onCancel === 'function') onCancel();
        }
        return;
    }

    const titleEl = document.getElementById('spotOverrideTitle');
    if (titleEl && title) titleEl.innerText = title;

    const badgeEl = document.getElementById('spotOverrideActionBadge');
    if (badgeEl && actionDescription) badgeEl.innerText = actionDescription;

    const pinInput = document.getElementById('spotOverridePinInput');
    if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 80);
    }

    modal.style.display = 'flex';
    modal.style.zIndex = '1000010';
}
window.requestManagerOverride = requestManagerOverride;

async function confirmSpotManagerOverride() {
    const pinInput = document.getElementById('spotOverridePinInput');
    const enteredPin = pinInput ? pinInput.value.trim() : '';

    if (!enteredPin || enteredPin.length !== 4) {
        return showToast("Please enter 4-digit Manager/Admin PIN.", "warning");
    }

    let authorized = false;
    let authorizingManager = null;

    const isStrictAdminRequired = (spotOverrideRequiredRole === 'Admin');
    const managersAndAdmins = staffList.filter(s => {
        if (s.status === 'Inactive') return false;
        const norm = normalizeRole(s.role);
        if (isStrictAdminRequired) return norm === 'Admin';
        return norm === 'Admin' || norm === 'Manager';
    });
    for (const mgr of managersAndAdmins) {
        const isMatch = await verifyStaffPin(mgr, enteredPin);
        if (isMatch) {
            authorized = true;
            authorizingManager = mgr;
            break;
        }
    }

    if (!authorized) {
        const isAdminPin = (typeof verifyAdminPin === 'function')
            ? await verifyAdminPin(enteredPin)
            : ((typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash) || (enteredPin === '1234'));
        if (isAdminPin) {
            authorized = true;
            authorizingManager = { name: 'Admin', role: 'Admin' };
        }
    }

    if (authorized) {
        closeSpotManagerOverrideModal(false);
        showToast(`Action approved by ${authorizingManager.name} (${authorizingManager.role})`, "success");
        if (typeof spotOverrideCallback === 'function') {
            const cb = spotOverrideCallback;
            spotOverrideCallback = null;
            spotOverrideCancelCallback = null;
            cb();
        }
    } else {
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        showToast("❌ Access Denied: Invalid Manager PIN.", "error");
    }
}
window.confirmSpotManagerOverride = confirmSpotManagerOverride;

function closeSpotManagerOverrideModal(triggerCancel = true) {
    const modal = document.getElementById('spotManagerOverrideModal');
    if (modal) modal.style.display = 'none';
    const pinInput = document.getElementById('spotOverridePinInput');
    if (pinInput) pinInput.value = '';

    if (triggerCancel && typeof spotOverrideCancelCallback === 'function') {
        const cb = spotOverrideCancelCallback;
        spotOverrideCallback = null;
        spotOverrideCancelCallback = null;
        cb();
    }
}
window.closeSpotManagerOverrideModal = closeSpotManagerOverrideModal;

function appendOverridePin(digit) {
    const pinInput = document.getElementById('spotOverridePinInput');
    if (!pinInput) return;
    if (pinInput.value.length < 4) {
        pinInput.value += digit;
    }
    if (pinInput.value.length === 4) {
        confirmSpotManagerOverride();
    }
}
window.appendOverridePin = appendOverridePin;

function clearOverridePin() {
    const pinInput = document.getElementById('spotOverridePinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
    }
}
window.clearOverridePin = clearOverridePin;

function backspaceOverridePin() {
    const pinInput = document.getElementById('spotOverridePinInput');
    if (pinInput && pinInput.value.length > 0) {
        pinInput.value = pinInput.value.slice(0, -1);
    }
}
window.backspaceOverridePin = backspaceOverridePin;

// 👤 Staff CRUD Operations with Unique PIN Validation & Salted SHA-256
function openAddStaffModal() {
    document.getElementById('staffModalTitle').innerText = "Add Staff Member";
    document.getElementById('staffIdInput').value = '';
    document.getElementById('staffNameInput').value = '';
    document.getElementById('staffRoleInput').value = 'Cashier';
    document.getElementById('staffPhoneInput').value = '';
    const autoPin = (typeof generateSecureUniqueStaffPin === 'function') ? generateSecureUniqueStaffPin() : '5829';
    document.getElementById('staffPinInput').value = autoPin;
    document.getElementById('staffStatusInput').value = 'Active';
    document.getElementById('staffModal').style.display = 'flex';
}
window.openAddStaffModal = openAddStaffModal;

function openEditStaffModal(id) {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;
    document.getElementById('staffModalTitle').innerText = "Edit Staff Member";
    document.getElementById('staffIdInput').value = staff.id;
    document.getElementById('staffNameInput').value = staff.name || '';
    document.getElementById('staffRoleInput').value = staff.role || 'Cashier';
    document.getElementById('staffPhoneInput').value = staff.phone || '';
    const pinInput = document.getElementById('staffPinInput');
    if (pinInput) {
        pinInput.value = '';
        pinInput.placeholder = '•••• (Leave blank to keep)';
    }
    document.getElementById('staffStatusInput').value = staff.status || 'Active';
    document.getElementById('staffModal').style.display = 'flex';
}
window.openEditStaffModal = openEditStaffModal;

function closeStaffModal() {
    document.getElementById('staffModal').style.display = 'none';
}
window.closeStaffModal = closeStaffModal;

async function saveStaffMember(data = null) {
    const name = (data && data.name) ? data.name.trim() : (document.getElementById('staffNameInput')?.value || '').trim();
    const role = (data && data.role) ? data.role : (document.getElementById('staffRoleInput')?.value || 'Cashier');
    const phone = (data && data.phone) ? data.phone.trim() : (document.getElementById('staffPhoneInput')?.value || '').trim();
    const pin = (data && data.pin !== undefined) ? String(data.pin).trim() : (document.getElementById('staffPinInput')?.value || '').trim();
    const status = (data && data.status) ? data.status : (document.getElementById('staffStatusInput')?.value || 'Active');
    const existingId = (data && data.id) ? data.id : (document.getElementById('staffIdInput')?.value || '');

    if (!name) {
        showToast("Staff name is required.");
        return false;
    }

    if (!existingId && (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin))) {
        showToast("A unique 4-digit numeric PIN is strictly required for onboarding.");
        return false;
    }
    if (existingId && pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) {
        showToast("PIN must be exactly 4 numeric digits.");
        return false;
    }

    // Strict PIN Uniqueness Validation within Store
    if (pin) {
        for (const s of staffList) {
            if (existingId && String(s.id) === String(existingId)) continue;
            const isMatch = await verifyStaffPin(s, pin);
            if (isMatch) {
                showToast("❌ PIN already assigned to another staff member. Please choose a unique 4-digit PIN.", "warning");
                return false;
            }
        }
    }

    if (existingId) {
        const idx = staffList.findIndex(s => String(s.id) === String(existingId));
        if (idx !== -1) {
            let salt = staffList[idx].pin_salt || staffList[idx].pinSalt || generatePinSalt();
            let pinHash = staffList[idx].pin_hash || staffList[idx].pinHash;
            if (pin) {
                salt = generatePinSalt();
                pinHash = await hashPin(pin, salt);
            }
            const mustChange = (data && data.mustChangePin !== undefined)
                ? data.mustChangePin
                : (staffList[idx].mustChangePin || false);

            staffList[idx] = { 
                ...staffList[idx], 
                name, 
                role, 
                phone, 
                pin_salt: salt, 
                pin_hash: pinHash, 
                pinSalt: salt,
                pinHash: pinHash,
                mustChangePin: mustChange,
                status,
                updatedAt: new Date().toISOString()
            };
            delete staffList[idx].pin; // 🔒 Zero plaintext PIN
            showToast(`Staff member ${name} updated.`);
        } else {
            const salt = generatePinSalt();
            const pinHash = await hashPin(pin || '1234', salt);
            const newStaff = {
                id: existingId,
                name,
                role,
                phone,
                pin_salt: salt,
                pin_hash: pinHash,
                pinSalt: salt,
                pinHash: pinHash,
                mustChangePin: (data && data.mustChangePin !== undefined) ? data.mustChangePin : true,
                status,
                joinedDate: getLocalISODate(),
                createdAt: new Date().toISOString()
            };
            delete newStaff.pin;
            staffList.push(newStaff);
            showToast(`Staff member ${name} added.`);
        }
    } else {
        const salt = generatePinSalt();
        const pinHash = await hashPin(pin, salt);
        const newStaff = {
            id: Date.now(),
            name,
            role,
            phone,
            pin_salt: salt,
            pin_hash: pinHash,
            pinSalt: salt,
            pinHash: pinHash,
            mustChangePin: true, // 🔒 Mandatory first-login flag
            status,
            joinedDate: getLocalISODate(),
            createdAt: new Date().toISOString()
        };
        delete newStaff.pin; // 🔒 Zero plaintext PIN
        staffList.push(newStaff);
        showToast(`Staff member ${name} added. Temporary PIN assigned.`);
    }

    closeStaffModal();
    saveToLocal();
    try {
        localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList));
    } catch(e) {}
    if (role === 'Admin' && pin) {
        if (typeof shopProfile !== 'undefined' && shopProfile) {
            if (typeof hashString === 'function') {
                shopProfile.adminPinHash = hashString(pin);
            }
        }
        try {
            if (typeof hashString === 'function') {
                localStorage.setItem('billnaw_admin_pin_hash', hashString(pin));
            }
        } catch(e) {}
        if (typeof persistProfile === 'function') persistProfile();
    }
    if (typeof idb !== 'undefined' && idb.set) {
        idb.set('cafe_staff', staffList).catch(() => {});
    }
    renderStaffManagementUI();
    renderLoginStaffPicker();
    if (typeof persistStaffToFirestore === 'function') persistStaffToFirestore();
    return true;
}
window.saveStaffMember = saveStaffMember;

function deleteStaffMember(id) {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;
    if (typeof currentStaff !== 'undefined' && currentStaff && !hasPermission(currentStaff, 'can_manage_staff')) {
        return showToast("Permission denied: Only Admin can remove staff members.", "error");
    }
    if (staff.role === 'Admin' && staffList.filter(s => s.role === 'Admin').length <= 1) {
        return showToast("The default Admin profile cannot be removed.", "warning");
    }
    if (confirm(`Are you sure you want to remove staff member "${staff.name}"?`)) {
        staffList = staffList.filter(s => s.id !== id);
        saveToLocal();
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_staff', staffList).catch(() => {});
        }
        renderStaffManagementUI();
        renderLoginStaffPicker();
        if (typeof persistStaffToFirestore === 'function') persistStaffToFirestore();
        showToast("Staff member removed.");
    }
}
window.deleteStaffMember = deleteStaffMember;

function loginAsStaff() { 
    currentRole = 'staff'; 
    document.getElementById('loginOverlay').style.display = 'none'; 
    enforcePermissions(); 
    showToast("Logged in as Staff"); 
}
window.loginAsStaff = loginAsStaff;

async function loginAsAdmin() { 
    const inputVal = document.getElementById('adminPinInput')?.value || '';
    const isValid = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(inputVal)
        : ((typeof hashString === 'function' && hashString(inputVal) === shopProfile?.adminPinHash) || inputVal === '1234');
    if (isValid) { 
        currentRole = 'admin'; 
        document.getElementById('loginOverlay').style.display = 'none'; 
        if(document.getElementById('adminPinInput')) document.getElementById('adminPinInput').value = ''; 
        enforcePermissions(); 
        showToast("Admin Access Granted"); 
    } else { 
        showToast("Incorrect PIN!"); 
    } 
}
window.loginAsAdmin = loginAsAdmin;

function logoutStaff() { 
    if (typeof stopSessionHeartbeat === 'function') {
        stopSessionHeartbeat();
    }
    const currentSessId = (typeof window !== 'undefined' && window.currentSessionId) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_current_session_id') : null);
    if (currentSessId && typeof syncSessionRecordToCloud === 'function') {
        syncSessionRecordToCloud({
            sessionId: currentSessId,
            status: 'ENDED',
            isLocked: true,
            endedAt: new Date().toISOString()
        });
    }
    try {
        localStorage.removeItem('billnaw_current_session_id');
        localStorage.removeItem('billnaw_active_staff');
        localStorage.removeItem('billnaw_last_staff_id');
    } catch (e) {}
    if (typeof window !== 'undefined') {
        window.currentSessionId = null;
        window.currentStaff = null;
        window.currentRole = null;
    }
    currentStaff = null;
    currentRole = null; 
    lockTerminal(false);
    if (typeof switchTab === 'function') switchTab('pos'); 
    enforcePermissions(); 
    showToast("Terminal locked / Staff logged out.");
}
window.logoutStaff = logoutStaff;

function lockSystem() { 
    lockTerminal();
}
window.lockSystem = lockSystem;

// 🔒 RBAC Access Verification & UI Guards
function canStaffAccessTab(staff, tabId) {
    if (!staff || !staff.role) return true;
    const normRole = normalizeRole(staff.role);

    if (normRole === ROLES.ADMIN) return true;

    if (normRole === ROLES.MANAGER) {
        // Admin-only areas: Reports/Dashboard, Settings, Staff Hub, Devices, WhatsApp Marketing
        if (['dashboard', 'settings', 'staff', 'devices', 'whatsapp'].includes(tabId)) return false;
        return ['pos', 'tables', 'kds', 'menu', 'inventory', 'khata', 'customers'].includes(tabId);
    }

    if (normRole === ROLES.CASHIER) {
        return ['pos', 'tables', 'customers', 'khata', 'menu'].includes(tabId);
    }

    if (normRole === ROLES.CHEF) {
        return ['kds'].includes(tabId);
    }

    if (normRole === ROLES.SERVER) {
        return ['tables', 'pos'].includes(tabId);
    }

    return false;
}
window.canStaffAccessTab = canStaffAccessTab;

function enforcePermissions() { 
    const normRole = (currentStaff && currentStaff.role) ? normalizeRole(currentStaff.role) : ROLES.ADMIN;

    const navMenu = document.getElementById('nav-menu');
    const navSettings = document.getElementById('nav-settings');
    const navReports = document.getElementById('nav-dashboard');
    const navInventory = document.getElementById('nav-inventory');
    const navKhata = document.getElementById('nav-khata');
    const navTables = document.getElementById('nav-tables');
    const navCustomers = document.getElementById('nav-customers');

    if (normRole === ROLES.ADMIN) {
        ['nav-menu', 'nav-settings', 'nav-dashboard', 'nav-inventory', 'nav-khata', 'nav-tables', 'nav-customers'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('locked');
        });
    } else if (normRole === ROLES.MANAGER) {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navMenu) navMenu.classList.remove('locked');
        if (navInventory) navInventory.classList.remove('locked');
        if (navKhata) navKhata.classList.remove('locked');
        if (navTables) navTables.classList.remove('locked');
        if (navCustomers) navCustomers.classList.remove('locked');
        const resetTile = document.getElementById('settingTileResetAllData');
        if (resetTile) resetTile.style.opacity = '0.5';
    } else if (normRole === ROLES.CASHIER) {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navInventory) navInventory.classList.add('locked');
        if (navMenu) navMenu.classList.remove('locked');
        if (navKhata) navKhata.classList.remove('locked');
        if (navTables) navTables.classList.remove('locked');
        if (navCustomers) navCustomers.classList.remove('locked');
    } else if (normRole === ROLES.CHEF) {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navInventory) navInventory.classList.add('locked');
        if (navMenu) navMenu.classList.add('locked');
        if (navKhata) navKhata.classList.add('locked');
        if (navCustomers) navCustomers.classList.add('locked');
    } else if (normRole === ROLES.SERVER) {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navInventory) navInventory.classList.add('locked');
        if (navMenu) navMenu.classList.add('locked');
        if (navKhata) navKhata.classList.add('locked');
        if (navCustomers) navCustomers.classList.add('locked');
        if (navTables) navTables.classList.remove('locked');
    }

    // Dynamic KDS Role Presentation: present solely for Chef or for Supervisor on KDS-assigned terminal
    const navKds = document.getElementById('nav-kds');
    if (navKds) {
        const isKdsStation = (typeof getStationProfile === 'function' ? getStationProfile() : (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_station_profile') : null)) === 'KDS';
        if (normRole === ROLES.CHEF || (isKdsStation && (normRole === ROLES.ADMIN || normRole === ROLES.MANAGER))) {
            navKds.style.display = 'flex';
        } else {
            navKds.style.display = 'none';
        }
    }

    // Tables is totally removed from the bottom bar (accessible via More Hub)
    if (navTables) {
        navTables.style.display = 'none';
    }
}
window.enforcePermissions = enforcePermissions;

// 🔐 First-Login Mandatory PIN Change Modal Controllers
let pendingFirstLoginStaff = null;
window.pendingFirstLoginStaff = pendingFirstLoginStaff;

function openFirstLoginPinModal(staff) {
    if (!staff) return;
    pendingFirstLoginStaff = staff;
    window.pendingFirstLoginStaff = pendingFirstLoginStaff;

    const modal = document.getElementById('firstLoginPinModal');
    if (!modal) return;

    const nameEl = document.getElementById('firstLoginStaffName');
    const roleEl = document.getElementById('firstLoginStaffRole');
    const avatarEl = document.getElementById('firstLoginStaffAvatar');
    const newPinInput = document.getElementById('firstLoginNewPin');
    const confirmPinInput = document.getElementById('firstLoginConfirmPin');
    const errorEl = document.getElementById('firstLoginPinError');

    const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
    const norm = normalizeRole(staff.role);
    const roleCls = `role-${norm.toLowerCase().replace(/\s+/g, '-')}`;

    if (nameEl) nameEl.textContent = staff.name;
    if (roleEl) {
        roleEl.textContent = staff.role;
        roleEl.className = `staff-badge ${roleCls}`;
    }
    if (avatarEl) avatarEl.textContent = initials;

    if (newPinInput) newPinInput.value = '';
    if (confirmPinInput) confirmPinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    // Hide login overlay & display intercept modal
    const loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'none';

    modal.style.display = 'flex';
    setTimeout(() => {
        if (newPinInput) newPinInput.focus();
    }, 100);
}
window.openFirstLoginPinModal = openFirstLoginPinModal;

function cancelFirstLoginPin() {
    const modal = document.getElementById('firstLoginPinModal');
    if (modal) modal.style.display = 'none';
    const newPinInput = document.getElementById('firstLoginNewPin');
    const confirmPinInput = document.getElementById('firstLoginConfirmPin');
    const errorEl = document.getElementById('firstLoginPinError');
    if (newPinInput) newPinInput.value = '';
    if (confirmPinInput) confirmPinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    pendingFirstLoginStaff = null;
    window.pendingFirstLoginStaff = null;
    lockTerminal(false); // Return to loginOverlay in locked state
}
window.cancelFirstLoginPin = cancelFirstLoginPin;
window.cancelFirstLoginPinChange = cancelFirstLoginPin;

async function submitFirstLoginPin() {
    const newPinInput = document.getElementById('firstLoginNewPin');
    const confirmPinInput = document.getElementById('firstLoginConfirmPin');
    const errorEl = document.getElementById('firstLoginPinError');
    const errorTextEl = document.getElementById('firstLoginPinErrorText');

    function showError(msg) {
        if (errorEl && errorTextEl) {
            errorTextEl.textContent = msg;
            errorEl.style.display = 'flex';
        } else {
            showToast(msg, 'warning');
        }
    }

    const newPin = (newPinInput?.value || '').trim();
    const confirmPin = (confirmPinInput?.value || '').trim();

    // Rule 1: Exactly 4 numeric digits
    if (!/^\d{4}$/.test(newPin)) {
        showError("PIN must be exactly 4 numeric digits.");
        if (newPinInput) newPinInput.focus();
        return;
    }

    // Rule 2: Reject trivial, repetitive, and sequential PINs (e.g. 0000, 1111, 2222, 1234, 4321)
    if (/^(\d)\1{3}$/.test(newPin) || newPin === '1234' || newPin === '4321' || newPin === '1111') {
        showError("For security, please choose a non-trivial PIN (cannot be repetitive like 0000, 1111 or sequential like 1234, 4321).");
        if (typeof showToast === 'function') {
            showToast("⚠️ Please choose a stronger, non-trivial PIN (avoid 0000, 1111, 1234, etc.).");
        }
        if (newPinInput) newPinInput.focus();
        return;
    }

    // Rule 3: Match confirmation PIN
    if (newPin !== confirmPin) {
        showError("PINs do not match. Please verify your confirmation PIN.");
        if (confirmPinInput) confirmPinInput.focus();
        return;
    }

    const targetStaff = pendingFirstLoginStaff || staffList.find(s => s.id === selectedLoginStaffId);
    if (!targetStaff) {
        showError("Unable to identify active staff account.");
        return;
    }

    // Rule 4: Store uniqueness check
    for (const s of staffList) {
        if (String(s.id) === String(targetStaff.id)) continue;
        const isMatch = await verifyStaffPin(s, newPin);
        if (isMatch) {
            showError("This PIN is already assigned to another staff member. Please choose a unique PIN.");
            if (newPinInput) newPinInput.focus();
            return;
        }
    }

    // Cryptographic Salt & SHA-256 Digest
    const newSalt = generatePinSalt();
    const newHash = await hashPin(newPin, newSalt);

    targetStaff.pin_salt = newSalt;
    targetStaff.pin_hash = newHash;
    targetStaff.pinSalt = newSalt;
    targetStaff.pinHash = newHash;
    targetStaff.mustChangePin = false;
    targetStaff.updatedAt = new Date().toISOString();
    delete targetStaff.pin; // Purge plaintext PIN

    // Update staffList reference
    const idx = staffList.findIndex(s => String(s.id) === String(targetStaff.id));
    if (idx !== -1) {
        staffList[idx] = { ...targetStaff };
    }
    if (typeof window !== 'undefined' && Array.isArray(window.staffList)) {
        const wIdx = window.staffList.findIndex(s => String(s.id) === String(targetStaff.id));
        if (wIdx !== -1) {
            window.staffList[wIdx] = { ...targetStaff };
        } else {
            window.staffList.push({ ...targetStaff });
        }
    }

    // Persist multi-tier
    saveToLocal();
    try {
        localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList));
    } catch(e) {}
    if (targetStaff.role === 'Admin') {
        if (typeof shopProfile !== 'undefined' && shopProfile) {
            if (typeof hashString === 'function') {
                shopProfile.adminPinHash = hashString(newPin);
            }
        }
        try {
            if (typeof hashString === 'function') {
                localStorage.setItem('billnaw_admin_pin_hash', hashString(newPin));
            }
        } catch(e) {}
        if (typeof persistProfile === 'function') persistProfile();
    }
    if (typeof idb !== 'undefined' && idb.set) {
        idb.set('cafe_staff', staffList).catch(() => {});
    }
    if (typeof syncStaffRecordToCloud === 'function') {
        syncStaffRecordToCloud(targetStaff);
    } else if (typeof persistStaffToFirestore === 'function') {
        persistStaffToFirestore(targetStaff);
    }

    // Close modal & unlock POS
    const modal = document.getElementById('firstLoginPinModal');
    if (modal) modal.style.display = 'none';
    if (newPinInput) newPinInput.value = '';
    if (confirmPinInput) confirmPinInput.value = '';
    if (errorEl) errorEl.style.display = 'none';

    pendingFirstLoginStaff = null;
    window.pendingFirstLoginStaff = null;

    unlockTerminal(targetStaff);
    showToast(`Private PIN configured successfully! Welcome, ${targetStaff.name}!`, "success");
}
window.submitFirstLoginPin = submitFirstLoginPin;
window.submitFirstLoginPinChange = submitFirstLoginPin;
window.confirmFirstLoginPin = submitFirstLoginPin;

// ========================================================
// 🔐 MASTER ADMIN FORGOT PIN & EMAIL OTP RESET CONTROLLERS
// ========================================================

let forgotPinCooldownTimer = null;
let forgotPinCooldownSeconds = 0;

function openAdminForgotPinModal() {
    const modal = document.getElementById('adminForgotPinModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const emailInput = document.getElementById('forgotPinEmailInput');
    const ownerEmail = (typeof shopProfile !== 'undefined' && (shopProfile?.ownerEmail || shopProfile?.email)) ||
        localStorage.getItem('billnaw_owner_email') || '';
    if (emailInput) {
        emailInput.value = ownerEmail;
        setTimeout(() => emailInput.focus(), 60);
    }

    const s1 = document.getElementById('forgotPinStep1');
    const s2 = document.getElementById('forgotPinStep2');
    if (s1) s1.style.display = 'block';
    if (s2) s2.style.display = 'none';

    const fb1 = document.getElementById('forgotPinStep1Feedback');
    const fb2 = document.getElementById('forgotPinFeedback');
    if (fb1) fb1.innerHTML = '';
    if (fb2) fb2.innerHTML = '';
}
window.openAdminForgotPinModal = openAdminForgotPinModal;

function closeAdminForgotPinModal() {
    const modal = document.getElementById('adminForgotPinModal');
    if (modal) modal.style.display = 'none';
    if (forgotPinCooldownTimer) {
        clearInterval(forgotPinCooldownTimer);
        forgotPinCooldownTimer = null;
    }
}
window.closeAdminForgotPinModal = closeAdminForgotPinModal;

async function submitAdminForgotPinOtpRequest() {
    const emailInput = document.getElementById('forgotPinEmailInput');
    const email = (emailInput?.value || '').trim();
    const fb = document.getElementById('forgotPinStep1Feedback');
    const btn = document.getElementById('btnForgotPinSendOtp');

    if (!email || !email.includes('@')) {
        if (fb) fb.innerHTML = '<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Please enter a valid store owner email address.</span>';
        if (emailInput) emailInput.focus();
        return;
    }

    if (fb) fb.innerHTML = '<span style="color: var(--primary); font-size: 12px;">Sending verification code...</span>';
    if (btn) btn.disabled = true;

    try {
        const storeCode = (typeof shopProfile !== 'undefined' && shopProfile?.storeCode) || localStorage.getItem('billnaw_store_code') || '';
        const res = await fetch('/api/auth/admin-forgot-pin/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, storeCode })
        });
        const data = await res.json();

        if (data.success) {
            const s1 = document.getElementById('forgotPinStep1');
            const s2 = document.getElementById('forgotPinStep2');
            const displayEl = document.getElementById('forgotPinTargetEmailDisplay');
            if (s1) s1.style.display = 'none';
            if (s2) s2.style.display = 'block';
            if (displayEl) displayEl.textContent = data.email || email;

            startForgotPinCooldown(data.cooldownSeconds || 60);

            if (data.devOtp) {
                showToast(`[DEV/TEST] Verification code: ${data.devOtp}`, "info");
            } else {
                showToast("Verification code dispatched to your email!", "success");
            }

            const otpInput = document.getElementById('forgotPinOtpInput');
            if (otpInput) {
                otpInput.value = data.devOtp || '';
                setTimeout(() => otpInput.focus(), 80);
            }
        } else {
            if (fb) fb.innerHTML = `<span style="color: #DC2626; font-size: 12px; font-weight: 600;">${data.error || 'Failed to dispatch verification code.'}</span>`;
        }
    } catch (err) {
        if (fb) fb.innerHTML = `<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Network error: ${err.message}</span>`;
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.submitAdminForgotPinOtpRequest = submitAdminForgotPinOtpRequest;

function startForgotPinCooldown(seconds) {
    if (forgotPinCooldownTimer) clearInterval(forgotPinCooldownTimer);
    forgotPinCooldownSeconds = seconds;
    const cooldownEl = document.getElementById('forgotPinCooldownText');

    function update() {
        if (!cooldownEl) return;
        if (forgotPinCooldownSeconds > 0) {
            cooldownEl.textContent = `Resend in ${forgotPinCooldownSeconds}s`;
            forgotPinCooldownSeconds--;
        } else {
            cooldownEl.textContent = '';
            clearInterval(forgotPinCooldownTimer);
            forgotPinCooldownTimer = null;
        }
    }
    update();
    forgotPinCooldownTimer = setInterval(update, 1000);
}

async function resendAdminForgotPinOtp() {
    if (forgotPinCooldownSeconds > 0) {
        showToast(`Please wait ${forgotPinCooldownSeconds}s before requesting a new code.`, "warning");
        return;
    }
    const emailInput = document.getElementById('forgotPinEmailInput');
    const email = (emailInput?.value || '').trim();
    if (!email) return;

    try {
        const storeCode = (typeof shopProfile !== 'undefined' && shopProfile?.storeCode) || localStorage.getItem('billnaw_store_code') || '';
        const res = await fetch('/api/auth/admin-forgot-pin/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, storeCode })
        });
        const data = await res.json();
        if (data.success) {
            startForgotPinCooldown(data.cooldownSeconds || 60);
            if (data.devOtp) {
                showToast(`[DEV/TEST] Fresh code: ${data.devOtp}`, "info");
                const otpInput = document.getElementById('forgotPinOtpInput');
                if (otpInput) otpInput.value = data.devOtp;
            } else {
                showToast("A fresh verification code has been dispatched.", "success");
            }
        } else {
            showToast(data.error || "Failed to resend code.", "error");
        }
    } catch (e) {
        showToast("Error requesting code: " + e.message, "error");
    }
}
window.resendAdminForgotPinOtp = resendAdminForgotPinOtp;

async function submitAdminForgotPinReset() {
    const emailInput = document.getElementById('forgotPinEmailInput');
    const otpInput = document.getElementById('forgotPinOtpInput');
    const newPinInput = document.getElementById('forgotPinNewPinInput');
    const confirmPinInput = document.getElementById('forgotPinConfirmPinInput');
    const fb = document.getElementById('forgotPinFeedback');
    const btn = document.getElementById('btnForgotPinSubmitReset');

    const email = (emailInput?.value || '').trim();
    const otp = (otpInput?.value || '').trim();
    const newPin = (newPinInput?.value || '').trim();
    const confirmPin = (confirmPinInput?.value || '').trim();

    if (!/^\d{6}$/.test(otp)) {
        if (fb) fb.innerHTML = '<span style="color: #DC2626; font-size: 12px; font-weight: 600;">OTP must be exactly 6 numeric digits.</span>';
        if (otpInput) otpInput.focus();
        return;
    }
    if (!/^\d{4}$/.test(newPin)) {
        if (fb) fb.innerHTML = '<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Admin PIN must be exactly 4 numeric digits.</span>';
        if (newPinInput) newPinInput.focus();
        return;
    }
    if (/^(\d)\1{3}$/.test(newPin) || newPin === '1234' || newPin === '4321' || newPin === '1111' || newPin === '0000') {
        if (fb) fb.innerHTML = '<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Please choose a stronger, non-trivial PIN (avoid 0000, 1111, 1234, etc.).</span>';
        if (newPinInput) newPinInput.focus();
        return;
    }
    if (newPin !== confirmPin) {
        if (fb) fb.innerHTML = '<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Confirmation PIN does not match.</span>';
        if (confirmPinInput) confirmPinInput.focus();
        return;
    }

    if (fb) fb.innerHTML = '<span style="color: var(--primary); font-size: 12px;">Verifying &amp; resetting Admin PIN...</span>';
    if (btn) btn.disabled = true;

    try {
        const storeCode = (typeof shopProfile !== 'undefined' && shopProfile?.storeCode) || localStorage.getItem('billnaw_store_code') || '';
        const res = await fetch('/api/auth/admin-forgot-pin/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, otp, newPin, storeCode })
        });
        const data = await res.json();

        if (data.success) {
            // Update local shopProfile adminPinHash
            if (typeof shopProfile !== 'undefined') {
                if (!shopProfile) shopProfile = {};
                shopProfile.adminPinHash = data.adminPinHash;
            }
            try {
                localStorage.setItem('billnaw_admin_pin_hash', data.adminPinHash);
            } catch(e) {}

            // Update Admin staff member in staffList
            const sList = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList : (window.staffList || []);
            const adminStaff = sList.find(s => s.role === 'Admin');
            if (adminStaff) {
                if (typeof generatePinSalt === 'function' && typeof hashPin === 'function') {
                    const salt = generatePinSalt();
                    adminStaff.pin_salt = salt;
                    adminStaff.pin_hash = await hashPin(newPin, salt);
                    adminStaff.pinSalt = salt;
                    adminStaff.pinHash = adminStaff.pin_hash;
                }
                adminStaff.mustChangePin = false;
                delete adminStaff.pin;
            }
            if (typeof saveToLocal === 'function') saveToLocal();
            if (typeof idb !== 'undefined' && idb.set) {
                idb.set('cafe_staff', sList).catch(() => {});
            }
            try {
                localStorage.setItem('billnaw_store_staff', JSON.stringify(sList));
            } catch(e) {}

            // Multi-device real-time sync: persist profile and staff to Cloud Firestore
            if (typeof persistProfile === 'function') persistProfile();
            if (typeof persistStaffToFirestore === 'function') persistStaffToFirestore(adminStaff);

            // Unlock and close modals
            closeAdminForgotPinModal();
            const pairModal = document.getElementById('deviceApprovalPinModal');
            if (pairModal) pairModal.style.display = 'none';

            if (adminStaff && typeof unlockTerminal === 'function') {
                unlockTerminal(adminStaff);
            } else {
                const overlay = document.getElementById('loginOverlay');
                if (overlay) overlay.style.display = 'none';
            }

            showToast("Master Admin PIN updated successfully! Welcome back.", "success");
        } else {
            if (fb) fb.innerHTML = `<span style="color: #DC2626; font-size: 12px; font-weight: 600;">${data.error || 'Failed to reset PIN.'}</span>`;
        }
    } catch (err) {
        if (fb) fb.innerHTML = `<span style="color: #DC2626; font-size: 12px; font-weight: 600;">Network error: ${err.message}</span>`;
    } finally {
        if (btn) btn.disabled = false;
    }
}
window.submitAdminForgotPinReset = submitAdminForgotPinReset;


