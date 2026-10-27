/**
 * src/features/inventory/inventory.ui.js
 * Feature UI Controller for Commissary Raw Materials, Recipes & Food Costing.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> inventory.service.js.
 */

import { getRawMaterials, recordStockAdjustment, calculateDishFoodCost } from './inventory.service.js';
import { renderDataTable } from '../../shared/components/data-table.js';
import { formatRupees } from '../../shared/utils/currency.js';
import { showToast } from '../../shared/components/toast.js';

export class InventoryUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('inventoryTableContainer');
    this.materials = [];
  }

  async loadInventory() {
    renderDataTable({
      container: this.container,
      columns: this.getColumns(),
      state: 'LOADING'
    });

    const res = await getRawMaterials();
    if (res.error) {
      renderDataTable({
        container: this.container,
        columns: this.getColumns(),
        state: 'ERROR',
        errorMessage: res.error.message || 'Failed to load commissary stock',
        onRetry: () => this.loadInventory()
      });
      return;
    }

    this.materials = res.data || [];
    this.render();
  }

  async handleStockAdjustment(materialId, deltaQty, reason = 'Delivery') {
    const res = await recordStockAdjustment(materialId, deltaQty, reason);
    if (res.error) {
      showToast(`Stock update failed: ${res.error.message || res.error}`, 'error');
      return;
    }
    showToast('Inventory stock adjusted successfully.', 'success');
    await this.loadInventory();
  }

  getColumns() {
    return [
      { key: 'name', label: 'Material Name' },
      { key: 'current_stock', label: 'Current Stock', render: (val, row) => `${val} ${row.unit || 'g'}` },
      { key: 'low_stock_threshold', label: 'Threshold', render: (val, row) => `${val} ${row.unit || 'g'}` },
      { 
        key: 'status', 
        label: 'Stock Health', 
        render: (_, row) => {
          const isLow = (row.current_stock || 0) <= (row.low_stock_threshold || 10);
          return isLow 
            ? `<span class="badge-danger">LOW STOCK</span>` 
            : `<span class="badge-success">HEALTHY</span>`;
        }
      },
      { 
        key: 'cost_per_unit_paise', 
        label: 'Unit Cost', 
        render: (val, row) => `${formatRupees(val || 0)} / ${row.unit || 'g'}` 
      }
    ];
  }

  render() {
    if (!this.container) return;
    renderDataTable({
      container: this.container,
      columns: this.getColumns(),
      data: this.materials,
      state: this.materials.length === 0 ? 'EMPTY' : 'POPULATED',
      emptyTitle: 'No Commissary Materials',
      emptyDesc: 'Add raw materials to enable live recipe stock deduction.'
    });
  }
}
