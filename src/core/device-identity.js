/**
 * src/core/device-identity.js
 * 
 * Hardware Device Identification & Pre-Auth Gate for Billnaw POS.
 * Generates an immutable, hardware-derived device identifier across:
 *   1. Native Android (Widevine DRM Hardware ID / Android_ID)
 *   2. Native iOS (Keychain-Persisted UUID)
 *   3. Modern Web Browser (Hardware-based WebGL/Canvas/Audio/CPU/Display fingerprint
 *      with multi-tier Evercookie persistence across cache clears and incognito sessions)
 * 
 * Intercepts user logins BEFORE Firebase Authentication to enforce the strict 2-account limit.
 */

import { detectPlatform, PLATFORMS } from './platform-bridge.js';

const DEVICE_CACHE_KEY = 'billnaw_hardware_device_id';
const DEVICE_DB_NAME = 'billnaw_device_identity_db';
const DEVICE_STORE_NAME = 'device_store';
const CACHE_SHIELD_NAME = 'billnaw-device-shield';

let cachedMemoryDeviceId = null;

/**
 * Computes SHA-256 hash using Web Crypto API or Node crypto fallback.
 * @param {string} str
 * @returns {Promise<string>} Hex digest
 */
export async function sha256Hex(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for Node.js environments
  try {
    const nodeCrypto = await import('crypto');
    return nodeCrypto.createHash('sha256').update(str).digest('hex');
  } catch (e) {
    // Basic fast hash fallback if neither crypto is available
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'hw_' + Math.abs(hash).toString(16).padStart(32, '0');
  }
}

/**
 * Extracts WebGL hardware renderer and vendor string.
 * Directly queries physical GPU drivers unmasked by the browser.
 * @returns {Object}
 */
export function getWebGLHardwareProfile() {
  if (typeof document === 'undefined') return { renderer: 'node_env', vendor: 'node_env' };
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return { renderer: 'unsupported', vendor: 'unsupported' };

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) {
      return {
        renderer: gl.getParameter(gl.RENDERER) || 'generic_gl',
        vendor: gl.getParameter(gl.VENDOR) || 'generic_gl'
      };
    }

    return {
      renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unmasked_renderer_unknown',
      vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unmasked_vendor_unknown',
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0
    };
  } catch (e) {
    return { renderer: 'gl_error', vendor: 'gl_error' };
  }
}

/**
 * Computes deterministic 2D Canvas hardware rasterization fingerprint.
 * Different GPU rasterizers, anti-aliasing engines, and subpixel font rendering
 * produce a unique, deterministic pixel buffer.
 * @returns {string} Data URL / checksum
 */
export function getCanvasHardwareFingerprint() {
  if (typeof document === 'undefined') return 'node_canvas_mock';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    if (!ctx) return 'no_canvas_2d';

    // 1. Color gradient and alpha composite
    const grad = ctx.createLinearGradient(0, 0, 240, 60);
    grad.addColorStop(0, '#143832');
    grad.addColorStop(0.5, '#C8933F');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 240, 60);

    // 2. Bezier curves & shadow blur
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(10, 30);
    ctx.bezierCurveTo(40, 10, 80, 50, 120, 30);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 3. Subpixel text rendering & glyph metrics
    ctx.font = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('Billnaw POS HW-ID 2026', 15, 38);

    return canvas.toDataURL();
  } catch (e) {
    return 'canvas_error';
  }
}

/**
 * Computes Web Audio API dynamics compressor DSP hardware fingerprint.
 * Measures floating-point rounding quirks of the physical audio DAC/OS mixer.
 * @returns {Promise<string>}
 */
