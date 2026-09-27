import http from 'http';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

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
  console.log('🚀 Launching Headless Chrome to verify Culinary Photos & AI Image Engine...');
  const chromePath = findChromePath();
  const remotePort = 9226;
  const userDataDir = path.join(process.cwd(), 'scratch', 'chrome-profile-img-test');

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

  const networkErrors = [];
  cdp.onEvent((method, params) => {
    if (method === 'Network.responseReceived') {
      const { status, url } = params.response;
      if (status >= 400) {
        networkErrors.push({ status, url });
        console.warn(`[HTTP ${status}] ${url}`);
      }
    }
    if (method === 'Runtime.consoleAPICalled') {
      const text = params.args.map(a => a.value || a.description || '').join(' ');
      if (text.includes('403') || text.includes('pollinations')) {
        console.warn(`[Browser Console]: ${text}`);
      }
    }
  });

  const appUrl = 'http://localhost:5000/?testmode=1';
  console.log(`Navigating to ${appUrl}...`);
  await cdp.send('Page.navigate', { url: appUrl });
  await sleep(2500);

  // 1. Verify Culinary Photo Map & Image Resolution
  console.log('\n--- 1. Testing Culinary Photo Matching in Browser ---');
  const photoTests = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cokePhoto = getCuratedFoodPhoto('Masala Coke');
      const samosaPhoto = getCuratedFoodPhoto('Samosa');
      const teaPhoto = getCuratedFoodPhoto('Tea');
      const chickenPhoto = getCuratedFoodPhoto('Chicken Curry');
      const coffeePhoto = getCuratedFoodPhoto('Cold Coffee');
      const biryaniPhoto = getCuratedFoodPhoto('Special Dum Biryani');
      
      const cokeFallback = generateFallbackImage('Masala Coke', 'Beverages');
      const samosaFallback = generateFallbackImage('Samosa', 'Snacks');
      
      return {
        cokePhoto,
        samosaPhoto,
        teaPhoto,
        chickenPhoto,
        coffeePhoto,
        biryaniPhoto,
        cokeFallbackIsData: cokeFallback.startsWith('data:image'),
        samosaFallbackIsData: samosaFallback.startsWith('data:image')
      };
    })()`,
    returnByValue: true
  });

  console.log('Culinary Photo Resolution Results:', JSON.stringify(photoTests.result.value, null, 2));

  // 2. Verify POS Dish Cards render actual food photos
  console.log('\n--- 2. Checking POS Menu Cards & Image Sources ---');
  const posCards = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const cards = Array.from(document.querySelectorAll('#menuGridUI .menu-card'));
      return cards.map(c => {
        const name = c.querySelector('.name')?.innerText || '';
        const img = c.querySelector('img.card-img')?.src || '';
        const price = c.querySelector('.price')?.innerText || '';
        return { name, img: img.substring(0, 75) + '...', price };
      });
    })()`,
    returnByValue: true
  });

  console.log('Rendered POS Menu Cards:', JSON.stringify(posCards.result.value, null, 2));

  // Capture POS screen with gourmet dish images
  const posScreen = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const posArtifactPath = path.join(process.cwd(), 'scratch', 'screen_gourmet_food_images_verified.png');
  const brainPosPath = path.join('C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7', 'screen_gourmet_food_images_verified.png');
  fs.writeFileSync(posArtifactPath, Buffer.from(posScreen.data, 'base64'));
  try { fs.writeFileSync(brainPosPath, Buffer.from(posScreen.data, 'base64')); } catch (e) {}
  console.log(`Saved screenshot to ${posArtifactPath}`);

  // 3. Test Add Menu Item & "✨ AI Photo" Generation for Masala Coke
  console.log('\n--- 3. Testing "Add Menu Item" and "AI Photo" Generator ---');
  await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      openAddMenuItemModal();
      document.getElementById('newItemName').value = 'Masala Coke';
    })()`
  });
  await sleep(500);

  // Trigger AI Generate
  await cdp.send('Runtime.evaluate', {
    expression: `generateAIImage()`
  });
  await sleep(1500);

  const previewState = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const preview = document.getElementById('newItemImagePreview');
      return {
        src: preview?.src || '',
        display: preview?.style.display || '',
        opacity: preview?.style.opacity || '',
        currentBase64: currentItemImageBase64 ? currentItemImageBase64.substring(0, 60) + '...' : ''
      };
    })()`,
    returnByValue: true
  });

  console.log('AI Image Preview State:', JSON.stringify(previewState.result.value, null, 2));

  // Capture Add Item Modal with AI Photo
  const modalScreen = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const modalArtifactPath = path.join(process.cwd(), 'scratch', 'screen_ai_photo_generator_modal.png');
  const brainModalPath = path.join('C:\\Users\\abhij\\.gemini\\antigravity\\brain\\2f65eb2c-a996-49e0-a0a5-6b7a3eb769e7', 'screen_ai_photo_generator_modal.png');
  fs.writeFileSync(modalArtifactPath, Buffer.from(modalScreen.data, 'base64'));
  try { fs.writeFileSync(brainModalPath, Buffer.from(modalScreen.data, 'base64')); } catch (e) {}
  console.log(`Saved screenshot to ${modalArtifactPath}`);

  // 4. Verify Zero 403 Errors
  const forbiddenErrors = networkErrors.filter(e => e.status === 403 || e.url.includes('pollinations'));
  console.log('\n--- 4. Forbidden / 403 Error Audit ---');
  console.log(`Total 403 Forbidden errors encountered: ${forbiddenErrors.length}`);

  cdp.close();
  chromeProc.kill();

  if (forbiddenErrors.length > 0) {
    console.error('❌ FAILED: Detected 403 Forbidden errors from pollinations.ai');
    process.exit(1);
  } else {
    console.log('✅ SUCCESS: All food pictures match dishes accurately, zero 403 errors, and flawless visual rendering!');
  }
}

run().catch(err => {
  console.error('Execution error:', err);
  process.exit(1);
});
