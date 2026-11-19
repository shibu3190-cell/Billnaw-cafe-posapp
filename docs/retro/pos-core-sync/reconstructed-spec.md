# Reconstructed Specification: POS Core Sync & Multi-Device Ordering

**Slice**: Multi-Device Real-Time POS Sync, RBAC, and Dual-Tier Cloud Persistence

---

## 1. Requirements (WHEN $\rightarrow$ THEN)

### Authentication & Tenant Isolation
1. **WHEN** a user enters their shop email and requests login, **THEN** the server must generate a 6-digit numeric OTP, enforce a 60-second cooldown and 10-minute TTL, and dispatch it via Gmail SMTP.
2. **WHEN** the user submits the correct 6-digit OTP, **THEN** the server must issue an HMAC-SHA256 signed JWT carrying `{ storeCode, email, role }` valid for 30 days.
3. **WHEN** any API request arrives with an invalid or tampered JWT, **THEN** the gateway must return HTTP 401 Unauthorized.
4. **WHEN** a request arrives carrying a valid token for Store A targeting Store B, **THEN** the gateway must return HTTP 403 Forbidden.
5. **WHEN** a request receives an HTTP 401 response on sync, **THEN** the client must preserve any pending mutations in `offlineSyncQueueMap`, clear the stale token from storage, and display the login modal without dropping local work.

### Menu & Versioning
6. **WHEN** an Admin or Cashier modifies an item (price, stock, category), **THEN** the client must update the local array immediately (< 16ms), increment `menuVersion`, update `item.updatedAt = new Date().toISOString()`, and debounce-dispatch the payload to the cloud.
7. **WHEN** an item is deleted, **THEN** the item ID and normalized name must be recorded in `deletedMenuIds` and `deletedMenuNames` tombstones, and `menuVersion` must be incremented.
8. **WHEN** an incoming remote menu has $\text{remoteVersion} > \text{localVersion}$, **THEN** the local device must adopt the remote catalog, un-tombstone any active dishes, and filter out any tombstoned dishes.
9. **WHEN** an incoming remote menu has $\text{remoteVersion} \le \text{localVersion}$, **THEN** the local device must retain its local catalog and ignore stale remote snapshots.

### Table Operations & Delta KOT
10. **WHEN** a Floor Server adds items to a table and prints a KOT, **THEN** the system must compute $\text{Delta} = \text{Current Qty} - \text{kotSentQty}$ and send only items with $\text{Delta} > 0$ to the kitchen printer.
11. **WHEN** a KOT is successfully printed, **THEN** `kotSentQty` must be set equal to `Current Qty` so repeat clicks produce zero tickets.
12. **WHEN** a Cashier settles an invoice, **THEN** stock must be deducted for all tracked items, the table status must transition to `empty` with a `clearedAt` timestamp, and peer terminals must clear their active carts if their order timestamp is older than `clearedAt`.

---

## 2. Invariants (System Rules that MUST ALWAYS HOLD)

1. **Modal Invariant**: Exactly 26 `.modal-close-btn` SVG elements must exist in `index.html`.
2. **Emoji Invariant**: Zero raw Unicode emojis inside `<button>` elements in `index.html`.
3. **Parity Invariant**: 100% bit-for-bit parity between `firestore.rules` and `database/firestore.rules`.
4. **Currency Invariant**: Currency must format with non-breaking space: `"₹ "`.
5. **Secret Parity Invariant**: All Netlify serverless containers and local servers must use the identical 256-bit authoritative `JWT_SECRET`.
6. **Zero Data Loss Invariant**: Network drops or HTTP 401/403/429 errors must never purge uncommitted changes from `offlineSyncQueueMap`.
