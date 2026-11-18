// scratch/e2e_cdp_harness.cjs
// Zero-live-Firebase E2E Test Harness for Billnaw Cafe POS:
// 1. Local E2E Firestore Relay (HTTP REST v1 + pure-Node RFC 6455 WebSocket RPC/push)
// 2. Isolated server.js lifecycle manager (snapshots & restores data/auth_store.json & data/ai-quota.json)
// 3. 3 isolated Headless Chrome CDP sessions (Admin, Cashier, Floor Server) with Fetch.enable ESM Firebase shims
// 4. Simulated Printer & Counter Harness (WebBluetooth GATT + window.print + #print-iframe + ThermalPrinterBridge spies)

const http = require('node:http');
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, execSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_E2E_PORT = Number(process.env.E2E_PORT || 5055);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---------------------------------------------------------------------------
// 1. Firestore REST Value <-> Plain JSON Converters (matches server/sync-service.js)
// ---------------------------------------------------------------------------
function firestoreValueToJson(val) {
  if (!val || typeof val !== 'object') return val;
  if ('nullValue' in val) return null;
  if ('booleanValue' in val) return val.booleanValue;
  if ('integerValue' in val) {
    const num = Number(val.integerValue);
    return Number.isSafeInteger(num) ? num : val.integerValue;
  }
  if ('doubleValue' in val) return val.doubleValue;
  if ('stringValue' in val) return val.stringValue;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(firestoreValueToJson);
  }
  if ('mapValue' in val) {
    const res = {};
    for (const [k, v] of Object.entries(val.mapValue.fields || {})) {
      res[k] = firestoreValueToJson(v);
    }
    return res;
  }
  return val;
}

function jsonToFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (Number.isNaN(val) || !Number.isFinite(val)) return { nullValue: null };
    if (Number.isInteger(val)) return { integerValue: String(val) };
    return { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map((v) => jsonToFirestoreValue(v)).filter((v) => v !== undefined)
      }
    };
  }
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = jsonToFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function jsonToFirestoreFields(obj) {
  const fields = {};
  if (!obj || typeof obj !== 'object') return fields;
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      fields[k] = jsonToFirestoreValue(v);
    }
  }
  return fields;
}

function deepClone(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

function setNestedPath(target, dotPath, value) {
  const parts = String(dotPath).split('.');
  let cur = target;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== 'object' || Array.isArray(cur[k])) {
      cur[k] = {};
    }
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
}

function getNestedPath(target, dotPath) {
  const parts = String(dotPath).split('.');
  let cur = target;
  for (const k of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function resolveSentinels(val, existingVal) {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    if (val.__e2eSentinel === 'serverTimestamp') {
      return new Date().toISOString();
    }
    if (val.__e2eSentinel === 'increment') {
      return (Number(existingVal) || 0) + Number(val.n || 0);
    }
    if (val.__e2eSentinel === 'arrayUnion') {
      const arr = Array.isArray(existingVal) ? [...existingVal] : [];
      for (const item of val.items || []) {
        if (!arr.some((x) => JSON.stringify(x) === JSON.stringify(item))) {
          arr.push(item);
        }
      }
      return arr;
    }
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      const prev = existingVal && typeof existingVal === 'object' ? existingVal[k] : undefined;
      out[k] = resolveSentinels(v, prev);
    }
    return out;
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveSentinels(item, undefined));
  }
  return val;
}

// ---------------------------------------------------------------------------
// 2. Pure Node RFC 6455 WebSocket Frame Codec
// ---------------------------------------------------------------------------
function encodeWsFrame(opcode, payloadBuf) {
  const payload = Buffer.isBuffer(payloadBuf) ? payloadBuf : Buffer.from(String(payloadBuf), 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function createWsConnection(socket, onMessage, onClose) {
  let buffer = Buffer.alloc(0);
  let fragmentedChunks = [];
  let fragmentedOpcode = null;
  let closed = false;

  const conn = {
    sendText(str) {
      if (closed || socket.destroyed) return;
      try {
        socket.write(encodeWsFrame(0x1, Buffer.from(str, 'utf8')));
      } catch (_) {}
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
        socket.end();
      } catch (_) {}
    }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 2) {
      const b0 = buffer[0];
      const b1 = buffer[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buffer.length < 4) return;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buffer.length < 10) return;
        const bigLen = buffer.readBigUInt64BE(2);
        payloadLen = Number(bigLen);
        offset = 10;
      }

      const maskOffset = offset;
      if (masked) offset += 4;
      if (buffer.length < offset + payloadLen) return;

      let payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
      if (masked) {
        const mask = buffer.subarray(maskOffset, maskOffset + 4);
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= mask[i % 4];
        }
      }

      buffer = buffer.subarray(offset + payloadLen);

      if (opcode === 0x8) {
        closed = true;
        try {
          socket.write(encodeWsFrame(0x8, Buffer.alloc(0)));
          socket.end();
        } catch (_) {}
        onClose();
        return;
      }
      if (opcode === 0x9) {
        // Ping -> Pong
        try {
          socket.write(encodeWsFrame(0xA, payload));
        } catch (_) {}
        continue;
      }
      if (opcode === 0xA) {
        continue;
      }

      if (opcode === 0x1 || opcode === 0x2) {
        fragmentedOpcode = opcode;
        fragmentedChunks = [payload];
      } else if (opcode === 0x0) {
        fragmentedChunks.push(payload);
      }

      if (fin && fragmentedChunks.length > 0) {
        const full = Buffer.concat(fragmentedChunks);
        const msgOpcode = fragmentedOpcode;
        fragmentedChunks = [];
        fragmentedOpcode = null;
        if (msgOpcode === 0x1) {
          onMessage(full.toString('utf8'));
        }
      }
    }
  });

  socket.on('close', () => {
    if (!closed) {
      closed = true;
      onClose();
    }
  });
  socket.on('error', () => {
    if (!closed) {
      closed = true;
      onClose();
    }
  });

  return conn;
}

