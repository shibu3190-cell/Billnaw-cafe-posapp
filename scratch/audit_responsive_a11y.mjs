import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DEBUG_PORT = 9235;
const TEMP_USER_DATA_DIR = path.join(os.tmpdir(), `chrome_audit_${Date.now()}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
    console.log("=== ENHANCED RESPONSIVE & A11Y CDP AUDIT ===");

    const chrome = spawn(CHROME_PATH, [
        '--headless=new',
        '--no-sandbox',
        '--disable-gpu',
        `--user-data-dir=${TEMP_USER_DATA_DIR}`,
        `--remote-debugging-port=${DEBUG_PORT}`,
        '--window-size=1280,800',
        'about:blank'
    ]);

    await sleep(2500);

    let ws;
    try {
        const listRes = await fetch(`http://localhost:${DEBUG_PORT}/json/list`);
        const targets = await listRes.json();
        const page = targets.find(t => t.type === 'page') || targets[0];

        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise(r => { ws.onopen = r; });
    } catch (e) {
        console.error("Failed to connect to Chrome:", e.message);
        chrome.kill();
        process.exit(1);
    }

    let msgId = 1;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
        const id = msgId++;
        const handler = (evt) => {
            const data = JSON.parse(evt.data);
            if (data.id === id) {
                ws.removeEventListener('message', handler);
                if (data.error) reject(data.error);
                else resolve(data.result);
            }
        };
        ws.addEventListener('message', handler);
        ws.send(JSON.stringify({ id, method, params }));
    });

    const evaluate = async (expression) => {
        const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        return res?.result?.value;
    };

    // Navigate to local dev server
    await send('Page.navigate', { url: 'http://localhost:5000' });
    await sleep(2000);

    // Bypass shop auth if open
    await evaluate(`
        if (typeof skipShopAuthToDemo === 'function') {
            skipShopAuthToDemo();
        } else if (typeof closeShopAuthModal === 'function') {
            closeShopAuthModal(false);
        }
    `);
    await sleep(800);

    // 1. Detailed Touch Target Inspection on Mobile (390x844)
    await send('Emulation.setDeviceMetricsOverride', {
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        mobile: true
    });
    await sleep(500);

    const detailedTouchTargets = await evaluate(`
        (() => {
            const elements = document.querySelectorAll('button, a, input, select, .nav-btn, .item-qty-control button, .hub-action-btn, [onclick]');
            const results = [];

            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && rect.width > 0 && rect.height > 0) {
                    results.push({
                        tag: el.tagName,
                        id: el.id,
                        className: (el.className || '').toString(),
                        text: (el.innerText || el.value || el.getAttribute('aria-label') || '').slice(0, 40).replace(/\\s+/g, ' ').trim(),
                        width: Math.round(rect.width * 10) / 10,
                        height: Math.round(rect.height * 10) / 10,
                        isUnder44: rect.width < 44 || rect.height < 44,
                        isUnder24: rect.width < 24 || rect.height < 24
                    });
                }
            });
            return results;
        })()
    `);

    console.log(`\n--- Mobile Touch Targets (390x844) ---`);
    const under44 = detailedTouchTargets.filter(t => t.isUnder44);
    const under24 = detailedTouchTargets.filter(t => t.isUnder24);
    console.log(`Total visible interactive elements: ${detailedTouchTargets.length}`);
    console.log(`Elements under 44x44px: ${under44.length}`);
    console.log(`Elements under 24x24px: ${under24.length}`);

    console.log("\nUnder 24x24px:");
    under24.forEach(t => console.log(`  [${t.width}x${t.height}px] <${t.tag} class="${t.className}" id="${t.id}"> "${t.text}"`));

    console.log("\nTop 15 Under 44x44px:");
    under44.slice(0, 15).forEach(t => console.log(`  [${t.width}x${t.height}px] <${t.tag} class="${t.className}" id="${t.id}"> "${t.text}"`));

    // 2. Audit modal viewport fit and clipping
    console.log("\n--- Testing Modal Viewport Fit on Mobile (390x844) ---");
    const modalFit = await evaluate(`
        (() => {
            const modals = document.querySelectorAll('.modal, .modal-box, .modal-content, [id*="Modal"]');
            const results = [];
            // Sample test a few key modals
            const testModalIds = ['quickExpenseModal', 'checkoutModal', 'customerActionHubModal', 'statementModal', 'tableConfigModal'];
            testModalIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    const prevDisplay = el.style.display;
                    el.style.display = 'flex';
                    const box = el.querySelector('.modal-box, .modal-content') || el;
                    const rect = box.getBoundingClientRect();
                    const winW = window.innerWidth;
                    const winH = window.innerHeight;
                    const closeBtn = el.querySelector('.modal-close-btn, button[class*="close"]');
                    const closeRect = closeBtn ? closeBtn.getBoundingClientRect() : null;

                    results.push({
                        id,
                        width: Math.round(rect.width),
                        height: Math.round(rect.height),
                        winW,
                        winH,
                        overflowX: rect.width > winW,
                        overflowY: rect.height > winH,
                        closeBtnVisible: closeRect ? (closeRect.top >= 0 && closeRect.left >= 0 && closeRect.bottom <= winH && closeRect.right <= winW) : false,
                        closeBtnRect: closeRect ? { top: Math.round(closeRect.top), right: Math.round(closeRect.right) } : null
                    });
                    el.style.display = prevDisplay;
                }
            });
            return results;
        })()
    `);
    console.log("Modal Viewport Fit:", JSON.stringify(modalFit, null, 2));

    // 3. Color Contrast Audit of Design Tokens
    console.log("\n--- Color Contrast Audit ---");
    const contrastAudit = await evaluate(`
        (() => {
            function getLuminance(r, g, b) {
                const a = [r, g, b].map(v => {
                    v /= 255;
                    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
                });
                return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
            }

            function getContrast(rgb1, rgb2) {
                const lum1 = getLuminance(rgb1[0], rgb1[1], rgb1[2]);
                const lum2 = getLuminance(rgb2[0], rgb2[1], rgb2[2]);
                const brightest = Math.max(lum1, lum2);
                const darkest = Math.min(lum1, lum2);
                return (brightest + 0.05) / (darkest + 0.05);
            }

            function parseRgb(colorStr) {
                const m = colorStr.match(/\\d+/g);
                return m ? [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])] : [0,0,0];
            }

            const styles = window.getComputedStyle(document.documentElement);
            const tokens = [
                { name: '--primary', bg: [255, 255, 255] },
                { name: '--text-dark', bg: [255, 255, 255] },
                { name: '--text-muted', bg: [255, 255, 255] },
                { name: '--danger', bg: [255, 255, 255] },
                { name: '--success', bg: [255, 255, 255] },
                { name: '--accent', bg: [255, 255, 255] }
            ];

            const results = [];
            tokens.forEach(t => {
                const color = styles.getPropertyValue(t.name).trim();
                // Create temp element to resolve hex / rgb
                const div = document.createElement('div');
                div.style.color = color || 'var(' + t.name + ')';
                document.body.appendChild(div);
                const resolved = window.getComputedStyle(div).color;
                document.body.removeChild(div);

                const rgb = parseRgb(resolved);
                const ratio = getContrast(rgb, t.bg);
                results.push({
                    token: t.name,
                    colorStr: color,
                    resolved,
                    contrastRatio: Math.round(ratio * 100) / 100,
                    passesAA_Normal: ratio >= 4.5,
                    passesAA_Large: ratio >= 3.0
                });
            });
            return results;
        })()
    `);
    console.log("Color Contrast Results:", JSON.stringify(contrastAudit, null, 2));

    // 4. Keyboard Navigation & Focus Ring Audit
    console.log("\n--- Focus Ring & Keyboard Navigation ---");
    const focusAudit = await evaluate(`
        (() => {
            const btn = document.querySelector('.btn-primary');
            let outline = 'none';
            if (btn) {
                btn.focus();
                outline = window.getComputedStyle(btn).outline;
            }
            const modalClose = document.querySelector('.modal-close-btn');
            let closeOutline = 'none';
            if (modalClose) {
                modalClose.focus();
                closeOutline = window.getComputedStyle(modalClose).outline;
            }
            return {
                btnPrimaryFocusOutline: outline,
                modalCloseFocusOutline: closeOutline
            };
        })()
    `);
    console.log("Focus Outlines:", focusAudit);

    chrome.kill();
    console.log("\n=== ALL AUDITS FINISHED ===");
}

main().catch(err => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
