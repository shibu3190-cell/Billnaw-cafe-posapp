# BILLNAW CAFE POS — DATABASE SCHEMA SPECIFICATION

> Target Engine: Google Cloud Firestore | Isolation: Multi-Tenant Scoped by `cafe_id` | Version: 2.0.0

---

## 1. MULTI-TENANCY & DATA ARCHITECTURE

All business collections are strictly nested under the root tenant document:
`/cafes/{cafe_id}/*`

This guarantees that:
1. One cafe can never read or query another cafe's documents.
2. Firestore security rules enforce `request.auth.token.cafe_id == cafe_id`.
3. Tenant export, backup, or purging is isolated to a single document hierarchy.

```
/cafes/{cafe_id}
  ├── profile                  # Cafe settings, GSTIN, FSSAI, tax rates
  ├── staff/{staff_id}         # Staff records with salted SHA-256 PIN hashes
  ├── tables/{table_id}        # Individual table states (row-level concurrency)
  ├── invoices/{invoice_id}    # IMMUTABLE settled billing ledger (Paise Math)
  ├── kot/{kot_id}             # Kitchen Order Tickets & cancellation audit log
  ├── menu/{item_id}           # Catalog dishes & beverage items
  ├── raw_materials/{mat_id}   # Commissary inventory stock & cost tracking
  ├── recipes/{recipe_id}      # Dish-to-ingredient composition maps
  ├── customers/{cust_id}      # CRM, loyalty points, Khata balance
  ├── khata/{entry_id}         # Customer debt and settlement ledger
  └── expenses/{exp_id}        # Operating expense records
```

---

## 2. DETAILED DOCUMENT SCHEMAS

### 2.1. Tenant Profile (`/cafes/{cafe_id}`)
```typescript
interface CafeTenantDocument {
  cafe_id: string;              // e.g. "cafe_billnaw_kolkata_01"
  name: string;                 // e.g. "Billnaw Artisan Cafe"
  address: string;
  phone: string;
  email: string;                // Owner account email
  owner_uid: string;            // Firebase Auth UID
  gstin: string;                // e.g. "19AAAAA0000A1Z5"
  fssai: string;                // 14-digit FSSAI license number
  tax_config: {
    gst_mode: "INCLUSIVE" | "EXCLUSIVE";
    default_gst_rate: number;   // 5, 12, or 18 percent
    cgst_rate: number;          // Half of GST rate
    sgst_rate: number;          // Half of GST rate
  };
  table_config: {
    total_tables: number;       // default 5, up to 60
    prefix: string;             // "T" or "Table "
    unpaid_alert_mins: number;  // 15 minutes
  };
  terminal_config: {
    start_invoice_no: number;   // 1001
    invoice_prefix: string;     // "BN"
  };
  created_at: string;           // ISO 8601
  updated_at: string;
}
```

### 2.2. Staff & Cashier RBAC (`/cafes/{cafe_id}/staff/{staff_id}`)
```typescript
interface StaffDocument {
  staff_id: string;             // e.g. "stf_01"
  name: string;                 // "Rahul Sharma"
  role: "ADMIN" | "MANAGER" | "CASHIER" | "WAITER";
  phone: string;
  pin_salt: string;             // 16-byte hex salt
  pin_hash: string;             // SHA-256(PIN + pin_salt) - NEVER plain text
  status: "ACTIVE" | "INACTIVE";
  permissions: {
    can_apply_discount: boolean;
    can_void_invoice: boolean;
    can_manage_menu: boolean;
    can_view_reports: boolean;
  };
  created_at: string;
  updated_at: string;
}
```

### 2.3. Granular Table Concurrency (`/cafes/{cafe_id}/tables/{table_id}`)
*Replaces monolithic `tablesInfo` blob with independent row-level table documents.*
```typescript
interface TableDocument {
  table_id: string;             // "T1", "T2", ... "T60"
  table_number: number;         // 1..60
  floor_id: string;             // "Ground Floor", "Mezzanine"
  capacity: number;             // Seats
  status: "AVAILABLE" | "OCCUPIED_DRAFT" | "KOT_SENT" | "SERVED" | "BILLED" | "PAID_CLOSED";
  active_bill_id: string | null;// Links to current in-flight invoice or null
  active_cart: {
    items: Array<{
      item_id: string;
      name: string;
      qty: number;
      price_paise: number;     // Integer paise
      kot_sent: boolean;
    }>;
    subtotal_paise: number;
    discount_paise: number;
    note?: string;
  };
  occupied_at: string | null;
  last_activity_at: string;
  version: number;              // Optimistic concurrency counter
}
```

