# 🧠 BILLNAW CAFE POS & CRM — SYSTEM MEMORY & ARCHITECTURE SPECIFICATION

> **Authoritative Project Memory**: This document serves as the persistent, single source of truth for the Billnaw Cafe POS & Integrated CRM web application. It outlines the architectural foundations, strict system invariants, module implementations, UI/UX design standards, and testing verification protocols.

---

## 1. 📌 Project Identity & Overview

- **Project Name**: Billnaw Cafe POS & Culinary Management Suite
- **Repository**: `https://github.com/shibu3190-cell/Billnaw-cafe-posapp.git` (Branch: `main`)
- **Working Directory**: `c:\Users\abhij\OneDrive\Desktop\Billnaw-cafe-posapp-main`
- **Default Local Port**: `http://localhost:5000` (Network host: `0.0.0.0:5000`)
- **Primary Mission**: Deliver a lightning-fast, production-grade, human-centered Cafe & Restaurant Point of Sale (POS) system with integrated customer CRM, dual debt khata ledger, culinary batching inventory telemetry, and AI-powered WhatsApp marketing.
- **Form Factor**: Mobile-first architecture optimized for smartphone touchscreens (for floor servers and counter staff) with seamless responsiveness for tablets and desktop billing monitors.

---

## 2. 🏗️ Tech Stack & Dependencies

### Frontend
- **Core Languages**: Vanilla HTML5, CSS3 (Modern Flexbox, CSS Grid, CSS Variables, Tabular Nums), JavaScript ES6+ (Module-free static script architecture).
- **Styling Architecture**: Centralized `style.css` (~5,480 lines) utilizing cohesive dark emerald neutral tokens (`#143832`, `#1B4940`, `#0F2924`, `#F8F6F2`, `#E2E8F0`) with verified WCAG 3:1+ contrast ratios.
- **Iconography**: 100% structured inline vector SVGs matching Lucide guidelines (`24x24` viewBox, `1.8px` - `2.5px` stroke width, zero raw Unicode emojis).
- **Typography**: Single font family `'Poppins', sans-serif` across all components; tabular figures (`tabular-nums`) for currency and totals to eliminate layout shifts.
- **Client Persistence**: IndexedDB & LocalStorage with full cloud Firestore synchronization fallback.

### Backend & Cloud
- **Runtime**: Node.js (v18+) with Express (`express: ^4.21.2`).
- **AI Integrations**: Google Gemini AI (`@google/genai: ^2.23.0`) for OCR menu parsing, smart catalog digitization, and curated dish photo variation generation.
- **Email & Auth Service**: Nodemailer (`nodemailer: ^10.0.10`) for 6-digit Email + OTP delivery via Google SMTP (`smtp.gmail.com`).
- **Cloud Database & Auth**: Firebase Auth and Cloud Firestore (`abhi-pro-cafe-pos` / `ai-studio-billnawcafepos-*`).

---

## 3. 🛡️ Critical System Invariants (DO NOT BREAK)

Any modification to this codebase must strictly preserve the following four system invariants:

### Invariant 1: Exactly 26 SVG Modal Close Buttons in `index.html`
- `index.html` strictly requires **exactly 26 SVG modal close buttons** matching the regex:
  ```regex
  /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g
  ```
- **Total occurrences of `modal-close-btn` class**: Must remain **strictly 26**.
- **Zero raw unicode `'✕'` or `'X'` characters** inside any `modal-close-btn`.
- **Close Button Geometry**: All 26 buttons must have a `15x15` SVG child with `viewBox="0 0 24 24"` and `stroke-width="2.5"`.
- **Non-Modal Dialogs**: Any new non-standard overlays, drawers, sheets, or popovers MUST use distinct, collision-free close classes:
  - Khata modals: `.khata-close-btn`
  - Mobile slide navigation drawer: `.slide-menu-close-btn`
  - Customer hub more drawer: `.more-close-btn`
  - Table configuration: `.tbl-close-btn`
  - Session manager: `.session-close-btn`
  - Inventory RTR modals: `.rtr_close_btn`

