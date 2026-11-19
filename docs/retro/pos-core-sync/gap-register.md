# Gap Register: POS Core Sync & Multi-Device Architecture Slice

**Perimeter**:
- Files: `js/core.js`, `js/pos.js`, `js/menu.js`, `js/shop-auth.js`, `src/core/rbac.js`, `netlify/functions/api.js`, `server/auth-service.js`, `server/sync-service.js`
- Entry Points: `/api/auth/*`, `/api/sync/*`, `dispatchBackendStoreSync`, `handleRemoteFirestoreUpdate`, `checkoutBill`
- Current phase: **Phase 3 — Gap Analysis Complete (Ready for Triage)**

---

## Gap Register

| ID | Axis | Gap Description | Evidence (file:line) | Forward Fix | Severity | Effort | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **G-001** | **feature** | Monolithic root document storage risks hitting Firestore 1MB limit as `orderHistory` grows | `server/sync-service.js:522`, `js/core.js:4652` | Cap root document history to recent 50 orders; archive older orders to an `orders` subcollection | **P1** | **M** | resolved |
| **G-002** | **practice** | Monolithic architecture: `js/core.js` (6,766 lines) and `js/pos.js` (4,632 lines) breach the 800-line maintainability ceiling | `js/core.js:1`, `js/pos.js:1` | Decompose into focused domain modules (`sync-engine.js`, `escpos-printer.js`, `cart-service.js`) | **P2** | **L** | open |
| **G-003** | **practice** | Unbounded tombstone accumulation (`deletedMenuIds` & `deletedMenuNames` grow indefinitely) | `js/core.js:4345-4346`, `server/sync-service.js:533` | Introduce tombstone compaction / TTL pruning (e.g. prune tombstones older than 30 days) | **P2** | **S** | open |
| **G-004** | **practice** | Silent error swallowing in mission-critical KOT, Khata, and print handlers | `js/pos.js:902`, `js/pos.js:942`, `js/pos.js:2367`, `js/pos.js:2438` | Replace bare `catch(e) {}` with `console.warn` and user-facing non-blocking toast notifications | **P2** | **S** | resolved |
| **G-005** | **practice** | Global namespace exposure on `window` (`window.menuItems`, `window.tablesInfo`, `window.currentCart`) | `js/core.js:2512`, `js/core.js:2710`, `js/pos.js:2352` | Encapsulate state inside closures / state store modules to protect memory integrity | **P2** | **M** | open |
| **G-006** | **thinking** | Lack of automated disaster recovery & scheduled Firestore cloud backups | Cloud Architecture / Console | Configure Firestore scheduled export backup or daily snapshot job via GitHub Actions / Cloud Scheduler | **P2** | **S** | open |
| **G-007** | **selection** | Client-side error telemetry absent (runtime JS crashes only appear in browser DevTools) | `js/core.js:160`, `index.html:1` | Add lightweight `window.onerror` and `unhandledrejection` crash reporting to `/api/telemetry` | **P3** | **S** | open |
| **G-008** | **selection** | Manual script cache-busting query strings (`?v=2922`) required across index.html | `index.html:610-630`, `service-worker.js:1` | Transition to Vite or automated bundle version hashing in `scripts/bundle-css.cjs` | **P3** | **M** | open |

---

## Severity & Status Legend
- **Severity**:
  - `P0`: Critical security vulnerability or immediate data loss.
  - `P1`: Correctness or future operational failure (e.g. Firestore 1MB ceiling).
  - `P2`: Maintainability, code quality, observability, or performance.
  - `P3`: Tooling, workflow convenience, or non-blocking enhancements.
- **Effort**:
  - `S`: Small (< 1 day / single session).
  - `M`: Medium (1–3 sessions).
  - `L`: Large (requires architectural decomposition plan).
