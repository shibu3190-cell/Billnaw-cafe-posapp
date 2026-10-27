// ============================================================
// 👥 JS/CUSTOMERS.JS - Customer Directory, CRM & Loyalty Program
// ============================================================

let currentCustomerTierFilter = 'all';

function getCustomerTier(visits = 0) {
    if (visits >= 20) return { 
        name: "Platinum", 
        class: "tier-platinum", 
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>` 
    };
    if (visits >= 10) return { 
        name: "Gold", 
        class: "tier-gold", 
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>` 
    };
    if (visits >= 5) return { 
        name: "Silver", 
        class: "tier-silver", 
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>` 
    };
    return { 
        name: "Bronze", 
        class: "tier-bronze", 
        icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>` 
    };
}
window.getCustomerTier = getCustomerTier;

function getInitials(name = "") {
    if (!name) return "CU";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
window.getInitials = getInitials;

function renderCustomersUI() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    const totalCustomers = customersList.length;
    const totalPoints = customersList.reduce((sum, c) => sum + (Number(c.loyaltyPoints) || 0), 0);
    const totalRevenue = customersList.reduce((sum, c) => sum + (Number(c.totalSpend) || 0), 0);

    const statTotalEl = document.getElementById('custStatTotal');
    const statPtsEl = document.getElementById('custStatPoints');
    const statRevEl = document.getElementById('custStatRevenue');

    if (statTotalEl) statTotalEl.innerText = totalCustomers;
    if (statPtsEl) statPtsEl.innerText = `${totalPoints} pts`;
    if (statRevEl) statRevEl.innerText = `₹${totalRevenue.toLocaleString()}`;

    const query = (document.getElementById('customerSearchInput')?.value || '').toLowerCase().trim();

    let displayList = customersList.filter(c => {
        const tier = getCustomerTier(c.totalVisits || 0);
        if (currentCustomerTierFilter !== 'all' && tier.name.toLowerCase() !== currentCustomerTierFilter.toLowerCase()) {
            return false;
        }
        if (query) {
            const nameMatch = (c.name || '').toLowerCase().includes(query);
            const phoneMatch = (c.phone || '').includes(query);
            const notesMatch = (c.notes || '').toLowerCase().includes(query);
            return nameMatch || phoneMatch || notesMatch;
        }
        return true;
    });

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 35px; color: var(--text-muted); font-size: 13px;">No customer records found matching your filters. Click <strong>➕ Add Customer</strong> above to create one.</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(cust => {
        const tier = getCustomerTier(cust.totalVisits || 0);
        const initials = getInitials(cust.name);
        const notesSnippet = cust.notes ? `<div style="font-size: 11px; color: var(--text-muted); max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>${escapeHtml(cust.notes)}</div>` : '';
        const visits = cust.totalVisits || 0;
        const totalSpent = Number(cust.totalSpend || 0).toFixed(2);
        const points = cust.loyaltyPoints || 0;
        const lastVisit = cust.lastVisitDate || cust.createdDate || '-';
        const cleanPhone = (cust.phone || '').replace(/\D/g, '');
        const phoneDisplay = cust.phone 
            ? `<a href="tel:${escapeHtml(cust.phone)}" onclick="event.stopPropagation();" class="cust-phone-link" style="font-family: monospace; font-size: 13px; font-weight: 600; color: var(--primary); text-decoration: none; display: inline-flex; align-items: center; gap: 5px; padding: 3px 8px; border-radius: 8px; background: rgba(28, 77, 38, 0.06); border: 1px solid rgba(28, 77, 38, 0.12);" title="Click to call ${escapeHtml(cust.phone)}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                <span>${escapeHtml(cust.phone)}</span>
              </a>` 
            : '<span style="color:var(--text-muted)">-</span>';

        return `
            <tr style="cursor: pointer; transition: background 0.15s ease;" onclick="openCustomerActionHub(${cust.id})" title="Click to view history, bill, edit, delete, or send WhatsApp / SMS">
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="customer-avatar">${initials}</div>
                        <div>
                            <div style="font-weight: 700; color: var(--primary); font-size: 14px;">${escapeHtml(cust.name)}</div>
                            ${notesSnippet}
                        </div>
                    </div>
                </td>
                <td>
                    ${phoneDisplay}
                </td>
                <td>
                    <span class="cust-badge ${tier.class}">
                        ${tier.icon} <span>${tier.name}</span>
                    </span>
                    <div style="font-size: 11px; font-weight: 700; color: var(--warning); margin-top: 2px; display: inline-flex; align-items: center; gap: 3px;">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0"></path></svg>
                        <span>${points} pts</span>
                    </div>
                </td>
                <td style="font-weight: 700; font-size: 13px;">
                    ${visits} ${visits === 1 ? 'visit' : 'visits'}
                </td>
                <td style="font-weight: 800; color: var(--success); font-size: 14px;">
                    ₹${totalSpent}
                </td>
                <td style="font-size: 12px; color: var(--text-muted);">
                    ${lastVisit}
                </td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end;">
                        <button type="button" class="btn btn-outline" style="padding: 5px 9px; font-size: 11px; font-weight: 700; border-radius: 12px; color: var(--success); border-color: rgba(40,167,69,0.3); background: rgba(40,167,69,0.06); display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); startOrderForCustomer(${cust.id})" title="Start Order & Bill for ${escapeHtml(cust.name)}">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                            <span>Bill</span>
                        </button>
                        ${cleanPhone ? `
                        <a href="https://wa.me/91${cleanPhone}" target="_blank" rel="noopener noreferrer" class="btn btn-outline" style="padding: 5px 9px; font-size: 11px; font-weight: 700; border-radius: 12px; color: #128C7E; border-color: rgba(18,140,126,0.3); background: rgba(18,140,126,0.06); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation();" title="Chat on WhatsApp">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            <span>WhatsApp</span>
                        </a>` : ''}
                        <button type="button" class="btn btn-outline cust-btn-manage-text" style="padding: 6px 12px; font-size: 11px; font-weight: 700; border-radius: 16px; color: var(--primary); display: inline-flex; align-items: center; gap: 4px;" onclick="event.stopPropagation(); openCustomerActionHub(${cust.id})" title="Manage Customer & Message">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                            <span>Manage & Message</span>
                        </button>
                        <div class="action-dropdown" style="display: inline-block; position: relative;">
                            <button type="button" class="btn btn-outline action-dropdown-btn" onclick="event.stopPropagation(); toggleCustomerActionDropdown(event, ${cust.id})" style="padding: 6px 8px; font-size: 11px; border-radius: 8px; color: var(--text-dark); display: inline-flex; align-items: center;" title="More Actions">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
                            </button>
                            <div class="action-dropdown-menu" id="custActionDropdown-${cust.id}" style="display: none; position: absolute; right: 0; top: 100%; z-index: 1000; min-width: 180px;">
                                <button type="button" class="action-dropdown-item" onclick="event.stopPropagation(); closeAllCustomerActionDropdowns(); openCustomerWhatsAppDirect(${cust.id});">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                                    <span>Send WhatsApp Message</span>
                                </button>
                                <button type="button" class="action-dropdown-item" onclick="event.stopPropagation(); closeAllCustomerActionDropdowns(); openAddKhataModal('customer', ${cust.id});">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"></path></svg>
                                    <span>Add Udhar / Due</span>
                                </button>
                                <button type="button" class="action-dropdown-item" onclick="event.stopPropagation(); closeAllCustomerActionDropdowns(); openCustomerHistoryModal(${cust.id});">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                                    <span>View Orders</span>
                                </button>
                                <button type="button" class="action-dropdown-item" onclick="event.stopPropagation(); closeAllCustomerActionDropdowns(); openEditCustomerModal(${cust.id});">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                    <span>Edit</span>
                                </button>
                                <button type="button" class="action-dropdown-item danger" onclick="event.stopPropagation(); closeAllCustomerActionDropdowns(); deleteCustomer(${cust.id});">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    <span>Delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Also update AI WhatsApp Marketing Hub state
    if (typeof renderAiWhatsAppHubUI === 'function') {
        renderAiWhatsAppHubUI();
    }
}
window.renderCustomersUI = renderCustomersUI;

function filterCustomersUI() {
    renderCustomersUI();
}
window.filterCustomersUI = filterCustomersUI;

function filterCustomersByTier(tier) {
    currentCustomerTierFilter = tier || 'all';
    ['all', 'platinum', 'gold', 'silver', 'bronze'].forEach(t => {
        const btn = document.getElementById(`cFilter-${t}`) || document.getElementById(`tierFilter-${t}`);
        if (btn) {
            if (t.toLowerCase() === currentCustomerTierFilter.toLowerCase()) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    renderCustomersUI();
}
window.filterCustomersByTier = filterCustomersByTier;

function openAddCustomerModal() {
    document.getElementById('customerEditId').value = '';
    document.getElementById('customerModalTitle').innerText = '➕ Add Customer';
    document.getElementById('custNameInput').value = '';
    document.getElementById('custPhoneInput').value = '';
    document.getElementById('custNotesInput').value = '';
    document.getElementById('custPointsInput').value = '0';
    document.getElementById('customerModal').style.display = 'flex';
    setTimeout(() => {
        const inp = document.getElementById('custNameInput');
        if (inp) inp.focus();
    }, 50);
}
window.openAddCustomerModal = openAddCustomerModal;

function openEditCustomerModal(id) {
    const cust = customersList.find(c => c.id === id);
    if (!cust) return showToast("Customer profile not found");
    document.getElementById('customerEditId').value = cust.id;
    document.getElementById('customerModalTitle').innerText = '✏️ Edit Customer';
    document.getElementById('custNameInput').value = cust.name || '';
    document.getElementById('custPhoneInput').value = cust.phone || '';
    document.getElementById('custNotesInput').value = cust.notes || '';
    document.getElementById('custPointsInput').value = cust.loyaltyPoints || 0;
    document.getElementById('customerModal').style.display = 'flex';
}
window.openEditCustomerModal = openEditCustomerModal;

function closeCustomerModal() {
    document.getElementById('customerModal').style.display = 'none';
}
window.closeCustomerModal = closeCustomerModal;

function saveCustomer() {
    const editId = document.getElementById('customerEditId').value;
    const name = document.getElementById('custNameInput').value.trim();
    const phone = document.getElementById('custPhoneInput').value.trim();
    const notes = document.getElementById('custNotesInput').value.trim();
    const points = parseInt(document.getElementById('custPointsInput').value) || 0;

    if (!name) return showToast("Please enter customer name!");
    if (!phone) return showToast("Please enter customer phone number!");

    if (editId) {
        const cust = customersList.find(c => String(c.id) === String(editId));
        if (cust) {
            cust.name = name;
            cust.phone = phone;
            cust.notes = notes;
            cust.loyaltyPoints = points;
            persistCustomersFirebase(cust);
            showToast("✅ Customer details updated");
        }
    } else {
        const newCust = {
            id: Date.now(),
            name: name,
            phone: phone,
            notes: notes,
            totalVisits: 0,
            totalSpend: 0,
            loyaltyPoints: points,
            createdDate: new Date().toISOString().split('T')[0],
            lastVisitDate: "Never",
            history: []
        };
        customersList.unshift(newCust);
        persistCustomersFirebase(newCust);
        showToast("✅ New customer added to directory");
        
        if (document.getElementById('checkoutModal').style.display !== 'none') {
            populateCheckoutCustomerDropdown();
            document.getElementById('checkoutCustomerSelect').value = newCust.id;
            onCheckoutCustomerSelect(newCust.id);
        }
    }

    closeCustomerModal();
    renderCustomersUI();
    populateCheckoutCustomerDropdown();
}
window.saveCustomer = saveCustomer;

function deleteCustomer(id) {
    const cust = customersList.find(c => c.id === id);
    if (!cust) return;
    if (!confirm(`Are you sure you want to delete ${cust.name} from the customer directory?`)) return;

    customersList = customersList.filter(c => c.id !== id);
    persistCustomersFirebase();
    renderCustomersUI();
    populateCheckoutCustomerDropdown();
    showToast("🗑️ Customer deleted");
}
window.deleteCustomer = deleteCustomer;

function openCustomerHistoryModal(id) {
    const cust = customersList.find(c => c.id === id);
    if (!cust) return showToast("Customer profile not found");

    viewingHistoryCustomerId = cust.id;
    const tier = getCustomerTier(cust.totalVisits || 0);

    document.getElementById('custHistAvatar').innerText = getInitials(cust.name);
    document.getElementById('custHistName').innerText = cust.name;
    document.getElementById('custHistPhone').innerText = cust.phone || 'No phone recorded';
    
    const tierBadge = document.getElementById('custHistTier');
    tierBadge.className = `cust-badge ${tier.class}`;
    tierBadge.innerHTML = `${tier.icon} <span>${tier.name}</span>`;

    document.getElementById('custHistVisits').innerText = cust.totalVisits || 0;
    document.getElementById('custHistTotalSpend').innerText = `₹${(Number(cust.totalSpend) || 0).toFixed(2)}`;
    document.getElementById('custHistPoints').innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;"><circle cx="12" cy="12" r="9"></circle><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0"></path></svg>${cust.loyaltyPoints || 0} pts`;

    const notesEl = document.getElementById('custHistNotes');
    if (cust.notes) {
        notesEl.style.display = 'block';
        notesEl.innerHTML = `<strong>Preferences:</strong> ${escapeHtml(cust.notes)}`;
    } else {
        notesEl.style.display = 'none';
    }

    const timelineContainer = document.getElementById('custHistTimeline');
    const hist = cust.history || [];

    if (hist.length === 0) {
        timelineContainer.innerHTML = `
            <div style="text-align: center; padding: 25px; color: var(--text-muted); font-size: 13px;">
                No billing history recorded yet for this customer.
            </div>
        `;
    } else {
        timelineContainer.innerHTML = hist.map(h => `
            <div class="timeline-card">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                    <span style="font-weight: 700; color: var(--primary); font-size: 13px;">Bill #${h.billNo || '-'}</span>
                    <span style="font-size: 11px; color: var(--text-muted);">${h.date}</span>
                </div>
                <div style="font-size: 12px; color: var(--text-dark); margin: 3px 0 5px 0;">
                    ${escapeHtml(h.items || 'Order items')}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-weight: 800; color: var(--success); font-size: 13px;">₹${Number(h.amount).toFixed(2)}</span>
                    <span style="font-size: 11px; font-weight: 700; color: var(--warning);">+${h.pointsEarned || Math.max(1, Math.floor(h.amount / 50))} pts</span>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('customerHistoryModal').style.display = 'flex';
}
window.openCustomerHistoryModal = openCustomerHistoryModal;

function startOrderForCustomer(id) {
    const cust = customersList.find(c => c.id === id);
    if (!cust) return;
    selectedCustomerForOrder = cust.id;
    if (typeof switchTab === 'function') switchTab('pos');
    showToast(`🛒 Customer selected: ${cust.name} (${cust.loyaltyPoints || 0} pts)`);
}
window.startOrderForCustomer = startOrderForCustomer;

function startOrderForCustomerFromHistory() {
    if (viewingHistoryCustomerId) {
        document.getElementById('customerHistoryModal').style.display = 'none';
        startOrderForCustomer(viewingHistoryCustomerId);
    }
}
window.startOrderForCustomerFromHistory = startOrderForCustomerFromHistory;

function populateCheckoutCustomerDropdown() {
    const sel = document.getElementById('checkoutCustomerSelect');
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- Quick Select Existing Customer --</option>' +
        customersList.map(c => `<option value="${c.id}">${c.name} (${c.phone || 'No phone'}) • ${c.loyaltyPoints || 0} pts [${getCustomerTier(c.totalVisits || 0).name}]</option>`).join('');
    if (currentVal) sel.value = currentVal;
}
window.populateCheckoutCustomerDropdown = populateCheckoutCustomerDropdown;

function onCheckoutCustomerSelect(selectedId) {
    const nameInput = document.getElementById('checkoutCustomerName');
    const idInput = document.getElementById('checkoutCustomerId');
    const badgeEl = document.getElementById('checkoutLoyaltyBadge');

    if (!selectedId) {
        if (idInput) idInput.value = '';
        if (badgeEl) badgeEl.style.display = 'none';
        return;
    }

    const cust = customersList.find(c => String(c.id) === String(selectedId));
    if (cust) {
        if (idInput) idInput.value = cust.id;
        if (nameInput) nameInput.value = `${cust.name} (${cust.phone || ''})`.trim();
        const tier = getCustomerTier(cust.totalVisits || 0);
        if (badgeEl) {
            badgeEl.style.display = 'block';
            badgeEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>${tier.icon} ${escapeHtml(cust.name)}</strong> • ${tier.name}</span>
                    <span style="color: var(--warning); font-weight: 800;">🪙 ${cust.loyaltyPoints || 0} Loyalty Pts</span>
                </div>
                ${cust.notes ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Preferences: ${escapeHtml(cust.notes)}</div>` : ''}
            `;
        }
    }
}
window.onCheckoutCustomerSelect = onCheckoutCustomerSelect;

function onCheckoutCustomerTyped(val) {
    const typed = (val || '').trim().toLowerCase();
    const idInput = document.getElementById('checkoutCustomerId');
    const selectEl = document.getElementById('checkoutCustomerSelect');
    const badgeEl = document.getElementById('checkoutLoyaltyBadge');

    if (!typed) {
        if (idInput) idInput.value = '';
        if (selectEl) selectEl.value = '';
        if (badgeEl) badgeEl.style.display = 'none';
        return;
    }

    const match = customersList.find(c => {
        const phoneMatch = c.phone && c.phone.includes(typed);
        const nameMatch = c.name && c.name.toLowerCase().includes(typed);
        return phoneMatch || nameMatch;
    });

    if (match) {
        if (idInput) idInput.value = match.id;
        if (selectEl) selectEl.value = match.id;
        const tier = getCustomerTier(match.totalVisits || 0);
        if (badgeEl) {
            badgeEl.style.display = 'block';
            badgeEl.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span><strong>${tier.icon} ${escapeHtml(match.name)}</strong> • ${tier.name}</span>
                    <span style="color: var(--warning); font-weight: 800;">🪙 ${match.loyaltyPoints || 0} Loyalty Pts</span>
                </div>
                ${match.notes ? `<div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">Preferences: ${escapeHtml(match.notes)}</div>` : ''}
            `;
        }
    } else {
        if (idInput) idInput.value = '';
        if (selectEl) selectEl.value = '';
        if (badgeEl) badgeEl.style.display = 'none';
    }
}
window.onCheckoutCustomerTyped = onCheckoutCustomerTyped;

function resetCheckoutCustomerFields() {
    const sel = document.getElementById('checkoutCustomerSelect');
    const nameInput = document.getElementById('checkoutCustomerName');
    const idInput = document.getElementById('checkoutCustomerId');
    const badgeEl = document.getElementById('checkoutLoyaltyBadge');
    if (sel) sel.value = '';
    if (nameInput) nameInput.value = '';
    if (idInput) idInput.value = '';
    if (badgeEl) badgeEl.style.display = 'none';
}
window.resetCheckoutCustomerFields = resetCheckoutCustomerFields;

function quickAddNewCustomerFromCheckout() {
    openAddCustomerModal();
    const typed = document.getElementById('checkoutCustomerName')?.value || '';
    if (typed) {
        if (/^\d+$/.test(typed)) {
            document.getElementById('custPhoneInput').value = typed;
        } else {
            document.getElementById('custNameInput').value = typed;
        }
    }
}
window.quickAddNewCustomerFromCheckout = quickAddNewCustomerFromCheckout;

function exportCustomerDirectoryCSV() {
    if (customersList.length === 0) return showToast("Customer directory is empty.");

    let csv = "Customer ID,Name,Phone Number,Loyalty Tier,Total Visits,Total Spend (INR),Loyalty Points,Registered Date,Last Visit,Preferences / Notes\n";

    customersList.forEach(c => {
        const tier = getCustomerTier(c.totalVisits || 0);
        const nameClean = `"${(c.name || '').replace(/"/g, '""')}"`;
        const notesClean = `"${(c.notes || '').replace(/"/g, '""')}"`;

        csv += `"${c.id}",${nameClean},"${c.phone || ''}","${tier.name}",${c.totalVisits || 0},${(Number(c.totalSpend) || 0).toFixed(2)},${c.loyaltyPoints || 0},"${c.createdDate || ''}","${c.lastVisitDate || ''}",${notesClean}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `RoyalCafe_Customers_${getLocalISODate()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("📥 Customer Directory downloaded!");
}
window.exportCustomerDirectoryCSV = exportCustomerDirectoryCSV;

