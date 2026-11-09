# BILLNAW CAFE POS — SYSTEM CONTEXT & PRODUCTION ARCHITECTURE REPORT

> Updated: 2026-11-08 | Status: Production Hardened (Milestones M1–M5 Complete) | Target: Multi-Tenant SaaS POS (PWA / Android / Desktop)

---

## 1. REPOSITORY INVENTORY & METRICS

| Layer / Directory | Primary Files | Approximate Size | Key Responsibilities |
|---|---|---|---|
| **Client Shell** | `index.html` | ~565 KB (~5,800 lines) | Single-page application shell containing 6 core hubs, 26 `.modal-close-btn` SVG modals, full-screen `#billInvoiceModal`, and Firebase SDK bindings. |
| **Styling** | `style.css` & `src/styles/` | ~210 KB (8,339 lines) | Compiled from 9 modular CSS files via `node scripts/bundle-css.cjs` (`variables`, `base`, `layout`, `components`, `modals`, `pos`, `inventory`, `reports`, `responsive`). |
| **Core Modules (`src/core/`)** | `rbac.js` | 8 KB | Role-Based Access Control (`Admin`, `Manager`, `Cashier`, `Floor Server`, `Kitchen Chef`), salted SHA-256 PIN hashing (`cleanPin:cleanSalt:billnaw_pin_v2`), `timingSafeEqual`. |
| | `platform-bridge.js` | 72 KB | Universal ESC/POS thermal printer bridge (WebBluetooth, WebUSB, WebSerial, Network TCP 9100), 1-bit raster logo encoder (`GS v 0`), native QR generator (`GS ( k`), strict KOT vs Invoice isolation, and structured item resolver. |
| | `db-client.js` | 15 KB | Unified local/cloud database abstraction layer. |
| **Client Logic (`js/`)** | `core.js` | 82 KB | Global state, IndexedDB (`CafePOS_DB`), dual-path Firestore sync (`/shops/{shopId}` & `/cafes/{cafeId}`), live subscription enforcement (`ACTIVE`, `PAUSED`, `RESUMED`, `REVOKED`), logo & QR persistence. |
| | `pos.js` | 105 KB | POS terminal cart, catalog rendering, table selector (`T1`, `T2`, ...), Delta-KOT tracking (`qtyKotPrinted`), GST calculation, settlement, and receipt/KOT dispatch. |
| | `staff.js` | 92 KB | Multi-profile staff directory (max 10 profiles/shop), 4-digit temporary OTP onboarding, `#firstLoginPinModal`, active cloud presence with 15m staleness decay, and immediate remote session revocation (`lockTerminalByRemote`). |
| | `cloud-sync.js` | 48 KB | Secondary device profile picker, salted PIN verification, real-time Firestore subcollection listeners (`staff`, `sessions`, `menu`, `tables`, `invoices`, `printQueue`). |
| | `dashboard.js` | 65 KB | Reports & analytics, interactive Order Cards grid (`#historyCardsGrid`), full-screen invoice modal (`#billInvoiceModal`), `resolveOrderItemsArray` order editor, VOID & reprint actions. |
| | `settings.js` | 84 KB | Store profile (logo, UPI ID, FSSAI, GSTIN), Floor Server Bluetooth-only settings lock (`applySettingsRoleRestrictions`), AI quota & BYOK custom key modal, device pairing hub. |
| | `menu.js` | 42 KB | Menu catalog, 3-dot mobile action dropdown, Gemini AI menu upload client & review modal. |
| | `culinary_inventory.js` | 199 KB | 13-feature culinary ERP: raw materials, sub-recipes, morning batching, dish food costing. |
| | `customers.js` | 100 KB | Customer CRM, dual Khata credit ledger, loyalty tiers, WhatsApp campaign broadcaster. |
| **Backend Services (`server/`)** | `server.js` | 58 KB | Express API server, subscription management (`/api/subscription/manage`, `/api/subscription/status`), AI menu scan (`/api/ai/scan-menu`), TCP 9100 network print proxy. |
| | `subscription-service.js` | 11 KB | Subscription state machine (`ACTIVE`, `PAUSED`, `RESUMED`, `REVOKED`), dual Firestore REST persistence with `updateMask`. |
| | `gemini-service.js` | 48 KB | Fast vision OCR model cascade (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-flash-latest`), 7s per-model timeout, `thinkingBudget: 0`, multi-strategy JSON parser. |
| | `quota-service.js` | 12 KB | 15-scan monthly quota per shop with `AsyncLocalStorage` mutex, calendar month rollover (`YYYY-MM`), HTTP 429 enforcement, and BYOK custom key resolution. |
| | `auth-service.js` | 45 KB | 6-digit email OTP engine, PBKDF2 password hashing, store tenant provisioning (`SHOP-*`), and session token management. |
| **Security Rules** | `firestore.rules` & `database/firestore.rules` | 8.2 KB | Hardened multi-tenant Firestore security rules with 100% byte-for-byte binary parity. |

---

## 2. EXISTING FEATURES CURRENTLY BUILT

1. **Dual-Mode POS Terminal:**
   - Table-based Dine-In service (interactive floor & table selector with 15-minute unpaid visual alerts).
   - Fast Counter / Takeaway billing mode.
   - Live product search, category filtering, and item customization.
2. **Order & Billing Engine:**
   - Subtotal, Percentage/Fixed Discounts, CGST/SGST/IGST calculation (Inclusive & Exclusive modes).
   - Cash tender change calculator, UPI QR code generation, and Khata (Pay Later) checkout.
   - Thermal invoice modal with reprint support and clean receipt formatting.
3. **Kitchen Order Ticket (KOT):**
   - Table item tracking with KOT status lifecycle.
4. **Culinary Inventory & Commissary ERP:**
   - Raw ingredient management with stock threshold alerts.
   - Sub-recipe preparation and yield tracking with automatic raw stock depletion.
   - Live dish food cost margin simulation and ingredient price sensitivity analysis.
5. **Customer Relationship Management & Khata Ledger:**
   - Diner credit tracking with partial payment settlement.
   - 3-tier loyalty rewards system (Bronze, Silver, Gold).
   - WhatsApp payment reminder links and campaign broadcaster.
6. **Analytics & Reports:**
   - Real-time revenue KPIs, payment breakdown charts, and sales ledger filtering.
   - CSV / Excel sales transaction export.
7. **Two-Tier Authentication:**
   - Email 6-digit OTP verification for store binding and login.
   - Fast cashier PIN switching for daily counter shifts.

---

## 3. PRODUCTION SECURITY & ARCHITECTURAL REMEDIATIONS (ALL RESOLVED)

All 7 historical vulnerabilities identified during the initial October 2026 audit have been **completely remediated and verified**:

### ✅ Resolved 1: Hardened Multi-Tenant Firestore Security Rules (`firestore.rules` & `database/firestore.rules`)
- **Resolution:** Enforces strict tenant isolation (`isValidTenant`, `isTenantStaff`, `isTenantAdmin`) across both `/shops/{shopId}` and `/cafes/{cafeId}` collections, locks `/devices/{deviceId}` from direct client tampering (`allow read, write: if false;`), and maintains 100% byte-for-byte binary parity between `firestore.rules` and `database/firestore.rules`.

### ✅ Resolved 2: Cryptographic Salted SHA-256 Staff PINs (`src/core/rbac.js`, `js/staff.js`, `js/cloud-sync.js`)
- **Resolution:** All staff PINs use a 16-byte CSPRNG hex salt (`generatePinSalt()`) and SHA-256 hashing over `${cleanPin}:${cleanSalt}:billnaw_pin_v2` verified via constant-time `timingSafeEqual()`. Admin onboarding issues a temporary 4-digit OTP (`onboardingOtp`) that is consumed on first login when the staff member sets their private salted PIN in `#firstLoginPinModal`.

### ✅ Resolved 3: Immutable Invoice Ledger & 30-Day Audit-Logged VOID (`firestore.rules`, `js/dashboard.js`)
- **Resolution:** Physical deletion of settled invoices in Firestore is strictly forbidden (`allow delete: if false;`). Cancellation transitions status from `PAID` to `VOID` with mandatory audit fields (`void_reason`, `voided_by_staff_id`, `voided_at`) within a 30-day window.

### ✅ Resolved 4: Integer Paise Math & Structured Item Resolution (`src/features/billing/`, `src/core/platform-bridge.js`, `js/dashboard.js`)
- **Resolution:** Financial calculations and ESC/POS line totals resolve integer paise (`line_total_paise`, `final_payable_paise`) and structured `rawItems` arrays. Legacy string-only `items` (e.g., `"Tea (x2), Samosa (x1)"`) are automatically resolved against `window.menuItems` and order totals via `resolveOrderItemsArray` and `resolveStructuredItems`, preventing both `TypeError: currentEditingOrderItems.forEach is not a function` and `"Item 1 Rs. 0.00"` receipt bugs.

### ✅ Resolved 5: Thermal Printing — Shop Logo, Dynamic UPI QR & Strict KOT Isolation (`src/core/platform-bridge.js`, `js/pos.js`)
- **Resolution:** Customer Tax Invoices (`isKot: false`) automatically hydrate the shop's 1-bit raster logo (`GS v 0`) from `shopProfile.logo` / `localStorage` and embed a native ESC/POS dynamic UPI QR (`GS ( k`) with the exact payable total, even when printed by a Cashier. Kitchen Order Tickets (`isKot: true`) are strictly isolated—zero shop details, logo, prices, GST, or QR code ever leak onto a KOT slip.

### ✅ Resolved 6: Real-Time Cloud Presence, Remote Staff Revocation & Role-Based Settings Lock (`js/staff.js`, `js/settings.js`)
- **Resolution:** Cloud Presence panel tracks all staff (up to 10 profiles per shop), showing `Inactive (Never Logged In)` for unlogged profiles, `Active (Active now)` for live sessions within the 15-minute heartbeat window, and `Offline (Active Xm ago)` when stale. Deleting a staff member revokes their session in Firestore and triggers `lockTerminalByRemote()` on their active terminal immediately. Floor Server role has Settings enabled solely for Bluetooth KOT printer pairing (`applySettingsRoleRestrictions`).

### ✅ Resolved 7: Gemini AI Fast Vision Cascade, 15-Scan Monthly Quota & BYOK (`server/gemini-service.js`, `server/quota-service.js`)
- **Resolution:** Menu OCR prioritizes `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` with a 7s per-model timeout and `thinkingBudget: 0`. Each shop receives 15 scans/month tracked in `/shops/{shopId}/quota/menu_scans` (returning HTTP 429 on the 16th scan), with full Bring-Your-Own-Key (`BYOK`) custom Gemini API key support in Settings.

### ✅ Resolved 8: Seamless Secondary Device Auto-Authorization & Passive Terminal Hub (`js/core.js`, `js/shop-auth.js`)
- **Resolution:** Option 1 implemented. Authenticated store logins (email + OTP/password) automatically authorize secondary devices and register them passively in Cloud Firestore under `/shops/{shopId}/devices/{deviceId}`. The legacy blocking `#devicePairingOverlay` (6-digit pairing code popup) is bypassed, sending staff directly to Staff Profile Selection -> PIN. Admins retain full visibility in Settings -> Authorized Devices Hub with instant one-click remote revocation (`status: 'REVOKED'`).

### ✅ Resolved 9: 24-Hour Shift Session Persistence, Salted Admin PIN & Active Sessions Purge (`js/core.js`, `js/staff.js`, `server/auth-service.js`)
- **Resolution:** Entering a verified 4-digit PIN records `billnaw_pin_verified_at = Date.now()`, enabling staff to reopen the app throughout the shift without repeated PIN prompts until exactly 24 hours (86,400,000 ms) elapse, enforced by `start24hShiftMonitor()`. Admin PINs are cryptographically hashed using canonical salted SHA-256 (`cleanPin:cleanSalt:billnaw_pin_v2`) on backend reset and synchronized to Firestore. Revoked, ended, or deleted sessions are permanently filtered from `renderLiveSessionCards`, which shows real-time elapsed inactivity telemetry (`Active now`, `Inactive for Xm / Xh`).

### ✅ Resolved 10: Sales & Billing Transactions Strictly Card View & Total Orders Modal (`js/dashboard.js`, `index.html`)
- **Resolution:** The reports transactions ledger is strictly Card View only (table toggle removed/hidden from user view). Clicking the "Total Orders" KPI card (`#kpiCard-orders`) opens `#ordersLogModal`, displaying transactions in responsive cards synchronized with the top date range filter (`currentDashboardRange` — Today, Yesterday, This Week, This Month, Custom). Each card features a prominent `Details` action (as well as card body tap) opening the full customer invoice modal (`#billInvoiceModal`).


---

## 4. LOCALSTORAGE AUDIT & DEPRECATION MAP

| Current LocalStorage Key | Status | Target Destination |
|---|---|---|
| `billnaw_auth_token` | Active | Encrypted Session Storage / Native Secure Storage |
| `billnaw_auth_email` | Active | Tenant Profile Cache |
| `billnaw_store_code` | Active | Scoped `cafe_id` Tenant Context |
| `billnaw_shop_session` | Active | Session Storage |
| `billnaw_menu` | Redundant | IndexedDB (`menu_items`) |
| `cafe_khata` | Redundant | IndexedDB (`customer_khata`) |
| `billnaw_culinary_*` | Redundant | IndexedDB (`culinary_*`) |
| `bongbhoj_device_id` | **Dead Code (Vendor Residual)** | Purge immediately |
| `bongbhoj_voice_buffer`| **Dead Code (Vendor Residual)** | Purge immediately |
| `cafeLicenseKey` | **Dead Code (Duplicate)** | Consolidate into `billnaw_license_key` |

---

## 5. REFACTOR ROADMAP SUMMARY

1. **Phase 1:** Architectural Audit & Database Selection (Firebase vs. Supabase).
2. **Phase 2:** Technical Specifications & Guardrail Blueprints (`ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `SERVICES_AND_API.md`, `UI_DESIGN_SYSTEM.md`).
3. **Phase 3:** Core Backbone, Security Rules, Integer Paise Engine & Two-Tier Auth.
4. **Phase 4:** Feature Module Migration (`tables`, `kot`, `billing`, `menu`, `inventory`, `customers`, `reports`).
5. **Phase 5:** PWA Service Worker, Cross-Platform Hardware Bridge (Thermal Printing) & Android Capacitor Packaging.
