/**
 * src/core/platform-bridge.js
 * Hardware & Cross-Platform Runtime Bridge for Billnaw Cafe POS.
 * 
 * Supports:
 *   1. Platform Detection: PWA (Browser), Android Native (Capacitor), Desktop Native (Tauri)
 *   2. Unified ESC/POS Thermal Printing:
 *      - WebBluetooth (Chrome / Edge / Android PWA)
 *      - WebUSB (Direct OTG / USB thermal printer)
 *      - Android Native Bluetooth (Capacitor BluetoothSerial plugin)
 *      - Desktop Tauri Raw Driver (Silent thermal spooler)
 *      - Browser Dialog Fallback (window.print)
 *   3. Decoupled Print Job Queue: Printer jams/disconnections NEVER block or roll back settled bills.
 *   4. Real-time Network Connectivity Telemetry.
 */

import { successResult, errorResult } from './error-handler.js';

export const PLATFORMS = {
  PWA_BROWSER: 'PWA_BROWSER',
  ANDROID_CAPACITOR: 'ANDROID_CAPACITOR',
  DESKTOP_TAURI: 'DESKTOP_TAURI'
};

/**
 * Detects the active host runtime platform.
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
  if (typeof navigator !== 'undefined') {
    onStatusChange(navigator.onLine);
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

/**
 * Universal Hardware Thermal Printer Bridge.
 */