// ---------------------------------------------------------------------------
// 3. Local E2E Firestore Relay (REST v1 + WebSocket RPC & Push)
// ---------------------------------------------------------------------------
async function createFirestoreRelay() {
  const docs = new Map(); // path -> { data, createTime, updateTime }
  const subscribers = new Map(); // subId -> { conn, subId, path, isCollection, filters, orderBys, limitCount }
  const wsClients = new Set();
  const unmockedServerCalls = [];

  // Global transaction mutex queue
  let txnQueue = Promise.resolve();
  let activeTxnToken = null;
  let activeTxnRelease = null;
  let activeTxnTimer = null;

  function acquireTxnLock(ownerConn) {
    const prev = txnQueue;
    let release;
    txnQueue = new Promise((r) => {
      release = r;
    });
    return prev.then(() => {
      const token = 'txn_' + crypto.randomBytes(8).toString('hex');
      activeTxnToken = token;
      activeTxnRelease = () => {
        if (activeTxnTimer) {
          clearTimeout(activeTxnTimer);
          activeTxnTimer = null;
        }
        if (activeTxnToken === token) {
          activeTxnToken = null;
          activeTxnRelease = null;
          release();
        }
      };
      // Safety auto-release after 5s
      activeTxnTimer = setTimeout(() => {
        if (activeTxnRelease) activeTxnRelease();
      }, 5000);
      return token;
    });
  }

  function releaseTxnLock(token) {
    if (activeTxnToken === token && activeTxnRelease) {
      activeTxnRelease();
    }
  }

  function normalizePath(p) {
    return String(p || '').replace(/^\/+|\/+$/g, '');
  }

  function matchesFilter(docData, filter) {
    const val = getNestedPath(docData, filter.field);
    const target = filter.value;
    switch (filter.op) {
      case '==': return val === target;
      case '!=': return val !== target;
      case '>=': return val >= target;
      case '<=': return val <= target;
      case '>': return val > target;
      case '<': return val < target;
      case 'in': return Array.isArray(target) && target.includes(val);
      case 'array-contains': return Array.isArray(val) && val.includes(target);
      default: return true;
    }
  }

  function queryCollection(colPath, filters = [], orderBys = [], limitCount = null) {
    const norm = normalizePath(colPath);
    const prefix = norm + '/';
    const results = [];
    for (const [key, entry] of docs.entries()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes('/')) {
          const data = deepClone(entry.data);
          let pass = true;
          for (const f of filters || []) {
            if (!matchesFilter(data, f)) {
              pass = false;
              break;
            }
          }
          if (pass) {
            results.push({ id: rest, path: key, data });
          }
        }
      }
    }
    if (Array.isArray(orderBys) && orderBys.length > 0) {
      results.sort((a, b) => {
        for (const ob of orderBys) {
          const va = getNestedPath(a.data, ob.field);
          const vb = getNestedPath(b.data, ob.field);
          if (va === vb) continue;
          const cmp = va < vb ? -1 : 1;
          return ob.dir === 'desc' ? -cmp : cmp;
        }
        return 0;
      });
    }
    if (typeof limitCount === 'number' && limitCount > 0) {
      return results.slice(0, limitCount);
    }
    return results;
  }

  function buildSnapshotPayload(sub) {
    if (!sub.isCollection) {
      const entry = docs.get(sub.path);
      return {
        type: 'snapshot',
        subId: sub.subId,
        path: sub.path,
        isCollection: false,
        doc: entry
          ? { exists: true, id: sub.path.split('/').pop(), path: sub.path, data: deepClone(entry.data) }
          : { exists: false, id: sub.path.split('/').pop(), path: sub.path, data: null }
      };
    }
    const matched = queryCollection(sub.path, sub.filters, sub.orderBys, sub.limitCount);
    return {
      type: 'snapshot',
      subId: sub.subId,
      path: sub.path,
      isCollection: true,
      docs: matched
    };
  }

  function notifySubscribers(changedPath) {
    const norm = normalizePath(changedPath);
    for (const sub of subscribers.values()) {
      let matches = false;
      if (!sub.isCollection) {
        matches = (sub.path === norm);
      } else {
        const prefix = sub.path + '/';
        matches = norm.startsWith(prefix) && !norm.slice(prefix.length).includes('/');
      }
      if (matches) {
        sub.conn.sendText(JSON.stringify(buildSnapshotPayload(sub)));
      }
    }
  }

  function applySetDoc(docPath, rawData, merge = false) {
    const norm = normalizePath(docPath);
    const now = new Date().toISOString();
    const existing = docs.get(norm);
    const prevData = existing ? deepClone(existing.data) : {};
    const resolved = resolveSentinels(rawData || {}, merge ? prevData : {});
    const nextData = merge ? { ...prevData, ...resolved } : resolved;
    docs.set(norm, {
      data: deepClone(nextData),
      createTime: existing ? existing.createTime : now,
      updateTime: now
    });
    notifySubscribers(norm);
    return nextData;
  }

  function applyUpdateDoc(docPath, rawUpdates) {
    const norm = normalizePath(docPath);
    const now = new Date().toISOString();
    const existing = docs.get(norm);
    const nextData = existing ? deepClone(existing.data) : {};
    for (const [k, v] of Object.entries(rawUpdates || {})) {
      const prevFieldVal = getNestedPath(nextData, k);
      const resolved = resolveSentinels(v, prevFieldVal);
      setNestedPath(nextData, k, resolved);
    }
    docs.set(norm, {
      data: deepClone(nextData),
      createTime: existing ? existing.createTime : now,
      updateTime: now
    });
    notifySubscribers(norm);
    return nextData;
  }

  function applyDeleteDoc(docPath) {
    const norm = normalizePath(docPath);
    const existed = docs.delete(norm);
    if (existed) {
      notifySubscribers(norm);
    }
    return true;
  }

  function readRequestBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, 'http://127.0.0.1');
      const pathname = parsedUrl.pathname;

      if (req.method === 'POST' && pathname === '/__e2e/unmocked-server-fetch') {
        const raw = await readRequestBody(req);
        try {
          unmockedServerCalls.push(JSON.parse(raw));
        } catch (_) {
          unmockedServerCalls.push({ url: raw });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Match Firestore REST v1: /v1/projects/:projectId/databases/:dbId/documents/<path>
      const docMatch = pathname.match(/^\/v1\/projects\/[^/]+\/databases\/[^/]+\/documents\/(.+)$/);
      if (!docMatch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 404, message: 'Unknown relay path: ' + pathname } }));
        return;
      }

      const docPath = normalizePath(decodeURIComponent(docMatch[1]));

      if (req.method === 'GET') {
        const entry = docs.get(docPath);
        if (!entry) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { code: 404, message: 'Document not found', status: 'NOT_FOUND' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: `projects/e2e/databases/e2e/documents/${docPath}`,
          fields: jsonToFirestoreFields(entry.data),
          createTime: entry.createTime,
          updateTime: entry.updateTime
        }));
        return;
      }

      if (req.method === 'PATCH') {
        const rawBody = await readRequestBody(req);
        const bodyJson = rawBody ? JSON.parse(rawBody) : {};
        const incomingFields = {};
        for (const [k, v] of Object.entries(bodyJson.fields || {})) {
          incomingFields[k] = firestoreValueToJson(v);
        }

        const maskPaths = parsedUrl.searchParams.getAll('updateMask.fieldPaths');
        const now = new Date().toISOString();
        const existing = docs.get(docPath);
        let nextData;

        if (maskPaths.length > 0) {
          nextData = existing ? deepClone(existing.data) : {};
          for (const fieldPath of maskPaths) {
            const val = getNestedPath(incomingFields, fieldPath);
            if (val !== undefined) {
              setNestedPath(nextData, fieldPath, val);
            }
          }
        } else {
          nextData = incomingFields;
        }

        docs.set(docPath, {
          data: deepClone(nextData),
          createTime: existing ? existing.createTime : now,
          updateTime: now
        });
        notifySubscribers(docPath);

        const stored = docs.get(docPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          name: `projects/e2e/databases/e2e/documents/${docPath}`,
          fields: jsonToFirestoreFields(stored.data),
          createTime: stored.createTime,
          updateTime: stored.updateTime
        }));
        return;
      }

      if (req.method === 'DELETE') {
        applyDeleteDoc(docPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({}));
        return;
      }

      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 405, message: 'Method not allowed' } }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 500, message: err.message } }));
    }
  });

  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }
    const accept = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47D6-96C6-7AB38B0D5C85')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    let heldLockToken = null;
    let conn;
    conn = createWsConnection(
      socket,
      async (rawMsg) => {
        let msg;
        try {
          msg = JSON.parse(rawMsg);
        } catch (_) {
          return;
        }
        const { id, op } = msg;
        try {
          let result = null;
          if (op === 'getDoc') {
            const p = normalizePath(msg.path);
            const entry = docs.get(p);
            result = entry
              ? { exists: true, id: p.split('/').pop(), path: p, data: deepClone(entry.data) }
              : { exists: false, id: p.split('/').pop(), path: p, data: null };
          } else if (op === 'getDocs') {
            result = { docs: queryCollection(msg.path, msg.filters, msg.orderBys, msg.limitCount) };
          } else if (op === 'setDoc') {
            applySetDoc(msg.path, msg.data, Boolean(msg.merge));
            result = true;
          } else if (op === 'updateDoc') {
            applyUpdateDoc(msg.path, msg.data);
            result = true;
          } else if (op === 'deleteDoc') {
            applyDeleteDoc(msg.path);
            result = true;
          } else if (op === 'writeBatch') {
            for (const item of msg.ops || []) {
              if (item.type === 'set') applySetDoc(item.path, item.data, Boolean(item.merge));
              else if (item.type === 'update') applyUpdateDoc(item.path, item.data);
              else if (item.type === 'delete') applyDeleteDoc(item.path);
            }
            result = true;
          } else if (op === 'txnLock') {
            heldLockToken = await acquireTxnLock(conn);
            result = { token: heldLockToken };
          } else if (op === 'txnRelease') {
            if (heldLockToken === msg.token) heldLockToken = null;
            releaseTxnLock(msg.token);
            result = true;
          } else if (op === 'subscribe') {
            const sub = {
              conn,
              subId: msg.subId,
              path: normalizePath(msg.path),
              isCollection: Boolean(msg.isCollection),
              filters: msg.filters || [],
              orderBys: msg.orderBys || [],
              limitCount: msg.limitCount || null
            };
            subscribers.set(msg.subId, sub);
            if (id !== undefined) {
              conn.sendText(JSON.stringify({ id, ok: true, result: true }));
            }
            // Emit initial snapshot
            conn.sendText(JSON.stringify(buildSnapshotPayload(sub)));
            return;
          } else if (op === 'unsubscribe') {
            subscribers.delete(msg.subId);
            result = true;
          }
          if (id !== undefined) {
            conn.sendText(JSON.stringify({ id, ok: true, result }));
          }
        } catch (err) {
          if (id !== undefined) {
            conn.sendText(JSON.stringify({ id, ok: false, error: err.message }));
          }
        }
      },
      () => {
        wsClients.delete(conn);
        for (const [sid, sub] of subscribers.entries()) {
          if (sub.conn === conn) subscribers.delete(sid);
        }
        if (heldLockToken) {
          releaseTxnLock(heldLockToken);
          heldLockToken = null;
        }
      }
    );
    wsClients.add(conn);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = server.address().port;
  return {
    port,
    httpUrl: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    unmockedServerCalls,
    getDoc(p) {
      const e = docs.get(normalizePath(p));
      return e ? deepClone(e.data) : null;
    },
    setDoc(p, data, merge = false) {
      return applySetDoc(p, data, merge);
    },
    deleteDoc(p) {
      return applyDeleteDoc(p);
    },
    getCollection(colPath) {
      return queryCollection(colPath);
    },
    listPaths() {
      return Array.from(docs.keys());
    },
    clear() {
      docs.clear();
    },
    async close() {
      for (const c of wsClients) c.close();
      wsClients.clear();
      subscribers.clear();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  };
}