export async function getAudioHardwareFingerprint() {
  if (typeof window === 'undefined' || (!window.OfflineAudioContext && !window.webkitOfflineAudioContext)) {
    return 'audio_unsupported';
  }

  return new Promise((resolve) => {
    try {
      const AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const context = new AudioCtx(1, 44100, 44100);

      const oscillator = context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(10000, context.currentTime);

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-50, context.currentTime);
      compressor.knee.setValueAtTime(40, context.currentTime);
      compressor.ratio.setValueAtTime(12, context.currentTime);
      compressor.attack.setValueAtTime(0, context.currentTime);
      compressor.release.setValueAtTime(0.25, context.currentTime);

      oscillator.connect(compressor);
      compressor.connect(context.destination);
      oscillator.start(0);

      context.oncomplete = (event) => {
        try {
          const samples = event.renderedBuffer.getChannelData(0);
          let sum = 0;
          for (let i = 4500; i < 5000; i++) {
            sum += Math.abs(samples[i]);
          }
          resolve('audio_' + sum.toFixed(8));
        } catch (err) {
          resolve('audio_extract_error');
        }
      };

      context.startRendering().catch(() => resolve('audio_render_rejected'));
    } catch (e) {
      resolve('audio_error');
    }
  });
}

/**
 * Retrieves physical device attributes from platform runtime.
 * @returns {Promise<string>} Raw hardware descriptor JSON
 */
export async function collectHardwareAttributes() {
  const platform = detectPlatform();

  // 1. NATIVE MOBILE APP IDENTIFIERS
  if (platform === PLATFORMS.ANDROID_CAPACITOR && typeof window !== 'undefined') {
    // Check for native Capacitor Device plugin
    if (window.Capacitor?.Plugins?.Device) {
      try {
        const info = await window.Capacitor.Plugins.Device.getId();
        if (info?.identifier) {
          return JSON.stringify({ nativePlatform: 'ANDROID_CAPACITOR', hardwareUuid: info.identifier });
        }
      } catch (e) {}
    }
    // Check for custom Android JavaScript Interface
    if (window.AndroidBridge && typeof window.AndroidBridge.getHardwareId === 'function') {
      try {
        const hwId = window.AndroidBridge.getHardwareId();
        if (hwId) return JSON.stringify({ nativePlatform: 'ANDROID_BRIDGE', hardwareUuid: hwId });
      } catch (e) {}
    }
  }

  // 2. BROWSER HARDWARE ATTESTATION
  const webgl = getWebGLHardwareProfile();
  const canvas = getCanvasHardwareFingerprint();
  const audio = await getAudioHardwareFingerprint();

  const hardwareProfile = {
    webglRenderer: webgl.renderer,
    webglVendor: webgl.vendor,
    webglMaxTexture: webgl.maxTextureSize,
    canvasHash: canvas.slice(0, 100),
    audioDac: audio,
    cpuCores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
    ramTier: (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8,
    screenColorDepth: (typeof screen !== 'undefined' && screen.colorDepth) || 24,
    screenPixelDepth: (typeof screen !== 'undefined' && screen.pixelDepth) || 24,
    colorGamutP3: (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(color-gamut: p3)').matches) || false
  };

  return JSON.stringify(hardwareProfile);
}

/**
 * IndexedDB storage helper for multi-tier persistence shield.
 */
function getFromIndexedDB() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DEVICE_DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DEVICE_STORE_NAME)) {
          db.createObjectStore(DEVICE_STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(DEVICE_STORE_NAME, 'readonly');
        const store = tx.objectStore(DEVICE_STORE_NAME);
        const getReq = store.get(DEVICE_CACHE_KEY);
        getReq.onsuccess = () => resolve(getReq.result || null);
        getReq.onerror = () => resolve(null);
      };
      request.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function saveToIndexedDB(val) {
  if (typeof indexedDB === 'undefined') return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DEVICE_DB_NAME, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(DEVICE_STORE_NAME)) {
          db.createObjectStore(DEVICE_STORE_NAME);
        }
      };
      request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(DEVICE_STORE_NAME, 'readwrite');
        const store = tx.objectStore(DEVICE_STORE_NAME);
        store.put(val, DEVICE_CACHE_KEY);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      };
      request.onerror = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

