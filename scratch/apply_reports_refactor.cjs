const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

// 1. Replace the sticky header & inline pills
const oldStickyHeader = `<div class="dashboard-sticky-bar">
                    <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <h2 style="font-size: 18px; font-weight: 800; color: var(--primary); margin: 0;">Executive Business Overview</h2>
                    </div>

                    <!-- Sticky Quick Date Range Filters -->
                    <div class="filter-pills-bar" style="margin-bottom: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                        <span style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-right: 4px;">Date Range:</span>
                        <button class="filter-pill active" id="fRange-today" onclick="setDashboardDateRange('today')">Today</button>
                        <button class="filter-pill" id="fRange-yesterday" onclick="setDashboardDateRange('yesterday')">Yesterday</button>
                        <button class="filter-pill" id="fRange-week" onclick="setDashboardDateRange('week')">This Week</button>
                        <button class="filter-pill" id="fRange-month" onclick="setDashboardDateRange('month')">This Month</button>
                        <button class="filter-pill" id="fRange-all" onclick="setDashboardDateRange('all')">All Time</button>
                        <button class="filter-pill" id="fRange-custom" onclick="setDashboardDateRange('custom')">Custom</button>
                        <div id="reportCustomDateWrap" style="display: none; align-items: center; gap: 6px; margin-left: 6px;">
                            <input type="date" id="reportCustomStartDate" class="form-input" style="padding: 4px 8px; font-size: 11px; height: 28px; width: auto;" onchange="applyCustomDashboardDateRange()">
                            <span style="font-size: 11px; color: var(--text-muted); font-weight: 700;">to</span>
                            <input type="date" id="reportCustomEndDate" class="form-input" style="padding: 4px 8px; font-size: 11px; height: 28px; width: auto;" onchange="applyCustomDashboardDateRange()">
                        </div>
                    </div>
                </div>`;

const newStickyHeader = `<div class="dashboard-sticky-bar">
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; width: 100%;">
                        <h2 style="font-size: 18px; font-weight: 800; color: var(--primary); margin: 0;">Executive Business Overview</h2>

                        <!-- 🎛️ Minimalist Reports Action Bar (Two Compact Triggers) -->
                        <div class="reports-action-bar" style="display: flex; align-items: center; gap: 8px;">
                            <!-- 1. Date Range Dropdown Trigger -->
                            <div style="position: relative;">
                                <button type="button" id="reportDateRangeBtn" class="report-action-pill" onclick="toggleReportDatePopover()" title="Select date range">
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                    <span id="reportActiveRangeLabel">Today</span>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                </button>
                                <!-- Date Range Popover Card -->
                                <div id="reportDatePopover" class="report-popover-card" style="display: none;">
                                    <div class="popover-presets-list">
                                        <button type="button" class="popover-item active" id="fRange-today" onclick="selectReportDatePreset('today', 'Today')">Today</button>
                                        <button type="button" class="popover-item" id="fRange-yesterday" onclick="selectReportDatePreset('yesterday', 'Yesterday')">Yesterday</button>
                                        <button type="button" class="popover-item" id="fRange-week" onclick="selectReportDatePreset('week', 'This Week')">This Week</button>
                                        <button type="button" class="popover-item" id="fRange-month" onclick="selectReportDatePreset('month', 'This Month')">This Month</button>
                                        <button type="button" class="popover-item" id="fRange-all" onclick="selectReportDatePreset('all', 'All Time')">All Time</button>
                                        <button type="button" class="popover-item" id="fRange-custom" onclick="selectReportDatePreset('custom', 'Custom')">Custom</button>
                                    </div>
                                    <div id="reportCustomDateWrap" style="display: none; padding: 10px; border-top: 1px solid var(--border); background: var(--bg-body); border-radius: 0 0 12px 12px;">
                                        <div style="font-size: 11px; font-weight: 700; color: var(--text-dark); margin-bottom: 6px;">Custom Date Span:</div>
                                        <div style="display: flex; flex-direction: column; gap: 6px;">
                                            <input type="date" id="reportCustomStartDate" class="form-input" style="padding: 6px 8px; font-size: 11px; height: 32px;" onchange="applyCustomDashboardDateRange()">
                                            <input type="date" id="reportCustomEndDate" class="form-input" style="padding: 6px 8px; font-size: 11px; height: 32px;" onchange="applyCustomDashboardDateRange()">
                                            <button type="button" class="btn btn-sm btn-primary" style="margin-top: 4px; padding: 6px;" onclick="applyCustomDashboardDateRange(); closeReportDatePopover();">Apply Dates</button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- 2. Export & Financial Audits Modal Trigger -->
                            <button type="button" id="reportExportModalBtn" class="report-action-pill" onclick="openReportExportModal()" title="Export Sales, Z-Reports & CSVs">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                <span>Export &amp; Audit</span>
                            </button>
                        </div>
                    </div>
                </div>`;

// Replace normalizing line breaks
function replaceNormalized(source, search, replacement) {
    const normSource = source.replace(/\r\n/g, '\n');
    const normSearch = search.replace(/\r\n/g, '\n');
    const normReplacement = replacement.replace(/\r\n/g, '\n');

    if (!normSource.includes(normSearch)) {
        return { success: false, text: source };
    }
    const result = normSource.replace(normSearch, normReplacement);
    return { success: true, text: result.replace(/\n/g, '\r\n') };
}

let res1 = replaceNormalized(html, oldStickyHeader, newStickyHeader);
if (res1.success) {
    html = res1.text;
    console.log('SUCCESS: Replaced reports sticky header with 2-trigger action bar');
} else {
    console.error('ERROR: Could not find oldStickyHeader');
}

// 2. Remove reports-export-sticky-footer
const oldExportFooter = `<!-- ✨ FIXED STICKY EXPORT FOOTER IN REPORTS VIEW ✨ -->
                <div class="reports-export-sticky-footer">
                    <div style="font-size: 13px; font-weight: 700; color: var(--text-dark); display: flex; align-items: center; gap: 8px;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Export & Financial Audits</span>
                    </div>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-outline" style="padding: 8px 14px; font-size: 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;" onclick="exportFilteredSalesCSV()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            <span>Download Sales CSV</span>
                        </button>
                        <button class="btn btn-outline" style="padding: 8px 14px; font-size: 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;" onclick="openStatementModal()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                            <span>Daily Z-Report</span>
                        </button>
                        <button class="btn btn-outline" style="padding: 8px 14px; font-size: 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 6px;" onclick="exportExpensesCSV()">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9.5H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H8"></path></svg>
                            <span>Export Costs CSV</span>
                        </button>
                    </div>
                </div>`;

let res2 = replaceNormalized(html, oldExportFooter, '');
if (res2.success) {
    html = res2.text;
    console.log('SUCCESS: Removed reports-export-sticky-footer');
} else {
    console.error('ERROR: Could not find oldExportFooter');
}

fs.writeFileSync(filePath, html, 'utf8');
console.log('SUCCESS: index.html updated successfully with reports refactor');