### Invariant 2: Zero Raw Unicode Emojis in Operational Elements
- No raw emojis (`🍔`, `📊`, `❌`, `✅`, `🔥`, etc.) in operational `<button>`, navigation tabs, pills, or status chips.
- All iconography must use inline Lucide vector SVGs with clean stroke weights.
- State styling: outlined stroke for inactive states, filled accent or increased weight for active states.

### Invariant 3: Zero DOM Duplication for Responsiveness
- Do not duplicate HTML structures for mobile vs desktop.
- Responsive changes across viewport breakpoints (`320px`, `640px`, `900px`, `1080px`, `1200px`) must rely exclusively on CSS Media Queries and toggled classes.

### Invariant 4: 100% Automated Test Suite Pass Rate & Firestore Rules Binary Parity
- `firestore.rules` and `database/firestore.rules` must remain **100% byte-for-byte identical** (`cmd /c fc /b firestore.rules database\firestore.rules`).
- Running `npm test` (all 24 test suites) must pass with **0 errors**.
- Running `node scratch/test_e2e_production_hardening.cjs` (86 tests) must pass **86 / 86 tests**.
- Running `node scratch/test_new_shopowner_4staff_e2e_simulation.cjs` (20 full-stack stages) must pass **20 / 20 tests**.
- Running `node scratch/test_consolidated_hub_suite.cjs` (100 tests) must pass **100 / 100 tests**.
- Running `node scratch/challenger_m4_empirical_suite.cjs` (28 tests) must pass **28 / 28 tests**.

---

## 4. 📱 Core Features & Architectural Modules

### 1. Viewport-Locked Shell & Navigation
- **Root Lock**: `html` and `body` enforce `height: 100vh; height: 100dvh; width: 100%; overflow: hidden; overscroll-behavior: none;`.
- **View Isolation**: Container wrapper (`.main-wrapper, .app-layout`) enforces `overflow: hidden;`. Active hub views (`#pos`, `#menu`, `#customers`, `#inventory`, `#dashboard`, `#settings`) control internal scroll with `-webkit-overflow-scrolling: touch; overscroll-behavior: contain;`.
- **Top Bar**:
  - Clickable Billnaw brand logo toggling slide menu drawer (`toggleMobileSlideMenu`).
  - Cashier profile avatar toggling structured account popover (`#accountPopoverCard`).
  - Notification Bell (`#topbarNotificationBellBtn`, $44\times 44\text{px}$) with live unread counter, opening slide-out alert drawer for stock and unpaid bill warnings.
- **Bottom Navigation Dock (Mobile)**:
  - Exactly 5 core destinations: **POS**, **Menu**, **Report**, **Inventory**, and **More** (Customer Directory, WhatsApp, Settings).
  - Minimum $44\times 44\text{px}$ touch targets with `padding-bottom: max(16px, env(safe-area-inset-bottom, 24px))`.
  - Dual visual active cues: outline-to-fill SVG transition, bold text, and emerald bottom glow line.

### 2. POS Terminal & Mobile Cart Drawer
- **Table Selector**: Live visual table cards with real-time status badges (Vacant in emerald, Occupied with elapsed minutes in amber, Billed in blue).
- **Search & Voice Bar**: Integrated microphone button with clickable contextual speech chips (`"2 Hot Chai"`, `"2 Samosa"`) for 1-tap reordering.
- **Culinary Item Grid**:
  - **Mobile (< 640px)**: Strictly **2 columns** with appetizing food photos and $44\text{px}$ pseudo-element quantity steppers.
  - **Desktop / Tablet ($\ge 641\text{px}$)**: Strictly **4 columns** (grid container supports 3 rows $\times$ 4 columns for expansion).
  - **Pristine 4-Item Menu Baseline**: Samosa (₹15), Tea (₹10), Chicken Curry (₹140), and Masala Coke (₹40).
