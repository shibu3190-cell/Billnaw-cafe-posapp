/**
 * database/server-functions/retention-lifecycle.js
 * Server-Side Data Tiering & Purge Lifecycles for Billnaw Cafe POS.
 * 
 * Enforces automated retention ceilings:
 * 1. Hard purge transactional records older than 500 days on day 501.
 * 2. Anonymize inactive customer profiles (scrub PII: name, phone, email, notes) after 730 days (2 years)
 *    while strictly preserving ledger balances (khata_balance_paise) and visit statistics.
 * 3. Enforce a hard 90-day ceiling for WhatsApp marketing logs and outbound API receipts, running a total scrub on day 91.
 */

import { getDbClient } from '../../src/core/db-client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Permanently deletes transactional invoice records older than 500 days on day 501.
 * 
 * @param {Object} [options]
 * @param {Object} [options.db] - Optional Firestore or UniversalDbClient instance
 * @param {number|Date} [options.now] - Current timestamp (supports time-travel testing)
 * @param {boolean} [options.dryRun=false] - Simulation mode
 * @returns {Promise<{ purgedCount: number, cutoffDate: string, details: Array<Object> }>}
 */
export async function executeHardPurge500Days({ db, now, dryRun = false } = {}) {
  const currentNow = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
  const cutoffMs = currentNow - (500 * DAY_MS);
  const cutoffISO = new Date(cutoffMs).toISOString();

  const database = db || getDbClient();
  let purgedCount = 0;
  const details = [];

  // 1. Process in-memory / UniversalDbClient stores
  if (database.memoryStore && database.memoryStore instanceof Map) {
    const keysToDelete = [];
    for (const [key, val] of database.memoryStore.entries()) {
      if (key.includes('/invoices/') || key.endsWith('/invoices')) {
        const itemDate = val.created_at || val.createdAt || val.settled_at || val.date;
        const itemMs = typeof itemDate === 'number' ? itemDate : new Date(itemDate).getTime();
        if (!isNaN(itemMs) && itemMs < cutoffMs) {
          keysToDelete.push({ key, id: val.id || key.split('/').pop(), created_at: itemDate });
        }
      }
    }

    purgedCount = keysToDelete.length;
    details.push(...keysToDelete);

    if (!dryRun) {
      keysToDelete.forEach(item => {
        database.memoryStore.delete(item.key);
      });
      if (typeof database.notifyListeners === 'function') {
        database.notifyListeners('cafes/invoices');
      }
    }
  }

  // 2. Also prune localStorage cache if running in client/test environment
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem('pos_order_history');
      if (raw) {
        const history = JSON.parse(raw);
        if (Array.isArray(history)) {
          const filtered = history.filter(inv => {
            const t = new Date(inv.created_at || inv.createdAt || inv.settled_at || inv.date || inv.id).getTime();
            return !isNaN(t) && t >= cutoffMs;
          });
          const localPurged = history.length - filtered.length;
          if (localPurged > 0 && !dryRun) {
            localStorage.setItem('pos_order_history', JSON.stringify(filtered));
          }
        }
      }
    } catch (e) {}
  }

  return {
    purgedCount,
    cutoffDate: cutoffISO,
    details
  };
}

/**
 * Scrubs PII (names, phone numbers, emails, notes) for customers inactive for 730 days (2 years)
 * while preserving ledger balances (khata_balance_paise), total_spent_paise, and visit statistics.
 * 
 * @param {Object} [options]
 * @param {Object} [options.db]
 * @param {number|Date} [options.now]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{ anonymizedCount: number, cutoffDate: string, details: Array<Object> }>}
 */
