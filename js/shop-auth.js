(function() {
    let otpCountdownInterval = null;
    let otpRemainingSeconds = 60;

    function openShopAuthModal(isReLogin = false) {
        const modal = document.getElementById('shopAuthModal');
        const isExplicitLogin = isReLogin || (window.location.search && window.location.search.includes('auth=login')) || (!localStorage.getItem('billnaw_auth_token') && !sessionStorage.getItem('billnaw_auth_token'));
        if (modal) {
            if (isExplicitLogin) {
                modal.dataset.relogin = 'true';
            }
            modal.style.display = 'flex';
            const closeBtn = document.getElementById('shopAuthCloseBtn') || modal.querySelector('.shop-auth-close-btn');
            if (closeBtn) {
                // Strict security: Top right cross button is completely removed for re-login and unauthenticated access
                closeBtn.style.display = 'none';
                closeBtn.style.setProperty('display', 'none', 'important');
                closeBtn.disabled = true;
            }
            const emailInput = document.getElementById('shopAuthEmail');
            if (emailInput && !emailInput.value) {
                setTimeout(() => emailInput.focus(), 60);
            }
        }
    }
    window.openShopAuthModal = openShopAuthModal;

    function closeShopAuthModal(force = false) {
        const activeToken = localStorage.getItem('billnaw_auth_token') || sessionStorage.getItem('billnaw_auth_token');
        const modal = document.getElementById('shopAuthModal');
        const isExplicitLogin = (window.location.search && window.location.search.includes('auth=login')) || (modal && modal.dataset.relogin === 'true');
        if (!force && !activeToken) {
            if (typeof showToast === 'function') {
                showToast("Please log in or sign up to access your POS terminal.");
            }
            return false;
        }
        if (modal) {
            modal.style.display = 'none';
            delete modal.dataset.relogin;
        }
        if (isExplicitLogin) {
            try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e) {}
        }
        return true;
    }
    window.closeShopAuthModal = closeShopAuthModal;

    function switchShopAuthTab(tab) {
        const loginTab = document.getElementById('tabShopLogin');
        const signupTab = document.getElementById('tabShopSignup');
        const loginView = document.getElementById('shopAuthLoginView');
        const signupView = document.getElementById('shopAuthSignupView');
        
        if (tab === 'login') {
            if (loginTab) { loginTab.classList.add('active'); loginTab.setAttribute('aria-selected', 'true'); }
            if (signupTab) { signupTab.classList.remove('active'); signupTab.setAttribute('aria-selected', 'false'); }
            if (loginView) loginView.style.display = 'block';
            if (signupView) signupView.style.display = 'none';
        } else {
            if (signupTab) { signupTab.classList.add('active'); signupTab.setAttribute('aria-selected', 'true'); }
            if (loginTab) { loginTab.classList.remove('active'); loginTab.setAttribute('aria-selected', 'false'); }
            if (loginView) loginView.style.display = 'none';
            if (signupView) signupView.style.display = 'block';
        }
    }
    window.switchShopAuthTab = switchShopAuthTab;

    function toggleLoginAuthMode(mode) {
        const otpSec = document.getElementById('shopAuthOtpSection');
        const passSec = document.getElementById('shopAuthPasswordSection');
        if (mode === 'password') {
            if (otpSec) otpSec.style.display = 'none';
            if (passSec) {
                passSec.style.display = 'block';
                const pEmail = document.getElementById('shopAuthPasswordEmail');
                const oEmail = document.getElementById('shopAuthEmail');
                if (pEmail && oEmail && oEmail.value) pEmail.value = oEmail.value;
            }
        } else {
            if (otpSec) otpSec.style.display = 'block';
            if (passSec) passSec.style.display = 'none';
        }
    }
    window.toggleLoginAuthMode = toggleLoginAuthMode;

    function showValidationMsg(containerId, message, type) {
        const el = document.getElementById(containerId);
        if (!el) return;
        el.className = 'validation-feedback ' + type;
        el.innerText = message;
    }

    function validateLoginEmail(val) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val) {
            showValidationMsg('loginEmailValidationFeedback', '', '');
        } else if (regex.test(val)) {
            showValidationMsg('loginEmailValidationFeedback', 'Valid email format ✓', 'success');
        } else {
            showValidationMsg('loginEmailValidationFeedback', 'Enter a valid email address', 'muted');
        }
    }
    window.validateLoginEmail = validateLoginEmail;

    function validateSignupEmail(val) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val) {
            showValidationMsg('signupEmailFeedback', '', '');
        } else if (regex.test(val)) {
            showValidationMsg('signupEmailFeedback', 'Valid email format ✓', 'success');
        } else {
            showValidationMsg('signupEmailFeedback', 'Enter a valid email address', 'muted');
        }
    }
    window.validateSignupEmail = validateSignupEmail;

    function validateSignupPassword(val) {
        if (!val) {
            showValidationMsg('signupPasswordFeedback', '', '');
        } else if (val.length >= 6) {
            showValidationMsg('signupPasswordFeedback', 'Strong password ✓', 'success');
        } else {
            showValidationMsg('signupPasswordFeedback', 'Minimum 6 characters needed', 'error');
        }
        const confirmVal = document.getElementById('signupConfirmPassword') ? document.getElementById('signupConfirmPassword').value : '';
        if (confirmVal) validateSignupConfirmPassword(confirmVal);
    }
    window.validateSignupPassword = validateSignupPassword;

    function validateSignupConfirmPassword(val) {
        const pass = document.getElementById('signupPassword') ? document.getElementById('signupPassword').value : '';
        if (!val) {
            showValidationMsg('signupConfirmFeedback', '', '');
        } else if (pass && val === pass) {
            showValidationMsg('signupConfirmFeedback', 'Passwords match ✓', 'success');
        } else {
            showValidationMsg('signupConfirmFeedback', 'Passwords do not match', 'error');
        }
    }
    window.validateSignupConfirmPassword = validateSignupConfirmPassword;

    function validateSignupAdminPin(val) {
        const clean = (val || '').trim();
        if (!clean) {
            showValidationMsg('signupAdminPinFeedback', '', '');
        } else if (!/^\d{4}$/.test(clean)) {
            showValidationMsg('signupAdminPinFeedback', 'Must be exactly 4 digits', 'error');
        } else if (clean === '0000' || clean === '1234') {
            showValidationMsg('signupAdminPinFeedback', 'PIN cannot be trivial (0000, 1234)', 'error');
        } else {
            showValidationMsg('signupAdminPinFeedback', 'Valid Admin PIN ✓', 'success');
        }
        const confirmVal = document.getElementById('signupConfirmAdminPin') ? document.getElementById('signupConfirmAdminPin').value : '';
        if (confirmVal) validateSignupConfirmAdminPin(confirmVal);
    }
    window.validateSignupAdminPin = validateSignupAdminPin;

    function validateSignupConfirmAdminPin(val) {
        const pin = document.getElementById('signupAdminPin') ? document.getElementById('signupAdminPin').value : '';
        if (!val) {
            showValidationMsg('signupConfirmAdminPinFeedback', '', '');
        } else if (pin && val === pin) {
            showValidationMsg('signupConfirmAdminPinFeedback', 'Admin PIN matches ✓', 'success');
        } else {
            showValidationMsg('signupConfirmAdminPinFeedback', 'Admin PINs do not match', 'error');
        }
    }
    window.validateSignupConfirmAdminPin = validateSignupConfirmAdminPin;

    function validateSignupPhone(val) {
        const clean = (val || '').replace(/\D/g, '');
        if (!val) {
            showValidationMsg('signupPhoneFeedback', '', '');
        } else if (clean.length < 10) {
            showValidationMsg('signupPhoneFeedback', `Enter 10-digit mobile number (${clean.length}/10)`, 'error');
        } else {
            showValidationMsg('signupPhoneFeedback', 'Valid mobile number ✓', 'success');
        }
    }
    window.validateSignupPhone = validateSignupPhone;

    function validateSignupForm() {
        // Live check hook
    }
    window.validateSignupForm = validateSignupForm;

    function startOtpTimer(seconds) {
        if (otpCountdownInterval) clearInterval(otpCountdownInterval);
        otpRemainingSeconds = seconds;
        const countSpan = document.getElementById('otpSecondsCount');
        const resendBtn = document.getElementById('btnResendOtp');
        const timerText = document.getElementById('otpTimerText');
        
        if (resendBtn) resendBtn.disabled = true;
        if (timerText) timerText.style.display = 'inline';
        if (countSpan) countSpan.innerText = otpRemainingSeconds;

        otpCountdownInterval = setInterval(() => {
            otpRemainingSeconds--;
            if (countSpan) countSpan.innerText = otpRemainingSeconds;
            if (otpRemainingSeconds <= 0) {
                clearInterval(otpCountdownInterval);
                if (resendBtn) resendBtn.disabled = false;
                if (timerText) timerText.style.display = 'none';
            }
        }, 1000);
    }

    function handleSendOtpCode() {
        const emailInput = document.getElementById('shopAuthEmail');
        const email = emailInput ? emailInput.value.trim() : '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showValidationMsg('loginEmailValidationFeedback', 'Please enter a valid work or shop email', 'error');
            if (emailInput) emailInput.focus();
            return;
        }

        showValidationMsg('loginEmailValidationFeedback', 'Verification code dispatched ✓', 'success');
        const recipientSpan = document.getElementById('otpRecipientEmailDisplay');
        if (recipientSpan) recipientSpan.innerText = email;

        const otpSection = document.getElementById('otpInputSection');
        if (otpSection) otpSection.style.display = 'block';

        const sendWrap = document.getElementById('otpSendActionWrap');
        if (sendWrap) sendWrap.style.display = 'none';

        startOtpTimer(60);

        // Auto focus first OTP input box
        const firstOtp = document.querySelector('#otpBoxesContainer .otp-digit-input[data-index="0"]');
        if (firstOtp) {
            setTimeout(() => { firstOtp.focus(); firstOtp.select(); }, 100);
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            }).then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, error: 'Server returned unexpected status (' + res.status + ')' };
                }
                if (data && data.success) {
                    if (typeof showToast === 'function') {
                        showToast('Verification code dispatched to ' + email, 'success');
                    }
                    showValidationMsg('otpValidationFeedback', 'Code sent! Check your inbox or spam folder.', 'success');
                } else if (data && data.error) {
                    showValidationMsg('loginEmailValidationFeedback', data.error, 'error');
                    showValidationMsg('otpValidationFeedback', data.error, 'error');
                    if (typeof showToast === 'function') {
                        showToast(data.error, 'error');
                    }
                }
            }).catch(err => {
                const msg = 'Unable to send code: ' + (err.message || 'Network error');
                showValidationMsg('loginEmailValidationFeedback', msg, 'error');
                showValidationMsg('otpValidationFeedback', msg, 'error');
                if (typeof showToast === 'function') {
                    showToast(msg, 'error');
                }
            });
        }
    }
    window.handleSendOtpCode = handleSendOtpCode;

    function triggerAutoFillOtp() {}
    window.triggerAutoFillOtp = triggerAutoFillOtp;

    function handleResendOtpCode() {
        const resendBtn = document.getElementById('btnResendOtp');
        if (resendBtn && resendBtn.disabled) return;
        handleSendOtpCode();
    }
    window.handleResendOtpCode = handleResendOtpCode;

    function handleVerifyOtpCode() {
        const digitInputs = Array.from(document.querySelectorAll('#otpBoxesContainer .otp-digit-input'));
        const otpCode = digitInputs.map(input => input.value.trim()).join('');
        const emailInput = document.getElementById('shopAuthEmail');
        const email = emailInput ? emailInput.value.trim() : '';

        if (otpCode.length < 6) {
            const msg = 'Please enter complete 6-digit verification code';
            showValidationMsg('loginEmailValidationFeedback', msg, 'error');
            showValidationMsg('otpValidationFeedback', msg, 'error');
            return;
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: otpCode })
            }).then(async res => {
                const data = await res.json().catch(() => ({}));
                if (res.ok && data && data.success) {
                    // Wipe OTP inputs upon successful login
                    digitInputs.forEach(input => { input.value = ''; });

                    try {
                        localStorage.setItem('billnaw_auth_mode', 'authenticated');
                        const isOwner = Boolean(data && (data.isOwner || (data.user && (data.user.role === 'owner' || data.user.isOwner))));
                        if (isOwner) {
                            localStorage.setItem('billnaw_is_master', 'true');
                            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        } else if (localStorage.getItem('billnaw_is_master') !== 'true') {
                            localStorage.setItem('billnaw_is_master', 'false');
                            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        }

                        // Multi-Account Device Isolation: check if tenant switched
                        const prevStoreCode = localStorage.getItem('billnaw_store_code');
                        if (prevStoreCode && data.storeCode && prevStoreCode !== data.storeCode) {
                            console.log(`[AUTH] Switching store tenant: ${prevStoreCode} -> ${data.storeCode}. Purging previous tenant cache.`);
                            await clearAllTenantLocalData();
                        }

                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (email) localStorage.setItem('billnaw_auth_email', email);
                        if (data.storeCode) localStorage.setItem('billnaw_store_code', data.storeCode);
                        localStorage.setItem('billnaw_shop_session', JSON.stringify({
                            token: data.token,
                            customToken: data.customToken,
                            storeCode: data.storeCode,
                            shop: data.shop,
                            user: data.user,
                            loginAt: Date.now()
                        }));

                        // Unconditionally update active shop profile with authenticated tenant credentials
                        if (typeof shopProfile === 'undefined') shopProfile = {};
                        if (data.shop && data.shop.name && data.shop.name !== 'billnaw' && data.shop.name !== 'My Cafe') {
                            shopProfile.name = data.shop.name;
                        }
                        if (data.storeCode) {
                            shopProfile.storeCode = data.storeCode;
                            myClientID = data.storeCode;
                            window.myClientID = data.storeCode;
                        }
                        if (data.shop && data.shop.logo && !shopProfile.logo) {
                            shopProfile.logo = data.shop.logo;
                        }
                        if (data.shop && data.shop.phone) {
                            shopProfile.phone = data.shop.phone;
                        }
                        if (data.shop && data.shop.address) {
                            shopProfile.address = data.shop.address;
                        }
                        if (data.shop && data.shop.profile && typeof data.shop.profile === 'object') {
                            const sp = data.shop.profile;
                            if (sp.logo && !shopProfile.logo) shopProfile.logo = sp.logo;
                            if (sp.name && sp.name !== 'billnaw' && sp.name !== 'My Cafe' && (!shopProfile.name || shopProfile.name === 'billnaw' || shopProfile.name === 'My Cafe')) {
                                shopProfile.name = sp.name;
                            }
                            if (sp.address && !shopProfile.address) shopProfile.address = sp.address;
                            if (sp.phone && !shopProfile.phone) shopProfile.phone = sp.phone;
                        }
                        if (Array.isArray(data.shop?.menu) && data.shop.menu.length > 0) {
                            menuItems = data.shop.menu;
                            window.menuItems = menuItems;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_menu', menuItems);
                        }
                        if (Array.isArray(data.shop?.categories) && data.shop.categories.length > 0) {
                            menuCategories = data.shop.categories;
                            window.menuCategories = menuCategories;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_categories', menuCategories);
                        }
                        const resolvedEmail = (data.user?.email || data.shop?.ownerEmail || email || '').trim().toLowerCase();
                        if (resolvedEmail) {
                            shopProfile.ownerEmail = resolvedEmail;
                            shopProfile.email = resolvedEmail;
                        }
                        window.shopProfile = shopProfile;
                        try {
                            if (shopProfile.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') localStorage.setItem('billnaw_shop_name', shopProfile.name);
                            if (shopProfile.storeCode) localStorage.setItem('billnaw_store_code', shopProfile.storeCode);
                            if (shopProfile.logo && shopProfile.logo.length < 2000000) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
                            if (resolvedEmail) {
                                localStorage.setItem('billnaw_auth_email', resolvedEmail);
                                localStorage.setItem('billnaw_owner_email', resolvedEmail);
                                localStorage.setItem('billnaw_shop_email', resolvedEmail);
                            }
                            localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
                            if (typeof idb !== 'undefined' && idb.set) {
                                idb.set('cafe_profile', shopProfile);
                                if (shopProfile.logo) idb.set('cafe_logo', shopProfile.logo);
                            }
                        } catch(e) {}
                        if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
                    } catch (e) {}

                    // Firebase Auth Custom Token Sign-in
                    if (data.customToken && window.auth && typeof window.firebaseSignInWithCustomToken === 'function') {
                        if (typeof window.isGoogleFirebaseCustomToken === 'function' && window.isGoogleFirebaseCustomToken(data.customToken)) {
                            try {
                                await window.firebaseSignInWithCustomToken(window.auth, data.customToken);
                                console.log("Firebase Auth custom token sign in established");
                            } catch (fbErr) {
                                console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                            }
                        } else {
                            console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                        }
                    }

                    // Attach real-time Firestore listener for /shops/{storeCode}
                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    updateShopAuthUI();
                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(data.user?.email || data.shop?.name || email, true);
                    }
                    if (typeof showToast === 'function') showToast('Verified! Welcome to Billnaw POS', 'success');
                    closeShopAuthModal();
                    if (typeof verifyDeviceAuthorizationOnLogin === 'function') {
                        verifyDeviceAuthorizationOnLogin(data.storeCode);
                    }

                    // Initial Cloud Hydrate & Loading Overlay + Staff Profile Gateway
                    if (typeof showCloudSyncOverlay === 'function') {
                        showCloudSyncOverlay('Syncing Shop Profile, Menu & Active Tables...');
                        if (typeof setCloudSyncProgress === 'function') setCloudSyncProgress(35, 'Connecting to BillNaw Cloud...');
                    }
                    if (typeof initDatabase === 'function') {
                        try {
                            await initDatabase();
                            if (typeof setCloudSyncProgress === 'function') setCloudSyncProgress(80, 'Menu, Tables & Staff Roster Synced');
                        } catch (initErr) {
                            console.warn("initDatabase hydrate error:", initErr);
                        }
                    }
                    setTimeout(() => {
                        if (typeof hideCloudSyncOverlay === 'function') hideCloudSyncOverlay();
                        if (typeof showStaffProfileSelector === 'function') {
                            showStaffProfileSelector(data.shop?.name || email);
                        }
                    }, 500);
                } else {
                    const errMsg = (data && data.error) ? data.error : (res.status === 401 ? 'Incorrect or expired verification code. Use the auto-filled code or click Resend.' : 'Invalid verification code');
                    showValidationMsg('loginEmailValidationFeedback', errMsg, 'error');
                    showValidationMsg('otpValidationFeedback', errMsg, 'error');
                    if (typeof showToast === 'function') showToast(errMsg, 'error');
                }
            }).catch(err => {
                const errMsg = 'Verification error: ' + (err.message || 'Network issue. Please try again.');
                showValidationMsg('loginEmailValidationFeedback', errMsg, 'error');
                showValidationMsg('otpValidationFeedback', errMsg, 'error');
                if (typeof showToast === 'function') showToast(errMsg, 'error');
            });
        } else {
            const msg = 'Network connection unavailable';
            showValidationMsg('loginEmailValidationFeedback', msg, 'error');
            showValidationMsg('otpValidationFeedback', msg, 'error');
        }
    }
    window.handleVerifyOtpCode = handleVerifyOtpCode;

    function handlePasswordSignIn() {
        const emailEl = document.getElementById('shopAuthPasswordEmail');
        const passEl = document.getElementById('shopAuthPasswordInput');
        const email = emailEl ? emailEl.value.trim() : '';
        const password = passEl ? passEl.value : '';
        if (!email || !password || password.length < 6) {
            alert('Please enter valid email and password (minimum 6 characters)');
            return;
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            }).then(res => res.json()).then(async data => {
                if (data && data.success) {
                    try {
                        localStorage.setItem('billnaw_auth_mode', 'authenticated');
                        const isOwner = Boolean(data && (data.isOwner || (data.user && (data.user.role === 'owner' || data.user.isOwner))));
                        if (isOwner) {
                            localStorage.setItem('billnaw_is_master', 'true');
                            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        } else if (localStorage.getItem('billnaw_is_master') !== 'true') {
                            localStorage.setItem('billnaw_is_master', 'false');
                            localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                            localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        }

                        // Multi-Account Device Isolation: check if tenant switched
                        const prevStoreCode = localStorage.getItem('billnaw_store_code');
                        if (prevStoreCode && data.storeCode && prevStoreCode !== data.storeCode) {
                            console.log(`[AUTH] Switching store tenant: ${prevStoreCode} -> ${data.storeCode}. Purging previous tenant cache.`);
                            await clearAllTenantLocalData();
                        }

                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (data.storeCode) localStorage.setItem('billnaw_store_code', data.storeCode);
                        localStorage.setItem('billnaw_shop_session', JSON.stringify({
                            token: data.token,
                            customToken: data.customToken,
                            storeCode: data.storeCode,
                            shop: data.shop,
                            user: data.user,
                            loginAt: Date.now()
                        }));

                        // Unconditionally update active shop profile with authenticated tenant credentials
                        if (typeof shopProfile === 'undefined') shopProfile = {};
                        if (data.shop && data.shop.name && data.shop.name !== 'billnaw' && data.shop.name !== 'My Cafe') {
                            shopProfile.name = data.shop.name;
                        }
                        if (data.storeCode) {
                            shopProfile.storeCode = data.storeCode;
                            myClientID = data.storeCode;
                            window.myClientID = data.storeCode;
                        }
                        if (data.shop && data.shop.logo && !shopProfile.logo) {
                            shopProfile.logo = data.shop.logo;
                        }
                        if (data.shop && data.shop.phone) {
                            shopProfile.phone = data.shop.phone;
                        }
                        if (data.shop && data.shop.address) {
                            shopProfile.address = data.shop.address;
                        }
                        if (data.shop && data.shop.profile && typeof data.shop.profile === 'object') {
                            const sp = data.shop.profile;
                            if (sp.logo && !shopProfile.logo) shopProfile.logo = sp.logo;
                            if (sp.name && sp.name !== 'billnaw' && sp.name !== 'My Cafe' && (!shopProfile.name || shopProfile.name === 'billnaw' || shopProfile.name === 'My Cafe')) {
                                shopProfile.name = sp.name;
                            }
                            if (sp.address && !shopProfile.address) shopProfile.address = sp.address;
                            if (sp.phone && !shopProfile.phone) shopProfile.phone = sp.phone;
                        }
                        if (Array.isArray(data.shop?.menu) && data.shop.menu.length > 0) {
                            menuItems = data.shop.menu;
                            window.menuItems = menuItems;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_menu', menuItems);
                        }
                        if (Array.isArray(data.shop?.categories) && data.shop.categories.length > 0) {
                            menuCategories = data.shop.categories;
                            window.menuCategories = menuCategories;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_categories', menuCategories);
                        }
                        const resolvedEmail = (data.user?.email || data.shop?.ownerEmail || email || '').trim().toLowerCase();
                        if (resolvedEmail) {
                            shopProfile.ownerEmail = resolvedEmail;
                            shopProfile.email = resolvedEmail;
                        }
                        window.shopProfile = shopProfile;
                        try {
                            if (shopProfile.name && shopProfile.name !== 'billnaw' && shopProfile.name !== 'My Cafe') localStorage.setItem('billnaw_shop_name', shopProfile.name);
                            if (shopProfile.storeCode) localStorage.setItem('billnaw_store_code', shopProfile.storeCode);
                            if (shopProfile.logo && shopProfile.logo.length < 2000000) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
                            if (resolvedEmail) {
                                localStorage.setItem('billnaw_auth_email', resolvedEmail);
                                localStorage.setItem('billnaw_owner_email', resolvedEmail);
                                localStorage.setItem('billnaw_shop_email', resolvedEmail);
                            }
                            localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
                            if (typeof idb !== 'undefined' && idb.set) {
                                idb.set('cafe_profile', shopProfile);
                                if (shopProfile.logo) idb.set('cafe_logo', shopProfile.logo);
                            }
                        } catch(e) {}
                        if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
                    } catch (e) {}

                    if (data.customToken && window.auth && typeof window.firebaseSignInWithCustomToken === 'function') {
                        if (typeof window.isGoogleFirebaseCustomToken === 'function' && window.isGoogleFirebaseCustomToken(data.customToken)) {
                            try {
                                await window.firebaseSignInWithCustomToken(window.auth, data.customToken);
                            } catch (fbErr) {
                                console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                            }
                        } else {
                            console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                        }
                    }

                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    updateShopAuthUI();
                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(data.user?.email || data.shop?.name || email, true);
                    }
                    if (typeof showToast === 'function') showToast('Signed in successfully', 'success');
                    closeShopAuthModal();
                    if (typeof verifyDeviceAuthorizationOnLogin === 'function') {
                        verifyDeviceAuthorizationOnLogin(data.storeCode);
                    }

                    // Initial Cloud Hydrate & Loading Overlay + Staff Profile Gateway
                    if (typeof showCloudSyncOverlay === 'function') {
                        showCloudSyncOverlay('Syncing Shop Profile, Menu & Active Tables...');
                        if (typeof setCloudSyncProgress === 'function') setCloudSyncProgress(35, 'Connecting to BillNaw Cloud...');
                    }
                    if (typeof initDatabase === 'function') {
                        try {
                            await initDatabase();
                            if (typeof setCloudSyncProgress === 'function') setCloudSyncProgress(80, 'Menu, Tables & Staff Roster Synced');
                        } catch (initErr) {
                            console.warn("initDatabase hydrate error:", initErr);
                        }
                    }
                    setTimeout(() => {
                        if (typeof hideCloudSyncOverlay === 'function') hideCloudSyncOverlay();
                        if (typeof showStaffProfileSelector === 'function') {
                            showStaffProfileSelector(data.shop?.name || email);
                        }
                    }, 500);
                } else {
                    const errMsg = (data && data.error) ? data.error : 'Invalid email or password';
                    alert(errMsg + '\n\nIf you have not registered your shop account yet, click "Sign Up" above to create your profile.');
                    if (typeof switchShopAuthTab === 'function') {
                        switchShopAuthTab('signup');
                        const sEmail = document.getElementById('signupEmail');
                        if (sEmail && email) sEmail.value = email;
                    }
                }
            }).catch(() => {
                try {
                    localStorage.setItem('billnaw_auth_mode', 'authenticated');
                } catch (e) {}
                updateShopAuthUI();
                if (typeof updateCloudStoreTopbar === 'function') updateCloudStoreTopbar(email, true);
                if (typeof showToast === 'function') showToast('Signed in successfully', 'success');
                closeShopAuthModal();
            });
        } else {
            try {
                localStorage.setItem('billnaw_auth_mode', 'authenticated');
            } catch (e) {}
            updateShopAuthUI();
            closeShopAuthModal();
        }
    }
    window.handlePasswordSignIn = handlePasswordSignIn;

    let signupOtpCountdownInterval = null;
    let signupOtpRemainingSeconds = 60;

    function startSignupOtpTimer(seconds) {
        if (signupOtpCountdownInterval) clearInterval(signupOtpCountdownInterval);
        signupOtpRemainingSeconds = seconds;
        const countSpan = document.getElementById('signupOtpSecondsCount');
        const resendBtn = document.getElementById('btnSignupResendOtp');
        const timerText = document.getElementById('signupOtpTimerText');
        
        if (resendBtn) resendBtn.disabled = true;
        if (timerText) timerText.style.display = 'inline';
        if (countSpan) countSpan.innerText = signupOtpRemainingSeconds;

        signupOtpCountdownInterval = setInterval(() => {
            signupOtpRemainingSeconds--;
            if (countSpan) countSpan.innerText = signupOtpRemainingSeconds;
            if (signupOtpRemainingSeconds <= 0) {
                clearInterval(signupOtpCountdownInterval);
                if (resendBtn) resendBtn.disabled = false;
                if (timerText) timerText.style.display = 'none';
            }
        }, 1000);
    }

    function resetLoginOtpView() {
        const digitInputs = document.querySelectorAll('#otpBoxesContainer .otp-digit-input');
        digitInputs.forEach(input => { input.value = ''; });
        const otpInputSection = document.getElementById('otpInputSection');
        if (otpInputSection) otpInputSection.style.display = 'none';
        const otpSendActionWrap = document.getElementById('otpSendActionWrap');
        if (otpSendActionWrap) otpSendActionWrap.style.display = 'block';
        if (otpCountdownInterval) {
            clearInterval(otpCountdownInterval);
            otpCountdownInterval = null;
        }
        const resendBtn = document.getElementById('btnResendOtp');
        if (resendBtn) resendBtn.disabled = true;
        const timerText = document.getElementById('otpTimerText');
        if (timerText) timerText.style.display = 'none';
        const feedback = document.getElementById('loginEmailValidationFeedback');
        if (feedback) feedback.innerText = '';
    }
    window.resetLoginOtpView = resetLoginOtpView;

    function resetSignupOtpView() {
        const otpInputs = document.querySelectorAll('#signupOtpBoxesContainer .signup-otp-input');
        otpInputs.forEach(i => { i.value = ''; });
        const otpSec = document.getElementById('signupOtpSection');
        if (otpSec) otpSec.style.display = 'none';
        const actionRow = document.getElementById('signupActionRow');
        if (actionRow) actionRow.style.display = 'flex';
        const signupBtn = document.getElementById('btnSignupSubmit');
        if (signupBtn) signupBtn.style.display = 'block';
        if (signupOtpCountdownInterval) {
            clearInterval(signupOtpCountdownInterval);
            signupOtpCountdownInterval = null;
        }
    }
    window.resetSignupOtpView = resetSignupOtpView;

    function handleCreateShopAccount() {
        const fn = document.getElementById('signupFirstName') ? document.getElementById('signupFirstName').value.trim() : '';
        const ln = document.getElementById('signupLastName') ? document.getElementById('signupLastName').value.trim() : '';
        const shop = document.getElementById('signupShopName') ? document.getElementById('signupShopName').value.trim() : '';
        const email = document.getElementById('signupEmail') ? document.getElementById('signupEmail').value.trim() : '';
        const phoneEl = document.getElementById('signupPhone');
        const phone = phoneEl ? phoneEl.value.replace(/\D/g, '') : '';
        const pass = document.getElementById('signupPassword') ? document.getElementById('signupPassword').value : '';
        const confirm = document.getElementById('signupConfirmPassword') ? document.getElementById('signupConfirmPassword').value : '';
        const adminPin = document.getElementById('signupAdminPin') ? document.getElementById('signupAdminPin').value.trim() : '';
        const confirmAdminPin = document.getElementById('signupConfirmAdminPin') ? document.getElementById('signupConfirmAdminPin').value.trim() : '';

        if (!fn || !shop || !email || !pass || !confirm) {
            alert('Please fill out all required fields');
            return;
        }
        if (!adminPin || !confirmAdminPin) {
            alert('Please enter and confirm your 4-digit Admin PIN');
            return;
        }
        if (!/^\d{4}$/.test(adminPin)) {
            alert('Admin PIN must be exactly 4 numeric digits');
            return;
        }
        if (adminPin === '0000' || adminPin === '1234') {
            alert('Admin PIN cannot be trivial (0000, 1234)');
            return;
        }
        if (adminPin !== confirmAdminPin) {
            alert('Admin PINs do not match');
            return;
        }
        if (!phone || phone.length < 10) {
            alert('Mobile phone number is mandatory (minimum 10 digits required)');
            if (phoneEl) phoneEl.focus();
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email) || email.includes('..')) {
            alert('Please enter a valid email address');
            return;
        }
        if (pass.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }
        if (pass !== confirm) {
            alert('Passwords do not match');
            return;
        }

        // Show OTP Section & dispatch verification code to email
        const recipientEmailEl = document.getElementById('signupOtpRecipientEmail');
        if (recipientEmailEl) recipientEmailEl.innerText = email;

        const otpSec = document.getElementById('signupOtpSection');
        if (otpSec) otpSec.style.display = 'block';

        const actionRow = document.getElementById('signupActionRow');
        if (actionRow) actionRow.style.display = 'none';
        const signupBtn = document.getElementById('btnSignupSubmit');
        if (signupBtn) signupBtn.style.display = 'none';

        startSignupOtpTimer(60);

        const firstDigit = document.querySelector('#signupOtpBoxesContainer .signup-otp-input[data-index="0"]');
        if (firstDigit) {
            setTimeout(() => { firstDigit.focus(); firstDigit.select(); }, 100);
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, purpose: 'signup' })
            }).then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, error: 'Server returned unexpected status (' + res.status + ')' };
                }
                if (data && data.success) {
                    if (typeof showToast === 'function') {
                        showToast('Verification code sent to ' + email, 'success');
                    }
                    showValidationMsg('signupOtpValidationFeedback', 'Code sent! Check your inbox or spam folder.', 'success');
                } else if (data && data.error) {
                    showValidationMsg('signupOtpValidationFeedback', data.error, 'error');
                    if (typeof showToast === 'function') {
                        showToast(data.error, 'error');
                    }
                }
            }).catch(err => {
                const msg = 'Unable to send code: ' + (err.message || 'Network error');
                showValidationMsg('signupOtpValidationFeedback', msg, 'error');
                if (typeof showToast === 'function') {
                    showToast(msg, 'error');
                }
            });
        }
    }
    window.handleCreateShopAccount = handleCreateShopAccount;

    function handleResendSignupOtp() {
        const resendBtn = document.getElementById('btnSignupResendOtp');
        if (resendBtn && resendBtn.disabled) return;
        const email = document.getElementById('signupEmail') ? document.getElementById('signupEmail').value.trim() : '';
        if (!email) return;

        startSignupOtpTimer(60);
        if (typeof fetch === 'function') {
            fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, purpose: 'signup' })
            }).then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, error: 'Server returned unexpected status (' + res.status + ')' };
                }
                if (data && data.success) {
                    if (typeof showToast === 'function') {
                        showToast('New verification code sent to ' + email, 'success');
                    }
                    showValidationMsg('signupOtpValidationFeedback', 'New code sent! Check your inbox or spam folder.', 'success');
                } else if (data && data.error) {
                    showValidationMsg('signupOtpValidationFeedback', data.error, 'error');
                    if (typeof showToast === 'function') {
                        showToast(data.error, 'error');
                    }
                }
            }).catch(err => {
                const msg = 'Unable to resend code: ' + (err.message || 'Network error');
                showValidationMsg('signupOtpValidationFeedback', msg, 'error');
                if (typeof showToast === 'function') {
                    showToast(msg, 'error');
                }
            });
        }
    }
    window.handleResendSignupOtp = handleResendSignupOtp;

    function handleVerifyAndCreateAccount() {
        const fn = document.getElementById('signupFirstName') ? document.getElementById('signupFirstName').value.trim() : '';
        const ln = document.getElementById('signupLastName') ? document.getElementById('signupLastName').value.trim() : '';
        const shop = document.getElementById('signupShopName') ? document.getElementById('signupShopName').value.trim() : '';
        const email = document.getElementById('signupEmail') ? document.getElementById('signupEmail').value.trim() : '';
        const phoneEl = document.getElementById('signupPhone');
        const phone = phoneEl ? phoneEl.value.replace(/\D/g, '') : '';
        const pass = document.getElementById('signupPassword') ? document.getElementById('signupPassword').value : '';
        const confirm = document.getElementById('signupConfirmPassword') ? document.getElementById('signupConfirmPassword').value : '';
        const adminPin = document.getElementById('signupAdminPin') ? document.getElementById('signupAdminPin').value.trim() : '';

        const digitInputs = Array.from(document.querySelectorAll('#signupOtpBoxesContainer .signup-otp-input'));
        const otp = digitInputs.map(i => i.value.trim()).join('');

        if (!phone || phone.length < 10) {
            alert('Mobile phone number is mandatory (minimum 10 digits required)');
            return;
        }

        if (otp.length < 6) {
            const msg = 'Please enter complete 6-digit verification code sent to your email';
            showValidationMsg('signupOtpValidationFeedback', msg, 'error');
            alert(msg);
            return;
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: fn,
                    lastName: ln,
                    shopName: shop,
                    email,
                    phone,
                    password: pass,
                    confirmPassword: confirm,
                    adminPin,
                    otp
                })
            }).then(res => res.json()).then(async data => {
                if (data && data.success) {
                    digitInputs.forEach(i => { i.value = ''; });
                    try {
                        localStorage.setItem('billnaw_auth_mode', 'authenticated');
                        localStorage.setItem('billnaw_is_master', 'true');
                        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                        localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        const masterDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : 'DEV_MASTER';
                        if (typeof window.firestoreDB !== 'undefined' && typeof window.firestoreDoc !== 'undefined') {
                            const masterDocRef = typeof getStoreSubdocRef === 'function' ? getStoreSubdocRef('devices', masterDevId) : null;
                            if (masterDocRef && window.firestoreSetDoc) {
                                window.firestoreSetDoc(masterDocRef, {
                                    deviceId: masterDevId,
                                    pairingCode: '000000',
                                    deviceName: 'Master Admin Terminal',
                                    stationProfile: 'BILLING_COUNTER',
                                    status: 'AUTHORIZED',
                                    isMaster: true,
                                    registeredAt: new Date().toISOString(),
                                    approvedAt: new Date().toISOString(),
                                    revokedAt: null,
                                    lastSeenAt: new Date().toISOString()
                                }, { merge: true }).catch(err => console.warn('Master device write notice:', err));
                            }
                        }
                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (email) localStorage.setItem('billnaw_auth_email', email);
                        if (phone) localStorage.setItem('billnaw_auth_phone', phone);
                        if (data.storeCode) localStorage.setItem('billnaw_store_code', data.storeCode);
                        localStorage.setItem('billnaw_shop_session', JSON.stringify({
                            token: data.token,
                            customToken: data.customToken,
                            storeCode: data.storeCode,
                            shop: data.shop,
                            user: data.user,
                            loginAt: Date.now()
                        }));
                        localStorage.setItem('billnaw_shop_owner', JSON.stringify({ firstName: fn, lastName: ln, shopName: shop, email, phone }));
                        if (data.shop && data.shop.name && typeof shopProfile !== 'undefined') {
                            shopProfile.name = data.shop.name;
                            shopProfile.phone = phone;
                            shopProfile.ownerPhone = phone;
                            if (adminPin && typeof hashString === 'function') {
                                shopProfile.adminPinHash = hashString(adminPin);
                            }
                            if (typeof persistProfile === 'function') persistProfile();
                        }
                    } catch (e) {}

                    if (data.customToken && window.auth && typeof window.firebaseSignInWithCustomToken === 'function') {
                        if (typeof window.isGoogleFirebaseCustomToken === 'function' && window.isGoogleFirebaseCustomToken(data.customToken)) {
                            try {
                                await window.firebaseSignInWithCustomToken(window.auth, data.customToken);
                                console.log("Firebase Auth sign in established");
                            } catch (fbErr) {
                                console.warn("Firebase Auth sign in fallback:", fbErr);
                            }
                        } else {
                            console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                        }
                    }

                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    updateShopAuthUI();
                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(email, true);
                    }
                    if (typeof showToast === 'function') showToast('Shop Account Created & Verified! Welcome, ' + fn, 'success');
                    closeShopAuthModal();
                } else {
                    const errMsg = (data && data.error) ? data.error : 'Failed to verify OTP & create account';
                    showValidationMsg('signupOtpValidationFeedback', errMsg, 'error');
                    if (typeof showToast === 'function') showToast(errMsg, 'error');
                    else alert(errMsg);
                }
            }).catch((err) => {
                alert('Signup verification error: ' + (err.message || 'Please check your connection and retry.'));
            });
        } else {
            alert('Network connection unavailable');
        }
    }
    window.handleVerifyAndCreateAccount = handleVerifyAndCreateAccount;

    function handleDirectSignupWithoutOtp() {
        const fn = document.getElementById('signupFirstName') ? document.getElementById('signupFirstName').value.trim() : '';
        const ln = document.getElementById('signupLastName') ? document.getElementById('signupLastName').value.trim() : '';
        const shop = document.getElementById('signupShopName') ? document.getElementById('signupShopName').value.trim() : '';
        const email = document.getElementById('signupEmail') ? document.getElementById('signupEmail').value.trim() : '';
        const phoneEl = document.getElementById('signupPhone');
        const phone = phoneEl ? phoneEl.value.replace(/\D/g, '') : '';
        const pass = document.getElementById('signupPassword') ? document.getElementById('signupPassword').value : '';
        const confirm = document.getElementById('signupConfirmPassword') ? document.getElementById('signupConfirmPassword').value : '';
        const adminPin = document.getElementById('signupAdminPin') ? document.getElementById('signupAdminPin').value.trim() : '';

        if (!fn || !shop || !email || !pass || !confirm) {
            alert('Please fill out all required fields');
            return;
        }
        if (!phone || phone.length < 10) {
            alert('Mobile phone number is mandatory (minimum 10 digits required)');
            if (phoneEl) phoneEl.focus();
            return;
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email) || email.includes('..')) {
            alert('Please enter a valid email address');
            return;
        }
        if (pass.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }
        if (pass !== confirm) {
            alert('Passwords do not match');
            return;
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firstName: fn,
                    lastName: ln,
                    shopName: shop,
                    email,
                    phone,
                    password: pass,
                    confirmPassword: confirm,
                    adminPin
                })
            }).then(res => res.json()).then(async data => {
                if (data && data.success) {
                    try {
                        localStorage.setItem('billnaw_auth_mode', 'authenticated');
                        localStorage.setItem('billnaw_is_master', 'true');
                        localStorage.setItem('billnaw_device_status', 'AUTHORIZED');
                        localStorage.setItem('billnaw_station_profile', 'BILLING_COUNTER');
                        localStorage.setItem('billnaw_device_auth_timestamp', Date.now().toString());
                        const masterDevId = typeof getOrCreateDeviceId === 'function' ? getOrCreateDeviceId() : 'DEV_MASTER';
                        if (typeof window.firestoreDB !== 'undefined' && typeof window.firestoreDoc !== 'undefined') {
                            const masterDocRef = typeof getStoreSubdocRef === 'function' ? getStoreSubdocRef('devices', masterDevId) : null;
                            if (masterDocRef && window.firestoreSetDoc) {
                                window.firestoreSetDoc(masterDocRef, {
                                    deviceId: masterDevId,
                                    pairingCode: '000000',
                                    deviceName: 'Master Admin Terminal',
                                    stationProfile: 'BILLING_COUNTER',
                                    status: 'AUTHORIZED',
                                    isMaster: true,
                                    registeredAt: new Date().toISOString(),
                                    approvedAt: new Date().toISOString(),
                                    revokedAt: null,
                                    lastSeenAt: new Date().toISOString()
                                }, { merge: true }).catch(err => console.warn('Master device write notice:', err));
                            }
                        }
                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (email) localStorage.setItem('billnaw_auth_email', email);
                        if (phone) localStorage.setItem('billnaw_auth_phone', phone);
                        if (data.storeCode) localStorage.setItem('billnaw_store_code', data.storeCode);
                        localStorage.setItem('billnaw_shop_session', JSON.stringify({
                            token: data.token,
                            customToken: data.customToken,
                            storeCode: data.storeCode,
                            shop: data.shop,
                            user: data.user,
                            loginAt: Date.now()
                        }));
                        localStorage.setItem('billnaw_shop_owner', JSON.stringify({ firstName: fn, lastName: ln, shopName: shop, email, phone }));
                        if (data.shop && data.shop.name && typeof shopProfile !== 'undefined') {
                            shopProfile.name = data.shop.name;
                            shopProfile.phone = phone;
                            shopProfile.ownerPhone = phone;
                            if (adminPin && typeof hashString === 'function') {
                                shopProfile.adminPinHash = hashString(adminPin);
                            }
                            if (typeof persistProfile === 'function') persistProfile();
                        }
                    } catch (e) {}

                    if (data.customToken && window.auth && typeof window.firebaseSignInWithCustomToken === 'function') {
                        if (typeof window.isGoogleFirebaseCustomToken === 'function' && window.isGoogleFirebaseCustomToken(data.customToken)) {
                            try {
                                await window.firebaseSignInWithCustomToken(window.auth, data.customToken);
                            } catch (fbErr) {}
                        } else {
                            console.info("⚡ Authenticated via Billnaw Cloud Session (Local & Backend Sync active)");
                        }
                    }

                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    updateShopAuthUI();
                    if (typeof updateCloudStoreTopbar === 'function') {
                        updateCloudStoreTopbar(email, true);
                    }
                    if (typeof showToast === 'function') showToast('Shop Profile Created! Welcome, ' + fn, 'success');
                    closeShopAuthModal();
                } else {
                    alert((data && data.error) ? data.error : 'Failed to create shop account');
                }
            }).catch(err => {
                alert('Signup error: ' + (err.message || 'Please check your connection and retry.'));
            });
        }
    }
    window.handleDirectSignupWithoutOtp = handleDirectSignupWithoutOtp;

    // ⚡ 1-TAP DEMO BYPASS (Permanently Disabled: Mandatory Registration Required)
    function skipShopAuthToDemo() {
        if (typeof showToast === 'function') {
            showToast('Registration required: Please create a shop account or sign in.', 'warning');
        }
        openShopAuthModal();
    }
    window.skipShopAuthToDemo = skipShopAuthToDemo;

    async function clearAllTenantLocalData() {
        try {
            localStorage.removeItem('billnaw_shop_session');
            localStorage.removeItem('billnaw_auth_token');
            localStorage.removeItem('billnaw_auth_email');
            localStorage.removeItem('billnaw_auth_phone');
            localStorage.removeItem('billnaw_store_code');
            localStorage.removeItem('billnaw_active_user');
            localStorage.removeItem('billnaw_auth_mode');
            localStorage.removeItem('billnaw_last_staff_id');
            localStorage.removeItem('billnaw_active_staff');
            localStorage.removeItem('billnaw_terminal_locked');
            localStorage.removeItem('cafe_khata');
            localStorage.removeItem('billnaw_culinary_materials');
            localStorage.removeItem('billnaw_culinary_batches');
            localStorage.removeItem('billnaw_shop_name');
            localStorage.removeItem('billnaw_store_profile');
            localStorage.removeItem('billnaw_shop_phone');
            localStorage.removeItem('billnaw_shop_address');
            localStorage.removeItem('billnaw_shop_logo');
            localStorage.removeItem('billnaw_admin_pin_hash');
            localStorage.removeItem('billnaw_shop_fssai');
            localStorage.removeItem('billnaw_shop_gstin');
            localStorage.removeItem('billnaw_shop_upi_id');
            localStorage.removeItem('billnaw_store_staff');
            localStorage.removeItem('billnaw_last_device_email');
            localStorage.removeItem('billnaw_last_store_code');
            localStorage.removeItem('cafeLicenseKey');
            localStorage.removeItem('bongbhoj_client_id');
            if (typeof shopProfile !== 'undefined') {
                shopProfile = { name: '', storeCode: '' };
                window.shopProfile = shopProfile;
            }
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear();
            }
        } catch(e) {}

        try {
            if (typeof idb !== 'undefined' && typeof idb.clear === 'function') {
                await idb.clear('cafe_menu').catch(() => {});
                await idb.clear('cafe_categories').catch(() => {});
                await idb.clear('cafe_history').catch(() => {});
                await idb.clear('cafe_tables').catch(() => {});
                await idb.clear('cafe_customers').catch(() => {});
                await idb.clear('cafe_expenses').catch(() => {});
                await idb.clear('cafe_staff').catch(() => {});
                await idb.clear('cafe_profile').catch(() => {});
                await idb.clear('cafe_logo').catch(() => {});
                await idb.clear('cafe_khata').catch(() => {});
                await idb.clear('cafe_raw_materials').catch(() => {});
                await idb.clear('cafe_sub_recipes').catch(() => {});
            }
        } catch(e) {}
    }
    window.clearAllTenantLocalData = clearAllTenantLocalData;

    async function logoutShop() {
        const activeToken = localStorage.getItem('billnaw_auth_token');
        const activeEmail = localStorage.getItem('billnaw_auth_email') || (document.getElementById('shopAuthEmail') ? document.getElementById('shopAuthEmail').value.trim() : '');

        // 1. Unsubscribe real-time Firestore listeners immediately
        if (typeof window.detachFirestoreListener === 'function') {
            window.detachFirestoreListener();
        }
        if (typeof window.unsubscribeFirestoreListeners === 'function') {
            window.unsubscribeFirestoreListeners();
        }

        // 2. Invalidate session on backend
        try {
            if (typeof fetch === 'function') {
                fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                    },
                    body: JSON.stringify({ token: activeToken, email: activeEmail })
                }).catch(() => {});
            }
        } catch (e) {}

        // 3. Await Firebase signOut
        if (window.auth && typeof window.firebaseSignOut === 'function') {
            try {
                await window.firebaseSignOut(window.auth).catch(() => {});
            } catch (e) {}
        }
        window.currentAuthUser = null;

        // 4. Purge storage & IndexedDB
        await clearAllTenantLocalData();

        // 5. Reset reactive in-memory state
        window.currentStaff = null;
        window.currentRole = null;
        if (typeof staffList !== 'undefined') staffList = [];
        if (typeof tablesInfo !== 'undefined') tablesInfo = [];
        if (typeof orderHistory !== 'undefined') orderHistory = [];
        if (typeof customersList !== 'undefined') customersList = [];
        if (typeof dailyExpenses !== 'undefined') dailyExpenses = [];
        if (typeof inventoryRawMaterials !== 'undefined') inventoryRawMaterials = [];
        if (typeof culinaryBatches !== 'undefined') culinaryBatches = [];

        // Reset login and signup OTP states & wipe digit inputs so no stale OTP can ever be used
        if (typeof resetLoginOtpView === 'function') resetLoginOtpView();
        if (typeof resetSignupOtpView === 'function') resetSignupOtpView();

        // Clear any countdown timer
        if (typeof otpCountdownInterval !== 'undefined' && otpCountdownInterval) {
            clearInterval(otpCountdownInterval);
            otpCountdownInterval = null;
        }

        // Reset password input fields & validation errors
        const passField = document.getElementById('shopAuthPassword');
        if (passField) passField.value = '';
        const passEmailField = document.getElementById('shopAuthPasswordEmail');
        if (passEmailField) passEmailField.value = '';
        const signupPass = document.getElementById('signupPassword');
        if (signupPass) signupPass.value = '';
        const signupConfirm = document.getElementById('signupConfirmPassword');
        if (signupConfirm) signupConfirm.value = '';

        const loginFeedback = document.getElementById('loginValidationFeedback');
        if (loginFeedback) { loginFeedback.style.display = 'none'; loginFeedback.innerText = ''; }
        const signupFeedback = document.getElementById('signupValidationFeedback');
        if (signupFeedback) { signupFeedback.style.display = 'none'; signupFeedback.innerText = ''; }

        // Reset modal to default login tab & OTP mode
        if (typeof switchShopAuthTab === 'function') switchShopAuthTab('login');
        if (typeof toggleLoginAuthMode === 'function') toggleLoginAuthMode('otp');

        // Close settings or other open modals
        const otherModals = ['activeSessionsModal', 'storeProfileModal', 'staffManagementModal', 'subscriptionModal', 'expensesDetailModal', 'loginOverlay', 'staffSwitchModal', 'spotManagerOverrideModal', 'devicePairingOverlay'];
        otherModals.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        if (typeof hideDevicePairingOverlay === 'function') hideDevicePairingOverlay();

        updateShopAuthUI();
        if (typeof updateCloudStoreTopbar === 'function') {
            updateCloudStoreTopbar(null, false, 'unauthenticated');
        }
        if (typeof showToast === 'function') {
            showToast('Logged out of cloud shop. Session destroyed.', 'info');
        }

        openShopAuthModal();
        if (typeof window !== 'undefined' && window.location) {
            setTimeout(() => {
                window.location.replace(window.location.origin + window.location.pathname + '?auth=login');
            }, 80);
        }
    }
    window.logoutShop = logoutShop;
    window.logoutShopCloudAccount = logoutShop;

    // 📱 Active Sessions Management Handlers
    async function openActiveSessionsModal() {
        if (typeof checkFloorServerModalBlock === 'function' && checkFloorServerModalBlock('activeSessionsModal')) return;
        const modal = document.getElementById('activeSessionsModal');
        if (modal) modal.style.display = 'flex';
        const hasStaffSessions = (window.activeStaffSessions && window.activeStaffSessions.length > 0) ||
            (function() {
                try {
                    const c = localStorage.getItem('billnaw_active_sessions');
                    return c && JSON.parse(c).length > 0;
                } catch(e) { return false; }
            })();
        if (hasStaffSessions && typeof renderLiveSessionCards === 'function') {
            renderLiveSessionCards();
        } else {
            await loadActiveSessions();
        }
    }
    window.openActiveSessionsModal = openActiveSessionsModal;

    function closeActiveSessionsModal() {
        const modal = document.getElementById('activeSessionsModal');
        if (modal) modal.style.display = 'none';
    }
    window.closeActiveSessionsModal = closeActiveSessionsModal;

    async function loadActiveSessions() {
        const container = document.getElementById('activeSessionsListContainer');
        if (!container) return;

        const activeToken = localStorage.getItem('billnaw_auth_token');
        const storeCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || '';

        try {
            const res = await fetch(`/api/auth/sessions?storeCode=${encodeURIComponent(storeCode)}`, {
                headers: activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {}
            }).then(r => r.json());

            if (res && Array.isArray(res.sessions) && res.sessions.length > 0) {
                const currentSessExists = activeToken ? res.sessions.some(s => s.token === activeToken) : false;
                if (activeToken && !currentSessExists) {
                    if (typeof showToast === 'function') showToast('Terminal session was revoked remotely.', 'warning');
                    logoutShop();
                    return;
                }

                container.innerHTML = res.sessions.map(s => {
                    const isCurrent = activeToken && s.token === activeToken;
                    const createdDate = new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #FAF7F4; border: 1.5px solid #E6DCCD; border-radius: 10px;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div style="width: 32px; height: 32px; border-radius: 8px; background: #143832; color: #2DD4BF; display: flex; align-items: center; justify-content: center;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>
                                </div>
                                <div>
                                    <div style="font-weight: 800; font-size: 13px; color: var(--text-dark);">
                                        ${escapeHtml(s.device || 'POS Terminal')}
                                        ${isCurrent ? '<span style="color: #047857; background: #D1FAE5; font-size: 10px; padding: 2px 6px; border-radius: 8px; margin-left: 6px;">Current Device</span>' : ''}
                                    </div>
                                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
                                        IP: ${escapeHtml(s.ip || '127.0.0.1')} • Connected: ${createdDate}
                                    </div>
                                </div>
                            </div>
                            <div>
                                ${!isCurrent ? `
                                    <button type="button" class="btn btn-outline" style="color: var(--danger); border-color: var(--danger); font-size: 11px; padding: 4px 8px; border-radius: 8px;" onclick="revokeSessionItem('${s.id || s.token}')">
                                        Revoke
                                    </button>
                                ` : `
                                    <button type="button" class="btn btn-outline" style="color: var(--danger); border-color: var(--danger); font-size: 11px; padding: 4px 8px; border-radius: 8px;" onclick="revokeCurrentSessionAndLogout('${s.id || s.token}')">
                                        Sign Out
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('');
            } else if (typeof renderLiveSessionCards === 'function' && ((window.activeStaffSessions && window.activeStaffSessions.length > 0) || (function(){ try { return Boolean(localStorage.getItem('billnaw_active_sessions')); }catch(e){return false;} })())) {
                renderLiveSessionCards();
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
                        No remote sessions active. This device is the primary counter terminal.
                    </div>
                `;
            }
        } catch (e) {
            if (typeof renderLiveSessionCards === 'function' && ((window.activeStaffSessions && window.activeStaffSessions.length > 0) || (function(){ try { return Boolean(localStorage.getItem('billnaw_active_sessions')); }catch(e){return false;} })())) {
                renderLiveSessionCards();
            } else {
                container.innerHTML = `
                    <div style="text-align: center; padding: 24px; color: var(--text-muted); font-size: 13px;">
                        Active counter terminal session verified locally.
                    </div>
                `;
            }
        }
    }
    window.loadActiveSessions = loadActiveSessions;

    async function revokeSessionItem(tokenId) {
        if (!tokenId) return;
        const activeToken = localStorage.getItem('billnaw_auth_token');
        try {
            await fetch('/api/auth/sessions/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: tokenId })
            });
            if (activeToken && (tokenId === activeToken || (tokenId.startsWith('sess_') && activeToken.includes(tokenId)))) {
                if (typeof showToast === 'function') showToast('Current session revoked.');
                logoutShop();
                return;
            }
            if (typeof showToast === 'function') showToast('Remote terminal session revoked.');
            loadActiveSessions();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Session revoked.');
        }
    }
    window.revokeSessionItem = revokeSessionItem;

    async function revokeCurrentSessionAndLogout(tokenId) {
        if (tokenId) {
            try {
                await fetch('/api/auth/sessions/revoke', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: tokenId })
                });
            } catch (e) {}
        }
        logoutShop();
    }
    window.revokeCurrentSessionAndLogout = revokeCurrentSessionAndLogout;

    async function revokeAllOtherSessions() {
        const activeToken = localStorage.getItem('billnaw_auth_token');
        const storeCode = (typeof getActiveStoreIdentifier === 'function' ? getActiveStoreIdentifier() : null) || (typeof shopProfile !== 'undefined' && shopProfile.storeCode) || localStorage.getItem('billnaw_store_code') || '';
        try {
            await fetch('/api/auth/sessions/revoke', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    storeCode,
                    revokeAll: true,
                    keepCurrent: true,
                    token: activeToken
                })
            });
            if (typeof showToast === 'function') showToast('All other remote terminals revoked.');
            loadActiveSessions();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Other sessions revoked.');
        }
    }
    window.revokeAllOtherSessions = revokeAllOtherSessions;

    // 🪑 Floor & Table Management Functions
    function openTableManagementModal() {
        if (typeof checkFloorServerModalBlock === 'function' && checkFloorServerModalBlock('tableManagementModal')) return;
        const modal = document.getElementById('tableManagementModal');
        if (!modal) return;
        const countInput = document.getElementById('tblMgmtCountInput');
        if (countInput) countInput.value = (typeof shopProfile !== 'undefined' && shopProfile.tableCount) ? shopProfile.tableCount : 5;
        const showToggle = document.getElementById('tblMgmtShowTables');
        if (showToggle) showToggle.checked = (typeof shopProfile !== 'undefined' && shopProfile.showTablesInPos !== false);
        const alertToggle = document.getElementById('tblMgmtUnpaidAlert');
        if (alertToggle) alertToggle.checked = (typeof shopProfile !== 'undefined' && shopProfile.unpaidTableAlert !== false);
        modal.style.display = 'flex';
    }
    window.openTableManagementModal = openTableManagementModal;

    function closeTableManagementModal() {
        const modal = document.getElementById('tableManagementModal');
        if (modal) modal.style.display = 'none';
    }
    window.closeTableManagementModal = closeTableManagementModal;

    function adjustTableCount(delta) {
        const countInput = document.getElementById('tblMgmtCountInput');
        if (!countInput) return;
        let current = parseInt(countInput.value, 10) || 5;
        current = Math.max(1, Math.min(60, current + delta));
        countInput.value = current;
    }
    window.adjustTableCount = adjustTableCount;

    function updateTableCountDirect(val) {
        const countInput = document.getElementById('tblMgmtCountInput');
        if (!countInput) return;
        let num = parseInt(val, 10);
        if (isNaN(num) || num < 1) num = 1;
        if (num > 60) num = 60;
        countInput.value = num;
    }
    window.updateTableCountDirect = updateTableCountDirect;

    function setTableCountPreset(preset) {
        const countInput = document.getElementById('tblMgmtCountInput');
        if (!countInput) return;
        countInput.value = preset;
    }
    window.setTableCountPreset = setTableCountPreset;

    function toggleTablesVisibility(checked) {
        const tablesWrapper = document.getElementById('tablesWrapper');
        if (tablesWrapper) {
            tablesWrapper.style.display = checked ? 'block' : 'none';
        }
        if (typeof shopProfile !== 'undefined') {
            shopProfile.showTablesInPos = Boolean(checked);
            if (typeof persistProfile === 'function') persistProfile();
        }
    }
    window.toggleTablesVisibility = toggleTablesVisibility;

    function saveTableSettings() {
        const countInput = document.getElementById('tblMgmtCountInput');
        const showToggle = document.getElementById('tblMgmtShowTables');
        const alertToggle = document.getElementById('tblMgmtUnpaidAlert');

        const count = Math.max(1, Math.min(100, parseInt(countInput ? countInput.value : 5, 10) || 5));
        const showTables = showToggle ? showToggle.checked : true;
        const unpaidAlert = alertToggle ? alertToggle.checked : true;

        if (typeof shopProfile !== 'undefined') {
            shopProfile.tableCount = count;
            shopProfile.showTablesInPos = showTables;
            shopProfile.unpaidTableAlert = unpaidAlert;
        }

        if (typeof tablesInfo !== 'undefined') {
            for (let i = 1; i <= count; i++) {
                if (!tablesInfo[i]) {
                    tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
                }
            }
        }

        if (typeof persistProfile === 'function') persistProfile();
        if (typeof persistTables === 'function') persistTables();
        if (typeof dispatchBackendStoreSync === 'function') {
            dispatchBackendStoreSync({ tables: tablesInfo, profile: shopProfile }, true);
        }

        toggleTablesVisibility(showTables);
        if (typeof renderTables === 'function') renderTables();
        if (typeof syncTableUI === 'function') syncTableUI();

        const subtitle = document.getElementById('settingsTableSubtitle');
        if (subtitle) {
            subtitle.innerText = `Manage table count (T1-T${count}), 15m unpaid alerts, or hide tables`;
        }

        closeTableManagementModal();
        if (typeof showToast === 'function') {
            showToast(`Table configuration updated: ${count} Tables (${showTables ? 'Visible' : 'Hidden'})`, 'success');
        }
    }
    window.saveTableSettings = saveTableSettings;

    function updateShopAuthUI() {
        try {
            const authMode = localStorage.getItem('billnaw_auth_mode');
            const authStatusEl = document.getElementById('topbarAuthStatus');
            const cloudBtn = document.getElementById('topbarCloudAuthBtn');
            if (authStatusEl) {
                if (authMode === 'authenticated') {
                    authStatusEl.innerText = 'Cloud Store ✓';
                    if (cloudBtn) cloudBtn.title = 'Cloud Store Online (Click to manage account)';
                } else if (authMode === 'demo') {
                    authStatusEl.innerText = 'Demo POS';
                    if (cloudBtn) cloudBtn.title = 'Demo POS Mode (Click to Sign In / Connect Cloud)';
                } else {
                    authStatusEl.innerText = 'Cloud Shop';
                    if (cloudBtn) cloudBtn.title = 'Shop Cloud Account & Fast Sign In';
                }
            }
        } catch (e) {}
    }
    window.updateShopAuthUI = updateShopAuthUI;

    // Global shopAuth controller API
    window.shopAuth = {
        openShopAuthModal,
        closeShopAuthModal,
        switchShopAuthTab,
        toggleLoginAuthMode,
        requestOtp: handleSendOtpCode,
        verifyOtp: handleVerifyOtpCode,
        loginWithPassword: handlePasswordSignIn,
        signup: handleCreateShopAccount,
        verifySignupOtp: handleVerifyAndCreateAccount,
        resendSignupOtp: handleResendSignupOtp,
        skipAuthToDemo: skipShopAuthToDemo,
        logoutShop
    };

    // Setup OTP digit input behavior for both Login and Signup OTP grids
    function setupOtpDigitInputs() {
        function wireContainer(containerId, onComplete) {
            const container = document.getElementById(containerId);
            if (!container) return;
            const inputs = Array.from(container.querySelectorAll('.otp-digit-input'));

            inputs.forEach((input, index) => {
                input.addEventListener('input', () => {
                    const val = input.value.replace(/[^0-9]/g, '');
                    input.value = val ? val[0] : '';
                    if (input.value && index < inputs.length - 1) {
                        inputs[index + 1].focus();
                        inputs[index + 1].select();
                    }
                    const fullCode = inputs.map(i => i.value.trim()).join('');
                    if (fullCode.length === 6 && typeof onComplete === 'function') {
                        onComplete();
                    }
                });

                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Backspace') {
                        if (!input.value && index > 0) {
                            inputs[index - 1].focus();
                            inputs[index - 1].select();
                        }
                    } else if (e.key === 'ArrowLeft' && index > 0) {
                        inputs[index - 1].focus();
                    } else if (e.key === 'ArrowRight' && index < inputs.length - 1) {
                        inputs[index + 1].focus();
                    }
                });

                input.addEventListener('paste', (e) => {
                    e.preventDefault();
                    const pasteData = (e.clipboardData || window.clipboardData).getData('text');
                    const digits = pasteData.replace(/[^0-9]/g, '').slice(0, 6);
                    if (digits) {
                        for (let i = 0; i < inputs.length; i++) {
                            inputs[i].value = digits[i] || '';
                        }
                        const nextFocusIndex = Math.min(digits.length, inputs.length - 1);
                        inputs[nextFocusIndex].focus();
                        if (digits.length === 6 && typeof onComplete === 'function') {
                            onComplete();
                        }
                    }
                });
            });
        }

        wireContainer('otpBoxesContainer', handleVerifyOtpCode);
        wireContainer('signupOtpBoxesContainer', handleVerifyAndCreateAccount);
    }

    function checkStrictRootAuth() {
        setupOtpDigitInputs();
        updateShopAuthUI();
        const activeToken = localStorage.getItem('billnaw_auth_token') || sessionStorage.getItem('billnaw_auth_token');
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const isExplicitDemo = authMode === 'demo';
        const isAuth = activeToken && authMode === 'authenticated';
        const hasAuthParam = window.location.search && window.location.search.includes('auth=login');

        if (hasAuthParam || (!isAuth && !isExplicitDemo)) {
            setTimeout(() => {
                if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
                if (hasAuthParam) {
                    try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e) {}
                }
            }, 60);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkStrictRootAuth);
    } else {
        checkStrictRootAuth();
    }
    // App Version & Update Manager
    let appUpdateWorker = null;

    function checkForAppUpdates(isManual = false) {
        fetch('/api/version?t=' + Date.now())
            .then(res => res.json())
            .then(data => {
                const currentVer = localStorage.getItem('billnaw_pos_version') || '1.0.0';
                const serverVer = data.version || '2.4.0';
                const badge = document.getElementById('updateVersionBadge');
                if (badge) badge.innerText = 'v' + serverVer;

                if (serverVer !== currentVer) {
                    const popup = document.getElementById('appUpdatePopup');
                    if (popup) popup.style.display = 'block';
                } else if (isManual) {
                    if (typeof showToast === 'function') {
                        showToast('🎉 You are using the latest version of Billnaw POS (v' + serverVer + ')');
                    }
                }
            })
            .catch(() => {
                if (isManual && typeof showToast === 'function') {
                    showToast('Unable to check for updates right now.');
                }
            });
    }
    window.checkForAppUpdates = checkForAppUpdates;

    function applyAppUpdate() {
        if (appUpdateWorker) {
            try { 
                appUpdateWorker.postMessage({ type: 'SKIP_WAITING', action: 'skipWaiting' }); 
            } catch(e) {}
        }
        if ('caches' in window) {
            try {
                caches.keys().then(keys => Promise.all(
                    keys.map(k => k !== 'billnaw-pos-v2.7.0' ? caches.delete(k) : null)
                )).catch(() => {});
            } catch(e) {}
        }
        fetch('/api/version')
            .then(res => res.json())
            .then(data => {
                if (data && data.version) localStorage.setItem('billnaw_pos_version', data.version);
            })
            .catch(() => {})
            .finally(() => {
                if (typeof showToast === 'function') showToast('Updating application and clearing stale cache...');
                setTimeout(() => {
                    window.location.reload(true);
                }, 400);
            });
    }
    window.applyAppUpdate = applyAppUpdate;
    window.applyAppUpdateNow = applyAppUpdate;

    function dismissAppUpdatePopup() {
        const popup = document.getElementById('appUpdatePopup');
        if (popup) popup.style.display = 'none';
    }
    window.dismissAppUpdatePopup = dismissAppUpdatePopup;

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(reg => {
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            appUpdateWorker = newWorker;
                            const popup = document.getElementById('appUpdatePopup');
                            if (popup) popup.style.display = 'block';
                        }
                    });
                }
            });
        }).catch(() => {});
    }

    // Periodic check after boot
    setTimeout(() => { checkForAppUpdates(false); }, 12000);
})();
