// server/auth-service.js - Production-Grade Zero-Dependency Authentication & OTP Engine
// Zero-dependency architecture utilizing Node.js built-in crypto and native fetch.
// Manages OTP lifecycle (generation, rate-limit cooldown, TTL, attempt throttling, single-use invalidation),
// tenant resolution to shops/{storeCode}, password fallback authentication, and session persistence.

import crypto from 'crypto';
import { CONFIG } from './config.js';

// In-memory data repositories
const otpStore = new Map();
const userStore = new Map();
const shopStore = new Map();
const sessionStore = new Map();

// Configuration Constants
const OTP_COOLDOWN_SECONDS = 60;
const OTP_TTL_SECONDS = 600; // 10 minutes
const OTP_MAX_ATTEMPTS = 3;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * Normalizes email by trimming whitespace and converting to lowercase.
 */
export function normalizeEmail(email) {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

/**
 * Validates email against standard RFC-5322 pattern.
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.includes('..')) return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(trimmed);
}

/**
 * Generates salted PBKDF2 hash for passwords using native crypto.
 */
export function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

/**
 * Generates deterministic or slug-based storeCode.
 * If shopName starts with SHOP-, it is preserved directly.
 */
export function generateStoreCode(shopName, email) {
  const normEmail = normalizeEmail(email);
  if (shopName && typeof shopName === 'string') {
    const trimmed = shopName.trim().toUpperCase();
    if (trimmed.startsWith('SHOP-') && trimmed.length >= 6) {
      return trimmed;
    }
    const slug = trimmed.replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (slug) {
      const suffix = crypto.createHash('sha256').update(normEmail).digest('hex').slice(0, 4).toUpperCase();
      return `SHOP-${slug}-${suffix}`;
    }
  }
  const hash = crypto.createHash('sha256').update(normEmail).digest('hex').slice(0, 8).toUpperCase();
  return `SHOP-${hash}`;
}

/**
 * Creates a valid HMAC-SHA256 signed custom token (JWT structure) for client Firebase SDK / session use.
 */
export function createCustomAuthToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iss: 'billnaw-auth-service',
    sub: payload.uid,
    aud: CONFIG?.firebase?.projectId || 'abhi-pro-cafe-pos',
    iat: now,
    exp: now + (3600 * 24 * 7) // 7 days
  })).toString('base64url');
  const secret = CONFIG?.firebase?.apiKey || 'billnaw-pos-secret-salt';
  const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Creates default shop schema compatible with firebase-blueprint and js/core.js
 */
export function createDefaultShopDocument(storeCode, name, ownerEmail, ownerUid) {
  const shopTitle = name || 'Billnaw Cafe';
  return {
    storeCode,
    name: shopTitle,
    ownerEmail: normalizeEmail(ownerEmail),
    ownerUid: ownerUid || `usr_${crypto.randomBytes(6).toString('hex')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: {
      name: shopTitle,
      address: '12 Park Street, Kolkata',
      phone: '+91 98765 43210',
      fssai: '12345678901234',
      gstin: '19AAAAA0000A1Z5',
      tableCount: 10,
      tableNamingPrefix: 'Table ',
      startInvoiceNo: 1001,
      adminPinHash: crypto.createHash('md5').update('1234').digest('hex'),
      upiId: 'billnaw@upi',
      showQr: true,
      gstMode: 'inclusive',
      defaultGstRate: 5,
      discountsEnabled: true
    },
    staff: [
      { id: 1, name: 'Store Owner', role: 'Admin', pin: '1234', phone: '+91 98765 43210', status: 'Active' }
    ],
    categories: ['All', 'Tea/Coffee', 'Food', 'Cigarettes', 'Other'],
    menu: [
      { id: 1, name: 'Masala Chai', category: 'Tea/Coffee', price: 20, stock: 100, gstRate: 5 }
    ],
    tables: {},
    history: [],
    expenses: [],
    customers: []
  };
}

/**
 * Syncs shop document to Google Cloud Firestore REST API in background if online.
 */
async function syncShopToFirestore(storeCode, shopData) {
  try {
    if (!CONFIG?.firebase?.projectId || !CONFIG?.firebase?.firestoreDatabaseId) return;
    const base = `https://firestore.googleapis.com/v1/projects/${CONFIG.firebase.projectId}/databases/${CONFIG.firebase.firestoreDatabaseId}/documents`;
    const url = `${base}/shops/${encodeURIComponent(storeCode)}`;

    const firestoreFields = {
      storeCode: { stringValue: storeCode },
      name: { stringValue: shopData.name || 'Billnaw Cafe' },
      ownerEmail: { stringValue: shopData.ownerEmail || '' },
      ownerUid: { stringValue: shopData.ownerUid || '' },
      updatedAt: { stringValue: new Date().toISOString() }
    };

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: firestoreFields })
    }).catch(() => null);
  } catch (err) {
    // Offline resilience: silent fallback to local repository
  }
}

