/**
 * src/shared/components/pin-pad-modal.js
 * Tactile 4-Digit PIN Pad Dialog for Fast Cashier Switching & Manager Override.
 * Integrates directly with RBAC salted SHA-256 validation.
 */

import { verifyStaffPin } from '../../core/rbac.js';

let pinModalEl = null;
let currentResolve = null;
let currentReject = null;
let enteredPin = '';
let currentRoleRequired = null;

function ensurePinModalDOM() {
  if (typeof document === 'undefined') return null;
  if (!pinModalEl || !document.body.contains(pinModalEl)) {
    pinModalEl = document.getElementById('appPinPadModal');
    if (!pinModalEl) {
      pinModalEl = document.createElement('div');
      pinModalEl.id = 'appPinPadModal';
      pinModalEl.className = 'modal pinpad-dialog-backdrop';
      pinModalEl.style.display = 'none';
      pinModalEl.innerHTML = `
        <div class="pinpad-dialog-card" role="dialog" aria-modal="true" aria-labelledby="pinpadTitle">
          <div class="pinpad-header">
            <h3 id="pinpadTitle" class="pinpad-title">Staff Authorization</h3>
            <button type="button" class="pinpad-close-btn" aria-label="Cancel Authorization">&times;</button>
          </div>
          <p id="pinpadPrompt" class="pinpad-prompt">Enter your 4-digit staff PIN to continue</p>
          
          <div class="pinpad-dots" aria-live="polite">
            <span class="pin-dot" id="pdot-0"></span>
            <span class="pin-dot" id="pdot-1"></span>
            <span class="pin-dot" id="pdot-2"></span>
            <span class="pin-dot" id="pdot-3"></span>
          </div>

          <div id="pinpadError" class="pinpad-error-msg" style="display:none;"></div>

          <div class="pinpad-keypad">
            <button type="button" class="pin-key" data-digit="1">1</button>
            <button type="button" class="pin-key" data-digit="2">2</button>
            <button type="button" class="pin-key" data-digit="3">3</button>
            <button type="button" class="pin-key" data-digit="4">4</button>
            <button type="button" class="pin-key" data-digit="5">5</button>
            <button type="button" class="pin-key" data-digit="6">6</button>
            <button type="button" class="pin-key" data-digit="7">7</button>
            <button type="button" class="pin-key" data-digit="8">8</button>
            <button type="button" class="pin-key" data-digit="9">9</button>
            <button type="button" class="pin-key pin-key-util" data-action="clear">C</button>
            <button type="button" class="pin-key" data-digit="0">0</button>
            <button type="button" class="pin-key pin-key-util" data-action="backspace">&#9003;</button>
          </div>
        </div>
      `;
      document.body.appendChild(pinModalEl);
      bindPinPadEvents();
    }
  }
  return pinModalEl;
}

function updateDots() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById(`pdot-${i}`);
    if (dot) {
      if (i < enteredPin.length) {
        dot.classList.add('pin-dot-filled');
      } else {
        dot.classList.remove('pin-dot-filled');
      }
    }
  }
}

function clearError() {
  const err = document.getElementById('pinpadError');
  if (err) {
    err.style.display = 'none';
    err.textContent = '';
  }
}

function showError(msg) {
  const err = document.getElementById('pinpadError');
  if (err) {
    err.textContent = msg;
    err.style.display = 'block';
  }
  // Shake animation
  const card = pinModalEl?.querySelector('.pinpad-dialog-card');
  if (card) {
    card.classList.add('shake-anim');
    setTimeout(() => card.classList.remove('shake-anim'), 400);
  }
}

async function handleDigitInput(digit) {
  if (enteredPin.length >= 4) return;
  enteredPin += digit;
  updateDots();
  clearError();

  if (enteredPin.length === 4) {
    // Attempt verification
    await verifyCompletedPin(enteredPin);
  }
}

async function verifyCompletedPin(pin) {
  if (!currentResolve) return;

  const staffList = getRegisteredStaffList();
  let matchedStaff = null;

  for (const staff of staffList) {
    const isMatch = await verifyStaffPin(staff, pin);
    if (isMatch) {
      matchedStaff = staff;
      break;
    }
  }

  if (!matchedStaff) {
    showError('Invalid PIN. Please try again.');
    enteredPin = '';
    setTimeout(updateDots, 300);
    return;
  }

  // Check role requirement if requested
  if (currentRoleRequired) {
    const allowed = isRoleAuthorized(matchedStaff.role, currentRoleRequired);
    if (!allowed) {
      showError(`${currentRoleRequired} privileges required.`);
      enteredPin = '';
      setTimeout(updateDots, 300);
      return;
    }
  }

  // Success
  closePinPad(true, matchedStaff);
}

function isRoleAuthorized(staffRole, requiredRole) {
  const hierarchy = { 'ADMIN': 4, 'MANAGER': 3, 'CASHIER': 2, 'WAITER': 1 };
  const userRank = hierarchy[staffRole?.toUpperCase()] || 0;
  const reqRank = hierarchy[requiredRole?.toUpperCase()] || 0;
  return userRank >= reqRank;
}

function getRegisteredStaffList() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('pos_staff_members');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function closePinPad(success, staff = null) {
  if (pinModalEl) {
    pinModalEl.style.display = 'none';
    pinModalEl.classList.remove('active');
  }
  enteredPin = '';
  updateDots();
  clearError();

  if (currentResolve) {
    if (success) {
      currentResolve({ authorized: true, staff });
    } else {
      currentResolve({ authorized: false, staff: null });
    }
    currentResolve = null;
  }
}

function bindPinPadEvents() {
  if (!pinModalEl) return;

  // Digits and action clicks
  pinModalEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.classList.contains('pinpad-close-btn')) {
      closePinPad(false);
      return;
    }

    const digit = btn.dataset.digit;
    if (digit !== undefined) {
      handleDigitInput(digit);
      return;
    }

    const action = btn.dataset.action;
    if (action === 'clear') {
      enteredPin = '';
      updateDots();
      clearError();
    } else if (action === 'backspace') {
      enteredPin = enteredPin.slice(0, -1);
      updateDots();
      clearError();
    }
  });
}

/**
 * Prompt for Staff 4-digit PIN authorization.
 * @param {Object} options
 * @param {string} [options.title='Staff Authorization']
 * @param {string} [options.prompt='Enter your 4-digit staff PIN']
 * @param {'ADMIN'|'MANAGER'|'CASHIER'|'WAITER'} [options.requiredRole]
 * @returns {Promise<{ authorized: boolean, staff: Object|null }>}
 */
export function requestPinAuthorization(options = {}) {
  return new Promise((resolve) => {
    currentResolve = resolve;
    currentRoleRequired = options.requiredRole || null;
    enteredPin = '';

    const el = ensurePinModalDOM();
    if (!el) {
      resolve({ authorized: false, staff: null });
      return;
    }

    const titleEl = document.getElementById('pinpadTitle');
    if (titleEl && options.title) titleEl.textContent = options.title;

    const promptEl = document.getElementById('pinpadPrompt');
    if (promptEl && options.prompt) promptEl.textContent = options.prompt;

    updateDots();
    clearError();

    el.style.display = 'flex';
    el.classList.add('active');
  });
}
