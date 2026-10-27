/**
 * src/features/kot/kot.ui.js
 * Feature UI Controller for Kitchen Order Tickets & Kitchen Display Stations (KDS).
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> kot.service.js.
 */

import { createKOT, updateKotStatus, cancelKOT, generateKotSlipPayload } from './kot.service.js';
import { showToast } from '../../shared/components/toast.js';
import { ThermalPrinterBridge } from '../../core/platform-bridge.js';

export class KotUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('kotCardsContainer');
    this.kots = [];
  }

  setKots(kots = []) {
    this.kots = [...kots];
    this.render();
  }

  async handleDispatchKot(tableId, items, instructions = '') {
    const res = await createKOT({
      table_id: tableId,
      items,
      special_instructions: instructions
    });

    if (res.error) {
      showToast(`KOT dispatch failed: ${res.error.message || res.error}`, 'error');
      return { success: false, error: res.error };
    }

    showToast(`Ticket #${res.data.kot_id} sent to kitchen!`, 'success');
    
    // Auto print KOT slip
    try {
      const slipPayload = generateKotSlipPayload(res.data);
      ThermalPrinterBridge.enqueuePrintJob({
        id: res.data.kot_id,
        textContent: slipPayload.textContent,
        rawBytes: slipPayload.escPosBytes
      });
    } catch (e) {}

    return { success: true, kot: res.data };
  }

  async handleAdvanceStatus(kotId, newStatus) {
    const res = await updateKotStatus(kotId, newStatus);
    if (res.error) {
      showToast(`Failed to update status: ${res.error.message || res.error}`, 'error');
      return;
    }
    showToast(`KOT #${kotId} updated to ${newStatus}`, 'info');
    const target = this.kots.find(k => k.kot_id === kotId);
    if (target) {
      target.status = newStatus;
      this.render();
    }
  }

  async handleCancelKot(kotId, reason, staffId) {
    const res = await cancelKOT(kotId, reason, staffId);
    if (res.error) {
      showToast(`Cancellation failed: ${res.error.message || res.error}`, 'error');
      return false;
    }
    showToast(`KOT #${kotId} cancelled.`, 'warning');
    const target = this.kots.find(k => k.kot_id === kotId);
    if (target) {
      target.status = 'CANCELLED';
      this.render();
    }
    return true;
  }

  render() {
    if (!this.container) return;

    if (this.kots.length === 0) {
      this.container.innerHTML = `<div class="kot-empty">No active kitchen orders</div>`;
      return;
    }

    const cardsHtml = this.kots.map(kot => {
      const itemsList = (kot.items || []).map(it => `
        <div class="kot-item-row">
          <span class="kot-item-qty">${it.quantity}x</span>
          <span class="kot-item-name">${it.name}</span>
          ${it.notes ? `<span class="kot-item-note">(${it.notes})</span>` : ''}
        </div>
      `).join('');

      return `
        <div class="kot-card kot-status-${(kot.status || 'pending').toLowerCase()}" data-kot-id="${kot.kot_id}">
          <div class="kot-card-header">
            <span class="kot-title">#${kot.kot_id}</span>
            <span class="kot-table-badge">${kot.table_id}</span>
          </div>
          <div class="kot-card-items">${itemsList}</div>
          <div class="kot-card-footer">
            <span class="kot-status-badge">${kot.status}</span>
            <div class="kot-actions">
              ${kot.status === 'PENDING' ? `<button type="button" class="kot-action-btn btn-prep" data-action="prep">Prep</button>` : ''}
              ${kot.status === 'PREPARING' ? `<button type="button" class="kot-action-btn btn-ready" data-action="ready">Ready</button>` : ''}
              ${kot.status !== 'CANCELLED' && kot.status !== 'SERVED' ? `<button type="button" class="kot-action-btn btn-cancel" data-action="cancel">&times;</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `<div class="kot-grid">${cardsHtml}</div>`;
  }
}