// ============================================================
// 💬 CUSTOMER ACTION HUB POPUP (ON CUSTOMER CLICK)
// Provides: History, Bill, Edit, Delete, Send WhatsApp or Text
// ============================================================

let currentActiveCustomerHubId = null;

function openCustomerActionHub(customerId) {
    const cust = customersList.find(c => c.id === customerId);
    if (!cust) return;

    currentActiveCustomerHubId = customerId;
    const tier = getCustomerTier(cust.totalVisits || 0);
    const initials = getInitials(cust.name);

    const modal = document.getElementById('customerActionHubModal');
    if (!modal) return;

    // Set Customer Identity Details
    const nameEl = document.getElementById('cActionModalName');
    const custNameEl = document.getElementById('cActionName');
    const phoneEl = document.getElementById('cActionPhone');
    const avatarEl = document.getElementById('cActionAvatar');
    const tierEl = document.getElementById('cActionTierBadge');
    const pointsEl = document.getElementById('cActionPoints');
    const spendEl = document.getElementById('cActionSpend');
    const notesEl = document.getElementById('cActionNotes');

    if (nameEl) nameEl.innerText = cust.name || 'Customer Profile';
    if (custNameEl) custNameEl.innerText = cust.name || 'Customer';
    if (phoneEl) phoneEl.innerText = cust.phone ? `+91 ${cust.phone}` : 'No phone number saved';
    if (avatarEl) avatarEl.innerText = initials;
    if (tierEl) {
        tierEl.className = `cust-badge ${tier.class}`;
        tierEl.innerHTML = `${tier.icon} <span>${tier.name}</span>`;
    }
    if (pointsEl) pointsEl.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:3px;"><circle cx="12" cy="12" r="9"></circle><path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 3 5 2 5 5a2.5 2.5 0 0 1-5 0"></path></svg>${cust.loyaltyPoints || 0} pts`;
    if (spendEl) spendEl.innerText = `Spent: ₹${Number(cust.totalSpend || 0).toFixed(2)}`;
    if (notesEl) {
        notesEl.innerHTML = cust.notes ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px; margin-right:4px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>${escapeHtml(cust.notes)}` : '';
        notesEl.style.display = cust.notes ? 'block' : 'none';
    }

    // Prepopulate default personalized message
    const storeName = shopProfile.name || "billnaw";
    const msgInput = document.getElementById('cActionMessageInput');
    if (msgInput) {
        msgInput.value = `Hello ${cust.name || 'there'}! ☕✨ Greetings from ${storeName}.\n\nWe have special offers for you today on your favourite dishes & fresh coffee! Show this message at the counter to get 15% off your bill.\n\nWe look forward to serving you soon!`;
    }

    modal.style.display = 'flex';
}
window.openCustomerActionHub = openCustomerActionHub;

