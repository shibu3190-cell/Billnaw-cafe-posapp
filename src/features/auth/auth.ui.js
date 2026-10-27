/**
 * src/features/auth/auth.ui.js
 * Feature UI Controller for Two-Tier Authentication:
 * Tier 1: Shop Terminal Binding via 6-digit Email OTP.
 * Tier 2: Cashier Switching & Manager Override via 4-digit PIN Pad.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> auth.service.js.
 */

import { requestShopEmailOtp, verifyShopEmailOtp, authenticateStaffWithPin, logoutShopTerminal } from './auth.service.js';
import { requestPinAuthorization } from '../../shared/components/pin-pad-modal.js';
import { showToast } from '../../shared/components/toast.js';

export class AuthUI {
  constructor() {
    this.currentStaff = null;
  }

  async handleRequestOtp(email) {
    const res = await requestShopEmailOtp(email);
    if (res.error) {
      showToast(res.error.message || 'Failed to dispatch OTP', 'error');
      return false;
    }
    showToast(`OTP sent to ${email}. Check your inbox.`, 'success');
    return true;
  }

  async handleVerifyOtp(email, otp) {
    const res = await verifyShopEmailOtp(email, otp);
    if (res.error) {
      showToast(res.error.message || 'Invalid OTP', 'error');
      return false;
    }
    showToast('Device bound successfully to shop account!', 'success');
    return true;
  }

  async promptStaffPin(options = {}) {
    const result = await requestPinAuthorization({
      title: options.title || 'Staff Sign-In',
      prompt: options.prompt || 'Enter your 4-digit PIN to unlock terminal',
      requiredRole: options.requiredRole
    });

    if (result.authorized && result.staff) {
      this.currentStaff = result.staff;
      showToast(`Welcome, ${result.staff.name} (${result.staff.role})`, 'success');
      return result.staff;
    }

    return null;
  }

  handleTerminalLogout() {
    logoutShopTerminal();
  }
}