### 2.4. Settled Invoice Ledger (`/cafes/{cafe_id}/invoices/{invoice_id}`)
*Strict Anti-Tampering Invariant: DELETE is forbidden. Transitions only to VOID.*
```typescript
interface InvoiceDocument {
  invoice_id: string;           // UUIDv4 (client_invoice_id)
  bill_no: string;              // Deterministic format: "BN-T1-261027-0042"
  cafe_id: string;
  terminal_id: string;          // e.g. "T1"
  table_id: string | "TAKEAWAY";
  customer_id: string | null;
  customer_name: string;
  customer_phone: string;
  cashier_id: string;
  cashier_name: string;
  
  // Financials in Integer Paise (Zero Floating-Point Error)
  items: Array<{
    item_id: string;
    name: string;
    category: string;
    hsn_code: string;
    qty: number;
    unit_price_paise: number;
    item_subtotal_paise: number;
    gst_rate: number;           // e.g. 5
    cgst_paise: number;
    sgst_paise: number;
  }>;
  gross_subtotal_paise: number;
  discount_paise: number;
  discount_type: "NONE" | "PERCENT" | "FIXED";
  discount_rate: number;
  taxable_subtotal_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  roundoff_paise: number;
  final_total_paise: number;    // Exactly equals taxable + cgst + sgst + roundoff
  
  // Payment settlement
  payment_mode: "CASH" | "UPI" | "CARD" | "KHATA" | "SPLIT";
  tendered_paise: number;
  change_paise: number;
  khata_recorded: boolean;
  
  // Audit Trail & Status Lifecycle
  status: "PAID" | "VOID";
  void_audit?: {
    void_reason: string;        // Mandatory
    voided_by_staff_id: string; // Must have can_void_invoice permission
    voided_by_name: string;
    voided_at: string;
  };
  
  printed: boolean;             // True if successfully sent to thermal printer
  synced_to_sheets: boolean;
  created_at: string;
  updated_at: string;
}
```

### 2.5. Kitchen Order Ticket (`/cafes/{cafe_id}/kot/{kot_id}`)
```typescript
interface KotDocument {
  kot_id: string;               // UUIDv4
  kot_number: number;           // Daily incrementing counter
  table_id: string;
  biller_name: string;
  items: Array<{
    item_id: string;
    name: string;
    qty: number;
    notes?: string;
  }>;
  status: "ACTIVE" | "CANCELLED";
  cancellation_reason?: string;
  cancelled_by?: string;
  created_at: string;
}
```

### 2.6. Commissary Raw Materials & Recipes
```typescript
interface RawMaterialDocument {
  material_id: string;
  name: string;                 // "Full Cream Milk", "Basmati Rice"
  category: "Dairy" | "Spices" | "Produce" | "Poultry" | "Grain";
  unit: "KG" | "LITER" | "UNIT" | "GRAM" | "ML";
  current_stock: number;        // Float for volume/weight
  min_threshold: number;
  unit_cost_paise: number;      // Cost per standard unit
  supplier_name?: string;
  last_restocked_at: string;
}

interface RecipeDocument {
  recipe_id: string;
  menu_item_id: string;
  yield_qty: number;
  ingredients: Array<{
    material_id: string;
    material_name: string;
    portion_qty: number;
    unit: string;
  }>;
  computed_food_cost_paise: number;
  selling_price_paise: number;
  margin_percent: number;
}
```

---

## 3. FIRESTORE SECURITY RULES ARCHITECTURE

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Multi-tenant barrier function
    function isTenantStaff(cafeId) {
      return request.auth != null && 
        (request.auth.token.cafe_id == cafeId || request.auth.uid == get(/databases/$(database)/documents/cafes/$(cafeId)).data.owner_uid);
    }
    
    function isTenantAdmin(cafeId) {
      return request.auth != null && 
        (request.auth.token.role == 'ADMIN' && request.auth.token.cafe_id == cafeId);
    }

    match /cafes/{cafeId} {
      allow read: if isTenantStaff(cafeId);
      allow write: if isTenantAdmin(cafeId);

      // Invoices: STRICT ANTI-TAMPERING
      match /invoices/{invoiceId} {
        allow read: if isTenantStaff(cafeId);
        allow create: if isTenantStaff(cafeId);
        
        // FORBID PERMANENT DELETION
        allow delete: if false;
        
        // UPDATE only allowed for transitioning status to VOID with mandatory audit fields
        allow update: if isTenantStaff(cafeId) &&
          resource.data.status == 'PAID' &&
          request.resource.data.status == 'VOID' &&
          request.resource.data.void_audit.void_reason is string &&
          request.resource.data.void_audit.voided_by_staff_id is string &&
          request.resource.data.void_audit.voided_at is string;
      }

      // Individual Tables (Row-level concurrency)
      match /tables/{tableId} {
        allow read, write: if isTenantStaff(cafeId);
      }

      // KOT Tickets
      match /kot/{kotId} {
        allow read, create: if isTenantStaff(cafeId);
        allow delete: if false; // KOT cancellations are status updates
        allow update: if isTenantStaff(cafeId);
      }

      // Menu, Inventory, Customers
      match /{allChildren=**} {
        allow read: if isTenantStaff(cafeId);
        allow write: if isTenantStaff(cafeId);
      }
    }
  }
}
```