export const ThermalPrinterBridge = {
  activeBluetoothDevice: null,
  activeCharacteristic: null,
  activeUsbDevice: null,
  printQueue: [],
  isProcessingQueue: false,

  /**
   * Connect to Bluetooth thermal printer via WebBluetooth.
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectBluetoothPrinter() {
    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      return errorResult('BLUETOOTH_UNSUPPORTED', 'WebBluetooth is not supported on this browser or platform.');
    }

    try {
      const device = await navigator.bluetooth.requestDevice({
        filters: [
          { services: ['000018f0-0000-1000-8000-00805f9b34fb'] },
          { services: ['e7810a71-73ae-499d-8c15-faa9aef0c3f2'] },
          { namePrefix: 'POS' },
          { namePrefix: 'RP' },
          { namePrefix: 'MTP' },
          { namePrefix: 'InnerPrinter' }
        ],
        optionalServices: [
          '000018f0-0000-1000-8000-00805f9b34fb',
          'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
          '49535343-fe7d-4ae5-8fa9-9fafd205e455'
        ]
      });

      const server = await device.gatt.connect();
      let service = null;
      try {
        service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
      } catch (e) {
        service = await server.getPrimaryService('e7810a71-73ae-499d-8c15-faa9aef0c3f2');
      }

      const characteristics = await service.getCharacteristics();
      const writableChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);

      if (!writableChar) {
        throw new Error('No writable GATT characteristic found on printer.');
      }

      this.activeBluetoothDevice = device;
      this.activeCharacteristic = writableChar;

      return successResult({ name: device.name, connected: true, transport: 'BLUETOOTH' });
    } catch (err) {
      return errorResult('BLUETOOTH_CONNECT_FAILED', err.message);
    }
  },

  /**
   * Connect to USB thermal printer via WebUSB.
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectUsbPrinter() {
    if (typeof navigator === 'undefined' || !navigator.usb) {
      return errorResult('USB_UNSUPPORTED', 'WebUSB is not supported on this browser or platform.');
    }

    try {
      const device = await navigator.usb.requestDevice({
        filters: [{ classCode: 7 }] // 7 = USB Printer Class
      });

      await device.open();
      if (device.configuration === null) {
        await device.selectConfiguration(1);
      }
      await device.claimInterface(0);

      this.activeUsbDevice = device;
      return successResult({ name: device.productName || 'USB Thermal Printer', connected: true, transport: 'USB' });
    } catch (err) {
      return errorResult('USB_CONNECT_FAILED', err.message);
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

    // Header
    parts.push(encoder.encode(`\nBILLNAW POS\n`));
    parts.push(encoder.encode(`Bill #${invoice.bill_no || invoice.invoice_id || invoice.id}\n`));
    parts.push(encoder.encode(`${invoice.created_at || invoice.settled_at || new Date().toLocaleString()}\n`));
    parts.push(encoder.encode(`--------------------------------\n`));

    // ESC a 0 (Left alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x00]));

    // Line items
    if (Array.isArray(invoice.items)) {
      for (const item of invoice.items) {
        const name = (item.name || 'Item').slice(0, 18).padEnd(18, ' ');
        const qty = String(item.quantity || item.qty || 1).padStart(3, ' ');
        const itemTotalPaise = item.line_total_paise !== undefined 
          ? item.line_total_paise 
          : (item.item_subtotal_paise || (item.price * 100));
        const price = `₹${(itemTotalPaise / 100).toFixed(2)}`.padStart(9, ' ');
        parts.push(encoder.encode(`${name} ${qty} ${price}\n`));
      }
    }

    parts.push(encoder.encode(`--------------------------------\n`));

    // ESC a 2 (Right alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x02]));
    const totalPaise = invoice.final_payable_paise !== undefined 
      ? invoice.final_payable_paise 
      : (invoice.final_total_paise || (invoice.amount * 100));
    const totalRupees = (totalPaise / 100).toFixed(2);
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
   * Enqueue a bill print job. Decoupled from bill saving so printer errors never compromise settled bills.
   * @param {Object} invoice
   * @param {Object} [options={}]
   * @returns {Promise<ServiceResult<{ queued: boolean, jobId: string }>>}
   */
  async enqueuePrintJob(invoice, options = {}) {
    const jobId = `pjob_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job = {
      id: jobId,
      invoice,
      options,
      attempts: 0,
      timestamp: Date.now()
    };

    this.printQueue.push(job);
    this.processQueue();

    return successResult({ queued: true, jobId });
  },

  /**
   * Process background print queue sequentially.
   */
  async processQueue() {
    if (this.isProcessingQueue || this.printQueue.length === 0) return;
    this.isProcessingQueue = true;

    while (this.printQueue.length > 0) {
      const job = this.printQueue[0];
      try {
        job.attempts++;
        await this.printReceipt(job.invoice, job.options);
        // Successful print - dequeue
        this.printQueue.shift();
      } catch (err) {
        console.warn(`[PrinterBridge] Print job ${job.id} attempt ${job.attempts} failed:`, err.message);
        if (job.attempts >= 3) {
          // Move failed job to local DLQ (dead letter queue) in storage
          this.archiveFailedJob(job, err.message);
          this.printQueue.shift();
        } else {
          // Wait before retrying
          await new Promise(r => setTimeout(r, 2000));
        }
      }
    }

    this.isProcessingQueue = false;
  },

  archiveFailedJob(job, errorMsg) {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_failed_print_jobs');
        const dlq = raw ? JSON.parse(raw) : [];
        dlq.push({ ...job, error: errorMsg, failedAt: new Date().toISOString() });
        localStorage.setItem('pos_failed_print_jobs', JSON.stringify(dlq.slice(-20)));
      } catch (e) {}
    }
  },

  /**
   * Prints an invoice receipt via active peripheral or falls back to system dialog.
   * @param {Object} invoice
   * @param {Object} [options={}]
   * @returns {Promise<ServiceResult<{ printed: boolean, method: string }>>}
   */
  async printReceipt(invoice, options = {}) {
    const platform = detectPlatform();

    // 1. Android Capacitor Native Bluetooth Bridge
    if (platform === PLATFORMS.ANDROID_CAPACITOR) {
      if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.BluetoothSerial) {
        try {
          const bytes = this.generateEscPosCommands(invoice);
          await window.Capacitor.Plugins.BluetoothSerial.write({ data: Array.from(bytes) });
          return successResult({ printed: true, method: 'CAPACITOR_BLUETOOTH' });
        } catch (e) {
          console.warn('[PrinterBridge] Native Android print failed:', e.message);
        }
      }
    }

    // 2. Desktop Tauri Silent Raw Printing Bridge
    if (platform === PLATFORMS.DESKTOP_TAURI) {
      if (typeof window !== 'undefined' && window.__TAURI__?.invoke) {
        try {
          const bytes = this.generateEscPosCommands(invoice);
          await window.__TAURI__.invoke('print_raw_escpos', { bytes: Array.from(bytes) });
          return successResult({ printed: true, method: 'TAURI_SILENT' });
        } catch (e) {
          console.warn('[PrinterBridge] Tauri raw print failed:', e.message);
        }
      }
    }

    // 3. WebBluetooth Connected Characteristic
    if (this.activeCharacteristic) {
      try {
        const bytes = this.generateEscPosCommands(invoice);
        const chunkSize = 512;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.slice(i, i + chunkSize);
          await this.activeCharacteristic.writeValue(chunk);
        }
        return successResult({ printed: true, method: 'BLUETOOTH_ESC_POS' });
      } catch (err) {
        console.warn('[PrinterBridge] Bluetooth dispatch failed, falling back:', err.message);
      }
    }

    // 4. WebUSB Connected Device
    if (this.activeUsbDevice) {
      try {
        const bytes = this.generateEscPosCommands(invoice);
        // Endpoint 1 OUT is typical for USB printers
        await this.activeUsbDevice.transferOut(1, bytes);
        return successResult({ printed: true, method: 'WEBUSB_ESC_POS' });
      } catch (err) {
        console.warn('[PrinterBridge] WebUSB dispatch failed:', err.message);
      }
    }

    // 5. Browser Print Dialog Fallback
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      return successResult({ printed: true, method: 'BROWSER_DIALOG' });
    }

    return errorResult('PRINTER_UNAVAILABLE', 'No printing hardware or dialog available.');
  }
};
