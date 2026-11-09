# Royal Cafe POS & Operations Manual

This document provides a comprehensive operational and architectural manual for **Royal Cafe POS (The Bong Bhoj Terminal)**, featuring a 5-hub navigation system, real-time Firestore synchronization, multi-tier customer loyalty, AI menu scanning, and reporting.

---

## 1. Five-Hub Core Architecture

The user interface is structured around 5 central operational hubs:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             ROYAL CAFE POS SHELL                            │
├───────────────┬───────────────┬───────────────┬───────────────┬─────────────┤
│ 📊 DASHBOARD  │ 👥 CUSTOMERS  │    🛒 POS     │   🍽️ MENU     │ ⚙️ SETTINGS │
│  & Analytics  │   & Loyalty   │ (Default/Home)│ & Dish Manager│ & Team Mgt  │
└───────────────┴───────────────┴───────────────┴───────────────┴─────────────┘
```

1. **📊 Dashboard & Analytics (`#dashboard`)**:
   - High-level KPI summary cards: **Gross Sales**, **Total Expenses**, **Net Operating Profit**, **Orders Count**, and **Average Ticket Size**.
   - Time filters: **Today**, **Yesterday**, **This Week**, **This Month**, and **All Time**.
   - Interactive metric filters to drill down into Cash, UPI, and Card transactions.
   - Top 5 bestsellers breakdown with sold counts and revenue.
   - One-click **📥 Export Sales (CSV)**, **📥 Export Expenses (CSV)**, and **🖨️ Daily Z-Report (Day Close)** generation.

2. **👥 Customer Directory & Loyalty Hub (`#customers`)**:
   - Customer profile registry with phone numbers, visit counters, total lifetime spend, loyalty points, and notes.
   - Automated **Loyalty Tiers**:
     - 🥉 **Bronze**: 0–4 visits
     - 🥈 **Silver**: 5–14 visits
     - 🥇 **Gold**: 15–29 visits
     - 👑 **Platinum**: 30+ visits
   - Live search by Name, Phone, or Notes, plus Tier-based filtering.
   - **📥 Export Customer Directory (CSV)** and instant order initiation for any customer.

3. **🛒 POS Billing & Table Manager (`#pos`) [Default Landing View]**:
   - Dynamic table matrix with occupancy timers, active item count, and running bill totals.
   - Fast category-filtered menu items grid with real-time stock badges.
   - Live Order Cart with quantity controls, discounts, customer phone binding, and payment selector (Cash, UPI with dynamic QR generation, Card).
   - Instant ESC/POS Bluetooth Thermal Receipt Printer and Kitchen Order Ticket (KOT) support.

4. **🍽️ Menu & Dish Catalog (`#menu`)**:
   - Complete item and category management.
   - AI Menu OCR Scanner (via Google Gemini 2.5 Flash) to parse printed or photo menus into catalog items in seconds.
   - AI Dish Image Generator with automatic high-res fallback visuals.
   - Stock inventory tracking with low-stock alerts.

5. **⚙️ Settings, Staff & Store Profile (`#settings`)**:
   - Streamlined horizontal grid featuring modular detail modals:
     - 🏢 **Store Profile & Branding**: Shop name, address, FSSAI number, GSTIN, and custom logo.
     - 👥 **Staff & Team Management**: Multi-staff authorization, role assignment (Cashier, Waiter, Manager), and custom PIN codes.
     - 💎 **Subscription & Billing**: Active Free Pro tier with zero billing locks and enterprise cloud sync.
     - 🧾 **GST & Tax Configuration**: Configurable CGST/SGST rates, inclusive/exclusive pricing modes, and start invoice number.
     - 💳 **Payment & UPI QR**: Dynamic QR code generation for payments directly to merchant VPA.
     - 🔄 **Cloud Sync & Terminals**: Firestore bidirectional sync state and custom Shop Store Code (`SHOP-BILLNAW-01`).
     - 📞 **Contact & Support**: Integrated direct helpdesk and concierge support.

---

## 2. Real-Time Cloud Firestore Sync & Multi-Tenant Security

All store data syncs automatically across terminals and devices using Google Cloud Firestore with hardened tenant & email boundaries (`firestore.rules` and `database/firestore.rules`):