// ---------------------------------------------------------------------------
// 4. Local ESM Firebase Shims (served via CDP Fetch.fulfillRequest)
// ---------------------------------------------------------------------------
function buildFirebaseAppShim() {
  return `
export function initializeApp(config) {
  return { name: '[DEFAULT]', options: config || {} };
}
export function getApp() {
  return { name: '[DEFAULT]' };
}
export function getApps() {
  return [{ name: '[DEFAULT]' }];
}
`;
}

function buildFirebaseAuthShim() {
  return `
export const browserLocalPersistence = { type: 'LOCAL' };
export function getAuth(app) {
  return { app, currentUser: null, _listeners: new Set() };
}
export async function setPersistence(auth, persistence) {
  return;
}
export async function signInWithCustomToken(auth, token) {
  let email = 'owner@billnawcafe.com';
  try {
    email = localStorage.getItem('billnaw_auth_email') || email;
  } catch (_) {}
  auth.currentUser = { uid: 'e2e_uid', email };
  auth._listeners.forEach((cb) => {
    try { cb(auth.currentUser); } catch (_) {}
  });
  return { user: auth.currentUser };
}
export function onAuthStateChanged(auth, cb) {
  auth._listeners.add(cb);
  queueMicrotask(() => {
    try { cb(auth.currentUser); } catch (_) {}
  });
  return () => auth._listeners.delete(cb);
}
export async function signOut(auth) {
  auth.currentUser = null;
  auth._listeners.forEach((cb) => {
    try { cb(null); } catch (_) {}
  });
}
`;
}