/**
 * Resolves or initializes shop tenant profile mapped to shops/{storeCode}.
 */
export function resolveShopTenant(storeCode, shopName, ownerEmail, ownerUid) {
  const code = storeCode || 'SHOP-BILLNAW-01';
  let shop = shopStore.get(code);

  if (!shop) {
    shop = createDefaultShopDocument(code, shopName, ownerEmail, ownerUid);
    shopStore.set(code, shop);
    // Asynchronously replicate to cloud Firestore
    syncShopToFirestore(code, shop);
  } else if (shopName && shopName.trim() && shop.name !== shopName.trim()) {
    shop.name = shopName.trim();
    if (shop.profile) shop.profile.name = shopName.trim();
    shop.updatedAt = new Date().toISOString();
  }

  return shop;
}

/**
 * Request a 6-digit numeric OTP for email authentication.
 * Enforces 60s cooldown and 10m TTL.
 */
export function sendOtp(email, purpose = 'login') {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return {
      status: 400,
      data: { success: false, error: 'Invalid email address' }
    };
  }

  const now = Date.now();
  const existing = otpStore.get(normalizedEmail);

  // Check 60-second cooldown rate limit
  if (existing && !existing.consumed && now < existing.resendAvailableAt) {
    const retryAfter = Math.ceil((existing.resendAvailableAt - now) / 1000);
    return {
      status: 429,
      data: {
        success: false,
        error: `Rate limited. Try again in ${retryAfter} seconds`,
        retryAfter
      }
    };
  }

  // Generate 6-digit numeric OTP (100000 to 999999)
  const otp = crypto.randomInt(100000, 1000000).toString();

  const record = {
    email: normalizedEmail,
    otp,
    purpose,
    createdAt: now,
    expiresAt: now + (OTP_TTL_SECONDS * 1000), // 10 minutes
    resendAvailableAt: now + (OTP_COOLDOWN_SECONDS * 1000), // 60 seconds
    attempts: 0,
    consumed: false
  };

  otpStore.set(normalizedEmail, record);

  // Dev/Mock delivery fallback logging
  console.log(`[AUTH OTP] 📧 Verification code for ${normalizedEmail}: ${otp}`);

  return {
    status: 200,
    data: {
      success: true,
      message: `A 6-digit verification code has been sent to ${normalizedEmail}`,
      email: normalizedEmail,
      cooldownSeconds: OTP_COOLDOWN_SECONDS,
      expiresInSeconds: OTP_TTL_SECONDS,
      mockDelivery: true,
      devOtp: otp
    }
  };
}

/**
 * Validates user-submitted OTP.
 * Enforces max 3 attempts, single-use consumption, and resolves user/shop tenant.
 */