- **POS Cart Review**:
  - **Mobile**: Slides up smoothly from bottom (`#cartDrawer`) with grab handle (`.drawer-handle` with `touch-action: pan-y;`), overlay backdrop (`#cartDrawerOverlay`), and floating dock (`#floatingCart`) with live count and checkout action.
  - **Desktop**: Locks cleanly into fixed 360px right-hand sidebar.

### 3. Unified AI Menu Ingestion & Catalog Digitizer
- **Single Ingest Zone**: Consolidated into a single dashed hero card (`.bulk-upload-dashed-card` in `#menuInventorySubView`).
- **Multi-Source Support**:
  1. *Drag & Drop*: Ingests PDFs, spreadsheets, and dish photo files via `ondragover` / `ondrop`.
  2. *Live Camera Snap*: Immediate camera input trigger (`#aiMenuCameraInput`).
  3. *Auto-Detect Menu*: Instant Gemini OCR review modal (`#menuCatalogAutoDetectBtn`).
- **Curated Gourmet Food Photography Engine**:
  - 26 culinary categories mapped to authentic high-resolution gourmet photos.
  - 4-variation photo cycling with `"🎲 Next Photo"` without low-quality overrides or watermarks.

### 4. Consolidated Customer, Khata & AI WhatsApp Hub
The `#customers` view unifies customer management into 3 clean segmented tabs:
1. **Tab 1: Customer Directory & Loyalty**:
   - Desktop: High-contrast data table with avatar initials, phone link, loyalty tier (Platinum, Gold, Silver, Bronze), visits, lifetime spend, and actions.
   - Mobile (< 640px): Responsive CSS Grid customer cards (`grid-template-areas: "avatar-name tier-badge" "phone-link spend" "visits-meta last-visit" "action-bar action-bar"`).
   - Verbose button hidden on mobile (`.cust-btn-manage-text { display: none !important; }`), preserving Quick Bill, WhatsApp, and 3-dot dropdown (`.action-dropdown`).
2. **Tab 2: Khata & Due Ledger**:
   - Dual segmented toggle: **Customer Udhar (To Receive)** and **Supplier Dues (To Pay)**.
   - Status tracking: Pending vs Overdue with due date calculations.
   - 1-Tap **"📲 Send WhatsApp Due Reminder"** with polite personalized pre-filled copy.
   - Modals: `#addKhataDueModal` and `#recordKhataPaymentModal` utilizing `.khata-close-btn` and 48px touch inputs.
3. **Tab 3: AI WhatsApp Marketing Hub**:
   - AI-Powered Banner with two main actions:
     - **⚡ Weekly AI Scan**: Classifies diner frequency (VIPs, Inactive Regulars, Weekend Diners).
     - **🚀 Send Campaign**: Personalized diner name tags (`{customer_name}`), bulk checklist, and 1-tap WhatsApp broadcast.

### 5. Indian Culinary Engineering Inventory & RTR Telemetry
- **Composition Engine**: Nested sub-recipes and Morning Bulk Batching (e.g., 20L Makhani Gravy deducting 9 raw ingredients and crediting sub-recipe stock).
- **Live Order Deduction**: Settlement of POS dishes (e.g., Chicken Curry) deducts exact portions of poultry, gravy base, oil, and spices with zero phantom data.
- **Liquid Telemetry Matrix**: Precise volume deductions for beverages and draft beer with configurable pour froth/foam buffers (5–8%).
- **Live Food Costing**: Dynamic recalculation of unit dish food cost and gross profit margin percentage when raw material supplier prices fluctuate.

### 6. Reports, Analytics, Order Cards View & Full-Screen Invoice Modal
- **Date Range Picker**: Quick filters for Today, Yesterday, This Week, This Month, and Custom Date Range.
- **Interactive Order Cards Grid (`#historyCardsGrid`) & Table Toggle**:
  - Settled bills render by default as responsive, clickable Order Cards (`.order-history-card`) displaying Bill #, Table/Channel badge, Customer, Staff Biller, Payment Mode, Item Summary, and Total Amount (`₹ `).
  - Clicking any Order Card opens the **Full-Screen Invoice Modal (`#billInvoiceModal`)** with Shop Logo (`#invModalLogo`), statutory headers (Address, Phone, FSSAI, GSTIN), itemized table, GST breakdown, dynamic UPI QR preview, and working **Edit Order (`openEditOrderModal`)**, **Void Bill (`voidTransaction`)**, and **Reprint (`sendEscPosToPrinter`)** buttons.