function buildFirebaseFirestoreShim(relayWsUrl) {
  return `
const RELAY_WS_URL = ${JSON.stringify(relayWsUrl)};
let _ws = null;
let _wsConnectPromise = null;
let _rpcId = 1;
let _subSeq = 1;
const _pending = new Map();
const _subs = new Map(); // subId -> { onNext, onError, isCollection, path, filters, orderBys, limitCount }

function ensureSocket() {
  if (_ws && _ws.readyState === WebSocket.OPEN) return Promise.resolve(_ws);
  if (_wsConnectPromise) return _wsConnectPromise;
  _wsConnectPromise = new Promise((resolve, reject) => {
    const ws = new WebSocket(RELAY_WS_URL);
    ws.onopen = () => {
      _ws = ws;
      _wsConnectPromise = null;
      // Re-subscribe any active listeners after reconnect
      for (const [subId, entry] of _subs.entries()) {
        ws.send(JSON.stringify({
          op: 'subscribe',
          subId,
          path: entry.path,
          isCollection: entry.isCollection,
          filters: entry.filters,
          orderBys: entry.orderBys,
          limitCount: entry.limitCount
        }));
      }
      resolve(ws);
    };
    ws.onerror = (err) => {
      _wsConnectPromise = null;
      reject(new Error('Relay WebSocket error'));
    };
    ws.onclose = () => {
      if (_ws === ws) _ws = null;
      _wsConnectPromise = null;
      for (const [, p] of _pending.entries()) {
        p.reject(new Error('Relay WebSocket closed'));
      }
      _pending.clear();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (msg.id !== undefined && _pending.has(msg.id)) {
        const p = _pending.get(msg.id);
        _pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || 'Relay RPC failed'));
        return;
      }
      if (msg.type === 'snapshot' && msg.subId && _subs.has(msg.subId)) {
        const entry = _subs.get(msg.subId);
        try {
          if (!msg.isCollection) {
            const d = msg.doc;
            entry.onNext({
              exists: () => Boolean(d && d.exists),
              id: d ? d.id : entry.path.split('/').pop(),
              data: () => (d && d.data ? JSON.parse(JSON.stringify(d.data)) : undefined),
              metadata: { fromCache: false, hasPendingWrites: false }
            });
          } else {
            const docSnaps = (msg.docs || []).map((d) => ({
              exists: () => true,
              id: d.id,
              data: () => JSON.parse(JSON.stringify(d.data)),
              metadata: { fromCache: false, hasPendingWrites: false }
            }));
            entry.onNext({
              empty: docSnaps.length === 0,
              size: docSnaps.length,
              docs: docSnaps,
              forEach: (cb) => docSnaps.forEach(cb),
              metadata: { fromCache: false, hasPendingWrites: false }
            });
          }
        } catch (cbErr) {
          console.warn('[E2E Firestore Shim] Snapshot callback error:', cbErr);
        }
      }
    };
  });
  return _wsConnectPromise;
}

async function rpc(op, payload = {}) {
  const ws = await ensureSocket();
  const id = _rpcId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (_pending.has(id)) {
        _pending.delete(id);
        reject(new Error('Relay RPC timeout for ' + op));
      }
    }, 15000);
    _pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); }
    });
    ws.send(JSON.stringify({ id, op, ...payload }));
  });
}

function cleanSegments(segments) {
  return segments
    .filter((s) => s !== undefined && s !== null && String(s) !== '')
    .flatMap((s) => String(s).split('/'))
    .filter(Boolean);
}

export function getFirestore(app, dbId) {
  ensureSocket().catch(() => {});
  return { _type: 'firestore', app, dbId: dbId || '(default)' };
}
export function initializeFirestore(app, settings, dbId) {
  return getFirestore(app, dbId);
}
export function persistentLocalCache(opts) { return { _type: 'cache', opts }; }
export function persistentMultipleTabManager() { return { _type: 'tabManager' }; }
export async function enableIndexedDbPersistence(db) { return; }

export function doc(parent, ...segments) {
  if (parent && parent._type === 'collection' && segments.length === 0) {
    const autoId = 'auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const fullPath = parent.path + '/' + autoId;
    return { _type: 'doc', path: fullPath, id: autoId };
  }
  const baseParts = parent && parent.path ? cleanSegments([parent.path]) : [];
  const segParts = cleanSegments(segments);
  const fullPath = [...baseParts, ...segParts].join('/');
  const id = fullPath.split('/').pop() || '';
  return { _type: 'doc', path: fullPath, id };
}

export function collection(parent, ...segments) {
  const baseParts = parent && parent.path ? cleanSegments([parent.path]) : [];
  const segParts = cleanSegments(segments);
  const fullPath = [...baseParts, ...segParts].join('/');
  return { _type: 'collection', path: fullPath, id: fullPath.split('/').pop() || '' };
}

export function where(field, op, value) {
  return { _type: 'where', field, op, value };
}
export function orderBy(field, dir = 'asc') {
  return { _type: 'orderBy', field, dir };
}
export function limit(n) {
  return { _type: 'limit', n };
}
export function startAfter(...vals) {
  return { _type: 'startAfter', vals };
}

export function query(target, ...constraints) {
  const base = target._type === 'query'
    ? { ...target, filters: [...target.filters], orderBys: [...target.orderBys] }
    : { _type: 'query', path: target.path, filters: [], orderBys: [], limitCount: null };
  for (const c of constraints) {
    if (!c) continue;
    if (c._type === 'where') base.filters.push({ field: c.field, op: c.op, value: c.value });
    else if (c._type === 'orderBy') base.orderBys.push({ field: c.field, dir: c.dir });
    else if (c._type === 'limit') base.limitCount = c.n;
  }
  return base;
}

export function serverTimestamp() { return { __e2eSentinel: 'serverTimestamp' }; }
export function increment(n) { return { __e2eSentinel: 'increment', n }; }
export function arrayUnion(...items) { return { __e2eSentinel: 'arrayUnion', items }; }
export const Timestamp = {
  now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
  fromDate: (d) => ({ toDate: () => d, toMillis: () => d.getTime() })
};

export async function getDoc(docRef) {
  const d = await rpc('getDoc', { path: docRef.path });
  return {
    exists: () => Boolean(d && d.exists),
    id: d ? d.id : docRef.id,
    data: () => (d && d.data ? JSON.parse(JSON.stringify(d.data)) : undefined),
    metadata: { fromCache: false, hasPendingWrites: false }
  };
}

export async function getDocs(target) {
  const path = target.path;
  const filters = target._type === 'query' ? target.filters : [];
  const orderBys = target._type === 'query' ? target.orderBys : [];
  const limitCount = target._type === 'query' ? target.limitCount : null;
  const res = await rpc('getDocs', { path, filters, orderBys, limitCount });
  const docSnaps = (res.docs || []).map((d) => ({
    exists: () => true,
    id: d.id,
    data: () => JSON.parse(JSON.stringify(d.data)),
    metadata: { fromCache: false, hasPendingWrites: false }
  }));
  return {
    empty: docSnaps.length === 0,
    size: docSnaps.length,
    docs: docSnaps,
    forEach: (cb) => docSnaps.forEach(cb),
    metadata: { fromCache: false, hasPendingWrites: false }
  };
}

export async function setDoc(docRef, data, options = {}) {
  await rpc('setDoc', { path: docRef.path, data, merge: Boolean(options && options.merge) });
}

export async function updateDoc(docRef, data) {
  await rpc('updateDoc', { path: docRef.path, data });
}

export async function deleteDoc(docRef) {
  await rpc('deleteDoc', { path: docRef.path });
}

export function writeBatch(db) {
  const ops = [];
  return {
    set(docRef, data, options) {
      ops.push({ type: 'set', path: docRef.path, data, merge: Boolean(options && options.merge) });
    },
    update(docRef, data) {
      ops.push({ type: 'update', path: docRef.path, data });
    },
    delete(docRef) {
      ops.push({ type: 'delete', path: docRef.path });
    },
    async commit() {
      await rpc('writeBatch', { ops });
    }
  };
}

export async function runTransaction(db, updateFn) {
  const lock = await rpc('txnLock', {});
  const token = lock.token;
  const bufferedOps = [];
  const txn = {
    async get(docRef) {
      return await getDoc(docRef);
    },
    set(docRef, data, options) {
      bufferedOps.push({ type: 'set', path: docRef.path, data, merge: Boolean(options && options.merge) });
    },
    update(docRef, data) {
      bufferedOps.push({ type: 'update', path: docRef.path, data });
    },
    delete(docRef) {
      bufferedOps.push({ type: 'delete', path: docRef.path });
    }
  };
  try {
    const out = await updateFn(txn);
    if (bufferedOps.length > 0) {
      await rpc('writeBatch', { ops: bufferedOps });
    }
    return out;
  } finally {
    await rpc('txnRelease', { token }).catch(() => {});
  }
}

export function onSnapshot(target, arg2, arg3, arg4) {
  let onNext = arg2;
  let onError = arg3;
  if (typeof arg2 === 'object' && arg2 !== null && typeof arg3 === 'function') {
    onNext = arg3;
    onError = arg4;
  }
  const subId = 'sub_' + (_subSeq++) + '_' + Math.random().toString(36).slice(2, 6);
  const isCollection = target._type === 'collection' || target._type === 'query';
  const filters = target._type === 'query' ? target.filters : [];
  const orderBys = target._type === 'query' ? target.orderBys : [];
  const limitCount = target._type === 'query' ? target.limitCount : null;

  _subs.set(subId, {
    onNext,
    onError,
    path: target.path,
    isCollection,
    filters,
    orderBys,
    limitCount
  });

  rpc('subscribe', {
    subId,
    path: target.path,
    isCollection,
    filters,
    orderBys,
    limitCount
  }).catch((err) => {
    if (typeof onError === 'function') onError(err);
  });

  return () => {
    _subs.delete(subId);
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      rpc('unsubscribe', { subId }).catch(() => {});
    }
  };
}
`;
}