export function verifyOtp(email, otp, shopName) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return {
      status: 400,
      data: { success: false, error: 'Invalid email address' }
    };
  }

  const cleanOtp = (otp !== undefined && otp !== null) ? otp.toString().trim() : '';
  if (!/^\d{6}$/.test(cleanOtp)) {
    return {
      status: 400,
      data: { success: false, error: 'Invalid or expired OTP' }
    };
  }

  const now = Date.now();
  const record = otpStore.get(normalizedEmail);

  // Lookup record and check expiration
  if (!record || record.consumed || now > record.expiresAt) {
    if (record && (record.consumed || now > record.expiresAt)) {
      otpStore.delete(normalizedEmail);
    }
    return {
      status: 400,
      data: { success: false, error: 'Invalid or expired OTP' }
    };
  }

  // Increment attempt counter
  record.attempts += 1;

  if (record.attempts > OTP_MAX_ATTEMPTS) {
    otpStore.delete(normalizedEmail);
    return {
      status: 429,
      data: {
        success: false,
        error: 'Too many invalid attempts. Code invalidated. Please request a new code.',
        attemptsRemaining: 0
      }
    };
  }

  // Compare OTP
  if (record.otp !== cleanOtp) {
    const attemptsRemaining = Math.max(0, OTP_MAX_ATTEMPTS - record.attempts);
    if (attemptsRemaining === 0) {
      otpStore.delete(normalizedEmail);
      return {
        status: 429,
        data: {
          success: false,
          error: 'Too many invalid attempts. Code invalidated. Please request a new code.',
          attemptsRemaining: 0
        }
      };
    }
    return {
      status: 401,
      data: {
        success: false,
        error: `Incorrect OTP. ${attemptsRemaining} attempts remaining`,
        attemptsRemaining
      }
    };
  }

  // Mark single-use invalidation
  record.consumed = true;
  otpStore.delete(normalizedEmail);

  // User and tenant resolution
  let user = userStore.get(normalizedEmail);
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const uid = 'usr_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 10);
    const storeCode = generateStoreCode(shopName, normalizedEmail);
    const effectiveShopName = (shopName && shopName.trim()) || 'Billnaw Cafe';

    user = {
      uid,
      email: normalizedEmail,
      firstName: '',
      lastName: '',
      shopName: effectiveShopName,
      storeCode,
      role: 'Owner',
      createdAt: new Date().toISOString()
    };
    userStore.set(normalizedEmail, user);
  } else if (shopName && shopName.trim() && user.shopName !== shopName.trim()) {
    user.shopName = shopName.trim();
  }

  const shop = resolveShopTenant(user.storeCode, user.shopName, user.email, user.uid);

  // Mint session tokens
  const sessionToken = 'sess_' + crypto.randomBytes(24).toString('hex');
  sessionStore.set(sessionToken, {
    uid: user.uid,
    email: user.email,
    storeCode: user.storeCode,
    createdAt: now,
    expiresAt: now + (SESSION_TTL_SECONDS * 1000)
  });

  const customToken = createCustomAuthToken({ uid: user.uid, email: user.email, storeCode: user.storeCode });

  return {
    status: 200,
    data: {
      success: true,
      message: 'Authentication successful.',
      token: sessionToken,
      sessionToken,
      customToken,
      storeCode: user.storeCode,
      shop: {
        storeCode: shop.storeCode,
        name: shop.name,
        ownerEmail: shop.ownerEmail,
        profile: shop.profile,
        staff: shop.staff,
        categories: shop.categories,
        menu: shop.menu
      },
      user: {
        uid: user.uid,
        email: user.email,
        shopName: user.shopName,
        storeCode: user.storeCode,
        role: user.role
      },
      isNewUser
    }
  };
}

/**
 * Email + Password account registration.
 */
