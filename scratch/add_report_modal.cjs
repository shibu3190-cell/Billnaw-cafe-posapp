const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(filePath, 'utf8');

const targetStr = '    <!-- 🧾 TRANSACTION MOBILE ACTION SHEET MODAL -->';
const modalHtml = `    <!-- 📥 REPORT EXPORT & FINANCIAL AUDIT MODAL -->
    <div id="reportExportModal" class="modal-overlay" style="display: none; z-index: 1000020;">
        <div class="modal-box" style="max-width: 480px;">
            <div class="modal-header" style="align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(74, 51, 42, 0.08); color: var(--primary); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </div>
                    <div>
                        <h2 style="font-size: 17px; font-weight: 800; color: var(--primary); margin: 0;">Export &amp; Financial Audits</h2>
                        <p style="font-size: 11px; color: var(--text-muted); margin: 2px 0 0 0;">Download verified audit CSVs &amp; daily business summaries</p>
                    </div>
                </div>
                <button type="button" class="report-export-close-btn" onclick="closeReportExportModal()"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
            </div>
            <div style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
                <div style="font-size: 12px; color: var(--text-muted); line-height: 1.4;">
                    Export reconciled transaction ledgers and financial performance reports filtered by the selected date range.
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button type="button" class="btn btn-outline" style="width: 100%; justify-content: flex-start; padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; gap: 12px;" onclick="exportFilteredSalesCSV(); closeReportExportModal();">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(16, 185, 129, 0.1); color: #10B981; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 13px; font-weight: 700; color: var(--text-dark);">Download Sales CSV</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Itemized invoices, payments, taxes, and customer links</div>
                        </div>
                    </button>
                    <button type="button" class="btn btn-outline" style="width: 100%; justify-content: flex-start; padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; gap: 12px;" onclick="openStatementModal(); closeReportExportModal();">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(59, 130, 246, 0.1); color: #3B82F6; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 13px; font-weight: 700; color: var(--text-dark);">Daily Z-Report</div>
                            <div style="font-size: 11px; color: var(--text-muted);">End-of-day register closure, cash drawer, and category splits</div>
                        </div>
                    </button>
                    <button type="button" class="btn btn-outline" style="width: 100%; justify-content: flex-start; padding: 12px 16px; border-radius: 12px; display: flex; align-items: center; gap: 12px;" onclick="exportExpensesCSV(); closeReportExportModal();">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(239, 68, 68, 0.1); color: #EF4444; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M15 9.5H9.5a2.5 2.5 0 0 0 0 5h5a2.5 2.5 0 0 1 0 5H8"></path></svg>
                        </div>
                        <div style="text-align: left;">
                            <div style="font-size: 13px; font-weight: 700; color: var(--text-dark);">Export Costs CSV</div>
                            <div style="font-size: 11px; color: var(--text-muted);">Raw ingredient purchases, operating expenses &amp; vendor payouts</div>
                        </div>
                    </button>
                </div>
            </div>
            <div class="modal-actions" style="padding: 12px 20px; background: #FAF7F4; border-top: 1px solid var(--border); border-radius: 0 0 var(--radius-lg) var(--radius-lg); display: flex; justify-content: flex-end;">
                <button type="button" class="btn btn-outline" style="padding: 8px 16px; font-size: 12px;" onclick="closeReportExportModal()">Close</button>
            </div>
        </div>
    </div>\r\n\r\n`;

if (!html.includes('id="reportExportModal"')) {
    if (html.includes(targetStr)) {
        html = html.replace(targetStr, modalHtml + targetStr);
        fs.writeFileSync(filePath, html, 'utf8');
        console.log('SUCCESS: #reportExportModal inserted');
    } else {
        console.error('ERROR: targetStr not found');
    }
} else {
    console.log('ALREADY_PRESENT');
}