- **Resilient Transaction Editor (`resolveOrderItemsArray`)**: Safely resolves structured item arrays from either `order.rawItems` or legacy string `order.items` (e.g. `"Cold Coffee (x2), Veg Puff (x1)"`), eliminating `TypeError: currentEditingOrderItems.forEach is not a function` and synchronizing both `rawItems` and `items` upon save.
- **Interactive Visualizations**: SVG Donut chart displaying Revenue vs Expenses vs Category distribution with comparative toggles (Cash vs UPI, Dine-In vs Takeaway).

### 7. Multi-Tenant Cloud Sync, Subscription Lifecycle & 4-Role Staff Architecture
- **Dual-Path Firestore Persistence (`/shops/{shopId}` & `/cafes/{cafeId}`)**:
  - Store documents, menus, staff profiles, active sessions, tables, invoices, and print queues sync across `/shops/{shopId}` and `/cafes/{cafeId}` tagged with `shopEmail` and `shopId`.
- **Backend Subscription Lifecycle (`server/subscription-service.js` & `js/core.js`)**:
  - Supports `ACTIVE`, `PAUSED`, `RESUMED`, and `REVOKED` states via `POST /api/subscription/manage` and `GET /api/subscription/status`.
  - Real-time `storeDocRef` snapshot listener immediately disables checkout with a banner when `PAUSED`, locks the terminal with a full-screen overlay when `REVOKED`, and restores billing when `ACTIVE` or `RESUMED`.
- **Staff Onboarding (4-Digit OTP -> Salted SHA-256 PIN), Cloud Presence & Remote Revocation (`js/staff.js`, `src/core/rbac.js`)**:
  - Supports up to **10 staff profiles per shop** across canonical roles (`Admin`, `Manager`, `Cashier`, `Floor Server`, `Kitchen Chef`).
  - Admin creates a profile with an auto-generated 4-digit temporary OTP (`onboardingOtp`). When the staff member logs in on a secondary device, they select their profile, validate the 4-digit OTP, and create their own private salted SHA-256 PIN (`cleanPin:cleanSalt:billnaw_pin_v2`) in `#firstLoginPinModal`.
  - **Cloud Presence Panel**: Displays `Active (Active now)` (emerald dot) for sessions active within 15 minutes, `Offline (Active Xm ago)` (gray dot `#94A3B8`) for stale sessions, and `Inactive (Never Logged In)` for profiles that have not yet completed first login.
  - **Immediate Remote Logout**: Deleting a staff profile deletes `/shops/{shopId}/staff/{id}`, marks their sessions `REVOKED` (`isLocked: true`), and immediately triggers `lockTerminalByRemote()` on their active device.
  - **Floor Server Settings Lock**: `applySettingsRoleRestrictions()` in `js/settings.js` enables the Settings tab for `Floor Server` solely to pair a Bluetooth thermal printer (`#settingTilePrinterConfig`) for KOT printing while shielding all administrative tiles.

### 8. Thermal Printing: Shop Logo, Dynamic UPI QR & Strict KOT Isolation (`src/core/platform-bridge.js`)
- **Customer Tax Invoice (`isKot: false`)**:
  - Automatically hydrates the shop logo (`GS v 0` 1-bit raster bitmap) from `shopProfile.logo` / `localStorage.getItem('billnaw_shop_logo')` and generates a native ESC/POS dynamic UPI QR (`GS ( k`) encoding the exact bill total (`upi://pay?pa={upiId}&pn={storeName}&am={total}&cu=INR`), even when printed by a Cashier.
  - Resolves item names and prices via `resolveStructuredItems()` so historical or string-item orders never print `"Item 1 Rs. 0.00"`.