function closeCustomerActionHub() {
    const modal = document.getElementById('customerActionHubModal');
    if (modal) modal.style.display = 'none';
    currentActiveCustomerHubId = null;
}
window.closeCustomerActionHub = closeCustomerActionHub;

function handleCustomerHubAction(action) {
    if (!currentActiveCustomerHubId) return;
    const targetId = currentActiveCustomerHubId;

    if (action === 'history') {
        closeCustomerActionHub();
        if (typeof openCustomerHistoryModal === 'function') {
            openCustomerHistoryModal(targetId);
        }
    } else if (action === 'bill') {
        closeCustomerActionHub();
        if (typeof startOrderForCustomer === 'function') {
            startOrderForCustomer(targetId);
        }
    } else if (action === 'edit') {
        closeCustomerActionHub();
        if (typeof openEditCustomerModal === 'function') {
            openEditCustomerModal(targetId);
        }
    } else if (action === 'delete') {
        closeCustomerActionHub();
        if (typeof deleteCustomer === 'function') {
            deleteCustomer(targetId);
        }
    }
}
window.handleCustomerHubAction = handleCustomerHubAction;

function applySingleCustomerTemplate(type) {
    const cust = customersList.find(c => c.id === currentActiveCustomerHubId);
    const cName = cust ? cust.name : 'there';
    const points = cust ? (cust.loyaltyPoints || 0) : 0;
    const storeName = shopProfile.name || "billnaw";
    const msgInput = document.getElementById('cActionMessageInput');
    if (!msgInput) return;

    if (type === 'welcome') {
        msgInput.value = `Hello ${cName}! ☕ Welcome to ${storeName}!\n\nEnjoy our freshly brewed artisanal coffees, handcrafted breakfast, and delicious cafe bites. We look forward to seeing you!`;
    } else if (type === 'discount') {
        msgInput.value = `Hello ${cName}! 🌟 Exclusive 15% OFF for you at ${storeName} this week! Valid on all dine-in orders and takeaways. Show this message at checkout to redeem.`;
    } else if (type === 'points') {
        msgInput.value = `Hello ${cName}! 🪙 You currently have ${points} loyalty points saved at ${storeName}! Redeem them anytime for free beverages or cash discounts on your bill.`;
    }
}
window.applySingleCustomerTemplate = applySingleCustomerTemplate;