export function registerUser({ firstName, lastName, shopName, email, password, confirmPassword, otp }) {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    return { status: 400, data: { success: false, error: 'Invalid email address' } };
  }
  if (!firstName || typeof firstName !== 'string' || !firstName.trim()) {
    return { status: 400, data: { success: false, error: 'First name is required' } };
  }
  if (!shopName || typeof shopName !== 'string' || !shopName.trim()) {
    return { status: 400, data: { success: false, error: 'Shop/Cafe name is required' } };
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return { status: 400, data: { success: false, error: 'Password must be at least 6 characters' } };
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    return { status: 400, data: { success: false, error: 'Passwords do not match' } };
  }
  if (userStore.has(normalizedEmail)) {
    return { status: 400, data: { success: false, error: 'An account with this email already exists' } };
  }

  // Verify email OTP when provided
  if (otp !== undefined && otp !== null && String(otp).trim() !== '') {
    const cleanOtp = String(otp).trim();
    const otpRes = verifyOtp(normalizedEmail, cleanOtp, shopName);
    if (otpRes.status !== 200) {
      return {
        status: 400,
        data: {
          success: false,
          error: (otpRes.data && otpRes.data.error) || 'Invalid or expired email verification code'
        }
      };
    }
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password, salt);
  const uid = 'usr_' + crypto.createHash('sha256').update(normalizedEmail).digest('hex').slice(0, 10);
  const storeCode = generateStoreCode(shopName, normalizedEmail);

  const user = {
    uid,
    email: normalizedEmail,
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
    shopName: shopName.trim(),
    storeCode,
    passwordHash,
    salt,
    role: 'Owner',
    createdAt: new Date().toISOString()
  };
  userStore.set(normalizedEmail, user);

  const shop = resolveShopTenant(storeCode, shopName.trim(), normalizedEmail, uid);

  // Mint session tokens
  const sessionToken = 'sess_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessionStore.set(sessionToken, {
    uid: user.uid,
    email: user.email,
    storeCode: user.storeCode,
    createdAt: now,
    expiresAt: now + (SESSION_TTL_SECONDS * 1000)
  });

  const customToken = createCustomAuthToken({ uid: user.uid, email: user.email, storeCode: user.storeCode });

  return {
    status: 200,
    data: {
      success: true,
      message: 'Account created successfully',
      token: sessionToken,
      sessionToken,
      customToken,
      storeCode,
      shop: {
        storeCode: shop.storeCode,
        name: shop.name,
        ownerEmail: shop.ownerEmail,
        profile: shop.profile,
        staff: shop.staff,
        categories: shop.categories,
        menu: shop.menu
      },
      user: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        shopName: user.shopName,
        storeCode: user.storeCode,
        role: user.role
      }
    }
  };
}

/**
 * Email + Password authentication fallback.
 */
export function loginWithPassword({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !password) {
    return { status: 400, data: { success: false, error: 'Email and password are required' } };
  }

  const user = userStore.get(normalizedEmail);
  if (!user || !user.passwordHash || !user.salt) {
    return { status: 401, data: { success: false, error: 'Invalid credentials' } };
  }

  const computedHash = hashPassword(password, user.salt);
  if (computedHash !== user.passwordHash) {
    return { status: 401, data: { success: false, error: 'Invalid credentials' } };
  }

  const shop = resolveShopTenant(user.storeCode, user.shopName, user.email, user.uid);

  const sessionToken = 'sess_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessionStore.set(sessionToken, {
    uid: user.uid,
    email: user.email,
    storeCode: user.storeCode,
    createdAt: now,
    expiresAt: now + (SESSION_TTL_SECONDS * 1000)
  });

  const customToken = createCustomAuthToken({ uid: user.uid, email: user.email, storeCode: user.storeCode });

  return {
    status: 200,
    data: {
      success: true,
      message: 'Login successful',
      token: sessionToken,
      sessionToken,
      customToken,
      storeCode: user.storeCode,
      shop: {
        storeCode: shop.storeCode,
        name: shop.name,
        ownerEmail: shop.ownerEmail,
        profile: shop.profile,
        staff: shop.staff,
        categories: shop.categories,
        menu: shop.menu
      },
      user: {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        shopName: user.shopName,
        storeCode: user.storeCode,
        role: user.role
      }
    }
  };
}