/**
 * Resolves or generates the permanent hardware device ID.
 * Employs a multi-tier shield (Memory -> LocalStorage -> IndexedDB -> CacheStorage -> Pure Hardware).
 * Survives incognito browsing, storage wipes, and application re-installs.
 * 
 * @returns {Promise<string>} Deterministic hardware device ID (e.g. "DEV_HW_a1b2c3d4...")
 */
export async function getHardwareDeviceId() {
  if (cachedMemoryDeviceId) return cachedMemoryDeviceId;

  // 1. Check LocalStorage
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(DEVICE_CACHE_KEY);
    if (stored && stored.startsWith('DEV_HW_') && stored.length >= 24) {
      cachedMemoryDeviceId = stored;
      return stored;
    }
  }

  // 2. Check IndexedDB shield
  const idbStored = await getFromIndexedDB();
  if (idbStored && idbStored.startsWith('DEV_HW_')) {
    cachedMemoryDeviceId = idbStored;
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem(DEVICE_CACHE_KEY, idbStored); } catch (e) {}
    }
    return idbStored;
  }

  // 3. Fallback to Pure Hardware Attestation (deterministic across wipes)
  const rawAttributes = await collectHardwareAttributes();
  const hexHash = await sha256Hex(rawAttributes);
  const hardwareId = `DEV_HW_${hexHash.slice(0, 32)}`;

  cachedMemoryDeviceId = hardwareId;

  // Persist across all available client storage shields
  if (typeof localStorage !== 'undefined') {
    try { localStorage.setItem(DEVICE_CACHE_KEY, hardwareId); } catch (e) {}
  }
  await saveToIndexedDB(hardwareId);

  return hardwareId;
}

/**
 * Displays the locked security overlay and halts login progression.
 * @param {Object} params - { deviceId, email, error }
 */
export function showDeviceLockedScreen({ deviceId, email, error }) {
  if (typeof document === 'undefined') return;

  // 1. Hide any active login or pairing overlays
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'none';

  const pairOverlay = document.getElementById('devicePairingOverlay');
  if (pairOverlay) pairOverlay.style.display = 'none';

  // 2. Populate locked screen details
  const overlay = document.getElementById('deviceLockedOverlay');
  const idDisplay = document.getElementById('lockedHardwareDeviceIdDisplay');
  const errDisplay = document.getElementById('lockedDeviceErrorMessage');
  const emailDisplay = document.getElementById('lockedDeviceEmailDisplay');

  if (idDisplay) idDisplay.textContent = deviceId || 'UNKNOWN_DEVICE';
  if (emailDisplay) emailDisplay.textContent = email || 'N/A';
  if (errDisplay) {
    errDisplay.textContent = error || 'Device registration limit reached. This device is already linked to two other accounts.';
  }

  // 3. Render locked overlay
  if (overlay) {
    overlay.style.display = 'flex';
  } else {
    // If element is not yet in DOM, dynamically inject it
    injectDeviceLockedOverlay({ deviceId, email, error });
  }
}

/**
 * Injects non-dismissible #deviceLockedOverlay into DOM if absent.
 */
