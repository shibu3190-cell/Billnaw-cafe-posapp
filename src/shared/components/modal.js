/**
 * src/shared/components/modal.js
 * Universal Modal Dialog Manager for Billnaw Cafe POS.
 * Preserves the 26 SVG .modal-close-btn system invariant, keyboard accessibility (Escape),
 * focus trapping, and backdrop dismissal.
 */

let activeModalsStack = [];
let keydownBound = false;

function handleKeyDown(e) {
  if (e.key === 'Escape' && activeModalsStack.length > 0) {
    const topModalId = activeModalsStack[activeModalsStack.length - 1];
    closeModal(topModalId);
  }
}

/**
 * Open a modal by ID with backdrop animation and focus management.
 * @param {string} modalId 
 */
export function openModal(modalId) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById(modalId);
  if (!modal) {
    console.warn(`[Modal] Element #${modalId} not found`);
    return;
  }

  modal.classList.add('active');
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');

  if (!activeModalsStack.includes(modalId)) {
    activeModalsStack.push(modalId);
  }

  if (!keydownBound) {
    document.addEventListener('keydown', handleKeyDown);
    keydownBound = true;
  }

  // Focus first actionable input or close button
  setTimeout(() => {
    const focusable = modal.querySelector('input:not([disabled]), button:not([disabled]), [tabindex="0"]');
    if (focusable) focusable.focus();
  }, 50);
}

/**
 * Close a modal by ID.
 * @param {string} modalId 
 */
export function closeModal(modalId) {
  if (typeof document === 'undefined') return;
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.remove('active');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');

  activeModalsStack = activeModalsStack.filter(id => id !== modalId);

  if (activeModalsStack.length === 0 && keydownBound) {
    document.removeEventListener('keydown', handleKeyDown);
    keydownBound = false;
  }
}

/**
 * Close all currently open modals.
 */
export function closeAllModals() {
  if (typeof document === 'undefined') return;
  [...activeModalsStack].forEach(id => closeModal(id));
  activeModalsStack = [];
}

/**
 * Attach global event listeners for backdrop dismissal and close buttons.
 */
export function initModalListeners() {
  if (typeof document === 'undefined') return;

  // Backdrop click listener
  document.addEventListener('click', (e) => {
    // Backdrop dismissal: if user clicked directly on the modal backdrop container
    if (e.target && e.target.classList && (e.target.classList.contains('modal') || e.target.classList.contains('app-modal'))) {
      if (e.target.id && !e.target.dataset.noBackdropClose) {
        closeModal(e.target.id);
      }
    }

    // Modal close button click listener
    const closeBtn = e.target.closest('.modal-close-btn, [data-modal-close]');
    if (closeBtn) {
      const modal = closeBtn.closest('.modal, .app-modal');
      if (modal && modal.id) {
        closeModal(modal.id);
      }
    }
  });
}