export async function anonymizeInactiveCustomers730Days({ db, now, dryRun = false } = {}) {
  const currentNow = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
  const cutoffMs = currentNow - (730 * DAY_MS);
  const cutoffISO = new Date(cutoffMs).toISOString();

  const database = db || getDbClient();
  let anonymizedCount = 0;
  const details = [];

  if (database.memoryStore && database.memoryStore instanceof Map) {
    for (const [key, val] of database.memoryStore.entries()) {
      if (key.includes('/customers/')) {
        const lastVisit = val.last_visit_at || val.lastVisit || val.created_at || val.updated_at;
        const lastVisitMs = typeof lastVisit === 'number' ? lastVisit : new Date(lastVisit).getTime();
        const isZeroVisits = (val.total_visits === 0 || !val.total_visits);
        const isInactive = isNaN(lastVisitMs) || lastVisitMs < cutoffMs;

        if ((isZeroVisits || isInactive) && !val.is_anonymized) {
          anonymizedCount++;
          details.push({
            id: val.id || key.split('/').pop(),
            originalName: val.name,
            lastVisit: lastVisit || 'none'
          });

          if (!dryRun) {
            const anonymizedRecord = {
              ...val,
              name: 'Anonymized Customer',
              phone: '0000000000',
              email: '',
              notes: '',
              is_anonymized: true,
              anonymized_at: new Date(currentNow).toISOString(),
              // Preserved financial & visit ledger invariants:
              khata_balance_paise: val.khata_balance_paise || 0,
              total_spent_paise: val.total_spent_paise || 0,
              total_visits: val.total_visits || 0
            };
            database.memoryStore.set(key, anonymizedRecord);
          }
        }
      }
    }
  }

  return {
    anonymizedCount,
    cutoffDate: cutoffISO,
    details
  };
}

/**
 * Enforces a hard 90-day ceiling for WhatsApp marketing campaign delivery logs and outbound
 * API telemetry, running a total database scrub on day 91.
 * 
 * @param {Object} [options]
 * @param {Object} [options.db]
 * @param {number|Date} [options.now]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<{ scrubbedCount: number, cutoffDate: string, details: Array<Object> }>}
 */
export async function scrubWhatsAppLogs90Days({ db, now, dryRun = false } = {}) {
  const currentNow = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
  const cutoffMs = currentNow - (90 * DAY_MS);
  const cutoffISO = new Date(cutoffMs).toISOString();

  const database = db || getDbClient();
  let scrubbedCount = 0;
  const details = [];

  if (database.memoryStore && database.memoryStore instanceof Map) {
    const keysToDelete = [];
    for (const [key, val] of database.memoryStore.entries()) {
      if (key.includes('/marketing_logs/') || key.includes('/campaign_logs/') || key.includes('/whatsapp_logs/')) {
        const logDate = val.created_at || val.sent_at || val.timestamp || val.date;
        const logMs = typeof logDate === 'number' ? logDate : new Date(logDate).getTime();
        if (isNaN(logMs) || logMs < cutoffMs) {
          keysToDelete.push({ key, id: val.id || key.split('/').pop(), timestamp: logDate });
        }
      }
    }

    scrubbedCount = keysToDelete.length;
    details.push(...keysToDelete);

    if (!dryRun) {
      keysToDelete.forEach(item => {
        database.memoryStore.delete(item.key);
      });
    }
  }

  return {
    scrubbedCount,
    cutoffDate: cutoffISO,
    details
  };
}

/**
 * Master orchestrator executing the full daily data retention and tiering routine.
 * 
 * @param {Object} [options]
 * @param {Object} [options.db]
 * @param {number|Date} [options.now]
 * @param {boolean} [options.dryRun=false]
 * @returns {Promise<Object>} Consolidated retention report
 */
export async function runDailyDataRetentionRoutine({ db, now, dryRun = false } = {}) {
  const currentNow = now ? (typeof now === 'number' ? now : new Date(now).getTime()) : Date.now();
  const timestamp = new Date(currentNow).toISOString();

  console.info(`[DataRetention] Starting daily retention routine at ${timestamp} (dryRun: ${dryRun})`);

  const purge500d = await executeHardPurge500Days({ db, now: currentNow, dryRun });
  const crmAnonymize730d = await anonymizeInactiveCustomers730Days({ db, now: currentNow, dryRun });
  const whatsappLogs90d = await scrubWhatsAppLogs90Days({ db, now: currentNow, dryRun });

  const summary = {
    timestamp,
    dryRun: !!dryRun,
    purge500d,
    crmAnonymize730d,
    whatsappLogs90d,
    totalRecordsPurged: purge500d.purgedCount + whatsappLogs90d.scrubbedCount,
    totalRecordsAnonymized: crmAnonymize730d.anonymizedCount
  };

  console.info(`[DataRetention] Completed routine: ${summary.totalRecordsPurged} records purged, ${summary.totalRecordsAnonymized} CRM profiles anonymized.`);
  return summary;
}