- **Kitchen Order Ticket (`isKot: true`)**:
  - Strictly isolated from customer billing metadata: never prints shop logo, shop name, address, phone, FSSAI, GSTIN, prices, GST breakdown, or UPI QR code.
  - Supports **ADD-ON KOT** (Delta-KOT) printing only newly added quantities (`qty - qtyKotPrinted`), and KDS (`src/features/kot/kot.ui.js`) renders quantities cleanly via `it.quantity || it.qty || 1`.

### 9. Gemini AI Fast Vision Cascade, 15-Scan Monthly Quota & BYOK (`server/gemini-service.js`, `server/quota-service.js`)
- **Fast Vision Model Cascade**: Prioritizes `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, and `gemini-flash-latest` with a 7,000ms per-candidate timeout and `thinkingBudget: 0`, plus a multi-strategy JSON parser (`parseMenuJsonSafely`) that handles markdown fences, currency prefixes (`₹`, `Rs.`), and dietary tags.
- **15-Scan Monthly Quota & BYOK**: Tracks 15 scans per shop per calendar month (`YYYY-MM`) in `/shops/{shopId}/quota/menu_scans`. Rejects the 16th scan with HTTP 429 (`Monthly AI scan quota of 15 scans reached for this shop.`) and supports Bring-Your-Own-Key (`BYOK`) custom Gemini API keys via Settings and `x-gemini-api-key`.

---

## 5. 📁 Key File Map

| File Path | Description |
|---|---|
| [`index.html`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/index.html) | Single-page application DOM shell containing all 6 hub views and exactly 26 SVG `modal-close-btn` modals |
| [`style.css`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/style.css) | Core CSS design tokens, 100dvh viewport locking, media queries, touch ergonomics, and card layouts |
| [`server.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/server.js) | Express HTTP server, Gemini AI proxy, auth session management, and Firestore data reset endpoints |
| [`js/core.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/core.js) | Global state, default dishes (Samosa, Tea, Chicken Curry, Masala Coke), curated food photo registry |
| [`js/pos.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/pos.js) | POS terminal logic, table management, cart calculations, mobile cart drawer triggers, checkout |
| [`js/menu.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/menu.js) | Catalog rendering, AI menu dropzone handling, Gemini OCR parsing, dish photo variation cycling |
| [`js/customers.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/customers.js) | Customer directory rendering, loyalty tier calculations, Khata dual ledger, WhatsApp broadcast composer |
| [`js/culinary_inventory.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/culinary_inventory.js) | Raw materials telemetry, morning batching composition engine, recipe costing, live order deductions |
| [`js/dashboard.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/dashboard.js) | Sales ledger, interactive donut chart analytics, date picker filtering, transaction editor |
| [`js/settings.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/js/settings.js) | Store profile, subscription tiers, cashier PIN management, cloud sync status, store reset |
| [`server/auth-service.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/server/auth-service.js) | Email + OTP generation, verification, password hashing, session tokens, Demo POS mode |
| [`server/gemini-service.js`](file:///c:/Users/abhij/OneDrive/Desktop/Billnaw-cafe-posapp-main/server/gemini-service.js) | Gemini API interface for menu OCR digitization and gourmet food photography prompt expansion |

---

## 6. 🧪 Verification & Audit Commands

Run these commands from PowerShell in `c:\Users\abhij\OneDrive\Desktop\Billnaw-cafe-posapp-main`:

### 1. Canonical Full Test Suite (12 Suites, 313 Tests)
```powershell
npm test
```
*Expected Result*: Exits with code 0; all 12 suites pass with 0 failures.

### 2. Consolidated Hub E2E Suite (100 Tests)
```powershell
node scratch/test_consolidated_hub_suite.cjs
```
*Expected Result*: `TOTAL SUITE RESULT: 100 / 100 PASSED (0 FAILED)`.

### 3. Challenger Empirical Suite (28 Tests)
```powershell
node scratch/challenger_m4_empirical_suite.cjs
```
*Expected Result*: `VERDICT: APPROVE (28 PASSED, 0 FAILED)`.

### 4. Forensic Modal Invariant Inspector
```powershell
node scratch/forensic_modal_inspector.cjs
```
*Expected Result*: `Found 26 modal close buttons: ...` (exactly 26).

### 5. Duplicate ID Detection
```powershell
node scratch/check_duplicate_ids.cjs
```
*Expected Result*: `Total unique IDs: 621, Duplicate IDs count: 0`.

### 6. Headless Browser Visual Tab Verification
```powershell
node scratch/test_all_tabs_visual.cjs
```
*Expected Result*: Verifies all 6 tabs (`#pos`, `#menu`, `#dashboard`, `#inventory`, `#customers`, `#settings`) render with `display: flex`, `opacity: 1`, non-zero dimensions, and 0 console exceptions.

---

## 7. 💡 Operational Guidelines for Developers & Subagents

1. **Server Lifecycle & Port 5000**: The Express backend (`server.js`) must be running on port 5000 (`npm start` or daemonized `node server.js`). If the server process is down, the Service Worker will serve offline cached files but backend APIs (`/api/config/client`, `/api/inventory/*`, `/api/version`) will throw `ERR_CONNECTION_REFUSED`.
2. **Google Firebase Custom Token Validation**: Client-side Firebase SDK's `signInWithCustomToken(auth, token)` strictly requires RS256 JWT tokens minted with a Google Service Account private key. Internal HMAC-SHA256 session tokens must be validated with `isGoogleFirebaseCustomToken(token)` before being passed to Firebase Auth to prevent `400 (Bad Request)` network errors.
3. **PowerShell Statement Separators**: Never run chained commands like `cmd1 && cmd2` or `cmd1; cmd2; cmd3` in PowerShell subagent environments. Always run commands individually or create dedicated script files.
4. **Preserve the Modal Invariant**: Never add a `.modal-close-btn` SVG button to any new modal without accounting for the exact 26 test invariant. Use a feature-specific class (e.g. `feature-close-btn`).
5. **No Raw Unicode Emojis**: Always use inline SVGs with standard 24x24 viewBox.
6. **CSS Breakpoint Integrity**: Maintain clean boundaries between mobile (< 640px), tablet (641px - 1080px), and desktop (> 1080px). Always check that `.menu-grid` remains strictly 2 columns on mobile and 4 columns on desktop.
7. **No Cheating or Dummy Facades**: All implementations must be genuine, working, and validated through real headless/browser or unit assertions.

---

## 8. 🍽️ Menu Catalog: 3-Dot Action Dropdown & Mobile Readability

### Problem Solved
On mobile screens ($\le 640\text{px}$), `.clean-item-card` previously rendered 3 inline buttons (`Adjust Stock`, Edit pencil, Delete trash) inside `.clean-item-right`, taking $\approx 175\text{px}$ of horizontal space. This compressed the dish title row (`.clean-item-name`) to $< 60\text{px}$, forcing dish names to truncate awkwardly into 4-letter prefixes with ellipses (e.g., "Samo...", "Tea", "Chick...", "Masa...").

### Architecture Implementation
1. **3-Dot Action Trigger (`.clean-item-more-btn`)**:
   - Replaced the 3 inline buttons on `.clean-item-card` with an accessible 3-dot trigger button (`.action-dropdown-btn.clean-item-more-btn`) with vector SVG ellipsis.
   - Sized for mobile ergonomics ($36\times 36\text{px}$, $\ge 44\times 44\text{px}$ touch envelope).
2. **Elevated Floating Dropdown (`.action-dropdown-menu`)**:
   - Positioned absolutely (`top: calc(100% + 4px); right: 0; z-index: 1050; min-width: 155px;`).
   - `.clean-item-card.dropdown-open` receives elevated `z-index: 60` to ensure no overlap by subsequent cards.
   - Contains strictly 3 functional options with inline Lucide vector SVGs:
     - 📦 **Adjust Stock** (`openQuickAdjustStockModal(item.id)`)
     - ✏️ **Edit Item** (`editMenuItem(item.id)`)
     - 🗑️ **Delete Item** (`deleteMenuItem(item.id)` with `.danger` styling)
3. **Event Management**:
   - `toggleMenuItemDropdown(event, itemId)` cleanly toggles individual item dropdowns while closing any other open menus.
   - `closeAllMenuActionDropdowns()` closes all open menu dropdowns and strips `.dropdown-open` from parent cards.
   - Global document click listener dismisses dropdowns when tapping outside.
4. **Empirical Verification (`scratch/test_menu_3dot_dropdown.cjs`)**:
   - Verified in headless Chrome at 375×667 viewport: all dish names render with full width ("Chicken Curry" at $104.9\text{px}$, "Masala Coke" at $93.8\text{px}$, "Samosa" at $59.5\text{px}$) with zero truncation.
   - Verified 3-dot click opens dropdown, click outside dismisses, and clicking "Adjust Stock" launches `#quickAdjustStockModal`.
   - Verified 100% test pass rate across all suites and exact 26 SVG modal close buttons invariant.
5. **Quick Stock Adjustment Null Safety Fix (`js/menu.js`)**:
   - `saveQuickStockAdjustment` and `toggleStockUnlimited` previously invoked `closeQuickAdjustStockModal()` before calling `showToast()`. Because `closeQuickAdjustStockModal()` sets `activeAdjustingItem = null`, accessing `activeAdjustingItem.name` in `showToast` caused `Uncaught TypeError: Cannot read properties of null (reading 'name')`.
   - Resolution: Stored `itemName` and `finalQty` into local variables before closing the modal, and added fallback item lookup from `#quickAdjustItemId` if `activeAdjustingItem` was unreferenced. Validated via `scratch/test_quick_stock_adjustment_fix.cjs` (100% pass).

---

## 9. 📱 Modern Multi-Device Architecture: Auto-Authorize on Store Login + Passive Audit (Option 1)

### Problem Solved
Previously, secondary terminals/tablets were blocked by a legacy 6-digit `#devicePairingOverlay` ("Device Pairing Required") popup, which required an admin on the master counter to manually enter a 6-digit code. In a modern cafe setting where staff login with store email/OTP followed by profile selection, temporary onboarding OTP, and salted private 4-digit PINs, this blocking hardware popup caused unnecessary friction and blocked secondary devices.

### Architecture Implementation (Option 1)
1. **Auto-Authorize on Store Login (`js/shop-auth.js` & `js/core.js`)**:
   - Secondary devices logging in via store email/OTP or password directly set `localStorage.setItem('billnaw_device_status', 'AUTHORIZED')`.
   - `verifyDeviceAuthorizationOnLogin` and `initDevicePairingFlow` suppress `#devicePairingOverlay` for authenticated devices.
   - Secondary devices register passively in Firestore under `/shops/{storeCode}/devices/{deviceId}` with a default name (`Counter Terminal XXXX` or `Mobile Terminal XXXX`).
2. **Immediate Profile Picker Routing**:
   - Device displays smooth loading/sync overlay and immediately proceeds to `#loginStaffPicker` (Staff Profile Selector).
   - Staff member enters temporary onboarding 4-digit OTP or their salted personal PIN to unlock the POS according to their assigned role.
3. **Passive Audit & Instant Remote Revocation**:
   - Admin can view all registered devices under **Authorized Terminals Hub** in Settings.
   - Admin can rename terminals or click **"Revoke"** at any time.
   - When an Admin revokes a terminal (`status: 'REVOKED'`), the terminal's real-time snapshot listener detects this immediately, invokes `handleDeviceRevocation()`, purges all local tenant data, and locks the terminal behind `#deviceRevokedOverlay`.
4. **Verification**:
   - Validated via `scratch/test_device_pairing_elimination_option1.cjs` (11/11 tests pass).
   - Validated in full-stack simulation `scratch/test_new_shopowner_4staff_e2e_simulation.cjs` (20/20 stages pass).

---

## 10. 🔐 24-Hour Shift Sessions, Salted PINs & Active Sessions Telemetry

### Architecture Implementation
1. **24-Hour Shift Boundary (`js/core.js` & `js/staff.js`)**:
   - Entering a verified 4-digit PIN records `billnaw_pin_verified_at = Date.now()`.
   - Reopening or refreshing the POS retains the session without prompting for PIN again until exactly 24 hours (86,400,000 ms) pass.
   - `start24hShiftMonitor()` periodically checks the elapsed time and locks the terminal when 24 hours expire.
2. **Backend-Safe Salted Admin PIN**:
   - Forgot PIN reset via email OTP generates a cryptographically secure 16-byte hex salt on the backend (`server/auth-service.js`).
   - Hashes with `${cleanPin}:${cleanSalt}:billnaw_pin_v2` and syncs both `pin_hash` and `pin_salt` to `/shops/{shopId}/staff/{adminId}` and `/shops/{shopId}.adminPinHash`.
3. **Active Sessions Purge & Telemetry (`js/staff.js`)**:
   - Sessions marked as `REVOKED`, `DELETED`, or `ENDED` are permanently filtered out from the active sessions list (`renderLiveSessionCards`).
   - Only live, active sessions are displayed, with real-time inactivity telemetry:
     - `🟢 Active now` (within 2 minutes)
     - `⚪ Inactive for Xm` (2 to 59 minutes)
     - `⚪ Inactive for Xh` (60+ minutes)
4. **Verification**:
   - Validated via `scratch/test_staff_pin_sessions_24h_lifecycle.cjs` (15/15 tests pass).

---

## 11. 📊 Sales & Billing Transactions Strictly Card View & Total Orders Modal

### Problem Solved
Previously, the reports section offered a confusing toggle between cards and table ledger views. When clicking the "Total Orders" KPI card, the interface did not display a focused transaction view synchronized with the active date range filter or provide seamless access to customer invoices.

### Architecture Implementation
1. **Strictly Card View in Reports Section (`index.html` & `js/dashboard.js`)**:
   - The view mode toggle (`dashFilterPill-group`) in the reports section is hidden (`display: none;`), enforcing strictly modern, responsive card views (`#historyCardsGrid`).
   - `setDashboardViewMode()` defaults and locks to `'cards'`, hiding table view containers.
2. **Total Orders KPI Card Navigation (`filterDashboardByMetric('orders')`)**:
   - Clicking `#kpiCard-orders` calls `filterDashboardByMetric('orders')`, which opens `#ordersLogModal`.
   - `#ordersLogModal` uses collision-free close button `.orders-log-close-btn` (preserving the strict 26 `.modal-close-btn` invariant).
3. **Top Date Range Synchronization (`currentDashboardRange`)**:
   - `#ordersLogModal` dynamically filters transactions matching the top selection (`today`, `yesterday`, `week`, `month`, `custom`, `all`).
   - Dynamic subtitle `#ordersModalFilterSubtitle` states: `Showing X completed orders for <Range> (Filtered by top selection)`.
   - Live telemetry badges display total orders count (`#ordersModalCountBadge`) and gross settled sum (`#ordersModalAmountBadge`).
   - Quick search input (`#ordersModalSearchInput`) allows instant filtering by bill #, customer name, items, or payment method with page reset.
4. **Details Invoice Action (`viewOrderInvoiceModal`)**:
   - Card primary button is labeled **"Details"** (`<span>Details</span>`) with document SVG, calling `viewOrderInvoiceModal(order.id)`.
   - Tapping the order card body also triggers `viewOrderInvoiceModal(order.id)`, opening `#billInvoiceModal` (full customer tax invoice with GST breakdown, dynamic UPI QR code, Edit, Void, and Print actions).
5. **Verification**:
   - Validated via `scratch/test_report_total_orders_card_view.cjs` (100% pass).
   - All 26 `.modal-close-btn` SVGs, 0 button emojis, and Firestore rules parity preserved.



