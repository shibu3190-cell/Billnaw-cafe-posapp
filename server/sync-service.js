// server/sync-service.js - Backend Shop Mapping, Cloud Sync, Backup, and Diagnostics
// Manages shop data integrity, verification, cloud configuration, and state mapping.

import { CONFIG } from './config.js';

export function getShopStatus() {
  return {
    status: 'online',
    serverTime: new Date().toISOString(),
    geminiConfigured: Boolean(CONFIG.gemini.apiKey),
    sheetsConfigured: Boolean(CONFIG.sheets.defaultWebhookUrl),
    firebase: {
      projectId: CONFIG.firebase.projectId,
      firestoreDatabaseId: CONFIG.firebase.firestoreDatabaseId,
      realtimeSyncSupported: true,
      authDomain: CONFIG.firebase.authDomain,
      storageBucket: CONFIG.firebase.storageBucket
    }
  };
}

export function getPublicClientConfig() {
  // Returns safe public parameters to client without exposing backend secrets or server tokens
  return {
    projectId: CONFIG.firebase.projectId,
    firestoreDatabaseId: CONFIG.firebase.firestoreDatabaseId,
    authDomain: CONFIG.firebase.authDomain,
    storageBucket: CONFIG.firebase.storageBucket,
    messagingSenderId: CONFIG.firebase.messagingSenderId,
    appId: CONFIG.firebase.appId,
    apiKey: CONFIG.firebase.apiKey,
    geminiServerAvailable: Boolean(CONFIG.gemini.apiKey),
    sheetsServerAvailable: Boolean(CONFIG.sheets.defaultWebhookUrl)
  };
}

export function createShopExportBundle({ clientId, profile, staff, menu, customers, history, expenses, tables }) {
  return {
    version: '2.0.0',
    exportedAt: new Date().toISOString(),
    clientId: clientId || 'BONGBHOJ-TERMINAL',
    profile: profile || {},
    staff: staff || [],
    customers: customers || [],
    menu: menu || [],
    tables: tables || {},
    history: history || [],
    expenses: expenses || []
  };
}

export function validateShopImportBundle(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    throw new Error('Invalid backup file. Payload must be a JSON object.');
  }

  return {
    valid: true,
    shopName: bundle.profile?.name || 'Unnamed Store',
    clientId: bundle.clientId || 'BONGBHOJ-TERMINAL',
    staffCount: Array.isArray(bundle.staff) ? bundle.staff.length : 0,
    customerCount: Array.isArray(bundle.customers) ? bundle.customers.length : 0,
    menuItemCount: Array.isArray(bundle.menu) ? bundle.menu.length : 0,
    historyCount: Array.isArray(bundle.history) ? bundle.history.length : 0,
    expenseCount: Array.isArray(bundle.expenses) ? bundle.expenses.length : 0
  };
}
