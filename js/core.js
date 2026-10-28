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

let myClientID = localStorage.getItem('cafeLicenseKey') || 'BONGBHOJ-TERMINAL';
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
            'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80'
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
            'https://images.unsplash.com/photo-1599488615731-7e5c2823ff28?w=600&auto=format&fit=crop&q=80',
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
    return 10;
}
window.getDishVariationCount = getDishVariationCount;

const defaultMenu = [
    { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
    { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
    { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, /* baseline price: 150 */ stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
    { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
];
window.defaultMenu = defaultMenu;

// Immediate baseline seeding if empty
if (!menuItems || menuItems.length === 0) {
    menuItems = [...defaultMenu];
    window.menuItems = menuItems;
}
if (!menuCategories || menuCategories.includes("Tea/Coffee") || menuCategories.includes("Food")) {
    menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
    window.menuCategories = menuCategories;
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
            defaultRate 
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
        });
        finalTotal = computedTaxableSubtotal + totalTax;
    } else if (mode === 'none') {
        computedTaxableSubtotal = discountedGross;
        totalTax = 0;
        finalTotal = discountedGross;
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
        defaultRate
    };
}
window.calculateOrderTotals = calculateOrderTotals;

// IndexedDB Persistence Layer
const idb = {
    db: null, 
    initPromise: null,
    init: function() {
        if (this.initPromise) return this.initPromise;
        this.initPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open('CafePOS_DB', 1);
            req.onupgradeneeded = (e) => { 
                if (!e.target.result.objectStoreNames.contains('store')) {
                    e.target.result.createObjectStore('store'); 
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
            req.onerror = () => reject();
        });
        return this.initPromise;
    },
    get: async function(key) {
        await this.init(); 
        return new Promise((resolve) => { 
            const tx = this.db.transaction('store', 'readonly'); 
            const req = tx.objectStore('store').get(key); 
            req.onsuccess = () => resolve(req.result); 
            req.onerror = () => resolve(null); 
        });
    },
    set: async function(key, val) {
        await this.init(); 
        const tx = this.db.transaction('store', 'readwrite'); 
        tx.objectStore('store').put(val, key);
    },
    delete: async function(key) {
        await this.init();
        const tx = this.db.transaction('store', 'readwrite');
        tx.objectStore('store').delete(key);
    },
    clear: async function(key) {
        await this.init();
        const tx = this.db.transaction('store', 'readwrite');
        if (key) {
            tx.objectStore('store').delete(key);
        } else {
            tx.objectStore('store').clear();
        }
    }
};
window.idb = idb;

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

// Firestore Sync Integration
function handleRemoteFirestoreUpdate(data) {
    if (!data || typeof data !== 'object') return;
    console.log("⚡ Received Firestore live store snapshot for:", myClientID);

    if (data.profile) {
        shopProfile = { ...shopProfile, ...data.profile };
        if (!shopProfile.startInvoiceNo) shopProfile.startInvoiceNo = 1001;
    }
    if (Array.isArray(data.staff) && data.staff.length > 0) {
        staffList = data.staff;
    }
    const isLegacyRemoteMock = Array.isArray(data.menu) && (
        data.menu.some(i => i.name === 'Steam Rice' || i.name === 'Espresso Coffee' || i.name === 'Chicken Roll' || i.name === 'Masala Chai' || i.name === 'Club Sandwich') ||
        (data.menu.length >= 30)
    );

    if (Array.isArray(data.menu) && data.menu.length > 0 && !isLegacyRemoteMock) {
        menuItems = data.menu;
    } else if (isLegacyRemoteMock || !Array.isArray(menuItems) || menuItems.length === 0) {
        const cleanDefaultMenu = [
            { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
            { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
            { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
            { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
        ];
        menuItems = cleanDefaultMenu;
        window.menuItems = menuItems;
        if (isLegacyRemoteMock) {
            console.log("⚡ Sanitized legacy mock menu from remote store; persisting pristine 4-item baseline to cloud");
            setTimeout(() => persistAllToFirestore(), 400);
        }
    }
    if (Array.isArray(data.categories) && data.categories.length > 0 && !isLegacyRemoteMock) {
        menuCategories = data.categories;
    } else if (isLegacyRemoteMock) {
        menuCategories = ["All", "Snacks", "Beverages", "Main Course"];
        window.menuCategories = menuCategories;
    }
    if (Array.isArray(data.customers) && data.customers.length > 0) {
        customersList = data.customers;
    }
    if (Array.isArray(data.history)) {
        orderHistory = data.history.sort((a,b) => b.id - a.id);
    } else if (data.history && typeof data.history === 'object') {
        orderHistory = Object.values(data.history).sort((a,b) => b.id - a.id);
    }
    if (Array.isArray(data.expenses)) {
        dailyExpenses = data.expenses.sort((a,b) => b.id - a.id);
    } else if (data.expenses && typeof data.expenses === 'object') {
        dailyExpenses = Object.values(data.expenses).sort((a,b) => b.id - a.id);
    }
    if (data.tables && typeof data.tables === 'object') {
        const fetchedTables = data.tables;
        for(let i = 1; i <= shopProfile.tableCount; i++) {
            if(fetchedTables[i]) { 
                tablesInfo[i] = fetchedTables[i]; 
                if(!tablesInfo[i].items) tablesInfo[i].items = []; 
                if (isLegacyRemoteMock || tablesInfo[i].items.some(it => it.name === 'Steam Rice' || it.name === 'Espresso Coffee' || it.name === 'Masala Chai')) {
                    tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
                }
            } else { 
                if (!tablesInfo[i]) tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null }; 
            }
        }
    }

    saveToLocal();
    updateAllUI();
}
window.handleRemoteFirestoreUpdate = handleRemoteFirestoreUpdate;

// Firestore Store Resolution & Sync Integration (/shops/{storeCode} with /clients/{clientId} fallback)
function getActiveStoreIdentifier() {
    return localStorage.getItem('billnaw_store_code') || 
           localStorage.getItem('cafeLicenseKey') || 
           myClientID || 
           'BONGBHOJ-TERMINAL';
}
window.getActiveStoreIdentifier = getActiveStoreIdentifier;

function getStoreDocRef(explicitCode = null) {
    if (!window.firestoreDB || !window.firestoreDoc) return null;
    const code = explicitCode || getActiveStoreIdentifier();
    const isShop = (code.startsWith('SHOP-') || localStorage.getItem('billnaw_auth_mode') === 'authenticated') && code !== 'BONGBHOJ-TERMINAL';
    const collectionName = isShop ? "shops" : "clients";
    return window.firestoreDoc(window.firestoreDB, collectionName, code);
}
window.getStoreDocRef = getStoreDocRef;

function attachFirestoreListener(targetStoreCode = null) {
    if (targetStoreCode && typeof targetStoreCode === 'string') {
        if (targetStoreCode.startsWith('SHOP-')) {
            try { localStorage.setItem('billnaw_store_code', targetStoreCode); } catch(e) {}
        }
        myClientID = targetStoreCode;
        window.myClientID = myClientID;
    }

    if (!window.firestoreDB || !window.firestoreDoc || !window.firestoreOnSnapshot) {
        setCloudSyncStatus('offline', 'Offline (Local)');
        return;
    }

    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e) {}
        firestoreUnsubscribe = null;
    }

    setCloudSyncStatus('syncing', 'Connecting Cloud...');
    try {
        const storeDocRef = getStoreDocRef(targetStoreCode);
        if (!storeDocRef) {
            setCloudSyncStatus('offline', 'Offline (Local)');
            return;
        }

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
    if (firestoreUnsubscribe) {
        try { firestoreUnsubscribe(); } catch(e) {}
        firestoreUnsubscribe = null;
    }
    setCloudSyncStatus('offline', 'Disconnected');
}
window.detachFirestoreListener = detachFirestoreListener;
window.unsubscribeFirestoreListeners = detachFirestoreListener;

window.addEventListener('firebaseLoaded', () => {
    attachFirestoreListener();
});

async function persistAllToFirestore() {
    if (!window.firestoreDB || !window.firestoreDoc || !window.firestoreSetDoc) return;
    setCloudSyncStatus('syncing', 'Backing up to Cloud...');
    try {
        const storeDocRef = getStoreDocRef();
        if (!storeDocRef) return;
        await window.firestoreSetDoc(storeDocRef, {
            profile: shopProfile,
            staff: staffList,
            menu: menuItems,
            categories: menuCategories,
            customers: customersList,
            history: orderHistory,
            expenses: dailyExpenses,
            tables: tablesInfo,
            updatedAt: new Date().toISOString()
        }, { merge: true });
        lastCloudSyncTime = Date.now();
        setCloudSyncStatus('synced', 'Real-Time Synced');
    } catch (e) {
        const isPermission = e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission')));
        if (isPermission) {
            console.info("⚡ Cloud store saved to Local IndexedDB (Cloud permissions require Service Account).");
        } else {
            console.warn("Cloud backup error:", e);
        }
        setCloudSyncStatus('offline', 'Local (IndexedDB)');
    }
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
}
window.persistTables = persistTables;

function persistMenu() { 
    idb.set('cafe_menu', menuItems); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { menu: menuItems, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
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
}
window.persistCategories = persistCategories;

function persistProfile() { 
    idb.set('cafe_profile', shopProfile); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { profile: shopProfile, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
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
}
window.persistCustomersFirebase = persistCustomersFirebase;

function persistHistoryFirebase(newOrder = null) { 
    idb.set('cafe_history', orderHistory); 
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { history: orderHistory, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
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
}
window.persistExpensesFirebase = persistExpensesFirebase;

function persistStaffToFirestore(newStaff = null) {
    idb.set('cafe_staff', staffList);
    if(window.firestoreDB && window.firestoreDoc && window.firestoreSetDoc) {
        const storeDocRef = getStoreDocRef();
        if (storeDocRef) {
            window.firestoreSetDoc(storeDocRef, { staff: staffList, updatedAt: new Date().toISOString() }, { merge: true }).catch(() => {});
        }
    }
}
window.persistStaffToFirestore = persistStaffToFirestore;

function forceCloudSyncNow() {
    setCloudSyncStatus('syncing', 'Force Syncing...');
    showToast("⚡ Uploading store database to Cloud...");
    persistAllToFirestore().then(() => {
        showToast("✅ Cloud synchronization complete!");
    }).catch(e => {
        showToast("⚠️ Cloud Sync issue: " + e.message);
    });
}
window.forceCloudSyncNow = forceCloudSyncNow;

// Device & PWA Handlers
function getOrCreateDeviceId() {
    let devId = localStorage.getItem('bongbhoj_device_id');
    if (!devId) {
        devId = 'DEV-' + Math.random().toString(36).substring(2, 8).toUpperCase() + '-' + Date.now().toString(36).slice(-4).toUpperCase();
        localStorage.setItem('bongbhoj_device_id', devId);
    }
    return devId;
}
window.getOrCreateDeviceId = getOrCreateDeviceId;

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
    safe(updateProfileVisuals);
    safe(renderCategoryDropdown);
    safe(renderCategoryFilters);
    safe(renderCategoryListUI);
    safe(renderMenuCatalogUI);
    safe(renderMenuUI);
    safe(syncTableUI);
    safe(updateCartUI);
    safe(renderExpensesUI);
    safe(renderCustomersUI);
    safe(populateCheckoutCustomerDropdown);
    safe(renderStaffManagementUI);
    safe(renderLoginStaffPicker);
    safe(generateSettingsQRPreview);
    safe(refreshAiQuotaDisplay);
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
}
window.updateAllUI = updateAllUI;

async function initDatabase() {
    await idb.init();
    const storedProfile = await idb.get('cafe_profile');
    if (storedProfile && typeof storedProfile === 'object') {
        if (storedProfile.name === 'The Bong Bhoj Terminal' || storedProfile.name === 'The Bong Bhoj' || storedProfile.name === 'Billnaw Cafe' || !storedProfile.name) {
            storedProfile.name = 'billnaw';
        }
        shopProfile = { ...shopProfile, ...storedProfile };
        if (!shopProfile.startInvoiceNo) shopProfile.startInvoiceNo = 1001;
        window.shopProfile = shopProfile;
    }
    // Multi-Account Device Isolation: Clear device cache when a different email logs in
    try {
        const currentEmail = localStorage.getItem('billnaw_auth_email') || '';
        const lastDeviceEmail = localStorage.getItem('billnaw_last_device_email') || '';
        if (lastDeviceEmail && currentEmail && lastDeviceEmail.toLowerCase().trim() !== currentEmail.toLowerCase().trim()) {
            console.log(`[AUTH ISOLATION] Account switch detected (${lastDeviceEmail} -> ${currentEmail}). Wiping device local storage.`);
            if (typeof idb !== 'undefined' && idb.clear) {
                await idb.clear('cafe_menu');
                await idb.clear('cafe_history');
                await idb.clear('cafe_tables');
                await idb.clear('cafe_customers');
                await idb.clear('cafe_expenses');
                await idb.clear('cafe_staff');
                await idb.clear('cafe_categories');
            }
        }
        if (currentEmail) {
            localStorage.setItem('billnaw_last_device_email', currentEmail.toLowerCase().trim());
        }
    } catch(err) {
        console.warn('Device isolation error:', err);
    }

    // Restore authenticated store profile if saved in session
    try {
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const sessionRaw = localStorage.getItem('billnaw_shop_session');
        if (authMode === 'authenticated' && sessionRaw) {
            const session = JSON.parse(sessionRaw);
            if (session && session.shop && session.shop.name && (shopProfile.name === 'billnaw' || !shopProfile.name)) {
                shopProfile.name = session.shop.name;
                window.shopProfile = shopProfile;
            }
            if (session && session.storeCode) {
                myClientID = session.storeCode;
                window.myClientID = myClientID;
            }
        }
    } catch(e) {}
    const storedMenu = await idb.get('cafe_menu');
    const defaultMenu = [
        { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&auto=format&fit=crop&q=80" },
        { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=600&auto=format&fit=crop&q=80" },
        { id: 3, name: "Chicken Curry", category: "Main Course", price: 140, /* baseline price: 150 */ stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1588166524941-3bf61a9c41db?w=600&auto=format&fit=crop&q=80" },
        { id: 4, name: "Masala Coke", category: "Beverages", price: 40, stock: 15, stockQty: 15, trackStock: true, gstRate: 5, image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=600&auto=format&fit=crop&q=80" }
    ];
    const isLegacyMockMenu = storedMenu && Array.isArray(storedMenu) && (
        storedMenu.some(i => i.name === 'Steam Rice' || i.name === 'Espresso Coffee' || i.name === 'Chicken Roll' || i.name === 'Masala Chai') ||
        (storedMenu.length >= 30) // old 36-item mock list
    );
    if (storedMenu && Array.isArray(storedMenu) && storedMenu.length >= 4 && !isLegacyMockMenu) {
        menuItems = storedMenu;
        window.menuItems = menuItems;
    } else {
        menuItems = defaultMenu;
        window.menuItems = menuItems;
        await idb.set('cafe_menu', menuItems);
    }
    const storedCats = await idb.get('cafe_categories');
    const hasLegacyCats = storedCats && Array.isArray(storedCats) && storedCats.some(c => c === 'Tea/Coffee' || c === 'Food' || c === 'Cigarettes');
    if (storedCats && Array.isArray(storedCats) && storedCats.length > 0 && !isLegacyMockMenu && !hasLegacyCats) {
        menuCategories = storedCats;
        window.menuCategories = menuCategories;
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
    const storedTables = await idb.get('cafe_tables');
    if (storedTables && typeof storedTables === 'object') {
        tablesInfo = storedTables;
        window.tablesInfo = tablesInfo;
    }
    for (let i = 1; i <= (shopProfile.tableCount || 10); i++) {
        if (!tablesInfo[i] || (tablesInfo[i].items && tablesInfo[i].items.some(it => it.name === 'Steam Rice' || it.name === 'Espresso Coffee'))) {
            tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
        }
    }
    if (isLegacyMockMenu) {
        await idb.set('cafe_tables', tablesInfo);
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
    } else {
        staffList = [
            { id: 1, name: "Admin", role: "Admin", phone: "9876543210", pin: "1234", status: "Active", joinedDate: getLocalISODate() }
        ];
        window.staffList = staffList;
        await idb.set('cafe_staff', staffList);
    }
}
window.initDatabase = initDatabase;

function initStaffSystem() {
    if (!staffList || staffList.length === 0) {
        staffList = [
            { 
                id: 1, 
                name: "Admin", 
                role: "Admin", 
                phone: "9876543210", 
                pin: "1234", 
                pin_salt: "0123456789abcdef0123456789abcdef",
                pin_hash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
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
            pin: "1234",
            pin_salt: "0123456789abcdef0123456789abcdef",
            pin_hash: "8c0a1dd483dbd4deda3d166eda111798c0c306fe281f07bd7468751b04afb742",
            status: "Active",
            joinedDate: getLocalISODate()
        });
        window.staffList = staffList;
    }

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

    // Check terminal lock persistence
    try {
        const isLocked = localStorage.getItem('billnaw_terminal_locked') === 'true';
        if (isLocked && typeof lockTerminal === 'function') {
            lockTerminal(false);
        }
    } catch(e) {}
}
window.initStaffSystem = initStaffSystem;

function initFirestoreSync() {
    attachFirestoreListener();
}
window.initFirestoreSync = initFirestoreSync;