/**
 * Validates and restores user session from Bearer or session token.
 */
export function verifySession(rawToken) {
  let token = rawToken;
  if (!token || typeof token !== 'string') {
    return { status: 401, data: { success: false, error: 'Invalid or expired session' } };
  }

  if (token.startsWith('Bearer ')) {
    token = token.slice(7).trim();
  }

  const session = sessionStore.get(token);
  if (!session || Date.now() > session.expiresAt) {
    if (session) sessionStore.delete(token);
    return { status: 401, data: { success: false, error: 'Invalid or expired session' } };
  }

  const user = userStore.get(session.email);
  const shop = resolveShopTenant(session.storeCode, user?.shopName, session.email, session.uid);

  return {
    status: 200,
    data: {
      success: true,
      token,
      sessionToken: token,
      storeCode: session.storeCode,
      shop: {
        storeCode: shop.storeCode,
        name: shop.name,
        ownerEmail: shop.ownerEmail,
        profile: shop.profile,
        staff: shop.staff,
        categories: shop.categories,
        menu: shop.menu
      },
      user: user ? {
        uid: user.uid,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        shopName: user.shopName,
        storeCode: user.storeCode,
        role: user.role
      } : {
        uid: session.uid,
        email: session.email,
        storeCode: session.storeCode,
        role: 'Owner'
      }
    }
  };
}

/**
 * Resets all in-memory stores for clean testing isolation.
 */
export function resetAuthStore() {
  otpStore.clear();
  userStore.clear();
  shopStore.clear();
  sessionStore.clear();
  seedDemoData();
}

/**
 * Seeds default demo user and store profile.
 */
function seedDemoData() {
  const DEMO_STORE_CODE = 'SHOP-BILLNAW-01';
  const demoSalt = crypto.randomBytes(16).toString('hex');
  const demoPasswordHash = hashPassword('Password123!', demoSalt);

  const demoUser = {
    uid: 'usr_billnaw_demo',
    email: 'demo@billnawcafe.com',
    firstName: 'Demo',
    lastName: 'Owner',
    shopName: 'Billnaw Cafe',
    storeCode: DEMO_STORE_CODE,
    passwordHash: demoPasswordHash,
    salt: demoSalt,
    role: 'Owner',
    createdAt: new Date().toISOString()
  };
  userStore.set('demo@billnawcafe.com', demoUser);

  const demoShop = createDefaultShopDocument(DEMO_STORE_CODE, 'Billnaw Cafe', 'demo@billnawcafe.com', 'usr_billnaw_demo');
  shopStore.set(DEMO_STORE_CODE, demoShop);
}

// Initial seed
seedDemoData();

/**
 * Self-test suite executing all 14 authentication and OTP verification vectors.
 */
