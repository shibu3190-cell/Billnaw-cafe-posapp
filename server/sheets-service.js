// server/sheets-service.js - Google Sheets Relay Service
// Keeps confidential Webhook URLs and API credentials hidden on backend.
// Browser clients only communicate with /api/sheets/* endpoints.

import { CONFIG } from './config.js';

export async function relayGoogleSheetsAction({ action, clientId, data, customWebhookUrl }) {
  // Use custom webhook only if provided in server env or shop profile, else use server default
  const targetUrl = customWebhookUrl || CONFIG.sheets.defaultWebhookUrl;

  if (!targetUrl) {
    throw new Error('Google Sheets webhook URL is not configured on the backend.');
  }

  const payload = {
    action,
    clientId: clientId || 'BONGBHOJ-TERMINAL',
    data,
    timestamp: new Date().toISOString()
  };

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await res.text();
    return {
      success: true,
      status: res.status,
      response: responseText
    };
  } catch (error) {
    console.log('[Sheets Relay] Note:', error.message);
    return {
      success: false,
      queued: true,
      error: error.message
    };
  }
}
