/**
 * src/features/reports/reports.ui.js
 * Feature UI Controller for Sales Register, GST Breakdown & Business Intelligence.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> reports.service.js.
 */

import { getDailySummary, getSalesRegister, aggregateGstReport } from './reports.service.js';
import { formatRupees } from '../../shared/utils/currency.js';
import { renderDataTable } from '../../shared/components/data-table.js';
import { showToast } from '../../shared/components/toast.js';

export class ReportsUI {
  constructor(options = {}) {
    this.kpiContainer = options.kpiContainer || document.getElementById('kpiGridContainer');
    this.ledgerContainer = options.ledgerContainer || document.getElementById('reportsLedgerContainer');
    this.invoices = [];
    this.dailySummary = null;
  }

  async loadReports() {
    const summaryRes = await getDailySummary();
    if (summaryRes.data) {
      this.dailySummary = summaryRes.data;
      this.renderKPIs();
    }

    const ledgerRes = await getSalesRegister();
    if (ledgerRes.data) {
      this.invoices = ledgerRes.data;
      this.renderLedger();
    }
  }

  renderKPIs() {
    if (!this.kpiContainer || !this.dailySummary) return;

    const s = this.dailySummary;
    this.kpiContainer.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card" id="kpiGrossSales">
          <span class="kpi-label">Gross Sales</span>
          <span class="kpi-value">${formatRupees(s.gross_sales_paise || 0)}</span>
        </div>
        <div class="kpi-card" id="kpiNetSales">
          <span class="kpi-label">Net Revenue</span>
          <span class="kpi-value">${formatRupees(s.net_sales_paise || 0)}</span>
        </div>
        <div class="kpi-card" id="kpiTotalOrders">
          <span class="kpi-label">Total Bills</span>
          <span class="kpi-value">${s.total_orders || 0}</span>
        </div>
        <div class="kpi-card" id="kpiGstCollected">
          <span class="kpi-label">GST Collected</span>
          <span class="kpi-value">${formatRupees((s.cgst_collected_paise || 0) + (s.sgst_collected_paise || 0))}</span>
        </div>
      </div>
    `;
  }

  getLedgerColumns() {
    return [
      { key: 'invoice_id', label: 'Bill #' },
      { key: 'settled_at', label: 'Time', render: (val) => val ? new Date(val).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-' },
      { key: 'payment_mode', label: 'Payment' },
      { 
        key: 'status', 
        label: 'Status',
        render: (val) => val === 'VOID' ? `<span class="badge-danger">VOID</span>` : `<span class="badge-success">PAID</span>`
      },
      { 
        key: 'final_payable_paise', 
        label: 'Total',
        align: 'right',
        render: (val) => formatRupees(val || 0)
      }
    ];
  }

  renderLedger() {
    if (!this.ledgerContainer) return;
    renderDataTable({
      container: this.ledgerContainer,
      columns: this.getLedgerColumns(),
      data: this.invoices,
      state: this.invoices.length === 0 ? 'EMPTY' : 'POPULATED',
      emptyTitle: 'No Orders Yet Today',
      emptyDesc: 'Settled customer invoices will appear in this sales register.'
    });
  }
}
