// scratch/e2e_server_fetch_mock.mjs
// Loaded via NODE_OPTIONS="--import <fileUrl>" when spawning isolated server.js for E2E tests.
// Ensures ZERO outbound network calls to live Google/Firebase/Resend/external hosts.

const originalFetch = globalThis.fetch.bind(globalThis);

const DETERMINISTIC_AI_MENU_JSON = {
  menu_categories: [
    {
      category_name: 'Snacks',
      items: [
        { item_name: 'Samosa', description: 'Crispy spiced potato samosa', price: 22, isVeg: true },
        { item_name: 'AI Truffle Fries', description: 'Crispy truffle parmesan fries', price: 145, isVeg: true }
      ]
    },
    {
      category_name: 'Beverages',
      items: [
        { item_name: 'AI Espresso', description: 'Rich single shot espresso', price: 110, isVeg: true }
      ]
    }
  ],
  gst_pricing_note: 'inclusive'
};

function isLocalHostname(hostname) {
  const h = (hostname || '').toLowerCase();
  return h === '127.0.0.1' || h === 'localhost' || h === '::1' || h === '[::1]';
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function extractRequestDetails(input, init) {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    const url = input.url;
    const method = (init && init.method) || input.method || 'GET';
    const headers = (init && init.headers) || input.headers;
    let body = init && init.body;
    if (body === undefined && method !== 'GET' && method !== 'HEAD') {
      try {
        body = await input.clone().arrayBuffer();
      } catch (_) {
        body = undefined;
      }
    }
    return { url, method, headers, body };
  }
  const url = input instanceof URL ? input.toString() : String(input);
  const method = (init && init.method) || 'GET';
  return { url, method, headers: init?.headers, body: init?.body };
}

globalThis.fetch = async function e2eMockFetch(input, init) {
  const { url, method, headers, body } = await extractRequestDetails(input, init);
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    // Relative or non-standard URL: pass through
    return originalFetch(input, init);
  }

  const host = parsed.hostname.toLowerCase();
  const relayHttp = (process.env.E2E_RELAY_HTTP || '').replace(/\/+$/, '');

  // 1. Allow loopback / local server traffic
  if (isLocalHostname(host)) {
    return originalFetch(input, init);
  }

  // 2. Rewrite Firestore REST v1 calls to Local E2E Firestore Relay
  if (host === 'firestore.googleapis.com') {
    if (!relayHttp) {
      throw new Error('[E2E FETCH MOCK] E2E_RELAY_HTTP env var is not set for Firestore redirect.');
    }
    const targetUrl = `${relayHttp}${parsed.pathname}${parsed.search}`;
    const forwardInit = {
      method,
      headers,
      ...(method !== 'GET' && method !== 'HEAD' && body !== undefined ? { body } : {})
    };
    if (init && init.signal) forwardInit.signal = init.signal;
    return originalFetch(targetUrl, forwardInit);
  }

  // 3. Stub Gemini Generative Language API
  if (host === 'generativelanguage.googleapis.com') {
    if (parsed.pathname.includes(':generateContent')) {
      return jsonResponse({
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: JSON.stringify(DETERMINISTIC_AI_MENU_JSON) }]
            },
            finishReason: 'STOP'
          }
        ],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 80, totalTokenCount: 180 }
      }, 200);
    }
    if (parsed.pathname.includes('/models')) {
      return jsonResponse({
        models: [
          {
            name: 'models/gemini-3.5-flash-lite',
            displayName: 'Gemini 3.5 Flash Lite (E2E Stub)',
            supportedGenerationMethods: ['generateContent']
          }
        ]
      }, 200);
    }
    return jsonResponse({ ok: true, stub: true }, 200);
  }

  // 4. Stub / block Firebase Identity Toolkit & Secure Token
  if (host === 'identitytoolkit.googleapis.com' || host === 'securetoken.googleapis.com') {
    return jsonResponse({
      error: {
        code: 403,
        message: 'E2E_BLOCKED_AUTH_PROVIDER',
        status: 'PERMISSION_DENIED'
      }
    }, 403);
  }

  // 5. Stub Resend Email API
  if (host === 'api.resend.com') {
    return jsonResponse({
      id: `e2e_stub_email_${Date.now()}`,
      stub: true
    }, 200);
  }

  // 6. Any unmocked external host MUST be logged and fail the test run
  const violation = {
    url: parsed.href,
    host,
    method,
    timestamp: new Date().toISOString()
  };
  console.error('[E2E FETCH MOCK] UNMOCKED EXTERNAL HOST BLOCKED:', JSON.stringify(violation));

  if (relayHttp) {
    try {
      await originalFetch(`${relayHttp}/__e2e/unmocked-server-fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(violation)
      });
    } catch (_) {}
  }

  throw new Error(`[E2E FETCH MOCK] Unmocked external host blocked: ${host} (${parsed.href})`);
};
