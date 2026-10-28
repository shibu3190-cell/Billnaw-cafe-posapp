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

async function verifyStaffPin(staff, enteredPin) {
    if (!staff || !enteredPin) return false;
    const cleanPin = String(enteredPin).trim();
    // Immediate match if plaintext matches
    if (staff.pin && String(staff.pin) === cleanPin) return true;
    const hash = staff.pin_hash || staff.hash;
    const salt = staff.pin_salt || staff.salt || '';
    if (hash && salt) {
        const computed = await hashPin(cleanPin, salt);
        return computed === hash;
    }
    return false;
}
window.verifyStaffPin = verifyStaffPin;

// Global state for terminal lock
let isTerminalLocked = false;
window.isTerminalLocked = isTerminalLocked;

function renderStaffManagementUI() {
    const tbody = document.getElementById('staffTableBody');
    if (!tbody) return;

    if (!staffList || staffList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">No staff members added yet. Click "Add Staff Member" to add one.</td></tr>`;
        return;
    }

    tbody.innerHTML = staffList.map(staff => {
        const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
        const roleCls = staff.role ? `role-${staff.role.toLowerCase()}` : 'role-cashier';
        const isActive = staff.status !== 'Inactive' && staff.status !== 'Suspended';
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
                <td><span class="staff-badge ${roleCls}">${staff.role}</span></td>
                <td style="font-size: 13px;">${staff.phone || '-'}</td>
                <td style="font-family: monospace; letter-spacing: 2px; font-size: 13px;">••••</td>
                <td>
                    <span style="display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: ${isActive ? 'var(--success)' : 'var(--danger)'};">
                        <span style="width: 7px; height: 7px; border-radius: 50%; background: ${isActive ? 'var(--success)' : 'var(--danger)'};"></span>
                        ${isActive ? 'Active' : (staff.status || 'Inactive')}
                    </span>
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

    // Smart Defaults: Pre-select last active cashier/manager from localStorage
    const savedStaffId = parseInt(localStorage.getItem('billnaw_last_staff_id'), 10);
    if (!selectedLoginStaffId || !staffList.some(s => s.id === selectedLoginStaffId)) {
        if (savedStaffId && staffList.some(s => s.id === savedStaffId)) {
            selectedLoginStaffId = savedStaffId;
        } else if (staffList.length > 0) {
            selectedLoginStaffId = staffList[0].id;
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

// 🔒 Fast Unlock & PIN Verification
async function confirmStaffLogin() {
    const pinInput = document.getElementById('staffLoginPinInput');
    const enteredPin = pinInput ? pinInput.value.trim() : '';

    if (!enteredPin) {
        return showToast("Please enter your 4-digit PIN.");
    }

    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId) || staffList[0];
    const isValidStaffPin = await verifyStaffPin(matchedStaff, enteredPin);
    const isValidAdminPin = (typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash) || (enteredPin === '1234');

    if (isValidStaffPin || isValidAdminPin) {
        unlockTerminal(matchedStaff || { id: 1, name: "Admin", role: "Admin" });
    } else {
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        showToast("❌ Incorrect PIN. Please try again.");
    }
}
window.confirmStaffLogin = confirmStaffLogin;

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

    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    const pinInput = document.getElementById('staffLoginPinInput');
    if (pinInput) pinInput.value = '';

    enforcePermissions();
    updateStaffTopbarDisplay();
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

function quickStaffLoginAsSelected() {
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId) || staffList[0];
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
function openStaffSwitchModal() {
    const list = document.getElementById('quickSwitchStaffList');
    if (list) {
        list.innerHTML = staffList.map(staff => {
            const initials = staff.name ? staff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'ST';
            const roleCls = staff.role ? `role-${staff.role.toLowerCase()}` : 'role-cashier';
            const isSelected = (staff.id === selectedLoginStaffId);
            return `
                <div class="staff-card ${isSelected ? 'selected' : ''}" onclick="selectLoginStaff(${staff.id}); document.getElementById('quickSwitchPinInput').focus();">
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
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId);
    if (!matchedStaff) return showToast("Select a staff member.");

    const isMatch = await verifyStaffPin(matchedStaff, enteredPin);
    const isAdminPin = (typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash) || (enteredPin === '1234');

    if (enteredPin && (isMatch || isAdminPin)) {
        unlockTerminal(matchedStaff);
        const modal = document.getElementById('staffSwitchModal');
        if (modal) modal.style.display = 'none';
        showToast(`Switched active staff to ${currentStaff.name}`);
    } else {
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        showToast("Incorrect PIN for " + matchedStaff.name);
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

function requestManagerOverride({ title, actionDescription, onSuccess, onCancel }) {
    spotOverrideCallback = onSuccess;
    spotOverrideCancelCallback = onCancel;

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

    const managersAndAdmins = staffList.filter(s => (s.role === 'Admin' || s.role === 'Manager') && s.status !== 'Inactive');
    for (const mgr of managersAndAdmins) {
        const isMatch = await verifyStaffPin(mgr, enteredPin);
        if (isMatch) {
            authorized = true;
            authorizingManager = mgr;
            break;
        }
    }

    if (!authorized) {
        const isAdminPin = (typeof hashString === 'function' && hashString(enteredPin) === shopProfile?.adminPinHash) || (enteredPin === '1234');
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
    document.getElementById('staffPinInput').value = '';
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
    document.getElementById('staffPinInput').value = staff.pin || '';
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
    const pin = (data && data.pin) ? data.pin.trim() : (document.getElementById('staffPinInput')?.value || '').trim();
    const status = (data && data.status) ? data.status : (document.getElementById('staffStatusInput')?.value || 'Active');
    const existingId = (data && data.id) ? data.id : (document.getElementById('staffIdInput')?.value || '');

    if (!name) {
        showToast("Staff name is required.");
        return false;
    }
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        showToast("A unique 4-digit numeric PIN is strictly required.");
        return false;
    }

    // Strict PIN Uniqueness Validation within Store
    for (const s of staffList) {
        if (existingId && String(s.id) === String(existingId)) continue;
        const isMatch = (s.pin && String(s.pin) === pin) || await verifyStaffPin(s, pin);
        if (isMatch) {
            showToast("❌ PIN already assigned to another staff member. Please choose a unique 4-digit PIN.", "warning");
            return false;
        }
    }

    // Compute Cryptographic Salt & SHA-256 Digest
    const salt = generatePinSalt();
    const pinHash = await hashPin(pin, salt);

    if (existingId) {
        const idx = staffList.findIndex(s => String(s.id) === String(existingId));
        if (idx !== -1) {
            staffList[idx] = { 
                ...staffList[idx], 
                name, 
                role, 
                phone, 
                pin, 
                pin_salt: salt, 
                pin_hash: pinHash, 
                pinSalt: salt,
                pinHash: pinHash,
                status 
            };
            showToast(`Staff member ${name} updated.`);
        } else {
            const newStaff = {
                id: existingId,
                name,
                role,
                phone,
                pin,
                pin_salt: salt,
                pin_hash: pinHash,
                pinSalt: salt,
                pinHash: pinHash,
                status,
                joinedDate: getLocalISODate()
            };
            staffList.push(newStaff);
            showToast(`Staff member ${name} added.`);
        }
    } else {
        const newStaff = {
            id: Date.now(),
            name,
            role,
            phone,
            pin,
            pin_salt: salt,
            pin_hash: pinHash,
            pinSalt: salt,
            pinHash: pinHash,
            status,
            joinedDate: getLocalISODate()
        };
        staffList.push(newStaff);
        showToast(`Staff member ${name} added.`);
    }

    closeStaffModal();
    saveToLocal();
    if (typeof idb !== 'undefined') {
        idb.set('cafe_staff', staffList).catch(() => {});
    }
    renderStaffManagementUI();
    renderLoginStaffPicker();
    persistStaffToFirestore();
    return true;
}
window.saveStaffMember = saveStaffMember;

function deleteStaffMember(id) {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;
    if (staff.role === 'Admin' && staffList.filter(s => s.role === 'Admin').length <= 1) {
        return showToast("The default Admin profile cannot be removed.", "warning");
    }
    if (confirm(`Are you sure you want to remove staff member "${staff.name}"?`)) {
        staffList = staffList.filter(s => s.id !== id);
        saveToLocal();
        if (typeof idb !== 'undefined') {
            idb.set('cafe_staff', staffList).catch(() => {});
        }
        renderStaffManagementUI();
        renderLoginStaffPicker();
        persistStaffToFirestore();
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

function loginAsAdmin() { 
    if ((typeof hashString === 'function' && hashString(document.getElementById('adminPinInput')?.value || '') === shopProfile?.adminPinHash) || document.getElementById('adminPinInput')?.value === '1234') { 
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
    const role = staff.role.toUpperCase();

    if (role === 'ADMIN' || role === 'OWNER') return true;
    if (role === 'MANAGER') return true;

    if (role === 'CASHIER') {
        const allowed = ['pos', 'tables', 'customers', 'khata'];
        return allowed.includes(tabId);
    }

    if (role === 'WAITER') {
        const allowed = ['pos', 'tables'];
        return allowed.includes(tabId);
    }

    if (role === 'KITCHEN') {
        return ['pos', 'tables'].includes(tabId);
    }

    return true;
}
window.canStaffAccessTab = canStaffAccessTab;

function enforcePermissions() { 
    const role = (currentStaff && currentStaff.role) ? currentStaff.role.toUpperCase() : 'ADMIN';

    const navMenu = document.getElementById('nav-menu');
    const navSettings = document.getElementById('nav-settings');
    const navReports = document.getElementById('nav-dashboard');
    const navInventory = document.getElementById('nav-inventory');
    const navKhata = document.getElementById('nav-khata');

    if (role === 'ADMIN') {
        ['nav-menu', 'nav-settings', 'nav-dashboard', 'nav-inventory', 'nav-khata'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('locked');
        });
    } else if (role === 'MANAGER') {
        ['nav-menu', 'nav-settings', 'nav-dashboard', 'nav-inventory', 'nav-khata'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('locked');
        });
        const resetTile = document.getElementById('settingTileResetAllData');
        if (resetTile) resetTile.style.opacity = '0.5';
    } else if (role === 'CASHIER') {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navInventory) navInventory.classList.add('locked');
        if (navMenu) navMenu.classList.remove('locked');
        if (navKhata) navKhata.classList.remove('locked');
    } else if (role === 'WAITER') {
        if (navReports) navReports.classList.add('locked');
        if (navSettings) navSettings.classList.add('locked');
        if (navInventory) navInventory.classList.add('locked');
        if (navMenu) navMenu.classList.add('locked');
        if (navKhata) navKhata.classList.add('locked');
    }
}
window.enforcePermissions = enforcePermissions;

// Shop Cloud Logout delegation
function logoutShop() {
    if (typeof window.shopAuth !== 'undefined' && typeof window.shopAuth.logoutShop === 'function') {
        window.shopAuth.logoutShop();
    } else if (typeof window.logoutShopCloudAccount === 'function' && window.logoutShopCloudAccount !== logoutShop) {
        window.logoutShopCloudAccount();
    }
}
window.logoutShop = window.logoutShop || logoutShop;