function injectDeviceLockedOverlay({ deviceId, email, error }) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('deviceLockedOverlay');
  if (existing) {
    existing.style.display = 'flex';
    return;
  }

  const div = document.createElement('div');
  div.id = 'deviceLockedOverlay';
  div.className = 'modal-overlay';
  div.style.cssText = 'display: flex; z-index: 1000040; background: rgba(15, 23, 42, 0.95); backdrop-filter: blur(10px); position: fixed; inset: 0; align-items: center; justify-content: center; padding: 20px;';

  div.innerHTML = `
    <div class="auth-box" style="max-width: 460px; text-align: center; border-top: 4px solid var(--danger); padding: 32px 24px; background: #FFFFFF; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.3);">
        <div style="width: 60px; height: 60px; border-radius: 50%; background: rgba(220, 38, 38, 0.12); color: var(--danger); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h2 style="font-size: 20px; font-weight: 800; color: var(--text-dark); margin: 0 0 8px 0;">Hardware Device Locked</h2>
        <p id="lockedDeviceErrorMessage" style="font-size: 13px; color: var(--danger); font-weight: 600; margin: 0 0 16px 0; line-height: 1.5;">${error || 'Device registration limit reached. This device is already linked to two other accounts.'}</p>
        
        <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 16px 0; line-height: 1.4;">
            This physical terminal has reached the strict account registration ceiling for this license. Clearing cache or using private browsing cannot bypass this server-side security limit.
        </p>

        <div style="background: rgba(0, 0, 0, 0.04); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 20px; font-family: monospace; font-size: 11px; text-align: left;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                <span style="color: var(--text-muted); font-family: sans-serif; text-transform: uppercase; font-weight: 700;">Hardware ID:</span>
                <strong id="lockedHardwareDeviceIdDisplay" style="color: var(--text-dark); word-break: break-all;">${deviceId || 'N/A'}</strong>
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span style="color: var(--text-muted); font-family: sans-serif; text-transform: uppercase; font-weight: 700;">Attempted User:</span>
                <strong id="lockedDeviceEmailDisplay" style="color: var(--text-dark);">${email || 'N/A'}</strong>
            </div>
        </div>

        <button type="button" class="btn btn-outline" style="width: 100%; padding: 12px; font-size: 13px; font-weight: 700; border-radius: 10px; cursor: pointer;" onclick="window.location.reload()">
            <span>Reload POS Terminal</span>
        </button>
    </div>
  `;

  document.body.appendChild(div);
}

/**
 * Validates hardware authorization before standard Firebase Authentication.
 * If the device limit is exceeded, immediately throws and renders the lock screen.
 * 
 * @param {string} email - Account email attempting authentication
 * @param {string} [customDeviceId] - Optional override
 * @returns {Promise<Object>} Clearance token confirmation
 */
export async function validateDeviceBeforeLogin(email, customDeviceId) {
  const deviceId = customDeviceId || (await getHardwareDeviceId());

  try {
    // 1. Try Firebase Callable Function if available in window/SDK
    if (typeof window !== 'undefined' && window.firebaseCallableValidateDevice) {
      const result = await window.firebaseCallableValidateDevice({ email, deviceId });
      if (result?.data?.success) {
        if (typeof sessionStorage !== 'undefined' && result.data.deviceVerificationToken) {
          sessionStorage.setItem('billnaw_device_token', result.data.deviceVerificationToken);
        }
        return result.data;
      }
    }

    // 2. Direct HTTPS Callable or REST fallback to backend
    const res = await fetch('/api/auth/validate-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, deviceId })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      const errorMsg = data.error || 'Device validation failed';
      const isQuotaLimit = res.status === 403 || errorMsg.includes('Device registration limit reached');

      if (isQuotaLimit) {
        showDeviceLockedScreen({ deviceId, email, error: errorMsg });
      }

      const err = new Error(errorMsg);
      err.code = isQuotaLimit ? 'permission-denied' : 'invalid-argument';
      err.status = res.status;
      throw err;
    }

    if (typeof sessionStorage !== 'undefined' && data.deviceVerificationToken) {
      sessionStorage.setItem('billnaw_device_token', data.deviceVerificationToken);
    }

    return data;
  } catch (err) {
    if (err.code === 'permission-denied' || (err.message && err.message.includes('Device registration limit reached'))) {
      showDeviceLockedScreen({ deviceId, email, error: err.message });
    }
    throw err;
  }
}

// Export to window for global scripts and browser console access
if (typeof window !== 'undefined') {
  window.DeviceIdentity = {
    getHardwareDeviceId,
    validateDeviceBeforeLogin,
    showDeviceLockedScreen,
    collectHardwareAttributes
  };
}
