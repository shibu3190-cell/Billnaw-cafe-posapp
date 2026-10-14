const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = path.join(os.tmpdir(), 'chrome_tabs_test_' + Date.now());
  const chromeProc = spawn(chromePath, [
    '--headless=new',
    '--remote-debugging-port=9777',
    '--user-data-dir=' + userDataDir,
    '--window-size=1280,800',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'http://localhost:5000'
  ]);

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await wait(500);
    try {
      targets = await getJson('http://127.0.0.1:9777/json/list');
      if (targets && targets.length > 0) break;
    } catch (e) {}
  }

  const pageTarget = targets.find(t => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const consoleLogs = [];
  const exceptions = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
      consoleLogs.push({ type: msg.params.type, text });
    } else if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails);
    }
  };

  await new Promise(r => ws.onopen = r);
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  // Wait 3 seconds for initial boot & any SW updates to settle
  await wait(3000);

  const tabs = [
    { tab: 'pos', id: 'pos', name: 'POS Terminal' },
    { tab: 'menu', id: 'menu', name: 'Menu Catalog & Stock' },
    { tab: 'dashboard', id: 'dashboard', name: 'Reports & Dashboard' },
    { tab: 'inventory', id: 'inventory', name: 'Commissary Inventory' },
    { tab: 'customers', id: 'customers', name: 'Customer Directory & Hub' },
    { tab: 'settings', id: 'settings', name: 'Settings Hub' }
  ];

  console.log('Testing Tab Navigation and View Visibility:\n');
  const results = [];

  for (const t of tabs) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        if (typeof switchTab === 'function') {
          switchTab('${t.tab}');
        }
      })()`
    });

    await wait(350);

    const checkRes = await send('Runtime.evaluate', {
      expression: `(() => {
        const el = document.getElementById('${t.id}');
        if (!el) return { exists: false };
        const comp = window.getComputedStyle(el);
        return {
          exists: true,
          display: comp.display,
          visibility: comp.visibility,
          opacity: comp.opacity,
          offsetWidth: el.offsetWidth,
          offsetHeight: el.offsetHeight,
          active: el.classList.contains('active'),
          childrenCount: el.children.length
        };
      })()`,
      returnByValue: true
    });

    // Capture screenshot for this tab
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`scratch/tab_${t.tab}.png`, Buffer.from(shot.data, 'base64'));

    const val = checkRes.result.value;
    const ok = val.exists && val.display !== 'none' && parseFloat(val.opacity) >= 0.99 && val.offsetWidth > 0 && val.offsetHeight > 0;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] Tab: ${t.name} (#${t.id})`);
    console.log(`       Dimensions: ${val.offsetWidth}x${val.offsetHeight}px | display: ${val.display} | opacity: ${val.opacity} | active: ${val.active}`);
    results.push({ ...t, ...val, ok });
  }

  console.log('\nConsole exceptions encountered:', exceptions.length);
  exceptions.forEach(e => console.error('  Exception:', e.text, e.url, e.lineNumber));

  const allPassed = results.every(r => r.ok) && exceptions.length === 0;
  console.log('\nAll Tabs Visually Rendered & Functional:', allPassed ? 'YES ✅' : 'NO ❌');

  ws.close();
  chromeProc.kill();
  process.exit(allPassed ? 0 : 1);
})();
