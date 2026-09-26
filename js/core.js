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

// Date & String Helpers
function getLocalISODate(dateObj = new Date()) {
    const yyyy = dateObj.getFullYear();
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const dd = String(dateObj.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}
window.getLocalISODate = getLocalISODate;

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
let menuCategories = ["All", "Tea/Coffee", "Food", "Cigarettes", "Other"];
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

// Toast Notifications
function showToast(message) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}
window.showToast = showToast;

// 🖼️ ASSET & IMAGE OPTIMIZATION ENGINE
function generateFallbackImage(name) {
    const canvas = document.createElement('canvas');
    // High-density, compact 160x120 canvas (super lightweight ~2KB data URI vs 400x300 ~35KB)
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    
    // Warm gourmet culinary gradient
    const gradient = ctx.createLinearGradient(0, 0, 160, 120);
    gradient.addColorStop(0, '#5A3D31');
    gradient.addColorStop(1, '#2E1E17'); 
    ctx.fillStyle = gradient; 
    ctx.fillRect(0, 0, 160, 120);
    
    // Clean accent circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(80, 50, 30, 0, Math.PI * 2);
    ctx.stroke();

    // Dish Initial Emblem
    ctx.fillStyle = '#FFFFFF'; 
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center'; 
    ctx.textBaseline = 'middle';
    ctx.fillText((name || "D").charAt(0).toUpperCase(), 80, 48);
    
    // Dish Name Label
    ctx.font = '600 11px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const cleanLabel = (name || "Dish").substring(0, 16);
    ctx.fillText(cleanLabel, 80, 96);

    try {
        return canvas.toDataURL('image/webp', 0.8);
    } catch(e) {
        return canvas.toDataURL('image/jpeg', 0.7);
    }
}
window.generateFallbackImage = generateFallbackImage;

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
    if (Array.isArray(data.menu) && data.menu.length > 0) {
        menuItems = data.menu;
    }
    if (Array.isArray(data.categories) && data.categories.length > 0) {
        menuCategories = data.categories;
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
    if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
    if (typeof renderCategoryDropdown === 'function') renderCategoryDropdown();
    if (typeof renderCategoryFilters === 'function') renderCategoryFilters();
    if (typeof renderCategoryListUI === 'function') renderCategoryListUI();
    if (typeof renderMenuCatalogUI === 'function') renderMenuCatalogUI();
    if (typeof renderMenuUI === 'function') renderMenuUI();
    if (typeof syncTableUI === 'function') syncTableUI();
    if (typeof updateCartUI === 'function') updateCartUI();
    if (typeof renderExpensesUI === 'function') renderExpensesUI();
    if (typeof renderCustomersUI === 'function') renderCustomersUI();
    if (typeof populateCheckoutCustomerDropdown === 'function') populateCheckoutCustomerDropdown();
    if (typeof renderStaffManagementUI === 'function') renderStaffManagementUI();
    if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();
    if (typeof generateSettingsQRPreview === 'function') generateSettingsQRPreview();
    if (typeof refreshAiQuotaDisplay === 'function') refreshAiQuotaDisplay();
    if (typeof renderDashboardAnalytics === 'function') {
        const dashboardTab = document.getElementById('dashboard');
        if (dashboardTab && dashboardTab.classList.contains('active')) {
            renderDashboardAnalytics();
        }
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
    if (storedMenu && Array.isArray(storedMenu) && storedMenu.length > 0) {
        menuItems = storedMenu;
        window.menuItems = menuItems;
    } else {
        menuItems = [
            { id: 1, name: "Samosa", category: "Snacks", price: 15, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: generateFallbackImage("Samosa") },
            { id: 2, name: "Tea", category: "Beverages", price: 10, stock: 10, stockQty: 10, trackStock: true, gstRate: 5, image: generateFallbackImage("Tea") },
            { id: 3, name: "Chicken Curry", category: "Main Course", price: 150, stock: 4, stockQty: 4, trackStock: true, gstRate: 5, image: generateFallbackImage("Chicken Curry") }
        ];
        window.menuItems = menuItems;
        await idb.set('cafe_menu', menuItems);
    }
    const storedCats = await idb.get('cafe_categories');
    if (storedCats && Array.isArray(storedCats) && storedCats.length > 0) {
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
            { id: 1, name: "Admin", role: "Admin", phone: "9876543210", pin: "1234", status: "Active", joinedDate: getLocalISODate() }
        ];
        window.staffList = staffList;
    }
    currentStaff = staffList[0];
    selectedLoginStaffId = staffList[0].id;
    window.currentStaff = currentStaff;
    if (typeof renderLoginStaffPicker === 'function') renderLoginStaffPicker();
}
window.initStaffSystem = initStaffSystem;

function initFirestoreSync() {
    attachFirestoreListener();
}
window.initFirestoreSync = initFirestoreSync;

