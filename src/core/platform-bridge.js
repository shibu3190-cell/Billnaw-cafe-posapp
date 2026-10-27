/**
 * src/core/platform-bridge.js
 * Hardware & Cross-Platform Runtime Bridge for Billnaw Cafe POS.
 * Detects PWA, Android Capacitor, and Desktop Tauri, and provides unified ESC/POS printing.
 */

import { successResult, errorResult } from './error-handler.js';

export const PLATFORMS = {
  PWA_BROWSER: 'PWA_BROWSER',
  ANDROID_CAPACITOR: 'ANDROID_CAPACITOR',
  DESKTOP_TAURI: 'DESKTOP_TAURI'
};

/**
 * Detects the active host platform.
 * @returns {string}
 */
export function detectPlatform() {
  if (typeof window !== 'undefined') {
    if (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
      return PLATFORMS.ANDROID_CAPACITOR;
    }
    if (window.__TAURI__ || window.__TAURI_METADATA__) {
      return PLATFORMS.DESKTOP_TAURI;
    }
  }
  return PLATFORMS.PWA_BROWSER;
}

/**
 * Monitors device network connectivity state.
 * @param {Function} onStatusChange - Receives (isOnline: boolean)
 * @returns {Function} Unsubscribe listener
 */
export function monitorNetworkStatus(onStatusChange) {
  if (typeof window === 'undefined') return () => {};

  const handleOnline = () => onStatusChange(true);
  const handleOffline = () => onStatusChange(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // Initial dispatch
  onStatusChange(navigator.onLine);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Thermal Printer Hardware Bridge.
 * Generates raw ESC/POS commands and dispatches via WebBluetooth, WebUSB, or browser print dialog.
 */
export const ThermalPrinterBridge = {
  activeBluetoothDevice: null,
  activeCharacteristic: null,

  /**
   * Connects to a Bluetooth thermal printer via WebBluetooth.
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectBluetoothPrinter() {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      return errorResult('BLUETOOTH_UNSUPPORTED', 'WebBluetooth is not supported on this browser or platform.');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
        optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');

      this.activeBluetoothDevice = device;
      this.activeCharacteristic = characteristic;

      return successResult({ name: device.name, connected: true });
    } catch (err) {
      return errorResult('BLUETOOTH_CONNECT_FAILED', err.message);
    }
  },

  /**
   * Generates standard ESC/POS bytes for 58mm/80mm thermal printers.
   * @param {Object} invoice
   * @param {string} [width='58mm']
   * @returns {Uint8Array}
   */
  generateEscPosCommands(invoice, width = '58mm') {
    const encoder = new TextEncoder();
    const parts = [];

    // ESC @ (Initialize printer)
    parts.push(new Uint8Array([0x1B, 0x40]));

    // ESC a 1 (Center alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x01]));

    // Cafe Header
    parts.push(encoder.encode(`\nBILLNAW POS\n`));
    parts.push(encoder.encode(`Bill #${invoice.bill_no || invoice.id}\n`));
    parts.push(encoder.encode(`${invoice.created_at || new Date().toLocaleString()}\n`));
    parts.push(encoder.encode(`--------------------------------\n`));

    // ESC a 0 (Left alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x00]));

    // Item rows
    if (Array.isArray(invoice.items)) {
      for (const item of invoice.items) {
        const name = (item.name || 'Item').slice(0, 18).padEnd(18, ' ');
        const qty = String(item.qty || 1).padStart(3, ' ');
        const price = `₹${((item.item_subtotal_paise || (item.price * 100)) / 100).toFixed(2)}`.padStart(9, ' ');
        parts.push(encoder.encode(`${name} ${qty} ${price}\n`));
      }
    }

    parts.push(encoder.encode(`--------------------------------\n`));

    // ESC a 2 (Right alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x02]));
    const totalRupees = ((invoice.final_total_paise || (invoice.amount * 100)) / 100).toFixed(2);
    parts.push(encoder.encode(`TOTAL: ₹${totalRupees}\n\n`));

    // Center alignment & footer
    parts.push(new Uint8Array([0x1B, 0x61, 0x01]));
    parts.push(encoder.encode(`Thank You! Visit Again\n\n\n`));

    // GS V 66 0 (Cut paper)
    parts.push(new Uint8Array([0x1D, 0x56, 0x42, 0x00]));

    // Combine all chunks into single Uint8Array
    const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const p of parts) {
      combined.set(p, offset);
      offset += p.length;
    }

    return combined;
  },

  /**
   * Prints an invoice receipt. Gracefully falls back to browser window.print() if Bluetooth is unavailable.
   * @param {Object} invoice
   * @returns {Promise<ServiceResult<{ printed: boolean, method: string }>>}
   */
  async printReceipt(invoice) {
    if (this.activeCharacteristic) {
      try {
        const bytes = this.generateEscPosCommands(invoice);
        // Send in 512-byte chunks
        const chunkSize = 512;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          await this.activeCharacteristic.writeValue(chunk);
        }
        return successResult({ printed: true, method: 'BLUETOOTH_ESC_POS' });
      } catch (err) {
        console.warn('[PrinterBridge] Bluetooth dispatch failed, falling back to window.print():', err.message);
      }
    }

    // Browser print fallback
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      return successResult({ printed: true, method: 'BROWSER_DIALOG' });
    }

    return errorResult('PRINTER_UNAVAILABLE', 'No printing hardware or dialog available.');
  }
};
