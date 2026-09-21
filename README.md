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
     - 🔄 **Cloud Sync & Terminals**: Firestore bidirectional sync state and custom Shop Store Code (`BONGBHOJ-TERMINAL`).
     - 📞 **Contact & Support**: Integrated direct helpdesk and concierge support.

---

## 2. Real-Time Cloud Firestore Sync

All store data syncs automatically across terminals and devices using Google Cloud Firestore:

- **Database ID**: `ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda`
- **Client Document / Scope**: `/clients/{clientId}` (e.g., `BONGBHOJ-TERMINAL`)

### Data Collections
| Collection Path | Purpose |
| :--- | :--- |
| `/clients/{id}` | Store profile, tax settings, admin PIN, AI quotas, subscription status. |
| `/clients/{id}/menu` | Menu categories, dish details, pricing, GST rates, stock counts. |
| `/clients/{id}/tables` | Real-time dine-in table states, occupied item lists, and KOT timers. |
| `/clients/{id}/history` | Historical sales records, customer invoices, payment breakdowns. |
| `/clients/{id}/expenses`| Daily operational expense vouchers with categories and payment methods. |
| `/clients/{id}/customers`| Customer CRM records, loyalty points ledger, visit logs. |
| `/clients/{id}/staff` | Authorized store operators, role permissions, and access credentials. |

---

## 3. Google Gemini AI Architecture & Implementation

### 3.1 Data Flow & Processing Pipeline
The application uses Google Gemini 3.7 Flash to read and parse printed, handwritten, or digital cafe menus from uploaded images and PDF documents.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GEMINI MULTIMODAL PIPELINE                        │
└─────────────────────────────────────────────────────────────────────────────┘
  [ Client Browser (app.js) ]
         │ 1. User uploads menu image/PDF (JPEG, PNG, PDF)
         │ 2. File converted to standard Base64 string + MIME type
         ▼
  [ POST /api/extract-menu ] ──► Express Backend (server.js)
         │
         │ 3. Server sanitizes payload & checks key status
         │ 4. Invokes @google/genai SDK (server/gemini-service.js)
         ▼
  [ Google Gemini 3.7 Flash API (models/gemini-3.7-flash) ]
         │ 5. Vision transformer reads layout, categories, items, and rates
         │ 6. Enforces strict JSON Schema response
         ▼
  [ Backend Normalizer ]
         │ 7. Sanitizes item prices, GST rates, and categories
         │ 8. Attaches auto-generated dish prompts and thumbnails
         ▼
  [ Client Review Modal ] ──► Interactive correction & 1-click catalog import
```

### 3.2 How the Gemini API Reads Document Data
1. **Multimodal Ingestion**: The image or PDF is converted into an `inlineData` part containing the Base64 data and IANA MIME type (`image/jpeg`, `image/png`, `application/pdf`).
2. **Vision & OCR Analysis**: `gemini-3.7-flash` visually processes columns, indentation, pricing symbols (₹, Rs, /-), category headers, and descriptions without requiring external OCR tools.
3. **Structured Schema Output**: The request specifies `responseMimeType: "application/json"` with system instructions requiring an array of categories and item objects (`name`, `price`, `description`, `image_prompt`).
4. **Resilience & Fallback Engine**: If Gemini is unavailable, the backend automatically routes through a smart regex/layout parser so operations are never blocked.

### 3.3 Implementation Details
- **Backend SDK**: `@google/genai` (official Google GenAI TypeScript/JavaScript SDK).
- **Client Isolation**: The browser client never touches or stores the API key; all calls route through `/api/extract-menu` and `/api/generate-image`.
- **Model Configuration**:
  - Multimodal Menu OCR: `gemini-3.7-flash` (fallback: `gemini-flash-latest`, `gemini-3.1-flash-lite`).
  - Dish Visual Synthesis: `gemini-3.1-flash-lite-image`.
- **Header Telemetry**: Requests include `httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }`.

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

### Staff & Admin Access
- Default Admin PIN: `1234` (configurable under **Settings ➔ Staff & Team Management** or **Store Profile**).
- Staff members can take orders and generate bills without full administrative permissions.

---

## 6. Summary of Backend API Endpoints

- `GET /api/version` — Application version and build timestamp.
- `GET /api/health` — Server health status and system load.
- `GET /api/ai/quota?clientId={id}` — Current AI OCR quota usage and limit.
- `POST /api/admin/client-quota` — Update monthly scan limits.
- `POST /api/extract-menu` — Multimodal AI extraction for menu images and PDFs.
- `POST /api/generate-image` — AI dish image generator.
- `POST /api/sync-sheets` — Real-time Google Sheets webhook bridge.
- `POST /api/shop/export` — Full encrypted JSON database backup.
