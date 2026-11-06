/**
 * src/core/platform-bridge.js
 * Hardware & Cross-Platform Runtime Bridge for Billnaw Cafe POS.
 * 
 * Supports:
 *   1. Platform Detection: PWA (Browser), Android Native (Capacitor), Desktop Native (Tauri)
 *   2. Unified ESC/POS Thermal Printing:
 *      - WebBluetooth (Chrome / Edge / Android PWA) with Ezo BLE & universal GATT traversal
 *      - WebUSB (Direct OTG / USB thermal printer) with dynamic OUT endpoint discovery
 *      - Network / Ethernet / WiFi TCP printing via backend proxy (Port 9100 RAW)
 *      - Web Serial API (Desktop Bluetooth Classic SPP virtual COM ports)
 *      - Android Native Bluetooth (Capacitor BluetoothSerial plugin)
 *      - Desktop Tauri Raw Driver (Silent thermal spooler)
 *      - Browser Dialog Fallback (window.print)
 *   3. Dual-Printer Concurrent Slot Management (Printer 1: Receipt, Printer 2: Kitchen KOT)
 *   4. Decoupled Print Job Queue: Printer jams/disconnections NEVER block or roll back settled bills.
 *   5. Real-time Network Connectivity Telemetry.
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
 * Universal Thermal Printer Bluetooth Low Energy Service UUIDs.
 * Includes Standard Rongta, Zijiang, ISSC UART, Ezo BLE (Telink/Bekene), and Tencent AirSync.
 */
export const BLE_PRINTER_SERVICE_UUIDS = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Standard Rongta / Xprinter / POS-58
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Zijiang / Milestone / POS-8001
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent UART
  '0000ff00-0000-1000-8000-00805f9b34fb', // Ezo BLE / Telink (TLSR8266/8258) / Bekene (BK3431/3432)
  '0000fee7-0000-1000-8000-00805f9b34fb'  // Tencent / WeChat AirSync
];

/**
 * Dynamically traverses GATT services to discover the first writable ESC/POS characteristic.
 * @param {BluetoothRemoteGATTServer} server
 * @param {string[]} [knownUuids=BLE_PRINTER_SERVICE_UUIDS]
 * @returns {Promise<{ characteristic: BluetoothRemoteGATTCharacteristic, service: BluetoothRemoteGATTService }>}
 */
export async function discoverWritableGattCharacteristic(server, knownUuids = BLE_PRINTER_SERVICE_UUIDS) {
  // Strategy 1: Dynamic traversal across all primary services returned by getPrimaryServices()
  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties && (char.properties.write || char.properties.writeWithoutResponse)) {
            return { characteristic: char, service };
          }
        }
      } catch (_) {
        // Continue searching next service if characteristic reading fails on this service
      }
    }
  } catch (enumErr) {
    console.warn('[PrinterBridge] Primary services dynamic enumeration failed, trying direct UUID fallback:', enumErr);
  }

  // Strategy 2: Targeted query for known printer service UUIDs
  for (const uuid of knownUuids) {
    try {
      const service = await server.getPrimaryService(uuid);
      const characteristics = await service.getCharacteristics();
      for (const char of characteristics) {
        if (char.properties && (char.properties.write || char.properties.writeWithoutResponse)) {
          return { characteristic: char, service };
        }
      }
    } catch (_) {
      // Service not supported on this device, check next
    }
  }

  throw new Error('No writable GATT characteristic found on printer. Please ensure device supports standard ESC/POS printing.');
}

/**
 * Safely writes ESC/POS bytecode to a BLE characteristic in 100-byte chunks with 25ms pacing
 * to prevent UART buffer overflow on low-memory microcontrollers (e.g. Ezo BLE Telink chips).
 * @param {BluetoothRemoteGATTCharacteristic} characteristic
 * @param {Uint8Array} bytes
 */
export async function writeBleEscPosChunks(characteristic, bytes) {
  if (!characteristic || !bytes || bytes.length === 0) return;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (typeof characteristic.writeValueWithoutResponse === 'function' && characteristic.properties && characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else if (typeof characteristic.writeValue === 'function') {
      await characteristic.writeValue(chunk);
    } else if (typeof characteristic.writeValueWithResponse === 'function') {
      await characteristic.writeValueWithResponse(chunk);
    }
    if (i + CHUNK_SIZE < bytes.length) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }
  }
}

/**
 * Wraps text into lines strictly respecting maxCols, breaking on whitespace where possible
 * or chunking long tokens, and optionally prepending indent to wrapped continuation lines.
 * Guarantees that no line exceeds maxCols.
 * @param {string} text
 * @param {number} maxCols
 * @param {string} [indent='']
 * @returns {string[]}
 */
export function wrapText(text, maxCols, indent = '') {
  if (text === null || text === undefined) return [];
  const str = String(text);
  if (!str.length) return [];

  const result = [];
  const paragraphs = str.split(/\r?\n/);

  for (const para of paragraphs) {
    if (!para.length) {
      result.push('');
      continue;
    }

    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      result.push('');
      continue;
    }

    let currentLine = '';
    let isFirst = true;

    for (const word of words) {
      const lineIndent = isFirst ? '' : indent;
      const testLine = currentLine.length === 0 ? (lineIndent + word) : (currentLine + ' ' + word);

      if (testLine.length <= maxCols) {
        currentLine = testLine;
      } else {
        if (currentLine.length > 0) {
          result.push(currentLine);
          isFirst = false;
        }

        const nextIndent = isFirst ? '' : indent;
        const availWidth = maxCols - nextIndent.length;

        if (word.length <= availWidth) {
          currentLine = nextIndent + word;
        } else {
          let remainingWord = word;
          while (remainingWord.length > 0) {
            const thisIndent = isFirst ? '' : indent;
            const wWidth = maxCols - thisIndent.length;
            if (wWidth <= 0) {
              result.push(remainingWord.slice(0, maxCols));
              remainingWord = remainingWord.slice(maxCols);
            } else {
              const chunk = remainingWord.slice(0, wWidth);
              remainingWord = remainingWord.slice(wWidth);
              if (remainingWord.length > 0) {
                result.push(thisIndent + chunk);
                isFirst = false;
              } else {
                currentLine = thisIndent + chunk;
              }
            }
          }
        }
      }
    }
    if (currentLine.length > 0) {
      result.push(currentLine);
    }
  }

  return result;
}

/**
 * Sanitizes text destined for ESC/POS thermal printers by converting Unicode currency
 * symbols, non-breaking spaces, smart quotes, and bullets into clean CP437 ASCII equivalents.
 * Strips unsupported non-ASCII characters to prevent garbage characters and line wrap glitches.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeEscPosText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/[\u20B9\u20A8]\s*/g, 'Rs. ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2022\u25CF\u00B7]/g, '|')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[^\x00-\x7F]/g, '');
}

/**
 * Default dual thermal printer slots and role routing configuration.
 */
export const DEFAULT_PRINTERS_CONFIG = {
  printer1: {
    id: 'printer1',
    name: 'Printer 1 (Receipt)',
    transport: 'BLUETOOTH', // 'BLUETOOTH' | 'USB' | 'NETWORK' | 'SERIAL' | 'SYSTEM_DIALOG'
    paperWidth: '80mm',     // '58mm' | '80mm'
    role: 'RECEIPT',        // 'RECEIPT' | 'KOT' | 'BOTH' | 'NONE'
    host: '',
    port: 9100,
    baudRate: 9600,
    autoCut: true,
    status: 'DISCONNECTED'
  },
  printer2: {
    id: 'printer2',
    name: 'Printer 2 (Kitchen)',
    transport: 'BLUETOOTH',
    paperWidth: '58mm',
    role: 'KOT',
    host: '',
    port: 9100,
    baudRate: 9600,
    autoCut: true,
    status: 'DISCONNECTED'
  },
  routing: {
    defaultReceiptPrinter: 'printer1', // 'printer1' | 'printer2' | 'PROMPT'
    defaultKotPrinter: 'printer2',     // 'printer1' | 'printer2' | 'PROMPT'
    alwaysPrompt: false,
    singlePrinterMode: false
  }
};

/**
 * Universal Hardware Thermal Printer Bridge.
 */
