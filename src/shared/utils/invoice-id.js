/**
 * src/shared/utils/invoice-id.js
 * Deterministic Offline Invoice ID & Human-Readable Bill Number Generator.
 * Prevents offline invoice ID collisions across concurrent counters.
 */

import { getActiveTerminalId } from '../../core/config.js';

/**
 * Generates a standard RFC4122 version 4 UUID.
 * @returns {string} e.g. "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
 */
export function generateUuidV4() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback UUID v4 generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const generateClientInvoiceId = generateUuidV4;

/**
 * Formats current date as YYMMDD.
 * @param {Date} [d=new Date()]
 * @returns {string} e.g. "261027"
 */
export function getDateCode(d = new Date()) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/**
 * Generates a deterministic human-readable bill number and UUID pair:
 * Format: BN-{TerminalID}-{YYMMDD}-{DailyCounter}
 * e.g., BN-TERM01-261027-0042
 * 
 * @param {string} [terminalId='T1']
 * @param {number} [counter=1]
 * @param {Date} [now=new Date()]
 * @returns {{ invoice_id: string, client_invoice_id: string, billNo: string, counter: number, terminalId: string, dateCode: string }}
 */
export function generateDeterministicInvoiceId(terminalId = 'T1', counter = 1, now = new Date()) {
  const terminal = String(terminalId || 'T1').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'T1';
  const dateCode = getDateCode(now);
  const count = typeof counter === 'number' ? counter : (parseInt(counter, 10) || 1);
  const counterStr = String(count).padStart(4, '0');
  const invoice_id = `BN-${terminal}-${dateCode}-${counterStr}`;
  const client_invoice_id = generateUuidV4();

  return {
    invoice_id,
    client_invoice_id,
    billNo: invoice_id,
    counter: count,
    terminalId: terminal,
    dateCode
  };
}

/**
 * Generates deterministic identifier tracking daily sequence automatically.
 */
export function generateDeterministicInvoiceIdentifier(terminalId, now = new Date()) {
  const terminal = (terminalId || getActiveTerminalId() || 'T1').toUpperCase();
  const dateCode = getDateCode(now);
  const storageKey = `billnaw_seq_${terminal}_${dateCode}`;

  let currentCount = 0;
  if (typeof localStorage !== 'undefined') {
    currentCount = parseInt(localStorage.getItem(storageKey), 10) || 0;
  }

  const nextCount = currentCount + 1;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, String(nextCount));
  }

  return generateDeterministicInvoiceId(terminal, nextCount, now);
}

/**
 * Parses a deterministic invoice ID back into its constituent parts.
 * @param {string} invoiceId e.g. "BN-TERM01-261027-0042"
 * @returns {{ prefix: string, terminalId: string, dateCode: string, sequence: number }|null}
 */
export function parseInvoiceId(invoiceId) {
  if (!invoiceId || typeof invoiceId !== 'string') return null;
  const match = invoiceId.match(/^BN-(.+)-(\d{6})-(\d+)$/);
  if (match) {
    return {
      prefix: 'BN',
      terminalId: match[1],
      dateCode: match[2],
      sequence: parseInt(match[3], 10) || 0
    };
  }
  return null;
}