function sendCustomerWhatsAppDirect() {
    const cust = customersList.find(c => c.id === currentActiveCustomerHubId);
    if (!cust || !cust.phone) {
        return showToast("⚠️ Customer does not have a valid phone number.");
    }
    const cleanPhone = cust.phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
        return showToast("⚠️ Invalid phone number format.");
    }
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const msg = document.getElementById('cActionMessageInput')?.value || '';
    const waUrl = `https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank');
    showToast(`🚀 WhatsApp chat opened for ${cust.name}!`);
}
window.sendCustomerWhatsAppDirect = sendCustomerWhatsAppDirect;

function sendCustomerTextSMSDirect() {
    const cust = customersList.find(c => c.id === currentActiveCustomerHubId);
    if (!cust || !cust.phone) {
        return showToast("⚠️ Customer does not have a valid phone number.");
    }
    const cleanPhone = cust.phone.replace(/\D/g, '');
    const msg = document.getElementById('cActionMessageInput')?.value || '';
    const smsUrl = `sms:${cleanPhone}?body=${encodeURIComponent(msg)}`;
    window.open(smsUrl, '_blank');
    showToast(`📱 SMS app opened for ${cust.name}!`);
}
window.sendCustomerTextSMSDirect = sendCustomerTextSMSDirect;

function copyCustomerDirectMessage() {
    const msg = document.getElementById('cActionMessageInput')?.value || '';
    if (!msg) return;
    navigator.clipboard.writeText(msg).then(() => {
        showToast("📋 Message copied to clipboard!");
    }).catch(() => {
        showToast("Message ready to copy.");
    });
}
window.copyCustomerDirectMessage = copyCustomerDirectMessage;

// ============================================================
// 🤖 AI-DRIVEN WHATSAPP MARKETING HUB & BULK CUSTOMER SELECTOR
// ============================================================

let waBulkSelectedCustomerIds = new Set();
let activeAiSegmentKey = 'all';
let waPreviewCustomerIndex = 0;
let waCampaignVariables = {
    discount: 15,
    discountCode: 'BILLNAW15',
    minOrder: 199,
    validTill: 'This Sunday'
};

let waCampaignTemplateText = "Hello {customer_name}! ☕✨ Greetings from billnaw. As a valued patron, enjoy an exclusive {discount_pct}% OFF using promo code {discount_code} on all orders above ₹{min_order}. Show this message at the counter to redeem. Valid till {valid_till}! See you soon!";

// Ensure customer base remains pristine with zero phantom data
function seedInitialCustomersIfEmpty() {
    // Zero phantom data: fresh shops start with clean zero-customer directory
    return;
}

let waTierCollapsedState = {
    vip: false,
    regular: false,
    occasional: false
};

const WA_TIER_CONFIG = [
    {
        key: 'vip',
        title: 'VIP & Gold Diners',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>',
        filter: c => (c.totalVisits || 0) >= 10
    },
    {
        key: 'regular',
        title: 'Regular Diners',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>',
        filter: c => (c.totalVisits || 0) >= 3 && (c.totalVisits || 0) < 10
    },
    {
        key: 'occasional',
        title: 'Occasional Diners',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563EB" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>',
        filter: c => (c.totalVisits || 0) < 3
    }
];

function toggleWaTierAccordion(tierKey) {
    waTierCollapsedState[tierKey] = !waTierCollapsedState[tierKey];
    const acc = document.getElementById(`waTierAcc-${tierKey}`);
    if (acc) {
        if (waTierCollapsedState[tierKey]) {
            acc.classList.add('collapsed');
        } else {
            acc.classList.remove('collapsed');
        }
    }
}
window.toggleWaTierAccordion = toggleWaTierAccordion;

function toggleSelectTierCustomers(tierKey, checked) {
    const tierConf = WA_TIER_CONFIG.find(t => t.key === tierKey);
    if (!tierConf) return;
    const tierMembers = customersList.filter(tierConf.filter);
    tierMembers.forEach(c => {
        if (checked) {
            waBulkSelectedCustomerIds.add(c.id);
        } else {
            waBulkSelectedCustomerIds.delete(c.id);
        }
    });
    renderAiWhatsAppHubUI();
}
window.toggleSelectTierCustomers = toggleSelectTierCustomers;

function toggleWaPreviewExpand(expand) {
    const pill = document.getElementById('waFloatingPreviewPill');
    const mockup = document.getElementById('waPhoneMockupCard');
    const backdrop = document.getElementById('waPreviewBackdrop');

    const isCurrentlyExpanded = mockup && mockup.classList.contains('expanded');
    const shouldExpand = (typeof expand === 'boolean') ? expand : !isCurrentlyExpanded;

    if (shouldExpand) {
        if (pill) pill.classList.remove('minimized');
        if (mockup) {
            mockup.classList.add('expanded');
            mockup.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (backdrop) backdrop.classList.add('active');
    } else {
        if (pill) pill.classList.add('minimized');
        if (mockup) mockup.classList.remove('expanded');
        if (backdrop) backdrop.classList.remove('active');
    }
}
window.toggleWaPreviewExpand = toggleWaPreviewExpand;

// ============================================================
// 🧭 PROGRESSIVE 3-STEP WHATSAPP MARKETING WIZARD ENGINE (M3)
// ============================================================
let currentMarketingWizardStep = 1;

function setMarketingWizardStep(stepNumber) {
    const step = parseInt(stepNumber, 10) || 1;
    if (step < 1 || step > 3) return;
    currentMarketingWizardStep = step;

    // Warning if advancing past step 1 with zero selected diners
    if (step > 1 && waBulkSelectedCustomerIds.size === 0) {
        if (typeof showToast === 'function') {
            showToast("⚠️ Please select at least one customer first.");
        }
    }

    // Toggle wizard step panels & indicators
    for (let i = 1; i <= 3; i++) {
        const stepPanel = document.getElementById(`waWizardStep-${i}`);
        const indicator = document.getElementById(`waStepIndicator-${i}`);
        if (stepPanel) {
            if (i === step) {
                stepPanel.style.display = 'block';
                stepPanel.classList.add('active');
            } else {
                stepPanel.style.display = 'none';
                stepPanel.classList.remove('active');
            }
        }
        if (indicator) {
            indicator.classList.remove('active', 'completed', 'upcoming');
            if (i === step) {
                indicator.classList.add('active');
                indicator.setAttribute('aria-selected', 'true');
            } else if (i < step) {
                indicator.classList.add('completed');
                indicator.setAttribute('aria-selected', 'false');
            } else {
                indicator.classList.add('upcoming');
                indicator.setAttribute('aria-selected', 'false');
            }
        }
    }

    // Update dynamic review elements when entering step 3
    if (step === 3) {
        updateWaAudienceSummary();
        renderBroadcastQueueUI();
        updateWaSimulatedBubble();
    } else if (step === 2) {
        const txtArea = document.getElementById('waCampaignEditableText');
        if (txtArea && !txtArea.value) {
            txtArea.value = waCampaignTemplateText;
        }
        updateWaSimulatedBubble();
    }

    updateWaStepperCounters();
}
window.setMarketingWizardStep = setMarketingWizardStep;
window.setCampaignWizardStep = setMarketingWizardStep;
window.goToMarketingStep = setMarketingWizardStep;

// Variable Chips Inserter (M3)
function insertCampaignVariable(tag) {
    const txtArea = document.getElementById('waCampaignEditableText');
    if (!txtArea) return;
    const start = txtArea.selectionStart ?? txtArea.value.length;
    const end = txtArea.selectionEnd ?? txtArea.value.length;
    const current = txtArea.value;
    txtArea.value = current.substring(0, start) + tag + current.substring(end);
    txtArea.selectionStart = txtArea.selectionEnd = start + tag.length;
    txtArea.focus();
    onCustomCampaignTextEdited();
}
window.insertCampaignVariable = insertCampaignVariable;
window.insertVariableChip = insertCampaignVariable;

// Audience Summary Breakdown Calculator (M3)
function updateWaAudienceSummary() {
    const totalRecipients = waBulkSelectedCustomerIds.size;
    const totalEl = document.getElementById('waSummaryTotalRecipients');
    if (totalEl) totalEl.innerText = totalRecipients;

    const vipConf = WA_TIER_CONFIG.find(t => t.key === 'vip');
    const regConf = WA_TIER_CONFIG.find(t => t.key === 'regular');
    const occConf = WA_TIER_CONFIG.find(t => t.key === 'occasional');

    const vipCount = vipConf ? customersList.filter(vipConf.filter).filter(c => waBulkSelectedCustomerIds.has(c.id)).length : 0;
    const regCount = regConf ? customersList.filter(regConf.filter).filter(c => waBulkSelectedCustomerIds.has(c.id)).length : 0;
    const occCount = occConf ? customersList.filter(occConf.filter).filter(c => waBulkSelectedCustomerIds.has(c.id)).length : 0;

    const elVip = document.getElementById('waSummaryVipCount');
    if (elVip) elVip.innerText = vipCount;
    const elReg = document.getElementById('waSummaryRegularCount');
    if (elReg) elReg.innerText = regCount;
    const elOcc = document.getElementById('waSummaryOccasionalCount');
    if (elOcc) elOcc.innerText = occCount;
}
window.updateWaAudienceSummary = updateWaAudienceSummary;

function updateWaStepperCounters() {
    const count = waBulkSelectedCustomerIds.size;
    const total = customersList.length;

    const step1Badge = document.getElementById('waStep1SelectedCount');
    if (step1Badge) step1Badge.innerText = count;

    const bulkBadge = document.getElementById('bulkSelectedCount');
    if (bulkBadge) bulkBadge.innerText = count;

    const dockCount = document.getElementById('waDockSelectedCount');
    if (dockCount) dockCount.innerText = count;

    const waBadge = document.getElementById('waSelectedCountBadge');
    if (waBadge) waBadge.innerText = `${count} of ${total} selected`;
}
window.updateWaStepperCounters = updateWaStepperCounters;

function initAiWhatsAppHub() {
    seedInitialCustomersIfEmpty();
    // Pre-select all customers by default
    if (waBulkSelectedCustomerIds.size === 0) {
        customersList.forEach(c => waBulkSelectedCustomerIds.add(c.id));
    }
    const txtArea = document.getElementById('waCampaignEditableText');
    if (txtArea && !txtArea.value) {
        txtArea.value = waCampaignTemplateText;
    }

    const pill = document.getElementById('waFloatingPreviewPill');
    const scrollList = document.getElementById('waBulkCustomerSelectorList');

    if (txtArea && !txtArea._waPillBound) {
        txtArea._waPillBound = true;
        txtArea.addEventListener('focus', () => {
            toggleWaPreviewExpand(false);
        });
        txtArea.addEventListener('input', () => {
            toggleWaPreviewExpand(false);
        });
    }

    if (scrollList && !scrollList._waPillBound) {
        scrollList._waPillBound = true;
        scrollList.addEventListener('scroll', () => {
            if (pill) pill.classList.add('minimized');
        }, { passive: true });
    }

    setMarketingWizardStep(currentMarketingWizardStep || 1);
    renderAiWhatsAppHubUI();
}
window.initAiWhatsAppHub = initAiWhatsAppHub;

function renderAiWhatsAppHubUI() {
    seedInitialCustomersIfEmpty();
    const container = document.getElementById('waBulkCustomerSelectorList');
    if (!container) return;

    const totalCount = customersList.length;
    const selectedCount = waBulkSelectedCustomerIds.size;

    // Update count labels across header, dock, and badges
    updateWaStepperCounters();
    updateWaAudienceSummary();

    // Master select-all checkbox (sync both possible IDs)
    const masterCb = document.getElementById('selectAllCustomersCheckbox');
    if (masterCb) {
        masterCb.checked = totalCount > 0 && selectedCount === totalCount;
        masterCb.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }

    const selectAllCb = document.getElementById('waSelectAllCheckbox');
    if (selectAllCb) {
        selectAllCb.checked = totalCount > 0 && selectedCount === totalCount;
        selectAllCb.indeterminate = selectedCount > 0 && selectedCount < totalCount;
    }

    if (totalCount === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">No customers in directory yet. Add customers below to start bulk marketing.</div>`;
        return;
    }

    // Render grouped 3-Tier Collapsible Accordions (Decision 4 & 5)
    container.innerHTML = WA_TIER_CONFIG.map(t => {
        const tierCusts = customersList.filter(t.filter);
        const tierSelectedCount = tierCusts.filter(c => waBulkSelectedCustomerIds.has(c.id)).length;
        const allChecked = tierCusts.length > 0 && tierSelectedCount === tierCusts.length;
        const isCollapsed = !!waTierCollapsedState[t.key];

        return `
            <div class="wa-tier-accordion ${isCollapsed ? 'collapsed' : ''}" id="waTierAcc-${t.key}">
                <div class="wa-tier-header" onclick="toggleWaTierAccordion('${t.key}')">
                    <div class="wa-tier-title-group">
                        <span class="wa-tier-icon">${t.icon}</span>
                        <span class="wa-tier-title">${t.title}</span>
                        <span class="wa-tier-count-badge">${tierCusts.length} Diners</span>
                    </div>
                    <div class="wa-tier-controls" onclick="event.stopPropagation();">
                        <label class="wa-tier-cb-label">
                            <input type="checkbox" id="waTierCb-${t.key}" ${allChecked ? 'checked' : ''} onchange="toggleSelectTierCustomers('${t.key}', this.checked)" style="width: 16px; height: 16px; accent-color: var(--primary); cursor: pointer;">
                            <span>Select Tier</span>
                        </label>
                        <button type="button" class="acc-toggle-btn" onclick="toggleWaTierAccordion('${t.key}')" aria-label="Toggle ${t.title}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                    </div>
                </div>
                <div class="wa-tier-body" id="waTierBody-${t.key}">
                    ${tierCusts.length === 0 ? `
                        <div style="font-size: 11px; color: var(--text-muted); padding: 8px 10px; text-align: center;">No diners in this tier.</div>
                    ` : tierCusts.map(cust => {
                        const isChecked = waBulkSelectedCustomerIds.has(cust.id);
                        const tier = getCustomerTier(cust.totalVisits || 0);
                        const initials = getInitials(cust.name);

                        return `
                            <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-radius: 8px; border: 1px solid ${isChecked ? 'var(--primary)' : 'var(--border)'}; background: ${isChecked ? '#FFFBF7' : '#FFFFFF'}; transition: all 0.15s ease;">
                                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer; flex: 1; margin: 0;">
                                    <input type="checkbox" style="width: 17px; height: 17px; accent-color: var(--primary); cursor: pointer;" ${isChecked ? 'checked' : ''} onchange="toggleSelectCustomerForBroadcast(${cust.id})">
                                    <div class="customer-avatar" style="width: 32px; height: 32px; font-size: 12px;">${initials}</div>
                                    <div>
                                        <div style="font-weight: 700; font-size: 13px; color: var(--text-dark);">${escapeHtml(cust.name)}</div>
                                        <div style="font-size: 11px; font-family: monospace; color: var(--text-muted);">${escapeHtml(cust.phone || 'No phone')}</div>
                                    </div>
                                </label>
                                <div style="text-align: right;">
                                    <span class="cust-badge ${tier.class}" style="font-size: 10px; padding: 2px 6px;">${tier.icon} ${tier.name}</span>
                                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">${cust.totalVisits || 0} visits</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');

    // Update indeterminate states for tier checkboxes
    WA_TIER_CONFIG.forEach(t => {
        const tierCusts = customersList.filter(t.filter);
        const tierSelected = tierCusts.filter(c => waBulkSelectedCustomerIds.has(c.id)).length;
        const cb = document.getElementById(`waTierCb-${t.key}`);
        if (cb) {
            cb.checked = tierCusts.length > 0 && tierSelected === tierCusts.length;
            cb.indeterminate = tierSelected > 0 && tierSelected < tierCusts.length;
        }
    });

    renderBroadcastQueueUI();
    updateWaSimulatedBubble();
}
window.renderAiWhatsAppHubUI = renderAiWhatsAppHubUI;

function toggleSelectAllCustomers(checked) {
    if (checked) {
        customersList.forEach(c => waBulkSelectedCustomerIds.add(c.id));
    } else {
        waBulkSelectedCustomerIds.clear();
    }
    renderAiWhatsAppHubUI();
}
window.toggleSelectAllCustomers = toggleSelectAllCustomers;

function toggleSelectCustomerForBroadcast(customerId) {
    if (waBulkSelectedCustomerIds.has(customerId)) {
        waBulkSelectedCustomerIds.delete(customerId);
    } else {
        waBulkSelectedCustomerIds.add(customerId);
    }
    renderAiWhatsAppHubUI();
}
window.toggleSelectCustomerForBroadcast = toggleSelectCustomerForBroadcast;

function selectAiSegment(segmentKey) {
    activeAiSegmentKey = segmentKey;

    // Update segment buttons UI
    document.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
    const clickedBtn = document.getElementById(`segBtn_${segmentKey}`);
    if (clickedBtn) clickedBtn.classList.add('active');

    waBulkSelectedCustomerIds.clear();

    if (segmentKey === 'all') {
        customersList.forEach(c => waBulkSelectedCustomerIds.add(c.id));
    } else if (segmentKey === 'weekend') {
        // Diners with 3+ visits
        customersList.filter(c => (c.totalVisits || 0) >= 3).forEach(c => waBulkSelectedCustomerIds.add(c.id));
    } else if (segmentKey === 'vip') {
        // Diners with 10+ visits (Gold & Platinum)
        customersList.filter(c => (c.totalVisits || 0) >= 10).forEach(c => waBulkSelectedCustomerIds.add(c.id));
    } else if (segmentKey === 'inactive') {
        // Diners who haven't visited recently or visits <= 2
        customersList.filter(c => (c.totalVisits || 0) <= 2).forEach(c => waBulkSelectedCustomerIds.add(c.id));
    } else if (segmentKey === 'loyalty') {
        // Diners with 20+ points
        customersList.filter(c => (c.loyaltyPoints || 0) >= 20).forEach(c => waBulkSelectedCustomerIds.add(c.id));
    }

    renderAiWhatsAppHubUI();
    generateAiCampaignCopy();
}
window.selectAiSegment = selectAiSegment;

function runWeeklyAiMarketingScan() {
    const scanSummaryEl = document.getElementById('aiWeeklyScanSummary');
    if (scanSummaryEl) {
        scanSummaryEl.innerText = "Scanning customer purchase recency, average spends & repeat visits...";
    }

    setTimeout(() => {
        // Recommend weekend or VIP segment based on diner data
        const vipCount = customersList.filter(c => (c.totalVisits || 0) >= 8).length;
        const targetTheme = vipCount >= 2 ? 'vip' : 'weekend';
        selectAiSegment(targetTheme);

        if (scanSummaryEl) {
            scanSummaryEl.innerHTML = `✨ <strong>Weekly AI Scan Complete:</strong> Found <strong>${waBulkSelectedCustomerIds.size} high-potential diners</strong> for this week's campaign. Text tailored to customer names below!`;
        }
        showToast(`✨ Weekly AI scan found ${waBulkSelectedCustomerIds.size} diners for campaign!`);
    }, 450);
}
window.runWeeklyAiMarketingScan = runWeeklyAiMarketingScan;

async function generateAiCampaignCopy() {
    const btn = document.getElementById('btnAiRegenerate');
    const origText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = `<span>⏳</span> Generating AI Copy...`;

    let theme = "Weekend Cafe Brunch & Artisanal Coffee";
    if (activeAiSegmentKey === 'vip') theme = "Exclusive VIP Diner Appreciation & Secret Menu";
    if (activeAiSegmentKey === 'inactive') theme = "Win-Back Special Welcome Gift for Valued Patron";
    if (activeAiSegmentKey === 'loyalty') theme = "Loyalty Points Multiplier & Free Dessert";

    const activeStoreName = shopProfile.name || "billnaw";
    try {
        const response = await fetch('/api/generate-campaign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                theme: theme,
                storeName: activeStoreName,
                discountPercent: waCampaignVariables.discount,
                minOrder: waCampaignVariables.minOrder,
                validTill: waCampaignVariables.validTill
            })
        });

        if (response.ok) {
            const data = await response.json();
            if (data.campaignText) {
                waCampaignTemplateText = data.campaignText;
                const txtArea = document.getElementById('waCampaignEditableText');
                if (txtArea) txtArea.value = waCampaignTemplateText;
                updateWaSimulatedBubble();
                showToast("✨ AI generated personalized campaign copy!");
            }
        } else {
            throw new Error("API fallback");
        }
    } catch (err) {
        // Fallback intelligent copywriting
        let fallback = `Hello {customer_name}! ☕✨ Greetings from ${activeStoreName}.\n\nEnjoy an exclusive {discount_pct}% OFF on all orders above ₹{min_order} this week! Show this message at checkout to redeem.\n\nValid till {valid_till}. We can't wait to see you!`;
        if (activeAiSegmentKey === 'vip') {
            fallback = `Hello {customer_name}! ⭐ As one of ${activeStoreName}'s most cherished VIP patrons, we've reserved a special table & {discount_pct}% VIP discount just for you on orders above ₹{min_order}.\n\nValid till {valid_till}. Come enjoy your favourite brew on us!`;
        } else if (activeAiSegmentKey === 'inactive') {
            fallback = `Hello {customer_name}! ☕ It's been a little while since your last visit to ${activeStoreName}, and we miss you! Drop in this week and enjoy {discount_pct}% OFF your entire order above ₹{min_order}.\n\nValid till {valid_till}. See you soon!`;
        }
        waCampaignTemplateText = fallback;
        const txtArea = document.getElementById('waCampaignEditableText');
        if (txtArea) txtArea.value = waCampaignTemplateText;
        updateWaSimulatedBubble();
    } finally {
        if (btn) btn.innerHTML = origText;
    }
}
window.generateAiCampaignCopy = generateAiCampaignCopy;

