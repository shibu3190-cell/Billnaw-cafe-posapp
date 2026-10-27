# BILLNAW CAFE POS — SERVICES & API SPECIFICATION

> Service Contract Standard: `{ data, error, offlineQueued }` | Platform: Firebase / Cloud Functions

---

## 1. STANDARDIZED SERVICE RETURN CONTRACT

Every service method across the application returns a uniform promise resolving to `ServiceResult<T>`:

```typescript
interface ServiceResult<T> {
  data: T | null;
  error: {
    code: string;       // e.g. "AUTH_INVALID_PIN", "INSUFFICIENT_STOCK", "NETWORK_OFFLINE"
    message: string;    // Human-readable message suitable for toast notification
    details?: any;
  } | null;
  offlineQueued: boolean;// True if committed locally to Firestore cache/queue while offline
}
```

---

## 2. FEATURE SERVICES SPECIFICATION

### 2.1. Billing Service (`src/features/billing/billing.service.js`)
*Orchestrates atomic settlement of bills.*

```javascript
/**
 * Executes atomic bill settlement.
 * Bundles in a single Firestore writeBatch:
 * 1. Create Invoice (/cafes/{cafe_id}/invoices/{invoice_id})
 * 2. Deduct ingredient inventory for all recipe-linked items
 * 3. Update customer total visits & Khata credit debt balance
 * 4. Reset table status to AVAILABLE and clear active_cart
 * 
 * @param {InvoicePayload} billData - Must contain integer paise amounts
 * @returns {Promise<ServiceResult<InvoiceDocument>>}
 */
async function settleBill(billData) { ... }

/**
 * Marks an existing invoice as VOID. Never physically deletes the document.
 * 
 * @param {string} invoiceId
 * @param {string} voidReason
 * @param {StaffMember} authorizedStaff - Must have can_void_invoice permission
 * @returns {Promise<ServiceResult<InvoiceDocument>>}
 */
async function voidBill(invoiceId, voidReason, authorizedStaff) { ... }
```

### 2.2. Table Service (`src/features/tables/tables.service.js`)
*Manages real-time floor occupancy and cart staging.*

```javascript
/**
 * Subscribes to real-time table updates for the active cafe.
 * @param {string} cafeId
 * @param {Function} onUpdate - Receives TableDocument[]
 * @returns {UnsubscribeFunction}
 */
function subscribeToTables(cafeId, onUpdate) { ... }

/**
 * Updates active cart items for a specific table without overwriting other tables.
 * @param {string} tableId
 * @param {CartItem[]} items
 * @returns {Promise<ServiceResult<TableDocument>>}
 */
async function updateTableCart(tableId, items) { ... }

/**
 * Transitions table state: AVAILABLE -> OCCUPIED_DRAFT -> KOT_SENT -> SERVED -> BILLED -> PAID_CLOSED.
 * @param {string} tableId
 * @param {TableStatus} newStatus
 * @returns {Promise<ServiceResult<void>>}
 */
async function setTableStatus(tableId, newStatus) { ... }
```

### 2.3. KOT Service (`src/features/kot/kot.service.js`)
*Manages kitchen order tickets and modification audits.*

```javascript
/**
 * Dispatches items to the kitchen, generates a KOT ticket, and updates table status to KOT_SENT.
 * @param {string} tableId
 * @param {CartItem[]} newItems - Only items not yet sent to KOT
 * @returns {Promise<ServiceResult<KotDocument>>}
 */
async function dispatchKot(tableId, newItems) { ... }

/**
 * Cancels a KOT ticket with an audit reason.
 * @param {string} kotId
 * @param {string} reason
 * @param {string} staffId
 * @returns {Promise<ServiceResult<void>>}
 */
async function cancelKot(kotId, reason, staffId) { ... }
```

### 2.4. Inventory & Commissary Service (`src/features/inventory/inventory.service.js`)
*Handles stock deductions, batch recipes, and food cost simulations.*

```javascript
/**
 * Deducts raw materials for sold items based on their recipe ingredient ratios.
 * Runs atomically inside the billing writeBatch.
 * @param {WriteBatch} batch
 * @param {InvoiceItem[]} items
 * @returns {void}
 */
function appendStockDeductionsToBatch(batch, items) { ... }

/**
 * Prepares a sub-recipe commissary batch (e.g., 20L Makhani Gravy), deducting raw ingredients
 * and crediting sub-recipe stock.
 * @param {BatchRecipePayload} batchData
 * @returns {Promise<ServiceResult<BatchResult>>}
 */
async function executeBatchPreparation(batchData) { ... }
```

### 2.5. Customer & Khata Service (`src/features/customers/customers.service.js`)
*Tracks customer visit metrics, loyalty tiers, and debt ledgers.*

```javascript
/**
 * Records a partial or full payment against customer's outstanding Khata debt.
 * @param {string} customerId
 * @param {number} paymentAmountPaise - Integer paise
 * @param {string} paymentMode - CASH, UPI
 * @returns {Promise<ServiceResult<KhataTransaction>>}
 */
async function recordKhataPayment(customerId, paymentAmountPaise, paymentMode) { ... }
```

### 2.6. Platform Hardware & Printer Service (`src/core/platform-bridge.js`)
*Decoupled hardware abstraction for thermal receipt and KOT printing.*

```javascript
/**
 * Prints ESC/POS thermal receipt. Fails gracefully without throwing unhandled exceptions.
 * @param {InvoiceDocument} invoice
 * @param {PrinterConfig} config - 58mm or 80mm
 * @returns {Promise<ServiceResult<{ printed: boolean }>>}
 */
async function printInvoice(invoice, config) { ... }

/**
 * Prints Kitchen Order Ticket to kitchen thermal printer.
 * @param {KotDocument} kot
 * @returns {Promise<ServiceResult<{ printed: boolean }>>}
 */
async function printKotTicket(kot) { ... }
```

---

## 3. SERVERLESS BACKEND APIS (FIREBASE CLOUD FUNCTIONS)

To protect third-party credentials and keep client bundles free of sensitive API keys, the following endpoints operate in secure serverless environments:

| Function Name | Trigger | Request Payload | Purpose | Secrets Used |
|---|---|---|---|---|
| `apiAuthSendOtp` | HTTPS Callable / POST | `{ email, purpose }` | Generates 6-digit OTP, saves hashed record, sends email via SMTP | `SMTP_USER`, `SMTP_PASS` |
| `apiAuthVerifyOtp`| HTTPS Callable / POST | `{ email, otp }` | Verifies code with constant-time equality, mints custom token | `JWT_SECRET` |
| `apiSyncSheets` | Background Trigger / HTTPS | `{ cafeId, invoiceId }`| Syncs bill data to Cafe owner's Google Sheet in background | `GOOGLE_SHEETS_WEBHOOK_URL` |
| `apiGeminiAi` | HTTPS Callable / POST | `{ prompt, task, image }` | OCR receipt parsing and AI food photo variation generator | `GEMINI_API_KEY` |