// ---------------------------------------------------------------------------
// 5. Simulated Printer & Counter Harness (Page.addScriptToEvaluateOnNewDocument)
// ---------------------------------------------------------------------------
function buildNewDocumentInitScript() {
  return `
(() => {
  if (window.__e2eInitInstalled) return;
  window.__e2eInitInstalled = true;

  // A. Neutralize Service Worker controllerchange auto-reloads
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
      const origSwAdd = navigator.serviceWorker.addEventListener.bind(navigator.serviceWorker);
      navigator.serviceWorker.addEventListener = function(type, fn, opts) {
        if (type === 'controllerchange') return;
        return origSwAdd(type, fn, opts);
      };
    }
  } catch (_) {}

  // A2. Capture devOtp from /api/auth/send-otp responses (simulates test email inbox)
  try {
    const origWinFetch = window.fetch.bind(window);
    window.__e2eLastDevOtp = null;
    window.fetch = async function e2eFetchSpy(input, init) {
      const res = await origWinFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.includes('/api/auth/send-otp')) {
          res.clone().json().then((d) => {
            if (d && d.devOtp) window.__e2eLastDevOtp = String(d.devOtp);
          }).catch(() => {});
        }
      } catch (_) {}
      return res;
    };
  } catch (_) {}

  // B. Simulated Printer & Counter Harness State
  const BLE_PRINTER_SERVICE_UUIDS = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb'
  ];

  const state = {
    rawChunks: [],      // { slot, deviceName, bytes: number[], timestamp }
    escPosJobs: [],     // { slot, deviceName, bytes: number[], text, isKot, isReceipt, timestamp }
    htmlPrintJobs: [],  // { source, iframeId, title, html, receiptHtml, kotHtml, timestamp }
    bridgeCalls: [],    // { method, role, jobId, slot, isKot, kotId, tableNo, timestamp }
    downloads: [],      // { filename, href, textPreview, timestamp }
    disconnectedSlots: { printer1: false, printer2: false },
    nextDeviceSlot: null,
    autoSlotSeq: 0,
    devicesBySlot: {}
  };

  function decodeEscPosBytes(byteArr) {
    const bytes = new Uint8Array(byteArr);
    let raw = '';
    try {
      raw = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch (_) {
      for (let i = 0; i < bytes.length; i++) raw += String.fromCharCode(bytes[i]);
    }
    // Strip common ESC/POS control sequences while keeping readable lines
    return raw
      .replace(/\\x1B@/g, '')
      .replace(/\\x1Ba[\\x00-\\x02]/g, '')
      .replace(/\\x1BE[\\x00-\\x01]/g, '')
      .replace(/\\x1D![\\x00-\\xFF]/g, '')
      .replace(/\\x1DV[\\x00-\\xFF]{1,2}/g, '')
      .replace(/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/g, '');
  }

  function recordChunk(slot, deviceName, valueView) {
    const u8 = valueView instanceof Uint8Array
      ? valueView
      : (ArrayBuffer.isView(valueView)
        ? new Uint8Array(valueView.buffer, valueView.byteOffset, valueView.byteLength)
        : new Uint8Array(valueView));
    const arr = Array.from(u8);
    const ts = Date.now();
    state.rawChunks.push({ slot, deviceName, bytes: arr, timestamp: ts });

    const startsNewJob = (arr.length >= 2 && arr[0] === 0x1B && arr[1] === 0x40);
    let lastJob = null;
    for (let i = state.escPosJobs.length - 1; i >= 0; i--) {
      if (state.escPosJobs[i].slot === slot) {
        lastJob = state.escPosJobs[i];
        break;
      }
    }

    if (startsNewJob || !lastJob) {
      const job = {
        slot,
        deviceName,
        bytes: [...arr],
        text: '',
        isKot: false,
        isReceipt: false,
        timestamp: ts
      };
      job.text = decodeEscPosBytes(job.bytes);
      job.isKot = /KITCHEN TICKET|ADD-ON KOT|END OF KOT|KOT #/i.test(job.text);
      job.isReceipt = /TAX INVOICE|RETAIL INVOICE|TOTAL:|Bill #/i.test(job.text) && !job.isKot;
      state.escPosJobs.push(job);
    } else {
      lastJob.bytes.push(...arr);
      lastJob.text = decodeEscPosBytes(lastJob.bytes);
      lastJob.isKot = /KITCHEN TICKET|ADD-ON KOT|END OF KOT|KOT #/i.test(lastJob.text);
      lastJob.isReceipt = /TAX INVOICE|RETAIL INVOICE|TOTAL:|Bill #/i.test(lastJob.text) && !lastJob.isKot;
    }
  }

  function createSimBluetoothDevice(slot) {
    const deviceName = slot === 'printer2' ? 'SimKitchen-BT-02' : 'SimReceipt-BT-01';
    const deviceId = slot === 'printer2' ? 'sim-ble-printer-2' : 'sim-ble-printer-1';
    const disconnectListeners = new Set();

    const charObj = {
      uuid: '00002af1-0000-1000-8000-00805f9b34fb',
      properties: {
        write: true,
        writeWithoutResponse: true,
        writeWithResponse: true,
        read: false,
        notify: false
      },
      async writeValueWithoutResponse(data) {
        if (state.disconnectedSlots[slot]) {
          throw new Error('GATT Server is disconnected. Cannot writeWithoutResponse.');
        }
        recordChunk(slot, deviceName, data);
      },
      async writeValue(data) {
        if (state.disconnectedSlots[slot]) {
          throw new Error('GATT Server is disconnected. Cannot writeValue.');
        }
        recordChunk(slot, deviceName, data);
      },
      async writeValueWithResponse(data) {
        if (state.disconnectedSlots[slot]) {
          throw new Error('GATT Server is disconnected. Cannot writeValueWithResponse.');
        }
        recordChunk(slot, deviceName, data);
      }
    };

    const services = BLE_PRINTER_SERVICE_UUIDS.map((uuid) => ({
      uuid,
      isPrimary: true,
      async getCharacteristics() {
        return [charObj];
      },
      async getCharacteristic() {
        return charObj;
      }
    }));

    const gattServer = {
      get connected() {
        return !state.disconnectedSlots[slot];
      },
      async connect() {
        if (state.disconnectedSlots[slot]) {
          throw new Error('Simulated printer ' + deviceName + ' is disconnected');
        }
        return gattServer;
      },
      disconnect() {
        state.disconnectedSlots[slot] = true;
        disconnectListeners.forEach((fn) => {
          try { fn({ target: deviceObj, type: 'gattserverdisconnected' }); } catch (_) {}
        });
      },
      async getPrimaryServices() {
        return services;
      },
      async getPrimaryService(uuid) {
        const match = services.find((s) => s.uuid.toLowerCase() === String(uuid).toLowerCase());
        return match || services[0];
      }
    };

    const deviceObj = {
      id: deviceId,
      name: deviceName,
      gatt: gattServer,
      addEventListener(type, fn) {
        if (type === 'gattserverdisconnected' && typeof fn === 'function') {
          disconnectListeners.add(fn);
        }
      },
      removeEventListener(type, fn) {
        if (type === 'gattserverdisconnected') disconnectListeners.delete(fn);
      },
      _triggerDisconnect() {
        disconnectListeners.forEach((fn) => {
          try { fn({ target: deviceObj, type: 'gattserverdisconnected' }); } catch (_) {}
        });
      }
    };

    state.devicesBySlot[slot] = deviceObj;
    return deviceObj;
  }

  const mockBluetooth = {
    async requestDevice(opts) {
      let slot = state.nextDeviceSlot;
      state.nextDeviceSlot = null;
      if (!slot) {
        slot = (state.autoSlotSeq % 2 === 0) ? 'printer1' : 'printer2';
        state.autoSlotSeq++;
      }
      if (state.disconnectedSlots[slot]) {
        throw Object.assign(new Error('Simulated device unavailable'), { name: 'NotFoundError' });
      }
      return createSimBluetoothDevice(slot);
    }
  };

  try {
    Object.defineProperty(Navigator.prototype, 'bluetooth', {
      configurable: true,
      get() { return mockBluetooth; }
    });
  } catch (_) {
    try {
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: mockBluetooth
      });
    } catch (__) {}
  }

  // C. Non-blocking window.print & #print-iframe HTML Print Capture
  function recordHtmlPrint(info) {
    state.htmlPrintJobs.push({
      ...info,
      timestamp: Date.now()
    });
  }

  window.print = function e2eMockWindowPrint() {
    recordHtmlPrint({
      source: 'window.print',
      iframeId: '',
      title: document.title || '',
      html: document.body ? document.body.innerHTML : '',
      receiptHtml: document.getElementById('print-receipt')?.innerHTML || '',
      kotHtml: document.getElementById('print-kot')?.innerHTML || ''
    });
  };

  function hookIframeWindowPrint(iframeEl, cw) {
    if (!cw || cw === window) return;
    try {
      cw.focus = () => {};
      cw.print = function e2eIframePrint() {
        recordHtmlPrint({
          source: 'iframe.contentWindow.print',
          iframeId: iframeEl ? (iframeEl.id || '') : 'print-iframe',
          title: (cw.document && cw.document.title) || '',
          html: (cw.document && cw.document.body && cw.document.body.innerHTML) || '',
          receiptHtml: document.getElementById('print-receipt')?.innerHTML || '',
          kotHtml: document.getElementById('print-kot')?.innerHTML || ''
        });
      };
    } catch (_) {}
  }

  try {
    const origContentWindowDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
      configurable: true,
      get() {
        const cw = origContentWindowDesc.get.call(this);
        hookIframeWindowPrint(this, cw);
        return cw;
      }
    });
    const origDocClose = Document.prototype.close;
    Document.prototype.close = function e2eDocClose() {
      const res = origDocClose.apply(this, arguments);
      try {
        if (this !== document && this.defaultView && this.defaultView !== window) {
          hookIframeWindowPrint(this.defaultView.frameElement, this.defaultView);
        }
      } catch (_) {}
      return res;
    };
  } catch (_) {}

  // D. Capture <a download="..."> exports (Backup JSON, Sales CSV) without opening save dialogs
  try {
    const origAnchorClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function e2eAnchorClick() {
      if (this.hasAttribute('download') || this.download) {
        const href = this.getAttribute('href') || '';
        let preview = href;
        if (href.startsWith('data:')) {
          const commaIdx = href.indexOf(',');
          try { preview = decodeURIComponent(href.slice(commaIdx + 1)); } catch (_) {}
        }
        state.downloads.push({
          filename: this.getAttribute('download') || this.download || 'download',
          href,
          text: preview,
          timestamp: Date.now()
        });
        return;
      }
      return origAnchorClick.apply(this, arguments);
    };
    const origCreateObjUrl = URL.createObjectURL.bind(URL);
    const blobTextMap = new Map();
    URL.createObjectURL = function e2eCreateObjUrl(blob) {
      const u = origCreateObjUrl(blob);
      if (blob && typeof blob.text === 'function') {
        blob.text().then((txt) => {
          blobTextMap.set(u, txt);
          // Backfill any download captured synchronously before blob.text() resolved
          const match = state.downloads.find((d) => d.href === u);
          if (match) match.text = txt;
        }).catch(() => {});
      }
      return u;
    };
    window.__e2eGetBlobText = (u) => blobTextMap.get(u) || null;
  } catch (_) {}

  // E. Spy on ThermalPrinterBridge & pairPrinterSlot / enqueueCloudKotPrintJob
  function wrapBridge(bridge) {
    if (!bridge || bridge.__e2eSpied) return bridge;
    bridge.__e2eSpied = true;

    if (typeof bridge.connectBluetoothPrinter === 'function') {
      const origConn = bridge.connectBluetoothPrinter.bind(bridge);
      bridge.connectBluetoothPrinter = async function(slotKey = 'printer1', ...rest) {
        state.nextDeviceSlot = (slotKey === 'printer2') ? 'printer2' : 'printer1';
        return origConn(slotKey, ...rest);
      };
    }

    if (typeof bridge.routePrintJob === 'function') {
      const origRoute = bridge.routePrintJob.bind(bridge);
      bridge.routePrintJob = async function(jobPayload, options = {}) {
        const callRec = {
          method: 'routePrintJob',
          role: options.role || jobPayload?.jobType || null,
          kotId: jobPayload?.kotId || jobPayload?.kot_id || null,
          billNo: jobPayload?.billNo || jobPayload?.bill_no || null,
          tableNo: jobPayload?.tableNo || jobPayload?.table || null,
          isAddon: Boolean(jobPayload?.isAddon),
          timestamp: Date.now()
        };
        state.bridgeCalls.push(callRec);
        const res = await origRoute(jobPayload, options);
        callRec.result = res ? { success: res.success, method: res.data?.method, slot: res.data?.slot, printed: res.data?.printed } : null;
        return res;
      };
    }

    if (typeof bridge.enqueuePrintJob === 'function') {
      const origEnqueue = bridge.enqueuePrintJob.bind(bridge);
      bridge.enqueuePrintJob = async function(invoice, options = {}) {
        state.bridgeCalls.push({
          method: 'enqueuePrintJob',
          role: options.role || null,
          id: invoice?.id || null,
          billNo: invoice?.billNo || invoice?.bill_no || null,
          kotId: invoice?.kot_id || invoice?.kotId || null,
          printerSlot: options.printerSlot || 'printer1',
          textPreview: String(invoice?.textContent || '').slice(0, 120),
          timestamp: Date.now()
        });
        return origEnqueue(invoice, options);
      };
    }

    if (typeof bridge.enqueueCloudKotPrintJob === 'function') {
      const origCloud = bridge.enqueueCloudKotPrintJob.bind(bridge);
      bridge.enqueueCloudKotPrintJob = async function(jobPayload, options = {}) {
        state.bridgeCalls.push({
          method: 'enqueueCloudKotPrintJob',
          kotId: jobPayload?.kotId || jobPayload?.kot_id || null,
          tableNo: jobPayload?.tableNo || jobPayload?.table || null,
          shopId: options?.shopId || null,
          timestamp: Date.now()
        });
        return origCloud(jobPayload, options);
      };
    }
    return bridge;
  }

  let _tpb = null;
  Object.defineProperty(window, 'ThermalPrinterBridge', {
    configurable: true,
    enumerable: true,
    set(val) { _tpb = wrapBridge(val); },
    get() { return _tpb; }
  });

  let _origPairFn = null;
  Object.defineProperty(window, 'pairPrinterSlot', {
    configurable: true,
    enumerable: true,
    set(fn) {
      _origPairFn = async function wrappedPairPrinterSlot(slotKey = 'printer1', ...rest) {
        state.nextDeviceSlot = (slotKey === 'printer2') ? 'printer2' : 'printer1';
        return fn.call(this, slotKey, ...rest);
      };
    },
    get() { return _origPairFn; }
  });

  let _origCloudKotFn = null;
  Object.defineProperty(window, 'enqueueCloudKotPrintJob', {
    configurable: true,
    enumerable: true,
    set(fn) {
      _origCloudKotFn = async function wrappedEnqueueCloudKot(jobPayload, options = {}) {
        state.bridgeCalls.push({
          method: 'window.enqueueCloudKotPrintJob',
          kotId: jobPayload?.kotId || jobPayload?.kot_id || null,
          tableNo: jobPayload?.tableNo || jobPayload?.table || null,
          shopId: options?.shopId || null,
          timestamp: Date.now()
        });
        return fn.call(this, jobPayload, options);
      };
    },
    get() { return _origCloudKotFn; }
  });

  // Expose public harness API
  window.__e2ePrinterHarness = {
    getEscPosJobs(slot) {
      const list = slot ? state.escPosJobs.filter((j) => j.slot === slot) : state.escPosJobs;
      return JSON.parse(JSON.stringify(list));
    },
    getRawChunks(slot) {
      const list = slot ? state.rawChunks.filter((c) => c.slot === slot) : state.rawChunks;
      return JSON.parse(JSON.stringify(list));
    },
    getHtmlPrintJobs() {
      return JSON.parse(JSON.stringify(state.htmlPrintJobs));
    },
    getBridgeCalls() {
      return JSON.parse(JSON.stringify(state.bridgeCalls));
    },
    getDownloads() {
      return JSON.parse(JSON.stringify(state.downloads));
    },
    setNextDeviceSlot(slot) {
      state.nextDeviceSlot = slot;
    },
    setPrinterDisconnected(slot, disconnected = true) {
      const targetSlot = slot === 'printer2' ? 'printer2' : 'printer1';
      state.disconnectedSlots[targetSlot] = Boolean(disconnected);
      const dev = state.devicesBySlot[targetSlot];
      if (disconnected && dev && typeof dev._triggerDisconnect === 'function') {
        dev._triggerDisconnect();
      }
    },
    reset() {
      state.rawChunks = [];
      state.escPosJobs = [];
      state.htmlPrintJobs = [];
      state.bridgeCalls = [];
      state.downloads = [];
    }
  };
})();
`;
}

