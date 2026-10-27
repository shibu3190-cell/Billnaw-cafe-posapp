/**
 * src/features/customers/customers.ui.js
 * Feature UI Controller for Customer Directory, Loyalty Tiers & Khata Ledger.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> customers.service.js.
 */

import { getCustomers, recordKhataPayment, LOYALTY_TIERS } from './customers.service.js';
import { renderDataTable } from '../../shared/components/data-table.js';
import { formatRupees, rupeesToPaise } from '../../shared/utils/currency.js';
import { showToast } from '../../shared/components/toast.js';

export class CustomersUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('customersTableContainer');
    this.customers = [];
    this.activeFilter = 'All';
  }

  async loadCustomers(filter = 'All') {
    this.activeFilter = filter;
    renderDataTable({
      container: this.container,
      columns: this.getColumns(),
      state: 'LOADING'
    });

    const res = await getCustomers(filter);
    if (res.error) {
      renderDataTable({
        container: this.container,
        columns: this.getColumns(),
        state: 'ERROR',
        errorMessage: res.error.message || 'Failed to load customers',
        onRetry: () => this.loadCustomers(this.activeFilter)
      });
      return;
    }

    this.customers = res.data || [];
    this.render();
  }

  async handleKhataPayment(phone, amountRupees, mode = 'CASH') {
    const amountPaise = rupeesToPaise(amountRupees);
    const res = await recordKhataPayment(phone, amountPaise, mode);
    if (res.error) {
      showToast(`Payment recording failed: ${res.error.message || res.error}`, 'error');
      return false;
    }
    showToast(`Recorded payment of ${formatRupees(amountPaise)} for ${phone}`, 'success');
    await this.loadCustomers(this.activeFilter);
    return true;
  }

  getColumns() {
    return [
      { key: 'name', label: 'Customer Name' },
      { key: 'phone', label: 'Phone' },
      { 
        key: 'tier', 
        label: 'Loyalty Tier',
        render: (tier) => {
          const t = tier || 'Bronze';
          const badgeClass = t === 'Gold' ? 'badge-gold' : t === 'Silver' ? 'badge-silver' : 'badge-bronze';
          return `<span class="loyalty-badge ${badgeClass}">${t}</span>`;
        }
      },
      { key: 'total_visits', label: 'Visits', align: 'center' },
      { 
        key: 'khata_balance_paise', 
        label: 'Khata Due',
        align: 'right',
        render: (val) => {
          const p = Number(val || 0);
          return p > 0 ? `<span class="text-danger font-bold">${formatRupees(p)}</span>` : `<span class="text-muted">₹0.00</span>`;
        }
      }
    ];
  }

  render() {
    if (!this.container) return;
    renderDataTable({
      container: this.container,
      columns: this.getColumns(),
      data: this.customers,
      state: this.customers.length === 0 ? 'EMPTY' : 'POPULATED',
      emptyTitle: 'No Customers Found',
      emptyDesc: 'Customer visits and Khata balances will automatically appear here.'
    });
  }
}
