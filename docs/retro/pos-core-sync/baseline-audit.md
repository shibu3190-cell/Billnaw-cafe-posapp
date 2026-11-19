# Baseline Audit: POS Core Sync & Multi-Device Architecture Slice

**Audit Date**: 2026-11-19
**Slice Perimeter**:
- Client: `js/core.js`, `js/pos.js`, `js/menu.js`, `js/shop-auth.js`, `src/core/rbac.js`
- Server/Serverless: `netlify/functions/api.js`, `server/auth-service.js`, `server/sync-service.js`
- Storage/Config: `netlify.toml`, `server/config.js`, `firestore.rules`

---

## 1. Test & CI Snapshot
- **Test Runner**: Node test runner via `npm test`
- **Total Test Suites**: 39 modules
- **Passing**: 100% Green (Exit Code 0)
- **Failing**: 0
- **Key Suites Verified**:
  - `test_css_modules_architecture.cjs`: 5/5 PASSED
  - `test_vector_audit.cjs`: 14/14 PASSED
  - `test_rush_hour.cjs`: 25/25 PASSED
  - `test_multidevice_rbac_deltakot.cjs`: 20/20 PASSED
  - `test_api_token_verification.cjs`: 24/24 PASSED
  - `test_token_self_healing_and_multi_container.cjs`: 7/7 PASSED
  - `test_backend_security_and_rush_handling.cjs`: 10/10 PASSED

---

## 2. Code Size & Monolith Inventory
| File | Lines of Code | Assessment |
| :--- | :--- | :--- |
| `js/core.js` | 6,766 lines | **Severe Monolith**: Combines sync engine, device pairing, profile hydration, culinary inventory, and global fetch interceptor. Exceeds 800-line ceiling by 8.4x. |
| `js/pos.js` | 4,632 lines | **Severe Monolith**: Combines cart logic, ESC/POS thermal text generation, dynamic UPI QR rendering, stock deduction, and table rollover. Exceeds ceiling by 5.8x. |
| `netlify/functions/api.js` | 3,006 lines | **Large Serverless Handler**: Single monolithic function dispatching 25+ distinct REST endpoints. Exceeds ceiling by 3.7x. |
| `js/menu.js` | 2,475 lines | Large file: Handles menu UI, image variations, AI extraction, and tombstones. |
| `js/settings.js` | 2,766 lines | Large file: Handles store profile, GST, printer setups, and reset modal. |
| `server/auth-service.js` | 2,009 lines | Large module: Handles JWT, OTP, Nodemailer SMTP, and RBAC matrix. |

---

## 3. Findings & Vulnerability Matrix

### Finding 1: Firestore 1MB Document Size Ceiling Risk (P1 Correctness / Scalability)
- **File & Line**: `server/sync-service.js:522`, `js/core.js:4644-4657`
- **Mechanism**: Every completed bill is appended to `orderHistory`. When syncing via `dispatchBackendStoreSync({ history: orderHistory })`, the entire array of historical orders is serialized into the single root Firestore document `stores/{storeCode}`.
- **Risk**: Google Cloud Firestore has a hard 1 MiB limit per document. At ~40 orders (current state), the document is ~30KB. After ~500–1,000 orders with line items, the root document will exceed 1,048,576 bytes and all store writes will be rejected with `INVALID_ARGUMENT: Document exceeds maximum size limit`.

### Finding 2: Unbounded Tombstone Accumulation (P2 Practice / Performance)
- **File & Line**: `js/core.js:4345-4346`, `server/sync-service.js:533`
- **Mechanism**: `deletedMenuIds` and `deletedMenuNames` append deleted item IDs and names indefinitely to prevent peer devices from resurrecting deleted items.
- **Evidence**: `SHOP_BAPI92HALDER` currently has 107 tombstoned IDs and 40 active items.
- **Risk**: Over months of seasonal menu updates, tombstone arrays consume network bandwidth and storage without a time-to-live (TTL) compaction strategy.

### Finding 3: Silent Error Swallowing in Mission-Critical Handlers (P2 Practice)
- **File & Line**: `js/pos.js:902`, `js/pos.js:942`, `js/pos.js:2367`, `js/pos.js:2438`, `js/pos.js:4068`
- **Mechanism**: Multiple `try { ... } catch (kotErr) {}` and `catch (e) {}` blocks catch and suppress errors without logging, alerting, or reporting.
- **Risk**: If KOT storage fails or a customer ledger write fails during a rush, the cashier receives no UI notification that local persistence failed.

### Finding 4: Global Namespace Pollution on `window` (P2 Practice)
- **File & Line**: `js/core.js:2512`, `js/core.js:2571`, `js/core.js:2710`, `js/pos.js:2352`
- **Mechanism**: State variables (`menuItems`, `tablesInfo`, `currentCart`, `shopProfile`, `staffList`) are exposed directly on `window` and accessed globally without module encapsulation.
- **Risk**: Any third-party script or unexpected browser extension can manipulate prices, stock, or cart totals in memory.

### Finding 5: Single-Process Rate Limiter & In-Memory Sessions in Ephemeral Serverless (P3 Architecture)
- **File & Line**: `server/auth-service.js:35-42`, `server/auth-service.js:51-55`
- **Mechanism**: `rateLimitStore = new Map()` and `sessionStore = new Map()` are in-memory JavaScript Maps inside the serverless Lambda process.
- **Behavior**: Because Netlify spins up ephemeral Lambda containers on demand, rate-limiting windows and session caches are not shared across parallel containers. While JWTs are cryptographically stateless and resilient, abusive traffic spread across containers is not globally throttled without Redis or Netlify Blobs backed rate-limiting.