export const ThermalPrinterBridge = {
  // Dual-slot printer configuration
  printers: {
    printer1: {
      id: 'printer1',
      name: 'Printer 1 (Receipt)',
      transport: 'BLUETOOTH', // 'BLUETOOTH' | 'USB' | 'NETWORK' | 'SERIAL' | 'SYSTEM_DIALOG'
      paperWidth: '80mm',     // '58mm' | '80mm'
      role: 'RECEIPT',        // 'RECEIPT' | 'KOT' | 'BOTH' | 'NONE'
      status: 'DISCONNECTED', // 'DISCONNECTED' | 'CONNECTED' | 'CONFIGURED'
      device: null,
      server: null,
      characteristic: null,
      serviceUuid: null,
      charUuid: null,
      endpointNumber: null,
      interfaceNumber: null,
      host: null,
      port: 9100,
      serialPort: null,
      baudRate: 9600
    },
    printer2: {
      id: 'printer2',
      name: 'Printer 2 (Kitchen)',
      transport: 'BLUETOOTH',
      paperWidth: '58mm',
      role: 'KOT',
      status: 'DISCONNECTED',
      device: null,
      server: null,
      characteristic: null,
      serviceUuid: null,
      charUuid: null,
      endpointNumber: null,
      interfaceNumber: null,
      host: null,
      port: 9100,
      serialPort: null,
      baudRate: 9600
    }
  },

  routing: {
    defaultReceiptPrinter: 'printer1',
    defaultKotPrinter: 'printer2',
    alwaysPrompt: false,
    singlePrinterMode: false
  },

  // Backward compatibility legacy properties & getters/setters for existing test suites
  _activeBluetoothDevice: null,
  _activeCharacteristic: null,
  _activeUsbDevice: null,
  _activeUsbEndpoint: null,

  get activeBluetoothDevice() {
    return this.printers?.printer1?.device || this.printers?.printer2?.device || this._activeBluetoothDevice || null;
  },
  set activeBluetoothDevice(dev) {
    this._activeBluetoothDevice = dev;
    if (this.printers?.printer1) this.printers.printer1.device = dev;
  },

  get activeCharacteristic() {
    return this.printers?.printer1?.characteristic || this.printers?.printer2?.characteristic || this._activeCharacteristic || null;
  },
  set activeCharacteristic(char) {
    this._activeCharacteristic = char;
    if (this.printers?.printer1) this.printers.printer1.characteristic = char;
  },

  get activeUsbDevice() {
    return this.printers?.printer1?.device || this._activeUsbDevice || null;
  },
  set activeUsbDevice(dev) {
    this._activeUsbDevice = dev;
    if (this.printers?.printer1) this.printers.printer1.device = dev;
  },

  get activeUsbEndpoint() {
    return this.printers?.printer1?.endpointNumber || this._activeUsbEndpoint || 1;
  },
  set activeUsbEndpoint(ep) {
    this._activeUsbEndpoint = ep;
    if (this.printers?.printer1) this.printers.printer1.endpointNumber = ep;
  },

  printQueue: [],
  isProcessingQueue: false,

  /**
   * Loads persisted printer configuration from localStorage ('billnaw_printers_config' or 'pos_dual_printers').
   * @returns {Object} { printer1, printer2, routing }
   */
  loadPrinterSettings() {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('billnaw_printers_config') || localStorage.getItem('pos_dual_printers');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.printer1 && this.printers?.printer1) {
            Object.assign(this.printers.printer1, parsed.printer1);
          }
          if (parsed.printer2 && this.printers?.printer2) {
            Object.assign(this.printers.printer2, parsed.printer2);
          }
          if (parsed.routing && this.routing) {
            Object.assign(this.routing, parsed.routing);
          }
        }
      } catch (e) {
        console.warn('[PrinterBridge] Failed to load printer settings:', e);
      }
    }
    return {
      printer1: { ...this.printers.printer1 },
      printer2: { ...this.printers.printer2 },
      routing: { ...this.routing }
    };
  },

  /**
   * Persists dual printer settings to localStorage ('billnaw_printers_config' and 'pos_dual_printers').
   * @param {Object} [config] - Optional partial or full configuration update
   * @returns {Object} Saved configuration object
   */
  savePrinterSettings(config = {}) {
    if (config.printer1 && this.printers?.printer1) {
      Object.assign(this.printers.printer1, config.printer1);
    }
    if (config.printer2 && this.printers?.printer2) {
      Object.assign(this.printers.printer2, config.printer2);
    }
    if (config.routing && this.routing) {
      Object.assign(this.routing, config.routing);
    }

    const serializeSlot = (slot) => {
      if (!slot) return {};
      return {
        id: slot.id,
        name: slot.name,
        transport: slot.transport,
        paperWidth: slot.paperWidth,
        role: slot.role,
        host: slot.host || '',
        port: Number(slot.port) || 9100,
        baudRate: Number(slot.baudRate) || 9600,
        autoCut: slot.autoCut !== false,
        status: slot.status || 'DISCONNECTED'
      };
    };

    const data = {
      printer1: serializeSlot(this.printers?.printer1),
      printer2: serializeSlot(this.printers?.printer2),
      routing: {
        defaultReceiptPrinter: this.routing?.defaultReceiptPrinter || 'printer1',
        defaultKotPrinter: this.routing?.defaultKotPrinter || 'printer2',
        alwaysPrompt: Boolean(this.routing?.alwaysPrompt),
        singlePrinterMode: Boolean(this.routing?.singlePrinterMode)
      }
    };

    if (typeof localStorage !== 'undefined') {
      try {
        const serialized = JSON.stringify(data);
        localStorage.setItem('billnaw_printers_config', serialized);
        localStorage.setItem('pos_dual_printers', serialized);
      } catch (e) {
        console.warn('[PrinterBridge] Failed to save printer configuration:', e);
      }
    }

    return data;
  },

  /**
   * Checks whether a printer slot is configured and ready for transmission.
   * @param {string} slotKey - 'printer1' | 'printer2' | 'SYSTEM_DIALOG'
   * @returns {boolean}
   */
  isPrinterReady(slotKey) {
    if (slotKey === 'SYSTEM_DIALOG') return true;
    const slot = this.printers?.[slotKey];
    if (!slot) return false;
    if (slot.transport === 'SYSTEM_DIALOG') return true;
    if (slot.transport === 'BLUETOOTH') return Boolean(slot.characteristic);
    if (slot.transport === 'USB') return Boolean(slot.device);
    if (slot.transport === 'NETWORK') return Boolean(slot.host);
    if (slot.transport === 'SERIAL') return Boolean(slot.serialPort);
    return false;
  },

  /**
   * Initialize and restore persisted printer slot configurations.
   */
  init() {
    return this.loadPrinterSettings();
  },

  /**
   * Persist current printer slot configuration to localStorage.
   */
  persistPrinterConfig() {
    return this.savePrinterSettings();
  },

  /**
   * Connect to Bluetooth thermal printer via WebBluetooth.
   * Supports universal discovery including Ezo BLE printers and dual slot allocation.
   * @param {string} [printerSlot='printer1'] - 'printer1' | 'printer2'
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectBluetoothPrinter(printerSlot = 'printer1') {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';

    if (typeof navigator === 'undefined' || !navigator.bluetooth) {
      return errorResult('BLUETOOTH_UNSUPPORTED', 'WebBluetooth is not supported on this browser or platform.');
    }

    try {
      // acceptAllDevices: true with full 5-UUID optionalServices list ensures Ezo and OEM discovery
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: BLE_PRINTER_SERVICE_UUIDS
      });

      const server = await device.gatt.connect();
      const { characteristic, service } = await discoverWritableGattCharacteristic(server, BLE_PRINTER_SERVICE_UUIDS);

      // Handle printer disconnection
      device.addEventListener('gattserverdisconnected', () => {
        console.warn(`[PrinterBridge] ${slotKey} (${device.name || 'Printer'}) disconnected.`);
        if (this.printers[slotKey]) {
          this.printers[slotKey].status = 'DISCONNECTED';
          this.printers[slotKey].device = null;
          this.printers[slotKey].server = null;
          this.printers[slotKey].characteristic = null;
        }
        if (this._activeBluetoothDevice === device) {
          this._activeBluetoothDevice = null;
          this._activeCharacteristic = null;
        }
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(new CustomEvent('printer-disconnected', {
            detail: { slot: slotKey, name: device.name || 'Bluetooth Printer' }
          }));
        }
      });

      // Update slot state
      this.printers[slotKey].device = device;
      this.printers[slotKey].server = server;
      this.printers[slotKey].characteristic = characteristic;
      this.printers[slotKey].serviceUuid = service?.uuid || null;
      this.printers[slotKey].charUuid = characteristic.uuid;
      this.printers[slotKey].name = device.name || (slotKey === 'printer2' ? 'Kitchen BLE Printer' : 'Receipt BLE Printer');
      this.printers[slotKey].status = 'CONNECTED';
      this.printers[slotKey].transport = 'BLUETOOTH';

      if (slotKey === 'printer1' || !this._activeCharacteristic) {
        this._activeBluetoothDevice = device;
        this._activeCharacteristic = characteristic;
      }

      // Sync with pos.js runtime if available
      if (typeof window !== 'undefined') {
        window.posPrinters = window.posPrinters || {};
        window.posPrinters[slotKey] = this.printers[slotKey];
        if (slotKey === 'printer1') {
          window.bleDevice = device;
          window.bleServer = server;
          window.printCharacteristic = characteristic;
        }
      }

      this.persistPrinterConfig();

      return successResult({
        slot: slotKey,
        name: device.name || 'Bluetooth Printer',
        connected: true,
        transport: 'BLUETOOTH',
        serviceUuid: service?.uuid,
        charUuid: characteristic.uuid
      });
    } catch (err) {
      return errorResult('BLUETOOTH_CONNECT_FAILED', err.message);
    }
  },

  /**
   * Connect to USB thermal printer via WebUSB with dynamic OUT endpoint discovery.
   * @param {string} [printerSlot='printer1']
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectUsbPrinter(printerSlot = 'printer1') {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';

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

      // Dynamic OUT endpoint and interface discovery
      let targetInterfaceNumber = null;
      let outEndpoint = null;

      if (device.configuration && Array.isArray(device.configuration.interfaces)) {
        // Pass 1: Prioritize Bulk OUT endpoint across all interfaces and alternates
        for (const iface of device.configuration.interfaces) {
          const alternates = iface.alternates || (iface.alternate ? [iface.alternate] : []);
          for (const alt of alternates) {
            if (Array.isArray(alt.endpoints)) {
              const bulkOut = alt.endpoints.find(ep => ep.direction === 'out' && ep.type === 'bulk');
              if (bulkOut) {
                targetInterfaceNumber = iface.interfaceNumber;
                outEndpoint = bulkOut;
                break;
              }
            }
          }
          if (outEndpoint) break;
        }

        // Pass 2: Fall back to any OUT endpoint if no bulk OUT found
        if (!outEndpoint) {
          for (const iface of device.configuration.interfaces) {
            const alternates = iface.alternates || (iface.alternate ? [iface.alternate] : []);
            for (const alt of alternates) {
              if (Array.isArray(alt.endpoints)) {
                const anyOut = alt.endpoints.find(ep => ep.direction === 'out');
                if (anyOut) {
                  targetInterfaceNumber = iface.interfaceNumber;
                  outEndpoint = anyOut;
                  break;
                }
              }
            }
            if (outEndpoint) break;
          }
        }
      }

      // Default fallback if configuration interfaces array is non-standard
      if (targetInterfaceNumber === null) targetInterfaceNumber = 0;
      const endpointNumber = outEndpoint ? outEndpoint.endpointNumber : 1;

      await device.claimInterface(targetInterfaceNumber);

      // Store in designated printer slot
      const printer = this.printers[slotKey] || this.printers.printer1;
      printer.transport = 'USB';
      printer.device = device;
      printer.endpointNumber = endpointNumber;
      printer.interfaceNumber = targetInterfaceNumber;
      printer.status = 'CONNECTED';
      printer.name = device.productName || `USB Thermal Printer (EP ${endpointNumber})`;

      // Backward compatibility bindings
      this.activeUsbDevice = device;
      this.activeUsbEndpoint = endpointNumber;

      // Listen for USB device disconnect
      if (navigator.usb) {
        navigator.usb.addEventListener('disconnect', (event) => {
          if (event.device === device) {
            printer.status = 'DISCONNECTED';
            printer.device = null;
            if (this.activeUsbDevice === device) this.activeUsbDevice = null;
            console.warn(`[PrinterBridge] USB printer on slot ${slotKey} disconnected.`);
          }
        });
      }

      this.persistPrinterConfig();
      return successResult({
        name: printer.name,
        connected: true,
        transport: 'USB',
        slot: slotKey,
        endpointNumber,
        interfaceNumber: targetInterfaceNumber
      });
    } catch (err) {
      return errorResult('USB_CONNECT_FAILED', err.message);
    }
  },

  /**
   * Configure Network / Ethernet / Wi-Fi thermal printer slot.
   * @param {string} [printerSlot='printer1']
   * @param {string} host - Printer IP address or hostname
   * @param {number} [port=9100] - RAW ESC/POS port (default 9100)
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectNetworkPrinter(printerSlot = 'printer1', host, port = 9100) {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';

    if (!host || typeof host !== 'string' || host.trim().length === 0) {
      return errorResult('NETWORK_INVALID_HOST', 'Valid printer IP address or hostname is required.');
    }

    const cleanHost = host.trim();
    const cleanPort = Number(port) || 9100;

    const printer = this.printers[slotKey] || this.printers.printer1;
    printer.transport = 'NETWORK';
    printer.host = cleanHost;
    printer.port = cleanPort;
    printer.status = 'CONFIGURED';
    printer.name = `Network Printer (${cleanHost}:${cleanPort})`;

    this.persistPrinterConfig();

    return successResult({
      name: printer.name,
      connected: true,
      transport: 'NETWORK',
      slot: slotKey,
      host: cleanHost,
      port: cleanPort
    });
  },

  /**
   * Stream ESC/POS bytes to Network Thermal Printer via backend TCP proxy.
   * @param {string} host
   * @param {number} port
   * @param {Uint8Array|Array<number>} bytes
   * @returns {Promise<Object>}
   */
  async printToNetwork(host, port = 9100, bytes) {
    const dataArray = Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));

    const response = await fetch('/api/print/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        port: Number(port) || 9100,
        data: dataArray
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || `HTTP ${response.status}: Network print failed`);
    }

    return result;
  },

  /**
   * Connect to Bluetooth Classic SPP virtual COM port via Web Serial API.
   * @param {string} [printerSlot='printer1']
   * @param {number} [baudRate=9600]
   * @returns {Promise<ServiceResult<Object>>}
   */
  async connectSerialPrinter(printerSlot = 'printer1', baudRate = 9600) {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';

    if (typeof navigator === 'undefined' || !navigator.serial) {
      return errorResult('SERIAL_UNSUPPORTED', 'Web Serial API is not supported on this browser or platform.');
    }

    try {
      const port = await navigator.serial.requestPort();
      await port.open({
        baudRate: Number(baudRate) || 9600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        flowControl: 'none'
      });

      const printer = this.printers[slotKey] || this.printers.printer1;
      printer.transport = 'SERIAL';
      printer.serialPort = port;
      printer.baudRate = Number(baudRate) || 9600;
      printer.status = 'CONNECTED';
      printer.name = `Serial/Bluetooth Classic Printer (${printer.baudRate} baud)`;

      if (navigator.serial) {
        navigator.serial.addEventListener('disconnect', (event) => {
          if (event.port === port || event.target === port) {
            printer.status = 'DISCONNECTED';
            printer.serialPort = null;
            console.warn(`[PrinterBridge] Serial printer on slot ${slotKey} disconnected.`);
          }
        });
      }

      this.persistPrinterConfig();

      return successResult({
        name: printer.name,
        connected: true,
        transport: 'SERIAL',
        slot: slotKey,
        baudRate: printer.baudRate
      });
    } catch (err) {
      return errorResult('SERIAL_CONNECT_FAILED', err.message);
    }
  },

  /**
   * Stream ESC/POS bytes to Web Serial virtual COM port.
   * @param {SerialPort} serialPort
   * @param {Uint8Array} bytes
   * @returns {Promise<void>}
   */
  async printToSerial(serialPort, bytes) {
    if (!serialPort || !serialPort.writable) {
      throw new Error('Serial port is not connected or writable.');
    }
    const writer = serialPort.writable.getWriter();
    try {
      const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      await writer.write(data);
    } finally {
      writer.releaseLock();
    }
  },

  /**
   * Helper to write raw bytes to a specific printer slot.
   * @param {string} slotKey - 'printer1' | 'printer2'
   * @param {Uint8Array} bytes
   * @returns {Promise<boolean>}
   */
  async writeBytesToSlot(slotKey, bytes) {
    const slot = this.printers[slotKey];
    if (!slot) return false;

    if (slot.transport === 'BLUETOOTH' && slot.characteristic) {
      await writeBleEscPosChunks(slot.characteristic, bytes);
      return true;
    }

    if (slot.transport === 'USB' && slot.device) {
      const ep = slot.endpointNumber || 1;
      await slot.device.transferOut(ep, bytes);
      return true;
    }

    if (slot.transport === 'NETWORK' && slot.host) {
      await this.printToNetwork(slot.host, slot.port || 9100, bytes);
      return true;
    }

    if (slot.transport === 'SERIAL' && slot.serialPort) {
      await this.printToSerial(slot.serialPort, bytes);
      return true;
    }

    return false;
  },

  /**
   * Disconnects a specific printer slot.
   * @param {string} [printerSlot='printer1']
   */
  async disconnectPrinter(printerSlot = 'printer1') {
    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';
    const slot = this.printers[slotKey];
    if (slot && slot.device) {
      if (typeof slot.device.close === 'function') {
        try {
          await slot.device.close();
        } catch (_) {}
      }
      if (slot.device.gatt && typeof slot.device.gatt.disconnect === 'function') {
        try {
          slot.device.gatt.disconnect();
        } catch (_) {}
      }
    }
    if (slot && slot.serialPort) {
      try {
        await slot.serialPort.close();
      } catch (_) {}
    }

    // Clean active characteristic references if disconnecting slot held them
    if (this._activeCharacteristic === slot?.characteristic || slotKey === 'printer1') {
      this._activeCharacteristic = null;
    }
    if (this._activeBluetoothDevice === slot?.device || slotKey === 'printer1') {
      this._activeBluetoothDevice = null;
    }
    if (this._activeUsbDevice === slot?.device || slotKey === 'printer1') {
      this._activeUsbDevice = null;
      this._activeUsbEndpoint = null;
    }

    if (slot) {
      slot.status = 'DISCONNECTED';
      slot.device = null;
      slot.server = null;
      slot.characteristic = null;
      slot.serialPort = null;
      slot.endpointNumber = null;
      slot.interfaceNumber = null;
    }
    return successResult({ slot: slotKey, disconnected: true });
  },

  /**
   * Generates standard ESC/POS bytes for 58mm/80mm thermal printers.
   * Formats dynamically for 58mm (32 cols) and 80mm (48 cols).
   * @param {Object} data - Invoice or KOT ticket data
   * @param {string} [width='58mm'] - '58mm' (32 cols) or '80mm' (48 cols)
   * @param {Object} [options={}] - Options (e.g. { storeProfile, isKot: boolean })
   * @returns {Uint8Array}
   */
  generateEscPosCommands(data, width = '58mm', options = {}) {
    const encoder = new TextEncoder();
    const encodeClean = (str) => encoder.encode(sanitizeEscPosText(str));
    const parts = [];

    const is80mm = width === '80mm';
    const cols = is80mm ? 48 : 32;
    const dCols = Math.floor(cols / 2); // Double-width column boundary (16 for 58mm, 24 for 80mm)
    const divider = '-'.repeat(cols) + '\n';

    // 1. ESC @ (Initialize printer) - STRICT INVARIANT: bytes[0]===0x1B, bytes[1]===0x40
    parts.push(new Uint8Array([0x1B, 0x40]));

    // ESC a 1 (Center alignment)
    parts.push(new Uint8Array([0x1B, 0x61, 0x01]));

    const profile = options.storeProfile || {};
    const isKot = options.isKot || data.jobType === 'KOT' || Boolean(data.kot_id);

    if (isKot) {
      // ----------------- KOT FORMATTING -----------------
      // GS ! 0x11 (Double Size) + ESC E 1 (Bold On)
      parts.push(new Uint8Array([0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]));
      parts.push(encodeClean(`\nKITCHEN TICKET\n`));
      // Normal Size + Bold Off
      parts.push(new Uint8Array([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]));
      parts.push(encodeClean(divider));

      // Table (wrapped at dCols so double-width never wraps awkwardly)
      const tableStr = `TABLE: ${data.table || data.table_id || data.tableNo || 'T1'}`;
      parts.push(new Uint8Array([0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]));
      const tableLines = wrapText(tableStr, dCols);
      for (const tl of tableLines) {
        parts.push(encodeClean(`${tl}\n`));
      }
      parts.push(new Uint8Array([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]));

      const timeStr = data.date || (data.created_at ? new Date(data.created_at).toLocaleTimeString() : new Date().toLocaleTimeString());
      const staffStr = data.biller || data.server_staff_id || 'Staff';
      const metaLines = wrapText(`Time: ${timeStr} | Server: ${staffStr}`, cols);
      for (const ml of metaLines) {
        parts.push(encodeClean(`${ml}\n`));
      }
      parts.push(encodeClean(divider));

      // Left Align
      parts.push(new Uint8Array([0x1B, 0x61, 0x00]));
      const items = data.items || data.rawItems || [];
      for (const item of items) {
        const qty = item.quantity || item.qty || 1;
        const name = item.name || 'Item';
        // Double size item line wrapped at cols (32 for 58mm)
        parts.push(new Uint8Array([0x1D, 0x21, 0x11]));
        const itemLines = wrapText(`${qty}x ${name}`, cols, '  ');
        for (const il of itemLines) {
          parts.push(encodeClean(`${il}\n`));
        }
        parts.push(new Uint8Array([0x1D, 0x21, 0x00]));
        if (item.notes) {
          const noteLines = wrapText(`>> Note: ${item.notes}`, cols, '  ');
          for (const nl of noteLines) {
            parts.push(encodeClean(`${nl}\n`));
          }
        }
        parts.push(encodeClean(divider));
      }

      if (data.special_instructions) {
        const instLines = wrapText(`Note: ${data.special_instructions}`, cols, '  ');
        for (const il of instLines) {
          parts.push(encodeClean(`${il}\n`));
        }
        parts.push(encodeClean(divider));
      }

      // Center Align
      parts.push(new Uint8Array([0x1B, 0x61, 0x01]));
      parts.push(encodeClean(`*** END OF KOT ***\n\n\n\n\n`));
    } else {
      // ------------- CUSTOMER INVOICE FORMATTING -------------
      const storeName = profile.name || data.shop_name || 'BILLNAW POS';
      // Double Size + Bold
      parts.push(new Uint8Array([0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]));
      parts.push(encodeClean('\n'));
      const storeNameLines = wrapText(storeName, dCols);
      for (const snl of storeNameLines) {
        parts.push(encodeClean(`${snl}\n`));
      }
      // Normal Size + Bold Off
      parts.push(new Uint8Array([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]));

      if (profile.address) {
        const addrLines = wrapText(profile.address, cols);
        for (const al of addrLines) parts.push(encodeClean(`${al}\n`));
      }
      if (profile.phone) {
        const phoneLines = wrapText(`Tel: ${profile.phone}`, cols);
        for (const pl of phoneLines) parts.push(encodeClean(`${pl}\n`));
      }
      if (profile.fssai) {
        const fssaiLines = wrapText(`FSSAI Lic. No.: ${profile.fssai}`, cols);
        for (const fl of fssaiLines) parts.push(encodeClean(`${fl}\n`));
      }
      if (profile.gstin && profile.gstMode !== 'none') {
        const gstinLines = wrapText(`GSTIN: ${profile.gstin}`, cols);
        for (const gl of gstinLines) parts.push(encodeClean(`${gl}\n`));
      }

      parts.push(encodeClean(divider));

      const isGstActive = profile.gstMode !== 'none' && data.gstMode !== 'none';
      const invoiceTitle = isGstActive ? 'TAX INVOICE' : 'RETAIL INVOICE';
      parts.push(new Uint8Array([0x1B, 0x45, 0x01])); // Bold On
      parts.push(encodeClean(`${invoiceTitle}\n`));
      parts.push(new Uint8Array([0x1B, 0x45, 0x00])); // Bold Off
      parts.push(encodeClean(divider));

      // Left Align
      parts.push(new Uint8Array([0x1B, 0x61, 0x00]));
      const billId = data.bill_no || data.billNo || data.invoice_id || data.id || 'N/A';
      const billLines = wrapText(`Bill #${billId}`, cols);
      for (const bl of billLines) parts.push(encodeClean(`${bl}\n`));

      const dateStr = data.date || data.settled_at || data.created_at || new Date().toLocaleString();
      const dateLines = wrapText(dateStr, cols);
      for (const dl of dateLines) parts.push(encodeClean(`${dl}\n`));

      if (data.table && data.orderType !== 'Takeaway') {
        const tableLines = wrapText(`Table: ${String(data.table).replace('Table ', '')}`, cols);
        for (const tl of tableLines) parts.push(encodeClean(`${tl}\n`));
      }
      if (data.orderType) {
        const otLines = wrapText(`Type: ${data.orderType}`, cols);
        for (const ot of otLines) parts.push(encodeClean(`${ot}\n`));
      }
      if (data.paymentMode) {
        const pmLines = wrapText(`Payment: ${data.paymentMode}`, cols);
        for (const pm of pmLines) parts.push(encodeClean(`${pm}\n`));
      }
      if (data.customer) {
        const custLines = wrapText(`Customer: ${data.customer}`, cols);
        for (const cl of custLines) parts.push(encodeClean(`${cl}\n`));
      }
      if (data.biller) {
        const staffLines = wrapText(`Staff: ${data.biller}`, cols);
        for (const sl of staffLines) parts.push(encodeClean(`${sl}\n`));
      }

      parts.push(encodeClean(divider));

      // Header Table Row
      const nameWidth = is80mm ? 28 : 17;
      const qtyWidth = is80mm ? 4 : 3;
      const priceWidth = is80mm ? 12 : 10;
      const colSpace = is80mm ? '  ' : ' ';

      const headerRow = 'ITEM'.padEnd(nameWidth, ' ') + colSpace + 'QTY'.padStart(qtyWidth, ' ') + colSpace + 'AMOUNT'.padStart(priceWidth, ' ') + '\n';
      parts.push(encodeClean(headerRow));
      parts.push(encodeClean(divider));

      // Items
      const items = data.items || data.rawItems || [];
      for (const item of items) {
        const name = item.name || 'Item';
        const qty = item.quantity || item.qty || 1;
        const totalPaise = item.line_total_paise !== undefined
          ? item.line_total_paise
          : (item.item_subtotal_paise !== undefined 
              ? item.item_subtotal_paise 
              : ((item.price || 0) * qty * 100));
        const priceStr = "Rs. " + (totalPaise / 100).toFixed(2);

        const actualQtyWidth = Math.max(qtyWidth, String(qty).length);
        const actualPriceWidth = Math.max(priceWidth, priceStr.length);
        const neededRightWidth = colSpace.length + actualQtyWidth + colSpace.length + actualPriceWidth;

        if (neededRightWidth >= cols || cols - neededRightWidth < 4) {
          const nameLines = wrapText(name, cols);
          for (const nl of nameLines) {
            parts.push(encodeClean(`${nl}\n`));
          }
          const rightLine = String(qty).padStart(actualQtyWidth, ' ') + colSpace + priceStr.padStart(cols - actualQtyWidth - colSpace.length, ' ') + '\n';
          parts.push(encodeClean(rightLine));
        } else {
          const availNameWidth = cols - neededRightWidth;
          const firstChunk = name.slice(0, availNameWidth);
          const itemLine = firstChunk.padEnd(availNameWidth, ' ') + colSpace + String(qty).padStart(actualQtyWidth, ' ') + colSpace + priceStr.padStart(actualPriceWidth, ' ') + '\n';
          parts.push(encodeClean(itemLine));

          if (name.length > availNameWidth) {
            const remainder = name.slice(availNameWidth).trim();
            if (remainder.length > 0) {
              const overflowLines = wrapText(remainder, cols - 2);
              for (const ol of overflowLines) {
                parts.push(encodeClean(`  ${ol}\n`));
              }
            }
          }
        }
      }

      parts.push(encodeClean(divider));

      // Totals Section
      // Right Align
      parts.push(new Uint8Array([0x1B, 0x61, 0x02]));
      const totalPaise = data.final_payable_paise !== undefined 
        ? data.final_payable_paise 
        : (data.final_total_paise !== undefined 
            ? data.final_total_paise 
            : ((data.amount || 0) * 100));
      const totalRupees = (totalPaise / 100).toFixed(2);

      // Double Size + Bold (wrapped at dCols so it fits cleanly)
      parts.push(new Uint8Array([0x1D, 0x21, 0x11, 0x1B, 0x45, 0x01]));
      const totalLines = wrapText(`TOTAL: Rs. ${totalRupees}`, dCols);
      for (const tl of totalLines) {
        parts.push(encodeClean(`${tl}\n`));
      }
      parts.push(encodeClean('\n'));
      parts.push(new Uint8Array([0x1D, 0x21, 0x00, 0x1B, 0x45, 0x00]));

      // Center Align
      parts.push(new Uint8Array([0x1B, 0x61, 0x01]));
      parts.push(encodeClean(`Thank You! Visit Again\n\n\n\n\n`));
    }

    // Paper Cut: GS V 66 0 ([0x1D, 0x56, 0x42, 0x00]) - STRICT TEST INVARIANT
    parts.push(new Uint8Array([0x1D, 0x56, 0x42, 0x00]));

    // Combine into single Uint8Array
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
        job.attempts = (job.attempts || 0) + 1;
        const res = await this.printReceipt(job.invoice || job.data, job.options);
        if (res && res.error) {
          throw new Error(res.error.message || res.error.code || 'Print dispatch failed');
        }
        // Successful print - dequeue
        this.printQueue.shift();
      } catch (err) {
        console.warn(`[PrinterBridge] Print job ${job.id} attempt ${job.attempts} failed:`, err.message);
        if (job.attempts >= 3) {
          // Move failed job to local DLQ (dead letter queue) in storage
          this.archiveFailedJob(job, err.message);
          this.printQueue.shift();
        } else {
          // Wait before retrying and yield so caller/test can inspect state
          await new Promise(r => setTimeout(r, 100));
          break;
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
      } catch (_) {}
    }
  },

  /**
   * Dispatches ESC/POS payload to designated printer slot based on configured transport.
   * @param {string} [printerSlot='printer1']
   * @param {Uint8Array} bytes
   * @returns {Promise<ServiceResult<Object>>}
   */
  async dispatchToPrinterSlot(printerSlot = 'printer1', bytes) {
    if (printerSlot === 'SYSTEM_DIALOG') {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
      return successResult({ printed: true, method: 'BROWSER_DIALOG', slot: 'SYSTEM_DIALOG' });
    }

    const slotKey = (printerSlot === 'printer2') ? 'printer2' : 'printer1';
    const printer = this.printers[slotKey] || this.printers.printer1;

    try {
      // 0. Explicit System Dialog Transport
      if (printer.transport === 'SYSTEM_DIALOG') {
        if (typeof window !== 'undefined' && typeof window.print === 'function') {
          window.print();
          return successResult({ printed: true, method: 'BROWSER_DIALOG', slot: slotKey });
        }
      }

      // 1. Android Capacitor Native Bluetooth Bridge
      const platform = detectPlatform();
      if (platform === PLATFORMS.ANDROID_CAPACITOR) {
        if (typeof window !== 'undefined' && window.Capacitor?.Plugins?.BluetoothSerial) {
          try {
            await window.Capacitor.Plugins.BluetoothSerial.write({ data: Array.from(bytes) });
            return successResult({ printed: true, method: 'CAPACITOR_BLUETOOTH', slot: slotKey });
          } catch (e) {
            console.warn('[PrinterBridge] Native Android print failed:', e.message);
          }
        }
      }

      // 2. Desktop Tauri Silent Spooler Bridge
      if (platform === PLATFORMS.DESKTOP_TAURI) {
        if (typeof window !== 'undefined' && window.__TAURI__?.invoke) {
          try {
            await window.__TAURI__.invoke('print_raw_escpos', { bytes: Array.from(bytes) });
            return successResult({ printed: true, method: 'TAURI_SILENT', slot: slotKey });
          } catch (e) {
            console.warn('[PrinterBridge] Tauri raw print failed:', e.message);
          }
        }
      }

      // 3. WebUSB Transport
      if (printer.transport === 'USB' && printer.device) {
        const ep = printer.endpointNumber || this.activeUsbEndpoint || 1;
        const CHUNK_SIZE = 4096;
        if (bytes.length <= CHUNK_SIZE) {
          const result = await printer.device.transferOut(ep, bytes);
          if (result && result.status && result.status !== 'ok') {
            throw new Error(`USB transfer failed: ${result.status}`);
          }
        } else {
          for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
            const chunk = bytes.slice(i, i + CHUNK_SIZE);
            const result = await printer.device.transferOut(ep, chunk);
            if (result && result.status && result.status !== 'ok') {
              throw new Error(`USB transfer chunk failed: ${result.status}`);
            }
          }
        }
        return successResult({ printed: true, method: 'WEBUSB_ESC_POS', slot: slotKey });
      }

      // 4. Network / Ethernet / Wi-Fi TCP Proxy Transport
      if (printer.transport === 'NETWORK' && printer.host) {
        const netRes = await this.printToNetwork(printer.host, printer.port || 9100, bytes);
        return successResult({
          printed: true,
          method: 'NETWORK_TCP',
          slot: slotKey,
          bytesWritten: netRes.bytesWritten
        });
      }

      // 5. Web Serial (Bluetooth Classic SPP virtual COM port) Transport
      if (printer.transport === 'SERIAL' && printer.serialPort) {
        await this.printToSerial(printer.serialPort, bytes);
        return successResult({ printed: true, method: 'SERIAL_ESC_POS', slot: slotKey });
      }

      // 6. Web Bluetooth GATT Characteristic Transport (with paced chunking)
      // STRICT REQUIREMENT: Only use printer.characteristic for target slot, NEVER fall back to this.activeCharacteristic across slots!
      const targetChar = printer.characteristic;
      if (targetChar) {
        await writeBleEscPosChunks(targetChar, bytes);
        return successResult({ printed: true, method: 'BLUETOOTH_ESC_POS', slot: slotKey });
      }

      // 7. Legacy WebUSB fallback if activeUsbDevice is set and slot is printer1
      if (slotKey === 'printer1' && printer.transport === 'USB' && this.activeUsbDevice) {
        const ep = this.activeUsbEndpoint || 1;
        await this.activeUsbDevice.transferOut(ep, bytes);
        return successResult({ printed: true, method: 'WEBUSB_ESC_POS', slot: slotKey });
      }

      // 8. Browser Dialog Fallback
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
        return successResult({ printed: true, method: 'BROWSER_DIALOG', slot: slotKey });
      }

      return errorResult('PRINTER_UNAVAILABLE', `Printer slot '${slotKey}' has no active connection or fallback.`);
    } catch (hwErr) {
      console.warn(`[PrinterBridge] Hardware transmission to '${slotKey}' failed:`, hwErr.message);
      // Fall back to browser dialog if available
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
        return successResult({ printed: true, method: 'BROWSER_DIALOG', slot: slotKey, fallbackFrom: hwErr.message });
      }
      return errorResult('WRITE_FAILED', hwErr.message);
    }
  },

  /**
   * Prints an invoice receipt via active peripheral or falls back to system dialog.
   * @param {Object} invoice
   * @param {Object} [options={}]
   * @returns {Promise<ServiceResult<{ printed: boolean, method: string }>>}
   */
  async printReceipt(invoice, options = {}) {
    const slotKey = options.printerSlot || 'printer1';
    const slotWidth = options.width || this.printers[slotKey]?.paperWidth || '58mm';
    const bytes = this.generateEscPosCommands(invoice, slotWidth, options);

    return this.dispatchToPrinterSlot(slotKey, bytes);
  },

  /**
   * Prompts user interactively to select a destination printer slot.
   * Resolves to 'printer1', 'printer2', 'SYSTEM_DIALOG', or null (if cancelled).
   * @param {string} [role='RECEIPT'] - 'RECEIPT' | 'KOT'
   * @param {Object} [jobPayload={}]
   * @returns {Promise<string|null>}
   */
  async promptInteractiveSelection(role = 'RECEIPT', jobPayload = {}) {
    // 1. Support custom test / mock hook
    if (typeof this._mockPromptSelection === 'function') {
      return this._mockPromptSelection(role, jobPayload);
    }

    // 2. UI Hook in pos.js if available
    if (typeof window !== 'undefined' && typeof window.openPrinterSelectModal === 'function') {
      return new Promise((resolve) => {
        window.openPrinterSelectModal(role, (selectedSlot) => {
          resolve(selectedSlot || null);
        });
      });
    }

    // 3. Direct DOM fallback if modal is in document
    if (typeof document !== 'undefined') {
      const modal = document.getElementById('printerSelectModal');
      if (modal) {
        return new Promise((resolve) => {
          const roleLabel = document.getElementById('printerSelectRoleLabel');
          if (roleLabel) roleLabel.innerText = role === 'KOT' ? 'Kitchen KOT Ticket' : 'Customer Receipt';

          const cleanup = (slot) => {
            modal.style.display = 'none';
            resolve(slot || null);
          };

          const btnP1 = document.getElementById('btnSelectPrinter1');
          const btnP2 = document.getElementById('btnSelectPrinter2');
          const btnSys = document.getElementById('btnSelectSystemDialog');
          const btnCancel = document.getElementById('btnSelectPrinterCancel');

          if (btnP1) btnP1.onclick = () => cleanup('printer1');
          if (btnP2) btnP2.onclick = () => cleanup('printer2');
          if (btnSys) btnSys.onclick = () => cleanup('SYSTEM_DIALOG');
          if (btnCancel) btnCancel.onclick = () => cleanup(null);

          modal.style.display = 'flex';
        });
      }
    }

    // 4. Default fallback when non-interactive or headless environment
    return (role === 'KOT')
      ? (this.routing?.defaultKotPrinter || 'printer2')
      : (this.routing?.defaultReceiptPrinter || 'printer1');
  },

  /**
   * Routes a print job based on ticket role (RECEIPT vs KOT) and configured preferences.
   * Supports pre-assigned roles, prompt fallback, interactive dialog, and local execution.
   * @param {Object} jobPayload - Invoice or KOT ticket payload
   * @param {Object} [options={}] - Options (e.g. { role: 'RECEIPT'|'KOT', forcePrompt: boolean })
   * @returns {Promise<ServiceResult<Object>>}
   */
  async routePrintJob(jobPayload, options = {}) {
    if (!jobPayload) {
      return errorResult('INVALID_PAYLOAD', 'Print job payload is required');
    }

    // 1. Determine role: RECEIPT or KOT
    const role = options.role || (
      (jobPayload.jobType === 'KOT' || Boolean(jobPayload.kot_id) || Boolean(jobPayload.kotId) ||
       (jobPayload.items && !jobPayload.final_payable_paise && !jobPayload.final_total_paise && !jobPayload.billNo && !jobPayload.bill_no && !jobPayload.invoice_id && !jobPayload.amount))
        ? 'KOT'
        : 'RECEIPT'
    );

    // 2. Determine initial target slot from routing configuration
    const isSinglePrinter = Boolean(
      this.routing?.singlePrinterMode ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('billnaw_single_printer_mode') === 'true')
    );

    let targetSlot;
    if (isSinglePrinter) {
      targetSlot = 'printer1';
    } else {
      targetSlot = (role === 'RECEIPT')
        ? (this.routing?.defaultReceiptPrinter || 'printer1')
        : (this.routing?.defaultKotPrinter || 'printer2');

      // Auto-fallback: If KOT is assigned to printer2, but printer2 has no active connection
      // while printer1 IS connected (or active characteristic exists), fallback directly to printer1!
      if (role === 'KOT' && targetSlot === 'printer2') {
        const isPrinter2Connected = Boolean(
          this.printers?.printer2?.characteristic ||
          this.printers?.printer2?.device?.gatt?.connected ||
          (typeof window !== 'undefined' && window.posPrinters?.printer2?.characteristic)
        );
        const isPrinter1Connected = Boolean(
          this.printers?.printer1?.characteristic ||
          this.printers?.printer1?.device?.gatt?.connected ||
          this.activeCharacteristic ||
          (typeof window !== 'undefined' && (window.posPrinters?.printer1?.characteristic || window.printCharacteristic))
        );
        if (!isPrinter2Connected && isPrinter1Connected) {
          console.info('[PrinterBridge] Printer 2 disconnected. Direct KOT print fallback to connected Printer 1.');
          targetSlot = 'printer1';
        }
      }
    }

    // 3. Fallback to interactive selection if requested, target is PROMPT, or unassigned
    const shouldPrompt = Boolean(
      options.forcePrompt ||
      this.routing?.alwaysPrompt ||
      targetSlot === 'PROMPT' ||
      !targetSlot
    );

    if (shouldPrompt) {
      targetSlot = await this.promptInteractiveSelection(role, jobPayload);
      if (!targetSlot) {
        return successResult({ cancelled: true, role, printed: false });
      }
    }

    // 4. Handle explicit SYSTEM_DIALOG slot
    if (targetSlot === 'SYSTEM_DIALOG') {
      return this.dispatchToPrinterSlot('SYSTEM_DIALOG', new Uint8Array([]));
    }

    // 5. Generate ESC/POS commands with paper width configured for chosen slot
    const slotConfig = this.printers?.[targetSlot] || this.printers?.printer1;
    const width = options.width || slotConfig?.paperWidth || (role === 'KOT' ? '58mm' : '80mm');
    const bytes = this.generateEscPosCommands(jobPayload, width, {
      ...options,
      isKot: role === 'KOT'
    });

    // 6. Dispatch to chosen slot
    const result = await this.dispatchToPrinterSlot(targetSlot, bytes);
    if (result && result.data) {
      result.data.role = role;
      result.data.slot = targetSlot;
    }
    return result;
  },

  /**
   * Distributed Cloud Print Relay: Enqueues KOT job payload to Firestore /shops/{shopId}/print_queue.
   * Strictly enforces that ONLY KOT print jobs are queued; customer bills and receipts are forbidden.
   */
  async enqueueCloudKotPrintJob(jobPayload, options = {}) {
    return enqueueCloudKotPrintJob(jobPayload, options);
  },

  /**
   * Distributed Cloud Print Relay: Atomically claims a queued KOT job with 60s zombie lease recovery.
   */
  async claimPrintJob(db, shopId, jobId, workerDeviceId, options = {}) {
    return claimPrintJob(db, shopId, jobId, workerDeviceId, options);
  },

  /**
   * Distributed Cloud Print Relay: Completes print job or tracks failure retries up to 3 attempts.
   */
  async completePrintJob(db, shopId, jobId, success, error = null, options = {}) {
    return completePrintJob(db, shopId, jobId, success, error, options);
  },

  /**
   * Distributed Cloud Print Relay: Subscribes to pending queued KOT jobs for target shop.
   */
  listenPrintQueue(db, shopId, onJobCallback, options = {}) {
    return listenPrintQueue(db, shopId, onJobCallback, options);
  }
};

