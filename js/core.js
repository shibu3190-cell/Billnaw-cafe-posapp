// ============================================================
// 🛠️ JS/CORE.JS - Core State, IndexedDB, GST Engine & Image Compressor
// ============================================================

// Date & Time Display
const topbarDateEl = document.getElementById('topbarDate');
if (topbarDateEl) {
    topbarDateEl.innerText = new Date().toLocaleDateString('en-GB', { 
        weekday: 'short', 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

const ALERT_THRESHOLD_MS = 15 * 60 * 1000; 
let monthlyChartInstance = null;

// Authoritative Currency & Formatting Helpers
function formatCurrency(amount) {
    return '₹ ' + Number(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
window.formatCurrency = formatCurrency;

// Date & String Helpers
function getLocalISODate(dateObj = new Date()) {
    const d = (dateObj instanceof Date && !isNaN(dateObj)) ? dateObj : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
window.getLocalISODate = getLocalISODate;

// Authoritative Modal Helpers
function openModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.style.display = 'flex';
        el.setAttribute('aria-hidden', 'false');
    }
}
function closeModal(modalId) {
    const el = document.getElementById(modalId);
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }
}
window.openModal = openModal;
window.closeModal = closeModal;

function getLocalISOMonth(dateObj = new Date()) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}`;
}
window.getLocalISOMonth = getLocalISOMonth;

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        let char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}
window.hashString = hashString;

// ⚡ Lazy Script Loader for On-Demand CDNs (Chart.js, PDF.js, etc.)
const _loadedLazyScripts = new Map();
function loadLazyScript(src) {
    if (!src) return Promise.reject(new Error('Script source is required'));
    if (_loadedLazyScripts.has(src)) return _loadedLazyScripts.get(src);
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
        const p = Promise.resolve();
        _loadedLazyScripts.set(src, p);
        return p;
    }
    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = (err) => {
            _loadedLazyScripts.delete(src);
            reject(err);
        };
        document.head.appendChild(script);
    });
    _loadedLazyScripts.set(src, promise);
    return promise;
}
window.loadLazyScript = loadLazyScript;

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
window.escapeHtml = escapeHtml;

function openMoreHub() {
    const modal = document.getElementById('moreHubModal');
    if (modal) modal.style.display = 'flex';
}
window.openMoreHub = openMoreHub;

function closeMoreHub() {
    const modal = document.getElementById('moreHubModal');
    if (modal) modal.style.display = 'none';
}
window.closeMoreHub = closeMoreHub;

// Global Terminal State
const defaultPinHash = hashString("1234");
let shopProfile = { 
    name: "billnaw", 
    address: "", 
    phone: "",
    ownerPhone: "",
    fssai: "", 
    gstin: "", 
    tableCount: 5,
    floors: ["Ground Floor", "1st Floor", "Outdoor"],
    activeFloor: "Ground Floor",
    tableNamingPrefix: "Table ",
    customTableNames: {}, 
    logo: "", 
    adminPinHash: defaultPinHash, 
    startInvoiceNo: 1001, 
    openAiKey: "", 
    upiId: "", 
    showQr: false,
    gstMode: "inclusive",
    defaultGstRate: 5,
    discountsEnabled: true,
    maxDiscountPercent: 50,
    maxDiscountFixed: 1000,
    discountPercentPresets: [5, 10, 15, 20, 25],
    discountFixedPresets: [20, 50, 100, 200],
    autoTierDiscounts: true,
    tierDiscountRates: {
        Platinum: 15,
        Gold: 10,
        Silver: 5,
        Bronze: 0
    }
};
window.shopProfile = shopProfile;

// Immediate synchronous profile & tenant hydration from localStorage to prevent refresh flicker
try {
    const rawLocalProfile = localStorage.getItem('billnaw_store_profile');
    if (rawLocalProfile) {
        const parsed = JSON.parse(rawLocalProfile);
        if (parsed && typeof parsed === 'object') {
            shopProfile = { ...shopProfile, ...parsed };
        }
    }
    const sessionRaw = localStorage.getItem('billnaw_shop_session');
    if (sessionRaw) {
        const session = JSON.parse(sessionRaw);
        if (session && session.shop) {
            if (session.shop.name && session.shop.name !== 'billnaw' && session.shop.name !== 'My Cafe') {
                shopProfile.name = session.shop.name;
            }
            if (session.shop.profile && typeof session.shop.profile === 'object') {
                const sp = session.shop.profile;
                if (sp.name && sp.name !== 'billnaw' && sp.name !== 'My Cafe') shopProfile.name = sp.name;
                if (sp.logo && !shopProfile.logo) shopProfile.logo = sp.logo;
                if (sp.address && !shopProfile.address) shopProfile.address = sp.address;
                if (sp.phone && !shopProfile.phone) shopProfile.phone = sp.phone;
            }
            if (session.shop.logo && !shopProfile.logo) {
                shopProfile.logo = session.shop.logo;
            }
            if (session.shop.address && !shopProfile.address) {
                shopProfile.address = session.shop.address;
            }
            if (session.shop.phone && !shopProfile.phone) {
                shopProfile.phone = session.shop.phone;
            }
        }
        if (session && session.storeCode) {
            shopProfile.storeCode = session.storeCode;
            myClientID = session.storeCode;
            window.myClientID = myClientID;
        }
    }
    const savedName = localStorage.getItem('billnaw_shop_name');
    if (savedName && savedName !== 'billnaw' && savedName !== 'My Cafe') {
        shopProfile.name = savedName;
    }
    const savedLogo = localStorage.getItem('billnaw_shop_logo');
    if (savedLogo && !shopProfile.logo) {
        shopProfile.logo = savedLogo;
    }
    const savedPhone = localStorage.getItem('billnaw_shop_phone') || localStorage.getItem('billnaw_auth_phone');
    if (savedPhone && !shopProfile.phone) {
        shopProfile.phone = savedPhone;
        shopProfile.ownerPhone = savedPhone;
    }
    const savedAddr = localStorage.getItem('billnaw_shop_address');
    if (savedAddr && !shopProfile.address) {
        shopProfile.address = savedAddr;
    }
    window.shopProfile = shopProfile;
} catch(e) {}

function getTableName(tableId) {
    if (!tableId && tableId !== 0) return 'Table 1';
    const id = parseInt(tableId, 10) || tableId;
    if (shopProfile.customTableNames && shopProfile.customTableNames[id]) {
        return String(shopProfile.customTableNames[id]).trim();
    }
    const prefix = shopProfile.tableNamingPrefix !== undefined ? shopProfile.tableNamingPrefix : 'Table ';
    if (!prefix) return `Table ${id}`;
    if (prefix === 'T') return `T-${id}`;
    if (prefix.endsWith(' ') || prefix.endsWith('-')) return `${prefix}${id}`;
    return `${prefix} ${id}`;
}
window.getTableName = getTableName;

let menuItems = [];
let orderHistory = [];
let dailyExpenses = [];
let tablesInfo = {};
let menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
let customersList = [];
let selectedCustomerForOrder = null;
let viewingHistoryCustomerId = null;
let staffList = [];
let currentStaff = { id: 1, name: "Admin", role: "Admin" };
let selectedLoginStaffId = 1;
let firestoreUnsubscribe = null;
let lastCloudSyncTime = null;

let myClientID = localStorage.getItem('billnaw_store_code') || localStorage.getItem('cafeLicenseKey') || null;
let currentRole = null;
let activeTable = 1;
let activeCategory = "All";
let editingMenuItemId = null;
let editingExpenseId = null;
let syncQueue = [];
let currentItemImageBase64 = "";
let deferredPrompt = null;

// Expose globals for cross-module compatibility
window.menuItems = menuItems;
window.orderHistory = orderHistory;
window.dailyExpenses = dailyExpenses;
window.tablesInfo = tablesInfo;
window.menuCategories = menuCategories;
window.customersList = customersList;
window.staffList = staffList;
window.currentStaff = currentStaff;
window.myClientID = myClientID;

// Toast Notifications (Polymorphic: info, success, warning, error - Deduplicated Single-Instance)
let activeToastTimeout = null;
let lastToastMessage = '';
let lastToastTime = 0;

function showToast(message, type = 'info') {
    if (!message) return;
    const now = Date.now();
    // Throttle identical rapid clicks
    if (message === lastToastMessage && now - lastToastTime < 350) return;
    lastToastMessage = message;
    lastToastTime = now;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Deduplicate: remove/replace currently visible toast immediately so only 1 appears
    container.innerHTML = '';
    if (activeToastTimeout) {
        clearTimeout(activeToastTimeout);
        activeToastTimeout = null;
    }

    const toast = document.createElement('div');
    const safeType = type || 'info';
    toast.className = `toast toast-${safeType}`;
    toast.innerText = message;
    container.appendChild(toast);

    activeToastTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.25s ease';
        setTimeout(() => toast.remove(), 250);
    }, 2500);
}
window.showToast = showToast;

// 🖼️ GOURMET CULINARY FOOD PHOTO & MULTI-VARIATION ASSET ENGINE
const CULINARY_PHOTO_MAP = [
    // 1. Samosa & Crispy Snacks
    {
        keys: ['samosa', 'singara', 'samosha', 'aloo samosa', 'samosa chaat', 'samosachaat', 'punjabi samosa', 'patti samosa', 'keema samosa'],
        url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1601050690123-e18712a206a4?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1601050690105-021d7b1d9bf5?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥟',
        theme: 'snack',
        grad: ['#6B3811', '#3D1C06'],
        badge: 'CRISPY'
    },
    // 2. Tea, Chai & Hot Beverages
    {
        keys: ['tea', 'chai', 'masala chai', 'ginger tea', 'cutting chai', 'hot tea', 'kulhad chai', 'kadak chai', 'green tea', 'elaichi chai', 'adrak chai', 'lemon tea', 'black tea'],
        url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '☕',
        theme: 'hot_bev',
        grad: ['#4E2F1D', '#2B160C'],
        badge: 'AROMATIC'
    },
    // 3. Chicken Curry & Non-Veg Gravies
    {
        keys: ['chicken curry', 'butter chicken', 'chicken masala', 'murgh kari', 'chicken handi', 'kadai chicken', 'mutton curry', 'chicken korma', 'chicken tikka masala', 'chicken gravy', 'rogan josh', 'chicken', 'mutton', 'fish curry'],
        url: 'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍗',
        theme: 'curry',
        grad: ['#691B14', '#390A06'],
        badge: 'GOURMET'
    },
    // 4. Masala Coke, Cola & Fizzy Refreshers
    {
        keys: ['masala coke', 'masala cola', 'spiced coke', 'spiced cola', 'coke', 'coca cola', 'cola', 'pepsi', 'thums up', 'lemon coke', 'diet coke', 'cold drink', 'fizz', 'soda'],
        url: 'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥤',
        theme: 'cold_bev',
        grad: ['#1A0F0A', '#381C10'],
        badge: 'CHILLED'
    },
    // 5. Biryani & Royal Rice
    {
        keys: ['biryani', 'chicken biryani', 'mutton biryani', 'veg biryani', 'hyderabadi biryani', 'dum biryani', 'pulao', 'jeera rice', 'fried rice', 'egg biryani', 'paneer biryani'],
        url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1589302168068-964664d93dc0?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1633945274405-b6c8069047b0?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1596797038530-2c107229654b?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍛',
        theme: 'curry',
        grad: ['#6B4412', '#3B2205'],
        badge: 'ROYAL'
    },
    // 6. Paneer & Veg Main Courses
    {
        keys: ['paneer', 'paneer butter masala', 'paneer tikka', 'shahi paneer', 'kadai paneer', 'matar paneer', 'palak paneer', 'paneer makhani', 'paneer lababdar', 'paneer pasanda', 'veg kadai'],
        url: 'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🧀',
        theme: 'curry',
        grad: ['#6E3314', '#381706'],
        badge: 'SAVORY'
    },
    // 7. Cold Coffee, Frappes & Shakes
    {
        keys: ['cold coffee', 'iced coffee', 'frappe', 'iced latte', 'cold brew', 'ice coffee', 'mocha frappe', 'shake', 'milkshake', 'chocolate shake', 'oreo shake', 'vanilla shake', 'strawberry shake'],
        url: 'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🧋',
        theme: 'cold_bev',
        grad: ['#3D2519', '#1C0E07'],
        badge: 'FROTHY'
    },
    // 8. Hot Coffee, Cappuccino & Espresso
    {
        keys: ['coffee', 'cappuccino', 'espresso', 'latte', 'hot coffee', 'americano', 'filter coffee', 'mocha', 'flat white', 'macchiato', 'hot chocolate', 'hot cocoa'],
        url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '☕',
        theme: 'hot_bev',
        grad: ['#422415', '#241006'],
        badge: 'BARISTA'
    },
    // 9. Burgers
    {
        keys: ['burger', 'veg burger', 'chicken burger', 'cheese burger', 'crispy burger', 'aloo tikki burger', 'paneer burger', 'slider'],
        url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍔',
        theme: 'fastfood',
        grad: ['#5E2C0F', '#331404'],
        badge: 'JUICY'
    },
    // 10. Pizza
    {
        keys: ['pizza', 'margherita', 'margherita pizza', 'paneer pizza', 'cheese pizza', 'farmhouse pizza', 'pepperoni', 'veg pizza', 'bbq pizza'],
        url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍕',
        theme: 'fastfood',
        grad: ['#6B1F0F', '#380B02'],
        badge: 'WOODFIRED'
    },
    // 11. French Fries & Finger Snacks
    {
        keys: ['fries', 'french fries', 'peri peri fries', 'potato wedges', 'nuggets', 'cheese balls', 'finger chips', 'crispy corn', 'potatoes', 'nachos', 'loaded nachos'],
        url: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍟',
        theme: 'snack',
        grad: ['#69440D', '#3B2404'],
        badge: 'CRISPY'
    },
    // 12. Sandwiches & Toasts
    {
        keys: ['sandwich', 'grilled sandwich', 'club sandwich', 'cheese sandwich', 'veg sandwich', 'paneer sandwich', 'toast', 'garlic bread', 'panini'],
        url: 'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1554433607-66b5efe9d304?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1619096252214-ef06c45683e3?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥪',
        theme: 'snack',
        grad: ['#5E3612', '#331C06'],
        badge: 'TOASTED'
    },
    // 13. Momos & Dim Sums
    {
        keys: ['momo', 'momos', 'steamed momos', 'fried momos', 'veg momos', 'chicken momos', 'dim sum', 'dumpling', 'kurkure momos', 'wonton'],
        url: 'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1534422298391-e4f8c172dddb?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541696432-82c6da8ce7bf?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥟',
        theme: 'snack',
        grad: ['#5A2D16', '#2E1408'],
        badge: 'STEAMED'
    },
    // 14. South Indian (Dosa, Idli, Vada, Sambar)
    {
        keys: ['dosa', 'masala dosa', 'plain dosa', 'ghee roast', 'paper dosa', 'paneer dosa', 'idli', 'vada', 'medu vada', 'sambar', 'uttapam', 'appam'],
        url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1630383249896-424e482df921?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥞',
        theme: 'snack',
        grad: ['#634114', '#382206'],
        badge: 'AUTHENTIC'
    },
    // 15. Lassi, Smoothies & Yogurt Drinks
    {
        keys: ['lassi', 'mango lassi', 'sweet lassi', 'rose lassi', 'smoothie', 'chaas', 'buttermilk', 'mattha'],
        url: 'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1527661591475-527312dd65f5?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1570696516188-ade861b84a49?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🧋',
        theme: 'cold_bev',
        grad: ['#5C3612', '#301A06'],
        badge: 'CREAMY'
    },
    // 16. Dal, Curries & Gravies
    {
        keys: ['dal', 'dal makhani', 'dal tadka', 'yellow dal', 'dal fry', 'chole', 'rajma', 'curry', 'chana masala', 'sambhar'],
        url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍲',
        theme: 'curry',
        grad: ['#692E11', '#381605'],
        badge: 'SIMMERED'
    },
    // 17. Noodles, Pasta & Indo-Chinese
    {
        keys: ['noodles', 'hakka noodles', 'chowmein', 'veg noodles', 'schezwan noodles', 'pasta', 'manchurian', 'chilli chicken', 'chilli paneer', 'pasta alfredo', 'red sauce pasta', 'chinese'],
        url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1612927601601-6638404737ce?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍜',
        theme: 'curry',
        grad: ['#5C2510', '#301105'],
        badge: 'WOK-TOSSED'
    },
    // 18. Rolls & Wraps
    {
        keys: ['roll', 'kathi roll', 'egg roll', 'paneer roll', 'chicken roll', 'wrap', 'frankie', 'shawarma', 'spring roll'],
        url: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1529042410759-befb1204b468?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🌯',
        theme: 'snack',
        grad: ['#593414', '#2E1906'],
        badge: 'FLAKY'
    },
    // 19. Desserts & Cakes
    {
        keys: ['pastry', 'cake', 'chocolate cake', 'brownie', 'ice cream', 'sundae', 'cheesecake', 'waffle', 'pancake', 'muffin', 'dessert', 'lava cake'],
        url: 'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍰',
        theme: 'dessert',
        grad: ['#4A152D', '#240715'],
        badge: 'SWEET'
    },
    // 20. Indian Sweets (Gulab Jamun, Halwa, Kheer)
    {
        keys: ['gulab jamun', 'rasgulla', 'kheer', 'halwa', 'gajar halwa', 'jalebi', 'sweet', 'mithai', 'rasmalai', 'kaju katli'],
        url: 'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1599785209707-a456fc1337bb?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍯',
        theme: 'dessert',
        grad: ['#542512', '#2B1106'],
        badge: 'TRADITIONAL'
    },
    // 21. Mocktails, Coolers & Juices
    {
        keys: ['mojito', 'virgin mojito', 'mocktail', 'lemonade', 'fresh lime soda', 'nimbu pani', 'juice', 'orange juice', 'watermelon juice', 'cooler', 'iced tea'],
        url: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1497534446932-c925b458314e?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍹',
        theme: 'cold_bev',
        grad: ['#0F382E', '#061C16'],
        badge: 'REFRESHING'
    },
    // 22. Soups
    {
        keys: ['soup', 'tomato soup', 'sweet corn soup', 'hot and sour soup', 'manchow soup', 'chicken soup', 'clear soup', 'mushroom soup'],
        url: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1603105037880-880cd4edfb0d?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1541832676-9b763b0239ab?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1578873375972-04b36021f1e9?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥣',
        theme: 'curry',
        grad: ['#5E2B12', '#301305'],
        badge: 'WARMING'
    },
    // 23. Indian Breads & Tandoor
    {
        keys: ['naan', 'butter naan', 'garlic naan', 'roti', 'tandoori roti', 'paratha', 'aloo paratha', 'laccha paratha', 'kulcha', 'bhature', 'puri', 'poori'],
        url: 'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🫓',
        theme: 'curry',
        grad: ['#5A3311', '#2C1705'],
        badge: 'TANDOORI'
    },
    // 24. Street Food & Chaat
    {
        keys: ['pav bhaji', 'vada pav', 'pani puri', 'golgappe', 'bhel puri', 'sev puri', 'dahi puri', 'chaat', 'kachori', 'chole bhature'],
        url: 'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1606491956689-2ea866880c84?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1601050690117-94f5f6fa8bd7?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1601050690123-e18712a206a4?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥘',
        theme: 'snack',
        grad: ['#693010', '#361504'],
        badge: 'STREET'
    },
    // 25. Breakfast & Eggs
    {
        keys: ['egg', 'omelette', 'omelet', 'egg bhurji', 'boiled egg', 'scrambled egg', 'french toast', 'egg roll', 'breakfast'],
        url: 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🍳',
        theme: 'snack',
        grad: ['#634510', '#332104'],
        badge: 'FRESH'
    },
    // 26. Salads & Bowls
    {
        keys: ['salad', 'caesar salad', 'green salad', 'sprout salad', 'greek salad', 'fruit salad', 'bowl', 'healthy'],
        url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
        urls: [
            'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
            'https://images.unsplash.com/photo-1505576399279-565b52d4ac71?w=600&auto=format&fit=crop&q=80'
        ],
        icon: '🥗',
        theme: 'curry',
        grad: ['#1C3D1B', '#0B1C0A'],
        badge: 'ORGANIC'
    }
];
window.CULINARY_PHOTO_MAP = CULINARY_PHOTO_MAP;

function getCuratedFoodPhoto(name, category = '', variationIndex = 0, allowCategoryFallback = true) {
    if (!name && !category) return null;
    const cleanName = String(name || '').toLowerCase().trim();
    const cleanCat = String(category || '').toLowerCase().trim();
    const vIdx = Math.max(0, parseInt(variationIndex, 10) || 0);

    // 1. Exact full-name match against any keyword in CULINARY_PHOTO_MAP
    if (cleanName) {
        for (const entry of CULINARY_PHOTO_MAP) {
            for (const k of entry.keys) {
                if (cleanName === k) {
                    if (entry.urls && entry.urls.length > 0) {
                        return entry.urls[vIdx % entry.urls.length];
                    }
                    return entry.url;
                }
            }
        }
    }

    // 2. High-precision scored keyword match:
    if (cleanName) {
        let bestEntry = null;
        let highestScore = 0;

        for (const entry of CULINARY_PHOTO_MAP) {
            let entryScore = 0;
            for (const k of entry.keys) {
                const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBoundaryRegex = new RegExp('(?:^|\\s|_|-|\\/)' + escapedK + '(?:$|\\s|_|-|\\/)', 'i');
                if (wordBoundaryRegex.test(cleanName)) {
                    const matchScore = k.length * 10;
                    if (matchScore > entryScore) {
                        entryScore = matchScore;
                    }
                }
            }

            if (entryScore > 0) {
                if (cleanCat && (
                    (entry.theme && cleanCat.includes(entry.theme)) ||
                    (entry.badge && cleanCat.includes(entry.badge.toLowerCase())) ||
                    entry.keys.some(k => cleanCat.includes(k) || k.includes(cleanCat))
                )) {
                    entryScore += 50;
                }

                if (entryScore > highestScore) {
                    highestScore = entryScore;
                    bestEntry = entry;
                }
            }
        }

        if (bestEntry) {
            if (bestEntry.urls && bestEntry.urls.length > 0) {
                return bestEntry.urls[vIdx % bestEntry.urls.length];
            }
            return bestEntry.url;
        }
    }

    // 3. Category-level intelligent fallback with multi-variation image pools
    if (allowCategoryFallback) {
        if (cleanCat.includes('beverage') || cleanCat.includes('drink') || cleanCat.includes('tea') || cleanCat.includes('coffee') || cleanCat.includes('juice')) {
            const bevList = [
                'https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1517701550927-30cf4ba1dba5?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80'
            ];
            return bevList[vIdx % bevList.length];
        }
        if (cleanCat.includes('snack') || cleanCat.includes('starter') || cleanCat.includes('appetizer') || cleanCat.includes('quick bite')) {
            const snackList = [
                'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1625220194771-7ebdea0b70b9?w=600&auto=format&fit=crop&q=80'
            ];
            return snackList[vIdx % snackList.length];
        }
        if (cleanCat.includes('main') || cleanCat.includes('curry') || cleanCat.includes('course') || cleanCat.includes('meal') || cleanCat.includes('rice') || cleanCat.includes('biryani')) {
            const mainList = [
                'https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=600&auto=format&fit=crop&q=80'
            ];
            return mainList[vIdx % mainList.length];
        }
        if (cleanCat.includes('dessert') || cleanCat.includes('sweet') || cleanCat.includes('cake') || cleanCat.includes('ice cream') || cleanCat.includes('bakery')) {
            const sweetList = [
                'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1605197584547-c93de1a00564?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=600&auto=format&fit=crop&q=80'
            ];
            return sweetList[vIdx % sweetList.length];
        }
        if (cleanCat.includes('fast') || cleanCat.includes('burger') || cleanCat.includes('pizza') || cleanCat.includes('sandwich')) {
            const fastList = [
                'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=600&auto=format&fit=crop&q=80',
                'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=600&auto=format&fit=crop&q=80'
            ];
            return fastList[vIdx % fastList.length];
        }
    }

    return null;
}
window.getCuratedFoodPhoto = getCuratedFoodPhoto;

function getCulinaryThemeMeta(name, category = '', variationIndex = 0) {
    const cleanName = String(name || '').toLowerCase().trim();
    const cleanCat = String(category || '').toLowerCase().trim();

    // 1. Exact match
    for (const entry of CULINARY_PHOTO_MAP) {
        for (const k of entry.keys) {
            if (cleanName === k) {
                return entry;
            }
        }
    }

    // 2. Scored match
    let bestEntry = null;
    let highestScore = 0;
    for (const entry of CULINARY_PHOTO_MAP) {
        let entryScore = 0;
        for (const k of entry.keys) {
            const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const wordBoundaryRegex = new RegExp('(?:^|\\s|_|-|\\/)' + escapedK + '(?:$|\\s|_|-|\\/)', 'i');
            if (wordBoundaryRegex.test(cleanName)) {
                const matchScore = k.length * 10;
                if (matchScore > entryScore) entryScore = matchScore;
            }
        }
        if (entryScore > 0) {
            if (cleanCat && (
                (entry.theme && cleanCat.includes(entry.theme)) ||
                (entry.badge && cleanCat.includes(entry.badge.toLowerCase()))
            )) {
                entryScore += 50;
            }
            if (entryScore > highestScore) {
                highestScore = entryScore;
                bestEntry = entry;
            }
        }
    }

    if (bestEntry) return bestEntry;

    if (cleanCat.includes('beverage') || cleanCat.includes('drink')) {
        return { icon: '☕', grad: ['#4E2F1D', '#2B160C'], badge: 'BEVERAGE' };
    }
    if (cleanCat.includes('snack') || cleanCat.includes('starter')) {
        return { icon: '🥟', grad: ['#6B3811', '#3D1C06'], badge: 'SNACK' };
    }
    if (cleanCat.includes('main') || cleanCat.includes('curry')) {
        return { icon: '🍗', grad: ['#691B14', '#390A06'], badge: 'MAIN' };
    }
    if (cleanCat.includes('dessert') || cleanCat.includes('sweet')) {
        return { icon: '🍰', grad: ['#4A152D', '#240715'], badge: 'DESSERT' };
    }
    return { icon: '🍽️', grad: ['#4A3B32', '#241B15'], badge: 'CAFE' };
}

function generateFallbackImage(name, category = '', variationIndex = 0) {
    const dishTitle = (name || "Dish").trim();
    const meta = getCulinaryThemeMeta(dishTitle, category, variationIndex);
    const vIdx = Math.max(0, parseInt(variationIndex, 10) || 0);

    // Alternate color hues based on variation
    const extraGrads = [
        ['#5A3D31', '#24160E'],
        ['#691B14', '#2C0B08'],
        ['#1A2E3B', '#0E1A22'],
        ['#2D3A1E', '#161D0F'],
        ['#4A152D', '#240715']
    ];
    const activeGrad = vIdx > 0 ? (extraGrads[vIdx % extraGrads.length]) : (meta.grad || ['#5A3D31', '#24160E']);

    // Browser Canvas Generation
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 240;
            canvas.height = 180;
            const ctx = canvas.getContext('2d');
            
            // 1. Rich 2-point culinary gradient
            const gradient = ctx.createLinearGradient(0, 0, 240, 180);
            gradient.addColorStop(0, activeGrad[0]);
            gradient.addColorStop(1, activeGrad[1]); 
            ctx.fillStyle = gradient; 
            ctx.fillRect(0, 0, 240, 180);
            
            // 2. Ceramic plate concentric rings
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(120, 75, 48, 0, Math.PI * 2);
            ctx.stroke();

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(120, 75, 40, 0, Math.PI * 2);
            ctx.stroke();

            // 3. Central Food Icon / Emoji
            ctx.font = '40px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillText(meta.icon || '🍽️', 120, 75);
            
            // 4. Frosted Title Pill
            ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(14, 138, 212, 28, 6);
            } else {
                ctx.rect(14, 138, 212, 28);
            }
            ctx.fill();

            // 5. Dish Name Label
            ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#FFFFFF';
            const cleanLabel = dishTitle.length > 22 ? dishTitle.substring(0, 20) + '..' : dishTitle;
            ctx.fillText(cleanLabel, 120, 154);

            // 6. Top Badge Indicator
            const badgeText = vIdx > 0 ? `${meta.badge || 'GOURMET'} #${vIdx + 1}` : (meta.badge || 'GOURMET');
            ctx.font = '900 8.5px sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
            ctx.textAlign = 'right';
            ctx.fillText(badgeText, 226, 18);

            try {
                return canvas.toDataURL('image/webp', 0.85);
            } catch(e) {
                return canvas.toDataURL('image/jpeg', 0.8);
            }
        } catch(canvasErr) {
            // Fall through to SVG data URI
        }
    }

    // Universal SVG fallback for headless/Node contexts
    const icon = meta.icon || '🍽️';
    const c1 = activeGrad[0];
    const c2 = activeGrad[1];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180" width="240" height="180">
        <defs>
            <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${c1}"/>
                <stop offset="100%" stop-color="${c2}"/>
            </linearGradient>
        </defs>
        <rect width="240" height="180" fill="url(#g)"/>
        <circle cx="120" cy="75" r="44" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="2"/>
        <text x="120" y="86" font-size="38" text-anchor="middle" font-family="sans-serif">${icon}</text>
        <rect x="14" y="138" width="212" height="28" rx="6" fill="rgba(0,0,0,0.45)"/>
        <text x="120" y="156" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="sans-serif">${dishTitle.substring(0, 20)}</text>
    </svg>`;
    return `data:image/svg+xml;base64,${typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : Buffer.from(svg).toString('base64')}`;
}
window.generateFallbackImage = generateFallbackImage;

function getGourmetFoodImage(name, category = '', variationIndex = 0) {
    return getCuratedFoodPhoto(name, category, variationIndex) || generateFallbackImage(name, category, variationIndex);
}
window.getGourmetFoodImage = getGourmetFoodImage;

function getDishVariationCount(name, category = '') {
    if (!name && !category) return 4;
    const clean = String(name || '').toLowerCase().trim();
    const cleanCat = String(category || '').toLowerCase().trim();
    if (clean) {
        for (const entry of CULINARY_PHOTO_MAP) {
            for (const k of entry.keys) {
                if (clean === k) {
                    return (entry.urls && entry.urls.length > 0) ? entry.urls.length : 4;
                }
            }
        }
        let bestEntry = null;
        let highestScore = 0;
        for (const entry of CULINARY_PHOTO_MAP) {
            let entryScore = 0;
            for (const k of entry.keys) {
                const escapedK = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const wordBoundaryRegex = new RegExp('(?:^|\\s|_|-|\\/)' + escapedK + '(?:$|\\s|_|-|\\/)', 'i');
                if (wordBoundaryRegex.test(clean)) {
                    const matchScore = k.length * 10;
                    if (matchScore > entryScore) entryScore = matchScore;
                }
            }
            if (entryScore > 0) {
                if (cleanCat && (
                    (entry.theme && cleanCat.includes(entry.theme)) ||
                    (entry.badge && cleanCat.includes(entry.badge.toLowerCase())) ||
                    entry.keys.some(k => cleanCat.includes(k) || k.includes(cleanCat))
                )) {
                    entryScore += 50;
                }
                if (entryScore > highestScore) {
                    highestScore = entryScore;
                    bestEntry = entry;
                }
            }
        }
        if (bestEntry && bestEntry.urls && bestEntry.urls.length > 0) {
            return bestEntry.urls.length;
        }
    }
    return 4;
}
window.getDishVariationCount = getDishVariationCount;

const defaultMenu = [
    { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
    { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
    { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, /* baseline price: 150 */ stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
    { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
];
window.defaultMenu = defaultMenu;

function isDefaultTemplateMenu(items) {
    if (!Array.isArray(items) || items.length === 0 || items.length > 4) return false;
    const defaultNames = new Set(['samosa', 'tea', 'chicken curry', 'masala coke']);
    return items.every(m => m && m.name && defaultNames.has(String(m.name).trim().toLowerCase()));
}
window.isDefaultTemplateMenu = isDefaultTemplateMenu;

// Baseline seeding: strictly restricted to unauthenticated demo sessions
const isAuthStoreSession = (function() {
    try {
        return Boolean(
            localStorage.getItem('billnaw_auth_token') ||
            localStorage.getItem('billnaw_shop_session') ||
            localStorage.getItem('billnaw_auth_mode') === 'authenticated'
        );
    } catch(e) { return false; }
})();

if (!isAuthStoreSession) {
    if (!menuItems || menuItems.length === 0) {
        menuItems = [...defaultMenu];
        window.menuItems = menuItems;
    }
    if (!menuCategories || menuCategories.length === 0) {
        menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
        window.menuCategories = menuCategories;
    }
} else {
    // Authenticated store: preserve empty menu or rehydrate from saved session snapshot
    try {
        const sessRaw = localStorage.getItem('billnaw_shop_session');
        if (sessRaw) {
            const sess = JSON.parse(sessRaw);
            if (Array.isArray(sess?.shop?.menu) && sess.shop.menu.length > 0 && (!menuItems || menuItems.length === 0 || isDefaultTemplateMenu(menuItems))) {
                menuItems = sess.shop.menu;
                window.menuItems = menuItems;
            }
            if (Array.isArray(sess?.shop?.categories) && sess.shop.categories.length > 0 && (!menuCategories || menuCategories.length === 0)) {
                menuCategories = sess.shop.categories;
                window.menuCategories = menuCategories;
            }
        }
    } catch(e) {}
}

async function compressImageFile(file, maxWidth = 360, maxHeight = 360, quality = 0.75) {
    if (!file) return null;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > h && w > maxWidth) {
                    h *= maxWidth / w;
                    w = maxWidth;
                } else if (h > maxHeight) {
                    w *= maxHeight / h;
                    h = maxHeight;
                }
                canvas.width = Math.round(w);
                canvas.height = Math.round(h);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                try {
                    resolve(canvas.toDataURL('image/webp', quality));
                } catch(err) {
                    resolve(canvas.toDataURL('image/jpeg', quality));
                }
            };
            img.onerror = () => resolve(e.target.result);
            img.src = e.target.result;
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}
window.compressImageFile = compressImageFile;

async function compressImageBase64(base64Str, maxWidth = 360, maxHeight = 360, quality = 0.75) {
    if (!base64Str || !base64Str.startsWith('data:image')) return base64Str;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > h && w > maxWidth) {
                h *= maxWidth / w;
                w = maxWidth;
            } else if (h > maxHeight) {
                w *= maxHeight / h;
                h = maxHeight;
            }
            canvas.width = Math.round(w);
            canvas.height = Math.round(h);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            try {
                resolve(canvas.toDataURL('image/webp', quality));
            } catch(err) {
                resolve(canvas.toDataURL('image/jpeg', quality));
            }
        };
        img.onerror = () => resolve(base64Str);
        img.src = base64Str;
    });
}
window.compressImageBase64 = compressImageBase64;

// GST Engine & Helpers
function getStoreGstConfig() {
    const mode = (shopProfile && shopProfile.gstMode) ? shopProfile.gstMode : 'inclusive';
    const defaultRate = (shopProfile && shopProfile.defaultGstRate !== undefined && !isNaN(shopProfile.defaultGstRate)) 
        ? Number(shopProfile.defaultGstRate) 
        : 5;
    return { mode, defaultRate };
}
window.getStoreGstConfig = getStoreGstConfig;

function handleGstModeChange() {
    const select = document.getElementById('gstPricingModeInput');
    if (!select) return;
    const mode = select.value;
    const desc = document.getElementById('gstModeDesc');
    const rateGroup = document.getElementById('defaultGstRateGroup');
    if (mode === 'inclusive') {
        if (desc) desc.innerText = "All menu prices INCLUDE GST. The rate on your menu is the final amount the customer pays; GST is calculated backward on receipts.";
        if (rateGroup) rateGroup.style.display = 'block';
    } else if (mode === 'exclusive') {
        if (desc) desc.innerText = "All menu prices EXCLUDE GST. The rate on your menu is before tax; GST is added on top during billing & checkout.";
        if (rateGroup) rateGroup.style.display = 'block';
    } else {
        if (desc) desc.innerText = "No GST applied (0% / Tax-Exempt). Menu rates are billed directly without tax.";
        if (rateGroup) rateGroup.style.display = 'none';
    }
}
window.handleGstModeChange = handleGstModeChange;

function calculateOrderTotals(items, discountObj = null) {
    const { mode, defaultRate } = getStoreGstConfig();
    let rawGross = 0;
    let totalTax = 0;
    let finalTotal = 0;
    let discountAmount = 0;
    let discountType = discountObj?.type || 'percent';
    let discountVal = Number(discountObj?.value) || 0;
    let discountReason = discountObj?.reason || '';
    let gstSummary = {};

    if (!items || !items.length) {
        return { 
            grossSubtotal: 0,
            subtotal: 0, 
            discountAmount: 0,
            discountType,
            discountVal,
            discountReason,
            totalTax: 0, 
            finalTotal: 0, 
            gstMode: mode, 
            defaultRate,
            gstSummary: {}
        };
    }

    // Calculate raw gross amount of all items
    items.forEach(item => {
        const rate = Number(item.price) || 0;
        const qty = Number(item.qty) || 0;
        rawGross += (rate * qty);
    });

    if (discountVal > 0) {
        if (discountType === 'percent') {
            discountAmount = Math.round(((rawGross * discountVal) / 100) * 100) / 100;
        } else {
            discountAmount = Math.min(rawGross, discountVal);
        }
    }
    discountAmount = Math.min(rawGross, Math.max(0, discountAmount));

    const discountedGross = Math.max(0, rawGross - discountAmount);
    const discountRatio = rawGross > 0 ? (discountedGross / rawGross) : 1;

    let computedTaxableSubtotal = 0;

    if (mode === 'exclusive') {
        items.forEach(item => {
            const rate = Number(item.price) || 0;
            const qty = Number(item.qty) || 0;
            const itemGross = rate * qty;
            const itemDiscounted = itemGross * discountRatio;
            const itemGstRate = (item.gstRate !== undefined && item.gstRate !== null && !isNaN(item.gstRate) && Number(item.gstRate) > 0)
                ? Number(item.gstRate)
                : defaultRate;
            const itemTax = (itemDiscounted * itemGstRate) / 100;
            computedTaxableSubtotal += itemDiscounted;
            totalTax += itemTax;

            if (itemGstRate > 0) {
                const rKey = String(itemGstRate);
                if (!gstSummary[rKey]) gstSummary[rKey] = { rate: itemGstRate, base: 0, tax: 0, cgst: 0, sgst: 0 };
                gstSummary[rKey].base += itemDiscounted;
                gstSummary[rKey].tax += itemTax;
                gstSummary[rKey].cgst += itemTax / 2;
                gstSummary[rKey].sgst += itemTax / 2;
            }
        });
        finalTotal = computedTaxableSubtotal + totalTax;
    } else if (mode === 'none') {
        computedTaxableSubtotal = discountedGross;
        totalTax = 0;
        finalTotal = discountedGross;
        gstSummary = {};
    } else {
        // inclusive mode
        items.forEach(item => {
            const rate = Number(item.price) || 0;
            const qty = Number(item.qty) || 0;
            const itemGross = rate * qty;
            const itemDiscounted = itemGross * discountRatio;
            const itemGstRate = (item.gstRate !== undefined && item.gstRate !== null && !isNaN(item.gstRate) && Number(item.gstRate) > 0)
                ? Number(item.gstRate)
                : defaultRate;
            const basePrice = itemGstRate > 0 ? (itemDiscounted / (1 + (itemGstRate / 100))) : itemDiscounted;
            const itemTax = itemDiscounted - basePrice;
            computedTaxableSubtotal += basePrice;
            totalTax += itemTax;

            if (itemGstRate > 0) {
                const rKey = String(itemGstRate);
                if (!gstSummary[rKey]) gstSummary[rKey] = { rate: itemGstRate, base: 0, tax: 0, cgst: 0, sgst: 0 };
                gstSummary[rKey].base += basePrice;
                gstSummary[rKey].tax += itemTax;
                gstSummary[rKey].cgst += itemTax / 2;
                gstSummary[rKey].sgst += itemTax / 2;
            }
        });
        finalTotal = discountedGross;
    }

    return {
        grossSubtotal: Math.round(rawGross * 100) / 100,
        subtotal: Math.round(computedTaxableSubtotal * 100) / 100,
        discountAmount: Math.round(discountAmount * 100) / 100,
        discountType,
        discountVal,
        discountReason,
        totalTax: Math.round(totalTax * 100) / 100,
        finalTotal: Math.round(finalTotal * 100) / 100,
        gstMode: mode,
        defaultRate,
        gstSummary
    };
}
window.calculateOrderTotals = calculateOrderTotals;

// IndexedDB Persistence Layer with Graceful Memory & Offline Fallback
const idbMemoryStore = {};
const idb = {
    db: null, 
    initPromise: null,
    init: function() {
        if (typeof indexedDB === 'undefined') {
            return Promise.resolve();
        }
        if (this.initPromise) return this.initPromise;
        this.initPromise = new Promise((resolve) => {
            try {
                const req = indexedDB.open('CafePOS_DB', 1);
                req.onupgradeneeded = (e) => { 
                    if (!e.target.result.objectStoreNames.contains('store')) {
                        e.target.result.createObjectStore('store'); 
                    }
                };
                req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
                req.onerror = (e) => {
                    console.warn('[IDB] Opening failed, falling back to storage:', e);
                    resolve();
                };
            } catch(err) {
                console.warn('[IDB] Exception during open:', err);
                resolve();
            }
        });
        return this.initPromise;
    },
    get: async function(key) {
        await this.init(); 
        if (!this.db) {
            return idbMemoryStore[key] !== undefined ? idbMemoryStore[key] : null;
        }
        return new Promise((resolve) => { 
            try {
                const tx = this.db.transaction('store', 'readonly'); 
                const req = tx.objectStore('store').get(key); 
                req.onsuccess = () => resolve(req.result); 
                req.onerror = () => resolve(idbMemoryStore[key] || null); 
            } catch (e) {
                resolve(idbMemoryStore[key] || null);
            }
        });
    },
    set: async function(key, val) {
        await this.init(); 
        idbMemoryStore[key] = val;
        if (!this.db) return;
        try {
            const tx = this.db.transaction('store', 'readwrite'); 
            tx.objectStore('store').put(val, key);
        } catch (e) {}
    },
    delete: async function(key) {
        await this.init();
        delete idbMemoryStore[key];
        if (!this.db) return;
        try {
            const tx = this.db.transaction('store', 'readwrite');
            tx.objectStore('store').delete(key);
        } catch (e) {}
    },
    clear: async function(key) {
        await this.init();
        if (key) {
            delete idbMemoryStore[key];
        } else {
            Object.keys(idbMemoryStore).forEach(k => delete idbMemoryStore[k]);
        }
        if (!this.db) return;
        try {
            const tx = this.db.transaction('store', 'readwrite');
            if (key) {
                tx.objectStore('store').delete(key);
            } else {
                tx.objectStore('store').clear();
            }
        } catch (e) {}
    }
};
window.idb = idb;

// Strict 10-Day Rolling Cache Eviction
async function pruneClientTransactionalCache(retentionDays = 10) {
    const cutoffMs = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const cutoffISO = new Date(cutoffMs).toISOString().slice(0, 10);

    // 1. Prune in-memory and IDB orderHistory
    let initialCount = Array.isArray(window.orderHistory) ? window.orderHistory.length : 0;
    if (initialCount > 0) {
        window.orderHistory = window.orderHistory.filter(order => {
            const rawDate = order.filterDate || order.created_at || (order.date ? order.date.split(',')[0].trim() : null) || order.id;
            const itemTime = typeof rawDate === 'number' ? rawDate : new Date(rawDate).getTime();
            return !isNaN(itemTime) && itemTime >= cutoffMs;
        });
        orderHistory = window.orderHistory;
        if (typeof idb !== 'undefined' && idb.set) {
            await idb.set('cafe_history', window.orderHistory);
        }
    }
    const remainingOrders = window.orderHistory ? window.orderHistory.length : 0;
    const evictedOrders = initialCount - remainingOrders;

    // 2. Prune dailyExpenses
    let initialExpCount = Array.isArray(window.dailyExpenses) ? window.dailyExpenses.length : 0;
    if (initialExpCount > 0) {
        window.dailyExpenses = window.dailyExpenses.filter(exp => {
            const expDate = exp.filterDate || exp.date || exp.id;
            const expTime = typeof expDate === 'number' ? expDate : new Date(expDate).getTime();
            return !isNaN(expTime) && expTime >= cutoffMs;
        });
        dailyExpenses = window.dailyExpenses;
        if (typeof idb !== 'undefined' && idb.set) {
            await idb.set('cafe_expenses', window.dailyExpenses);
        }
    }
    const evictedExpenses = initialExpCount - (window.dailyExpenses ? window.dailyExpenses.length : 0);

    // 3. Prune localStorage pos_order_history
    if (typeof localStorage !== 'undefined') {
        try {
            const rawLocal = localStorage.getItem('pos_order_history');
            if (rawLocal) {
                const localHist = JSON.parse(rawLocal);
                if (Array.isArray(localHist)) {
                    const filteredLocal = localHist.filter(inv => {
                        const t = new Date(inv.created_at || inv.settled_at || inv.date || inv.id).getTime();
                        return !isNaN(t) && t >= cutoffMs;
                    });
                    localStorage.setItem('pos_order_history', JSON.stringify(filteredLocal));
                }
            }
        } catch (e) {
            console.warn('[CacheEviction] localStorage pruning note:', e.message);
        }
    }

    if (evictedOrders > 0 || evictedExpenses > 0) {
        console.info(`[CacheEviction] Enforced ${retentionDays}-day retention ceiling: evicted ${evictedOrders} orders and ${evictedExpenses} expenses older than ${cutoffISO}.`);
    }

    return {
        evictedOrders,
        evictedExpenses,
        remainingOrders
    };
}
window.pruneClientTransactionalCache = pruneClientTransactionalCache;

// Hourly Background Timer for Rolling Cache Eviction
if (typeof setInterval === 'function') {
    setInterval(() => {
        pruneClientTransactionalCache(10).catch(() => {});
    }, 60 * 60 * 1000);
}

// Cloud Sync Status UI
function setCloudSyncStatus(status, text) {
    const topBadge = document.getElementById('cloudSyncBadge');
    const settingsBadge = document.getElementById('settingsSyncStatusBadge');
    const lastSyncEl = document.getElementById('settingsLastSyncTime');

    const labelText = (status === 'syncing' ? '🔄 ' : status === 'offline' ? '🟡 ' : '🟢 ') + (text || 'Cloud Synced');
    const clsName = 'sync-badge ' + (status === 'syncing' ? 'syncing' : status === 'offline' ? 'offline' : '');

    if (topBadge) {
        topBadge.className = clsName;
        topBadge.innerText = labelText;
    }
    if (settingsBadge) {
        settingsBadge.className = clsName;
        settingsBadge.innerText = labelText;
    }
    if (lastSyncEl && lastCloudSyncTime) {
        lastSyncEl.innerText = new Date(lastCloudSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}
window.setCloudSyncStatus = setCloudSyncStatus;

// ============================================================================
// 💎 Subscription Management & Real-Time Client Enforcement (Milestone 1)
// ============================================================================

let currentSubscriptionState = null;

function isSubscriptionPaused() {
    const status = (window.currentSubscriptionState && window.currentSubscriptionState.status) ||
                   (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_subscription_status') : null) ||
                   'ACTIVE';
    return status.toUpperCase() === 'PAUSED';
}
window.isSubscriptionPaused = isSubscriptionPaused;

function isSubscriptionRevoked() {
    const status = (window.currentSubscriptionState && window.currentSubscriptionState.status) ||
                   (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_subscription_status') : null) ||
                   'ACTIVE';
    return status.toUpperCase() === 'REVOKED';
}
window.isSubscriptionRevoked = isSubscriptionRevoked;

function applySubscriptionStatus(subscription) {
    if (!subscription || typeof subscription !== 'object') {
        subscription = {
            status: 'ACTIVE',
            plan: 'billnaw Pro',
            isFree: true
        };
    }

    const rawStatus = (subscription.status || 'ACTIVE').toUpperCase();
    currentSubscriptionState = { ...subscription, status: rawStatus };
    window.currentSubscriptionState = currentSubscriptionState;

    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('billnaw_subscription_status', rawStatus);
            localStorage.setItem('billnaw_subscription_record', JSON.stringify(currentSubscriptionState));
        }
    } catch (e) {}

    const pausedBanner = document.getElementById('subscriptionPausedBanner');
    const revokedOverlay = document.getElementById('subscriptionRevokedOverlay');
    const desktopCheckoutBtn = document.getElementById('desktopCheckoutBtn');
    const floatingCartRight = document.querySelector('#floatingCart .sc-right');
    const checkoutModalPayBtn = document.querySelector('#checkoutModal .btn-success');
    const settingsSubTitle = document.getElementById('settingsSubscriptionSubtitle');

    if (rawStatus === 'ACTIVE' || rawStatus === 'RESUMED') {
        // 1. Hide restriction banners and overlays
        if (pausedBanner) pausedBanner.style.display = 'none';
        if (revokedOverlay) revokedOverlay.style.display = 'none';

        // 2. Re-enable checkout and ordering buttons
        if (desktopCheckoutBtn) {
            desktopCheckoutBtn.disabled = false;
            desktopCheckoutBtn.removeAttribute('title');
        }
        if (floatingCartRight) {
            floatingCartRight.disabled = false;
            floatingCartRight.removeAttribute('title');
        }
        if (checkoutModalPayBtn) {
            checkoutModalPayBtn.disabled = false;
        }

        // 3. Update Settings Subtitle
        if (settingsSubTitle) {
            settingsSubTitle.innerText = `${subscription.plan || 'Pro Plan'} Active • Free Tier`;
        }

        if (typeof updateCartUI === 'function') {
            try { updateCartUI(); } catch (e) {}
        }

    } else if (rawStatus === 'PAUSED') {
        // 1. Show persistent amber banner
        if (pausedBanner) pausedBanner.style.display = 'flex';
        if (revokedOverlay) revokedOverlay.style.display = 'none';

        // 2. Disable checkout and ordering buttons
        if (desktopCheckoutBtn) {
            desktopCheckoutBtn.disabled = true;
            desktopCheckoutBtn.title = 'Subscription Paused - Contact Admin';
        }
        if (floatingCartRight) {
            floatingCartRight.disabled = true;
            floatingCartRight.title = 'Subscription Paused - Contact Admin';
        }
        if (checkoutModalPayBtn) {
            checkoutModalPayBtn.disabled = true;
        }

        // Dismiss checkout modal if currently open
        const cModal = document.getElementById('checkoutModal');
        if (cModal && cModal.style.display !== 'none') {
            cModal.style.display = 'none';
        }

        // 3. Update Settings Subtitle
        if (settingsSubTitle) {
            settingsSubTitle.innerText = 'Subscription Paused • Contact Admin';
        }

        if (typeof showToast === 'function') {
            showToast("⚠️ Subscription paused. Checkout is disabled.", "warning");
        }

    } else if (rawStatus === 'REVOKED') {
        // 1. Dismiss any open modals except the revoked overlay
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            if (modal.id !== 'subscriptionRevokedOverlay') {
                modal.style.display = 'none';
            }
        });

        // 2. Show full-screen lockout overlay
        if (revokedOverlay) {
            revokedOverlay.style.display = 'flex';
            const emailDisp = document.getElementById('revokedShopEmailDisplay');
            if (emailDisp) {
                emailDisp.innerText = subscription.shopEmail || (window.shopProfile && window.shopProfile.email) || (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_shop_email') : '') || 'N/A';
            }
            const storeDisp = document.getElementById('revokedStoreCodeDisplay');
            if (storeDisp) {
                storeDisp.innerText = subscription.shopId || (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : '') || 'N/A';
            }
            const reasonDisp = document.getElementById('subscriptionRevokedReason');
            if (reasonDisp && subscription.statusReason) {
                reasonDisp.innerText = subscription.statusReason;
            }
        }
        if (pausedBanner) pausedBanner.style.display = 'none';

        // 3. Lock POS session & purge active staff
        if (typeof clearCart === 'function') {
            try { clearCart(); } catch (e) {}
        }
        window.cart = [];
        window.currentStaff = null;
        window.currentRole = null;
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem('billnaw_active_staff');
                localStorage.removeItem('billnaw_current_session_id');
                localStorage.setItem('billnaw_terminal_locked', 'true');
            }
        } catch (e) {}
        isTerminalLocked = true;
        window.isTerminalLocked = true;
        if (typeof stopSessionHeartbeat === 'function') {
            try { stopSessionHeartbeat(); } catch (e) {}
        }
        if (typeof updateStaffTopbarDisplay === 'function') {
            try { updateStaffTopbarDisplay(); } catch (e) {}
        }

        // 4. Disconnect operational subcollections (sessions, invoices)
        if (typeof firestoreSessionsUnsubscribe === 'function') {
            try { firestoreSessionsUnsubscribe(); } catch (e) {}
            firestoreSessionsUnsubscribe = null;
        }
        if (typeof firestoreInvoicesUnsubscribe === 'function') {
            try { firestoreInvoicesUnsubscribe(); } catch (e) {}
            firestoreInvoicesUnsubscribe = null;
        }

        if (typeof setCloudSyncStatus === 'function') {
            setCloudSyncStatus('offline', 'Subscription Revoked');
        }

        if (settingsSubTitle) {
            settingsSubTitle.innerText = 'Subscription Revoked • Contact Admin';
        }
    }

    // 5. Dispatch decoupled DOM event for modular listeners
    if (typeof window !== 'undefined' && window.dispatchEvent) {
        window.dispatchEvent(new CustomEvent('billnaw:subscription-updated', {
            detail: { subscription: currentSubscriptionState, status: rawStatus }
        }));
    }
}
window.applySubscriptionStatus = applySubscriptionStatus;

async function checkSubscriptionStatusNow() {
    const email = (window.shopProfile && window.shopProfile.email) ||
                  (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_shop_email') || localStorage.getItem('ownerEmail')) : '') ||
                  '';
    const storeCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) ||
                      (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_store_code') : '') ||
                      '';
    try {
        const query = new URLSearchParams();
        if (email) query.set('email', email);
        if (storeCode) query.set('shopId', storeCode);
        const res = await fetch(`/api/subscription/status?${query.toString()}`);
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.subscription) {
                applySubscriptionStatus(data.subscription);
                if (typeof showToast === 'function') {
                    showToast(`Subscription status: ${data.subscription.status}`, 'info');
                }
                return;
            }
        }
        if (typeof showToast === 'function') {
            showToast('Unable to reach subscription service. Please verify internet connection.', 'error');
        }
    } catch (err) {
        if (typeof showToast === 'function') {
            showToast('Network error while checking subscription status.', 'error');
        }
    }
}
window.checkSubscriptionStatusNow = checkSubscriptionStatusNow;

// Capture-phase listener to disable checkout actions when subscription is paused or revoked
if (typeof document !== 'undefined') {
    document.addEventListener('click', function(e) {
        if (isSubscriptionPaused()) {
            const target = e.target.closest('#desktopCheckoutBtn, #floatingCart .sc-right, #checkoutModal .btn-success, #btnPlaceOrder');
            if (target) {
                e.preventDefault();
                e.stopPropagation();
                if (typeof showToast === 'function') {
                    showToast("⚠️ Subscription paused. Checkout is disabled - please contact admin.", "warning");
                }
            }
        } else if (isSubscriptionRevoked()) {
            const target = e.target.closest('#desktopCheckoutBtn, #floatingCart .sc-right, #checkoutModal .btn-success, #btnPlaceOrder');
            if (target) {
                e.preventDefault();
                e.stopPropagation();
            }
        }
    }, true);
}

// Firestore Sync Integration
function handleRemoteFirestoreUpdate(data) {
    if (!data || typeof data !== 'object') return;
    console.log("⚡ Received Firestore live store snapshot for:", myClientID);

    // 💎 Handle Subscription State Transitions (Milestone 1)
    if (data.subscription && typeof data.subscription === 'object') {
        applySubscriptionStatus(data.subscription);
    } else if (!currentSubscriptionState) {
        applySubscriptionStatus({ status: 'ACTIVE', plan: 'billnaw Pro', isFree: true });
    }

    if (data.profile) {
        const existingPinHash = shopProfile?.adminPinHash || localStorage.getItem('billnaw_admin_pin_hash');
        const existingLogo = shopProfile?.logo || localStorage.getItem('billnaw_shop_logo');
        const existingName = (shopProfile?.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') 
            ? shopProfile.name 
            : (localStorage.getItem('billnaw_shop_name') && localStorage.getItem('billnaw_shop_name') !== 'billnaw' && localStorage.getItem('billnaw_shop_name') !== 'My Cafe' ? localStorage.getItem('billnaw_shop_name') : null);
        const existingTableCount = shopProfile?.tableCount || 0;
        const existingTablesLen = (typeof tablesInfo === 'object' && tablesInfo) ? Object.keys(tablesInfo).length : 0;
        const maxTables = Math.max(existingTableCount, existingTablesLen, data.profile.tableCount || 0);

        shopProfile = { ...shopProfile, ...data.profile };
        if (maxTables > (shopProfile.tableCount || 0)) {
            shopProfile.tableCount = maxTables;
        }
        if (!shopProfile.logo && existingLogo) shopProfile.logo = existingLogo;
        if (existingName && (!data.profile.name || data.profile.name === 'My Cafe' || data.profile.name === 'billnaw')) {
            shopProfile.name = existingName;
        }
        if (!shopProfile.adminPinHash && existingPinHash) {
            shopProfile.adminPinHash = existingPinHash;
        } else if (!shopProfile.adminPinHash) {
            shopProfile.adminPinHash = (typeof hashString === 'function' ? hashString('1234') : defaultPinHash);
        }
        if (!shopProfile.startInvoiceNo) shopProfile.startInvoiceNo = 1001;
        window.shopProfile = shopProfile;
        try {
            idb.set('cafe_profile', shopProfile);
            if (shopProfile.logo) idb.set('cafe_logo', shopProfile.logo);
            localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
            if (shopProfile.name) localStorage.setItem('billnaw_shop_name', shopProfile.name);
            if (shopProfile.phone) localStorage.setItem('billnaw_shop_phone', shopProfile.phone);
            if (shopProfile.address) localStorage.setItem('billnaw_shop_address', shopProfile.address);
            if (shopProfile.fssai) localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai);
            if (shopProfile.gstin) localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin);
            if (shopProfile.upiId) localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId);
            if (shopProfile.logo && shopProfile.logo.length < 2000000) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
            if (shopProfile.adminPinHash) localStorage.setItem('billnaw_admin_pin_hash', shopProfile.adminPinHash);
            localStorage.setItem('billnaw_shop_show_qr', shopProfile.showQr ? 'true' : 'false');
            localStorage.setItem('billnaw_gst_mode', shopProfile.gstMode || 'inclusive');
            localStorage.setItem('billnaw_default_gst_rate', String(shopProfile.defaultGstRate || 5));
        } catch(e) {}
        if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
    }
    if (Array.isArray(data.staff) && data.staff.length > 0) {
        const activeStaff = (typeof window !== 'undefined' && window.currentStaff) || (typeof currentStaff !== 'undefined' ? currentStaff : null);
        if (activeStaff && activeStaff.role !== 'Admin') {
            const stillExists = data.staff.some(s => String(s.id) === String(activeStaff.id));
            if (!stillExists) {
                try { localStorage.setItem('billnaw_session_revoked', 'true'); } catch (e) {}
                if (typeof lockTerminalByRemote === 'function') {
                    lockTerminalByRemote({ staffId: activeStaff.id, status: 'REVOKED', reason: 'Staff profile removed by Admin' });
                } else if (typeof logoutStaff === 'function') {
                    logoutStaff();
                }
            }
        }
        if (Array.isArray(staffList) && staffList.length > data.staff.length) {
            // Local device has newer/more staff members: union merge so local additions are never wiped
            const staffMap = new Map();
            data.staff.forEach(s => { if (s && s.id) staffMap.set(String(s.id), s); });
            staffList.forEach(s => { if (s && s.id && !staffMap.has(String(s.id))) staffMap.set(String(s.id), s); });
            staffList = Array.from(staffMap.values());
            if (typeof dispatchBackendStoreSync === 'function') {
                dispatchBackendStoreSync({ staff: staffList }, true);
            }
        } else {
            staffList = data.staff;
        }
        window.staffList = staffList;
        try {
            idb.set('cafe_staff', staffList);
            localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList));
            const adminMember = staffList.find(s => s.role === 'Admin');
            if (adminMember && (adminMember.pin_hash || adminMember.pinHash)) {
                const aHash = adminMember.pin_hash || adminMember.pinHash;
                if (!shopProfile.adminPinHash) {
                    shopProfile.adminPinHash = aHash;
                    localStorage.setItem('billnaw_admin_pin_hash', aHash);
                }
            }
        } catch(e) {}
        if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();
        if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
    }
    if (Array.isArray(data.menu) && data.menu.length > 0) {
        if (typeof isDefaultTemplateMenu === 'function' && isDefaultTemplateMenu(menuItems)) {
            // Local store only held the default 4-item baseline: replace cleanly with authentic cloud catalog
            menuItems = data.menu;
        } else if (Array.isArray(menuItems) && menuItems.length > data.menu.length) {
            // Local store has more items: union merge by item name, excluding template defaults
            const defaultNames = new Set(['samosa', 'tea', 'chicken curry', 'masala coke']);
            const menuMap = new Map();
            data.menu.forEach(m => { if (m && m.name) menuMap.set(m.name.trim().toLowerCase(), m); });
            menuItems.forEach(m => {
                if (m && m.name) {
                    const key = m.name.trim().toLowerCase();
                    if (!menuMap.has(key) && !defaultNames.has(key)) {
                        menuMap.set(key, m);
                    }
                }
            });
            menuItems = Array.from(menuMap.values());
            if (typeof dispatchBackendStoreSync === 'function') {
                dispatchBackendStoreSync({ menu: menuItems }, true);
            }
        } else {
            menuItems = data.menu;
        }
        window.menuItems = menuItems;
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_menu', menuItems);
        }
    } else {
        const isAuthMode = (typeof isStoreAuthenticated === 'function')
            ? isStoreAuthenticated()
            : Boolean(localStorage.getItem('billnaw_auth_token') || localStorage.getItem('billnaw_shop_session') || localStorage.getItem('billnaw_auth_mode') === 'authenticated');
        if (!isAuthMode && (!Array.isArray(menuItems) || menuItems.length === 0)) {
            const cleanDefaultMenu = [
                { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
                { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
                { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
                { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
            ];
            menuItems = cleanDefaultMenu;
            window.menuItems = menuItems;
        }
    }
    if (Array.isArray(data.categories) && data.categories.length > 0) {
        menuCategories = data.categories;
        window.menuCategories = menuCategories;
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_categories', menuCategories);
        }
    } else if (!Array.isArray(menuCategories) || menuCategories.length === 0) {
        menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
        window.menuCategories = menuCategories;
    }
    if (Array.isArray(data.customers) && data.customers.length > 0) {
        customersList = data.customers;
    }
    if (data.tables && typeof data.tables === 'object') {
        const localTableCountBefore = (typeof tablesInfo === 'object' && tablesInfo) ? Object.keys(tablesInfo).length : 0;
        if (!tablesInfo || typeof tablesInfo !== 'object') tablesInfo = {};
        for (const [tId, tData] of Object.entries(data.tables)) {
            if (tData) {
                if (!tablesInfo[tId]) {
                    tablesInfo[tId] = tData;
                } else {
                    tablesInfo[tId] = { ...tablesInfo[tId], ...tData };
                }
            }
        }
        window.tablesInfo = tablesInfo;
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_tables', tablesInfo);
        }
        if (typeof renderTables === 'function') renderTables();
        if (typeof syncTableUI === 'function') syncTableUI();

        // If local device has more tables than remote cloud snapshot, immediately push back full local tables
        if (localTableCountBefore > Object.keys(data.tables).length && typeof dispatchBackendStoreSync === 'function') {
            dispatchBackendStoreSync({ tables: tablesInfo }, true);
        }
    }
    if (Array.isArray(data.history) || (data.history && typeof data.history === 'object')) {
        const remoteList = Array.isArray(data.history) ? data.history : Object.values(data.history);
        const orderMap = new Map();
        remoteList.forEach(o => {
            if (o) {
                const key = String(o.id || o.billNo || o.bill_no || Math.random());
                if (!o.filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(o.filterDate)) {
                    o.filterDate = (typeof getOrderFilterDate === 'function') ? getOrderFilterDate(o) : (o.date ? o.date.split(',')[0].trim() : getLocalISODate());
                }
                orderMap.set(key, o);
            }
        });
        (orderHistory || []).forEach(o => {
            if (o) {
                const key = String(o.id || o.billNo || o.bill_no || Math.random());
                if (!orderMap.has(key)) {
                    if (!o.filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(o.filterDate)) {
                        o.filterDate = (typeof getOrderFilterDate === 'function') ? getOrderFilterDate(o) : (o.date ? o.date.split(',')[0].trim() : getLocalISODate());
                    }
                    orderMap.set(key, o);
                }
            }
        });
        orderHistory = Array.from(orderMap.values()).sort((a,b) => (Number(b.id || b.billNo || 0) - Number(a.id || a.billNo || 0)));
        window.orderHistory = orderHistory;
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_history', orderHistory);
        }
    }
    if (Array.isArray(data.expenses) || (data.expenses && typeof data.expenses === 'object')) {
        const remoteExp = Array.isArray(data.expenses) ? data.expenses : Object.values(data.expenses);
        const expMap = new Map();
        remoteExp.forEach(e => {
            if (e) {
                const key = String(e.id || Math.random());
                if (!e.filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(e.filterDate)) {
                    e.filterDate = (typeof getExpenseFilterDate === 'function') ? getExpenseFilterDate(e) : (e.date ? e.date.split(',')[0].trim() : getLocalISODate());
                }
                expMap.set(key, e);
            }
        });
        (dailyExpenses || []).forEach(e => {
            if (e) {
                const key = String(e.id || Math.random());
                if (!expMap.has(key)) {
                    if (!e.filterDate || !/^\d{4}-\d{2}-\d{2}$/.test(e.filterDate)) {
                        e.filterDate = (typeof getExpenseFilterDate === 'function') ? getExpenseFilterDate(e) : (e.date ? e.date.split(',')[0].trim() : getLocalISODate());
                    }
                    expMap.set(key, e);
                }
            }
        });
        dailyExpenses = Array.from(expMap.values()).sort((a,b) => (Number(b.id || 0) - Number(a.id || 0)));
        window.dailyExpenses = dailyExpenses;
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_expenses', dailyExpenses);
        }
    }
    if (data.tables && typeof data.tables === 'object') {
        const fetchedTables = data.tables;
        for(let i = 1; i <= shopProfile.tableCount; i++) {
            if(fetchedTables[i]) { 
                tablesInfo[i] = fetchedTables[i]; 
                if(!tablesInfo[i].items) tablesInfo[i].items = []; 
            } else { 
                if (!tablesInfo[i]) tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null }; 
            }
        }
    }

    if (Array.isArray(data.kots)) {
        try {
            const rawPrev = localStorage.getItem('billnaw_active_kots');
            const prevList = rawPrev ? JSON.parse(rawPrev) : [];
            const prevIds = new Set(prevList.map(k => k.kot_id || k.id));
            const hasNewTicket = data.kots.some(k => !prevIds.has(k.kot_id || k.id) && k.status === 'PENDING');

            localStorage.setItem('billnaw_active_kots', JSON.stringify(data.kots));

            if (hasNewTicket && typeof playKdsAudioChime === 'function') {
                try { playKdsAudioChime(); } catch(chimeErr) {}
            }
        } catch (kotErr) {
            console.warn('[KDS Sync] KOT update notice:', kotErr);
        }
    }

    if (typeof pruneClientTransactionalCache === 'function') {
        pruneClientTransactionalCache(10).catch(() => {});
    }

    saveToLocal();
    updateAllUI();
}
window.handleRemoteFirestoreUpdate = handleRemoteFirestoreUpdate;

// Firestore Store Resolution & Sync Integration (Dual-path: /shops/{storeCode} and /cafes/{cafeId} with /clients/{clientId} fallback)
function getActiveStoreIdentifier() {
    let sessionStoreCode = null;
    try {
        const sessRaw = localStorage.getItem('billnaw_shop_session');
        if (sessRaw) {
            const sess = JSON.parse(sessRaw);
            if (sess && sess.storeCode && typeof sess.storeCode === 'string' && sess.storeCode.trim().length >= 3) {
                sessionStoreCode = sess.storeCode.trim();
            }
        }
    } catch(e) {}

    const raw = sessionStoreCode ||
                localStorage.getItem('billnaw_store_code') || 
                localStorage.getItem('billnaw_shop_code') ||
                localStorage.getItem('bongbhoj_client_id') ||
                localStorage.getItem('cafeLicenseKey') || 
                (shopProfile && (shopProfile.storeCode || shopProfile.id)) ||
                (typeof myClientID === 'string' && myClientID ? myClientID : null) || 
                null;
    let code = (typeof raw === 'string' && raw.trim().length >= 3) ? raw.trim() : null;

    // Intelligent Legacy & Named Store Fallback:
    // If no explicit storeCode was stored yet, resolve from shopProfile.name or local shop name (e.g. "AMBER & OAK" -> "AMBER___OAK")
    if (!code) {
        const nameRaw = (typeof shopProfile !== 'undefined' && shopProfile?.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') ? shopProfile.name :
                        (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_shop_name') : null);
        if (nameRaw && typeof nameRaw === 'string' && nameRaw.trim().length >= 2 && nameRaw.trim() !== 'billnaw' && nameRaw.trim() !== 'My Cafe') {
            const derived = nameRaw.trim().replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase();
            if (derived && derived.length >= 3) {
                code = derived;
            }
        }
    }

    if (typeof localStorage !== 'undefined' && !localStorage.getItem('billnaw_store_code') && code) {
        try { localStorage.setItem('billnaw_store_code', code); } catch(e) {}
    }
    return code;
}
window.getActiveStoreIdentifier = getActiveStoreIdentifier;

function getStoreCollectionName(code = null) {
    if (code === '') return 'cafes';
    const targetCode = (code !== null && code !== undefined) ? code : getActiveStoreIdentifier();
    if (!targetCode || typeof targetCode !== 'string') return "shops";
    if (/^\s/.test(targetCode)) return "shops";
    const clean = targetCode.trim().replace(/^\/+|\/+$/g, '').toLowerCase();
    if (clean.startsWith('shop-') || clean.startsWith('shop_')) {
        return "shops";
    }
    if (clean.startsWith('client-') || clean === 'bongbhoj-terminal') {
        return "clients";
    }
    if (clean.startsWith('cafe-') || clean.startsWith('cafe_')) {
        return "cafes";
    }
    return "shops";
}
window.getStoreCollectionName = getStoreCollectionName;

function getStoreDocRef(explicitCode = null, explicitCollection = null) {
    if (!window.firestoreDB || !window.firestoreDoc) return null;
    const code = explicitCode || getActiveStoreIdentifier();
    const collectionName = explicitCollection || getStoreCollectionName(code);
    return window.firestoreDoc(window.firestoreDB, collectionName, code);
}
window.getStoreDocRef = getStoreDocRef;

function getStoreSubcollectionRef(subcollection, explicitCode = null, explicitCollection = null) {
    if (!window.firestoreDB || !window.firestoreCollection) return null;
    const code = explicitCode || getActiveStoreIdentifier();
    const collectionName = explicitCollection || getStoreCollectionName(code);
    return window.firestoreCollection(window.firestoreDB, collectionName, code, subcollection);
}
window.getStoreSubcollectionRef = getStoreSubcollectionRef;

function getStoreSubdocRef(subcollection, docId, explicitCode = null, explicitCollection = null) {
    if (!window.firestoreDB || !window.firestoreDoc) return null;
    const code = explicitCode || getActiveStoreIdentifier();
    const collectionName = explicitCollection || getStoreCollectionName(code);
    return window.firestoreDoc(window.firestoreDB, collectionName, code, subcollection, String(docId));
}
window.getStoreSubdocRef = getStoreSubdocRef;

let firestoreDevicesUnsubscribe = null;
let firestoreSessionsUnsubscribe = null;
let firestoreStaffUnsubscribe = null;

function subscribeDevicesCloudListener(targetStoreCode = null) {
    if (!window.firestoreDB || !window.firestoreCollection || !window.firestoreOnSnapshot) return null;
    if (firestoreDevicesUnsubscribe) {
        try { firestoreDevicesUnsubscribe(); } catch (e) {}
        firestoreDevicesUnsubscribe = null;
    }
    try {
        const devicesColRef = getStoreSubcollectionRef('devices', targetStoreCode);
        if (!devicesColRef) return null;

        firestoreDevicesUnsubscribe = window.firestoreOnSnapshot(devicesColRef, (snap) => {
            const devices = [];
            snap.forEach(docSnap => {
                devices.push({ id: docSnap.id, ...docSnap.data() });
            });
            window.authorizedDevices = devices;
            try { localStorage.setItem('billnaw_authorized_devices', JSON.stringify(devices)); } catch(e) {}
            if (typeof idb !== 'undefined' && idb.set) { idb.set('billnaw_devices', devices); }

            const myDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
            const myRecord = devices.find(d => d.deviceId === myDevId || d.id === myDevId);
            if (myRecord) {
                window.currentDeviceRecord = myRecord;

                if (myRecord.isMaster === true) {
                    if (typeof setMasterTerminal === 'function') setMasterTerminal(true);
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                } else if (myRecord.status === 'AUTHORIZED' && localStorage.getItem('billnaw_device_status') !== 'AUTHORIZED') {
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                    if (myRecord.stationProfile) localStorage.setItem('billnaw_station_profile', myRecord.stationProfile);
                    if (myRecord.deviceName) localStorage.setItem('billnaw_station_name', myRecord.deviceName);

                    if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                    if (typeof showToast === 'function') showToast(`Terminal approved as ${myRecord.deviceName}!`, 'success');

                    if (typeof applyStationProfileRestrictions === 'function') {
                        applyStationProfileRestrictions();
                    }
                    const targetView = (typeof resolveInitialViewForStation === 'function')
                        ? resolveInitialViewForStation(myRecord.stationProfile)
                        : 'pos';
                    if (typeof switchView === 'function') {
                        switchView(targetView);
                    } else if (typeof switchTabDirect === 'function') {
                        switchTabDirect(targetView);
                    } else if (typeof switchTab === 'function') {
                        switchTab(targetView);
                    }
                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener();
                    }
                }

                // Status transition: -> REVOKED
                if (myRecord.status === 'REVOKED') {
                    if (typeof handleDeviceRevocation === 'function') {
                        handleDeviceRevocation(myRecord);
                    }
                }

                window.dispatchEvent(new CustomEvent('billnaw:device-status-changed', { detail: { device: myRecord, allDevices: devices } }));
            } else if (typeof isStoreAuthenticated === 'function' && isStoreAuthenticated()) {
                if (localStorage.getItem('billnaw_is_master') === 'true') {
                    return;
                }
                // Device is authenticated to store, but has no record in devices yet.
                // Verify if another device is active for this store:
                const otherActiveMaster = devices.find(d => (d.deviceId !== myDevId && d.id !== myDevId) && (d.isMaster === true || d.status === 'AUTHORIZED'));
                if (!otherActiveMaster && (!devices || devices.length === 0)) {
                    // No other device active: this device is the Master Terminal!
                    if (typeof setMasterTerminal === 'function') setMasterTerminal(true);
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                    if (typeof registerMasterDeviceToCloud === 'function') registerMasterDeviceToCloud(myDevId);
                    if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                } else if (otherActiveMaster) {
                    // Secondary terminal authenticated under store tenant: auto-authorize & register passively for admin audit
                    localStorage.setItem('billnaw_is_master', 'false');
                    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                    const devName = localStorage.getItem('billnaw_station_name') || (typeof detectDefaultDeviceName === 'function' ? detectDefaultDeviceName(myDevId) : 'Secondary Terminal');
                    if (typeof registerDeviceToCloud === 'function') registerDeviceToCloud(myDevId, devName, false);
                    if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                }
            }
            window.dispatchEvent(new CustomEvent('billnaw:devices-updated', { detail: { devices } }));
            // Live Admin Pairing Notification Banner update
            try {
                const banner = document.getElementById('adminPairingNotificationBanner');
                const bannerText = document.getElementById('adminPairingBannerText');
                const isMaster = (typeof isMasterTerminal === 'function') ? isMasterTerminal() : (localStorage.getItem('billnaw_is_master') === 'true');
                const pendingList = Array.isArray(devices) ? devices.filter(d => d.status === 'PENDING') : [];
                if (isMaster && pendingList.length > 0) {
                    if (banner && bannerText) {
                        banner.style.display = 'flex';
                        bannerText.innerText = `${pendingList.length} device${pendingList.length === 1 ? '' : 's'} requesting pairing authorization`;
                    }
                    if (typeof playKdsAudioChime === 'function') {
                        try { playKdsAudioChime(); } catch(chimeErr) {}
                    }
                    if (typeof showToast === 'function') {
                        showToast(`New pairing request from ${pendingList[0].deviceName || pendingList[0].deviceId}`, 'info');
                    }
                    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                        window.dispatchEvent(new CustomEvent('billnaw:device-pairing-requested', {
                            detail: { device: pendingList[0], allPending: pendingList }
                        }));
                    }
                } else if (banner) {
                    banner.style.display = 'none';
                }
            } catch (bannerErr) {}
            if (typeof renderAuthorizedDevicesHub === 'function') renderAuthorizedDevicesHub();
            if (typeof checkDeviceAuthorizationStatus === 'function') checkDeviceAuthorizationStatus();
        }, (err) => {
            console.warn('[Firestore] devices listener warning:', err.message);
        });
        return firestoreDevicesUnsubscribe;
    } catch (err) {
        console.warn('Error attaching devices listener:', err);
        return null;
    }
}
window.subscribeDevicesCloudListener = subscribeDevicesCloudListener;

function subscribeSessionsCloudListener(targetStoreCode = null) {
    if (!window.firestoreDB || !window.firestoreCollection || !window.firestoreOnSnapshot) return null;
    if (firestoreSessionsUnsubscribe) {
        try { firestoreSessionsUnsubscribe(); } catch (e) {}
        firestoreSessionsUnsubscribe = null;
    }
    try {
        const sessionsColRef = getStoreSubcollectionRef('sessions', targetStoreCode);
        if (!sessionsColRef) return null;

        firestoreSessionsUnsubscribe = window.firestoreOnSnapshot(sessionsColRef, (snap) => {
            const sessions = [];
            snap.forEach(docSnap => {
                sessions.push({ id: docSnap.id, ...docSnap.data() });
            });
            window.activeStaffSessions = sessions;
            try { localStorage.setItem('billnaw_active_sessions', JSON.stringify(sessions)); } catch(e) {}
            if (typeof idb !== 'undefined' && idb.set) { idb.set('billnaw_sessions', sessions); }

            const myDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
            const activeStaffId = (typeof window !== 'undefined' && window.currentStaff && window.currentStaff.id) || (typeof currentStaff !== 'undefined' && currentStaff && currentStaff.id);
            const lockedSession = sessions.find(s => 
                (s.deviceId === myDevId || s.sessionId === window.currentSessionId || (activeStaffId && String(s.staffId) === String(activeStaffId))) && 
                (s.status === 'LOCKED' || s.status === 'REVOKED' || s.isLocked === true)
            );
            if (lockedSession) {
                try { localStorage.setItem('billnaw_session_revoked', 'true'); } catch (e) {}
                window.dispatchEvent(new CustomEvent('billnaw:session-locked', { detail: { session: lockedSession } }));
                if (typeof lockTerminalByRemote === 'function') {
                    lockTerminalByRemote(lockedSession);
                } else if (typeof lockPosTerminal === 'function') {
                    lockPosTerminal();
                }
                if (typeof showToast === 'function') {
                    showToast(lockedSession.status === 'REVOKED' ? "Your staff session was revoked by Admin. Terminal locked." : "Terminal locked remotely.", "error");
                }
            }

            window.dispatchEvent(new CustomEvent('billnaw:sessions-updated', { detail: { sessions } }));
            if (typeof renderLiveSessionCards === 'function') renderLiveSessionCards();
            if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
        }, (err) => {
            console.warn('[Firestore] sessions listener warning:', err.message);
        });
        return firestoreSessionsUnsubscribe;
    } catch (err) {
        console.warn('Error attaching sessions listener:', err);
        return null;
    }
}
window.subscribeSessionsCloudListener = subscribeSessionsCloudListener;

function subscribeStaffCloudListener(targetStoreCode = null) {
    if (!window.firestoreDB || !window.firestoreCollection || !window.firestoreOnSnapshot) return null;
    if (firestoreStaffUnsubscribe) {
        try { firestoreStaffUnsubscribe(); } catch (e) {}
        firestoreStaffUnsubscribe = null;
    }
    try {
        const staffColRef = getStoreSubcollectionRef('staff', targetStoreCode);
        if (!staffColRef) return null;

        firestoreStaffUnsubscribe = window.firestoreOnSnapshot(staffColRef, (snap) => {
            const staffDocs = [];
            snap.forEach(docSnap => {
                staffDocs.push({ id: docSnap.id, ...docSnap.data() });
            });
            const activeStaff = (typeof window !== 'undefined' && window.currentStaff) || (typeof currentStaff !== 'undefined' ? currentStaff : null);
            if (activeStaff && activeStaff.role !== 'Admin' && staffDocs.length > 0) {
                const stillExists = staffDocs.some(s => String(s.id) === String(activeStaff.id));
                if (!stillExists) {
                    try { localStorage.setItem('billnaw_session_revoked', 'true'); } catch (e) {}
                    if (typeof lockTerminalByRemote === 'function') {
                        lockTerminalByRemote({ staffId: activeStaff.id, status: 'REVOKED', reason: 'Staff profile removed by Admin' });
                    } else if (typeof logoutStaff === 'function') {
                        logoutStaff();
                    }
                    if (typeof showToast === 'function') {
                        showToast("Your staff profile has been removed by Admin. Session logged out.", "error");
                    }
                }
            }
            if (staffDocs.length > 0) {
                staffList = staffDocs;
                window.staffList = staffList;
                if (typeof idb !== 'undefined' && idb.set) { idb.set('cafe_staff', staffList); }
                try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
                if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
                if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();
                if (typeof renderStaffList === 'function') renderStaffList();
                if (typeof renderAvatarPicker === 'function') renderAvatarPicker();
            }
            window.dispatchEvent(new CustomEvent('billnaw:staff-updated', { detail: { staff: staffDocs } }));
        }, (err) => {
            console.warn('[Firestore] staff listener warning:', err.message);
        });
        return firestoreStaffUnsubscribe;
    } catch (err) {
        console.warn('Error attaching staff listener:', err);
        return null;
    }
}
window.subscribeStaffCloudListener = subscribeStaffCloudListener;

let firestoreInvoicesUnsubscribe = null;

function subscribeInvoicesCloudListener(targetStoreCode = null) {
    if (!window.firestoreDB || !window.firestoreCollection || !window.firestoreOnSnapshot) return null;
    if (firestoreInvoicesUnsubscribe) {
        try { firestoreInvoicesUnsubscribe(); } catch (e) {}
        firestoreInvoicesUnsubscribe = null;
    }
    try {
        const invoicesColRef = getStoreSubcollectionRef('invoices', targetStoreCode);
        if (!invoicesColRef) return null;

        const tenDaysAgoISO = new Date(Date.now() - (10 * 24 * 60 * 60 * 1000)).toISOString();
        let queryTarget = invoicesColRef;
        if (window.firestoreQuery && window.firestoreWhere) {
            try {
                queryTarget = window.firestoreQuery(invoicesColRef, window.firestoreWhere('created_at', '>=', tenDaysAgoISO));
            } catch (qErr) {
                queryTarget = invoicesColRef;
            }
        }

        const handleInvoiceSnap = (snap) => {
            const invoices = [];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                if (!data.created_at || data.created_at >= tenDaysAgoISO) {
                    invoices.push({ id: docSnap.id, ...data });
                }
            });
            if (invoices.length > 0) {
                const orderMap = new Map((orderHistory || []).map(o => [String(o.id || o.billNo || o.bill_no || ''), o]));
                let hasNewInvoices = false;
                invoices.forEach(inv => {
                    const key = String(inv.id || inv.bill_no || inv.billNo || '');
                    if (key && !orderMap.has(key)) {
                        hasNewInvoices = true;
                        const totalAmount = inv.amount !== undefined ? Number(inv.amount) : (inv.final_payable_paise !== undefined ? inv.final_payable_paise / 100 : 0);
                        const rawItems = inv.rawItems || inv.items || [];
                        const formattedOrder = {
                            id: inv.id || Date.now(),
                            billNo: inv.billNo || inv.bill_no || inv.id,
                            date: inv.date || (inv.created_at ? new Date(inv.created_at).toLocaleString() : new Date().toLocaleString()),
                            filterDate: (typeof getOrderFilterDate === 'function') ? getOrderFilterDate(inv) : getLocalISODate(),
                            table: inv.table || inv.table_id || 'Takeaway',
                            orderType: inv.orderType || inv.order_type || 'Dine-In',
                            paymentMode: inv.paymentMode || inv.payment_mode || inv.payment_method || 'Cash',
                            customer: inv.customer || inv.customer_name || '',
                            biller: inv.biller || inv.biller_name || 'Staff',
                            items: rawItems.map(it => `${it.qty || it.quantity || 1}x ${it.name || 'Item'}`).join(', '),
                            rawItems: rawItems,
                            amount: totalAmount,
                            grossSubtotal: inv.grossSubtotal || totalAmount,
                            subtotal: inv.subtotal || totalAmount,
                            tax: inv.tax || 0,
                            discountAmount: inv.discountAmount || 0
                        };
                        orderMap.set(key, formattedOrder);
                    }
                });
                if (hasNewInvoices) {
                    orderHistory = Array.from(orderMap.values()).sort((a,b) => (Number(b.id || b.billNo || 0) - Number(a.id || a.billNo || 0)));
                    window.orderHistory = orderHistory;
                    if (typeof idb !== 'undefined' && idb.set) {
                        idb.set('cafe_history', orderHistory);
                    }
                    if (typeof renderDashboardAnalytics === 'function') {
                        const dashTab = document.getElementById('dashboard');
                        if (dashTab && dashTab.classList.contains('active')) {
                            renderDashboardAnalytics();
                        }
                    }
                }
            }
            window.dispatchEvent(new CustomEvent('billnaw:invoices-updated', { detail: { invoices } }));
        };

        firestoreInvoicesUnsubscribe = window.firestoreOnSnapshot(queryTarget, handleInvoiceSnap, (err) => {
            console.warn('[Firestore] invoices listener warning:', err ? err.message : err);
            // Resilient fallback: if composite query stream has issues, listen to direct collection
            if (queryTarget !== invoicesColRef) {
                try {
                    firestoreInvoicesUnsubscribe = window.firestoreOnSnapshot(invoicesColRef, handleInvoiceSnap, (fallbackErr) => {
                        console.warn('[Firestore] invoices fallback warning:', fallbackErr ? fallbackErr.message : fallbackErr);
                    });
                } catch (fallbackEx) {}
            }
        });
        return firestoreInvoicesUnsubscribe;
    } catch (err) {
        console.warn('Error attaching invoices listener:', err);
        return null;
    }
}
window.subscribeInvoicesCloudListener = subscribeInvoicesCloudListener;

async function syncDeviceRecordToCloud(deviceRecord, targetStoreCode = null) {
    if (!deviceRecord || !deviceRecord.deviceId) return;
    try {
        if (typeof idb !== 'undefined' && idb.set) {
            try {
                await idb.set('billnaw_device_' + deviceRecord.deviceId, deviceRecord);
            } catch (err) {
                console.warn('IndexedDB defer:', err.message);
            }
        }
        if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
            const subdocRef = getStoreSubdocRef('devices', deviceRecord.deviceId, targetStoreCode);
            if (subdocRef) {
                await window.firestoreSetDoc(subdocRef, {
                    ...deviceRecord,
                    lastSeenAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    } catch (e) {
        console.warn('syncDeviceRecordToCloud offline fallback:', e.message);
    }
}
window.syncDeviceRecordToCloud = syncDeviceRecordToCloud;

async function syncSessionRecordToCloud(sessionRecord, targetStoreCode = null) {
    if (!sessionRecord || !sessionRecord.sessionId) return;
    try {
        if (typeof idb !== 'undefined' && idb.set) {
            try {
                await idb.set('billnaw_session_' + sessionRecord.sessionId, sessionRecord);
            } catch (err) {
                console.warn('IndexedDB defer:', err.message);
            }
        }
        if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
            const subdocRef = getStoreSubdocRef('sessions', sessionRecord.sessionId, targetStoreCode);
            if (subdocRef) {
                await window.firestoreSetDoc(subdocRef, {
                    ...sessionRecord,
                    lastActiveAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    } catch (e) {
        console.warn('syncSessionRecordToCloud offline fallback:', e.message);
    }
}
window.syncSessionRecordToCloud = syncSessionRecordToCloud;

async function syncStaffRecordToCloud(staffRecord, targetStoreCode = null) {
    if (!staffRecord || (!staffRecord.id && !staffRecord.staffId)) return;
    const storeCode = targetStoreCode || (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (shopProfile && shopProfile.storeCode) || null;
    if (!storeCode) return;
    try {
        if (typeof idb !== 'undefined' && idb.set) {
            try {
                await idb.set('cafe_staff', staffList);
            } catch (err) {
                console.warn('IndexedDB defer:', err.message);
            }
        }
        if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
            const subdocRef = getStoreSubdocRef('staff', String(staffRecord.id || staffRecord.staffId), storeCode);
            if (subdocRef) {
                await window.firestoreSetDoc(subdocRef, {
                    ...staffRecord,
                    updatedAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    } catch (e) {
        console.warn('syncStaffRecordToCloud offline fallback:', e.message);
    }

    // High-Reliability Dual Layer: Server REST Sync
    try {
        await fetch('/api/sync/staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-shop-id': storeCode },
            body: JSON.stringify({ storeCode, staff: [staffRecord] })
        }).catch(() => {});
    } catch (e) {}
}
window.syncStaffRecordToCloud = syncStaffRecordToCloud;

let lastSubscribedStoreCode = null;

function attachFirestoreListener(targetStoreCode = null) {
    if (targetStoreCode && typeof targetStoreCode === 'string') {
        const cleanTargetCode = targetStoreCode.trim();
        if (cleanTargetCode && !cleanTargetCode.startsWith('..') && !cleanTargetCode.includes('/')) {
            try { localStorage.setItem('billnaw_store_code', cleanTargetCode); } catch(e) {}
        }
        myClientID = cleanTargetCode;
        window.myClientID = myClientID;
    }

    const activeStoreCode = targetStoreCode || getActiveStoreIdentifier();

    // Guard against rapid duplicate listener thrashing on the same store code
    if (lastSubscribedStoreCode === activeStoreCode && firestoreUnsubscribe && firestoreDevicesUnsubscribe) {
        return;
    }

    if (!window.firestoreDB || !window.firestoreDoc || !window.firestoreOnSnapshot) {
        setCloudSyncStatus('offline', 'Offline (Local)');
        return;
    }

    lastSubscribedStoreCode = activeStoreCode;

    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e) {}
        firestoreUnsubscribe = null;
    }

    // 🔒 F6: ZERO-STORE-DATA GATE INTERCEPT
    if (typeof canAccessStoreData === 'function' && !canAccessStoreData()) {
        console.warn('[ZeroStoreDataGate] Device status: ' + (typeof getDeviceStatus === 'function' ? getDeviceStatus() : 'PENDING') + '. Suspending store data sync.');
        // Ensure store business arrays remain empty
        menuItems = [];
        orderHistory = [];
        customersList = [];
        dailyExpenses = [];
        tablesInfo = {};
        // Secondary terminal MUST still listen to devices collection to receive pairing approval
        subscribeDevicesCloudListener(targetStoreCode);
        setCloudSyncStatus('offline', 'Awaiting Pairing Approval');
        return;
    }

    setCloudSyncStatus('syncing', 'Connecting Cloud...');
    try {
        const storeDocRef = getStoreDocRef(targetStoreCode);
        if (!storeDocRef) {
            setCloudSyncStatus('offline', 'Offline (Local)');
            return;
        }

        // Attach subcollection listeners for devices, sessions, staff, and decoupled 10-day invoices
        subscribeDevicesCloudListener(targetStoreCode);
        subscribeSessionsCloudListener(targetStoreCode);
        subscribeStaffCloudListener(targetStoreCode);
        subscribeInvoicesCloudListener(targetStoreCode);

        firestoreUnsubscribe = window.firestoreOnSnapshot(storeDocRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                handleRemoteFirestoreUpdate(data);
                lastCloudSyncTime = Date.now();
                setCloudSyncStatus('synced', 'Real-Time Synced');
            } else {
                persistAllToFirestore();
            }
        }, (err) => {
            const isPermissionError = err && (err.code === 'permission-denied' || (err.message && err.message.toLowerCase().includes('permission')));
            if (isPermissionError) {
                console.info("⚡ Firestore cloud permissions require active Firebase credentials. Running seamlessly in Local IndexedDB mode.");
                if (firestoreUnsubscribe) {
                    try { firestoreUnsubscribe(); } catch(e) {}
                    firestoreUnsubscribe = null;
                }
            } else {
                console.warn("Firestore onSnapshot error:", err);
            }
            setCloudSyncStatus('offline', 'Offline (Local)');
        });
    } catch (err) {
        console.warn("Error attaching Firestore listener:", err);
        setCloudSyncStatus('offline', 'Offline (Local)');
    }
}
window.attachFirestoreListener = attachFirestoreListener;
window.initFirestoreSync = attachFirestoreListener;

function detachFirestoreListener() {
    lastSubscribedStoreCode = null;
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e) {}
        firestoreUnsubscribe = null;
    }
    if (firestoreDevicesUnsubscribe) {
        try { firestoreDevicesUnsubscribe(); } catch(e) {}
        firestoreDevicesUnsubscribe = null;
    }
    if (firestoreSessionsUnsubscribe) {
        try { firestoreSessionsUnsubscribe(); } catch(e) {}
        firestoreSessionsUnsubscribe = null;
    }
    if (firestoreStaffUnsubscribe) {
        try { firestoreStaffUnsubscribe(); } catch(e) {}
        firestoreStaffUnsubscribe = null;
    }
    if (firestoreInvoicesUnsubscribe) {
        try { firestoreInvoicesUnsubscribe(); } catch(e) {}
        firestoreInvoicesUnsubscribe = null;
    }
    setCloudSyncStatus('offline', 'Disconnected');
}
window.detachFirestoreListener = detachFirestoreListener;
window.unsubscribeFirestoreListeners = detachFirestoreListener;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('firebaseLoaded', () => {
        attachFirestoreListener();
        const status = typeof getDeviceStatus === 'function' ? getDeviceStatus() : localStorage.getItem('billnaw_device_status');
        if (status === 'PENDING') {
            const devId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
            const code = localStorage.getItem('billnaw_pairing_code');
            if (devId && code && typeof registerPendingDeviceToCloud === 'function') {
                registerPendingDeviceToCloud(devId, code);
            }
        }
    });
}

// Food Image Storage Hygiene - Strips raw base64 data URLs > 2048 chars before cloud sync to protect Firestore 1MB document limit
function sanitizeMenuItemForStorage(item) {
    if (!item || typeof item !== 'object') return item;
    const clone = { ...item };
    if (typeof clone.image === 'string' && clone.image.startsWith('data:image/') && clone.image.length > 2048) {
        console.warn(`[Menu Storage Hygiene] Stripping inline base64 image (${clone.image.length} chars) for dish "${clone.name || clone.id}" before cloud sync to protect 1MB Firestore limit.`);
        const fallbackUrl = (typeof getCuratedFoodPhoto === 'function' ? getCuratedFoodPhoto(clone.name || '', clone.category || '') : '') ||
            'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop';
        clone.image = fallbackUrl;
    }
    return clone;
}
if (typeof window !== 'undefined') {
    window.sanitizeMenuItemForStorage = sanitizeMenuItemForStorage;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports.sanitizeMenuItemForStorage = sanitizeMenuItemForStorage;
    module.exports.getActiveStoreIdentifier = getActiveStoreIdentifier;
    module.exports.getStoreCollectionName = getStoreCollectionName;
    module.exports.getStoreDocRef = getStoreDocRef;
    module.exports.getStoreSubcollectionRef = getStoreSubcollectionRef;
    module.exports.getStoreSubdocRef = getStoreSubdocRef;
    module.exports.subscribeDevicesCloudListener = subscribeDevicesCloudListener;
    module.exports.subscribeSessionsCloudListener = subscribeSessionsCloudListener;
    module.exports.subscribeStaffCloudListener = subscribeStaffCloudListener;
    module.exports.syncDeviceRecordToCloud = syncDeviceRecordToCloud;
    module.exports.syncSessionRecordToCloud = syncSessionRecordToCloud;
    module.exports.syncStaffRecordToCloud = syncStaffRecordToCloud;
    module.exports.dispatchBackendStoreSync = dispatchBackendStoreSync;
    module.exports.pruneClientTransactionalCache = pruneClientTransactionalCache;
    module.exports.subscribeInvoicesCloudListener = subscribeInvoicesCloudListener;
}

let backendSyncTimeout = null;
let pendingBackendSyncPayload = {};

async function dispatchBackendStoreSync(partialPayload = {}, immediate = false) {
    if (!partialPayload || typeof partialPayload !== 'object') return false;
    const storeCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) ||
                      localStorage.getItem('billnaw_store_code') ||
                      localStorage.getItem('billnaw_shop_code') ||
                      (shopProfile && (shopProfile.storeCode || shopProfile.id)) ||
                      null;

    if (!storeCode) {
        console.warn('[BACKEND SYNC] No active storeCode found. Deferring sync to prevent cross-tenant contamination.');
        return false;
    }

    Object.assign(pendingBackendSyncPayload, partialPayload);
    pendingBackendSyncPayload.storeCode = storeCode;
    const activeOwnerEmail = (typeof shopProfile !== 'undefined' && (shopProfile?.ownerEmail || shopProfile?.email)) ||
                             localStorage.getItem('billnaw_auth_email') ||
                             localStorage.getItem('billnaw_owner_email') ||
                             localStorage.getItem('billnaw_shop_email') || '';
    if (activeOwnerEmail && !pendingBackendSyncPayload.ownerEmail) {
        pendingBackendSyncPayload.ownerEmail = activeOwnerEmail.trim().toLowerCase();
    }

    const doSync = async () => {
        const payloadToSend = { ...pendingBackendSyncPayload };
        pendingBackendSyncPayload = {};
        if (backendSyncTimeout) {
            clearTimeout(backendSyncTimeout);
            backendSyncTimeout = null;
        }

        let timeoutId = null;
        let signal = undefined;
        if (typeof AbortController !== 'undefined') {
            const controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 10000); // 10s low-network timeout
            signal = controller.signal;
        }

        try {
            const res = await fetch('/api/sync/store-data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-shop-id': storeCode,
                    'x-shop-email': payloadToSend.ownerEmail || ''
                },
                body: JSON.stringify(payloadToSend),
                signal
            });
            if (timeoutId) clearTimeout(timeoutId);
            if (res.ok) {
                lastCloudSyncTime = Date.now();
                setCloudSyncStatus('synced', 'Real-Time Synced');
                try { localStorage.removeItem('billnaw_offline_sync_queue'); } catch(e) {}
                return true;
            } else {
                throw new Error(`Sync HTTP ${res.status}`);
            }
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            console.warn('[BACKEND SYNC] Network defer / offline:', err.message);
            try {
                const existingQueue = JSON.parse(localStorage.getItem('billnaw_offline_sync_queue') || '{}');
                const mergedQueue = { ...existingQueue, ...payloadToSend };
                localStorage.setItem('billnaw_offline_sync_queue', JSON.stringify(mergedQueue));
            } catch(e) {}
            setCloudSyncStatus('offline', 'Offline (Saved Locally)');
        }
        return false;
    };

    if (immediate) {
        return await doSync();
    } else {
        if (backendSyncTimeout) clearTimeout(backendSyncTimeout);
        backendSyncTimeout = setTimeout(doSync, 350);
        return true;
    }
}
window.dispatchBackendStoreSync = dispatchBackendStoreSync;

async function flushOfflineSyncQueue() {
    try {
        const rawQueue = localStorage.getItem('billnaw_offline_sync_queue');
        if (!rawQueue) return;
        const queue = JSON.parse(rawQueue);
        if (queue && typeof queue === 'object' && Object.keys(queue).length > 0) {
            console.info('[OFFLINE SYNC] Resuming connectivity: flushing queued changes to cloud...');
            localStorage.removeItem('billnaw_offline_sync_queue');
            await dispatchBackendStoreSync(queue, true);
        }
    } catch(e) {}
}
window.flushOfflineSyncQueue = flushOfflineSyncQueue;

// Proactively reconcile and sync forward existing shop data to Cloud (Netlify & Server)
async function reconcileExistingShopCloudSync() {
    const storeCode = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : null;
    if (!storeCode) return;

    // 1. Flush any offline sync queue pending from previous disconnected sessions
    if (typeof flushOfflineSyncQueue === 'function') {
        try { await flushOfflineSyncQueue(); } catch(e) {}
    }

    // 2. If the local client has existing staff or tables (e.g. Amber & Oak with 9 staff, 24 tables),
    // proactively ensure they are synchronized to Cloud Firestore
    const sList = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList : [];
    const tInfo = (typeof tablesInfo !== 'undefined' && tablesInfo && typeof tablesInfo === 'object') ? tablesInfo : {};
    const hasData = sList.length > 0 || Object.keys(tInfo).length > 0;
    const isAuth = (typeof isStoreAuthenticated === 'function') 
        ? isStoreAuthenticated() 
        : Boolean(localStorage.getItem('billnaw_auth_token') || localStorage.getItem('billnaw_shop_session') || localStorage.getItem('billnaw_auth_mode') === 'authenticated');
    const isTemplateMenu = typeof isDefaultTemplateMenu === 'function' ? isDefaultTemplateMenu(menuItems) : false;
    const safeMenuToSend = (Array.isArray(menuItems) && menuItems.length > 0 && (!isAuth || !isTemplateMenu)) ? menuItems : undefined;

    if (hasData && typeof dispatchBackendStoreSync === 'function') {
        console.log(`[EXISTING SHOP SYNC] Reconciling shop data for ${storeCode}: ${sList.length} staff, ${Object.keys(tInfo).length} tables`);
        await dispatchBackendStoreSync({
            storeCode,
            profile: (typeof shopProfile !== 'undefined' && shopProfile) ? shopProfile : undefined,
            staff: sList.length > 0 ? sList : undefined,
            tables: Object.keys(tInfo).length > 0 ? tInfo : undefined,
            menu: safeMenuToSend,
            categories: (typeof menuCategories !== 'undefined' && Array.isArray(menuCategories) && menuCategories.length > 0) ? menuCategories : undefined
        }, true);
    }
}
window.reconcileExistingShopCloudSync = reconcileExistingShopCloudSync;

// Smooth Multi-Device Network Recovery Listeners
if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
        setCloudSyncStatus('syncing', 'Reconnected • Syncing...');
        flushOfflineSyncQueue();
    });
    window.addEventListener('offline', () => {
        setCloudSyncStatus('offline', 'Offline (Saved Locally)');
    });
}

async function persistAllToFirestore() {
    setCloudSyncStatus('syncing', 'Backing up to Cloud...');
    const sanitizedMenu = Array.isArray(menuItems) ? menuItems.map(item => sanitizeMenuItemForStorage(item)) : menuItems;
    let activeKots = [];
    try {
        const rawK = localStorage.getItem('billnaw_active_kots');
        if (rawK) activeKots = JSON.parse(rawK);
    } catch(e) {}

    const targetStoreCode = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (shopProfile?.storeCode || null);
    const safeProfile = JSON.parse(JSON.stringify(shopProfile || {}));
    const fullPayload = {
        storeCode: targetStoreCode,
        replaceStaff: true,
        profile: safeProfile,
        staff: staffList,
        menu: sanitizedMenu,
        categories: menuCategories,
        customers: customersList,
        history: orderHistory,
        expenses: dailyExpenses,
        tables: tablesInfo,
        kots: Array.isArray(activeKots) ? activeKots.slice(0, 50) : [],
        updatedAt: new Date().toISOString()
    };

    // Layer 1: Client SDK (if connected and authorized)
    if (window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        try {
            const storeDocRef = getStoreDocRef();
            if (storeDocRef) {
                await window.firestoreSetDoc(storeDocRef, fullPayload, { merge: true });
                lastCloudSyncTime = Date.now();
                setCloudSyncStatus('synced', 'Real-Time Synced');
            }
        } catch (e) {
            console.info("⚡ Client SDK write fallback to backend REST sync:", e.message);
        }
    }

    // Layer 2: High-Reliability Server REST Sync
    let didSync = false;
    try {
        const synced = await dispatchBackendStoreSync(fullPayload, true);
        if (synced) {
            lastCloudSyncTime = Date.now();
            setCloudSyncStatus('synced', 'Real-Time Synced');
            didSync = true;
        }
    } catch (err) {
        console.warn("Backend store sync error:", err.message);
        setCloudSyncStatus('offline', 'Local (IndexedDB)');
    }
    return didSync;
}
window.persistAllToFirestore = persistAllToFirestore;

function persistTables() { 
    idb.set('cafe_tables', tablesInfo); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { tables: tablesInfo, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ tables: tablesInfo, profile: shopProfile }, true);
    }
}
window.persistTables = persistTables;

function persistMenu() { 
    const sanitizedMenu = Array.isArray(menuItems)
        ? menuItems.map(item => sanitizeMenuItemForStorage(item))
        : menuItems;
    idb.set('cafe_menu', sanitizedMenu); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { menu: sanitizedMenu, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ menu: sanitizedMenu }, true);
    }
}
window.persistMenu = persistMenu;

function persistCategories() { 
    idb.set('cafe_categories', menuCategories); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { categories: menuCategories, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ categories: menuCategories }, true);
    }
}
window.persistCategories = persistCategories;

async function ensureShopProfileHydrated() {
    if (!shopProfile) shopProfile = {};
    // 0. Supreme Authority: Authenticated session identity
    try {
        const sessionRaw = localStorage.getItem('billnaw_shop_session');
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session && session.shop) {
                if (session.shop.name && session.shop.name !== 'billnaw' && session.shop.name !== 'My Cafe') {
                    shopProfile.name = session.shop.name;
                }
                if (session.shop.logo && !shopProfile.logo) {
                    shopProfile.logo = session.shop.logo;
                }
                if (session.shop.address && !shopProfile.address) {
                    shopProfile.address = session.shop.address;
                }
                if (session.shop.phone && !shopProfile.phone) {
                    shopProfile.phone = session.shop.phone;
                }
                if (session.shop.profile && typeof session.shop.profile === 'object') {
                    const sp = session.shop.profile;
                    if (sp.name && sp.name !== 'billnaw' && sp.name !== 'My Cafe') shopProfile.name = sp.name;
                    if (sp.logo && !shopProfile.logo) shopProfile.logo = sp.logo;
                    if (sp.address && !shopProfile.address) shopProfile.address = sp.address;
                    if (sp.phone && !shopProfile.phone) shopProfile.phone = sp.phone;
                }
            }
            if (session && session.storeCode) {
                shopProfile.storeCode = session.storeCode;
            }
        }
    } catch(e) {}
    // 1. Recover from JSON snapshot in localStorage if fields are missing
    try {
        const lsRaw = localStorage.getItem('billnaw_store_profile');
        if (lsRaw) {
            const parsed = JSON.parse(lsRaw);
            if (parsed && typeof parsed === 'object') {
                if ((!shopProfile.name || shopProfile.name === 'billnaw' || shopProfile.name === 'My Cafe') && parsed.name && parsed.name !== 'billnaw' && parsed.name !== 'My Cafe') shopProfile.name = parsed.name;
                if (!shopProfile.address && parsed.address) shopProfile.address = parsed.address;
                if (!shopProfile.phone && parsed.phone) shopProfile.phone = parsed.phone;
                if (!shopProfile.fssai && parsed.fssai) shopProfile.fssai = parsed.fssai;
                if (!shopProfile.gstin && parsed.gstin) shopProfile.gstin = parsed.gstin;
                if (!shopProfile.upiId && parsed.upiId) shopProfile.upiId = parsed.upiId;
                if (shopProfile.showQr === undefined && parsed.showQr !== undefined) shopProfile.showQr = Boolean(parsed.showQr);
                else if (!shopProfile.showQr && parsed.showQr === true) shopProfile.showQr = true;
                if (!shopProfile.logo && parsed.logo) shopProfile.logo = parsed.logo;
                if (!shopProfile.gstMode && parsed.gstMode) shopProfile.gstMode = parsed.gstMode;
                if ((shopProfile.defaultGstRate === undefined || shopProfile.defaultGstRate === null) && parsed.defaultGstRate !== undefined) {
                    shopProfile.defaultGstRate = Number(parsed.defaultGstRate);
                }
            }
        }
    } catch (e) {}

    // 2. Recover from discrete localStorage keys
    try {
        const dName = localStorage.getItem('billnaw_shop_name');
        if ((!shopProfile.name || shopProfile.name === 'billnaw' || shopProfile.name === 'My Cafe') && dName && dName !== 'billnaw' && dName !== 'My Cafe') shopProfile.name = dName;
        const dAddr = localStorage.getItem('billnaw_shop_address');
        if (!shopProfile.address && dAddr) shopProfile.address = dAddr;
        const dPhone = localStorage.getItem('billnaw_shop_phone');
        if (!shopProfile.phone && dPhone) shopProfile.phone = dPhone;
        const dFssai = localStorage.getItem('billnaw_shop_fssai');
        if (!shopProfile.fssai && dFssai) shopProfile.fssai = dFssai;
        const dGstin = localStorage.getItem('billnaw_shop_gstin');
        if (!shopProfile.gstin && dGstin) shopProfile.gstin = dGstin;
        const dUpi = localStorage.getItem('billnaw_shop_upi_id');
        if (!shopProfile.upiId && dUpi) shopProfile.upiId = dUpi;
        const dQr = localStorage.getItem('billnaw_shop_show_qr');
        if (dQr === 'true') shopProfile.showQr = true;
        const dLogo = localStorage.getItem('billnaw_shop_logo');
        if (!shopProfile.logo && dLogo) shopProfile.logo = dLogo;
        const dGstMode = localStorage.getItem('billnaw_gst_mode');
        if (!shopProfile.gstMode && dGstMode) shopProfile.gstMode = dGstMode;
        const dGstRate = localStorage.getItem('billnaw_default_gst_rate');
        if ((shopProfile.defaultGstRate === undefined || shopProfile.defaultGstRate === null) && dGstRate !== null && dGstRate !== '') {
            shopProfile.defaultGstRate = parseFloat(dGstRate);
        }
    } catch (e) {}

    // 3. Recover from IndexedDB if still missing logo or profile fields
    if (typeof idb !== 'undefined' && typeof idb.get === 'function') {
        try {
            if (!shopProfile.logo) {
                const idbLogo = await idb.get('cafe_logo');
                if (idbLogo) shopProfile.logo = idbLogo;
            }
            const idbProf = await idb.get('cafe_profile');
            if (idbProf && typeof idbProf === 'object') {
                if ((!shopProfile.name || shopProfile.name === 'billnaw' || shopProfile.name === 'My Cafe') && idbProf.name && idbProf.name !== 'billnaw' && idbProf.name !== 'My Cafe') shopProfile.name = idbProf.name;
                if (!shopProfile.address && idbProf.address) shopProfile.address = idbProf.address;
                if (!shopProfile.phone && idbProf.phone) shopProfile.phone = idbProf.phone;
                if (!shopProfile.fssai && idbProf.fssai) shopProfile.fssai = idbProf.fssai;
                if (!shopProfile.gstin && idbProf.gstin) shopProfile.gstin = idbProf.gstin;
                if (!shopProfile.upiId && idbProf.upiId) shopProfile.upiId = idbProf.upiId;
                if (!shopProfile.showQr && idbProf.showQr === true) shopProfile.showQr = true;
                if (!shopProfile.logo && idbProf.logo) shopProfile.logo = idbProf.logo;
                if (!shopProfile.gstMode && idbProf.gstMode) shopProfile.gstMode = idbProf.gstMode;
                if ((shopProfile.defaultGstRate === undefined || shopProfile.defaultGstRate === null) && idbProf.defaultGstRate !== undefined) {
                    shopProfile.defaultGstRate = Number(idbProf.defaultGstRate);
                }
            }
        } catch (e) {}
    }

    window.shopProfile = shopProfile;
    return shopProfile;
}
window.ensureShopProfileHydrated = ensureShopProfileHydrated;

function persistProfile() { 
    if (!shopProfile) shopProfile = {};
    if (!shopProfile.adminPinHash) {
        const savedHash = localStorage.getItem('billnaw_admin_pin_hash');
        shopProfile.adminPinHash = savedHash || (typeof hashString === 'function' ? hashString('1234') : defaultPinHash);
    }
    window.shopProfile = shopProfile;
    idb.set('cafe_profile', shopProfile); 
    if (shopProfile.logo) {
        idb.set('cafe_logo', shopProfile.logo);
    }

    // Quad-Tier Local Persistence: Save JSON + discrete keys to prevent wipe on cache clear
    try {
        localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
    } catch(e) {
        console.warn('[STORAGE] Profile snapshot local storage defer:', e.message);
    }

    try { if (shopProfile.name) localStorage.setItem('billnaw_shop_name', shopProfile.name); } catch(e) {}
    try { if (shopProfile.phone !== undefined) localStorage.setItem('billnaw_shop_phone', shopProfile.phone || ''); } catch(e) {}
    try { if (shopProfile.address !== undefined) localStorage.setItem('billnaw_shop_address', shopProfile.address || ''); } catch(e) {}
    try { if (shopProfile.fssai !== undefined) localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai || ''); } catch(e) {}
    try { if (shopProfile.gstin !== undefined) localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin || ''); } catch(e) {}
    try { if (shopProfile.upiId !== undefined) localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId || ''); } catch(e) {}
    try { if (shopProfile.adminPinHash) localStorage.setItem('billnaw_admin_pin_hash', shopProfile.adminPinHash); } catch(e) {}
    try { localStorage.setItem('billnaw_shop_show_qr', shopProfile.showQr ? 'true' : 'false'); } catch(e) {}
    try { localStorage.setItem('billnaw_gst_mode', shopProfile.gstMode || 'inclusive'); } catch(e) {}
    try { localStorage.setItem('billnaw_default_gst_rate', String(shopProfile.defaultGstRate !== undefined && shopProfile.defaultGstRate !== null ? shopProfile.defaultGstRate : 5)); } catch(e) {}
    try {
        if (shopProfile.logo && shopProfile.logo.length < 2000000) {
            localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
        }
    } catch(e) {}

    // Keep active authenticated shop session in sync with fresh profile changes
    try {
        const sessRaw = localStorage.getItem('billnaw_shop_session');
        if (sessRaw) {
            const sess = JSON.parse(sessRaw);
            if (sess && typeof sess === 'object') {
                if (!sess.shop) sess.shop = {};
                if (shopProfile.name) sess.shop.name = shopProfile.name;
                if (shopProfile.logo) sess.shop.logo = shopProfile.logo;
                if (shopProfile.address) sess.shop.address = shopProfile.address;
                if (shopProfile.phone) sess.shop.phone = shopProfile.phone;
                sess.shop.profile = { ...(sess.shop.profile || {}), ...shopProfile };
                localStorage.setItem('billnaw_shop_session', JSON.stringify(sess));
            }
        }
    } catch(e) {}

    // Cloud Master Persistence (Sanitized to strip any undefined values so Firestore never rejects)
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            Object.keys(shopProfile).forEach(k => {
                if (shopProfile[k] === undefined) delete shopProfile[k];
            });
            window.firestoreSetDoc(storeDocRef, { profile: shopProfile, updatedAt: new Date().toISOString() }, { merge: true }).catch(err => {
                console.warn('[FIRESTORE] Error saving profile to cloud:', err);
            });
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ profile: shopProfile });
    }
}
window.persistProfile = persistProfile;

function persistCustomersFirebase(newCust = null) {
    idb.set('cafe_customers', customersList);
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { customers: customersList, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ customers: customersList });
    }
}
window.persistCustomersFirebase = persistCustomersFirebase;

function persistHistoryFirebase(newOrder = null) { 
    if (typeof pruneClientTransactionalCache === 'function') {
        pruneClientTransactionalCache(10).catch(() => {});
    }
    idb.set('cafe_history', orderHistory); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { history: orderHistory, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ history: orderHistory });
    }
}
window.persistHistoryFirebase = persistHistoryFirebase;

function persistExpensesFirebase(newExp = null) { 
    idb.set('cafe_expenses', dailyExpenses); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { expenses: dailyExpenses, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ expenses: dailyExpenses });
    }
}
window.persistExpensesFirebase = persistExpensesFirebase;

function persistStaffToFirestore(newStaff = null) {
    idb.set('cafe_staff', staffList);
    try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { staff: staffList, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
        if (newStaff && (newStaff.id || newStaff.staffId)) {
            syncStaffRecordToCloud(newStaff).catch(() => {});
        } else if (Array.isArray(staffList)) {
            staffList.forEach(s => {
                if (s && (s.id || s.staffId)) {
                    syncStaffRecordToCloud(s).catch(() => {});
                }
            });
        }
    }
    if (typeof dispatchBackendStoreSync === 'function') {
        dispatchBackendStoreSync({ staff: staffList }, true);
    }
}
window.persistStaffToFirestore = persistStaffToFirestore;

function forceCloudSyncNow() {
    setCloudSyncStatus('syncing', 'Force Syncing...');
    showToast("⚡ Uploading store database to Cloud...");
    persistAllToFirestore().then((synced) => {
        const sCount = (typeof staffList !== 'undefined' && Array.isArray(staffList)) ? staffList.length : 0;
        const tCount = (typeof tablesInfo !== 'undefined' && tablesInfo && typeof tablesInfo === 'object') ? Object.keys(tablesInfo).length : 0;
        const mCount = (typeof menuItems !== 'undefined' && Array.isArray(menuItems)) ? menuItems.length : 0;
        if (synced) {
            showToast(`✅ Cloud synchronization complete! (${sCount} Staff, ${tCount} Tables, ${mCount} Menu items)`, 'success');
        } else {
            showToast(`⚠️ Saved locally (${sCount} Staff, ${tCount} Tables). Cloud sync queued.`, 'warning');
        }
        
        try {
            const lastSyncEl = document.getElementById('settingsLastSyncTime');
            if (lastSyncEl) lastSyncEl.innerText = new Date().toLocaleTimeString();
            const staffStat = document.getElementById('syncStatStaff');
            if (staffStat) staffStat.innerText = `Staff: ${sCount}`;
            const tableStat = document.getElementById('syncStatTables');
            if (tableStat) tableStat.innerText = `Tables: ${tCount}`;
            const menuStat = document.getElementById('syncStatMenu');
            if (menuStat) menuStat.innerText = `Menu: ${mCount}`;
        } catch(e) {}
    }).catch(e => {
        showToast("⚠️ Cloud Sync issue: " + e.message, 'warning');
    });
}
window.forceCloudSyncNow = forceCloudSyncNow;

// ============================================================
// 📱 DEVICE PAIRING, STATION PROFILES & ZERO-STORE-DATA GATE (M3)
// ============================================================

function generateDeviceId() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        const bytes = new Uint8Array(6);
        crypto.getRandomValues(bytes);
        const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
        return `DEV_${hex}`;
    }
    const hex = Math.random().toString(16).substring(2, 14).toUpperCase().padEnd(12, '0');
    return `DEV_${hex}`;
}
window.generateDeviceId = generateDeviceId;

function generatePairingCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
window.generatePairingCode = generatePairingCode;

function getOrCreateDeviceId() {
    let devId = localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id');
    if (!devId || !/^DEV_[A-Za-z0-9_]{6,32}$/.test(devId)) {
        devId = generateDeviceId();
        try {
            localStorage.setItem('billnaw_device_id', devId);
            localStorage.setItem('bongbhoj_device_id', devId);
        } catch (e) {}
    }
    return devId;
}
window.getOrCreateDeviceId = getOrCreateDeviceId;

function isStoreAuthenticated() {
    try {
        if (typeof localStorage === 'undefined') return true;
        const activeToken = localStorage.getItem('billnaw_auth_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('billnaw_auth_token') : null);
        const authMode = localStorage.getItem('billnaw_auth_mode');
        return Boolean((activeToken && authMode === 'authenticated') || authMode === 'demo');
    } catch (e) {
        return false;
    }
}
window.isStoreAuthenticated = isStoreAuthenticated;

async function verifyDeviceAuthorizationOnLogin(storeCode) {
    const myDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
    
    // Check if this physical device is already marked as master
    if (localStorage.getItem('billnaw_is_master') === 'true' && localStorage.getItem('billnaw_device_status') === 'AUTHORIZED') {
        if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
        return;
    }

    try {
        let devices = window.authorizedDevices || [];
        if ((!devices || devices.length === 0) && window.firestoreDB && window.firestoreCollection && window.firestoreGetDocs && typeof getStoreSubcollectionRef === 'function') {
            const devicesColRef = getStoreSubcollectionRef('devices', storeCode);
            if (devicesColRef) {
                const snap = await window.firestoreGetDocs(devicesColRef);
                devices = [];
                snap.forEach(d => devices.push({ id: d.id, ...d.data() }));
                window.authorizedDevices = devices;
            }
        }

        const myRecord = Array.isArray(devices) ? devices.find(d => d.deviceId === myDevId || d.id === myDevId) : null;
        if (myRecord) {
            if (myRecord.status === 'REVOKED') {
                await handleDeviceRevocation(myRecord);
                return;
            }
            if (myRecord.isMaster === true || myRecord.status === 'AUTHORIZED') {
                if (myRecord.isMaster && typeof setMasterTerminal === 'function') setMasterTerminal(true);
                localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                return;
            } else if (myRecord.status === 'PENDING') {
                // Auto-authorize store-authenticated terminal & register passively for admin audit
                localStorage.setItem('billnaw_is_master', 'false');
                localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
                registerDeviceToCloud(myDevId, myRecord.deviceName || detectDefaultDeviceName(myDevId), false);
                return;
            }
        }

        // No record exists for this device yet in cloud
        const otherActiveMaster = Array.isArray(devices) && devices.find(d => (d.deviceId !== myDevId && d.id !== myDevId) && (d.isMaster === true || d.status === 'AUTHORIZED'));
        if (!otherActiveMaster && (!devices || devices.length === 0)) {
            // First device for this store -> becomes Master Admin Terminal
            if (typeof setMasterTerminal === 'function') setMasterTerminal(true);
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
            if (typeof registerMasterDeviceToCloud === 'function') registerMasterDeviceToCloud(myDevId);
            if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
        } else {
            // Secondary terminal is authenticated via store credentials: auto-authorize & register passively for admin audit
            localStorage.setItem('billnaw_is_master', 'false');
            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
            const devName = localStorage.getItem('billnaw_station_name') || detectDefaultDeviceName(myDevId);
            if (typeof registerDeviceToCloud === 'function') registerDeviceToCloud(myDevId, devName, false);
            if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
        }
    } catch (e) {
        console.warn('verifyDeviceAuthorizationOnLogin notice:', e);
    }
}
window.verifyDeviceAuthorizationOnLogin = verifyDeviceAuthorizationOnLogin;

function isMasterTerminal() {
    const isMasterStored = localStorage.getItem('billnaw_is_master');
    if (isMasterStored === 'true') return true;
    if (isMasterStored === 'false') return false;

    // Do NOT auto-promote to master if not explicitly declared true.
    // Check if this device is explicitly registered as Master in cloud records
    const devices = window.authorizedDevices || [];
    const myDevId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (typeof localStorage !== 'undefined' ? (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id')) : null);
    const isConfirmedMaster = Array.isArray(devices) && devices.some(d => (d.deviceId === myDevId || d.id === myDevId) && d.isMaster === true);

    if (isConfirmedMaster) {
        setMasterTerminal(true);
        return true;
    }
    return false;
}
window.isMasterTerminal = isMasterTerminal;

async function registerMasterDeviceToCloud(deviceId) {
    try {
        if (typeof window.firestoreDB !== 'undefined' && typeof window.firestoreDoc !== 'undefined') {
            const devDocRef = getStoreSubdocRef('devices', deviceId);
            if (devDocRef && window.firestoreSetDoc) {
                await window.firestoreSetDoc(devDocRef, {
                    deviceId,
                    deviceName: 'Master Admin Terminal',
                    stationProfile: 'BILLING_COUNTER',
                    status: 'AUTHORIZED',
                    isMaster: true,
                    registeredAt: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    } catch (e) {
        console.warn('[DevicePairing] Master device cloud registration notice:', e.message);
    }
}
window.registerMasterDeviceToCloud = registerMasterDeviceToCloud;

function detectDefaultDeviceName(devId) {
    const isMobile = (typeof navigator !== 'undefined') && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
    const shortId = (devId || '').slice(-4).toUpperCase() || 'POS';
    return isMobile ? `Mobile Terminal (${shortId})` : `Counter Terminal (${shortId})`;
}
window.detectDefaultDeviceName = detectDefaultDeviceName;

async function registerDeviceToCloud(deviceId, deviceName, isMaster = false) {
    try {
        if (typeof window.firestoreDB !== 'undefined' && typeof window.firestoreDoc !== 'undefined') {
            const devDocRef = getStoreSubdocRef('devices', deviceId);
            if (devDocRef && window.firestoreSetDoc) {
                await window.firestoreSetDoc(devDocRef, {
                    deviceId,
                    deviceName: deviceName || (isMaster ? 'Master Admin Terminal' : detectDefaultDeviceName(deviceId)),
                    stationProfile: isMaster ? 'BILLING_COUNTER' : 'GENERAL_STATION',
                    status: 'AUTHORIZED',
                    isMaster: Boolean(isMaster),
                    lastSeenAt: new Date().toISOString()
                }, { merge: true });
            }
        }
    } catch (e) {
        console.warn('[DeviceRegistry] Passive cloud device sync notice:', e.message);
    }
}
window.registerDeviceToCloud = registerDeviceToCloud;

function setMasterTerminal(isMaster = true) {
    localStorage.setItem('billnaw_is_master', isMaster ? 'true' : 'false');
    if (isMaster) {
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
        setStationProfile('BILLING_COUNTER');
        if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
        const devId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
        if (devId) {
            registerMasterDeviceToCloud(devId);
        }
    }
}
window.setMasterTerminal = setMasterTerminal;

async function promptAdminAuthorizeTerminal() {
    const pin = prompt("Enter 4-Digit Admin PIN to authorize this terminal:");
    if (!pin) return;
    const cleanPin = pin.trim();
    let isMatch = (typeof verifyAdminPin === 'function')
        ? await verifyAdminPin(cleanPin)
        : ((typeof hashString === 'function' && hashString(cleanPin) === shopProfile?.adminPinHash) || (cleanPin === '1234'));

    if (!isMatch && Array.isArray(staffList)) {
        for (const s of staffList) {
            if (s.role === 'Admin') {
                if (typeof verifyStaffPin === 'function') {
                    if (await verifyStaffPin(s, cleanPin)) {
                        isMatch = true;
                        break;
                    }
                } else if (s.pin === cleanPin) {
                    isMatch = true;
                    break;
                }
            }
        }
    }

    if (isMatch) {
        const storedProfile = localStorage.getItem('billnaw_station_profile') || 'BILLING_COUNTER';
        const assignedProfile = (typeof STATION_PROFILES !== 'undefined' && STATION_PROFILES[storedProfile]) ? storedProfile : 'BILLING_COUNTER';
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
        localStorage.setItem('billnaw_station_profile', assignedProfile);
        if (localStorage.getItem('billnaw_is_master') !== 'true') {
            localStorage.setItem('billnaw_is_master', 'false');
        }
        if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();
        if (typeof applyStationProfileRestrictions === 'function') applyStationProfileRestrictions();
        const targetView = (typeof resolveInitialViewForStation === 'function')
            ? resolveInitialViewForStation(assignedProfile)
            : 'pos';
        if (typeof switchView === 'function') switchView(targetView);
        if (typeof showToast === 'function') showToast(`Terminal authorized as ${assignedProfile}!`, 'success');
        if (typeof initStoreCloudSync === 'function') initStoreCloudSync();
    } else {
        if (typeof showToast === 'function') showToast('Incorrect Admin PIN.', 'error');
    }
}
window.promptAdminAuthorizeTerminal = promptAdminAuthorizeTerminal;

function getDeviceStatus() {
    if (isMasterTerminal()) return 'AUTHORIZED';
    return localStorage.getItem('billnaw_device_status') || 'PENDING';
}
window.getDeviceStatus = getDeviceStatus;

const DEVICE_AUTH_TTL_MS = 10 * 24 * 60 * 60 * 1000; // 864,000,000 ms (10 days)
window.DEVICE_AUTH_TTL_MS = DEVICE_AUTH_TTL_MS;

function isDeviceAuthValid(customTimestamp) {
    if (customTimestamp) {
        const t = parseInt(customTimestamp, 10);
        return !isNaN(t) && (Date.now() - t) >= 0 && (Date.now() - t) < DEVICE_AUTH_TTL_MS;
    }
    const authStatus = localStorage.getItem('billnaw_device_status');
    if (authStatus !== 'AUTHORIZED') return false;
    const authTimestampStr = localStorage.getItem('billnaw_device_auth_timestamp');
    if (!authTimestampStr) {
        if (localStorage.getItem('billnaw_is_master') === 'true') {
            try { localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString()); } catch (e) {}
            return true;
        }
        return false;
    }
    const authTime = parseInt(authTimestampStr, 10);
    if (isNaN(authTime)) return false;
    return (Date.now() - authTime) >= 0 && (Date.now() - authTime) < DEVICE_AUTH_TTL_MS;
}
window.isDeviceAuthValid = isDeviceAuthValid;

function checkDeviceAuthExpiration() {
    const authStatus = localStorage.getItem('billnaw_device_status');
    const isMaster = localStorage.getItem('billnaw_is_master') === 'true';
    if (authStatus === 'AUTHORIZED') {
        const authTimestampStr = localStorage.getItem('billnaw_device_auth_timestamp');
        if (!authTimestampStr) {
            try { localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString()); } catch (e) {}
            return false;
        }
        const authTime = parseInt(authTimestampStr, 10);
        const isExpired = isNaN(authTime) || (Date.now() - authTime) >= DEVICE_AUTH_TTL_MS;
        if (isExpired) {
            if (isMaster) {
                if (typeof lockTerminal === 'function') {
                    lockTerminal(true);
                }
            } else {
                localStorage.removeItem('billnaw_device_status');
                localStorage.removeItem('billnaw_device_auth_timestamp');
                if (typeof initDevicePairingFlow === 'function') {
                    initDevicePairingFlow();
                } else if (typeof showDevicePairingOverlay === 'function') {
                    showDevicePairingOverlay();
                }
            }
            return true;
        }
    }
    return false;
}
window.checkDeviceAuthExpiration = checkDeviceAuthExpiration;

function canAccessStoreData() {
    if (typeof isStoreAuthenticated === 'function' && !isStoreAuthenticated()) return false;
    if (isMasterTerminal()) return true;
    if (checkDeviceAuthExpiration()) return false;
    const status = localStorage.getItem('billnaw_device_status');
    if (status === 'REVOKED') return false;
    if (status === 'PENDING') return false;
    if (window.currentDeviceRecord) {
        return window.currentDeviceRecord.status === 'AUTHORIZED';
    }
    return status === 'AUTHORIZED';
}
window.canAccessStoreData = canAccessStoreData;

const STATION_PROFILES = {
    BILLING_COUNTER: 'BILLING_COUNTER',
    KDS: 'KDS',
    WAITER_MOBILE: 'WAITER_MOBILE',
    GENERAL_STATION: 'GENERAL_STATION'
};
window.STATION_PROFILES = STATION_PROFILES;

function getStationProfile() {
    if (window.currentDeviceRecord && window.currentDeviceRecord.stationProfile) {
        return window.currentDeviceRecord.stationProfile;
    }
    const stored = localStorage.getItem('billnaw_station_profile');
    if (stored && Object.values(STATION_PROFILES).includes(stored)) {
        return stored;
    }
    return isMasterTerminal() ? STATION_PROFILES.BILLING_COUNTER : STATION_PROFILES.GENERAL_STATION;
}
window.getStationProfile = getStationProfile;

function setStationProfile(profile) {
    const safe = Object.values(STATION_PROFILES).includes(profile) ? profile : STATION_PROFILES.GENERAL_STATION;
    localStorage.setItem('billnaw_station_profile', safe);
    if (window.currentDeviceRecord) {
        window.currentDeviceRecord.stationProfile = safe;
    }
    applyStationProfileRestrictions();
    return safe;
}
window.setStationProfile = setStationProfile;

function resolveInitialViewForStation(stationProfile, staffRole = null) {
    const profile = stationProfile || (typeof getStationProfile === 'function' ? getStationProfile() : (typeof localStorage !== 'undefined' ? localStorage.getItem('billnaw_station_profile') : null));
    const activeStaff = (typeof window !== 'undefined' && window.currentStaff) ? window.currentStaff : (typeof currentStaff !== 'undefined' ? currentStaff : null);
    const effectiveRole = staffRole || (activeStaff ? activeStaff.role : null);
    const normRole = effectiveRole ? (typeof normalizeRole === 'function' ? normalizeRole(effectiveRole) : effectiveRole) : null;

    // 🔒 SUPERVISOR OVERRIDE: Admin and Manager must NEVER be trapped into KDS
    if (normRole === 'Admin' || normRole === 'Manager') {
        return 'pos';
    }

    if (profile === STATION_PROFILES.KDS || normRole === 'Kitchen Chef' || normRole === 'Chef') {
        return 'kds';
    }
    if (profile === STATION_PROFILES.WAITER_MOBILE || normRole === 'Floor Server' || normRole === 'Server') {
        return 'tables';
    }
    if (profile === STATION_PROFILES.GENERAL_STATION || profile === STATION_PROFILES.BILLING_COUNTER) {
        return 'pos';
    }
    return 'pos';
}
window.resolveInitialViewForStation = resolveInitialViewForStation;

function switchView(viewId) {
    const clean = String(viewId || 'pos').replace(/^#/, '');
    if (typeof switchTab === 'function') {
        return switchTab(clean);
    }
}
window.switchView = switchView;

function applyStationProfileRestrictions() {
    const profile = typeof getStationProfile === 'function' ? getStationProfile() : (localStorage.getItem('billnaw_station_profile') || 'BILLING_COUNTER');
    const navPos = document.getElementById('nav-pos');
    const navKds = document.getElementById('nav-kds');
    const navTables = document.getElementById('nav-tables');
    const navMenu = document.getElementById('nav-menu');
    const navReports = document.getElementById('nav-dashboard');
    const navInventory = document.getElementById('nav-inventory');
    const navKhata = document.getElementById('nav-khata');
    const navMore = document.getElementById('nav-more');

    const checkoutBtn = document.getElementById('checkoutBtn');
    const cartDiscountWrap = document.getElementById('cartDiscountWrap') || document.querySelector('.cart-discount-row');

    const activeStaff = (typeof window !== 'undefined' && window.currentStaff) ? window.currentStaff : (typeof currentStaff !== 'undefined' ? currentStaff : null);
    const normRole = activeStaff && activeStaff.role ? (typeof normalizeRole === 'function' ? normalizeRole(activeStaff.role) : activeStaff.role) : null;
    const isSupervisor = (normRole === 'Admin' || normRole === 'Manager');

    // Admin & Supervisor Unrestricted Access: Full POS, KDS, Menu, Reports, Inventory & Settings
    if (isSupervisor) {
        if (navPos) navPos.style.display = 'flex';
        if (navKds) navKds.style.display = 'flex';
        if (navTables) navTables.style.display = 'none'; // Tables is cleanly integrated inside More modal
        if (navMenu) navMenu.style.display = 'flex';
        if (navReports) navReports.style.display = 'flex';
        if (navInventory) navInventory.style.display = 'flex';
        if (navKhata) navKhata.style.display = 'flex';
        if (navMore) navMore.style.display = 'flex';
        if (checkoutBtn) checkoutBtn.style.display = '';
        if (cartDiscountWrap) cartDiscountWrap.style.display = '';

        const dBtn = document.getElementById('desktopCheckoutBtn');
        if (dBtn) {
            dBtn.innerHTML = '<span>CHECKOUT</span><span id="desktopCheckoutBtnSub" style="display: inline-flex; align-items: center;"><svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></span>';
            dBtn.onclick = () => { if (typeof openCheckoutModal === 'function') openCheckoutModal(); };
        }
        if (typeof enforcePermissions === 'function') enforcePermissions();
        return;
    }

    if (profile === STATION_PROFILES.KDS || normRole === 'Kitchen Chef' || normRole === 'Chef') {
        if (navPos) navPos.style.display = 'none';
        if (navTables) navTables.style.display = 'none';
        if (navMenu) navMenu.style.display = 'none';
        if (navReports) navReports.style.display = 'none';
        if (navInventory) navInventory.style.display = 'none';
        if (navKhata) navKhata.style.display = 'none';
        if (navMore) navMore.style.display = 'none';
        if (navKds) {
            navKds.style.display = 'flex';
            navKds.classList.add('active');
        }
        if (checkoutBtn) checkoutBtn.style.display = 'none';
    } else if (profile === STATION_PROFILES.WAITER_MOBILE || normRole === 'Floor Server' || normRole === 'Server') {
        if (navPos) navPos.style.display = 'flex';
        if (navTables) navTables.style.display = 'none';
        if (navKds) navKds.style.display = 'none';
        if (navReports) navReports.style.display = 'none';
        if (navInventory) navInventory.style.display = 'none';
        if (navKhata) navKhata.style.display = 'none';
        if (cartDiscountWrap) cartDiscountWrap.style.display = 'none';
        
        // Floor Server: replace Checkout button with "Ready for Billing - Notify Cashier"
        const dBtn = document.getElementById('desktopCheckoutBtn');
        if (dBtn) {
            dBtn.innerHTML = '<span>Ready for Billing - Notify Cashier</span>';
            dBtn.onclick = () => {
                const curT = (typeof activeTable !== 'undefined') ? activeTable : 1;
                if (typeof showToast === 'function') showToast('Table ' + curT + ' marked ready for billing! Cashier notified.', 'info');
                if (typeof tablesInfo !== 'undefined' && tablesInfo[curT]) {
                    tablesInfo[curT].status = 'ready_for_billing';
                    if (typeof persistTables === 'function') persistTables();
                    if (typeof syncTableUI === 'function') syncTableUI();
                }
            };
        }
    } else {
        // Cashier Profile: Can create/edit active orders, checkout, view menu and reports.
        if (navPos) navPos.style.display = 'flex';
        if (navKds) navKds.style.display = 'none';
        if (navTables) navTables.style.display = 'none';
        if (navMenu) navMenu.style.display = 'flex';
        if (navInventory) navInventory.style.display = 'flex';
        if (navKhata) navKhata.style.display = 'flex';
        if (navMore) navMore.style.display = 'flex';
        if (checkoutBtn) checkoutBtn.style.display = '';
        if (cartDiscountWrap) cartDiscountWrap.style.display = '';

        const dBtn = document.getElementById('desktopCheckoutBtn');
        if (dBtn) {
            dBtn.innerHTML = '<span>CHECKOUT</span><span id="desktopCheckoutBtnSub" style="display: inline-flex; align-items: center;"><svg width="14" height="14" viewBox="0 0 24 24"><use href="#icon-arrow-right"></use></svg></span>';
            dBtn.onclick = () => { if (typeof openCheckoutModal === 'function') openCheckoutModal(); };
        }
        if (typeof enforcePermissions === 'function') enforcePermissions();
    }
}
window.applyStationProfileRestrictions = applyStationProfileRestrictions;

// ============================================================================
// 5. REAL-TIME BACKGROUND REFRESH & 30-SECOND HEALTH CHECK (Interval + Visibility)
// ============================================================================

let _bgSyncTimer = null;
let _isBgSyncRunning = false;

async function runBackgroundHealthCheck(silent = true) {
    if (_isBgSyncRunning) return;
    _isBgSyncRunning = true;
    try {
        const storeCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (window.shopProfile && window.shopProfile.id);
        if (!storeCode) return;

        // Flush any offline queued changes first before pulling remote changes
        if (typeof flushOfflineSyncQueue === 'function') {
            try { await flushOfflineSyncQueue(); } catch(e) {}
        }

        let data = null;
        if (window.firestoreDB && window.firestoreDoc && window.firestoreGetDoc) {
            try {
                const collectionName = (typeof getStoreCollectionName === 'function') ? getStoreCollectionName(storeCode) : 'shops';
                const docRef = window.firestoreDoc(window.firestoreDB, collectionName, storeCode);
                const snap = await window.firestoreGetDoc(docRef);
                if (snap && snap.exists()) {
                    data = snap.data();
                }
            } catch (sdkErr) {
                // Client SDK unauthenticated / permission error -> fall through to REST
            }
        }

        if (!data) {
            try {
                const res = await fetch('/api/sync/store-data?storeCode=' + encodeURIComponent(storeCode));
                if (res.ok) {
                    data = await res.json();
                }
            } catch (restErr) {}
        }

        if (data && typeof handleRemoteFirestoreUpdate === 'function') {
            handleRemoteFirestoreUpdate(data);
            if (!silent) console.info("[BackgroundSync] Store data silently reconciled from cloud.");
        }
    } catch (err) {
        if (!silent) console.warn("[BackgroundSync] Health check defer:", err.message);
    } finally {
        _isBgSyncRunning = false;
    }
}

function startBackgroundSync() {
    if (_bgSyncTimer) return;
    runBackgroundHealthCheck(true);
    _bgSyncTimer = setInterval(() => {
        runBackgroundHealthCheck(true);
    }, 30000);

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                runBackgroundHealthCheck(true);
            }
        });
    }
    console.info("[BackgroundSync] 30s background sync & health check initialized.");
}

function stopBackgroundSync() {
    if (_bgSyncTimer) {
        clearInterval(_bgSyncTimer);
        _bgSyncTimer = null;
    }
}

window.runBackgroundHealthCheck = runBackgroundHealthCheck;
window.startBackgroundSync = startBackgroundSync;
window.stopBackgroundSync = stopBackgroundSync;

function clearAllTenantLocalData() {
    try {
        localStorage.removeItem('billnaw_auth_token');
        localStorage.removeItem('billnaw_active_staff');
        localStorage.removeItem('billnaw_last_staff_id');
        localStorage.removeItem('billnaw_current_session_id');
        localStorage.removeItem('billnaw_active_cart');
        localStorage.removeItem('billnaw_offline_orders');
        localStorage.removeItem('billnaw_authorized_devices');
        localStorage.removeItem('billnaw_active_sessions');
        localStorage.removeItem('billnaw_shop_session');
        localStorage.removeItem('billnaw_auth_email');
        localStorage.removeItem('billnaw_auth_phone');
        localStorage.removeItem('billnaw_store_code');
        localStorage.removeItem('billnaw_active_user');
        localStorage.removeItem('billnaw_terminal_locked');
        localStorage.removeItem('cafe_khata');
        localStorage.removeItem('billnaw_culinary_materials');
        localStorage.removeItem('billnaw_culinary_batches');
        localStorage.removeItem('billnaw_station_profile');
        localStorage.removeItem('billnaw_station_name');
        localStorage.removeItem('billnaw_admin_pin_hash');
        localStorage.removeItem('billnaw_store_staff');
        if (typeof shopProfile !== 'undefined') {
            shopProfile = { name: 'billnaw', address: '', phone: '', fssai: '', gstin: '', upiId: '', showQr: false, gstMode: 'inclusive', defaultGstRate: 5, tableCount: 10, startInvoiceNo: 1001 };
            if (typeof window !== 'undefined') window.shopProfile = shopProfile;
        }
        if (typeof window !== 'undefined' && typeof window.stopSessionHeartbeat === 'function') {
            try { window.stopSessionHeartbeat(); } catch (e) {}
        }
        if (typeof currentCart !== 'undefined') currentCart = [];
        if (typeof tablesInfo !== 'undefined') tablesInfo = {};
        if (typeof window.cart !== 'undefined') window.cart = [];
        if (typeof window.clearCart === 'function') window.clearCart();
        if (typeof sessionStorage !== 'undefined') sessionStorage.clear();
        if (typeof idb !== 'undefined' && idb.clear) {
            const stores = ['cafe_menu', 'cafe_history', 'cafe_tables', 'cafe_customers', 'cafe_expenses', 'cafe_staff', 'cafe_profile', 'cafe_khata', 'cafe_raw_materials', 'cafe_sub_recipes'];
            stores.forEach(s => { try { idb.clear(s); } catch (e) {} });
        }
    } catch (e) {}
}
window.clearAllTenantLocalData = clearAllTenantLocalData;

function playKdsAudioChime() {
    if (localStorage.getItem('billnaw_kds_chime_disabled') === 'true') return;
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
}
window.playKdsAudioChime = playKdsAudioChime;

function toggleKdsSound() {
    const disabled = localStorage.getItem('billnaw_kds_chime_disabled') === 'true';
    localStorage.setItem('billnaw_kds_chime_disabled', (!disabled) ? 'true' : 'false');
    const label = document.getElementById('kdsSoundLabel');
    if (label) label.innerText = !disabled ? 'Chime: OFF' : 'Chime: ON';
    if (disabled) playKdsAudioChime();
}
window.toggleKdsSound = toggleKdsSound;

async function checkDeviceAuthorizationStatus() {
    const isMaster = isMasterTerminal();
    if (isMaster) {
        const revOverlay = document.getElementById('deviceRevokedOverlay');
        if (revOverlay) revOverlay.style.display = 'none';
        const pairOverlay = document.getElementById('devicePairingOverlay');
        if (pairOverlay) pairOverlay.style.display = 'none';
        return;
    }

    const myDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
    const devices = window.authorizedDevices || [];
    const myRecord = devices.find(d => d.deviceId === myDevId || d.id === myDevId);

    if (!myRecord) {
        const localStatus = localStorage.getItem('billnaw_device_status');
        if (localStatus === 'REVOKED') {
            handleDeviceRevocation({ deviceId: myDevId });
        }
        return;
    }

    window.currentDeviceRecord = myRecord;

    if (myRecord.status === 'REVOKED') {
        await handleDeviceRevocation(myRecord);
        return;
    }

    if (myRecord.status === 'AUTHORIZED') {
        const wasPending = localStorage.getItem('billnaw_device_status') === 'PENDING';
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        if (!localStorage.getItem('billnaw_device_auth_timestamp') || wasPending) {
            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
        }
        if (myRecord.stationProfile) localStorage.setItem('billnaw_station_profile', myRecord.stationProfile);
        if (myRecord.deviceName) localStorage.setItem('billnaw_station_name', myRecord.deviceName);

        const revOverlay = document.getElementById('deviceRevokedOverlay');
        if (revOverlay) revOverlay.style.display = 'none';
        const pairOverlay = document.getElementById('devicePairingOverlay');
        if (pairOverlay) pairOverlay.style.display = 'none';

        if (wasPending) {
            if (typeof showToast === 'function') showToast(`Terminal Authorized: ${myRecord.deviceName || 'Ready'}`);
            if (typeof applyStationProfileRestrictions === 'function') {
                applyStationProfileRestrictions();
            }
            const targetView = (typeof resolveInitialViewForStation === 'function')
                ? resolveInitialViewForStation(myRecord.stationProfile)
                : 'pos';
            if (typeof switchView === 'function') {
                switchView(targetView);
            } else if (typeof switchTabDirect === 'function') {
                switchTabDirect(targetView);
            } else if (typeof switchTab === 'function') {
                switchTab(targetView);
            }
            if (typeof attachFirestoreListener === 'function') {
                attachFirestoreListener();
            }
        }
        return;
    }

    if (myRecord.status === 'PENDING') {
        // Option 1: Auto-Authorize on Store Login + Passive Audit
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
        hideDevicePairingOverlay();
        const myDevName = myRecord.deviceName || (typeof detectDefaultDeviceName === 'function' ? detectDefaultDeviceName(myDevId) : `Counter Terminal ${myDevId.slice(-4)}`);
        if (typeof registerDeviceToCloud === 'function') {
            registerDeviceToCloud(myDevId, myDevName, false);
        }
    }
}
window.checkDeviceAuthorizationStatus = checkDeviceAuthorizationStatus;

async function handleDeviceRevocation(deviceRecord) {
    if (localStorage.getItem('billnaw_is_master') === 'true') return;

    localStorage.setItem('billnaw_device_status', 'REVOKED');

    if (typeof clearAllTenantLocalData === 'function') {
        await clearAllTenantLocalData();
    }

    if (typeof clearCart === 'function') clearCart();
    window.cart = [];
    window.currentStaff = null;
    localStorage.removeItem('billnaw_active_staff');

    if (typeof window.unsubscribeFirestoreListeners === 'function') {
        window.unsubscribeFirestoreListeners();
    } else if (typeof firestoreUnsubscribe === 'function') {
        try { firestoreUnsubscribe(); } catch (e) {}
        firestoreUnsubscribe = null;
    }

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        if (modal.id !== 'deviceRevokedOverlay') {
            modal.style.display = 'none';
        }
    });

    const revOverlay = document.getElementById('deviceRevokedOverlay');
    if (revOverlay) {
        revOverlay.style.display = 'flex';
        const idDisplay = document.getElementById('revokedDeviceIdDisplay');
        if (idDisplay) idDisplay.innerText = (deviceRecord && deviceRecord.deviceId) ? deviceRecord.deviceId : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id') || 'DEV_UNKNOWN');
    }
}
window.handleDeviceRevocation = handleDeviceRevocation;

function handleRequestNewPairing() {
    localStorage.removeItem('billnaw_device_status');
    localStorage.removeItem('billnaw_pairing_code');
    const revOverlay = document.getElementById('deviceRevokedOverlay');
    if (revOverlay) revOverlay.style.display = 'none';
    initDevicePairingFlow();
}
window.handleRequestNewPairing = handleRequestNewPairing;

function initDevicePairingFlow() {
    if (typeof isStoreAuthenticated === 'function' && !isStoreAuthenticated()) {
        hideDevicePairingOverlay();
        if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
        return;
    }
    if (isMasterTerminal()) {
        hideDevicePairingOverlay();
        return;
    }
    const isExpired = checkDeviceAuthExpiration();
    if (isExpired) return;

    const status = getDeviceStatus();
    if (status === 'AUTHORIZED') {
        hideDevicePairingOverlay();
        return;
    }
    if (status === 'REVOKED') {
        showDeviceRevokedOverlay();
        return;
    }

    // Verify if another device is active for this store:
    const devices = window.authorizedDevices || [];
    const myDevId = (typeof getOrCreateDeviceId === 'function') ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
    const hasOtherActiveMaster = Array.isArray(devices) && devices.some(d => (d.deviceId !== myDevId && d.id !== myDevId) && (d.isMaster === true || d.status === 'AUTHORIZED'));

    // If no other device is active for this store yet, promote this authenticated device to Master
    if (!hasOtherActiveMaster && (!devices || devices.length === 0)) {
        if (typeof setMasterTerminal === 'function') setMasterTerminal(true);
        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
        if (typeof registerMasterDeviceToCloud === 'function') registerMasterDeviceToCloud(myDevId);
        hideDevicePairingOverlay();
        return;
    }

    // Option 1: Auto-Authorize on Store Login + Passive Audit
    // Secondary device logged in with store credentials -> auto-authorize and register passively
    localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
    localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
    hideDevicePairingOverlay();
    if (typeof registerDeviceToCloud === 'function') {
        const myDevName = (typeof detectDefaultDeviceName === 'function') ? detectDefaultDeviceName(myDevId) : `Counter Terminal ${myDevId.slice(-4)}`;
        registerDeviceToCloud(myDevId, myDevName, false);
    }
}
window.initDevicePairingFlow = initDevicePairingFlow;

function showDevicePairingOverlay() {
    if (typeof isStoreAuthenticated === 'function' && !isStoreAuthenticated()) {
        hideDevicePairingOverlay();
        if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
        return;
    }
    // Option 1: Suppress pairing overlay for store-authenticated devices
    if (typeof isStoreAuthenticated === 'function' && isStoreAuthenticated()) {
        hideDevicePairingOverlay();
        return;
    }
    if ((typeof getDeviceStatus === 'function' && getDeviceStatus() === 'AUTHORIZED') || localStorage.getItem('billnaw_device_status') === 'AUTHORIZED') {
        if (typeof checkDeviceAuthExpiration !== 'function' || !checkDeviceAuthExpiration()) {
            hideDevicePairingOverlay();
            return;
        }
    }
    const overlay = document.getElementById('devicePairingOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    
    const devId = getOrCreateDeviceId();
    let code = localStorage.getItem('billnaw_pairing_code');
    if (!code || !/^\d{6}$/.test(code)) {
        code = generatePairingCode();
        localStorage.setItem('billnaw_pairing_code', code);
    }
    
    const idEl = document.getElementById('pairingDeviceIdDisplay');
    if (idEl) idEl.innerText = devId;
    
    const codeEl = document.getElementById('pairingCodeDisplay');
    if (codeEl) codeEl.innerText = `${code.slice(0, 3)} ${code.slice(3)}`;
    
    const qrContainer = document.getElementById('pairingQrContainer');
    if (qrContainer && window.QRCode) {
        qrContainer.innerHTML = '';
        try {
            new QRCode(qrContainer, {
                text: JSON.stringify({ deviceId: devId, pairingCode: code }),
                width: 160,
                height: 160,
                colorDark: "#143832",
                colorLight: "#FAF7F4",
                correctLevel: QRCode.CorrectLevel.M
            });
        } catch(e) {}
    }
    
    registerPendingDeviceToCloud(devId, code);
}
window.showDevicePairingOverlay = showDevicePairingOverlay;

function hideDevicePairingOverlay() {
    const overlay = document.getElementById('devicePairingOverlay');
    if (overlay) overlay.style.display = 'none';
}
window.hideDevicePairingOverlay = hideDevicePairingOverlay;

function showDeviceRevokedOverlay() {
    const rev = document.getElementById('deviceRevokedOverlay');
    if (rev) rev.style.display = 'flex';
    const pair = document.getElementById('devicePairingOverlay');
    if (pair) pair.style.display = 'none';
    const idDisplay = document.getElementById('revokedDeviceIdDisplay');
    if (idDisplay) idDisplay.innerText = getOrCreateDeviceId();
}
window.showDeviceRevokedOverlay = showDeviceRevokedOverlay;

async function registerPendingDeviceToCloud(deviceId, pairingCode) {
    try {
        if (typeof window.firestoreDB === 'undefined' || typeof window.firestoreDoc === 'undefined') {
            if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
                const onLoaded = async () => {
                    window.removeEventListener('firebaseLoaded', onLoaded);
                    await registerPendingDeviceToCloud(deviceId, pairingCode);
                };
                window.addEventListener('firebaseLoaded', onLoaded);
            }
            return;
        }
        const devDocRef = getStoreSubdocRef('devices', deviceId);
        if (devDocRef && window.firestoreSetDoc) {
            await window.firestoreSetDoc(devDocRef, {
                deviceId,
                pairingCode,
                deviceName: 'Secondary Terminal',
                stationProfile: 'GENERAL_STATION',
                status: 'PENDING',
                isMaster: false,
                registeredAt: new Date().toISOString(),
                lastSeenAt: new Date().toISOString()
            }, { merge: true });
        }
    } catch (e) {
        console.warn('[DevicePairing] Pending device cloud registration notice:', e.message);
    }
}
window.registerPendingDeviceToCloud = registerPendingDeviceToCloud;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'flex';
});

window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'none';
    showToast("🎉 App installed successfully!");
});

async function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            showToast("📲 Installing billnaw POS...");
        } else {
            showToast("Installation postponed");
        }
        deferredPrompt = null;
        return;
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) {
        showToast("ℹ️ App is already running in installed mode.");
        return;
    }

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        showToast("💡 On iOS: Tap Share ⎙ then 'Add to Home Screen'");
    } else {
        showToast("💡 Click the Install icon in your browser's address bar or menu");
    }
}
window.installApp = installApp;

function saveToLocal() {
    idb.set('cafe_profile', shopProfile); 
    idb.set('cafe_menu', menuItems); 
    idb.set('cafe_categories', menuCategories);
    idb.set('cafe_history', orderHistory); 
    idb.set('cafe_expenses', dailyExpenses); 
    idb.set('cafe_tables', tablesInfo);
    idb.set('cafe_customers', customersList); 
    idb.set('cafe_staff', staffList);
}
window.saveToLocal = saveToLocal;

function updateAllUI() {
    const safe = (fn) => { try { if (typeof fn === 'function') fn(); } catch(e) { console.warn('Render error:', e); } };
    if (typeof updateProfileVisuals === 'function') safe(updateProfileVisuals);
    if (typeof renderCategoryDropdown === 'function') safe(renderCategoryDropdown);
    if (typeof renderCategoryFilters === 'function') safe(renderCategoryFilters);
    if (typeof renderCategoryListUI === 'function') safe(renderCategoryListUI);
    if (typeof renderMenuCatalogUI === 'function') safe(renderMenuCatalogUI);
    if (typeof renderMenuUI === 'function') safe(renderMenuUI);
    if (typeof syncTableUI === 'function') safe(syncTableUI);
    if (typeof updateCartUI === 'function') safe(updateCartUI);
    if (typeof renderExpensesUI === 'function') safe(renderExpensesUI);
    if (typeof renderCustomersUI === 'function') safe(renderCustomersUI);
    if (typeof populateCheckoutCustomerDropdown === 'function') safe(populateCheckoutCustomerDropdown);
    if (typeof renderStaffManagementUI === 'function') safe(renderStaffManagementUI);
    if (typeof renderLoginStaffPicker === 'function') safe(renderLoginStaffPicker);
    if (typeof generateSettingsQRPreview === 'function') safe(generateSettingsQRPreview);
    if (typeof refreshAiQuotaDisplay === 'function') safe(refreshAiQuotaDisplay);
    try {
        if (typeof renderDashboardAnalytics === 'function') {
            const dashboardTab = document.getElementById('dashboard');
            if (dashboardTab && dashboardTab.classList.contains('active')) {
                renderDashboardAnalytics();
            }
        }
    } catch(e) {
        console.warn('Dashboard render error:', e);
    }
    try {
        const kdsTab = document.getElementById('kds');
        if (kdsTab && kdsTab.classList.contains('active') && typeof renderKdsUI === 'function') {
            renderKdsUI();
        }
    } catch(kdsErr) {
        console.warn('KDS auto-render notice:', kdsErr);
    }
}
window.updateAllUI = updateAllUI;

async function initDatabase() {
    await idb.init();

    // 0. Supreme Authority: Authenticated Cloud Shop Session
    try {
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const sessionRaw = localStorage.getItem('billnaw_shop_session');
        if (sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session && session.shop) {
                if (session.shop.name && session.shop.name !== 'billnaw' && session.shop.name !== 'My Cafe') {
                    shopProfile.name = session.shop.name;
                }
                if (session.shop.profile && typeof session.shop.profile === 'object') {
                    const sp = session.shop.profile;
                    if (sp.name && sp.name !== 'billnaw' && sp.name !== 'My Cafe') shopProfile.name = sp.name;
                    if (sp.logo && !shopProfile.logo) shopProfile.logo = sp.logo;
                    if (sp.address && !shopProfile.address) shopProfile.address = sp.address;
                    if (sp.phone && !shopProfile.phone) shopProfile.phone = sp.phone;
                }
                if (session.shop.logo && !shopProfile.logo) {
                    shopProfile.logo = session.shop.logo;
                }
                if (session.shop.address && !shopProfile.address) {
                    shopProfile.address = session.shop.address;
                }
                if (session.shop.phone && !shopProfile.phone) {
                    shopProfile.phone = session.shop.phone;
                }
            }
            if (session && session.storeCode) {
                shopProfile.storeCode = session.storeCode;
                myClientID = session.storeCode;
                window.myClientID = myClientID;
                try { localStorage.setItem('billnaw_store_code', session.storeCode); } catch(e) {}
            }
        }
    } catch(e) {}

    // 1. Recover from LocalStorage Redundant Snapshot (survives IDB reset/cache clear)
    try {
        const rawLocalProfile = localStorage.getItem('billnaw_store_profile');
        if (rawLocalProfile) {
            const parsed = JSON.parse(rawLocalProfile);
            if (parsed && typeof parsed === 'object') {
                if (parsed.name && parsed.name !== 'billnaw' && parsed.name !== 'My Cafe') {
                    shopProfile.name = parsed.name;
                }
                shopProfile = { ...shopProfile, ...parsed };
            }
        }
    } catch(e) {}

    // 2. Recover from Discrete Backup Keys (survives partial storage eviction)
    try {
        const savedName = localStorage.getItem('billnaw_shop_name');
        if (savedName && savedName !== 'billnaw' && savedName !== 'My Cafe') shopProfile.name = savedName;
        const savedPhone = localStorage.getItem('billnaw_shop_phone') || localStorage.getItem('billnaw_auth_phone');
        if (savedPhone) { shopProfile.phone = savedPhone; shopProfile.ownerPhone = savedPhone; }
        const savedAddr = localStorage.getItem('billnaw_shop_address');
        if (savedAddr) shopProfile.address = savedAddr;
        const savedFssai = localStorage.getItem('billnaw_shop_fssai');
        if (savedFssai) shopProfile.fssai = savedFssai;
        const savedGstin = localStorage.getItem('billnaw_shop_gstin');
        if (savedGstin) shopProfile.gstin = savedGstin;
        const savedUpi = localStorage.getItem('billnaw_shop_upi_id');
        if (savedUpi) shopProfile.upiId = savedUpi;
        const savedQr = localStorage.getItem('billnaw_shop_show_qr');
        if (savedQr !== null) shopProfile.showQr = (savedQr === 'true');
        const savedLogo = localStorage.getItem('billnaw_shop_logo');
        if (savedLogo && !shopProfile.logo) shopProfile.logo = savedLogo;
        const savedGstMode = localStorage.getItem('billnaw_gst_mode');
        if (savedGstMode) shopProfile.gstMode = savedGstMode;
        const savedGstRate = localStorage.getItem('billnaw_default_gst_rate');
        if (savedGstRate) shopProfile.defaultGstRate = parseFloat(savedGstRate) || 5;
        const savedAdminPinHash = localStorage.getItem('billnaw_admin_pin_hash');
        if (savedAdminPinHash && !shopProfile.adminPinHash) shopProfile.adminPinHash = savedAdminPinHash;
    } catch(e) {}

    // 3. Load from IndexedDB
    const storedProfile = await idb.get('cafe_profile');
    if (storedProfile && typeof storedProfile === 'object') {
        const pName = storedProfile.name;
        const isLegacyOrPlaceholder = !pName || pName === 'The Bong Bhoj Terminal' || pName === 'The Bong Bhoj' || pName === 'Billnaw Cafe' || pName === 'My Cafe' || pName === 'billnaw';
        if (isLegacyOrPlaceholder) {
            delete storedProfile.name;
        }
        shopProfile = { ...shopProfile, ...storedProfile };
    }
    if (!shopProfile.logo) {
        try {
            const idbLogo = await idb.get('cafe_logo');
            if (idbLogo) shopProfile.logo = idbLogo;
        } catch(e) {}
    }
    if (!shopProfile.startInvoiceNo) shopProfile.startInvoiceNo = 1001;
    if (shopProfile.adminPinHash) {
        try { localStorage.setItem('billnaw_admin_pin_hash', shopProfile.adminPinHash); } catch(e) {}
    } else {
        const savedAdminPinHash = localStorage.getItem('billnaw_admin_pin_hash');
        if (savedAdminPinHash) shopProfile.adminPinHash = savedAdminPinHash;
    }
    window.shopProfile = shopProfile;

    // Self-heal storage layers
    try {
        idb.set('cafe_profile', shopProfile);
        localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
        if (shopProfile.logo) {
            idb.set('cafe_logo', shopProfile.logo);
            if (shopProfile.logo.length < 2000000) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
        }
        if (shopProfile.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') {
            localStorage.setItem('billnaw_shop_name', shopProfile.name);
        }
    } catch(e) {}

    // Multi-Account Device Isolation: Clear device cache ONLY when an authentic different account logs in
    try {
        let currentEmail = (localStorage.getItem('billnaw_auth_email') || '').toLowerCase().trim();
        let lastDeviceEmail = (localStorage.getItem('billnaw_last_device_email') || '').toLowerCase().trim();
        let currentStoreCode = (localStorage.getItem('billnaw_store_code') || (shopProfile && shopProfile.storeCode) || '').toUpperCase().trim();
        let lastStoreCode = (localStorage.getItem('billnaw_last_store_code') || '').toUpperCase().trim();
        
        const isPlaceholder = (c) => !c || c === 'BILLNAW' || c === 'DEFAULT_SHOP' || c === 'CAFE';
        const isGenuineEmailSwitch = Boolean(lastDeviceEmail && currentEmail && lastDeviceEmail !== currentEmail);
        const isGenuineStoreSwitch = Boolean(!isPlaceholder(lastStoreCode) && !isPlaceholder(currentStoreCode) && lastStoreCode !== currentStoreCode);

        if (isGenuineEmailSwitch || isGenuineStoreSwitch) {
            console.log(`[AUTH ISOLATION] Account switch detected (${lastDeviceEmail}/${lastStoreCode} -> ${currentEmail}/${currentStoreCode}). Wiping previous tenant cache.`);
            if (typeof idb !== 'undefined' && idb.clear) {
                await idb.clear('cafe_menu');
                await idb.clear('cafe_history');
                await idb.clear('cafe_tables');
                await idb.clear('cafe_customers');
                await idb.clear('cafe_expenses');
                await idb.clear('cafe_staff');
                await idb.clear('cafe_categories');
                await idb.clear('cafe_profile');
                await idb.clear('cafe_logo');
            }
            localStorage.removeItem('billnaw_shop_name');
            localStorage.removeItem('billnaw_store_profile');
            localStorage.removeItem('billnaw_shop_phone');
            localStorage.removeItem('billnaw_shop_address');
            localStorage.removeItem('billnaw_shop_logo');
            localStorage.removeItem('billnaw_admin_pin_hash');
            localStorage.removeItem('billnaw_store_staff');
            shopProfile = { name: '', storeCode: currentStoreCode };
        }
        if (currentEmail) {
            localStorage.setItem('billnaw_last_device_email', currentEmail);
        }
        if (currentStoreCode && !isPlaceholder(currentStoreCode)) {
            localStorage.setItem('billnaw_last_store_code', currentStoreCode);
        }
    } catch(err) {
        console.warn('Device isolation error:', err);
    }

    // 4. Proactive Cloud Rehydration: Reconcile latest store identity from Firestore
    try {
        if (window.firestoreDB && window.firestoreDoc && window.firestoreGetDoc && typeof getStoreDocRef === 'function') {
            const storeDocRef = getStoreDocRef();
            if (storeDocRef) {
                window.firestoreGetDoc(storeDocRef).then(snap => {
                    if (snap && snap.exists && snap.exists()) {
                        const rData = snap.data();
                        if (rData && rData.profile) {
                            const existingPinHash = shopProfile?.adminPinHash || localStorage.getItem('billnaw_admin_pin_hash');
                            const existingLogo = shopProfile?.logo || localStorage.getItem('billnaw_shop_logo');
                            const existingName = (shopProfile?.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') 
                                ? shopProfile.name 
                                : (localStorage.getItem('billnaw_shop_name') && localStorage.getItem('billnaw_shop_name') !== 'billnaw' && localStorage.getItem('billnaw_shop_name') !== 'My Cafe' ? localStorage.getItem('billnaw_shop_name') : null);
                            const existingTableCount = shopProfile?.tableCount || 0;
                            const existingTablesLen = (typeof tablesInfo === 'object' && tablesInfo) ? Object.keys(tablesInfo).length : 0;
                            const maxTables = Math.max(existingTableCount, existingTablesLen, rData.profile.tableCount || 0);

                            shopProfile = { ...shopProfile, ...rData.profile };
                            if (maxTables > (shopProfile.tableCount || 0)) {
                                shopProfile.tableCount = maxTables;
                            }
                            if (!shopProfile.logo && existingLogo) shopProfile.logo = existingLogo;
                            if (existingName && (!rData.profile.name || rData.profile.name === 'My Cafe' || rData.profile.name === 'billnaw')) {
                                shopProfile.name = existingName;
                            }
                            if (!shopProfile.adminPinHash && existingPinHash) shopProfile.adminPinHash = existingPinHash;

                            window.shopProfile = shopProfile;
                            idb.set('cafe_profile', shopProfile);
                            if (shopProfile.logo) {
                                idb.set('cafe_logo', shopProfile.logo);
                            }
                            try { localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile)); } catch(e) {}
                            try { if (shopProfile.name) localStorage.setItem('billnaw_shop_name', shopProfile.name); } catch(e) {}
                            try { if (shopProfile.phone) localStorage.setItem('billnaw_shop_phone', shopProfile.phone); } catch(e) {}
                            try { if (shopProfile.address) localStorage.setItem('billnaw_shop_address', shopProfile.address); } catch(e) {}
                            try { if (shopProfile.fssai) localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai); } catch(e) {}
                            try { if (shopProfile.gstin) localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin); } catch(e) {}
                            try { if (shopProfile.upiId) localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId); } catch(e) {}
                            try { localStorage.setItem('billnaw_shop_show_qr', shopProfile.showQr ? 'true' : 'false'); } catch(e) {}
                            try { if (shopProfile.gstMode) localStorage.setItem('billnaw_gst_mode', shopProfile.gstMode); } catch(e) {}
                            try { if (shopProfile.defaultGstRate !== undefined) localStorage.setItem('billnaw_default_gst_rate', String(shopProfile.defaultGstRate)); } catch(e) {}
                            try { if (shopProfile.logo && shopProfile.logo.length < 2000000) localStorage.setItem('billnaw_shop_logo', shopProfile.logo); } catch(e) {}
                            if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
                        }
                    }
                }).catch(() => {});
            }
        }
    } catch(e) {}

    const storedMenu = await idb.get('cafe_menu');
    const isAuth = (typeof isStoreAuthenticated === 'function') 
        ? isStoreAuthenticated() 
        : Boolean(localStorage.getItem('billnaw_auth_token') || localStorage.getItem('billnaw_shop_session') || localStorage.getItem('billnaw_auth_mode') === 'authenticated');

    if (storedMenu && Array.isArray(storedMenu) && storedMenu.length > 0) {
        menuItems = storedMenu;
        window.menuItems = menuItems;
    } else if (isAuth) {
        // Authenticated shop: check if menu was saved in shop session before defaulting
        let sessionMenu = null;
        try {
            const raw = localStorage.getItem('billnaw_shop_session');
            if (raw) {
                const s = JSON.parse(raw);
                if (Array.isArray(s?.shop?.menu) && s.shop.menu.length > 0) sessionMenu = s.shop.menu;
            }
        } catch(e) {}
        if (sessionMenu) {
            menuItems = sessionMenu;
            window.menuItems = menuItems;
            await idb.set('cafe_menu', menuItems);
        } else {
            // Keep existing menu if non-empty, else empty array while cloud sync hydrates. NEVER inject default template!
            if (!Array.isArray(menuItems) || isDefaultTemplateMenu(menuItems)) {
                menuItems = [];
                window.menuItems = menuItems;
            }
        }
    } else {
        menuItems = defaultMenu;
        window.menuItems = menuItems;
        await idb.set('cafe_menu', menuItems);
    }

    const storedCats = await idb.get('cafe_categories');
    if (storedCats && Array.isArray(storedCats) && storedCats.length > 0) {
        menuCategories = storedCats;
        window.menuCategories = menuCategories;
    } else if (isAuth) {
        let sessionCats = null;
        try {
            const raw = localStorage.getItem('billnaw_shop_session');
            if (raw) {
                const s = JSON.parse(raw);
                if (Array.isArray(s?.shop?.categories) && s.shop.categories.length > 0) sessionCats = s.shop.categories;
            }
        } catch(e) {}
        if (sessionCats) {
            menuCategories = sessionCats;
            window.menuCategories = menuCategories;
            await idb.set('cafe_categories', menuCategories);
        } else if (!Array.isArray(menuCategories) || menuCategories.length === 0) {
            menuCategories = ["All"];
            window.menuCategories = menuCategories;
        }
    } else {
        menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
        window.menuCategories = menuCategories;
        await idb.set('cafe_categories', menuCategories);
    }
    const storedHistory = await idb.get('cafe_history');
    if (storedHistory && Array.isArray(storedHistory)) {
        orderHistory = storedHistory;
        window.orderHistory = orderHistory;
    }
    const storedExpenses = await idb.get('cafe_expenses');
    if (storedExpenses && Array.isArray(storedExpenses)) {
        dailyExpenses = storedExpenses;
        window.dailyExpenses = dailyExpenses;
    } else {
        dailyExpenses = [];
        window.dailyExpenses = dailyExpenses;
        await idb.set('cafe_expenses', dailyExpenses);
    }
    await pruneClientTransactionalCache(10);
    const storedTables = await idb.get('cafe_tables');
    if (storedTables && typeof storedTables === 'object') {
        tablesInfo = storedTables;
        window.tablesInfo = tablesInfo;
    }
    for (let i = 1; i <= (shopProfile.tableCount || 10); i++) {
        if (!tablesInfo[i]) {
            tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
        }
    }
    const storedCustomers = await idb.get('cafe_customers');
    if (storedCustomers && Array.isArray(storedCustomers)) {
        customersList = storedCustomers;
        window.customersList = customersList;
    }
    const storedStaff = await idb.get('cafe_staff');
    if (storedStaff && Array.isArray(storedStaff) && storedStaff.length > 0) {
        staffList = storedStaff;
        window.staffList = staffList;
        try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
    } else {
        let recoveredStaff = null;
        try {
            const raw = localStorage.getItem('billnaw_store_staff');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    recoveredStaff = parsed;
                }
            }
        } catch(e) {}

        if (recoveredStaff) {
            staffList = recoveredStaff;
            window.staffList = staffList;
            await idb.set('cafe_staff', staffList);
        } else {
            staffList = [
                { 
                    id: 1, 
                    name: "Admin", 
                    role: "Admin", 
                    phone: "9876543210", 
                    pin_salt: "0123456789abcdef0123456789abcdef",
                    pin_hash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
                    pinSalt: "0123456789abcdef0123456789abcdef",
                    pinHash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
                    mustChangePin: false,
                    status: "Active", 
                    joinedDate: getLocalISODate() 
                }
            ];
            window.staffList = staffList;
            await idb.set('cafe_staff', staffList);
            try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
        }
    }

    // Auto-reconcile with Cloud Firestore: if local device has staff, tables, or profile,
    // sync to Cloud Firestore via backend REST bridge so cloud stays 100% up-to-date.
    if (typeof dispatchBackendStoreSync === 'function') {
        const currentStoreCode = (typeof getActiveStoreIdentifier === 'function') ? getActiveStoreIdentifier() : (shopProfile?.storeCode || null);
        if (currentStoreCode) {
            dispatchBackendStoreSync({
                profile: shopProfile,
                staff: staffList,
                tables: tablesInfo,
                storeCode: currentStoreCode
            }, true);
        }
    }

    if (typeof startBackgroundSync === 'function') {
        startBackgroundSync();
    }
}
window.initDatabase = initDatabase;

async function migrateLegacyStaffPinStorage() {
    if (!Array.isArray(staffList) || staffList.length === 0) return;
    let mutated = false;
    for (const staff of staffList) {
        if (staff.pin) {
            const cleanPin = String(staff.pin).trim();
            const salt = staff.pin_salt || staff.pinSalt || (typeof generatePinSalt === 'function' ? generatePinSalt() : '0123456789abcdef0123456789abcdef');
            const hash = (typeof hashPin === 'function') ? await hashPin(cleanPin, salt) : '';
            staff.pin_salt = salt;
            staff.pin_hash = hash;
            staff.pinSalt = salt;
            staff.pinHash = hash;
            delete staff.pin;
            if (staff.mustChangePin === undefined) {
                staff.mustChangePin = false;
            }
            mutated = true;
        }
    }
    if (mutated) {
        if (typeof saveToLocal === 'function') saveToLocal();
        if (typeof idb !== 'undefined' && idb.set) {
            idb.set('cafe_staff', staffList).catch(() => {});
        }
        if (typeof persistStaffToFirestore === 'function') {
            persistStaffToFirestore();
        }
    }
}
window.migrateLegacyStaffPinStorage = migrateLegacyStaffPinStorage;

function getStoreActiveDeviceCount() {
    try {
        if (Array.isArray(window.authorizedDevices) && window.authorizedDevices.length > 0) {
            return window.authorizedDevices.length;
        }
        const cached = JSON.parse(localStorage.getItem('billnaw_authorized_devices') || '[]');
        if (Array.isArray(cached) && cached.length > 0) return cached.length;
    } catch (e) {}
    return 1;
}
window.getStoreActiveDeviceCount = getStoreActiveDeviceCount;

function initStaffSystem() {
    if (!staffList || staffList.length === 0) {
        staffList = [
            { 
                id: 1, 
                name: "Admin", 
                role: "Admin", 
                phone: "9876543210", 
                pin_salt: "0123456789abcdef0123456789abcdef",
                pin_hash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
                pinSalt: "0123456789abcdef0123456789abcdef",
                pinHash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
                mustChangePin: false,
                status: "Active", 
                joinedDate: getLocalISODate() 
            }
        ];
        window.staffList = staffList;
    }

    // Ensure at least one Admin member exists so terminal is never locked out
    if (!staffList.some(s => s.role === 'Admin')) {
        staffList.unshift({
            id: 1,
            name: "Admin",
            role: "Admin",
            phone: "9876543210",
            pin_salt: "0123456789abcdef0123456789abcdef",
            pin_hash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
            pinSalt: "0123456789abcdef0123456789abcdef",
            pinHash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
            mustChangePin: false,
            status: "Active",
            joinedDate: getLocalISODate()
        });
        window.staffList = staffList;
    }

    migrateLegacyStaffPinStorage();

    // Restore active staff from localStorage if present
    try {
        const savedStaffRaw = localStorage.getItem('billnaw_active_staff');
        if (savedStaffRaw) {
            const savedStaff = JSON.parse(savedStaffRaw);
            const found = staffList.find(s => s.id === savedStaff.id);
            if (found && found.status !== 'Inactive') {
                currentStaff = found;
                selectedLoginStaffId = found.id;
            }
        }
    } catch(e) {}

    if (!currentStaff) {
        currentStaff = staffList[0];
        selectedLoginStaffId = staffList[0].id;
    }
    window.currentStaff = currentStaff;
    if (typeof updateStaffTopbarDisplay === 'function') updateStaffTopbarDisplay();
    if (typeof enforcePermissions === 'function') enforcePermissions();
    if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();

    // Check terminal lock persistence & 24-hour shift session persistence
    try {
        const isLocked = localStorage.getItem('billnaw_terminal_locked') === 'true';
        const isAuthorized = localStorage.getItem('billnaw_device_status') === 'AUTHORIZED';
        const isExpired = (typeof checkDeviceAuthExpiration === 'function') ? checkDeviceAuthExpiration() : false;

        const lastPinVerification = localStorage.getItem('billnaw_pin_verified_at');
        const is24hShiftValid = Boolean(lastPinVerification && (Date.now() - Number(lastPinVerification)) < (24 * 60 * 60 * 1000));

        if (!isExpired && isAuthorized && currentStaff) {
            if (isLocked || !is24hShiftValid) {
                // Multi-device or single-device: lock terminal ONLY if manually locked OR if 24 hours have elapsed
                if (typeof lockTerminal === 'function' && typeof document !== 'undefined' && document.getElementById('loginOverlay')) {
                    lockTerminal(false);
                }
            } else {
                // Within 24-hour shift window: remain smoothly unlocked without asking for PIN on reload
                if (typeof unlockTerminal === 'function') {
                    unlockTerminal(currentStaff, false);
                }
            }
        } else if (isLocked && typeof lockTerminal === 'function') {
            lockTerminal(false);
        }
    } catch(e) {}

    if (typeof start24hShiftMonitor === 'function') {
        start24hShiftMonitor();
    }
}
window.initStaffSystem = initStaffSystem;

function start24hShiftMonitor() {
    if (typeof window === 'undefined') return;
    const checkShift = () => {
        const lastPin = localStorage.getItem('billnaw_pin_verified_at');
        if (lastPin && (Date.now() - Number(lastPin)) >= (24 * 60 * 60 * 1000)) {
            const isLocked = localStorage.getItem('billnaw_terminal_locked') === 'true';
            if (!isLocked && typeof lockTerminal === 'function') {
                console.info('[ShiftMonitor] 24-hour shift session expired. Prompting PIN lock.');
                lockTerminal(true);
            }
        }
    };
    setInterval(checkShift, 60000);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkShift();
        });
    }
}
window.start24hShiftMonitor = start24hShiftMonitor;

function initFirestoreSync() {
    if (typeof isStoreAuthenticated === 'function' && isStoreAuthenticated()) {
        if (typeof initDevicePairingFlow === 'function') {
            initDevicePairingFlow();
        }
    }
    attachFirestoreListener();
}
window.initFirestoreSync = initFirestoreSync;

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('DOMContentLoaded', () => {
        try {
            const cachedDevicesStr = localStorage.getItem('billnaw_authorized_devices');
            if (cachedDevicesStr) {
                const cachedDevices = JSON.parse(cachedDevicesStr);
                if (Array.isArray(cachedDevices)) {
                    window.authorizedDevices = cachedDevices;
                    const myDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : (localStorage.getItem('billnaw_device_id') || localStorage.getItem('bongbhoj_device_id'));
                    const myRecord = cachedDevices.find(d => d.deviceId === myDevId || d.id === myDevId);
                    if (myRecord) {
                        window.currentDeviceRecord = myRecord;
                    }
                }
            }
        } catch (e) {}

        const isAuthStore = typeof isStoreAuthenticated === 'function' ? isStoreAuthenticated() : Boolean(localStorage.getItem('billnaw_auth_token') || localStorage.getItem('billnaw_auth_mode') === 'demo');

        if (!isAuthStore) {
            // Fresh device / unauthenticated: strictly suppress pairing QR and ensure shop login/signup is visible
            if (typeof hideDevicePairingOverlay === 'function') {
                hideDevicePairingOverlay();
            }
            if (typeof openShopAuthModal === 'function') {
                openShopAuthModal(true);
            }
        } else {
            const status = typeof getDeviceStatus === 'function' ? getDeviceStatus() : localStorage.getItem('billnaw_device_status');
            const isAuth = status === 'AUTHORIZED' && (typeof checkDeviceAuthExpiration !== 'function' || !checkDeviceAuthExpiration());

            if (isAuth) {
                if (typeof hideDevicePairingOverlay === 'function') {
                    hideDevicePairingOverlay();
                }
                if (typeof applyStationProfileRestrictions === 'function') {
                    applyStationProfileRestrictions();
                }
                const profile = typeof getStationProfile === 'function' ? getStationProfile() : (localStorage.getItem('billnaw_station_profile') || 'BILLING_COUNTER');
                const targetView = (typeof resolveInitialViewForStation === 'function')
                    ? resolveInitialViewForStation(profile)
                    : 'pos';
                if (typeof switchView === 'function') {
                    switchView(targetView);
                }
            } else {
                if (typeof initDevicePairingFlow === 'function') {
                    initDevicePairingFlow();
                }
                if (typeof applyStationProfileRestrictions === 'function') {
                    applyStationProfileRestrictions();
                }
            }
        }
    });
}