function onCustomCampaignTextEdited() {
    const txtArea = document.getElementById('waCampaignEditableText');
    if (txtArea) {
        waCampaignTemplateText = txtArea.value;
        updateWaSimulatedBubble();
    }
}
window.onCustomCampaignTextEdited = onCustomCampaignTextEdited;

function updateCampaignVariable(key, val) {
    waCampaignVariables[key] = val;
    updateWaSimulatedBubble();
}
window.updateCampaignVariable = updateCampaignVariable;

function getSelectedCustomerList() {
    return customersList.filter(c => waBulkSelectedCustomerIds.has(c.id));
}

function updateWaSimulatedBubble() {
    const bubbleEl = document.getElementById('waSimulatedChatBubble') || document.getElementById('waSimulatedPersonalizedMessage');
    const previewNameEl = document.getElementById('waPreviewCustomerName') || document.getElementById('waSimulatedTargetName');
    const pillBadge = document.getElementById('waPillTargetBadge');
    const step2PreviewEl = document.getElementById('waStep2LivePreview');

    const selectedList = getSelectedCustomerList();
    let currentDinerName = "Valued Customer";

    if (selectedList.length > 0) {
        if (waPreviewCustomerIndex >= selectedList.length) waPreviewCustomerIndex = 0;
        currentDinerName = selectedList[waPreviewCustomerIndex].name;
    }

    if (previewNameEl) previewNameEl.innerText = currentDinerName;
    if (pillBadge) pillBadge.innerText = currentDinerName;

    let text = waCampaignTemplateText || document.getElementById('waCampaignEditableText')?.value || '';
    text = text.replace(/\{customer_name\}/g, currentDinerName)
               .replace(/\{discount_code\}/g, waCampaignVariables.discountCode || 'BILLNAW15')
               .replace(/\{discount_pct\}/g, waCampaignVariables.discount)
               .replace(/\{min_order\}/g, waCampaignVariables.minOrder)
               .replace(/\{valid_till\}/g, waCampaignVariables.validTill);

    if (bubbleEl) bubbleEl.innerText = text;
    if (step2PreviewEl) step2PreviewEl.innerText = text;
}
window.updateWaSimulatedBubble = updateWaSimulatedBubble;

function cyclePreviewCustomer() {
    const selectedList = getSelectedCustomerList();
    if (selectedList.length === 0) return;
    waPreviewCustomerIndex = (waPreviewCustomerIndex + 1) % selectedList.length;
    updateWaSimulatedBubble();
}
window.cyclePreviewCustomer = cyclePreviewCustomer;

function renderBroadcastQueueUI() {
    const queueContainer = document.getElementById('waSelectedBroadcastQueue');
    if (!queueContainer) return;

    const selectedList = getSelectedCustomerList();
    const countEl = document.getElementById('queueCount');
    if (countEl) countEl.innerText = selectedList.length;

    if (selectedList.length === 0) {
        queueContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">No diners selected yet. Select customers in Step 1 to review the dispatch queue.</div>`;
        return;
    }

    queueContainer.innerHTML = selectedList.map(cust => {
        const cleanPhone = (cust.phone || '').replace(/\D/g, '');
        const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
        const personalizedMsg = (waCampaignTemplateText || '')
            .replace(/\{customer_name\}/g, cust.name)
            .replace(/\{discount_code\}/g, waCampaignVariables.discountCode || 'BILLNAW15')
            .replace(/\{discount_pct\}/g, waCampaignVariables.discount)
            .replace(/\{min_order\}/g, waCampaignVariables.minOrder)
            .replace(/\{valid_till\}/g, waCampaignVariables.validTill);

        const waLink = `https://wa.me/${fullPhone}?text=${encodeURIComponent(personalizedMsg)}`;

        return `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #FFFFFF; border: 1px solid var(--border); border-radius: 8px; gap: 10px;">
                <div>
                    <div style="font-weight: 700; font-size: 13px; color: var(--text-dark);">${escapeHtml(cust.name)}</div>
                    <div style="font-size: 11px; font-family: monospace; color: var(--text-muted);">${cust.phone || 'No phone'}</div>
                </div>
                <div style="display: flex; gap: 6px; align-items: center;">
                    <a href="${waLink}" target="_blank" class="btn btn-success" style="padding: 5px 12px; font-size: 11px; font-weight: 700; border-radius: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px;" title="Open WhatsApp Chat">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                        <span>Send WhatsApp</span>
                    </a>
                </div>
            </div>
        `;
    }).join('');
}

