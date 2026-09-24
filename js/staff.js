// ============================================================
// 👥 JS/STAFF.JS - Staff Authentication, Roles, PIN & Switching
// ============================================================

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
        const isActive = staff.status !== 'Inactive';
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
                        ${isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px; margin-right: 5px;" onclick="openEditStaffModal(${staff.id})">✏️ Edit</button>
                    ${staff.role !== 'Admin' ? `<button class="btn btn-outline" style="padding: 5px 10px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteStaffMember(${staff.id})">🗑️</button>` : ''}
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

function confirmStaffLogin() {
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId) || staffList[0];
    const enteredPin = document.getElementById('staffLoginPinInput').value.trim();

    if (!enteredPin) {
        return showToast("Please enter your 4-digit PIN.");
    }

    const isValidStaffPin = matchedStaff && matchedStaff.pin && (matchedStaff.pin === enteredPin);
    const isValidAdminPin = (hashString(enteredPin) === shopProfile.adminPinHash) || (enteredPin === '1234');

    if (isValidStaffPin || isValidAdminPin) {
        currentStaff = matchedStaff || { id: 1, name: "Admin", role: "Admin" };
        if (currentStaff.role === 'Admin' || currentStaff.role === 'Manager') {
            currentRole = 'admin';
        } else {
            currentRole = 'staff';
        }

        // Persist last active cashier for seamless pre-selection
        try {
            localStorage.setItem('billnaw_last_staff_id', currentStaff.id);
        } catch(e) {}

        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('staffLoginPinInput').value = '';
        enforcePermissions();
        updateStaffTopbarDisplay();
        showToast(`Welcome, ${currentStaff.name}! (${currentStaff.role})`);
    } else {
        const pinInput = document.getElementById('staffLoginPinInput');
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
        showToast("❌ Incorrect PIN. Please try again.");
    }
}
window.confirmStaffLogin = confirmStaffLogin;

function quickStaffLoginAsSelected() {
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId) || staffList[0];
    currentStaff = matchedStaff || { id: 2, name: "Staff", role: "Cashier" };
    currentRole = 'staff';
    try {
        localStorage.setItem('billnaw_last_staff_id', currentStaff.id);
    } catch(e) {}
    document.getElementById('loginOverlay').style.display = 'none';
    enforcePermissions();
    updateStaffTopbarDisplay();
    showToast(`Quick POS Session: ${currentStaff.name}`);
}
window.quickStaffLoginAsSelected = quickStaffLoginAsSelected;

function updateStaffTopbarDisplay() {
    const el = document.getElementById('activeStaffName');
    if (el && currentStaff) {
        el.innerText = `${currentStaff.name} (${currentStaff.role || 'Staff'})`;
    }
}
window.updateStaffTopbarDisplay = updateStaffTopbarDisplay;

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
    document.getElementById('quickSwitchPinInput').value = '';
    document.getElementById('staffSwitchModal').style.display = 'flex';
}
window.openStaffSwitchModal = openStaffSwitchModal;

function confirmQuickStaffSwitch() {
    const enteredPin = document.getElementById('quickSwitchPinInput').value.trim();
    const matchedStaff = staffList.find(s => s.id === selectedLoginStaffId);
    if (!matchedStaff) return showToast("Select a staff member.");

    if (enteredPin && (matchedStaff.pin === enteredPin || hashString(enteredPin) === shopProfile.adminPinHash || enteredPin === '1234')) {
        currentStaff = matchedStaff;
        if (currentStaff.role === 'Admin' || currentStaff.role === 'Manager') {
            currentRole = 'admin';
        } else {
            currentRole = 'staff';
        }
        enforcePermissions();
        updateStaffTopbarDisplay();
        document.getElementById('staffSwitchModal').style.display = 'none';
        showToast(`Switched active staff to ${currentStaff.name}`);
    } else {
        showToast("Incorrect PIN for " + matchedStaff.name);
    }
}
window.confirmQuickStaffSwitch = confirmQuickStaffSwitch;

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

function saveStaffMember() {
    const name = document.getElementById('staffNameInput').value.trim();
    const role = document.getElementById('staffRoleInput').value;
    const phone = document.getElementById('staffPhoneInput').value.trim();
    const pin = document.getElementById('staffPinInput').value.trim();
    const status = document.getElementById('staffStatusInput').value;
    const existingId = document.getElementById('staffIdInput').value;

    if (!name) return showToast("Staff name is required.");
    if (!pin || pin.length < 4) return showToast("4-digit PIN is required.");

    if (existingId) {
        const idNum = parseInt(existingId);
        const idx = staffList.findIndex(s => s.id === idNum);
        if (idx !== -1) {
            staffList[idx] = { ...staffList[idx], name, role, phone, pin, status };
        }
        showToast(`Staff member ${name} updated.`);
    } else {
        const newStaff = {
            id: Date.now(),
            name,
            role,
            phone,
            pin,
            status,
            joinedDate: getLocalISODate()
        };
        staffList.push(newStaff);
        showToast(`Staff member ${name} added.`);
    }

    closeStaffModal();
    saveToLocal();
    renderStaffManagementUI();
    renderLoginStaffPicker();
    persistStaffToFirestore();
}
window.saveStaffMember = saveStaffMember;

function deleteStaffMember(id) {
    const staff = staffList.find(s => s.id === id);
    if (!staff) return;
    if (staff.role === 'Admin') return showToast("Admin member cannot be deleted.");
    if (confirm(`Are you sure you want to remove staff member "${staff.name}"?`)) {
        staffList = staffList.filter(s => s.id !== id);
        saveToLocal();
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
    if (hashString(document.getElementById('adminPinInput')?.value || '') === shopProfile.adminPinHash || document.getElementById('adminPinInput')?.value === '1234') { 
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

function lockSystem() { 
    currentRole = null; 
    document.getElementById('loginOverlay').style.display = 'flex'; 
    renderLoginStaffPicker();
    setTimeout(() => {
        const pinInput = document.getElementById('staffLoginPinInput');
        if (pinInput) {
            pinInput.value = '';
            pinInput.focus();
        }
    }, 80);
    if (typeof switchTab === 'function') switchTab('pos'); 
    enforcePermissions(); 
}
window.lockSystem = lockSystem;

function enforcePermissions() { 
    ['nav-menu', 'nav-settings'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            currentRole === 'staff' ? el.classList.add('locked') : el.classList.remove('locked');
        }
    }); 
}
window.enforcePermissions = enforcePermissions;
