import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

function findChromePath() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'chrome';
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class SimpleCDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = [];
  }

  async connect() {
    const WebSocket = (await import('ws')).default;
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else cb.resolve(msg.result);
        } else if (msg.method) {
          for (const listener of this.eventListeners) {
            listener(msg.method, msg.params);
          }
        }
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(fn) {
    this.eventListeners.push(fn);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function run() {
  console.log('🚀 Launching Headless Chrome to test AI Image Variations on Repeated Clicks...');
  const chromePath = findChromePath();
  const remotePort = 9227;
  const userDataDir = path.join(process.cwd(), 'scratch', 'chrome-profile-var-test');

  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${remotePort}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,900'
  ], { detached: true });

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  await sleep(1500);

  let versionInfo;
  for (let i = 0; i < 15; i++) {
    try {
      versionInfo = await fetchJson(`http://127.0.0.1:${remotePort}/json/version`);
      if (versionInfo) break;
    } catch (e) {
      await sleep(400);
    }
  }

  if (!versionInfo) {
    console.error('Failed to connect to headless Chrome');
    chromeProc.kill();
    process.exit(1);
  }

  const targets = await fetchJson(`http://127.0.0.1:${remotePort}/json/list`);
  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const cdp = new SimpleCDPClient(pageTarget.webSocketDebuggerUrl);
  await cdp.connect();

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  const appUrl = 'http://localhost:5000/?testmode=1';
  console.log(`Navigating to ${appUrl}...`);
  await cdp.send('Page.navigate', { url: appUrl });
  await sleep(2500);

  // 1. Open Add Item Modal and test multi-click generation for Masala Coke
  console.log('\n--- 1. Testing Repeated AI Image Generation for Masala Coke ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      openAddMenuItemModal();
      document.getElementById('newItemName').value = 'Masala Coke';
      document.getElementById('newItemCategory').value = 'Beverages';
    })()`
  });
  await sleep(400);

  const cokeVariations = [];
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Runtime.evaluate', { expression: `generateAIImage()` });
    await sleep(800);
    const varState = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const preview = document.getElementById('newItemImagePreview');
        const btn = document.getElementById('btnGenerateAI');
        return {
          click: ${i},
          src: preview?.src || '',
          btnText: btn?.innerText || ''
        };
      })()`,
      returnByValue: true
    });
    cokeVariations.push(varState.result.value);
    console.log(`Click #${i}:`, varState.result.value.src);
  }

  // Ensure variations are distinct
  const uniqueCokeUrls = new Set(cokeVariations.map(v => v.src));
  assert.ok(uniqueCokeUrls.size >= 3, `Expected at least 3 distinct images for 4 clicks on Masala Coke, found ${uniqueCokeUrls.size}`);
  console.log(`✅ Masala Coke produced ${uniqueCokeUrls.size} unique variations across 4 clicks!`);

  // Capture screenshot of the modal with 4th variation
  const modalScreen = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const modalArtifactPath = path.join(process.cwd(), 'scratch', 'screen_ai_image_variations_coke.png');
  const brainModalPath = path.join('C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7', 'screen_ai_image_variations_coke.png');
  fs.writeFileSync(modalArtifactPath, Buffer.from(modalScreen.data, 'base64'));
  try { fs.writeFileSync(brainModalPath, Buffer.from(modalScreen.data, 'base64')); } catch (e) {}

  // 2. Test Repeated AI Image Generation for Samosa
  console.log('\n--- 2. Testing Repeated AI Image Generation for Samosa ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('newItemName').value = 'Samosa';
      document.getElementById('newItemCategory').value = 'Snacks';
    })()`
  });
  await sleep(400);

  const samosaVariations = [];
  for (let i = 1; i <= 3; i++) {
    await cdp.send('Runtime.evaluate', { expression: `generateAIImage()` });
    await sleep(800);
    const varState = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const preview = document.getElementById('newItemImagePreview');
        return {
          click: ${i},
          src: preview?.src || ''
        };
      })()`,
      returnByValue: true
    });
    samosaVariations.push(varState.result.value);
    console.log(`Click #${i}:`, varState.result.value.src);
  }

  const uniqueSamosaUrls = new Set(samosaVariations.map(v => v.src));
  assert.ok(uniqueSamosaUrls.size >= 2, `Expected at least 2 distinct images for 3 clicks on Samosa, found ${uniqueSamosaUrls.size}`);
  console.log(`✅ Samosa produced ${uniqueSamosaUrls.size} unique variations across 3 clicks!`);

  // 3. Test Repeated AI Image Generation for Chicken Curry
  console.log('\n--- 3. Testing Repeated AI Image Generation for Chicken Curry ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      document.getElementById('newItemName').value = 'Chicken Curry';
      document.getElementById('newItemCategory').value = 'Main Course';
    })()`
  });
  await sleep(400);

  const chickenVariations = [];
  for (let i = 1; i <= 3; i++) {
    await cdp.send('Runtime.evaluate', { expression: `generateAIImage()` });
    await sleep(800);
    const varState = await cdp.send('Runtime.evaluate', {
      expression: `(() => {
        const preview = document.getElementById('newItemImagePreview');
        return {
          click: ${i},
          src: preview?.src || ''
        };
      })()`,
      returnByValue: true
    });
    chickenVariations.push(varState.result.value);
    console.log(`Click #${i}:`, varState.result.value.src);
  }

  const uniqueChickenUrls = new Set(chickenVariations.map(v => v.src));
  assert.ok(uniqueChickenUrls.size >= 2, `Expected at least 2 distinct images for 3 clicks on Chicken Curry, found ${uniqueChickenUrls.size}`);
  console.log(`✅ Chicken Curry produced ${uniqueChickenUrls.size} unique variations across 3 clicks!`);

  cdp.close();
  chromeProc.kill();
  console.log('\n🎉 ALL MULTI-VARIATION TESTS PASSED WITH FLYING COLORS!');
}

run().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