/**
 * Enqueues a Kitchen Order Ticket (KOT) to Firestore /shops/{shopId}/print_queue.
 * 
 * CRITICAL SECURITY & STATUTORY COMPLIANCE:
 * Strictly enforces that jobPayload.jobType === 'KOT'.
 * Customer bills, receipts, invoices, or settlements must NEVER be queued to Firestore for distance printing.
 * Throws a descriptive security error if any non-KOT or billing fields are passed.
 * 
 * @param {Object} jobPayload - KOT print payload
 * @param {Object} [options={}] - Options (e.g. { shopId, db, setDoc, deviceId })
 * @returns {Promise<{ success: boolean, jobId: string, job: Object }>}
 */
export async function enqueueCloudKotPrintJob(jobPayload, options = {}) {
  if (!jobPayload || jobPayload.jobType !== 'KOT') {
    throw new Error("[Security Violation] Customer bills and receipts must NEVER be queued to Firestore for distance printing. Local counter printing only.");
  }

  // Strict check for billing / financial fields
  const forbiddenBillingFields = [
    'billNo', 'bill_no', 'amount', 'invoice', 'invoice_id', 'invoiceNo', 'invoice_no',
    'final_payable_paise', 'final_total_paise', 'grandTotal', 'grand_total',
    'paymentMode', 'payment_mode', 'subtotal', 'grossSubtotal', 'totalTax',
    'tax', 'total', 'discount', 'discountAmount'
  ];
  for (const field of forbiddenBillingFields) {
    if (jobPayload[field] !== undefined && jobPayload[field] !== null) {
      throw new Error("[Security Violation] Customer bills and receipts must NEVER be queued to Firestore for distance printing. Local counter printing only.");
    }
  }

  const jobId = jobPayload.jobId || `kot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const shopId = options.shopId || jobPayload.shopId || (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_active_store_id') || localStorage.getItem('billnaw_store_code') || localStorage.getItem('storeId')) : null) || 'default_shop';
  const nowIso = new Date().toISOString();
  const queuedByDeviceId = options.deviceId || jobPayload.queuedByDeviceId || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_device_id') : null) || `dev_terminal_${Math.random().toString(36).substring(2, 8)}`;

  const jobDoc = {
    jobId,
    jobType: 'KOT',
    targetPrinterRole: 'kitchen',
    tableNo: String(jobPayload.tableNo || jobPayload.table || 'T1'),
    kotId: String(jobPayload.kotId || jobPayload.kot_id || `KOT-${Date.now()}`),
    items: Array.isArray(jobPayload.items) ? jobPayload.items : (Array.isArray(jobPayload.rawItems) ? jobPayload.rawItems : []),
    billerName: String(jobPayload.billerName || jobPayload.biller || 'Server'),
    billerRole: String(jobPayload.billerRole || 'Server'),
    status: 'queued',
    attempts: 0,
    queuedByDeviceId,
    leasedBy: null,
    leasedAt: null,
    printedAt: null,
    error: null,
    createdAt: jobPayload.createdAt || nowIso,
    updatedAt: nowIso
  };

  const db = options.db || (typeof window !== 'undefined' ? window.firestoreDB : null);

  if (typeof options.setDoc === 'function') {
    await options.setDoc(jobDoc);
  } else if (typeof window !== 'undefined' && window.firestoreSetDoc && window.firestoreDoc) {
    const docRef = window.firestoreDoc(db, 'shops', shopId, 'print_queue', jobId);
    await window.firestoreSetDoc(docRef, jobDoc);
  } else if (db && typeof db.collection === 'function') {
    await db.collection('shops').doc(shopId).collection('print_queue').doc(jobId).set(jobDoc);
  }

  return {
    success: true,
    jobId,
    job: jobDoc
  };
}

/**
 * Claims a pending KOT print job from Firestore /shops/{shopId}/print_queue/{jobId}
 * inside an atomic Firestore transaction with 60s zombie lease recovery.
 * 
 * @param {Object} db - Firestore instance
 * @param {string} shopId - Shop / tenant identifier
 * @param {string} jobId - Print job ID
 * @param {string} workerDeviceId - Worker / terminal device ID claiming the job
 * @param {Object} [options={}] - Optional transaction runner or mocks
 * @returns {Promise<Object>} Claimed job record
 */
export async function claimPrintJob(db, shopId, jobId, workerDeviceId, options = {}) {
  const targetDb = options.db || db || (typeof window !== 'undefined' ? (window.firestoreDB || window.firebaseDB) : null);

  const executeTxn = async (callback) => {
    // 1. Injected runner in options takes precedence
    if (typeof options.runTransaction === 'function') {
      if (options.runTransaction.length >= 2) {
        return await options.runTransaction(targetDb, callback);
      }
      return await options.runTransaction(callback);
    }

    // 2. Production browser runtime: Firebase Modular SDK via window.firestoreRunTransaction
    if (typeof window !== 'undefined' && typeof window.firestoreRunTransaction === 'function') {
      if (!targetDb) {
        throw new Error("Firestore instance (db) is required for window.firestoreRunTransaction");
      }
      return await window.firestoreRunTransaction(targetDb, callback);
    }

    // 3. Node.js Admin SDK, Firestore compat, or mock DB object instance method
    if (targetDb && typeof targetDb.runTransaction === 'function') {
      return await targetDb.runTransaction(callback);
    }

    throw new Error("runTransaction is required for atomic print job claiming");
  };

  return await executeTxn(async (txn) => {
    let jobRef = null;
    if (options.jobRef) {
      jobRef = options.jobRef;
    } else if (typeof window !== 'undefined' && typeof window.firestoreDoc === 'function') {
      jobRef = window.firestoreDoc(targetDb, 'shops', shopId, 'print_queue', jobId);
    } else if (targetDb && typeof targetDb.collection === 'function') {
      jobRef = targetDb.collection('shops').doc(shopId).collection('print_queue').doc(jobId);
    } else {
      jobRef = { id: jobId };
    }

    const snap = await txn.get(jobRef);
    const exists = typeof snap?.exists === 'function' ? snap.exists() : Boolean(snap?.exists);
    if (!snap || !exists) {
      throw new Error("Job not found");
    }

    const data = typeof snap.data === 'function' ? snap.data() : snap.data;
    const now = Date.now();
    const isLeaseExpired = data.status === 'processing' && data.leasedAt &&
      (now - new Date(data.leasedAt).getTime() > 60000);

    if (data.status !== 'queued' && !isLeaseExpired) {
      throw new Error("Job already claimed or printed");
    }

    const nowIso = new Date().toISOString();
    const updateData = {
      status: 'processing',
      leasedBy: workerDeviceId,
      leasedAt: nowIso,
      attempts: (data.attempts || 0) + 1,
      updatedAt: nowIso
    };

    txn.update(jobRef, updateData);
    return { id: jobId, ...data, ...updateData };
  });
}

/**
 * Completes or fails a print job in Firestore /shops/{shopId}/print_queue/{jobId}.
 * Automatically manages retry status (resets to 'queued' if attempts < 3; marks 'failed' if attempts >= 3).
 * 
 * @param {Object} db - Firestore instance
 * @param {string} shopId - Shop / tenant identifier
 * @param {string} jobId - Print job ID
 * @param {boolean} success - Whether physical printing succeeded
 * @param {Error|string} [error=null] - Error information if printing failed
 * @param {Object} [options={}] - Options (e.g. { attempts, updateDoc, getDoc, jobRef })
 * @returns {Promise<{ success: boolean, status: string, jobId: string, attempts?: number, error?: string }>}
 */
export async function completePrintJob(db, shopId, jobId, success, error = null, options = {}) {
  const targetDb = options.db || db || (typeof window !== 'undefined' ? (window.firestoreDB || window.firebaseDB) : null);
  let jobRef = null;
  if (options.jobRef) {
    jobRef = options.jobRef;
  } else if (typeof window !== 'undefined' && typeof window.firestoreDoc === 'function') {
    jobRef = window.firestoreDoc(targetDb, 'shops', shopId, 'print_queue', jobId);
  } else if (targetDb && typeof targetDb.collection === 'function') {
    jobRef = targetDb.collection('shops').doc(shopId).collection('print_queue').doc(jobId);
  }

  const nowIso = new Date().toISOString();

  if (success) {
    const updateData = {
      status: 'printed',
      printedAt: nowIso,
      updatedAt: nowIso,
      error: null
    };

    if (typeof options.updateDoc === 'function') {
      await options.updateDoc(jobRef, updateData);
    } else if (typeof window !== 'undefined' && window.firestoreUpdateDoc) {
      await window.firestoreUpdateDoc(jobRef, updateData);
    } else if (jobRef && typeof jobRef.update === 'function') {
      await jobRef.update(updateData);
    }

    return { success: true, status: 'printed', jobId };
  } else {
    let attempts = options.attempts;
    if (attempts === undefined) {
      try {
        let snap = null;
        if (typeof options.getDoc === 'function') {
          snap = await options.getDoc(jobRef);
        } else if (typeof window !== 'undefined' && window.firestoreGetDoc) {
          snap = await window.firestoreGetDoc(jobRef);
        } else if (jobRef && typeof jobRef.get === 'function') {
          snap = await jobRef.get();
        }
        if (snap) {
          const data = typeof snap.data === 'function' ? snap.data() : snap.data;
          attempts = data?.attempts || 1;
        }
      } catch (_) {
        attempts = 1;
      }
    }

    const errMsg = (error && error.message) ? error.message : (String(error) || 'Print attempt failed');
    const finalStatus = (attempts < 3) ? 'queued' : 'failed';
    const updateData = {
      status: finalStatus,
      error: errMsg,
      updatedAt: nowIso
    };

    if (typeof options.updateDoc === 'function') {
      await options.updateDoc(jobRef, updateData);
    } else if (typeof window !== 'undefined' && window.firestoreUpdateDoc) {
      await window.firestoreUpdateDoc(jobRef, updateData);
    } else if (jobRef && typeof jobRef.update === 'function') {
      await jobRef.update(updateData);
    }

    return { success: false, status: finalStatus, attempts, error: errMsg, jobId };
  }
}

/**
 * Subscribes to pending queued print jobs on /shops/{shopId}/print_queue.
 * 
 * @param {Object} db - Firestore instance
 * @param {string} shopId - Shop / tenant identifier
 * @param {Function} onJobCallback - Callback receiving array of queued jobs
 * @param {Object} [options={}] - Options (e.g. { onSnapshot })
 * @returns {Function} Unsubscribe function
 */
export function listenPrintQueue(db, shopId, onJobCallback, options = {}) {
  if (typeof options.onSnapshot === 'function') {
    return options.onSnapshot(onJobCallback);
  }

  const targetDb = options.db || db || (typeof window !== 'undefined' ? (window.firestoreDB || window.firebaseDB) : null);

  if (typeof window !== 'undefined' && window.firestoreOnSnapshot && window.firestoreQuery && window.firestoreCollection && window.firestoreWhere) {
    const q = window.firestoreQuery(
      window.firestoreCollection(targetDb, 'shops', shopId, 'print_queue'),
      window.firestoreWhere('status', '==', 'queued')
    );
    return window.firestoreOnSnapshot(q, (snapshot) => {
      const jobs = [];
      if (snapshot && typeof snapshot.forEach === 'function') {
        snapshot.forEach(docSnap => {
          jobs.push({ id: docSnap.id, ...(typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data) });
        });
      }
      onJobCallback(jobs);
    });
  } else if (targetDb && typeof targetDb.collection === 'function') {
    const ref = targetDb.collection('shops').doc(shopId).collection('print_queue').where('status', '==', 'queued');
    return ref.onSnapshot((snapshot) => {
      const jobs = [];
      if (snapshot && typeof snapshot.forEach === 'function') {
        snapshot.forEach(docSnap => {
          jobs.push({ id: docSnap.id, ...(typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data) });
        });
      }
      onJobCallback(jobs);
    });
  }

  return () => {};
}

// Auto-initialize bridge and expose to window in browser runtime
if (typeof window !== 'undefined') {
  window.ThermalPrinterBridge = ThermalPrinterBridge;
  window.sanitizeEscPosText = sanitizeEscPosText;
  window.enqueueCloudKotPrintJob = enqueueCloudKotPrintJob;
  window.claimPrintJob = claimPrintJob;
  window.completePrintJob = completePrintJob;
  window.listenPrintQueue = listenPrintQueue;
  ThermalPrinterBridge.init();
}
