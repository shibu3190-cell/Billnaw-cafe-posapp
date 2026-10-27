# BILLNAW CAFE POS — SYSTEM ARCHITECTURE SPECIFICATION (FIREBASE)

> Document Version: 2.0.0 | Confirmed Platform: Firebase (Firestore + Cloud Functions) | Target: PWA, Android (Capacitor), Desktop (Tauri)

---

## 1. ARCHITECTURAL OVERVIEW & DATABASE VERDICT

Following the Phase 1 audit and architectural trade-off evaluation, the database layer is locked in as **Firebase Firestore with `persistentLocalCache` and Firebase Cloud Functions**.

```mermaid
flowchart TD
    subgraph Client_App [Client POS Application (PWA / Android / Desktop)]
        UI[Modular UI Views: *.ui.js] --> State[Feature State Manager]
        State --> Service[Feature Services: *.service.js]
        Service --> CoreDB[Core DB Client: src/core/db-client.js]
        Service --> PrintBridge[Platform & Hardware Bridge: ESC/POS]
    end

    subgraph Firebase_Client_SDK [Firebase Client SDK v12+]
        CoreDB --> Cache[persistentLocalCache / IndexedDB Cache]
        Cache <--> SyncEngine[Firestore Offline Sync Engine]
    end

    subgraph Firebase_Cloud [Google Cloud & Firebase Backend]
        SyncEngine <--> Firestore[(Cloud Firestore /cafes/{cafe_id}/*)]
        CoreDB -.-> CloudFunctions[Firebase Cloud Functions]
        CloudFunctions --> EmailGateway[Email Gateway / SMTP OTP]
        CloudFunctions --> SheetsRelay[Google Sheets Sync Relay]
        CloudFunctions --> GeminiAI[Google Gemini 3.5 AI Engine]
    end
```

---

## 2. STRICT SEPARATION PRINCIPLES (THE GOLDEN RULES)

1. **The Golden UI Rule:**
   `*.ui.js` files must **NEVER** import `firebase/*` or `src/core/db-client.js` directly.
   Data flow: `User Event -> Feature UI (*.ui.js) -> Feature Service (*.service.js) -> Core DB Client -> Firestore`.
2. **Four View States Standard:**
   Every view component must handle:
   - `LOADING`: Shimmer skeleton loading cards.
   - `EMPTY`: Zero-state illustration with actionable button.
   - `ERROR`: Banner displaying error message and retry action.
   - `POPULATED`: Standard interactive operational UI.
3. **Integer Paise Financial Rule:**
   All monetary amounts (subtotal, taxes, discounts, cash tender, customer khata debts) are stored and manipulated as integer paise (`₹149.50 = 14950`).
4. **Decoupled Bill Settlement & Hardware Execution:**
   Writing an invoice via `writeBatch` must succeed locally in `persistentLocalCache` immediately. Thermal printing runs asynchronously. If the printer runs out of paper or disconnects, the bill is safely committed and marked `printed: false`, never rolling back the order.
5. **Deterministic Offline IDs:**
   All invoices receive a UUIDv4 `client_invoice_id` and a formatted terminal invoice number:
   `BN-{TerminalID}-{YYMMDD}-{Counter}` (e.g. `BN-T1-261027-0042`).

---

## 3. MODULAR DIRECTORY BLUEPRINT

```
src/
├── core/                         # Core Application Infrastructure
│   ├── config.js                 # Environment & tenant runtime configurations
│   ├── db-client.js              # Universal Firebase Firestore client wrapper
│   ├── auth-guard.js             # Terminal session verification & route protection
│   ├── rbac.js                   # 4-Digit PIN auth, Cashier switching, Manager overrides
│   ├── error-handler.js          # Standardized { data, error, offlineQueued } contract
│   ├── db-migrator.js            # Schema migration & versioning for local settings
│   ├── sync-queue.js             # Offline transaction monitoring & health worker
│   └── platform-bridge.js        # Device hardware detection (PWA / Android / Desktop)
│
├── shared/                       # Cross-Feature Reusable Assets
│   ├── styles/
│   │   ├── tokens.css            # Design tokens (colors, elevation, typography, spacing)
│   │   └── base.css              # Reset, typography, utility classes
│   ├── components/               # Pure UI Components
│   │   ├── modal.js              # Accessible modal dialog controller (strictly 26 close buttons)
│   │   ├── toast.js              # Ephemeral toast alert system
│   │   ├── datatable.js          # High-performance virtualized table
│   │   ├── pin-pad-modal.js      # On-screen tactile numpad for cashier PIN & manager override
│   │   └── skeleton.js           # Shimmer loading placeholders
│   └── utils/
│       ├── currency.js           # Integer paise arithmetic & Indian Rupee formatters
│       ├── gst-calculator.js     # CGST/SGST/IGST computation (Inclusive & Exclusive)
│       └── invoice-id.js         # Deterministic BN-{Terminal}-{YYMMDD}-{Counter} generator
│
└── features/                     # Feature Modules (Domain Encapsulation)
    ├── auth/                     # Email OTP Terminal Binding & Session Store
    ├── tables/                   # Floor map, Table states (Dine-In lifecycle)
    ├── kot/                      # Kitchen Order Ticket generation & cancellation auditing
    ├── billing/                  # POS Cart, Tender, UPI QR, Settlement, Thermal Print
    ├── menu/                     # Catalog management, categories, AI image parser
    ├── inventory/                # Culinary ERP, raw materials, batching, food costing
    ├── customers/                # CRM, Khata credit ledger, WhatsApp reminders
    ├── reports/                  # Daily sales register, analytics, GST exports
    └── settings/                 # Cafe profile, tax rates, printer config, cloud reset
```