// ---------------------------------------------------------------------------
// 6. Chrome Discovery & Native Node 24 WebSocket CDP Client
// ---------------------------------------------------------------------------
function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null,
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('Chrome/Edge executable not found in standard Windows locations.');
}

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async init() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('CDP WebSocket failed to connect'));
    });

    this.ws.onclose = () => {
      for (const [id, { reject }] of this.callbacks.entries()) {
        reject(new Error(`CDP connection closed while waiting for #${id}`));
      }
      this.callbacks.clear();
    };

    this.ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (_) {
        return;
      }
      if (msg.id && this.callbacks.has(msg.id)) {
        const { resolve, reject } = this.callbacks.get(msg.id);
        this.callbacks.delete(msg.id);
        if (msg.error) {
          reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          resolve(msg.result);
        }
      } else if (msg.method && this.eventListeners.has(msg.method)) {
        for (const fn of this.eventListeners.get(msg.method)) {
          try { fn(msg.params); } catch (_) {}
        }
      }
    };
  }

  send(method, params = {}, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      const timer = setTimeout(() => {
        if (this.callbacks.has(msgId)) {
          this.callbacks.delete(msgId);
          reject(new Error(`CDP request #${msgId} (${method}) timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.callbacks.set(msgId, {
        resolve: (result) => { clearTimeout(timer); resolve(result); },
        reject: (err) => { clearTimeout(timer); reject(err); }
      });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  on(event, handler) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(handler);
  }

  async evaluate(expression, retries = 3) {
    const isAsync = /\basync\b|\bawait\b|\.then\(/.test(expression);
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await this.send('Runtime.evaluate', {
          expression,
          returnByValue: true,
          awaitPromise: true
        }, 20000);
        if (res.exceptionDetails) {
          const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
          throw new Error(`Runtime.evaluate Exception: ${desc}`);
        }
        return res.result ? res.result.value : null;
      } catch (err) {
        if (
          attempt < retries &&
          (err.message.includes('context') || err.message.includes('destroyed') || err.message.includes('Execution context'))
        ) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        throw err;
      }
    }
  }

  close() {
    try {
      if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
        this.ws.onclose = null;
        this.ws.close();
      }
    } catch (_) {}
    for (const [id, { reject }] of this.callbacks.entries()) {
      reject(new Error(`CDP client closed during #${id}`));
    }
    this.callbacks.clear();
    this.eventListeners.clear();
  }
}

// ---------------------------------------------------------------------------
// 7. Browser Session Wrapper (with Fetch.enable Zero-Live-Firebase Gate)
// ---------------------------------------------------------------------------
const ONE_PX_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const QRCODE_STUB_JS = `
window.QRCode = function QRCode(el, opts) {
  if (!el) return;
  el.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.width = (opts && opts.width) || 128;
  canvas.height = (opts && opts.height) || 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  el.appendChild(canvas);
};
`;

async function launchBrowserSession({ roleName, cdpPort, serverUrl, relay, blockedExternalCalls }) {
  const chromePath = findChromeExecutable();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `billnaw_e2e_${roleName}_`));

  const chromeProc = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1280,800',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ], {
    stdio: 'ignore'
  });

  // Poll CDP /json/list
  let pageWsUrl = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          pageWsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch (_) {}
  }

  if (!pageWsUrl) {
    try { execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' }); } catch (_) {}
    throw new Error(`Chrome (${roleName}) failed to expose CDP target on port ${cdpPort}`);
  }

  const cdp = new CDPClient(pageWsUrl);
  await cdp.init();

  const dialogs = [];
  const consoleErrors = [];
  const pageExceptions = [];
  let nextConfirmResult = true;
  let simulateSyncOffline = false;

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');
  await cdp.send('Fetch.enable', {
    patterns: [
      { urlPattern: 'http://*', requestStage: 'Request' },
      { urlPattern: 'https://*', requestStage: 'Request' }
    ]
  });

  const appShimB64 = Buffer.from(buildFirebaseAppShim(), 'utf8').toString('base64');
  const authShimB64 = Buffer.from(buildFirebaseAuthShim(), 'utf8').toString('base64');
  const firestoreShimB64 = Buffer.from(buildFirebaseFirestoreShim(relay.wsUrl), 'utf8').toString('base64');
  const swNoopB64 = Buffer.from(
    "self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));",
    'utf8'
  ).toString('base64');
  const qrStubB64 = Buffer.from(QRCODE_STUB_JS, 'utf8').toString('base64');

  cdp.on('Page.javascriptDialogOpening', (params) => {
    dialogs.push({ type: params.type, message: params.message, timestamp: Date.now() });
    const accept = params.type === 'confirm' ? nextConfirmResult : true;
    cdp.send('Page.handleJavaScriptDialog', { accept }).catch(() => {});
  });

  cdp.on('Runtime.exceptionThrown', (params) => {
    const text = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Unknown exception';
    pageExceptions.push({ text, timestamp: Date.now() });
  });

  cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const text = (params.args || []).map((a) => a.value || a.description || '').join(' ');
      consoleErrors.push({ text, timestamp: Date.now() });
    }
  });

  cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
    const url = request.url || '';
    try {
      // 1. Offline sync simulation for /api/sync/store-data
      if (simulateSyncOffline && url.includes('/api/sync/store-data')) {
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' });
        return;
      }

      // 2. Local ESM Firebase shims
      if (/gstatic\.com\/firebasejs\/[^/]+\/firebase-app\.js/.test(url)) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
            { name: 'Access-Control-Allow-Origin', value: '*' }
          ],
          body: appShimB64
        });
        return;
      }
      if (/gstatic\.com\/firebasejs\/[^/]+\/firebase-firestore\.js/.test(url)) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
            { name: 'Access-Control-Allow-Origin', value: '*' }
          ],
          body: firestoreShimB64
        });
        return;
      }
      if (/gstatic\.com\/firebasejs\/[^/]+\/firebase-auth\.js/.test(url)) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'Content-Type', value: 'application/javascript; charset=utf-8' },
            { name: 'Access-Control-Allow-Origin', value: '*' }
          ],
          body: authShimB64
        });
        return;
      }

      // 3. No-op service worker
      if (url.includes('/service-worker.js')) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/javascript; charset=utf-8' }],
          body: swNoopB64
        });
        return;
      }

      // 4. Google Fonts & CDN stubs so headless Chrome has zero external network noise
      if (url.includes('fonts.googleapis.com')) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/css; charset=utf-8' }],
          body: ''
        });
        return;
      }
      if (url.includes('fonts.gstatic.com')) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'font/woff2' }],
          body: ''
        });
        return;
      }
      if (url.includes('images.unsplash.com')) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
          body: ONE_PX_PNG_BASE64
        });
        return;
      }
      if (url.includes('cdnjs.cloudflare.com') && url.includes('qrcode')) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/javascript; charset=utf-8' }],
          body: qrStubB64
        });
        return;
      }

      // 5. Block & record any Google/Firebase live production endpoints
      if (
        url.includes('googleapis.com') ||
        url.includes('firebaseio.com') ||
        url.includes('firebasestorage.app') ||
        url.includes('firebaseapp.com')
      ) {
        blockedExternalCalls.push({ role: roleName, url, timestamp: Date.now() });
        await cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
        return;
      }

      // 6. Local server & data/blob URIs continue normally
      await cdp.send('Fetch.continueRequest', { requestId });
    } catch (_) {
      try { await cdp.send('Fetch.continueRequest', { requestId }); } catch (__) {}
    }
  });

  await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
    source: buildNewDocumentInitScript()
  });

  async function navigate(targetUrl = serverUrl) {
    await cdp.send('Page.navigate', { url: targetUrl });
    await waitFor(async () => {
      return await cdp.evaluate(`
        document.readyState === 'complete' &&
        typeof window.firestoreDB !== 'undefined' &&
        typeof window.switchTab === 'function' &&
        typeof window.ThermalPrinterBridge !== 'undefined'
      `);
    }, 15000, `Page ready for ${roleName}`);
  }

  async function waitFor(predicateFn, timeoutMs = 10000, label = 'condition') {
    const start = Date.now();
    let lastErr = null;
    while (Date.now() - start < timeoutMs) {
      try {
        const val = await predicateFn();
        if (val) return val;
      } catch (e) {
        lastErr = e;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Timeout after ${timeoutMs}ms waiting for ${label}${lastErr ? ': ' + lastErr.message : ''}`);
  }

  async function setInputFile(selector, filePath) {
    const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector
    });
    if (!nodeId) throw new Error(`File input not found: ${selector}`);
    await cdp.send('DOM.setFileInputFiles', {
      nodeId,
      files: [path.resolve(filePath)]
    });
    // Ensure onchange fires
    await cdp.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
  }

  async function close() {
    cdp.close();
    if (chromeProc && chromeProc.pid) {
      if (process.platform === 'win32') {
        try { execSync(`taskkill /pid ${chromeProc.pid} /f /t`, { stdio: 'ignore' }); } catch (_) {}
      } else {
        try { chromeProc.kill('SIGKILL'); } catch (_) {}
      }
    }
    for (let i = 0; i < 12; i++) {
      try {
        if (fs.existsSync(userDataDir)) {
          fs.rmSync(userDataDir, { recursive: true, force: true });
        }
        break;
      } catch (_) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
  }

  return {
    roleName,
    cdpPort,
    userDataDir,
    cdp,
    dialogs,
    consoleErrors,
    pageExceptions,
    setNextConfirmResult(val) { nextConfirmResult = Boolean(val); },
    setSimulateSyncOffline(val) { simulateSyncOffline = Boolean(val); },
    navigate,
    waitFor,
    evaluate: (expr, retries) => cdp.evaluate(expr, retries),
    setInputFile,
    close
  };
}

// ---------------------------------------------------------------------------
// 8. Isolated Server Lifecycle & File Snapshots
// ---------------------------------------------------------------------------
function snapshotFile(filePath) {
  if (fs.existsSync(filePath)) {
    return { exists: true, bytes: fs.readFileSync(filePath) };
  }
  return { exists: false, bytes: null };
}

function restoreFile(filePath, snap) {
  if (snap.exists) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, snap.bytes);
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function listDirFiles(dir) {
  if (!fs.existsSync(dir)) return new Set();
  return new Set(fs.readdirSync(dir));
}

function cleanupNewFiles(dir, beforeSet) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (!beforeSet.has(name)) {
      try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch (_) {}
    }
  }
}

async function startIsolatedServer(relay, port = DEFAULT_E2E_PORT) {
  const authFile = path.join(ROOT_DIR, 'data', 'auth_store.json');
  const quotaFile = path.join(ROOT_DIR, 'data', 'ai-quota.json');
  const uploadsFoodDir = path.join(ROOT_DIR, 'uploads', 'food-images');
  const uploadsReportsDir = path.join(ROOT_DIR, 'uploads', 'reports');

  const authSnap = snapshotFile(authFile);
  const quotaSnap = snapshotFile(quotaFile);
  const foodFilesBefore = listDirFiles(uploadsFoodDir);
  const reportFilesBefore = listDirFiles(uploadsReportsDir);

  const mockImportUrl = pathToFileURL(path.resolve(__dirname, 'e2e_server_fetch_mock.mjs')).href;
  const serverLogs = [];

  const serverProc = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      E2E_RELAY_HTTP: relay.httpUrl,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'e2e_stub_gemini_key_1234567890',
      NODE_OPTIONS: `--import ${mockImportUrl}`
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => {
    serverLogs.push(d.toString('utf8'));
    if (serverLogs.length > 200) serverLogs.shift();
  });
  serverProc.stderr.on('data', (d) => {
    serverLogs.push('[STDERR] ' + d.toString('utf8'));
    if (serverLogs.length > 200) serverLogs.shift();
  });

  const serverUrl = `http://127.0.0.1:${port}`;
  let healthy = false;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch(`${serverUrl}/api/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok') {
          healthy = true;
          break;
        }
      }
    } catch (_) {}
  }

  async function stop() {
    if (serverProc && serverProc.pid) {
      if (process.platform === 'win32') {
        try { execSync(`taskkill /pid ${serverProc.pid} /f /t`, { stdio: 'ignore' }); } catch (_) {}
      } else {
        try { serverProc.kill('SIGKILL'); } catch (_) {}
      }
    }
    // Wait slightly for Windows file locks to release before restoring snapshots
    await new Promise((r) => setTimeout(r, 200));
    restoreFile(authFile, authSnap);
    restoreFile(quotaFile, quotaSnap);
    cleanupNewFiles(uploadsFoodDir, foodFilesBefore);
    cleanupNewFiles(uploadsReportsDir, reportFilesBefore);
  }

  if (!healthy) {
    await stop();
    throw new Error(`Isolated server.js failed to respond on ${serverUrl}/api/health.\nLogs:\n${serverLogs.join('')}`);
  }

  return {
    port,
    serverUrl,
    serverProc,
    getLogs: () => serverLogs.join(''),
    stop
  };
}

// ---------------------------------------------------------------------------
// 9. Unified Harness Orchestrator
// ---------------------------------------------------------------------------
async function createE2EHarness(options = {}) {
  const e2ePort = options.port || DEFAULT_E2E_PORT;
  const blockedExternalCalls = [];

  const relay = await createFirestoreRelay();
  const server = await startIsolatedServer(relay, e2ePort);
  const browsers = {};
  const tempFiles = [];

  try {
    if (options.launchBrowsers !== false) {
      const p1 = options.baseCdpPort ? options.baseCdpPort : await getFreePort();
      const p2 = options.baseCdpPort ? options.baseCdpPort + 1 : await getFreePort();
      const p3 = options.baseCdpPort ? options.baseCdpPort + 2 : await getFreePort();
      browsers.admin = await launchBrowserSession({
        roleName: 'admin',
        cdpPort: p1,
        serverUrl: server.serverUrl,
        relay,
        blockedExternalCalls
      });
      browsers.cashier = await launchBrowserSession({
        roleName: 'cashier',
        cdpPort: p2,
        serverUrl: server.serverUrl,
        relay,
        blockedExternalCalls
      });
      browsers.server = await launchBrowserSession({
        roleName: 'server',
        cdpPort: p3,
        serverUrl: server.serverUrl,
        relay,
        blockedExternalCalls
      });
    }
  } catch (err) {
    for (const b of Object.values(browsers)) {
      await b.close().catch(() => {});
    }
    await server.stop().catch(() => {});
    await relay.close().catch(() => {});
    throw err;
  }

  function createTempFixtureFile(filename, contentBufferOrStr) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'billnaw_e2e_fix_'));
    const full = path.join(dir, filename);
    fs.writeFileSync(full, contentBufferOrStr);
    tempFiles.push(dir);
    return full;
  }

  async function teardown() {
    for (const b of Object.values(browsers)) {
      await b.close().catch(() => {});
    }
    await server.stop().catch(() => {});
    await relay.close().catch(() => {});
    for (const dir of tempFiles) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
    }
  }

  return {
    relay,
    server,
    serverUrl: server.serverUrl,
    browsers,
    blockedExternalCalls,
    createTempFixtureFile,
    teardown
  };
}

module.exports = {
  createFirestoreRelay,
  startIsolatedServer,
  launchBrowserSession,
  createE2EHarness,
  firestoreValueToJson,
  jsonToFirestoreValue,
  jsonToFirestoreFields
};
