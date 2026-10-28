import { spawn } from 'child_process';
import fs from 'fs';

async function test() {
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--no-sandbox',
    '--remote-debugging-port=9249',
    '--window-size=390,844',
    'http://localhost:5000'
  ]);
  await new Promise(r => setTimeout(r, 2500));
  const res = await fetch('http://localhost:9249/json/list');
  const targets = await res.json();
  const page = targets[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://localhost:5000' });
  await new Promise(r => setTimeout(r, 2000));

  await send('Runtime.evaluate', { expression: `
    localStorage.setItem('billnaw_auth_token', 'demo_token_123');
    localStorage.setItem('billnaw_auth_mode', 'authenticated');
    localStorage.setItem('billnaw_active_staff', JSON.stringify({ id: 1, name: 'Admin', role: 'Admin' }));
    closeShopAuthModal(true);
    switchTab('pos');
  ` });
  await new Promise(r => setTimeout(r, 1200));

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const describe = (el) => {
        if (!el) return null;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          id: el.id,
          className: el.className,
          bg: style.backgroundColor,
          bgImg: style.backgroundImage,
          rect: { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width },
          padding: style.padding,
          margin: style.margin,
          overflow: style.overflow
        };
      };

      const el750 = document.elementFromPoint(195, 750);
      const el710 = document.elementFromPoint(195, 710);
      const el680 = document.elementFromPoint(195, 680);
      const el650 = document.elementFromPoint(195, 650);

      return {
        at750: describe(el750),
        at710: describe(el710),
        at680: describe(el680),
        at650: describe(el650),
        mobilePosActions: describe(document.querySelector('.mobile-pos-actions')),
        sidebar: describe(document.querySelector('.sidebar')),
        posView: describe(document.getElementById('pos')),
        posLeft: describe(document.querySelector('.pos-left')),
        mainWrapper: describe(document.querySelector('.main-wrapper')),
        htmlBg: window.getComputedStyle(document.documentElement).backgroundColor,
        bodyBg: window.getComputedStyle(document.body).backgroundColor
      };
    })()`,
    returnByValue: true
  });
  console.log('DOM INSPECTION RESULT:', JSON.stringify(info.result.value, null, 2));

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scratch/test_pos_bottom_white_box.png', Buffer.from(shot.data, 'base64'));
  console.log('Saved scratch/test_pos_bottom_white_box.png');

  ws.close();
  chrome.kill();
}
test().catch(console.error);
