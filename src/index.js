/**
 * src/index.js
 * Central Application Module Entry Point for Billnaw Cafe POS.
 * Re-exports the complete modular clean architecture across Core, Shared, and Features.
 */

// Core Infrastructure
export * as Config from './core/config.js';
export * as DbClient from './core/db-client.js';
export * as AuthGuard from './core/auth-guard.js';
export * as RBAC from './core/rbac.js';
export * as ErrorHandler from './core/error-handler.js';
export * as DbMigrator from './core/db-migrator.js';
export * as PlatformBridge from './core/platform-bridge.js';

// Shared Utilities & Components
export * as Currency from './shared/utils/currency.js';
export * as GstCalculator from './shared/utils/gst-calculator.js';
export * as InvoiceId from './shared/utils/invoice-id.js';
export * as Modal from './shared/components/modal.js';
export * as Toast from './shared/components/toast.js';
export * as PinPad from './shared/components/pin-pad-modal.js';
export * as DataTable from './shared/components/data-table.js';
export * as Skeleton from './shared/components/skeleton.js';

// Feature Modules
export * as BillingFeature from './features/billing/index.js';
export * as TablesFeature from './features/tables/index.js';
export * as KotFeature from './features/kot/index.js';
export * as MenuFeature from './features/menu/index.js';
export * as InventoryFeature from './features/inventory/index.js';
export * as CustomersFeature from './features/customers/index.js';
export * as ReportsFeature from './features/reports/index.js';
export * as SettingsFeature from './features/settings/index.js';
export * as AuthFeature from './features/auth/index.js';