- **Database ID**: `ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda`
- **Primary Store Scope**: `/shops/{shopId}` and `/cafes/{cafeId}` (tagged with `shopEmail` and `shopId`)

### Data Collections
| Collection Path | Purpose |
| :--- | :--- |
| `/shops/{shopId}` & `/cafes/{cafeId}` | Store profile (name, logo, address, phone, FSSAI, GSTIN, UPI ID), tax settings, subscription status (`ACTIVE`, `PAUSED`, `RESUMED`, `REVOKED`). |
| `/shops/{shopId}/menu` | Menu categories, dish details, pricing, GST rates, dietary tags, stock counts. |
| `/shops/{shopId}/staff` | Authorized staff profiles (max 10/shop: `Admin`, `Cashier`, `Floor Server`, `Kitchen Chef`), temporary 4-digit onboarding OTPs, salted SHA-256 PIN hashes (`billnaw_pin_v2`). |
| `/shops/{shopId}/sessions` | Real-time active cloud presence (`ONLINE`, `OFFLINE`, `REVOKED`), device binding, last-seen heartbeats, and remote terminal lock flags. |
| `/shops/{shopId}/tables` | Real-time dine-in table states (`T1`, `T2`, ...), occupied item lists, and Delta-KOT print counters (`qtyKotPrinted`). |
| `/shops/{shopId}/invoices` | Immutable settled customer tax invoices (30-day audit-logged `PAID -> VOID` transition; physical deletion forbidden). |
| `/shops/{shopId}/printQueue` | Isolated remote KOT print queue (`jobType == 'KOT'`). |
| `/shops/{shopId}/quota/menu_scans` | Monthly Gemini AI menu scan quota tracker (15 scans/month/shop with automatic `YYYY-MM` rollover and BYOK key masking). |
| `/shops/{shopId}/expenses` | Daily operational expense vouchers with categories and payment methods. |
| `/shops/{shopId}/customers` | Customer CRM records, Khata due ledger, loyalty points, and visit logs. |

---

## 3. Google Gemini AI Architecture, 15-Scan Monthly Quota & BYOK

### 3.1 Data Flow & Fast Vision Cascade Pipeline
The application uses a fast **Google Gemini Flash-Lite Vision Cascade** (`gemini-3.5-flash-lite` -> `gemini-3.1-flash-lite` -> `gemini-flash-latest`) with a **7,000ms per-candidate timeout** and `thinkingBudget: 0` to parse printed, handwritten, or digital cafe menus from uploaded images and PDF documents without false "no clear image" timeouts.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GEMINI MULTIMODAL PIPELINE                        │
└─────────────────────────────────────────────────────────────────────────────┘
  [ Client Browser (js/menu.js) ]
         │ 1. User uploads menu image/PDF (JPEG, PNG, WebP, PDF)
         │ 2. File converted to standard Base64 string + MIME type
         ▼
  [ POST /api/ai/scan-menu ] ──► Express Backend (server.js)
         │
         │ 3. Checks 15-scan monthly quota & custom BYOK key (server/quota-service.js)
         │ 4. Invokes fast vision cascade (server/gemini-service.js, 7s timeout, thinkingBudget: 0)
         ▼
  [ Gemini Vision Cascade (gemini-3.5-flash-lite / gemini-3.1-flash-lite) ]
         │ 5. Vision transformer reads layout, categories, items, ₹/Rs. prices & dietary tags
         │ 6. Multi-strategy JSON parser (parseMenuJsonSafely) extracts structured catalog
         ▼
  [ Backend Normalizer & Quota Recorder ]
         │ 7. Sanitizes item prices, GST rates, and curated food photography
         │ 8. Atomically increments monthly scan usage (1..15) in Firestore
         ▼
  [ Client Review Modal ] ──► Interactive correction & 1-click catalog import (syncs to all terminals)
