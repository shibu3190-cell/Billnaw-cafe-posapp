/**
 * js/device-identity.js
 * Browser-ready standalone bundle for hardware device identity and pre-auth gate.
 * Compatible with script tags and module loaders.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DeviceIdentity = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEVICE_CACHE_KEY = 'billnaw_hardware_device_id';
  var cachedMemoryDeviceId = null;

  function sha256Hex(str) {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      var encoder = new TextEncoder();
      var data = encoder.encode(str);
      return crypto.subtle.digest('SHA-256', data).then(function (buf) {
        var arr = Array.from(new Uint8Array(buf));
        return arr.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      });
    }
    // Synchronous fallback
    var hash = 0;
    for (var i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Promise.resolve('hw_' + Math.abs(hash).toString(16).padStart(32, '0'));
  }

  function getWebGLHardwareProfile() {
    if (typeof document === 'undefined') return { renderer: 'node', vendor: 'node' };
    try {
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { renderer: 'unsupported', vendor: 'unsupported' };
      var debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debug) return { renderer: 'generic', vendor: 'generic' };
      return {
        renderer: gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || 'unknown_renderer',
        vendor: gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || 'unknown_vendor',
        maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0
      };
    } catch (e) {
      return { renderer: 'err', vendor: 'err' };
    }
  }

  function getCanvasHardwareFingerprint() {
    if (typeof document === 'undefined') return 'node_canvas';
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      var ctx = canvas.getContext('2d');
      if (!ctx) return 'no_ctx';
      var grad = ctx.createLinearGradient(0, 0, 240, 60);
      grad.addColorStop(0, '#143832');
      grad.addColorStop(0.5, '#C8933F');
      grad.addColorStop(1, '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 240, 60);
      ctx.font = '16px -apple-system, sans-serif';
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText('Billnaw POS HW 2026', 15, 38);
      return canvas.toDataURL();
    } catch (e) {
      return 'canvas_err';
    }
  }

  function getAudioHardwareFingerprint() {
    if (typeof window === 'undefined' || (!window.OfflineAudioContext && !window.webkitOfflineAudioContext)) {
      return Promise.resolve('audio_none');
    }
    return new Promise(function (resolve) {
      try {
        var AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        var ctx = new AudioCtx(1, 44100, 44100);
        var osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(10000, ctx.currentTime);
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-50, ctx.currentTime);
        comp.knee.setValueAtTime(40, ctx.currentTime);
        comp.ratio.setValueAtTime(12, ctx.currentTime);
        comp.attack.setValueAtTime(0, ctx.currentTime);
        comp.release.setValueAtTime(0.25, ctx.currentTime);
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        ctx.oncomplete = function (e) {
          try {
            var samples = e.renderedBuffer.getChannelData(0);
            var sum = 0;
            for (var i = 4500; i < 5000; i++) sum += Math.abs(samples[i]);
            resolve('audio_' + sum.toFixed(8));
          } catch (err) {
            resolve('audio_extract_err');
          }
        };
        ctx.startRendering().catch(function () { resolve('audio_catch'); });
      } catch (err) {
        resolve('audio_err');
      }
    });
  }

  function collectHardwareAttributes() {
    return getAudioHardwareFingerprint().then(function (audio) {
      var webgl = getWebGLHardwareProfile();
      var canvas = getCanvasHardwareFingerprint();
      var profile = {
        renderer: webgl.renderer,
        vendor: webgl.vendor,
        maxTexture: webgl.maxTexture,
        canvas: canvas.slice(0, 100),
        audio: audio,
        cores: (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4,
        ram: (typeof navigator !== 'undefined' && navigator.deviceMemory) || 8,
        depth: (typeof screen !== 'undefined' && screen.colorDepth) || 24
      };
      return JSON.stringify(profile);
    });
  }

  function getHardwareDeviceId() {
    if (cachedMemoryDeviceId) return Promise.resolve(cachedMemoryDeviceId);

    if (typeof localStorage !== 'undefined') {
      var stored = localStorage.getItem(DEVICE_CACHE_KEY);
      if (stored && stored.startsWith('DEV_HW_') && stored.length >= 24) {
        cachedMemoryDeviceId = stored;
        return Promise.resolve(stored);
      }
    }

    return collectHardwareAttributes().then(function (raw) {
      return sha256Hex(raw).then(function (hash) {
        var id = 'DEV_HW_' + hash.slice(0, 32);
        cachedMemoryDeviceId = id;
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem(DEVICE_CACHE_KEY, id); } catch (e) {}
        }
        return id;
      });
    });
  }

  function showDeviceLockedScreen(params) {
    if (typeof document === 'undefined') return;
    var loginOverlay = document.getElementById('loginOverlay');
    if (loginOverlay) loginOverlay.style.display = 'none';

    var overlay = document.getElementById('deviceLockedOverlay');
    var idDisplay = document.getElementById('lockedHardwareDeviceIdDisplay');
    var errDisplay = document.getElementById('lockedDeviceErrorMessage');
    var emailDisplay = document.getElementById('lockedDeviceEmailDisplay');

    if (idDisplay) idDisplay.textContent = params.deviceId || 'UNKNOWN';
    if (emailDisplay) emailDisplay.textContent = params.email || 'N/A';
    if (errDisplay) {
      errDisplay.textContent = params.error || 'Device registration limit reached. This device is already linked to two other accounts.';
    }

    if (overlay) {
      overlay.style.display = 'flex';
    }
  }

  function validateDeviceBeforeLogin(email, customDeviceId) {
    var pId = customDeviceId ? Promise.resolve(customDeviceId) : getHardwareDeviceId();

    return pId.then(function (deviceId) {
      return fetch('/api/auth/validate-device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, deviceId: deviceId })
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok || !data.success) {
            var msg = data.error || 'Device validation failed';
            var isLimit = res.status === 403 || msg.indexOf('Device registration limit reached') !== -1;
            if (isLimit) {
              showDeviceLockedScreen({ deviceId: deviceId, email: email, error: msg });
            }
            var err = new Error(msg);
            err.code = isLimit ? 'permission-denied' : 'invalid-argument';
            err.status = res.status;
            throw err;
          }
          if (typeof sessionStorage !== 'undefined' && data.deviceVerificationToken) {
            sessionStorage.setItem('billnaw_device_token', data.deviceVerificationToken);
          }
          return data;
        });
      }).catch(function (err) {
        if (err.code === 'permission-denied' || (err.message && err.message.indexOf('Device registration limit reached') !== -1)) {
          showDeviceLockedScreen({ deviceId: deviceId, email: email, error: err.message });
        }
        throw err;
      });
    });
  }

  return {
    getHardwareDeviceId: getHardwareDeviceId,
    validateDeviceBeforeLogin: validateDeviceBeforeLogin,
    showDeviceLockedScreen: showDeviceLockedScreen,
    collectHardwareAttributes: collectHardwareAttributes
  };
}));
