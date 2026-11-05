#!/usr/bin/env node
/**
 * scripts/maintenance-purge.js
 * CLI Maintenance Purge Routine for Billnaw POS.
 * 
 * Usage:
 *   node scripts/maintenance-purge.js [--dry-run] [--mock-now="2028-01-01T00:00:00Z"]
 */

import { runDailyDataRetentionRoutine } from '../database/server-functions/retention-lifecycle.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  let mockNow = Date.now();
  const mockArg = args.find(a => a.startsWith('--mock-now='));
  if (mockArg) {
    const rawVal = mockArg.split('=')[1];
    const parsed = Date.parse(rawVal);
    if (!isNaN(parsed)) {
      mockNow = parsed;
    }
  }

  console.log('====================================================');
  console.log('🧹 BILLNAW POS — SERVER-SIDE DATA RETENTION PURGE');
  console.log('====================================================');
  console.log(`Execution Time: ${new Date(mockNow).toISOString()}`);
  console.log(`Simulation Mode (dry-run): ${dryRun ? 'ENABLED' : 'DISABLED'}`);
  console.log('----------------------------------------------------');

  try {
    const report = await runDailyDataRetentionRoutine({
      now: mockNow,
      dryRun
    });

    console.log('\n📊 EXECUTION SUMMARY:');
    console.log(`  • 500-Day Invoice Purge: ${report.purge500d.purgedCount} documents purged (cutoff: ${report.purge500d.cutoffDate})`);
    console.log(`  • 730-Day CRM PII Anonymization: ${report.crmAnonymize730d.anonymizedCount} profiles scrubbed (cutoff: ${report.crmAnonymize730d.cutoffDate})`);
    console.log(`  • 90-Day WhatsApp Log Scrub: ${report.whatsappLogs90d.scrubbedCount} logs deleted (cutoff: ${report.whatsappLogs90d.cutoffDate})`);
    console.log(`  • Total Purged: ${report.totalRecordsPurged}`);
    console.log(`  • Total Anonymized: ${report.totalRecordsAnonymized}`);
    console.log('----------------------------------------------------');
    console.log('✅ Daily retention lifecycle routine completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Maintenance purge routine failed:', err);
    process.exit(1);
  }
}

main();
