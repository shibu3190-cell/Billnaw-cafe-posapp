/**
 * src/features/kot/kot.ui.js
 * Feature UI Controller for Kitchen Order Tickets & Kitchen Display Stations (KDS).
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> kot.service.js.
 */

import { createKOT, updateKotStatus, cancelKOT, generateKotSlipPayload, getActiveKOTs } from './kot.service.js';
import { showToast } from '../../shared/components/toast.js';
import { ThermalPrinterBridge } from '../../core/platform-bridge.js';

export class KotUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('kotCardsContainer');
    this.kots = [];
    this.initEventListeners();
  }

  initEventListeners() {
    if (!this.container || typeof this.container.addEventListener !== 'function' || this._listenersBound) return;
    this._listenersBound = true;

    this.container.addEventListener('click', async (e) => {
      const btn = e.target.closest('.kot-action-btn');
      if (!btn) return;
      const card = btn.closest('.kot-card');
      if (!card) return;
      const kotId = card.getAttribute('data-kot-id');
      const action = btn.getAttribute('data-action');
      if (!kotId || !action) return;

      btn.disabled = true;
      try {
        if (action === 'prep') {
          await this.handleAdvanceStatus(kotId, 'PREPARING');
        } else if (action === 'ready') {
          await this.handleAdvanceStatus(kotId, 'READY');
          if (typeof window !== 'undefined' && typeof window.playKdsAudioChime === 'function') {
            window.playKdsAudioChime();
          }
        } else if (action === 'served') {
          await this.handleAdvanceStatus(kotId, 'SERVED');
        } else if (action === 'cancel') {
          const reason = prompt("Enter cancellation reason for this kitchen ticket:", "Customer Cancelled");
          if (reason && reason.trim().length >= 3) {
            const staffId = (window.currentStaffUser && window.currentStaffUser.id) || 'chef';
            await this.handleCancelKot(kotId, reason.trim(), staffId);
          }
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  setKots(kots = []) {
    this.kots = [...kots];
    this.render();
  }

  async loadKots() {
    try {
      const res = await getActiveKOTs();
      const list = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
      this.setKots(list);
      return list;
    } catch (err) {
      console.warn('[KotUI] loadKots warning:', err);
      return [];
    }
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

    if (typeof window !== 'undefined' && typeof window.persistAllToFirestore === 'function') {
      window.persistAllToFirestore();
    }

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
    if (typeof window !== 'undefined' && typeof window.persistAllToFirestore === 'function') {
      window.persistAllToFirestore();
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
    if (typeof window !== 'undefined' && typeof window.persistAllToFirestore === 'function') {
      window.persistAllToFirestore();
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
      const createdAtMs = new Date(kot.created_at || Date.now()).getTime();
      const elapsedMins = Math.max(0, Math.floor((Date.now() - createdAtMs) / 60000));
      const timerColor = elapsedMins > 15 ? '#DC2626' : (elapsedMins > 8 ? '#D97706' : '#059669');
      const timerText = elapsedMins <= 0 ? 'Just now' : `${elapsedMins}m ago`;

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
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="kot-title">#${kot.kot_id}</span>
              <span class="kot-table-badge">${kot.table_id}</span>
            </div>
            <span class="kot-timer-pill" style="font-size: 11px; font-weight: 700; color: ${timerColor}; background: rgba(0,0,0,0.04); padding: 2px 6px; border-radius: 4px;">${timerText}</span>
          </div>
          <div class="kot-card-items">${itemsList}</div>
          ${kot.special_instructions ? `<div class="kot-special-note" style="font-size: 11px; color: #B45309; background: #FFFBEB; padding: 4px 8px; border-radius: 6px; margin-bottom: 8px;">Note: ${kot.special_instructions}</div>` : ''}
          <div class="kot-card-footer">
            <span class="kot-status-badge">${kot.status}</span>
            <div class="kot-actions">
              ${kot.status === 'PENDING' ? `<button type="button" class="kot-action-btn btn-prep" data-action="prep">Prep</button>` : ''}
              ${kot.status === 'PREPARING' ? `<button type="button" class="kot-action-btn btn-ready" data-action="ready">Ready</button>` : ''}
              ${kot.status === 'READY' ? `<button type="button" class="kot-action-btn btn-served" data-action="served">Served</button>` : ''}
              ${kot.status !== 'CANCELLED' && kot.status !== 'SERVED' ? `<button type="button" class="kot-action-btn btn-cancel" data-action="cancel" title="Cancel Ticket">&times;</button>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `<div class="kot-grid">${cardsHtml}</div>`;
  }
}
