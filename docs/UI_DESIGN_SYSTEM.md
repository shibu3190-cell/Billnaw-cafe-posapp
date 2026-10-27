# BILLNAW CAFE POS — UI/UX DESIGN SYSTEM SPECIFICATION

> Design Framework: Lightweight Vanilla CSS + Design Tokens | Standards: WCAG 2.1 AA, Mobile-First Touch Ergonomics

---

## 1. DESIGN TOKENS ARCHITECTURE (`src/shared/styles/tokens.css`)

### 1.1. Color Palette Tokens
```css
:root {
  /* Brand Emerald Palette */
  --color-brand-primary: #143832;         /* Deep cafe emerald (Active states, brand header) */
  --color-brand-primary-hover: #0D2622;
  --color-brand-accent: #2DD4BF;          /* Luminous teal (Glow, active badge cues) */
  --color-brand-accent-bg: #ECFDF5;       /* Light mint tint */
  
  /* Semantic Status Tokens */
  --color-status-success: #10B981;        /* Paid bills, in-stock ingredients */
  --color-status-warning: #F59E0B;        /* 15m unpaid table alert, low stock threshold */
  --color-status-danger: #EF4444;         /* Voided bills, stock depletion, danger actions */
  --color-status-info: #3B82F6;           /* Takeaway orders, informative notifications */

  /* Neutral Surface & Canvas */
  --color-bg-canvas: #FAF7F4;             /* Warm cafe cream canvas */
  --color-bg-surface: #FFFFFF;            /* Cards, dialogs, drawers */
  --color-bg-subtle: #F3ECE2;             /* Input backgrounds, disabled pills */
  --color-border-subtle: #E6DCCD;         /* Subtle card outlines */
  --color-border-strong: #D1C4B0;

  /* Typography Colors */
  --color-text-main: #1F2937;             /* Dark charcoal for high readability */
  --color-text-muted: #6B7280;            /* Secondary subtitles, timestamps */
  --color-text-inverse: #FFFFFF;          /* Light text on dark headers/buttons */

  /* Typography Scale */
  --font-family-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-family-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-base: 15px;
  --font-size-lg: 18px;
  --font-size-xl: 22px;
  --font-size-2xl: 28px;

  /* Touch Ergonomics & Elevation */
  --touch-target-min: 44px;               /* Minimum interactive touch target */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 3px rgba(20, 56, 50, 0.06);
  --shadow-md: 0 4px 14px rgba(20, 56, 50, 0.08);
  --shadow-lg: 0 10px 30px rgba(20, 56, 50, 0.12);
}
```

---

## 2. FOUR VIEW STATES STANDARD

Every feature screen and data container must systematically render one of four states:

1. **`LOADING` (Skeleton Shimmer):**
   ```html
   <div class="state-container state-loading">
     <div class="skeleton-card shimmer" style="height: 60px;"></div>
     <div class="skeleton-card shimmer" style="height: 60px;"></div>
   </div>
   ```
2. **`EMPTY` (Zero Data State):**
   ```html
   <div class="state-container state-empty">
     <div class="empty-icon-wrap"><svg class="lucide-svg">...</svg></div>
     <h4 class="empty-title">No Orders Found</h4>
     <p class="empty-desc">Take your first order from the POS terminal.</p>
     <button class="btn btn-emerald" onclick="navigateTo('pos')">Start New Bill</button>
   </div>
   ```
3. **`ERROR` (Error with Retry):**
   ```html
   <div class="state-container state-error">
     <p class="error-msg">Failed to load sales ledger.</p>
     <button class="btn btn-outline" onclick="retryLoadLedger()">Retry</button>
   </div>
   ```
4. **`POPULATED` (Standard UI):**
   - Interactive data table, catalog grid, or floor layout.

---

## 3. STRICT MODAL DIALOG INVARIANTS

To maintain total visual and behavioral consistency across all 26 modal dialogs in the application:

1. **Exact Close Button Pattern:**
   Every standard modal close button must match the established system invariant:
   ```html
   <button type="button" class="modal-close-btn" onclick="closeModal('modalId')" aria-label="Close">
     <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
       <line x1="18" y1="6" x2="6" y2="18"></line>
       <line x1="6" y1="6" x2="18" y2="18"></line>
     </svg>
   </button>
   ```
2. **Zero Raw Unicode Emojis in Operational Controls:**
   All navigation tabs, action buttons, table pills, and dialog triggers must use clean vector Lucide SVGs (viewBox `0 0 24 24`, standard stroke-width `1.8px` to `2.2px`).
3. **Non-Standard Overlays:**
   Non-modal dropdowns or micro-drawers must use distinct class names (e.g., `.sheet-close-btn`, `.dropdown-close-btn`) so the global count of `.modal-close-btn` remains strictly 26.

---

## 4. FAST KEYBOARD SHORTCUTS FOR CASHIERS

| Shortcut | Scope | Action |
|---|---|---|
| `F2` | Global / POS | Focus Product Search / Start New Order |
| `F4` | POS Cart | Trigger Payment Checkout Modal |
| `Ctrl + P` / `Cmd + P` | Checkout / Invoice | Immediate Thermal Receipt Print |
| `Escape` | Global | Close Active Modal / Clear Search |
| `Space` | Checkout Tender | Auto-fill Exact Amount Tendered |
| `1` - `9` | Table View | Quick Jump to Table T1 - T9 |
| `Alt + K` | Active Table | Dispatch KOT to Kitchen |
