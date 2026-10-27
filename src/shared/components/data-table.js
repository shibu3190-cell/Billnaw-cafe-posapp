/**
 * src/shared/components/data-table.js
 * Accessible 4-State Data Table Component for Billnaw Cafe POS.
 * Handles Loading, Empty, Error, and Populated states seamlessly.
 */

import { renderTableRowSkeleton } from './skeleton.js';

/**
 * Render a 4-state data table into a target DOM container.
 * @param {Object} options
 * @param {HTMLElement|string} options.container
 * @param {Array<{ key: string, label: string, render?: (val: any, row: any) => string, align?: 'left'|'center'|'right' }>} options.columns
 * @param {Array<Object>} options.data
 * @param {'LOADING'|'EMPTY'|'ERROR'|'POPULATED'} options.state
 * @param {string} [options.emptyTitle='No Records Found']
 * @param {string} [options.emptyDesc='No entries are currently available for this view.']
 * @param {string} [options.errorMessage='Failed to load data.']
 * @param {() => void} [options.onRetry]
 * @param {(row: Object) => void} [options.onRowClick]
 */
export function renderDataTable({
  container,
  columns = [],
  data = [],
  state = 'POPULATED',
  emptyTitle = 'No Records Found',
  emptyDesc = 'No entries are currently available for this view.',
  errorMessage = 'Failed to load data.',
  onRetry = null,
  onRowClick = null
}) {
  const target = typeof container === 'string' ? document.querySelector(container) : container;
  if (!target) return;

  if (state === 'LOADING') {
    const skeletonRows = Array.from({ length: 5 })
      .map(() => renderTableRowSkeleton(columns.length))
      .join('');
    target.innerHTML = `
      <div class="data-table-wrapper state-loading">
        <table class="data-table">
          <thead><tr>${renderHeaders(columns)}</tr></thead>
          <tbody>${skeletonRows}</tbody>
        </table>
      </div>
    `;
    return;
  }

  if (state === 'ERROR') {
    target.innerHTML = `
      <div class="data-table-wrapper state-error">
        <div class="state-error-title">${escapeHtml(errorMessage)}</div>
        ${onRetry ? `<button type="button" class="state-error-retry-btn">Retry</button>` : ''}
      </div>
    `;
    if (onRetry) {
      target.querySelector('.state-error-retry-btn')?.addEventListener('click', onRetry);
    }
    return;
  }

  if (state === 'EMPTY' || !data || data.length === 0) {
    target.innerHTML = `
      <div class="data-table-wrapper state-empty">
        <div class="state-empty-icon">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
          </svg>
        </div>
        <div class="state-empty-title">${escapeHtml(emptyTitle)}</div>
        <div class="state-empty-desc">${escapeHtml(emptyDesc)}</div>
      </div>
    `;
    return;
  }

  // Populated state
  const rowsHtml = data.map((row, idx) => {
    const cells = columns.map(col => {
      const val = row[col.key];
      const content = col.render ? col.render(val, row) : escapeHtml(String(val ?? ''));
      const alignClass = col.align ? `text-${col.align}` : '';
      return `<td class="${alignClass}">${content}</td>`;
    }).join('');

    return `<tr class="data-table-row ${onRowClick ? 'clickable' : ''}" data-index="${idx}">${cells}</tr>`;
  }).join('');

  target.innerHTML = `
    <div class="data-table-wrapper state-populated">
      <table class="data-table">
        <thead><tr>${renderHeaders(columns)}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;

  if (onRowClick) {
    target.querySelectorAll('.data-table-row').forEach(rowEl => {
      rowEl.addEventListener('click', () => {
        const idx = parseInt(rowEl.dataset.index, 10);
        if (!isNaN(idx) && data[idx]) {
          onRowClick(data[idx]);
        }
      });
    });
  }
}

function renderHeaders(columns) {
  return columns.map(col => {
    const alignClass = col.align ? `text-${col.align}` : '';
    return `<th class="${alignClass}">${escapeHtml(col.label)}</th>`;
  }).join('');
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
