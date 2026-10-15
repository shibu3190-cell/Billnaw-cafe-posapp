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

### Invariant 4: 100% Automated Test Suite Pass Rate
- Running `npm test` (all 12 test suites) must pass with **0 errors**.
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

### 6. Reports, Analytics & Transaction Ledger
- **Date Range Picker**: Quick filters for Today, Yesterday, This Week, This Month, and Custom Date Range.
- **Sales & Transaction Ledger**: Compact row structure with centered dates, left icons, right-aligned monetary values, and triple-dot action dropdown (`.action-dropdown`) with click-outside dismissal.
- **Transaction Editor**: Edit payment method, order channel (Dine-in vs Takeaway), customer notes, or line items with real-time gross revenue and net profit recalculation.
- **Interactive Visualizations**: SVG Donut chart displaying Revenue vs Expenses vs Category distribution with comparative toggles (Cash vs UPI, Dine-In vs Takeaway).

### 7. SaaS Subscription & Shop Settings
- **Transparent 3-Tier Pricing Model**:
  - **Starter**: ₹0 Free Forever (Single counter terminal, 50 orders/mo).
  - **Pro Cafe**: ₹499/mo (Most Popular, unlimited orders, multi-table, inventory & WhatsApp hub).
  - **Enterprise Chain**: ₹1,499/mo (Multi-outlet central kitchen, live cloud sync, custom reports).
  - Price-first typography hierarchy (28–32px) and "What's included next" callout.
- **Shop Profile & GST**: Live GST toggle, tax rate settings, receipt header/footer customization.
- **Device Isolation & Clean Logout**: `logoutShopCloudAccount()` flushes session cache and returns cleanly to `?auth=login`.
- **Pristine Reset**: Danger tile **"Clear All Store Data"** purges both local storage and cloud server Firestore collections, neatly re-seeding the 4-item clean state.

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