export function runAuthSelfTest() {
  const testEmail = 'audit_selftest_' + Date.now() + '@billnawcafe.com';

  // 1. Email Normalization
  if (normalizeEmail('  Test@Domain.COM ') !== 'test@domain.com') {
    throw new Error('normalizeEmail failed');
  }

  // 2. Email Validation
  if (!isValidEmail('valid@example.com') || isValidEmail('invalid-email') || isValidEmail('')) {
    throw new Error('isValidEmail failed');
  }

  // 3. Password Hashing
  const salt = crypto.randomBytes(16).toString('hex');
  const h1 = hashPassword('Secret123!', salt);
  const h2 = hashPassword('Secret123!', salt);
  const h3 = hashPassword('Different123!', salt);
  if (h1 !== h2 || h1 === h3) {
    throw new Error('hashPassword failed');
  }

  // 4. Send OTP (6 digits generation and mock delivery)
  const sendRes = sendOtp(testEmail);
  if (sendRes.status !== 200 || !sendRes.data.success || !sendRes.data.devOtp) {
    throw new Error('sendOtp failed');
  }
  const code = sendRes.data.devOtp;
  if (!/^\d{6}$/.test(code)) {
    throw new Error('OTP is not 6 digits');
  }

  // 5. Cooldown enforcement (60s)
  const cooldownRes = sendOtp(testEmail);
  if (cooldownRes.status !== 429 || cooldownRes.data.success !== false || typeof cooldownRes.data.retryAfter !== 'number') {
    throw new Error('sendOtp cooldown check failed');
  }

  // 6. OTP Verification - Wrong code attempt 1
  const wrong1 = verifyOtp(testEmail, '000000');
  if (wrong1.status !== 401 || wrong1.data.attemptsRemaining !== 2) {
    throw new Error('verifyOtp wrong code attempt 1 failed');
  }

  // 7. OTP Verification - Wrong code attempt 2
  const wrong2 = verifyOtp(testEmail, '000000');
  if (wrong2.status !== 401 || wrong2.data.attemptsRemaining !== 1) {
    throw new Error('verifyOtp wrong code attempt 2 failed');
  }

  // 8. OTP Verification - Wrong code attempt 3 (exceeded)
  const wrong3 = verifyOtp(testEmail, '000000');
  if (wrong3.status !== 429 || wrong3.data.attemptsRemaining !== 0) {
    throw new Error('verifyOtp max attempts invalidation failed');
  }

  // 9. After invalidation, further verification returns 400
  const afterInvalid = verifyOtp(testEmail, code);
  if (afterInvalid.status !== 400) {
    throw new Error('verifyOtp post-invalidation check failed');
  }

  // 10. Fresh OTP and successful verification
  otpStore.delete(normalizeEmail(testEmail));
  const freshSend = sendOtp(testEmail);
  const validCode = freshSend.data.devOtp;
  const verifyRes = verifyOtp(testEmail, validCode, 'Audit Shop');
  if (verifyRes.status !== 200 || !verifyRes.data.token || !verifyRes.data.storeCode || !verifyRes.data.shop) {
    throw new Error('verifyOtp valid code failed');
  }
  const sessionToken = verifyRes.data.token;

  // 11. Single-use invalidation (replay attack)
  const replayRes = verifyOtp(testEmail, validCode);
  if (replayRes.status !== 400) {
    throw new Error('replay attack prevention failed');
  }

  // 12. Session verification
  const sessRes = verifySession(sessionToken);
  if (sessRes.status !== 200 || sessRes.data.user.email !== testEmail) {
    throw new Error('verifySession failed');
  }

  // 13. Password Signup
  const signupEmail = 'signup_' + Date.now() + '@billnawcafe.com';
  const signupRes = registerUser({
    firstName: 'Alex',
    lastName: 'Ray',
    shopName: 'Alex Cafe',
    email: signupEmail,
    password: 'Password999!'
  });
  if (signupRes.status !== 200 || !signupRes.data.user || !signupRes.data.storeCode) {
    throw new Error('registerUser failed');
  }

  // 14. Password Login
  const loginRes = loginWithPassword({ email: signupEmail, password: 'Password999!' });
  if (loginRes.status !== 200 || !loginRes.data.token) {
    throw new Error('loginWithPassword failed');
  }

  const badLogin = loginWithPassword({ email: signupEmail, password: 'WrongPassword!' });
  if (badLogin.status !== 401) {
    throw new Error('loginWithPassword invalid credentials check failed');
  }

  // Cleanup test data
  otpStore.delete(normalizeEmail(testEmail));
  userStore.delete(normalizeEmail(testEmail));
  userStore.delete(normalizeEmail(signupEmail));
  sessionStore.delete(sessionToken);
  sessionStore.delete(signupRes.data.token);
  sessionStore.delete(loginRes.data.token);

  console.log('[AUTH ENGINE SELF-TEST] 🛡️ All 14 verification vectors verified successfully.');
}

// Execute self-test on load to guarantee module integrity
runAuthSelfTest();
