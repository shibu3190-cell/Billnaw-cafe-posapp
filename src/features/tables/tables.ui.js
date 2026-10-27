/**
 * src/features/tables/tables.ui.js
 * Feature UI Controller for Dine-In Table Management & Visual Grid.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> tables.service.js.
 */

import { getTables, occupyTable, updateTableStatus, resetTable, switchTable, TABLE_STATES } from './tables.service.js';
import { showToast } from '../../shared/components/toast.js';

const STATUS_BADGE_CLASSES = {
  AVAILABLE: 'badge-emerald',
  OCCUPIED_DRAFT: 'badge-amber',
  KOT_SENT: 'badge-orange',
  SERVED: 'badge-blue',
  BILLED: 'badge-purple',
  PAID_CLOSED: 'badge-gray'
};

export class TablesUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('tablesGridContainer');
    this.tables = [];
    this.selectedTableId = null;
    this.onTableSelect = options.onTableSelect || null;
  }

  async loadTables() {
    const res = await getTables();
    if (res.error) {
      showToast('Failed to load table statuses.', 'error');
      return;
    }
    this.tables = res.data || [];
    this.render();
  }

  async handleOccupyTable(tableId, guests = 2) {
    const res = await occupyTable(tableId, guests);
    if (res.error) {
      showToast(res.error.message || 'Failed to occupy table', 'error');
      return;
    }
    showToast(`Table ${tableId} occupied with ${guests} guests.`, 'success');
    await this.loadTables();
  }

  async handleResetTable(tableId) {
    const res = await resetTable(tableId);
    if (res.error) {
      showToast(res.error.message || 'Failed to reset table', 'error');
      return;
    }
    showToast(`Table ${tableId} is now Available.`, 'success');
    await this.loadTables();
  }

  async handleSwitchTable(fromTableId, toTableId) {
    const res = await switchTable(fromTableId, toTableId);
    if (res.error) {
      showToast(res.error.message || 'Failed to switch tables', 'error');
      return;
    }
    showToast(`Switched Table ${fromTableId} -> ${toTableId}`, 'success');
    await this.loadTables();
  }

  render() {
    if (!this.container) return;

    if (this.tables.length === 0) {
      this.container.innerHTML = `<div class="tables-empty">No tables configured</div>`;
      return;
    }

    const cardsHtml = this.tables.map(table => {
      const statusClass = STATUS_BADGE_CLASSES[table.status] || 'badge-gray';
      const isSelected = table.id === this.selectedTableId ? 'table-card-selected' : '';

      return `
        <div class="table-card ${statusClass} ${isSelected}" data-table-id="${table.id}">
          <div class="table-header">
            <span class="table-name">${table.name || table.id}</span>
            <span class="table-badge ${statusClass}">${table.status}</span>
          </div>
          <div class="table-body">
            <span class="table-capacity">Capacity: ${table.capacity || 4}</span>
            ${table.guests_count ? `<span class="table-guests">Guests: ${table.guests_count}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    this.container.innerHTML = `<div class="tables-grid">${cardsHtml}</div>`;

    this.container.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.tableId;
        this.selectedTableId = id;
        if (this.onTableSelect) {
          const t = this.tables.find(tbl => tbl.id === id);
          this.onTableSelect(t);
        }
        this.render();
      });
    });
  }
}