```

### 3.2 Monthly 15-Scan Quota & Bring-Your-Own-Key (BYOK)
1. **Default Monthly Allowance**: Every shop receives **15 AI menu scans per calendar month (`YYYY-MM`)**, tracked atomically in `/shops/{shopId}/quota/menu_scans`.
2. **Quota Exhaustion (`HTTP 429`)**: On the 16th scan attempt within the same calendar month, `/api/ai/scan-menu` returns `HTTP 429` (`Monthly AI scan quota of 15 scans reached for this shop.`). Usage automatically resets to `0` at the start of the next calendar month.
3. **Custom Gemini API Key (`BYOK`)**: Shop owners can configure their own dedicated Gemini API key (`AIzaSy...`) under **Settings ➔ AI Menu Scanner Quota & Key**, which is masked in the UI (`AIzaSyB...1234`) and sent via `x-gemini-api-key`.

---

## 4. How to Update the Global GEMINI_API_KEY Step-by-Step

The global `GEMINI_API_KEY` powers AI Menu OCR scanning and image synthesis.

### Option A: Via AI Studio Settings (Recommended)
1. Open your project in **Google AI Studio Build** (`ai.studio/build`).
2. Click the **Gear / Settings icon** in the top navigation bar.
3. Select **Secrets** or **Environment Variables**.
4. Locate `GEMINI_API_KEY`.
5. Paste your Gemini API key (starts with `AIzaSy...`).
6. Save. The application restarts automatically with the new key in active memory.

### Option B: Via Google Cloud Run Console
1. Go to the [Google Cloud Console](https://console.cloud.google.com/run).
2. Select your Google Cloud project (`abhi-pro-cafe-pos`).
3. Click your Cloud Run service name.
4. Click **Edit & Deploy New Revision**.
5. Go to **Variables & Secrets** ➔ update `GEMINI_API_KEY`.
6. Click **Deploy**.

---

## 5. Operational Workflows & Day Close

### Daily Close (Z-Report)
1. At the end of the shift or trading day, navigate to **📊 Dashboard**.
2. Click **🖨️ Daily Z-Report**.
3. The system compiles:
   - Total Gross Revenue and GST Collected
   - Dine-In vs. Takeaway breakdowns
   - Cash vs. UPI vs. Card settlements
   - Total Operational Expenses deducted
   - Calculated Net Cash in Drawer for physical register reconciliation.
4. An automated thermal or PDF print preview is triggered.

### Staff Onboarding (4-Digit OTP -> Salted PIN) & Role-Based Access
- **Up to 10 Staff Profiles per Shop**: Admin creates staff profiles (`Admin`, `Cashier`, `Floor Server`, `Kitchen Chef`) with an auto-generated 4-digit temporary OTP.
- **Secondary Terminal Login**: Staff log into a secondary device using the shop email, select their profile from the picker, validate their 4-digit temporary OTP, and create their own private salted SHA-256 PIN (`#firstLoginPinModal`).
- **Active Cloud Presence & Remote Revocation**: Admin views live staff status (`Active (Active now)`, `Offline (Active Xm ago)`, or `Inactive (Never Logged In)`). Removing a staff member immediately revokes their cloud session and locks their active POS terminal.
- **Floor Server Bluetooth KOT Lock**: Floor Servers can access Settings solely to pair a Bluetooth thermal printer for KOT printing; all administrative settings tiles are shielded.

---

## 6. Summary of Backend API Endpoints

- `GET /api/version` — Application version and build timestamp.
- `GET /api/health` — Server health status and system load.
- `POST /api/auth/send-otp` — Dispatch 6-digit registration/login OTP to shop owner email.
- `POST /api/auth/register` — Register new shop owner account, verify OTP, and provision `/shops/{storeCode}`.
- `GET /api/subscription/status?email={email}&shopId={shopId}` — Inspect shop subscription state (`ACTIVE`, `PAUSED`, `RESUMED`, `REVOKED`).
- `POST /api/subscription/manage` — Transition shop subscription (`ACTIVE`, `PAUSED`, `RESUMED`, `REVOKED`) with real-time Firestore propagation.
- `GET /api/ai/quota?clientId={shopId}` — Current monthly AI OCR quota usage (`used`, `remaining`, `limit: 15`, `keyMasked`).
- `POST /api/admin/client-quota` — Update monthly scan limits and save custom BYOK Gemini API key.
- `POST /api/ai/scan-menu` (and `/api/extract-menu`) — Fast vision cascade AI extraction for menu images and PDFs.
- `POST /api/generate-image` — AI dish image generator with curated gourmet fallback.
- `POST /api/print/network` — Non-blocking TCP 9100 raw ESC/POS thermal printer proxy.
- `POST /api/sync-sheets` — Real-time Google Sheets webhook bridge.
- `POST /api/shop/export` — Full encrypted JSON database backup.
