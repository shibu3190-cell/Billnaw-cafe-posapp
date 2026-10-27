# BILLNAW CAFE POS — SYSTEM CONTEXT & AUDIT REPORT

> Generated: 2026-10-27 | Status: Pre-Launch Production Refactor | Target: Multi-Tenant SaaS POS (PWA / Android / Desktop)

---

## 1. REPOSITORY INVENTORY & METRICS

| Layer / Directory | Primary Files | Approximate Size | Key Responsibilities |
|---|---|---|---|
| **Client Shell** | `index.html` | 558 KB (~6,500 lines) | Monolithic shell containing HTML structure, 26 modal dialogs, and embedded auth/Firebase initialization scripts. |
| **Styling** | `style.css` | 183 KB (~7,500 lines) | CSS variables, typography, layout, mobile bottom navigation, and modal stylesheets. |
| **Client Logic (`js/`)** | `core.js` | 77 KB | Global state, IndexedDB (`CafePOS_DB`), remote Firestore sync listener, curated food image library. |
| | `pos.js` | 97 KB | POS terminal cart, catalog rendering, table selector, discounts, tender calculation, settlement. |
| | `culinary_inventory.js` | 199 KB | 13-feature culinary ERP: raw materials, sub-recipes, batching, dish costing, food cost simulation. |
| | `customers.js` | 100 KB | Customer CRM, Khata credit ledger, partial payment tracking, loyalty points, WhatsApp broadcast. |
| | `dashboard.js` | 73 KB | Reports, sales analytics, donut charts, transaction ledger, invoice reprint, export. |
| | `settings.js` | 45 KB | Cafe store profile, table management, tax/GST settings, cloud store reset, subscription tiers. |
| | `staff.js` | 16 KB | Staff list, roles, PIN auth, attendance ledger. |
| | `marketing_inventory.js`| 18 KB | Marketing materials and promotional assets. |
| **Backend Services (`server/`)** | `server.js` | 28 KB | Express API server, static file host, route registrations. |
| | `auth-service.js` | 41 KB | 6-digit OTP engine, user/shop tenant resolution, session token minting, SMTP email delivery. |
| | `inventory-service.js` | 67 KB | Server-side commissary batches, inventory restock, stock audits. |
| | `gemini-service.js` | 44 KB | Gemini 3.5 Flash menu parser, OCR receipt reader, dish image variation search. |
| | `config.js` | 2.5 KB | Environment variable loader, Firebase project config, SMTP credentials. |
| | `sheets-service.js` | 1.2 KB | Google Sheets relay endpoint. |
| | `quota-service.js` | 7 KB | Gemini AI token and quota limiter. |

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

## 3. CRITICAL AUDIT FINDINGS: VULNERABILITIES & STRUCTURAL DEBT

### 🚨 Critical Vulnerability 1: Insecure Database Rules (Open to Public)
- **File:** `firestore.rules` (Lines 4-28, 29-53)
- **Defect:** `allow read, write: if true;` on all documents.
- **Impact:** Any user with internet access can read, overwrite, or wipe any cafe's financial history, customer database, staff records, and menu.

### 🚨 Critical Vulnerability 2: Plaintext Staff PINs & MD5 Admin Hashing
- **File:** `server/auth-service.js` (Lines 152, 160)
- **Defect:** Staff records store `pin: '1234'` in plain text. Store profile stores `adminPinHash: crypto.createHash('md5').update('1234').digest('hex')`.
- **Impact:** MD5 is cryptographically broken; plain text PINs expose cashier credentials to client memory scraping.

### 🚨 Critical Vulnerability 3: Settled Invoice Deletion (Audit Anti-Tampering Violation)
- **File:** `js/dashboard.js` (Line 1178 in `voidTransaction`)
- **Defect:** `orderHistory = orderHistory.filter(o => String(o.id) !== String(orderId));` permanently removes bills from history.
- **Impact:** Violates tax and commercial compliance. Settled bills must be strictly immutable; cancellation must only transition to `VOID` status with reason, cashier ID, and timestamp.

### 🚨 Critical Vulnerability 4: Floating-Point Paise Rounding Errors
- **File:** `js/pos.js` (Lines 397, 454-456, 636, 863)
- **Defect:** Financial totals, taxes, and discounts computed with JavaScript IEEE 754 floating points (`parseFloat`, `toFixed(2)`).
- **Impact:** Accumulates fractional paise discrepancies (`0.1 + 0.2 = 0.30000000000000004`), causing tax audit mismatches.

### 🚨 Critical Vulnerability 5: Non-Deterministic Offline Invoice IDs & Race Collisions
- **File:** `js/pos.js` (Lines 1124-1128)
- **Defect:** Bill ID generated via `id: Date.now()` and sequential `Math.max(...bills) + 1`.
- **Impact:** Two offline counter terminals will generate identical invoice IDs, causing data loss during sync.

### 🚨 Critical Vulnerability 6: Monolithic Table State Overwrites
- **File:** `js/core.js` (Line 173, `tablesInfo`)
- **Defect:** Entire restaurant floor state stored as a single monolithic JSON blob (`tablesInfo`).
- **Impact:** If Waiter 1 updates Table 1 and Cashier updates Table 2 concurrently, the last write overwrites the other's changes.

### 🚨 Critical Vulnerability 7: Hardcoded Third-Party Webhook Secrets
- **File:** `server/config.js` (Line 35)
- **Defect:** Hardcoded Google Apps Script Webhook URL fallback in server source code.

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
