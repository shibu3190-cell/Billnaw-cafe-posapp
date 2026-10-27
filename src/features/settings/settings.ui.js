/**
 * src/features/settings/settings.ui.js
 * Feature UI Controller for Store Profile, Hardware Peripherals & Billing Defaults.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> settings.service.js.
 */

import { getCafeSettings, saveCafeSettings } from './settings.service.js';
import { showToast } from '../../shared/components/toast.js';

export class SettingsUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('settingsFormContainer');
    this.currentSettings = null;
  }

  async loadSettings() {
    const res = await getCafeSettings();
    if (res.data) {
      this.currentSettings = res.data;
      this.render();
    }
  }

  async handleSave(formData) {
    const res = await saveCafeSettings(formData);
    if (res.error) {
      showToast(`Save failed: ${res.error.message || res.error}`, 'error');
      return false;
    }
    showToast('Store profile & printer settings saved successfully!', 'success');
    this.currentSettings = res.data;
    return true;
  }

  render() {
    if (!this.container || !this.currentSettings) return;
    const s = this.currentSettings;

    this.container.innerHTML = `
      <form class="settings-form" id="appSettingsForm">
        <div class="settings-field">
          <label for="cfgCafeName">Cafe Name</label>
          <input type="text" id="cfgCafeName" value="${s.name || ''}" required />
        </div>
        <div class="settings-field">
          <label for="cfgGstin">GSTIN Number</label>
          <input type="text" id="cfgGstin" value="${s.gstin || ''}" placeholder="29ABCDE1234F1Z5" />
        </div>
        <div class="settings-field">
          <label for="cfgFssai">FSSAI License</label>
          <input type="text" id="cfgFssai" value="${s.fssai || ''}" placeholder="14-digit FSSAI" />
        </div>
        <div class="settings-field">
          <label for="cfgPrinterType">Receipt Printer Type</label>
          <select id="cfgPrinterType">
            <option value="SYSTEM_DIALOG" ${s.printer_type === 'SYSTEM_DIALOG' ? 'selected' : ''}>System Dialog (Browser)</option>
            <option value="BLUETOOTH" ${s.printer_type === 'BLUETOOTH' ? 'selected' : ''}>Bluetooth ESC/POS Thermal</option>
            <option value="USB" ${s.printer_type === 'USB' ? 'selected' : ''}>USB OTG Thermal</option>
          </select>
        </div>
        <button type="submit" class="btn-primary">Save Settings</button>
      </form>
    `;

    this.container.querySelector('#appSettingsForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const updated = {
        name: this.container.querySelector('#cfgCafeName').value,
        gstin: this.container.querySelector('#cfgGstin').value,
        fssai: this.container.querySelector('#cfgFssai').value,
        printer_type: this.container.querySelector('#cfgPrinterType').value
      };
      this.handleSave(updated);
    });
  }
}
