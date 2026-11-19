# Target Design & Refactoring Roadmap: POS Core Sync & Multi-Device Architecture Slice

**Slice Perimeter**: POS Core Sync, Device Pairing, RBAC & Cloud Persistence  
**Status**: Proposed Target Design

---

## 1. What Does NOT Change (Protected Invariants)
To prevent regression or operational disruption, the following existing systems remain untouched:
1. **LWW Timestamp Conflict Resolution**: The Last-Write-Wins protocol (`updatedAt` and `menuVersion`) is proven and remains the core engine.
2. **Delta KOT Algorithm**: The `kotSentQty` calculation in `js/pos.js` works with zero duplicate tickets and remains intact.
3. **Dual-Tier Quota Resilience**: The automatic Firestore 429 failover to Netlify Blobs and local cache remains active.
4. **26 Modal Close Buttons & Zero Raw Emoji Invariants**: Strictly enforced in tests.
5. **Netlify Functions & Gmail SMTP Email Auth**: Kept exactly as configured.

---

## 2. Target Architecture Upgrades (Sequenced Roadmap)

### Phase 1: High-Priority Operational Safety (G-001 & G-003)
* **Subcollection Archive for Order History (G-001 - P1)**:
  - Keep only the latest **50 active invoices** on the root `stores/{storeCode}` document.
  - As new orders arrive, archive older completed orders into a subcollection `stores/{storeCode}/orders/{orderId}` or cold IndexedDB store.
  - **Outcome**: Eliminates the risk of exceeding Firestore's 1MB single-document limit forever.
* **Tombstone Compaction / TTL (G-003 - P2)**:
  - Add a 30-day prune rule for `deletedMenuIds` and `deletedMenuNames`. After 30 days, peer devices that have synced will have dropped the items, making indefinite accumulation unnecessary.

### Phase 2: Error Resilience & Observability (G-004 & G-007)
* **Transparent Error Logging & Telemetry (G-004 & G-007 - P2/P3)**:
  - Replace empty `catch (e) {}` blocks with meaningful logs and user toasts when background sync or storage writes encounter browser exceptions.
  - Introduce a lightweight `/api/telemetry` endpoint to capture unhandled client exceptions in production.

### Phase 3: Monolith Decomposition (G-002 & G-005 - P2/P3)
* **Modularization of `js/core.js` and `js/pos.js`**:
  - Extract printer logic into `js/services/thermal-printer.js`.
  - Extract table state machine into `js/services/table-manager.js`.
  - Extract cloud sync engine into `js/services/sync-engine.js`.
  - Encapsulate global state variables behind a reactive store (`store.getState()` / `store.setState()`).

---

## 3. Recommended Sequencing

```text
Step 1 (P1): History Subcollection Archival (Eliminates Firestore 1MB document limit)
Step 2 (P2): Tombstone TTL Prune (Keeps sync payloads lean)
Step 3 (P2): Silent Error Handlers Cleanup (Improves operational observability)
Step 4 (P3): Automated Cloud Backups via Cloud Scheduler / GitHub Action
Step 5 (P3): Monolith Refactor (Gradual extraction of core.js and pos.js into domain modules)
```
