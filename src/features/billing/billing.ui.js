/**
 * src/features/billing/billing.ui.js
 * Feature UI Controller for Billing & POS Cart Operations.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> billing.service.js.
 */

import { calculateBillFinancials, settleBill, voidBill, generateReceiptPayload } from './billing.service.js';
import { formatRupees, paiseToRupees } from '../../shared/utils/currency.js';
import { showToast } from '../../shared/components/toast.js';
import { ThermalPrinterBridge } from '../../core/platform-bridge.js';

export class BillingUI {
  constructor(options = {}) {
    this.cartItems = [];
    this.activeDiscountPercent = 0;
    this.isTaxInclusive = true;
    this.container = options.container || document.getElementById('cartContainer');
  }

  setCartItems(items = []) {
    this.cartItems = [...items];
    this.render();
  }

  addItem(item, qty = 1) {
    const existing = this.cartItems.find(it => it.id === item.id);
    if (existing) {
      existing.quantity = (existing.quantity || 1) + qty;
    } else {
      this.cartItems.push({
        id: item.id,
        name: item.name,
        price_paise: item.price_paise,
        price: item.price,
        gst_rate: item.gst_rate ?? 5,
        quantity: qty
      });
    }
    this.render();
  }

  removeItem(itemId) {
    this.cartItems = this.cartItems.filter(it => it.id !== itemId);
    this.render();
  }

  updateItemQty(itemId, newQty) {
    if (newQty <= 0) {
      this.removeItem(itemId);
      return;
    }
    const it = this.cartItems.find(i => i.id === itemId);
    if (it) {
      it.quantity = newQty;
      this.render();
    }
  }

  setDiscount(percent) {
    this.activeDiscountPercent = Math.max(0, Math.min(100, Number(percent) || 0));
    this.render();
  }

  getFinancials() {
    return calculateBillFinancials(this.cartItems, {
      discountPercent: this.activeDiscountPercent,
      isTaxInclusive: this.isTaxInclusive
    });
  }

  async handleCheckout(checkoutDetails = {}) {
    if (this.cartItems.length === 0) {
      showToast('Cannot checkout an empty cart.', 'warning');
      return { success: false, error: 'Empty cart' };
    }

    const billPayload = {
      items: this.cartItems,
      discount_percent: this.activeDiscountPercent,
      is_tax_inclusive: this.isTaxInclusive,
      payment_mode: checkoutDetails.payment_mode || 'CASH',
      customer_name: checkoutDetails.customer_name || 'Walk-in Customer',
      customer_phone: checkoutDetails.customer_phone || '',
      table_id: checkoutDetails.table_id || null,
      amount_tendered_paise: checkoutDetails.amount_tendered_paise,
      change_due_paise: checkoutDetails.change_due_paise,
      cashier_id: checkoutDetails.cashier_id || 'cashier'
    };

    // Settle bill atomically via Service
    const res = await settleBill(billPayload);

    if (res.error) {
      showToast(`Billing failed: ${res.error.message || res.error}`, 'error');
      return { success: false, error: res.error };
    }

    const settledInvoice = res.data;
    showToast(`Bill #${settledInvoice.invoice_id} settled successfully!`, 'success');

    // Decoupled print job dispatch
    if (checkoutDetails.autoPrint !== false) {
      ThermalPrinterBridge.enqueuePrintJob(settledInvoice).catch(err => {
        console.warn('[BillingUI] Printing queue error:', err);
      });
    }

    // Clear cart
    this.cartItems = [];
    this.activeDiscountPercent = 0;
    this.render();

    return { success: true, invoice: settledInvoice };
  }

  render() {
    if (!this.container) return;
    const fin = this.getFinancials();

    if (this.cartItems.length === 0) {
      this.container.innerHTML = `
        <div class="cart-empty-state">
          <div class="cart-empty-text">No items in active bill</div>
        </div>
      `;
      return;
    }

    const itemsHtml = this.cartItems.map(it => `
      <div class="cart-row" data-id="${it.id}">
        <div class="cart-item-name">${it.name}</div>
        <div class="cart-item-stepper">
          <button type="button" class="cart-step-btn" data-action="dec">-</button>
          <span class="cart-step-val">${it.quantity}</span>
          <button type="button" class="cart-step-btn" data-action="inc">+</button>
        </div>
        <div class="cart-item-price">${formatRupees(it.price_paise * it.quantity)}</div>
      </div>
    `).join('');

    this.container.innerHTML = `
      <div class="cart-items-list">${itemsHtml}</div>
      <div class="cart-totals-summary">
        <div class="summary-line"><span>Subtotal:</span><span>${formatRupees(fin.gross_subtotal_paise)}</span></div>
        ${fin.discount_paise > 0 ? `<div class="summary-line text-amber"><span>Discount:</span><span>-${formatRupees(fin.discount_paise)}</span></div>` : ''}
        <div class="summary-line"><span>GST (5%):</span><span>${formatRupees(fin.total_tax_paise)}</span></div>
        <div class="summary-line summary-total"><span>Total Payable:</span><span>${formatRupees(fin.final_payable_paise)}</span></div>
      </div>
    `;
  }
}
