// scratch/test_ai_menu_reliability_fix.cjs
// TDD regression suite for AI menu upload reliability fixes:
// 1. Prune deprecated 404 models (2.0/2.5) from runtime & probe orders (including AIza BYOK)
// 2. Per-model thinkingConfig minimization (MINIMAL on 3.5-flash-lite, budget 0 on 3.1/3.5/3.8/latest)
// 3. Cascade resilience on empty {"categories":[]} and malformed JSON responses
// 4. Prompt token minimization (no mandatory synthetic dish descriptions)
// 5. Client multi-page PDF loop + CDN fallback + HTTP 502/504 error preservation

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    console.log(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
  }
}

(async () => {
  console.log('====================================================');
  console.log('AI MENU UPLOAD RELIABILITY REGRESSION TESTS');
  console.log('====================================================\n');

  const geminiService = await import('../server/gemini-service.js');
  const geminiSrc = fs.readFileSync(path.join(ROOT_DIR, 'server/gemini-service.js'), 'utf8');
  const menuJs = fs.readFileSync(path.join(ROOT_DIR, 'js/menu.js'), 'utf8');

  const DEPRECATED_404_MODELS = ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];

  // 1. Helper exports & deprecated 404 model pruning
  await test('REL-01: buildRuntimeModelOrder is exported and excludes dead 404 models for AIza & AQ keys', () => {
    assert.strictEqual(typeof geminiService.buildRuntimeModelOrder, 'function', 'buildRuntimeModelOrder must be exported');
    const aizaOrder = geminiService.buildRuntimeModelOrder('AIzaSyTestStudioKey1234567890');
    const aqOrder = geminiService.buildRuntimeModelOrder('AQ.AbcDefGhIjKlMnOpQrStUvWxYz12345678901234567890');

    for (const deadModel of DEPRECATED_404_MODELS) {
      assert.ok(!aizaOrder.includes(deadModel), `AIza runtime order must not include dead 404 model '${deadModel}'`);
      assert.ok(!aqOrder.includes(deadModel), `AQ runtime order must not include dead 404 model '${deadModel}'`);
    }
    assert.strictEqual(aizaOrder[0], 'gemini-3.5-flash-lite', 'AIza key should start directly with active gemini-3.5-flash-lite');
    assert.ok(aizaOrder.indexOf('gemini-flash-lite-latest') !== -1 && aizaOrder.indexOf('gemini-flash-lite-latest') < aizaOrder.indexOf('gemini-3.8-flash'),
      'Fast non-thinking flash-lite-latest must precede heavier gemini-3.8-flash');
  });

  // 2. Model-compatible thinkingConfig
  await test('REL-02: getThinkingConfigForModel minimizes latency cleanly without triggering 400 on 3.5-flash-lite', () => {
    assert.strictEqual(typeof geminiService.getThinkingConfigForModel, 'function', 'getThinkingConfigForModel must be exported');
    assert.deepStrictEqual(
      geminiService.getThinkingConfigForModel('gemini-3.5-flash-lite'),
      { thinkingLevel: 'MINIMAL' },
      'gemini-3.5-flash-lite requires thinkingLevel: MINIMAL (thinkingBudget: 0 causes HTTP 400)'
    );
    assert.deepStrictEqual(
      geminiService.getThinkingConfigForModel('gemini-flash-lite-latest'),
      { thinkingLevel: 'MINIMAL' },
      'gemini-flash-lite-latest currently aliases 3.5-flash-lite and uses thinkingLevel: MINIMAL'
    );
    for (const budgetZeroModel of ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-flash-latest']) {
      assert.deepStrictEqual(
        geminiService.getThinkingConfigForModel(budgetZeroModel),
        { thinkingBudget: 0 },
        `${budgetZeroModel} must disable thinking via thinkingBudget: 0`
      );
    }
  });

  // 3. Key probe avoids deprecated 404 models
  await test('REL-03: verifyGeminiKeyDetailed does not probe dead 404 models (2.0/2.5)', () => {
    const verifyFnStart = geminiSrc.indexOf('export async function verifyGeminiKeyDetailed');
    const verifyFnEnd = geminiSrc.indexOf('export async function isGeminiKeyOperational');
    assert.ok(verifyFnStart !== -1 && verifyFnEnd > verifyFnStart, 'Could not locate verifyGeminiKeyDetailed');
    const verifySlice = geminiSrc.slice(verifyFnStart, verifyFnEnd);
    for (const deadModel of DEPRECATED_404_MODELS) {
      assert.ok(!verifySlice.includes(`'${deadModel}'`), `verifyGeminiKeyDetailed should not hardcode dead 404 model '${deadModel}'`);
    }
  });

  // 4. Empty {"categories":[]} and malformed JSON cascade fallback
  await test('REL-04: extractMenuFromDocument cascades past empty {"categories":[]} from lite model to next model', async () => {
    const calledModels = [];
    const seenThinkingConfigs = [];
    const mockAiClient = {
      models: {
        generateContent: async ({ model, config }) => {
          calledModels.push(model);
          seenThinkingConfigs.push({ model, thinkingConfig: config?.thinkingConfig || null });
          if (model === 'gemini-3.5-flash-lite') {
            return { text: JSON.stringify({ categories: [] }) };
          }
          return {
            text: JSON.stringify({
              menu_categories: [
                { category_name: 'Coffee', items: [{ item_name: 'Cold Brew', price: 140, isVeg: true }] }
              ]
            })
          };
        }
      }
    };

    const res = await geminiService.extractMenuFromDocument({
      base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      mimeType: 'image/png',
      apiKey: 'AIzaSyMockTestStudioKey1234567890',
      aiClient: mockAiClient
    });

    assert.deepStrictEqual(calledModels.slice(0, 2), ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
      'Empty categories response from model 1 must cascade to model 2 without hitting 404 models');
    assert.strictEqual(res.modelUsed, 'gemini-3.1-flash-lite');
    assert.strictEqual(res.categories.length, 1);
    assert.strictEqual(res.categories[0].items[0].name, 'Cold Brew');
    assert.deepStrictEqual(seenThinkingConfigs[0].thinkingConfig, { thinkingLevel: 'MINIMAL' });
    assert.deepStrictEqual(seenThinkingConfigs[1].thinkingConfig, { thinkingBudget: 0 });
  });

  await test('REL-05: extractMenuFromDocument cascades past truncated invalid JSON to next model', async () => {
    const calledModels = [];
    const mockAiClient = {
      models: {
        generateContent: async ({ model }) => {
          calledModels.push(model);
          if (calledModels.length === 1) {
            return { text: '{"menu_categories":[{"category_name":"Tea","items":[{"item_name":"Chai"' };
          }
          return {
            text: JSON.stringify({
              menu_categories: [{ category_name: 'Tea', items: [{ item_name: 'Masala Chai', price: 25 }] }]
            })
          };
        }
      }
    };

    const res = await geminiService.extractMenuFromDocument({
      base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      mimeType: 'image/png',
      apiKey: 'AQ.AbcDefGhIjKlMnOpQrStUvWxYz12345678901234567890',
      aiClient: mockAiClient
    });

    assert.strictEqual(calledModels.length, 2, 'Truncated JSON on model 1 must fall back to model 2');
    assert.strictEqual(res.categories[0].items[0].name, 'Masala Chai');
  });

  await test('REL-06: Prompt keeps JSON compact without asking LLM to invent synthetic dish descriptions', () => {
    const extractFnStart = geminiSrc.indexOf('export async function extractMenuFromDocument');
    const extractFnEnd = geminiSrc.indexOf('const SERVER_CULINARY_PHOTO_MAP');
    const extractFnSlice = geminiSrc.slice(extractFnStart, extractFnEnd);
    assert.ok(!extractFnSlice.includes('"Bold single shot espresso"'), 'Prompt schema must not instruct LLM to generate descriptions for every dish');
    assert.ok(extractFnSlice.includes('maxOutputTokens: 16384'), 'extractMenuFromDocument should configure explicit maxOutputTokens: 16384');
  });

  // 5. Client PDF & HTTP diagnostics in js/menu.js (real sandboxed behavior tests)
  function createMenuSandbox(overrides = {}) {
    const vm = require('vm');
    const toasts = [];
    const elements = {};
    const makeEl = () => ({ style: {}, value: '', innerText: '', innerHTML: '', disabled: false, remove: () => {} });
    const documentStub = {
      getElementById: (id) => {
        if (!elements[id]) elements[id] = makeEl();
        return elements[id];
      },
      querySelectorAll: () => [],
      createElement: (tag) => {
        if (tag === 'canvas') {
          const canvas = {
            width: 0,
            height: 0,
            getContext: () => ({ drawImage: () => {} }),
            toDataURL: (_m, q) => `data:image/jpeg;base64,MOCKIMG_${q || 0.8}`
          };
          return canvas;
        }
        return makeEl();
      }
    };
    const sandbox = {
      console,
      Math,
      Date,
      Set,
      Map,
      Array,
      Object,
      String,
      Number,
      Boolean,
      JSON,
      Promise,
      Error,
      Uint8Array,
      AbortController,
      setTimeout,
      clearTimeout,
      pendingAiItems: [],
      pendingAiFallbackNotice: null,
      pendingUploadPayload: null,
      lastUploadedMenuPreviewUrl: null,
      menuCategories: ['All', 'Coffee'],
      menuItems: [],
      document: documentStub,
      window: null,
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      showToast: (msg, type) => toasts.push({ msg, type }),
      canCurrentStaffManageMenu: () => true,
      _sanitizeMenuImgUrl: (u) => {
        const s = String(u || '').trim();
        return /^(https?:\/\/|data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);)/i.test(s) ? s : '';
      },
      getGourmetFoodImage: (name) => `https://img.example/${encodeURIComponent(name)}`,
      generateFallbackImage: (name) => `data:image/svg+xml,${encodeURIComponent(name)}`,
      getStoreGstConfig: () => ({ mode: 'inclusive', defaultRate: 5 }),
      escapeHtml: (s) => String(s || ''),
      renderAiPreviewModal: () => {},
      refreshAiMenuQuotaPill: () => {},
      ...overrides
    };
    sandbox.window = sandbox;
    const startIdx = menuJs.indexOf('// Local smart layout parser fallback when offline or unauthenticated');
    const endIdx = menuJs.indexOf('function closeAiPreConvertModal()');
    assert.ok(startIdx !== -1 && endIdx > startIdx, 'Could not locate AI menu section in js/menu.js');
    const relevantCode = menuJs.slice(startIdx, endIdx);
    vm.runInNewContext(
      `${relevantCode}\n;window.__testExports = { _loadPdfJsWithFallback, _extractPdfPages, _encodeCanvasForUpload, executeMultiPagePdfExtraction, executeMenuExtraction, _requestAiScanEndpoint, cancelAiMenuScan };`,
      sandbox
    );
    return { sandbox, toasts, elements };
  }

  await test('REL-07: Multi-page PDF extracts ALL pages with isEvalSupported: false, destroys PDF, and skips blank cover page 1', async () => {
    const cdnCalls = [];
    const scannedPagePayloads = [];
    const getDocumentArgs = [];
    let pdfDestroyed = false;
    const removedSelectors = [];
    const fakePdfLib = {
      GlobalWorkerOptions: {},
      getDocument: (arg) => {
        getDocumentArgs.push(arg);
        return {
          promise: Promise.resolve({
            numPages: 3,
            destroy: async () => { pdfDestroyed = true; },
            getPage: async (pageNum) => ({
              getViewport: ({ scale }) => ({ width: Math.round(600 * scale), height: Math.round(800 * scale) }),
              render: () => ({ promise: Promise.resolve() }),
              getTextContent: async () => ({
                items: pageNum === 1 ? [] : [{ str: `PAGE_${pageNum}_TEXT` }]
              }),
              cleanup: () => {}
            })
          })
        };
      }
    };

    const { sandbox } = createMenuSandbox({
      loadLazyScript: async (src) => {
        cdnCalls.push(src);
        if (src.includes('cdnjs.cloudflare.com')) {
          throw new Error('cdnjs blocked');
        }
        sandbox.window.pdfjsLib = fakePdfLib;
      },
      fetch: async (_url, opts) => {
        const body = JSON.parse(opts.body);
        scannedPagePayloads.push(body);
        if (body.extractedText === '') {
          return { ok: true, status: 200, json: async () => ({ categories: [], isFallback: false }) };
        }
        if (body.extractedText.includes('PAGE_2')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              categories: [{ name: 'Coffee', items: [{ name: 'Espresso', price: 100 }, { name: 'Latte', price: 150 }] }],
              isFallback: false
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            categories: [
              { name: 'Coffee', items: [{ name: 'Latte', price: 150 }] },
              { name: 'Snacks', items: [{ name: 'Brownie', price: 120 }] }
            ],
            isFallback: false,
            quota: { limit: 15, used: 2, remaining: 13 }
          })
        };
      }
    });
    sandbox.document.querySelectorAll = (sel) => {
      removedSelectors.push(sel);
      return [{ remove: () => removedSelectors.push('REMOVED') }];
    };

    const { _extractPdfPages, executeMultiPagePdfExtraction } = sandbox.__testExports;
    const pdfResult = await _extractPdfPages({ size: 1024, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer });
    assert.strictEqual(cdnCalls.length, 2, 'Must fail over from cdnjs to jsdelivr CDN');
    assert.ok(cdnCalls[1].includes('cdn.jsdelivr.net'), 'Second CDN call must use jsdelivr');
    assert.ok(removedSelectors.includes('REMOVED'), 'Must clean up failed CDN script tag to allow retries');
    assert.strictEqual(getDocumentArgs[0].isEvalSupported, false, 'Must disable PDF.js eval support (CVE-2024-4367)');
    assert.strictEqual(pdfDestroyed, true, 'Must destroy PDFDocumentProxy after page extraction');
    assert.strictEqual(pdfResult.pages.length, 3, 'Must extract all 3 pages instead of page 1 only');

    await executeMultiPagePdfExtraction(pdfResult, { customKey: '', activeShopId: 'SHOP_PDF', scanText: null });
    assert.strictEqual(scannedPagePayloads.length, 3, 'Must scan all 3 PDF pages sequentially');
    const names = Array.from(sandbox.pendingAiItems, i => i.name);
    assert.deepStrictEqual(names, ['Espresso', 'Latte', 'Brownie'], 'Must merge pages 2+3 and deduplicate Espresso/Latte/Brownie');
  });

  await test('REL-08: executeMenuExtraction preserves HTTP 502/504 & 413 diagnostics instead of blaming photo clarity', async () => {
    for (const [statusCode, expectedMatch] of [[504, /504|timed out/i], [413, /413|too large/i]]) {
      const { sandbox, toasts } = createMenuSandbox({
        fetch: async () => ({
          ok: false,
          status: statusCode,
          json: async () => ({})
        })
      });
      await sandbox.__testExports.executeMenuExtraction({
        base64Data: 'data:image/jpeg;base64,AAAA',
        mimeType: 'image/jpeg',
        extractedText: '',
        shopId: 'SHOP_ERR'
      }, false);
      assert.ok(expectedMatch.test(sandbox.pendingAiFallbackNotice || ''), `Expected HTTP ${statusCode} diagnostic in banner, got: ${sandbox.pendingAiFallbackNotice}`);
      assert.ok(!/ensure the menu photo is clear/i.test(sandbox.pendingAiFallbackNotice || ''), 'Must NOT falsely blame photo clarity on HTTP gateway/size error');
      assert.ok(toasts.some(t => t.type === 'error' && expectedMatch.test(t.msg)), `Expected error toast for HTTP ${statusCode}`);
    }
  });

  await test('REL-09: Multi-page PDF never imports starter_template dishes and aborts cleanly after VISION_FAILED while keeping local_text_parser items', async () => {
    let calls = 0;
    const { sandbox } = createMenuSandbox({
      fetch: async () => {
        calls++;
        if (calls === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              isFallback: true,
              fallbackSource: 'starter_template',
              aiErrorCode: null,
              warning: 'Server Gemini API key is not configured.',
              categories: [{ name: 'Template', items: [{ name: 'FAKE_TEMPLATE_DISH', price: 99 }] }]
            })
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            isFallback: true,
            fallbackSource: 'local_text_parser',
            aiErrorCode: 'VISION_FAILED',
            warning: 'Vision failed.',
            categories: [{ name: 'Beverages', items: [{ name: 'Chai', price: 25 }] }]
          })
        };
      }
    });

    await sandbox.__testExports.executeMultiPagePdfExtraction({
      pages: [
        { pageNumber: 1, base64Data: 'data:image/jpeg;base64,A', mimeType: 'image/jpeg', extractedText: '' },
        { pageNumber: 2, base64Data: 'data:image/jpeg;base64,B', mimeType: 'image/jpeg', extractedText: 'Chai 25' },
        { pageNumber: 3, base64Data: 'data:image/jpeg;base64,C', mimeType: 'image/jpeg', extractedText: 'Coffee 90' }
      ],
      totalPages: 3,
      scannedPages: 3,
      combinedText: 'Chai 25\nCoffee 90'
    }, { customKey: 'AIzaTestKey1234567890', activeShopId: 'SHOP_TPL' });

    const names = Array.from(sandbox.pendingAiItems, i => i.name);
    assert.ok(!names.includes('FAKE_TEMPLATE_DISH'), 'Starter template dishes must NEVER pollute PDF scan');
    assert.deepStrictEqual(names, ['Chai'], 'Must keep real selectable text from page 2 and halt before hammering page 3 after VISION_FAILED');
    assert.strictEqual(calls, 2, 'Loop must stop immediately after VISION_FAILED on page 2');
  });

  await test('REL-10: Oversized base64 rejected with 413, frozen 429 errors handled immutably, and empty cascade stops after 2 models', async () => {
    let sizeErr = null;
    try {
      await geminiService.extractMenuFromDocument({
        base64Data: 'A'.repeat(12 * 1024 * 1024 + 500),
        mimeType: 'image/jpeg',
        apiKey: 'AIzaSyTestStudioKey1234567890'
      });
    } catch (e) {
      sizeErr = e;
    }
    assert.strictEqual(sizeErr?.status, 413, 'Oversized base64 payload must fail fast with HTTP 413');

    const emptyCalls = [];
    const mockAi = {
      models: {
        generateContent: async ({ model }) => {
          emptyCalls.push(model);
          if (model === 'gemini-3.5-flash-lite') {
            const frozenErr = Object.freeze(new Error('RESOURCE_EXHAUSTED'));
            throw frozenErr;
          }
          return { text: JSON.stringify({ categories: [] }) };
        }
      }
    };

    const res = await geminiService.extractMenuFromDocument({
      base64Data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      mimeType: 'image/png',
      apiKey: 'AIzaSyMockTestStudioKey1234567890',
      aiClient: mockAi
    });
    assert.strictEqual(res.categories.length, 0);
    assert.strictEqual(emptyCalls.length, 3, 'Must try 1 frozen 429 + max 2 empty models without mutating frozen Error or calling all 6 models');
  });

  await test('REL-11: _encodeCanvasForUpload shrinks oversized canvas & _requestAiScanEndpoint keeps API key out of JSON body', async () => {
    let sentBody = null;
    let sentHeaders = null;
    const { sandbox } = createMenuSandbox({
      fetch: async (_url, opts) => {
        sentHeaders = opts.headers;
        sentBody = JSON.parse(opts.body);
        return { ok: true, status: 200, json: async () => ({ categories: [{ name: 'Tea', items: [{ name: 'Chai', price: 20 }] }] }) };
      }
    });

    const outcome = await sandbox.__testExports._requestAiScanEndpoint(
      { base64Data: 'data:image/jpeg;base64,AAA', apiKey: 'LEAK_CHECK', extractedText: '' },
      'AIzaSyHeaderOnlyKey1234567890',
      'SHOP_SEC',
      'a@b.com'
    );
    assert.strictEqual(sentHeaders['x-gemini-api-key'], 'AIzaSyHeaderOnlyKey1234567890');
    assert.strictEqual(sentBody.apiKey, undefined, 'API key must travel in header only, not JSON body');
    assert.strictEqual(outcome.serverData.categories[0].items[0].name, 'Chai');

    let calls = 0;
    const fakeCanvas = {
      width: 2400,
      height: 1800,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: (_m, q) => {
        calls++;
        return calls < 5 ? 'X'.repeat(3500001) : `data:image/jpeg;base64,OK_${q}`;
      }
    };
    sandbox.document.createElement = () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toDataURL: (_m, q) => {
        calls++;
        return calls < 5 ? 'X'.repeat(3500001) : `data:image/jpeg;base64,SHRUNK_${q}`;
      }
    });
    const encoded = sandbox.__testExports._encodeCanvasForUpload(fakeCanvas, 0.82);
    assert.ok(encoded.length < 3400000 && encoded.includes('SHRUNK_'), 'Oversized image must shrink until under payload limit');
    assert.strictEqual(fakeCanvas.width, 0, 'Original canvas must release dimensions');
  });

  console.log('\n====================================================');
  console.log(`TOTAL: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
})();