function triggerBulkWhatsAppBroadcast() {
    const selectedList = getSelectedCustomerList();
    if (selectedList.length === 0) {
        return showToast("⚠️ Please select at least one customer first.");
    }
    // Open the first customer in WhatsApp directly
    const firstCust = selectedList[0];
    const cleanPhone = (firstCust.phone || '').replace(/\D/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const personalizedMsg = (waCampaignTemplateText || '')
        .replace(/\{customer_name\}/g, firstCust.name)
        .replace(/\{discount_code\}/g, waCampaignVariables.discountCode || 'BILLNAW15')
        .replace(/\{discount_pct\}/g, waCampaignVariables.discount)
        .replace(/\{min_order\}/g, waCampaignVariables.minOrder)
        .replace(/\{valid_till\}/g, waCampaignVariables.validTill);

    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(personalizedMsg)}`, '_blank');
    showToast(`🚀 Dispatched WhatsApp for ${firstCust.name}! Next in queue is ready.`);
}
window.triggerBulkWhatsAppBroadcast = triggerBulkWhatsAppBroadcast;

function copyAllSelectedPhones() {
    const selectedList = getSelectedCustomerList();
    if (selectedList.length === 0) {
        return showToast("⚠️ No customers selected.");
    }
    const phoneList = selectedList
        .filter(c => c.phone)
        .map(c => c.phone.replace(/\D/g, ''))
        .filter(p => p.length >= 10)
        .join(', ');

    if (!phoneList) {
        return showToast("⚠️ Selected customers do not have phone numbers.");
    }

    navigator.clipboard.writeText(phoneList).then(() => {
        showToast(`📋 Copied ${selectedList.length} phone numbers for WhatsApp Broadcast!`);
    }).catch(() => {
        showToast("Phone numbers ready.");
    });
}
window.copyAllSelectedPhones = copyAllSelectedPhones;

function copyCurrentCampaignTemplate() {
    const text = waCampaignTemplateText || document.getElementById('waCampaignEditableText')?.value || '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        showToast("📋 Campaign message copied to clipboard!");
    }).catch(() => {
        showToast("Campaign text ready.");
    });
}
window.copyCurrentCampaignTemplate = copyCurrentCampaignTemplate;

// ============================================================
// 📱 MOBILE SLIDE MENU DRAWER TOGGLE
// ============================================================

function toggleMobileSlideMenu(forcedState) {
    const drawer = document.getElementById('mobileSlideMenuDrawer');
    const overlay = document.getElementById('mobileSlideMenuOverlay');
    if (!drawer || !overlay) return;

    const isCurrentlyOpen = drawer.classList.contains('open');
    const shouldOpen = (forcedState !== undefined) ? forcedState : !isCurrentlyOpen;

    if (shouldOpen) {
        drawer.classList.add('open');
        overlay.classList.add('open');
        overlay.classList.add('show');
    } else {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
        overlay.classList.remove('show');
    }
}
window.toggleMobileSlideMenu = toggleMobileSlideMenu;

// ============================================================
// 🌟 UNIFIED CUSTOMER HUB - 3 SEGMENTED TABS ENGINE
// ============================================================

function switchCustomerHubTab(tabName) {
    if (tabName === 'khata') {
        if (typeof switchTab === 'function') {
            switchTab('khata');
            return;
        }
    }
    const activeTab = (tabName === 'whatsapp') ? 'marketing' : tabName;
    
    // Update segmented tab buttons
    const tabBtns = {
        directory: document.getElementById('custTabBtn-directory'),
        khata: document.getElementById('custTabBtn-khata'),
        marketing: document.getElementById('custTabBtn-marketing')
    };
    
    Object.keys(tabBtns).forEach(key => {
        const btn = tabBtns[key];
        if (btn) {
            if (key === activeTab) {
                btn.classList.add('active');
                btn.setAttribute('aria-selected', 'true');
            } else {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            }
        }
    });

    // Update tab panes
    const panes = {
        directory: document.getElementById('custTabDirectory'),
        khata: document.getElementById('custTabKhata'),
        marketing: document.getElementById('custTabMarketing')
    };

    Object.keys(panes).forEach(key => {
        const pane = panes[key];
        if (pane) {
            pane.style.display = (key === activeTab) ? 'block' : 'none';
            if (key === activeTab) pane.classList.add('active');
            else pane.classList.remove('active');
        }
    });

    // Sub-view backward compatibility
    const legacyDirSubView = document.getElementById('customerDirectoryDetailedSubView');
    if (legacyDirSubView) {
        legacyDirSubView.style.display = (activeTab === 'directory') ? 'block' : 'none';
    }
    const legacyWaHub = document.getElementById('aiWhatsAppMarketingHub');
    if (legacyWaHub) {
        legacyWaHub.style.display = (activeTab === 'marketing') ? 'block' : 'none';
    }

    const pill = document.getElementById('waFloatingPreviewPill');
    if (pill) {
        pill.style.display = (activeTab === 'marketing') ? 'inline-flex' : 'none';
    }

    if (activeTab === 'directory') {
        renderCustomersUI();
    } else if (activeTab === 'khata') {
        renderKhataUI();
    } else if (activeTab === 'marketing') {
        if (typeof renderAiWhatsAppHubUI === 'function') {
            renderAiWhatsAppHubUI();
        }
    }
}
window.switchCustomerHubTab = switchCustomerHubTab;
window.switchCustomerTab = switchCustomerHubTab;
window.selectCustomerTab = switchCustomerHubTab;

// Customer Landing Hub Navigation (Backward-compatibility Flow)
function openCustomerHubSubView(subViewId) {
    const hub = document.getElementById('customerLandingHub');
    if (hub) hub.style.display = 'none';
    const allViews = [
        'customerDirectoryDetailedSubView',
        'aiWhatsAppMarketingHub',
        'eInvoiceDetailedSubView',
        'staffAttendanceDetailedSubView',
        'desktopSoftwareDetailedSubView',
        'notesAppointmentsDetailedSubView',
        'onlineStoreDetailedSubView'
    ];
    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = (id === subViewId) ? 'block' : 'none';
        }
    });
    if (subViewId === 'aiWhatsAppMarketingHub' || subViewId === 'marketing') {
        switchCustomerHubTab('marketing');
    } else if (subViewId === 'customerDirectoryDetailedSubView' || subViewId === 'directory') {
        switchCustomerHubTab('directory');
    } else if (subViewId === 'khata') {
        switchCustomerHubTab('khata');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.openCustomerHubSubView = openCustomerHubSubView;

function closeCustomerHubSubView() {
    const hub = document.getElementById('customerLandingHub');
    if (hub) hub.style.display = 'block';
    const allViews = [
        'customerDirectoryDetailedSubView',
        'aiWhatsAppMarketingHub',
        'eInvoiceDetailedSubView',
        'staffAttendanceDetailedSubView',
        'desktopSoftwareDetailedSubView',
        'notesAppointmentsDetailedSubView',
        'onlineStoreDetailedSubView'
    ];
    allViews.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = 'none';
        }
    });
    switchCustomerHubTab('directory');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.closeCustomerHubSubView = closeCustomerHubSubView;

// ============================================================
// 🎯 CUSTOMER ACTION DROPDOWN & QUICK ACTIONS
// ============================================================

function toggleCustomerActionDropdown(event, custId) {
    if (event) event.stopPropagation();
    const dropdownMenu = document.getElementById(`custActionDropdown-${custId}`);
    const isVisible = dropdownMenu && dropdownMenu.style.display === 'block';
    closeAllCustomerActionDropdowns();
    if (dropdownMenu && !isVisible) {
        dropdownMenu.style.display = 'block';
    }
}
window.toggleCustomerActionDropdown = toggleCustomerActionDropdown;

function closeAllCustomerActionDropdowns() {
    document.querySelectorAll('.action-dropdown-menu').forEach(el => {
        el.style.display = 'none';
    });
}
window.closeAllCustomerActionDropdowns = closeAllCustomerActionDropdowns;

// Dismiss dropdowns on document click
document.addEventListener('click', () => {
    closeAllCustomerActionDropdowns();
});

function openCustomerWhatsAppDirect(custId) {
    const cust = customersList.find(c => c.id === custId || String(c.id) === String(custId));
    if (!cust || !cust.phone) return showToast("No phone number recorded for this customer");
    const cleanPhone = cust.phone.replace(/\D/g, '').slice(-10);
    const storeName = (window.shopProfile && window.shopProfile.name) || "Billnaw Cafe";
    const msg = `Hello ${cust.name}, greetings from ${storeName}! Thank you for dining with us.`;
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}
window.openCustomerWhatsAppDirect = openCustomerWhatsAppDirect;


function renderWhatsAppHubUI() {
    if (typeof switchTab === 'function') switchTab('customers');
    switchCustomerHubTab('marketing');
}
window.renderWhatsAppHubUI = renderWhatsAppHubUI;

// ============================================================
// 💳 KHATA & DUE LEDGER ENGINE (CUSTOMER UDHAR / SUPPLIER DUES)
// ============================================================

let khataList = [];
let currentKhataType = 'customer'; // 'customer' | 'supplier'
let currentKhataFilter = 'all'; // 'all' | 'pending' | 'overdue' | 'cleared'
window.khataList = khataList;
window.currentKhataType = currentKhataType;
window.currentKhataFilter = currentKhataFilter;

function evaluateKhataStatus(dueDateStr, balanceDue, todayStr) {
    if (balanceDue <= 0) return 'Cleared';
    if (!dueDateStr) return 'Pending';
    const today = todayStr || new Date().toISOString().split('T')[0];
    return dueDateStr < today ? 'Overdue' : 'Pending';
}
window.evaluateKhataStatus = evaluateKhataStatus;

function getKhataStatus(entry) {
    if (!entry) return 'Pending';
    return evaluateKhataStatus(entry.dueDate, Number(entry.balanceDue) || 0);
}
window.getKhataStatus = getKhataStatus;

function formatKhataReminder(entry) {
    if (!entry) return '';
    const storeName = (window.shopProfile && window.shopProfile.name) || "Billnaw Cafe";
    const dueStr = entry.dueDate || 'soon';
    return `Dear ${entry.name}, your pending bill of ₹${entry.balanceDue} at ${storeName} is due on ${dueStr}. Kindly clear your balance. Thank you! - ${storeName}`;
}
window.formatKhataReminder = formatKhataReminder;

function sendKhataWhatsAppReminder(entryId) {
    const entry = khataList.find(k => k.id === entryId || String(k.id) === String(entryId));
    if (!entry) return showToast("Khata entry not found");
    if (entry.balanceDue <= 0) return showToast("Dues already cleared for this party.");
    if (!entry.phone) return showToast("No phone number recorded for this entry.");
    const cleanPhone = entry.phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length < 10) return showToast("Invalid phone number recorded.");
    const reminderText = formatKhataReminder(entry);
    window.open(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(reminderText)}`, '_blank');
}
window.sendKhataWhatsAppReminder = sendKhataWhatsAppReminder;

