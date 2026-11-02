const fs = require('fs');

const css = fs.readFileSync('style.css', 'utf8');
const lines = css.split('\n');

function sliceLines(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

function checkBalancedBraces(text, name) {
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth < 0) {
      console.error(`[ERROR] ${name}: extra closing brace at char ${i}`);
      return false;
    }
  }
  if (depth !== 0) {
    console.error(`[ERROR] ${name}: unclosed brace, remaining depth: ${depth}`);
    return false;
  }
  return true;
}

// Updated definitions with the exact boundaries
const MODULE_RANGES = {
  'tokens.css': [
    [1, 93],     // Design tokens, CSS variables, tabular rupee
    [620, 694],  // Buttons & badges, cards & containers
  ],
  'modals.css': [
    [94, 251],   // Modal system, stacking z-index, management hub, PIN keypad
    [3573, 4282],// Royal Cafe theme modal header, segmented tabs, shopAuth, OTP, table/session close btns
  ],
  'pos.css': [
    [252, 619],  // Desktop sidebar, vector icons, topbar, table display pill, scroll isolation
    [695, 1121], // POS layout, table grid, category bar, search, menu cards, 1-motion steppers
    [1651, 1759],// AI menu review compact preview styles
    [2869, 3066],// Minimal topbar brand, slide drawer
    [3098, 3516],// AI menu onboarding banner, category/action chips, catalog actions
    [4283, 4559],// Menu segmented tabs, dashed bulk upload, clean item cards list
    [5920, 6108],// Topbar desktop actions adaptive wrap
  ],
  'checkout.css': [
    [1122, 1311],// Cart drawer & desktop sidebar, individual cart items (compact horizontal rows)
    [1760, 2111],// Payment modal buttons, loss aversion alert, relative tax pill, tender engine, change due, UPI QR
  ],
  'inventory.css': [
    [5640, 5919],// High-contrast telemetry table (Tab 1), stock status badges, morning prep, dish recipes
    [6281, 6402],// Inventory stock grid cards & inline accordions
    [6403, 6822],// Base styles & mobile viewport overrides (<768px), inv-row-master, inv-row-drawer, batching accordions
  ],
  'crm.css': [
    [1576, 1650],// Customer directory, action hub quick tiles, staff, toasts
    [3067, 3097],// Bulk customer selector items, 1-tap broadcast queue
    [5313, 5559],// Khata dual toggle group & buttons, overdue & status badges, khata close button
    [6823, 7201],// CRM & WhatsApp accordions, bulk campaign dock, floating preview pill, phone mockup modal
    [7202, 7561],// Campaign wizard step states, variable chips, step panels, PWA update banner
  ],
  'reports.css': [
    [1312, 1575],// Dashboard & analytics, transaction ledger & action dropdown, cashier popover, settings hub
    [4560, 4738],// Upload choice modal tiles, settings profile card, crown card, for you hub, visual charts
    [5139, 5312],// Price-first typography hierarchy, donut chart & dataset toggle pills
    [5560, 5639],// Minimalist reports action bar & popover
    [6119, 6280],// Reports dashboard vertical stack & donut center total (including 768px query)
  ],
  'food-images.css': [
    [7562, 7981],// Food image manager status pill, 100px preview, placeholder, shimmer, selectors, dock, notice
  ],
  'responsive.css': [
    [2112, 2868],// Split-screen (641px-1080px) and compact mobile (<640px) complete system
    [3517, 3572],// Print styles (@media print)
    [4739, 5138],// Modern mobile-first UX for reports & customers, customer cards, khata due mobile cards, iOS zoom fix
    [6109, 6118],// Adaptive header breakpoint (< 1080px)
  ]
};

// Check coverage: every line from 1 to 7981 should belong to exactly one module
const coveredLines = new Set();
let hasOverlap = false;

for (const [filename, ranges] of Object.entries(MODULE_RANGES)) {
  for (const [start, end] of ranges) {
    for (let l = start; l <= end; l++) {
      if (coveredLines.has(l)) {
        console.error(`[OVERLAP] Line ${l} is covered multiple times! File: ${filename}`);
        hasOverlap = true;
      }
      coveredLines.add(l);
    }
  }
}

console.log(`Total covered lines: ${coveredLines.size} / ${lines.length}`);
if (coveredLines.size !== lines.length) {
  const missing = [];
  for (let l = 1; l <= lines.length; l++) {
    if (!coveredLines.has(l)) missing.push(l);
  }
  console.error(`[MISSING] Lines not covered: ${missing.slice(0, 20).join(', ')}... (total missing: ${missing.length})`);
}

let allBalanced = true;
for (const [filename, ranges] of Object.entries(MODULE_RANGES)) {
  const content = ranges.map(([s, e]) => sliceLines(s, e)).join('\n\n');
  const balanced = checkBalancedBraces(content, filename);
  console.log(`${filename.padEnd(20)} : ${balanced ? '✅ BALANCED' : '❌ UNBALANCED'} (${content.split('\n').length} lines)`);
  if (!balanced) allBalanced = false;
}

if (!hasOverlap && coveredLines.size === lines.length && allBalanced) {
  console.log('\n✨ PERFECT PARTITION CONFIRMED! Zero missing lines, zero overlaps, 100% balanced braces in all 9 files!');
} else {
  console.error('\n❌ Partition requires adjustment.');
  process.exit(1);
}
