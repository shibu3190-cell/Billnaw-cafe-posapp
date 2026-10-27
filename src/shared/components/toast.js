/**
 * src/shared/components/toast.js
 * Ephemeral Toast Notification Engine for Billnaw Cafe POS.
 * Provides accessible, animated feedback for success, warning, error, and informational events.
 */

let toastContainer = null;

function ensureToastContainer() {
  if (typeof document === 'undefined') return null;
  if (!toastContainer || !document.body.contains(toastContainer)) {
    toastContainer = document.getElementById('appToastContainer');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'appToastContainer';
      toastContainer.setAttribute('role', 'region');
      toastContainer.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

const ICONS = {
  success: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
  error: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
  warning: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
  info: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
};

/**
 * Surface an ephemeral toast alert.
 * @param {string} message 
 * @param {'success'|'error'|'warning'|'info'} [type='info'] 
 * @param {number} [duration=3200] 
 * @returns {() => void} Dismiss handle
 */
export function showToast(message, type = 'info', duration = 3200) {
  if (typeof document === 'undefined') {
    console.log(`[Toast ${type.toUpperCase()}] ${message}`);
    return () => {};
  }

  const container = ensureToastContainer();
  if (!container) return () => {};

  const toast = document.createElement('div');
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute('role', 'alert');

  const iconSvg = ICONS[type] || ICONS.info;
  toast.innerHTML = `
    <span class="app-toast-icon" aria-hidden="true">${iconSvg}</span>
    <span class="app-toast-message">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Trigger smooth entrance
  requestAnimationFrame(() => {
    toast.classList.add('toast-show');
  });

  let timeoutId = null;

  const dismiss = () => {
    if (timeoutId) clearTimeout(timeoutId);
    toast.classList.remove('toast-show');
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 280);
  };

  timeoutId = setTimeout(dismiss, duration);
  toast.addEventListener('click', dismiss);

  return dismiss;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return String(str || '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
