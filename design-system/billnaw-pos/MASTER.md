# Billnaw Cafe POS — Design System Master Specification

> **Pattern:** Master + Overrides (`ui-ux-pro-max`)  
> **Single Source of Truth:** `css/tokens.css` (compiled into `style.css` via `npm run build:css`)  
> **Platforms:** Mobile First (`390×844`+) & PC Desktop (`1080px–1440px+`)

---

## 1. Color Palette (Strict Single Family: Cool Emerald · Mint · Slate)

Never introduce warm beige/cream (`#F8F6F2`, `#FAF7F4`, `#F4F0EA`), warm brown shadows (`rgba(35,22,16,...)`), or coral-orange (`#E85D3F`, `#E05A38`) on any surface or badge.

| Token | Hex / Value | Usage |
| :--- | :--- | :--- |
| `--em-dark` / `--primary` | `#0F3D33` | Primary buttons, brand mark, active pills, dark stepper, floating mini-cart |
| `--em-mid` / `--primary-light` | `#145345` | Hover states, secondary emerald text, pill active labels |
| `--em-hover` / `--primary-dark` | `#0B2E26` | Pressed states, dark headers |
| `--mint-bg` / `--accent-soft` | `#E6F4EF` | Active nav pills, soft icon tiles, subtle highlights |
| `--mint-soft` | `#D1FAE5` | Live status badges, synced tags, positive chips |
| `--mint` / `--accent` | `#10B981` | Success indicator dots, cart count pill, progress fills |
| `--canvas` / `--bg-body` | `#F7F8F7` | App background canvas (both Mobile & PC) |
| `--surface` / `--card-bg` | `#FFFFFF` | Cards, modals, sheets, topbar icon buttons, desktop sidebar |
| `--surface-soft` / `--card-subtle` | `#EAEFED` | Segmented control tracks, subtle chip fills, disabled states |
| `--border` | `#E5E9E7` | Standard 1px structural card/input/sidebar borders |
| `--border-soft` | `#EDF1EF` | Hairline list row dividers inside grouped cards |
| `--ink` / `--text-dark` | `#0F172A` | Primary headings, dish titles, table numbers, figures |
| `--slate` | `#475569` | Secondary body copy, sub-labels |
| `--muted` / `--text-muted` | `#64748B` | Captions, placeholders, metadata, inactive nav icons |
| `--hint` | `#94A3B8` | Tertiary hints, chevron icons |
| `--danger` | `#DC2626` | Destructive actions, logout card, sold-out/overdue alerts |
| `--danger-bg` | `#FEF2F2` | Soft red tint for danger cards/badges |
| `--danger-border` | `#FECACA` | Danger hairline borders |
| `--amber` | `#D97706` | Occupied/pending/low-stock attention state |
| `--amber-bg` | `#FFFBEB` | Soft amber tint for occupied table & warning badges |
| `--amber-border` | `#FDE68A` | Amber hairline borders |

---

## 2. Typography (`--font-sans`)

- **Font Stack:** `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- **Tabular Numerals:** Required (`font-variant-numeric: tabular-nums`) on all `₹` prices, KPIs, steppers, order totals, and timers.

| Token | Size | Weight | Line Height | Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--fs-xl` | `18px` | `800` | `1.2` | KPI values, modal/checkout totals |
| `--fs-lg` | `17px` | `800` | `1.25` | Page section headings (`-0.02em`) |
| `--fs-md` | `15px` | `800` | `1.3` | Topbar brand title, table codes (`T1`) |
| `--fs-base` | `14px` | `700` | `1.35` | Dish prices, inputs, primary buttons |
| `--fs-sm` | `13px` | `600` | `1.35` | List row titles, pill labels, search text |
| `--fs-card` | `12.5px` | `700` | `1.28` | POS dish card titles (2-line clamp) |
| `--fs-xs` | `11.5px` | `600` | `1.3` | Subtitles, badges, metadata |
| `--fs-2xs` | `10.5px` | `700` | `1.2` | Bottom nav labels, status chips, uppercase KPI labels (`9.5px`) |

---

## 3. Spacing (4px / 8px Rhythm), Radii & Elevation

- **Spacing Tokens:** `--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 20px`, `--sp-6: 24px`
- **Radii:** `--r-sm: 10px` (steppers, chips), `--r-md: 12px` (inputs, buttons, icon tiles), `--r-lg: 16px` (dish cards, mini-cart, table tiles), `--r-xl: 18px` (main cards, grouped settings lists), `--r-sheet: 22px` (bottom sheets & modals), `--r-pill: 999px` (pills & badges)
- **Shadows (Cool Slate Only):**
  - `--shadow-card: 0 2px 10px rgba(15, 23, 42, 0.04)`
  - `--shadow-sm: 0 2px 8px rgba(15, 23, 42, 0.05)`
  - `--shadow-md: 0 8px 22px rgba(15, 23, 42, 0.08)`
  - `--shadow-nav: 0 -4px 18px rgba(15, 23, 42, 0.06)`
  - `--shadow-elev: 0 18px 44px rgba(15, 31, 28, 0.22)`

---

## 4. How to Make Future Changes in Seconds

- **Change brand color:** Edit `--em-dark`, `--em-mid`, `--mint-bg` in `css/tokens.css`, then run `npm run build:css`.
- **Change font globally:** Edit `--font-sans` in `css/tokens.css` (and Google Fonts link in `index.html`), then run `npm run build:css`.
- **Adjust spacing or card roundness:** Edit `--sp-*` or `--r-*` in `css/tokens.css`, then run `npm run build:css`.
- **Keep CSS maintainable:** Put base component styles in their domain module (`pos.css`, `modals.css`, `checkout.css`, `reports.css`, `crm.css`, `inventory.css`) and keep `responsive.css` strictly for layout breakpoints — avoid `!important` override chains.