async function initKhataEngine() {
    try {
        let stored = null;
        if (typeof idb !== 'undefined' && idb.get) {
            stored = await idb.get('cafe_khata');
        }
        if (!stored) {
            const local = localStorage.getItem('cafe_khata');
            if (local) {
                try { stored = JSON.parse(local); } catch(e) {}
            }
        }
        if (Array.isArray(stored) && stored.length > 0) {
            khataList = stored;
        } else {
            seedInitialKhata();
        }
    } catch (err) {
        console.warn("Khata IDB load fallback:", err);
        seedInitialKhata();
    }
    window.khataList = khataList;
    renderKhataUI();
}
window.initKhataEngine = initKhataEngine;

function seedInitialKhata() {
    const today = new Date();
    const pastDate = new Date(today.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const futureDate = new Date(today.getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    khataList = [
        {
            id: "KHATA-1728038400001",
            type: "customer",
            entityId: 101,
            name: "Rajesh Kumar",
            phone: "9876543210",
            billNo: "BILL-1042",
            amount: 450,
            balanceDue: 450,
            dueDate: futureDate,
            status: "Pending",
            createdDate: new Date().toISOString(),
            notes: "Dinner bill credit"
        },
        {
            id: "KHATA-1728038400002",
            type: "customer",
            entityId: 102,
            name: "Rohan Mehra",
            phone: "9811122334",
            billNo: "BILL-1038",
            amount: 1000,
            balanceDue: 1000,
            dueDate: pastDate,
            status: "Overdue",
            createdDate: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
            notes: "Catering advance balance"
        },
        {
            id: "KHATA-1728038400003",
            type: "supplier",
            entityId: null,
            name: "Metro Cash & Carry",
            phone: "9822233445",
            billNo: "INV-8891",
            amount: 2400,
            balanceDue: 2400,
            dueDate: futureDate,
            status: "Pending",
            createdDate: new Date().toISOString(),
            notes: "Dairy & Beverage crates"
        },
        {
            id: "KHATA-1728038400004",
            type: "supplier",
            entityId: null,
            name: "Dairy Co-op",
            phone: "9833344556",
            billNo: "INV-7721",
            amount: 950,
            balanceDue: 950,
            dueDate: pastDate,
            status: "Overdue",
            createdDate: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            notes: "Fresh whole milk 20L delivery"
        }
    ];
    persistKhata();
}

function persistKhata() {
    window.khataList = khataList;
    try {
        localStorage.setItem('cafe_khata', JSON.stringify(khataList));
    } catch(e) {}
    if (typeof idb !== 'undefined' && idb.set) {
        try {
            idb.set('cafe_khata', khataList);
        } catch(e) {}
    }
}
window.persistKhata = persistKhata;

function switchKhataType(type) {
    currentKhataType = type || 'customer';
    window.currentKhataType = currentKhataType;
    const custBtn = document.getElementById('khataToggleCustomer');
    const suppBtn = document.getElementById('khataToggleSupplier');
    if (custBtn && suppBtn) {
        if (currentKhataType === 'customer') {
            custBtn.classList.add('active');
            suppBtn.classList.remove('active');
        } else {
            suppBtn.classList.add('active');
            custBtn.classList.remove('active');
        }
    }
    renderKhataUI();
}
window.switchKhataType = switchKhataType;
window.switchKhataToggle = switchKhataType;

function filterKhataByStatus(status) {
    currentKhataFilter = status || 'all';
    window.currentKhataFilter = currentKhataFilter;
    ['all', 'pending', 'overdue', 'cleared'].forEach(s => {
        const btn = document.getElementById(`khataFilter-${s}`);
        if (btn) {
            if (s === currentKhataFilter) btn.classList.add('active');
            else btn.classList.remove('active');
        }
    });
    renderKhataUI();
}
window.filterKhataByStatus = filterKhataByStatus;

function filterKhataList() {
    renderKhataUI();
}
window.filterKhataList = filterKhataList;

function renderKhataUI() {
    const tbody = document.getElementById('khataTableBody');
    if (!tbody) return;

    // Filter by current party type (customer or supplier)
    const typeEntries = khataList.filter(k => k.type === currentKhataType);

    // Compute telemetry metrics
    const totalDue = typeEntries.reduce((sum, item) => sum + (Number(item.balanceDue) || 0), 0);
    const overdueCount = typeEntries.filter(item => getKhataStatus(item) === 'Overdue').length;
    const clearedCount = typeEntries.filter(item => getKhataStatus(item) === 'Cleared').length;

    const statTotalDue = document.getElementById('khataStatTotalDue');
    const statOverdue = document.getElementById('khataStatOverdueCount');
    const statCleared = document.getElementById('khataStatClearedCount');
    if (statTotalDue) statTotalDue.innerText = `₹${totalDue.toLocaleString()}`;
    if (statOverdue) statOverdue.innerText = overdueCount;
    if (statCleared) statCleared.innerText = clearedCount;

    // Overdue badge on main tab button
    const totalOverdueAll = khataList.filter(k => getKhataStatus(k) === 'Overdue').length;
    const overdueBadge = document.getElementById('khataOverdueBadge');
    if (overdueBadge) {
        if (totalOverdueAll > 0) {
            overdueBadge.innerText = totalOverdueAll;
            overdueBadge.style.display = 'inline-flex';
        } else {
            overdueBadge.style.display = 'none';
        }
    }

    // Filter by status & search query
    const query = (document.getElementById('khataSearchInput')?.value || '').toLowerCase().trim();

    let displayList = typeEntries.filter(item => {
        const status = getKhataStatus(item);
        if (currentKhataFilter !== 'all') {
            if (currentKhataFilter.toLowerCase() !== status.toLowerCase()) return false;
        }
        if (query) {
            const nameMatch = (item.name || '').toLowerCase().includes(query);
            const phoneMatch = (item.phone || '').includes(query);
            const billMatch = (item.billNo || '').toLowerCase().includes(query);
            const notesMatch = (item.notes || '').toLowerCase().includes(query);
            return nameMatch || phoneMatch || billMatch || notesMatch;
        }
        return true;
    });

    if (displayList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 35px; color: var(--text-muted); font-size: 13px;">No outstanding Khata dues found. All accounts clear!</td></tr>`;
        return;
    }

    tbody.innerHTML = displayList.map(item => {
        const status = getKhataStatus(item);
        const initials = getInitials(item.name);
        const phoneDisplay = item.phone 
            ? `<a href="tel:${escapeHtml(item.phone)}" class="cust-phone-link" style="font-family: monospace; font-size: 12px; font-weight: 600; color: var(--primary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;" title="Call ${escapeHtml(item.phone)}">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                <span>${escapeHtml(item.phone)}</span>
               </a>`
            : '<span style="color:var(--text-muted)">-</span>';

        let badgeHtml = '';
        if (status === 'Overdue') {
            badgeHtml = `<span class="khata-badge-overdue" style="background: #FEE2E2; color: #B91C1C; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; border: 1px solid #FECACA; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>Overdue</span></span>`;
        } else if (status === 'Cleared') {
            badgeHtml = `<span class="khata-badge-cleared" style="background: #ECFDF5; color: #059669; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; border: 1px solid #A7F3D0; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Cleared</span></span>`;
        } else {
            badgeHtml = `<span class="khata-badge-pending" style="background: #FEF3C7; color: #D97706; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: 800; border: 1px solid #FDE68A; display: inline-flex; align-items: center; gap: 4px;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><span>Pending</span></span>`;
        }

        const billBadge = item.billNo ? `<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(item.billNo)}</div>` : '';
        const balanceColor = item.balanceDue > 0 ? '#DC2626' : '#059669';

        return `
            <tr>
                <td>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div class="customer-avatar" style="width: 32px; height: 32px; font-size: 12px;">${initials}</div>
                        <div>
                            <div style="font-weight: 700; color: var(--text-dark); font-size: 13px;">${escapeHtml(item.name)}</div>
                            ${item.notes ? `<div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.notes)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${phoneDisplay}</td>
                <td>
                    <div style="font-weight: 600; font-size: 13px;">₹${Number(item.amount || item.balanceDue || 0).toFixed(2)}</div>
                    ${billBadge}
                </td>
                <td>
                    <strong style="color: ${balanceColor}; font-size: 14px;">₹${Number(item.balanceDue || 0).toFixed(2)}</strong>
                </td>
                <td style="font-size: 12px; color: var(--text-dark);">
                    ${item.dueDate || '-'}
                </td>
                <td>${badgeHtml}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end;">
                        ${item.balanceDue > 0 ? `
                        <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 12px; color: #128C7E; border-color: rgba(18,140,126,0.3); background: rgba(18,140,126,0.06); display: inline-flex; align-items: center; gap: 4px;" onclick="sendKhataWhatsAppReminder('${item.id}')" title="Send WhatsApp Due Reminder">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
                            <span>Remind</span>
                        </button>
                        <button type="button" class="btn btn-outline" style="padding: 4px 8px; font-size: 11px; font-weight: 700; border-radius: 12px; color: var(--success); border-color: rgba(40,167,69,0.3); background: rgba(40,167,69,0.06); display: inline-flex; align-items: center; gap: 4px;" onclick="openRecordPaymentModal('${item.id}')" title="Record Payment">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            <span>Settle</span>
                        </button>` : ''}
                        <button type="button" class="btn btn-outline" style="padding: 4px 7px; font-size: 11px; border-radius: 10px; color: var(--danger); border-color: rgba(220,53,69,0.25);" onclick="deleteKhataEntry('${item.id}')" title="Delete Entry">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}
window.renderKhataUI = renderKhataUI;

function openRecordPaymentModal(entryId) {
    const entry = khataList.find(k => k.id === entryId || String(k.id) === String(entryId));
    if (!entry) return showToast("Khata entry not found");

    const modal = document.getElementById('recordKhataPaymentModal');
    if (!modal) return;

    document.getElementById('khataPaymentEntryId').value = entry.id;
    document.getElementById('khataPaymentPartyName').innerText = entry.name;
    document.getElementById('khataPaymentCurrentDue').innerText = `₹${Number(entry.balanceDue).toFixed(2)}`;
    document.getElementById('khataPaymentDueDate').innerText = entry.dueDate || '-';
    const amtInput = document.getElementById('khataPaymentAmount');
    if (amtInput) amtInput.value = entry.balanceDue;
    const notesInput = document.getElementById('khataPaymentNotes');
    if (notesInput) notesInput.value = '';

    modal.style.display = 'flex';
}
window.openRecordPaymentModal = openRecordPaymentModal;

function closeRecordKhataPaymentModal() {
    const modal = document.getElementById('recordKhataPaymentModal');
    if (modal) modal.style.display = 'none';
}
window.closeRecordKhataPaymentModal = closeRecordKhataPaymentModal;
window.closeRecordPaymentModal = closeRecordKhataPaymentModal;
const closeRecordPaymentModal = closeRecordKhataPaymentModal;
const openRecordKhataPaymentModal = openRecordPaymentModal;
window.openRecordKhataPaymentModal = openRecordPaymentModal;

function recordKhataPayment(entryId, amount, mode = 'Cash', notes = '') {
    const entry = khataList.find(k => k.id === entryId || String(k.id) === String(entryId));
    if (!entry) return null;
    const payVal = Number(amount);
    if (isNaN(payVal) || payVal <= 0) return null;

    entry.balanceDue = Math.max(0, (Number(entry.balanceDue) || 0) - payVal);
    entry.status = getKhataStatus(entry);

    entry.paymentsHistory = entry.paymentsHistory || [];
    const paymentRec = {
        id: `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        entryId: entry.id,
        amount: payVal,
        mode,
        cashier: (window.currentUser && window.currentUser.name) || 'Admin',
        notes,
        timestamp: new Date().toISOString()
    };
    entry.paymentsHistory.push(paymentRec);

    // If entry is linked to customer, sync customer balanceDue
    if (entry.type === 'customer' && entry.entityId) {
        const cust = customersList.find(c => c.id === entry.entityId || String(c.id) === String(entry.entityId));
        if (cust && cust.balanceDue !== undefined) {
            cust.balanceDue = Math.max(0, (Number(cust.balanceDue) || 0) - payVal);
        }
    }

    persistKhata();
    return paymentRec;
}
window.recordKhataPayment = recordKhataPayment;

function saveKhataPayment() {
    const entryId = document.getElementById('khataPaymentEntryId')?.value;
    const amount = parseFloat(document.getElementById('khataPaymentAmount')?.value);
    const mode = document.getElementById('khataPaymentMode')?.value || 'Cash';
    const notes = document.getElementById('khataPaymentNotes')?.value || '';

    if (!entryId) return showToast("⚠️ No entry selected.");
    if (isNaN(amount) || amount <= 0) return showToast("⚠️ Please enter a valid payment amount.");

    const rec = recordKhataPayment(entryId, amount, mode, notes);
    if (rec) {
        closeRecordKhataPaymentModal();
        renderKhataUI();
        showToast(`✅ Payment of ₹${amount} recorded successfully!`);
    } else {
        showToast("⚠️ Failed to record payment.");
    }
}
window.saveKhataPayment = saveKhataPayment;

function openAddKhataModal(defaultType = 'customer', entityId = null) {
    const modal = document.getElementById('addKhataDueModal');
    if (!modal) return;

    const typeSelect = document.getElementById('addKhataType');
    if (typeSelect) typeSelect.value = defaultType || 'customer';

    const nameInput = document.getElementById('addKhataPartyName');
    const phoneInput = document.getElementById('addKhataPhone');
    const amountInput = document.getElementById('addKhataAmount');
    const billInput = document.getElementById('addKhataBillNo');
    const notesInput = document.getElementById('addKhataNotes');
    const dateInput = document.getElementById('addKhataDueDate');

    if (amountInput) amountInput.value = '';
    if (billInput) billInput.value = `KH-${Math.floor(1000 + Math.random() * 9000)}`;
    if (notesInput) notesInput.value = '';

    // Default due date: 7 days in future
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    if (dateInput) dateInput.value = futureDate;

    if (entityId && defaultType === 'customer') {
        const cust = customersList.find(c => c.id === entityId || String(c.id) === String(entityId));
        if (cust) {
            if (nameInput) nameInput.value = cust.name;
            if (phoneInput) phoneInput.value = cust.phone;
            modal.dataset.entityId = cust.id;
        }
    } else {
        if (nameInput) nameInput.value = '';
        if (phoneInput) phoneInput.value = '';
        delete modal.dataset.entityId;
    }

    modal.style.display = 'flex';
}
window.openAddKhataModal = openAddKhataModal;
window.openAddKhataDueModal = openAddKhataModal;

function closeAddKhataModal() {
    const modal = document.getElementById('addKhataDueModal');
    if (modal) modal.style.display = 'none';
}
window.closeAddKhataModal = closeAddKhataModal;

function onAddKhataTypeChanged() {
    // Dynamic callback
}
window.onAddKhataTypeChanged = onAddKhataTypeChanged;

function saveNewKhataEntry() {
    const modal = document.getElementById('addKhataDueModal');
    const type = document.getElementById('addKhataType')?.value || 'customer';
    const name = (document.getElementById('addKhataPartyName')?.value || '').trim();
    const phone = (document.getElementById('addKhataPhone')?.value || '').trim();
    const amount = parseFloat(document.getElementById('addKhataAmount')?.value);
    const dueDate = document.getElementById('addKhataDueDate')?.value || '';
    const billNo = (document.getElementById('addKhataBillNo')?.value || '').trim();
    const notes = (document.getElementById('addKhataNotes')?.value || '').trim();
    const entityId = modal?.dataset?.entityId || null;

    if (!name) return showToast("⚠️ Party name is required.");
    if (isNaN(amount) || amount <= 0) return showToast("⚠️ Please enter a valid due amount.");
    if (!dueDate) return showToast("⚠️ Due date is required.");

    const newEntry = {
        id: `KHATA-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type,
        entityId: entityId ? Number(entityId) : null,
        name,
        phone,
        billNo: billNo || `KH-${Math.floor(1000 + Math.random() * 9000)}`,
        amount,
        balanceDue: amount,
        dueDate,
        status: evaluateKhataStatus(dueDate, amount),
        createdDate: new Date().toISOString(),
        notes
    };

    khataList.unshift(newEntry);

    // If linked customer, update customer balance
    if (type === 'customer' && entityId) {
        const cust = customersList.find(c => c.id === Number(entityId) || String(c.id) === String(entityId));
        if (cust) {
            cust.balanceDue = (Number(cust.balanceDue) || 0) + amount;
        }
    }

    persistKhata();
    closeAddKhataModal();
    if (currentKhataType !== type) {
        switchKhataType(type);
    } else {
        renderKhataUI();
    }
    showToast(`✅ Added ₹${amount} due entry for ${name}`);
}
window.saveNewKhataEntry = saveNewKhataEntry;

function deleteKhataEntry(entryId) {
    if (!confirm("Are you sure you want to delete this Khata record?")) return;
    khataList = khataList.filter(k => k.id !== entryId && String(k.id) !== String(entryId));
    persistKhata();
    renderKhataUI();
    showToast("🗑️ Khata record removed.");
}
window.deleteKhataEntry = deleteKhataEntry;

window.customers = {
    renderUI: renderCustomersUI,
    filterUI: filterCustomersUI,
    filterByTier: filterCustomersByTier,
    openAddModal: openAddCustomerModal,
    openEditModal: openEditCustomerModal,
    closeModal: closeCustomerModal,
    saveCustomer,
    deleteCustomer,
    openHistoryModal: openCustomerHistoryModal,
    startOrder: startOrderForCustomer,
    switchTab: switchCustomerHubTab,
    setMarketingWizardStep,
    setCampaignWizardStep: setMarketingWizardStep,
    insertCampaignVariable,
    insertVariableChip: insertCampaignVariable,
    marketing: {
        init: initAiWhatsAppHub,
        render: renderAiWhatsAppHubUI,
        toggleTier: toggleWaTierAccordion,
        selectTier: toggleSelectTierCustomers,
        toggleExpand: toggleWaPreviewExpand,
        setMarketingWizardStep,
        setCampaignWizardStep: setMarketingWizardStep,
        insertCampaignVariable,
        insertVariableChip: insertCampaignVariable
    },
    khata: {
        init: initKhataEngine,
        render: renderKhataUI,
        switchType: switchKhataType,
        filterByStatus: filterKhataByStatus,
        formatReminder: formatKhataReminder,
        sendReminder: sendKhataWhatsAppReminder,
        recordPayment: recordKhataPayment,
        savePayment: saveKhataPayment,
        openRecordPaymentModal,
        openRecordKhataPaymentModal,
        closeRecordPaymentModal,
        closeRecordKhataPaymentModal,
        openAddModal: openAddKhataModal,
        closeAddModal: closeAddKhataModal,
        saveEntry: saveNewKhataEntry,
        deleteEntry: deleteKhataEntry
    }
};
window.customersHub = window.customers;

// Initialize on script load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initAiWhatsAppHub();
        initKhataEngine();
    });
} else {
    setTimeout(() => {
        initAiWhatsAppHub();
        initKhataEngine();
    }, 200);
}
