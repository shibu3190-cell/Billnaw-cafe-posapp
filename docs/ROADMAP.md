# BILLNAW CAFE POS — PRODUCTION IMPLEMENTATION ROADMAP

> Execution Strategy: 5 Gated Phases with Strict Verification Milestones

---

## MILESTONE 1: PHASE 1 — AUDIT & DATABASE SELECTION (CURRENT)
- [x] Full repository scan and asset inventory (`CONTEXT.md`).
- [x] Identification of security exposures, plaintext credentials, and mathematical drift.
- [x] Initial architectural blueprint (`docs/ARCHITECTURE.md`) and roadmap (`docs/ROADMAP.md`).
- [ ] Database comparison and architectural recommendation (Firebase vs. Supabase).
- [ ] Formal CEO / User decision confirmation.

---

## MILESTONE 2: PHASE 2 — SYSTEM SPECIFICATIONS & BLUEPRINTS
- [ ] Deliver `docs/DATABASE_SCHEMA.md` with multi-tenant data structures, foreign keys, and indexes.
- [ ] Deliver `docs/SERVICES_AND_API.md` defining service layer contracts and error envelopes.
- [ ] Deliver `docs/UI_DESIGN_SYSTEM.md` defining CSS token scales, keyboard shortcuts, and state patterns.
- [ ] Review and user sign-off on design specifications.

---

## MILESTONE 3: PHASE 3 — CORE ENGINE, SECURITY & TWO-TIER AUTH
- [ ] Build `src/core/error-handler.js` with `{ data, error, offlineQueued }` standard.
- [ ] Build `src/core/db-migrator.js` for versioned IndexedDB management.
- [ ] Build `src/core/rbac.js` with salted SHA-256 PIN hashing and manager override guard.
- [ ] Build `src/core/auth-guard.js` enforcing store terminal binding via server-side OTP.
- [ ] Build database-level security rules (Firestore Security Rules or Supabase RLS) enforcing `cafe_id` isolation and bill immutability (`DELETE` forbidden).

---

## MILESTONE 4: PHASE 4 — FEATURE MODULE MIGRATION & POS ALGORITHMS
- [ ] Build `src/shared/utils/currency.js` (Integer Paise Math) and `src/shared/utils/gst-calculator.js`.
- [ ] Build `src/shared/utils/invoice-id.js` (Deterministic offline invoice ID generator).
- [ ] Migrate `billing` and `tables` features (atomic settlement transactions).
- [ ] Migrate `kot` feature (immutable order audit trail).
- [ ] Migrate `inventory` and `menu` features (recipe-level stock depletion).
- [ ] Migrate `customers` (Khata credit ledger & loyalty rewards).
- [ ] Migrate `reports` and `settings` features.

---

## MILESTONE 5: PHASE 5 — CROSS-PLATFORM PACKAGING & HARDWARE BRIDGE
- [ ] Build `src/core/platform-bridge.js` with auto-detection for PWA, Android, and Desktop.
- [ ] Implement thermal printing bridge for ESC/POS 58mm/80mm over Bluetooth/USB.
- [ ] Configure `public/manifest.json` and zero-data-loss `public/sw.js`.
- [ ] Setup Capacitor Android project configuration.
- [ ] Execute complete end-to-end regression audit and launch validation.
