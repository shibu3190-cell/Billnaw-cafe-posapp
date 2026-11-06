import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import { 
    getFirestore, 
    initializeFirestore,
    doc, 
    collection, 
    onSnapshot, 
    setDoc, 
    updateDoc, 
    deleteDoc, 
    getDoc, 
    getDocs, 
    query,
    where,
    orderBy,
    limit,
    startAfter,
    writeBatch, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";
import { 
    getAuth, 
    signInWithCustomToken, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";

// Fetch runtime config securely from backend endpoint
async function initFirebaseFromBackend() {
    let firebaseConfig = {
        apiKey: "AIzaSyCha9cL9MOmOZjweNd9ZXCX9V5sDh-RlAU",
        authDomain: "abhi-pro-cafe-pos.firebaseapp.com",
        projectId: "abhi-pro-cafe-pos",
        storageBucket: "abhi-pro-cafe-pos.firebasestorage.app",
        messagingSenderId: "323985422709",
        appId: "1:323985422709:web:700b77f1a0ff4dc723bb3c"
    };
    let firestoreDbId = "ai-studio-billnawcafepos-3ac17879-08c8-4e15-9a3d-a965f7d92fda";

    try {
        const res = await fetch('/api/config/client');
        if (res.ok) {
            const serverConfig = await res.json();
            if (serverConfig.projectId) {
                firebaseConfig = {
                    apiKey: serverConfig.apiKey || firebaseConfig.apiKey,
                    authDomain: serverConfig.authDomain || firebaseConfig.authDomain,
                    projectId: serverConfig.projectId,
                    storageBucket: serverConfig.storageBucket || firebaseConfig.storageBucket,
                    messagingSenderId: serverConfig.messagingSenderId || firebaseConfig.messagingSenderId,
                    appId: serverConfig.appId || firebaseConfig.appId
                };
            }
            if (serverConfig.firestoreDatabaseId) {
                firestoreDbId = serverConfig.firestoreDatabaseId;
            }
        }
    } catch (cfgErr) {
        console.warn("Using bundled config fallback:", cfgErr);
    }

    const app = initializeApp(firebaseConfig);
    let db;
    try {
        db = initializeFirestore(app, {
            experimentalAutoDetectLongPolling: true,
            useFetchStreams: false
        }, firestoreDbId);
        console.log("Firestore initialized with custom db & auto-detect long-polling:", firestoreDbId);
    } catch (e) {
        try {
            db = getFirestore(app, firestoreDbId);
            console.log("Firestore initialized with custom db (fallback):", firestoreDbId);
        } catch (e2) {
            console.warn("Falling back to default firestore database:", e2);
            db = getFirestore(app);
        }
    }

    let auth = null;
    try {
        auth = getAuth(app);
        console.log("Firebase Auth client initialized successfully");
    } catch (authErr) {
        console.warn("Firebase Auth initialization error, running in local fallback:", authErr);
    }

    window.firebaseApp = app;
    window.auth = auth;
    window.firebaseAuth = auth;
    window.firebaseSignInWithCustomToken = signInWithCustomToken;
    window.firebaseSignOut = signOut;
    window.firebaseOnAuthStateChanged = onAuthStateChanged;

    function isGoogleFirebaseCustomToken(token) {
        if (!token || typeof token !== 'string') return false;
        const parts = token.split('.');
        if (parts.length !== 3) return false;
        try {
            const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
            return header && header.alg === 'RS256';
        } catch (e) {
            return false;
        }
    }
    window.isGoogleFirebaseCustomToken = isGoogleFirebaseCustomToken;

    if (auth && typeof onAuthStateChanged === 'function') {
        try {
            onAuthStateChanged(auth, (user) => {
                if (user) {
                    console.log("⚡ Firebase Auth: Active session for", user.email || user.uid);
                    window.currentAuthUser = user;
                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(user.email, true);
                    }
                    if (typeof updateShopAuthUI === 'function') {
                        updateShopAuthUI();
                    }
                    const activeStoreCode = localStorage.getItem('billnaw_store_code') || ('SHOP-' + (user.uid || '').slice(0, 6).toUpperCase());
                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(activeStoreCode);
                    }
                } else {
                    console.log("⚡ Firebase Auth: Unauthenticated / Local session check");
                    window.currentAuthUser = null;
                    const currentAuthMode = localStorage.getItem('billnaw_auth_mode');
                    const activeToken = localStorage.getItem('billnaw_auth_token') || sessionStorage.getItem('billnaw_auth_token');
                    const isExplicitDemo = currentAuthMode === 'demo';

                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(null, false, isExplicitDemo ? 'demo' : (currentAuthMode || 'unauthenticated'));
                    }
                    if (typeof updateShopAuthUI === 'function') {
                        updateShopAuthUI();
                    }

                    // Strict Auth Gate: No silent fallback into Demo/Guest mode
                    if (!activeToken && !isExplicitDemo) {
                        if (typeof openShopAuthModal === 'function') {
                            openShopAuthModal();
                        }
                    }
                }
            });
        } catch (listenerErr) {
            console.warn("onAuthStateChanged setup warning:", listenerErr);
        }
    }

    function deepCleanFirestoreData(data) {
        if (data === undefined) return undefined;
        if (data === null) return null;
        if (typeof data !== 'object') return data;
        if (data instanceof Date) return data;
        if (Array.isArray(data)) {
            return data
                .map(item => deepCleanFirestoreData(item))
                .filter(item => item !== undefined);
        }
        const clean = {};
        for (const key of Object.keys(data)) {
            const val = data[key];
            if (val !== undefined) {
                const cleanedVal = deepCleanFirestoreData(val);
                if (cleanedVal !== undefined) {
                    clean[key] = cleanedVal;
                }
            }
        }
        return clean;
    }
    window.deepCleanFirestoreData = deepCleanFirestoreData;

    window.firestoreDB = db;
    window.firestoreDoc = doc;
    window.firestoreCollection = collection;
    window.firestoreOnSnapshot = onSnapshot;
    window.firestoreSetDoc = (ref, data, options) => {
        const sanitized = deepCleanFirestoreData(data);
        return options ? setDoc(ref, sanitized, options) : setDoc(ref, sanitized);
    };
    window.firestoreUpdateDoc = (ref, data, ...rest) => {
        const sanitized = deepCleanFirestoreData(data);
        return updateDoc(ref, sanitized, ...rest);
    };
    window.firestoreDeleteDoc = deleteDoc;
    window.firestoreGetDoc = getDoc;
    window.firestoreGetDocs = getDocs;
    window.firestoreWriteBatch = writeBatch;
    window.firestoreServerTimestamp = serverTimestamp;
    window.firestoreQuery = query;
    window.firestoreWhere = where;
    window.firestoreOrderBy = orderBy;
    window.firestoreLimit = limit;
    window.firestoreStartAfter = startAfter;
    window.firestoreDatabaseId = firestoreDbId;
    window.initializeFirestore = initializeFirestore;
    window.getFirestore = getFirestore;

    // Legacy compatibility
    window.firebaseDB = db;
    window.dispatchEvent(new Event('firebaseLoaded'));
}

initFirebaseFromBackend();
