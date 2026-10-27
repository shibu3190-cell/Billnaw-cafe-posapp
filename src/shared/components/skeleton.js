/**
 * src/shared/components/skeleton.js
 * Visual Loading Skeleton Placeholders for Billnaw Cafe POS.
 * Supports shimmer animations across dishes, table grids, and KPI cards.
 */

export function renderDishCardSkeleton() {
  return `
    <div class="dish-card-skeleton animate-pulse" aria-hidden="true">
      <div class="skeleton-img-box"></div>
      <div class="skeleton-content-box">
        <div class="skeleton-line-title"></div>
        <div class="skeleton-line-subtitle"></div>
        <div class="skeleton-row-footer">
          <div class="skeleton-price-pill"></div>
          <div class="skeleton-btn-pill"></div>
        </div>
      </div>
    </div>
  `;
}

export function renderTableRowSkeleton(columns = 4) {
  const cells = Array.from({ length: columns })
    .map(() => `<td><div class="skeleton-table-cell animate-pulse"></div></td>`)
    .join('');
  return `<tr class="skeleton-row">${cells}</tr>`;
}

export function renderKpiCardSkeleton() {
  return `
    <div class="kpi-card-skeleton animate-pulse" aria-hidden="true">
      <div class="skeleton-kpi-icon"></div>
      <div class="skeleton-kpi-info">
        <div class="skeleton-line-title" style="width: 60%;"></div>
        <div class="skeleton-line-subtitle" style="width: 40%; height: 24px; margin-top: 6px;"></div>
      </div>
    </div>
  `;
}
