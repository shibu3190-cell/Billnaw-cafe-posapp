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
            if (typeof window.setActiveAuthOverlay === 'function') {
                window.setActiveAuthOverlay('shopAuthModal');
            } else {
                modal.style.zIndex = '1000030';
                modal.style.display = 'flex';
            }
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
        const authMode = localStorage.getItem('billnaw_auth_mode');
        const isAuthed = Boolean(activeToken && authMode === 'authenticated');
        const modal = document.getElementById('shopAuthModal');
        const isExplicitLogin = (window.location.search && window.location.search.includes('auth=login')) || (modal && modal.dataset.relogin === 'true');
        if (!force && !isAuthed) {
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
        const forgotSec = document.getElementById('shopAuthForgotPasswordSection');
        if (mode === 'password') {
            if (otpSec) otpSec.style.display = 'none';
            if (forgotSec) forgotSec.style.display = 'none';
            if (passSec) {
                passSec.style.display = 'block';
                const pEmail = document.getElementById('shopAuthPasswordEmail');
                const oEmail = document.getElementById('shopAuthEmail');
                const fEmail = document.getElementById('shopAuthForgotEmail');
                if (pEmail && !pEmail.value) {
                    pEmail.value = (fEmail && fEmail.value) || (oEmail && oEmail.value) || '';
                }
                const pInput = document.getElementById('shopAuthPasswordInput');
                if (pInput) setTimeout(() => pInput.focus(), 80);
            }
        } else if (mode === 'forgot-password') {
            if (otpSec) otpSec.style.display = 'none';
            if (passSec) passSec.style.display = 'none';
            if (forgotSec) {
                forgotSec.style.display = 'block';
                const fEmail = document.getElementById('shopAuthForgotEmail');
                const pEmail = document.getElementById('shopAuthPasswordEmail');
                const oEmail = document.getElementById('shopAuthEmail');
                if (fEmail && !fEmail.value) {
                    fEmail.value = (pEmail && pEmail.value) || (oEmail && oEmail.value) || '';
                }
                const step1 = document.getElementById('forgotPassStep1Wrap');
                const step2 = document.getElementById('forgotPassStep2Wrap');
                if (step1) step1.style.display = 'block';
                if (step2) step2.style.display = 'none';
                showValidationMsg('forgotPassFeedback', '', '');
            }
        } else {
            if (otpSec) otpSec.style.display = 'block';
            if (passSec) passSec.style.display = 'none';
            if (forgotSec) forgotSec.style.display = 'none';
            const pEmail = document.getElementById('shopAuthPasswordEmail');
            const oEmail = document.getElementById('shopAuthEmail');
            if (pEmail && oEmail && pEmail.value) oEmail.value = pEmail.value;
        }
    }
    window.toggleLoginAuthMode = toggleLoginAuthMode;

    async function handleSendForgotPasswordOtp() {
        const emailEl = document.getElementById('shopAuthForgotEmail');
        const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            showValidationMsg('forgotPassFeedback', 'Please enter a valid email address.', 'error');
            return;
        }
        const btn = document.getElementById('btnForgotPassSendOtp');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Sending Code...</span>';
        }
        try {
            const res = await fetch('/api/auth/forgot-password/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            const data = await res.json().catch(() => ({}));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            if (res.ok && data && data.success) {
                if (data.otpTicket) {
                    window._forgotPasswordOtpTicket = data.otpTicket;
                    try { sessionStorage.setItem('billnaw_forgot_pw_ticket', data.otpTicket); } catch(e) {}
                }
                const step1 = document.getElementById('forgotPassStep1Wrap');
                const step2 = document.getElementById('forgotPassStep2Wrap');
                if (step1) step1.style.display = 'none';
                if (step2) step2.style.display = 'block';
                showValidationMsg('forgotPassFeedback', `6-digit reset code sent to ${email}`, 'success');
                if (typeof showToast === 'function') showToast(`Reset code sent to ${email}`, 'success');
            } else {
                const msg = (data && data.error) || 'Failed to send reset code. Please check your email.';
                showValidationMsg('forgotPassFeedback', msg, 'error');
                if (typeof showToast === 'function') showToast(msg, 'error');
            }
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            showValidationMsg('forgotPassFeedback', 'Network error: ' + (err.message || 'Unable to send code'), 'error');
        }
    }
    window.handleSendForgotPasswordOtp = handleSendForgotPasswordOtp;

    async function handleResetForgotPassword() {
        const emailEl = document.getElementById('shopAuthForgotEmail');
        const otpEl = document.getElementById('forgotPassOtpInput');
        const newPassEl = document.getElementById('forgotPassNewInput');
        const email = emailEl ? emailEl.value.trim().toLowerCase() : '';
        const otp = otpEl ? otpEl.value.trim() : '';
        const newPassword = newPassEl ? newPassEl.value : '';

        if (!email || !/^\d{6}$/.test(otp)) {
            showValidationMsg('forgotPassFeedback', 'Please enter the 6-digit reset code sent to your email.', 'error');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            showValidationMsg('forgotPassFeedback', 'New password must be at least 6 characters.', 'error');
            return;
        }

        const otpTicket = window._forgotPasswordOtpTicket || (function() {
            try { return sessionStorage.getItem('billnaw_forgot_pw_ticket') || ''; } catch(e) { return ''; }
        })();

        const btn = document.getElementById('btnForgotPassResetSubmit');
        const origHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Updating Password...</span>';
        }
        try {
            const res = await fetch('/api/auth/forgot-password/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp, newPassword, otpTicket })
            });
            const data = await res.json().catch(() => ({}));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            if (res.ok && data && data.success) {
                window._forgotPasswordOtpTicket = null;
                try { sessionStorage.removeItem('billnaw_forgot_pw_ticket'); } catch(e) {}
                if (typeof showToast === 'function') showToast('Password updated! Signing you in...', 'success');
                const pEmail = document.getElementById('shopAuthPasswordEmail');
                const pInput = document.getElementById('shopAuthPasswordInput');
                if (pEmail) pEmail.value = email;
                if (pInput) pInput.value = newPassword;
                toggleLoginAuthMode('password');
                handlePasswordSignIn();
            } else {
                const msg = (data && data.error) || 'Failed to reset password.';
                showValidationMsg('forgotPassFeedback', msg, 'error');
            }
        } catch (err) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origHtml;
            }
            showValidationMsg('forgotPassFeedback', 'Network error: ' + (err.message || 'Could not reset password'), 'error');
        }
    }
    window.handleResetForgotPassword = handleResetForgotPassword;

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

        const btnSendOtp = document.getElementById('btnSendOtp');
        const origBtnHtml = btnSendOtp ? btnSendOtp.innerHTML : '';
        if (btnSendOtp) {
            btnSendOtp.disabled = true;
            btnSendOtp.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg><span>Sending Code...</span>';
        }

        showValidationMsg('loginEmailValidationFeedback', 'Sending verification code...', 'muted');

        if (typeof fetch === 'function') {
            fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, purpose: 'login' })
            }).then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, error: 'Server returned unexpected status (' + res.status + ')' };
                }

                if (btnSendOtp) {
                    btnSendOtp.disabled = false;
                    btnSendOtp.innerHTML = origBtnHtml;
                }

                if (data && data.success) {
                    if (data.otpTicket) {
                        window._loginOtpTicket = data.otpTicket;
                        try {
                            sessionStorage.setItem('billnaw_login_otp_ticket', data.otpTicket);
                        } catch(e) {}
                    }
                    showValidationMsg('loginEmailValidationFeedback', '', '');
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

                    if (typeof showToast === 'function') {
                        showToast('Verification code dispatched to ' + email, 'success');
                    }
                    showValidationMsg('otpValidationFeedback', 'Code sent! Check your inbox or spam folder.', 'success');
                } else {
                    const errMsg = (data && data.error) ? data.error : 'Failed to dispatch verification code. Please check your email or use password login.';
                    showValidationMsg('loginEmailValidationFeedback', errMsg, 'error');
                    showValidationMsg('otpValidationFeedback', errMsg, 'error');
                    if (typeof showToast === 'function') {
                        showToast(errMsg, 'error');
                    }
                }
            }).catch(err => {
                if (btnSendOtp) {
                    btnSendOtp.disabled = false;
                    btnSendOtp.innerHTML = origBtnHtml;
                }
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
        const emailInput = document.getElementById('shopAuthEmail');
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email) {
            resetLoginOtpView();
            return;
        }

        if (resendBtn) {
            resendBtn.disabled = true;
            resendBtn.innerText = 'Sending...';
        }

        if (typeof fetch === 'function') {
            fetch('/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, purpose: 'login' })
            }).then(async res => {
                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    data = { success: false, error: 'Server returned unexpected status (' + res.status + ')' };
                }

                if (resendBtn) {
                    resendBtn.innerText = 'Resend Code';
                }

                if (data && data.success) {
                    if (data.otpTicket) {
                        window._loginOtpTicket = data.otpTicket;
                        try {
                            sessionStorage.setItem('billnaw_login_otp_ticket', data.otpTicket);
                        } catch(e) {}
                    }
                    startOtpTimer(60);
                    if (typeof showToast === 'function') {
                        showToast('New verification code sent to ' + email, 'success');
                    }
                    showValidationMsg('otpValidationFeedback', 'New code sent! Check your inbox or spam folder.', 'success');
                } else {
                    if (resendBtn) resendBtn.disabled = false;
                    const errMsg = (data && data.error) ? data.error : 'Failed to resend code. Please use password login.';
                    showValidationMsg('otpValidationFeedback', errMsg, 'error');
                    if (typeof showToast === 'function') {
                        showToast(errMsg, 'error');
                    }
                }
            }).catch(err => {
                if (resendBtn) {
                    resendBtn.disabled = false;
                    resendBtn.innerText = 'Resend Code';
                }
                const msg = 'Unable to resend code: ' + (err.message || 'Network error');
                showValidationMsg('otpValidationFeedback', msg, 'error');
                if (typeof showToast === 'function') {
                    showToast(msg, 'error');
                }
            });
        }
    }
    window.handleResendOtpCode = handleResendOtpCode;

    let _isVerifyingLoginOtp = false;

    function handleVerifyOtpCode() {
        if (_isVerifyingLoginOtp) return;

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

        const otpTicket = window._loginOtpTicket || (function() {
            try { return sessionStorage.getItem('billnaw_login_otp_ticket') || ''; } catch(e) { return ''; }
        })();

        const btnVerify = document.getElementById('btnVerifyOtpSubmit');
        const origBtnHtml = btnVerify ? btnVerify.innerHTML : '';
        if (btnVerify) {
            btnVerify.disabled = true;
            btnVerify.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span>Verifying...</span>';
        }
        _isVerifyingLoginOtp = true;

        if (typeof fetch === 'function') {
            fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp: otpCode, otpTicket })
            }).then(async res => {
                const data = await res.json().catch(() => ({}));
                if (res.ok && data && data.success) {
                    window._loginOtpTicket = null;
                    try { sessionStorage.removeItem('billnaw_login_otp_ticket'); } catch(e) {}
                    // Wipe OTP inputs upon successful login
                    digitInputs.forEach(input => { input.value = ''; });

                    try {
                        // Multi-Account Device Isolation: Always clear old tenant cache when logging into a different shop
                        const prevStoreCode = (localStorage.getItem('billnaw_store_code') || localStorage.getItem('billnaw_last_store_code') || (typeof shopProfile !== 'undefined' && shopProfile?.storeCode) || '').trim();
                        const prevEmail = (localStorage.getItem('billnaw_auth_email') || localStorage.getItem('billnaw_last_device_email') || '').trim().toLowerCase();
                        const prevAuthMode = localStorage.getItem('billnaw_auth_mode');
                        const incomingEmail = (data.user?.email || data.shop?.ownerEmail || email || '').trim().toLowerCase();
                        const incomingStore = (data.storeCode || '').trim();
                        const isTenantSwitch = Boolean(
                            (prevStoreCode && incomingStore && prevStoreCode !== incomingStore) ||
                            (prevEmail && incomingEmail && prevEmail !== incomingEmail) ||
                            !prevStoreCode ||
                            prevAuthMode === 'demo'
                        );
                        if (isTenantSwitch) {
                            console.log(`[AUTH] Enforcing clean store tenant: ${prevStoreCode || 'unauthenticated'} -> ${incomingStore}. Purging local tenant cache.`);
                            await clearAllTenantLocalData();
                        }

                        // Cross-tenant quarantine: ensure Bapi leaked staff IDs are permanently blocked in Abhijit shop
                        if (incomingStore === 'SHOP_ABHIJITMODAK' || incomingEmail.includes('abhijitmodak')) {
                            const BAPI_QUARANTINE_IDS = ['1793965135000', '1793965355981', '1794229462515', '1794307359978', '1794308489640', '1794308708078', '1794308990021', '1794309081290', '1794310972228'];
                            if (typeof recordDeletedStaffId === 'function') {
                                BAPI_QUARANTINE_IDS.forEach(id => recordDeletedStaffId(id));
                            }
                        }

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

                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (incomingEmail || email) {
                            const finalEmail = incomingEmail || email.trim().toLowerCase();
                            localStorage.setItem('billnaw_auth_email', finalEmail);
                            localStorage.setItem('billnaw_last_device_email', finalEmail);
                        }
                        if (data.storeCode) {
                            localStorage.setItem('billnaw_store_code', data.storeCode);
                            localStorage.setItem('billnaw_last_store_code', data.storeCode);
                        }
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
                            if (sp.upiId && !shopProfile.upiId) shopProfile.upiId = sp.upiId;
                            if (sp.showQr !== undefined && shopProfile.showQr === undefined) shopProfile.showQr = Boolean(sp.showQr);
                            if (sp.fssai && !shopProfile.fssai) shopProfile.fssai = sp.fssai;
                            if (sp.gstin && !shopProfile.gstin) shopProfile.gstin = sp.gstin;
                            if (sp.gstMode && !shopProfile.gstMode) shopProfile.gstMode = sp.gstMode;
                            if (sp.defaultGstRate !== undefined && shopProfile.defaultGstRate === undefined) shopProfile.defaultGstRate = Number(sp.defaultGstRate);
                        }
                        if (data.shop && data.shop.upiId && !shopProfile.upiId) shopProfile.upiId = data.shop.upiId;
                        if (data.shop && data.shop.showQr !== undefined && shopProfile.showQr === undefined) shopProfile.showQr = Boolean(data.shop.showQr);
                        if (data.shop && data.shop.fssai && !shopProfile.fssai) shopProfile.fssai = data.shop.fssai;
                        if (data.shop && data.shop.gstin && !shopProfile.gstin) shopProfile.gstin = data.shop.gstin;
                        try {
                            if (typeof idb !== 'undefined' && idb.set) {
                                idb.set('cafe_profile', shopProfile);
                                if (shopProfile.upiId) idb.set('cafe_upi_id', shopProfile.upiId);
                                if (shopProfile.logo) idb.set('cafe_logo', shopProfile.logo);
                            }
                            localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
                            if (shopProfile.name) localStorage.setItem('billnaw_shop_name', shopProfile.name);
                            if (shopProfile.phone) localStorage.setItem('billnaw_shop_phone', shopProfile.phone);
                            if (shopProfile.address) localStorage.setItem('billnaw_shop_address', shopProfile.address);
                            if (shopProfile.fssai) localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai);
                            if (shopProfile.gstin) localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin);
                            if (shopProfile.upiId) localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId);
                            if (shopProfile.showQr !== undefined) localStorage.setItem('billnaw_shop_show_qr', shopProfile.showQr ? 'true' : 'false');
                            if (shopProfile.logo) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
                        } catch(e) {}
                        if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
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
                        if (data.shop?.tables && typeof data.shop.tables === 'object' && !Array.isArray(data.shop.tables) && Object.keys(data.shop.tables).length > 0) {
                            tablesInfo = data.shop.tables;
                            window.tablesInfo = tablesInfo;
                            if (typeof idb !== 'undefined' && idb.set) await idb.set('cafe_tables', tablesInfo);
                        }
                        if (Array.isArray(data.shop?.staff) && data.shop.staff.length > 0) {
                            const deletedStaffSet = new Set((typeof getDeletedStaffIds === 'function') ? getDeletedStaffIds().map(String) : []);
                            const cleanStaff = data.shop.staff.filter(s => s && s.id && !deletedStaffSet.has(String(s.id)));
                            if (cleanStaff.length > 0) {
                                staffList = cleanStaff;
                                window.staffList = staffList;
                                if (typeof idb !== 'undefined' && idb.set) await idb.set('cafe_staff', staffList);
                                try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
                            }
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

                    // Reconcile live shop payload via LWW & tombstone rules
                    if (data.shop && typeof handleRemoteFirestoreUpdate === 'function') {
                        const remoteTables = (data.shop.tables && typeof data.shop.tables === 'object' && !Array.isArray(data.shop.tables) && Object.keys(data.shop.tables).length > 0)
                            ? data.shop.tables
                            : undefined;
                        handleRemoteFirestoreUpdate({
                            profile: data.shop.profile,
                            menu: data.shop.menu,
                            categories: data.shop.categories,
                            tables: remoteTables,
                            staff: data.shop.staff
                        });
                    }

                    // Attach real-time Firestore listener for /shops/{storeCode} AFTER database is initialized
                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    if (typeof updateAllUI === 'function') updateAllUI();
                    if (typeof renderTables === 'function') renderTables();
                    if (typeof syncTableUI === 'function') syncTableUI();

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
            }).finally(() => {
                _isVerifyingLoginOtp = false;
                if (btnVerify) {
                    btnVerify.disabled = false;
                    btnVerify.innerHTML = origBtnHtml;
                }
            });
        } else {
            _isVerifyingLoginOtp = false;
            if (btnVerify) {
                btnVerify.disabled = false;
                btnVerify.innerHTML = origBtnHtml;
            }
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
            }).then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { ...data, success: false, _httpStatus: res.status };
                return data;
            }).then(async data => {
                if (data && data.success) {
                    try {
                        // Multi-Account Device Isolation: Always clear old tenant cache when logging into a different shop
                        const prevStoreCode = (localStorage.getItem('billnaw_store_code') || localStorage.getItem('billnaw_last_store_code') || (typeof shopProfile !== 'undefined' && shopProfile?.storeCode) || '').trim();
                        const prevEmail = (localStorage.getItem('billnaw_auth_email') || localStorage.getItem('billnaw_last_device_email') || '').trim().toLowerCase();
                        const prevAuthMode = localStorage.getItem('billnaw_auth_mode');
                        const incomingEmail = (data.user?.email || data.shop?.ownerEmail || email || '').trim().toLowerCase();
                        const incomingStore = (data.storeCode || '').trim();
                        const isTenantSwitch = Boolean(
                            (prevStoreCode && incomingStore && prevStoreCode !== incomingStore) ||
                            (prevEmail && incomingEmail && prevEmail !== incomingEmail) ||
                            !prevStoreCode ||
                            prevAuthMode === 'demo'
                        );
                        if (isTenantSwitch) {
                            console.log(`[AUTH] Enforcing clean store tenant: ${prevStoreCode || 'unauthenticated'} -> ${incomingStore}. Purging local tenant cache.`);
                            await clearAllTenantLocalData();
                        }

                        // Cross-tenant quarantine: ensure Bapi leaked staff IDs are permanently blocked in Abhijit shop
                        if (incomingStore === 'SHOP_ABHIJITMODAK' || incomingEmail.includes('abhijitmodak')) {
                            const BAPI_QUARANTINE_IDS = ['1793965135000', '1793965355981', '1794229462515', '1794307359978', '1794308489640', '1794308708078', '1794308990021', '1794309081290', '1794310972228'];
                            if (typeof recordDeletedStaffId === 'function') {
                                BAPI_QUARANTINE_IDS.forEach(id => recordDeletedStaffId(id));
                            }
                        }

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

                        if (data.token) localStorage.setItem('billnaw_auth_token', data.token);
                        if (data.storeCode) {
                            localStorage.setItem('billnaw_store_code', data.storeCode);
                            localStorage.setItem('billnaw_last_store_code', data.storeCode);
                        }
                        if (incomingEmail) {
                            localStorage.setItem('billnaw_auth_email', incomingEmail);
                            localStorage.setItem('billnaw_last_device_email', incomingEmail);
                        }
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
                            if (sp.upiId && !shopProfile.upiId) shopProfile.upiId = sp.upiId;
                            if (sp.showQr !== undefined && shopProfile.showQr === undefined) shopProfile.showQr = Boolean(sp.showQr);
                            if (sp.fssai && !shopProfile.fssai) shopProfile.fssai = sp.fssai;
                            if (sp.gstin && !shopProfile.gstin) shopProfile.gstin = sp.gstin;
                            if (sp.gstMode && !shopProfile.gstMode) shopProfile.gstMode = sp.gstMode;
                            if (sp.defaultGstRate !== undefined && shopProfile.defaultGstRate === undefined) shopProfile.defaultGstRate = Number(sp.defaultGstRate);
                        }
                        if (data.shop && data.shop.upiId && !shopProfile.upiId) shopProfile.upiId = data.shop.upiId;
                        if (data.shop && data.shop.showQr !== undefined && shopProfile.showQr === undefined) shopProfile.showQr = Boolean(data.shop.showQr);
                        if (data.shop && data.shop.fssai && !shopProfile.fssai) shopProfile.fssai = data.shop.fssai;
                        if (data.shop && data.shop.gstin && !shopProfile.gstin) shopProfile.gstin = data.shop.gstin;
                        try {
                            if (typeof idb !== 'undefined' && idb.set) {
                                idb.set('cafe_profile', shopProfile);
                                if (shopProfile.upiId) idb.set('cafe_upi_id', shopProfile.upiId);
                                if (shopProfile.logo) idb.set('cafe_logo', shopProfile.logo);
                            }
                            localStorage.setItem('billnaw_store_profile', JSON.stringify(shopProfile));
                            if (shopProfile.name) localStorage.setItem('billnaw_shop_name', shopProfile.name);
                            if (shopProfile.phone) localStorage.setItem('billnaw_shop_phone', shopProfile.phone);
                            if (shopProfile.address) localStorage.setItem('billnaw_shop_address', shopProfile.address);
                            if (shopProfile.fssai) localStorage.setItem('billnaw_shop_fssai', shopProfile.fssai);
                            if (shopProfile.gstin) localStorage.setItem('billnaw_shop_gstin', shopProfile.gstin);
                            if (shopProfile.upiId) localStorage.setItem('billnaw_shop_upi_id', shopProfile.upiId);
                            if (shopProfile.showQr !== undefined) localStorage.setItem('billnaw_shop_show_qr', shopProfile.showQr ? 'true' : 'false');
                            if (shopProfile.logo) localStorage.setItem('billnaw_shop_logo', shopProfile.logo);
                        } catch(e) {}
                        if (typeof updateProfileVisuals === 'function') updateProfileVisuals();
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
                        if (data.shop?.tables && typeof data.shop.tables === 'object' && !Array.isArray(data.shop.tables) && Object.keys(data.shop.tables).length > 0) {
                            tablesInfo = data.shop.tables;
                            window.tablesInfo = tablesInfo;
                            if (typeof idb !== 'undefined' && idb.set) await idb.set('cafe_tables', tablesInfo);
                        }
                        if (Array.isArray(data.shop?.staff) && data.shop.staff.length > 0) {
                            const deletedStaffSet = new Set((typeof getDeletedStaffIds === 'function') ? getDeletedStaffIds().map(String) : []);
                            const cleanStaff = data.shop.staff.filter(s => s && s.id && !deletedStaffSet.has(String(s.id)));
                            if (cleanStaff.length > 0) {
                                staffList = cleanStaff;
                                window.staffList = staffList;
                                if (typeof idb !== 'undefined' && idb.set) await idb.set('cafe_staff', staffList);
                                try { localStorage.setItem('billnaw_store_staff', JSON.stringify(staffList)); } catch(e) {}
                            }
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

                    // Reconcile live shop payload via LWW & tombstone rules
                    if (data.shop && typeof handleRemoteFirestoreUpdate === 'function') {
                        const remoteTables = (data.shop.tables && typeof data.shop.tables === 'object' && !Array.isArray(data.shop.tables) && Object.keys(data.shop.tables).length > 0)
                            ? data.shop.tables
                            : undefined;
                        handleRemoteFirestoreUpdate({
                            profile: data.shop.profile,
                            menu: data.shop.menu,
                            categories: data.shop.categories,
                            tables: remoteTables,
                            staff: data.shop.staff
                        });
                    }

                    // Attach real-time Firestore listener for /shops/{storeCode} AFTER database is initialized
                    if (typeof attachFirestoreListener === 'function') {
                        attachFirestoreListener(data.storeCode);
                    }

                    if (typeof updateAllUI === 'function') updateAllUI();
                    if (typeof renderTables === 'function') renderTables();
                    if (typeof syncTableUI === 'function') syncTableUI();

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
            }).catch(err => {
                const errMsg = 'Sign-in failed: ' + (err && err.message ? err.message : 'Network error. Please check your connection and try again.');
                if (typeof showToast === 'function') showToast(errMsg, 'error');
                else alert(errMsg);
            });
        } else {
            const msg = 'Network connection unavailable';
            if (typeof showToast === 'function') showToast(msg, 'error');
            else alert(msg);
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
        if (resendBtn) {
            resendBtn.disabled = true;
            resendBtn.innerText = 'Resend Code';
        }
        const timerText = document.getElementById('otpTimerText');
        if (timerText) timerText.style.display = 'none';
        const otpFeedback = document.getElementById('otpValidationFeedback');
        if (otpFeedback) otpFeedback.innerText = '';
        const emailInput = document.getElementById('shopAuthEmail');
        if (emailInput) {
            emailInput.focus();
            if (typeof emailInput.select === 'function') emailInput.select();
        }
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
                    if (data.otpTicket) {
                        window._signupOtpTicket = data.otpTicket;
                        try { sessionStorage.setItem('billnaw_signup_otp_ticket', data.otpTicket); } catch(e) {}
                    }
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
                    if (data.otpTicket) {
                        window._signupOtpTicket = data.otpTicket;
                        try { sessionStorage.setItem('billnaw_signup_otp_ticket', data.otpTicket); } catch(e) {}
                    }
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

    let _isVerifyingSignupOtp = false;

    function handleVerifyAndCreateAccount() {
        if (_isVerifyingSignupOtp) return;

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

        const otpTicket = window._signupOtpTicket || (function() {
            try { return sessionStorage.getItem('billnaw_signup_otp_ticket') || ''; } catch(e) { return ''; }
        })();

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

        const btnVerify = document.getElementById('btnVerifySignupSubmit');
        const origBtnHtml = btnVerify ? btnVerify.innerHTML : '';
        if (btnVerify) {
            btnVerify.disabled = true;
            btnVerify.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg><span>Creating Account...</span>';
        }
        _isVerifyingSignupOtp = true;

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
                    otp,
                    otpTicket
                })
            }).then(async res => {
                const data = await res.json().catch(() => ({}));
                if (!res.ok) return { ...data, success: false, _httpStatus: res.status };
                return data;
            }).then(async data => {
                if (data && data.success) {
                    window._signupOtpTicket = null;
                    try { sessionStorage.removeItem('billnaw_signup_otp_ticket'); } catch(e) {}
                    digitInputs.forEach(i => { i.value = ''; });
                    try {
                        // Purge any previous tenant / demo state before initializing the new shop
                        await clearAllTenantLocalData();

                        const resolvedEmail = (data.user?.email || data.shop?.ownerEmail || email || '').trim().toLowerCase();
                        shopProfile = {
                            name: data.shop?.name || shop || '',
                            storeCode: data.storeCode || '',
                            ownerEmail: resolvedEmail,
                            email: resolvedEmail,
                            phone,
                            ownerPhone: phone,
                            tableCount: Number(data.shop?.profile?.tableCount || 5),
                            gstMode: 'inclusive',
                            defaultGstRate: 5,
                            startInvoiceNo: 1001
                        };
                        if (adminPin && typeof hashString === 'function') {
                            shopProfile.adminPinHash = hashString(adminPin);
                        }
                        window.shopProfile = shopProfile;
                        myClientID = data.storeCode || null;
                        window.myClientID = myClientID;

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
                        if (resolvedEmail) {
                            localStorage.setItem('billnaw_auth_email', resolvedEmail);
                            localStorage.setItem('billnaw_owner_email', resolvedEmail);
                            localStorage.setItem('billnaw_shop_email', resolvedEmail);
                            localStorage.setItem('billnaw_last_device_email', resolvedEmail);
                        }
                        if (phone) localStorage.setItem('billnaw_auth_phone', phone);
                        if (data.storeCode) {
                            localStorage.setItem('billnaw_store_code', data.storeCode);
                            localStorage.setItem('billnaw_last_store_code', data.storeCode);
                        }
                        localStorage.setItem('billnaw_shop_session', JSON.stringify({
                            token: data.token,
                            customToken: data.customToken,
                            storeCode: data.storeCode,
                            shop: data.shop,
                            user: data.user,
                            loginAt: Date.now()
                        }));
                        localStorage.setItem('billnaw_shop_owner', JSON.stringify({ firstName: fn, lastName: ln, shopName: shop, email: resolvedEmail, phone }));

                        if (Array.isArray(data.shop?.menu) && data.shop.menu.length > 0) {
                            menuItems = data.shop.menu;
                            window.menuItems = menuItems;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_menu', menuItems);
                        } else {
                            if (typeof menuItems !== 'undefined') menuItems = [];
                            window.menuItems = [];
                        }
                        if (Array.isArray(data.shop?.categories) && data.shop.categories.length > 0) {
                            menuCategories = data.shop.categories;
                            window.menuCategories = menuCategories;
                            if (typeof idb !== 'undefined' && idb.set) idb.set('cafe_categories', menuCategories);
                        } else {
                            if (typeof menuCategories !== 'undefined') menuCategories = ['All'];
                            window.menuCategories = ['All'];
                        }
                        if (typeof persistProfile === 'function') persistProfile();
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
            }).finally(() => {
                _isVerifyingSignupOtp = false;
                if (btnVerify) {
                    btnVerify.disabled = false;
                    btnVerify.innerHTML = origBtnHtml;
                }
            });
        } else {
            _isVerifyingSignupOtp = false;
            if (btnVerify) {
                btnVerify.disabled = false;
                btnVerify.innerHTML = origBtnHtml;
            }
            alert('Network connection unavailable');
        }
    }
    window.handleVerifyAndCreateAccount = handleVerifyAndCreateAccount;

    function handleDirectSignupWithoutOtp() {
        if (typeof showToast === 'function') {
            showToast('Email OTP verification is required to create a shop account.', 'info');
        }
        return handleCreateShopAccount();
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
            if (typeof window !== 'undefined') {
                if (typeof window.detachFirestoreListener === 'function') {
                    try { window.detachFirestoreListener(); } catch (e) {}
                }
                if (typeof window.stopBackgroundSync === 'function') {
                    try { window.stopBackgroundSync(); } catch (e) {}
                }
                if (typeof window.stopSessionHeartbeat === 'function') {
                    try { window.stopSessionHeartbeat(); } catch (e) {}
                }
                if (typeof window.stopStaffPresenceHeartbeat === 'function') {
                    try { window.stopStaffPresenceHeartbeat(); } catch (e) {}
                }
            }

            // Preserve hardware device IDs & printer pairings across shop switches:
            // billnaw_device_id, bongbhoj_device_id, billnaw_printers_config, pos_dual_printers,
            // billnaw_single_printer_mode, billnaw_master_print_hub, billnaw_kot_relay_mode
            const TENANT_LS_KEYS = [
                'billnaw_shop_session', 'billnaw_auth_token', 'billnaw_auth_email', 'billnaw_auth_phone',
                'billnaw_store_code', 'billnaw_shop_code', 'billnaw_active_store_id', 'billnaw_active_user',
                'billnaw_auth_mode', 'billnaw_last_staff_id', 'billnaw_active_staff', 'billnaw_terminal_locked',
                'billnaw_current_session_id', 'billnaw_active_sessions', 'billnaw_active_cart',
                'billnaw_offline_orders', 'billnaw_authorized_devices', 'billnaw_station_profile',
                'billnaw_station_name', 'billnaw_is_master', 'billnaw_device_status',
                'billnaw_device_auth_timestamp', 'billnaw_pairing_code', 'billnaw_pin_verified_at',
                'billnaw_session_revoked', 'billnaw_last_device_email', 'billnaw_last_store_code',
                // R1.4 & tombstone / queue keys
                'billnaw_menu_version', 'billnaw_deleted_menu_ids', 'billnaw_deleted_menu_names',
                'billnaw_menu_customized', 'billnaw_offline_sync_queue', 'billnaw_deleted_staff_ids',
                'billnaw_active_kots', 'billnaw_last_kot_no',
                // Shop profile & legacy keys
                'billnaw_shop_name', 'billnaw_store_profile', 'billnaw_shop_phone', 'billnaw_shop_address',
                'billnaw_shop_logo', 'billnaw_admin_pin_hash', 'billnaw_shop_fssai', 'billnaw_shop_gstin',
                'billnaw_shop_upi_id', 'billnaw_shop_show_qr', 'billnaw_gst_mode', 'billnaw_default_gst_rate',
                'billnaw_table_count', 'billnaw_owner_email', 'billnaw_shop_email', 'billnaw_shop_owner',
                'billnaw_store_staff', 'billnaw_menu', 'billnaw_culinary_materials', 'billnaw_culinary_batches',
                'billnaw_culinary_recipes', 'billnaw_culinary_subs', 'billnaw_subscription_record',
                'billnaw_subscription_status', 'billnaw_voice_buffer', 'billnaw_voice_history',
                'bongbhoj_voice_buffer', 'billnaw_license_active', 'billnaw_license_key',
                'cafe_khata', 'cafeLicenseKey', 'bongbhoj_client_id',
                'ownerEmail', 'storeCode', 'storeId', 'pos_current_staff',
                'pos_failed_print_jobs', 'pos_order_history'
            ];
            // Keep explicit calls expected by static audits:
            localStorage.removeItem('billnaw_auth_token');
            localStorage.removeItem('billnaw_auth_email');
            localStorage.removeItem('billnaw_shop_session');
            localStorage.removeItem('billnaw_shop_name');
            localStorage.removeItem('billnaw_store_profile');
            TENANT_LS_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });

            if (typeof shopProfile !== 'undefined') {
                shopProfile = { name: '', storeCode: '' };
                window.shopProfile = shopProfile;
            }
            if (typeof myClientID !== 'undefined') { myClientID = null; }
            window.myClientID = null;
            if (typeof menuItems !== 'undefined') { menuItems = []; }
            window.menuItems = [];
            if (typeof menuCategories !== 'undefined') { menuCategories = ['All']; }
            window.menuCategories = ['All'];
            if (typeof tablesInfo !== 'undefined') { tablesInfo = {}; }
            window.tablesInfo = {};
            if (typeof orderHistory !== 'undefined') { orderHistory = []; }
            window.orderHistory = [];
            if (typeof dailyExpenses !== 'undefined') { dailyExpenses = []; }
            window.dailyExpenses = [];
            if (typeof customersList !== 'undefined') { customersList = []; }
            window.customersList = [];
            if (typeof staffList !== 'undefined') { staffList = []; }
            window.staffList = [];
            if (typeof currentCart !== 'undefined') { currentCart = []; }
            window.cart = [];
            if (typeof window.clearCart === 'function') { try { window.clearCart(); } catch (e) {} }
            window.currentMenuVersion = 0;
            window.authorizedDevices = [];
            window.activeStaffSessions = [];
            window.currentDeviceRecord = null;
            window.currentSessionId = null;
            window.currentStaff = null;
            window.currentRole = null;
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear();
            }
        } catch(e) {}

        try {
            if (typeof idb !== 'undefined' && typeof idb.clear === 'function') {
                const stores = [
                    'cafe_menu', 'cafe_categories', 'cafe_history', 'cafe_tables',
                    'cafe_customers', 'cafe_expenses', 'cafe_staff', 'cafe_profile',
                    'cafe_logo', 'cafe_khata', 'cafe_raw_materials', 'cafe_sub_recipes',
                    'cafe_unsettled_orders', 'billnaw_devices', 'billnaw_sessions'
                ];
                await Promise.all(stores.map(s => idb.clear(s).catch(() => {})));
                await idb.clear().catch(() => {});
                if (idb.db && idb.db.objectStoreNames) {
                    ['orders', 'kot_records', 'menu_items'].forEach(storeName => {
                        if (idb.db.objectStoreNames.contains(storeName)) {
                            try {
                                const tx = idb.db.transaction(storeName, 'readwrite');
                                tx.objectStore(storeName).clear();
                            } catch (e) {}
                        }
                    });
                }
            }
        } catch(e) {}
    }
    window.clearAllTenantLocalData = clearAllTenantLocalData;

    async function purgeDeviceCookiesAndCaches() {
        // 1. Delete ALL accessible cookies on this device across root path, current path, and host/domain variants
        try {
            if (typeof document !== 'undefined' && typeof document.cookie === 'string' && document.cookie.trim()) {
                const cookies = document.cookie.split(';');
                const hostname = (typeof window !== 'undefined' && window.location && window.location.hostname) ? window.location.hostname : '';
                const pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';
                const paths = Array.from(new Set(['/', pathname]));
                const domains = [''];
                if (hostname && hostname !== 'localhost' && !/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
                    domains.push(hostname, '.' + hostname);
                    const parts = hostname.split('.');
                    if (parts.length > 2) {
                        domains.push('.' + parts.slice(-2).join('.'));
                    }
                }
                cookies.forEach(c => {
                    const eqIdx = c.indexOf('=');
                    const name = (eqIdx > -1 ? c.slice(0, eqIdx) : c).trim();
                    if (!name) return;
                    paths.forEach(p => {
                        domains.forEach(d => {
                            const domAttr = d ? `; domain=${d}` : '';
                            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; path=${p}${domAttr}`;
                        });
                    });
                });
            }
        } catch (e) {}

        // 2. Delete ALL Service Worker Cache Storage buckets
        try {
            if (typeof caches !== 'undefined' && typeof caches.keys === 'function') {
                const keys = await caches.keys();
                await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
            }
        } catch (e) {}

        // 3. Clear sessionStorage completely
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.clear();
            }
        } catch (e) {}

        // 4. Wipe all non-hardware localStorage keys + IndexedDB tenant stores
        try {
            if (typeof localStorage !== 'undefined') {
                const HARDWARE_PRESERVE = new Set([
                    'billnaw_device_id', 'bongbhoj_device_id',
                    'billnaw_printers_config', 'pos_dual_printers',
                    'billnaw_single_printer_mode', 'billnaw_master_print_hub',
                    'billnaw_kot_relay_mode', 'billnaw_pos_version', 'billnaw_data_epoch'
                ]);
                const allKeys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && !HARDWARE_PRESERVE.has(k)) allKeys.push(k);
                }
                allKeys.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
            }
        } catch (e) {}

        // 5. Close active IDB connection and delete IndexedDB databases (with explicit fallback when indexedDB.databases is unavailable)
        try {
            if (typeof idb !== 'undefined' && idb.db && typeof idb.db.close === 'function') {
                try { idb.db.close(); } catch (_) {}
                idb.db = null;
                if ('initPromise' in idb) idb.initPromise = null;
            }
            const knownDbs = new Set(['CafePOS_DB', 'firebaseLocalStorageDb']);
            if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
                const dbs = await indexedDB.databases().catch(() => []);
                (dbs || []).forEach(d => { if (d && d.name) knownDbs.add(d.name); });
            }
            if (typeof indexedDB !== 'undefined' && typeof indexedDB.deleteDatabase === 'function') {
                await Promise.all(Array.from(knownDbs).map(dbName => new Promise(resolve => {
                    try {
                        const req = indexedDB.deleteDatabase(dbName);
                        req.onsuccess = req.onerror = req.onblocked = () => resolve();
                        setTimeout(resolve, 600);
                    } catch (_) { resolve(); }
                })));
            }
        } catch (e) {}
    }
    window.purgeDeviceCookiesAndCaches = purgeDeviceCookiesAndCaches;

    async function logoutShop(options = {}) {
        if (!options || !options.systemInitiated) {
            const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
            const normRole = active && active.role ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : active.role) : '';
            if (active && normRole && normRole !== 'Admin') {
                if (typeof showToast === 'function') showToast('Only Store Admin can sign out of the Cloud Shop account. Use Lock Terminal / Logout Staff instead.', 'warning');
                return false;
            }
        }
        const activeToken = localStorage.getItem('billnaw_auth_token') || (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('billnaw_auth_token') : null);
        const activeEmail = localStorage.getItem('billnaw_auth_email') || (document.getElementById('shopAuthEmail') ? document.getElementById('shopAuthEmail').value.trim() : '');

        // 1. Unsubscribe real-time Firestore listeners & stop heartbeats immediately
        if (typeof window.detachFirestoreListener === 'function') {
            window.detachFirestoreListener();
        }
        if (typeof window.unsubscribeFirestoreListeners === 'function') {
            window.unsubscribeFirestoreListeners();
        }
        if (typeof window.stopBackgroundSync === 'function') {
            try { window.stopBackgroundSync(); } catch (e) {}
        }
        if (typeof window.stopSessionHeartbeat === 'function') {
            try { window.stopSessionHeartbeat(); } catch (e) {}
        }
        if (typeof window.stopStaffPresenceHeartbeat === 'function') {
            try { window.stopStaffPresenceHeartbeat(); } catch (e) {}
        }

        // 2. Invalidate session on backend (bounded await so redirect does not cancel request)
        try {
            if (typeof fetch === 'function') {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 1500) : null;
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    keepalive: true,
                    signal: controller ? controller.signal : undefined,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                    },
                    body: JSON.stringify({ token: activeToken, email: activeEmail })
                }).catch(() => {});
                if (timer) clearTimeout(timer);
            }
        } catch (e) {}

        // 3. Await Firebase signOut
        if (window.auth && typeof window.firebaseSignOut === 'function') {
            try {
                await window.firebaseSignOut(window.auth).catch(() => {});
            } catch (e) {}
        }
        window.currentAuthUser = null;

        // 4. Purge ALL storage, IndexedDB, cookies & SW Cache Storage on device logout
        await clearAllTenantLocalData();
        await purgeDeviceCookiesAndCaches();

        // 5. Reset reactive in-memory state (tablesInfo MUST be an Object {}, never [])
        window.currentStaff = null;
        window.currentRole = null;
        if (typeof staffList !== 'undefined') staffList = [];
        if (typeof tablesInfo !== 'undefined') tablesInfo = {};
        window.tablesInfo = {};
        if (typeof menuItems !== 'undefined') menuItems = [];
        window.menuItems = [];
        if (typeof menuCategories !== 'undefined') menuCategories = ['All'];
        window.menuCategories = ['All'];
        if (typeof currentCart !== 'undefined') currentCart = [];
        window.cart = [];
        if (typeof orderHistory !== 'undefined') orderHistory = [];
        if (typeof customersList !== 'undefined') customersList = [];
        if (typeof dailyExpenses !== 'undefined') dailyExpenses = [];
        if (typeof inventoryRawMaterials !== 'undefined') inventoryRawMaterials = [];
        if (typeof culinaryBatches !== 'undefined') culinaryBatches = [];
        window.authorizedDevices = [];
        window.activeStaffSessions = [];
        window.currentDeviceRecord = null;
        window.currentSessionId = null;
        window.currentMenuVersion = 0;

        // Reset login and signup OTP states & wipe digit inputs so no stale OTP can ever be used
        if (typeof resetLoginOtpView === 'function') resetLoginOtpView();
        if (typeof resetSignupOtpView === 'function') resetSignupOtpView();

        // Clear any countdown timer
        if (typeof otpCountdownInterval !== 'undefined' && otpCountdownInterval) {
            clearInterval(otpCountdownInterval);
            otpCountdownInterval = null;
        }

        // Reset password input fields & validation errors
        ['shopAuthPasswordInput', 'shopAuthPassword', 'shopAuthEmail', 'shopAuthPasswordEmail', 'signupPassword', 'signupConfirmPassword', 'signupAdminPin', 'signupConfirmAdminPin'].forEach(id => {
            const field = document.getElementById(id);
            if (field) field.value = '';
        });

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
        const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
        const normRole = active && active.role ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : active.role) : '';
        if (!active || normRole !== 'Admin') {
            if (typeof showToast === 'function') showToast('Active Devices & Sessions is restricted to Store Admin.', 'warning');
            return;
        }
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
                    logoutShop({ systemInitiated: true });
                    return;
                }

                const safeEsc = (v) => (typeof escapeHtml === 'function')
                    ? escapeHtml(v)
                    : String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));

                container.innerHTML = res.sessions.map(s => {
                    const isCurrent = activeToken && s.token === activeToken;
                    const createdDate = new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                    const sessionKey = safeEsc(s.id || s.token || '');
                    const isMobileDev = /mobile|android|iphone|ipad/i.test(String(s.device || ''));
                    const devIconSvg = isMobileDev
                        ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>'
                        : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';

                    return `
                        <div class="session-card minimal-session-card">
                            <div class="minimal-device-main">
                                <div class="minimal-device-icon ${isCurrent ? 'is-master' : ''}">
                                    ${devIconSvg}
                                </div>
                                <div class="minimal-device-info">
                                    <div class="minimal-device-title-row">
                                        <strong class="minimal-device-name">${safeEsc(s.device || 'POS Terminal')}</strong>
                                        ${isCurrent ? '<span class="minimal-pill is-mint">This Device</span>' : '<span class="minimal-pill is-slate">Cloud Session</span>'}
                                    </div>
                                    <div class="minimal-device-meta">
                                        <span class="minimal-status-dot is-online"></span>
                                        <span>Active</span>
                                        <span class="minimal-meta-sep">·</span>
                                        <span>${safeEsc(createdDate)}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="minimal-device-actions">
                                ${!isCurrent ? `
                                    <button type="button" class="btn btn-outline minimal-action-btn is-danger js-revoke-session-btn" data-session-id="${sessionKey}">
                                        Revoke
                                    </button>
                                ` : `
                                    <button type="button" class="btn btn-outline minimal-action-btn is-danger js-logout-session-btn" data-session-id="${sessionKey}">
                                        Sign Out
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('');
                container.querySelectorAll('.js-revoke-session-btn').forEach(btn => {
                    btn.addEventListener('click', () => revokeSessionItem(btn.getAttribute('data-session-id')));
                });
                container.querySelectorAll('.js-logout-session-btn').forEach(btn => {
                    btn.addEventListener('click', () => revokeCurrentSessionAndLogout(btn.getAttribute('data-session-id')));
                });
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
            const res = await fetch('/api/auth/sessions/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                },
                body: JSON.stringify({ token: tokenId })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (typeof showToast === 'function') showToast(errData.error || 'Failed to revoke session.', 'error');
                return;
            }
            if (activeToken && (tokenId === activeToken || (tokenId.startsWith('sess_') && activeToken.includes(tokenId)))) {
                if (typeof showToast === 'function') showToast('Current session revoked.');
                logoutShop();
                return;
            }
            if (typeof showToast === 'function') showToast('Remote terminal session revoked.');
            loadActiveSessions();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to revoke session: network error.', 'error');
        }
    }
    window.revokeSessionItem = revokeSessionItem;

    async function revokeCurrentSessionAndLogout(tokenId) {
        if (tokenId) {
            const activeToken = localStorage.getItem('billnaw_auth_token');
            try {
                await fetch('/api/auth/sessions/revoke', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                    },
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
            const res = await fetch('/api/auth/sessions/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(activeToken ? { 'Authorization': `Bearer ${activeToken}` } : {})
                },
                body: JSON.stringify({
                    storeCode,
                    revokeAll: true,
                    keepCurrent: true,
                    token: activeToken
                })
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                if (typeof showToast === 'function') showToast(errData.error || 'Failed to revoke remote sessions.', 'error');
                return;
            }
            if (typeof showToast === 'function') showToast('All other remote terminals revoked.');
            loadActiveSessions();
        } catch (e) {
            if (typeof showToast === 'function') showToast('Failed to revoke sessions: network error.', 'error');
        }
    }
    window.revokeAllOtherSessions = revokeAllOtherSessions;

    // 🪑 Floor & Table Management Functions
    function openTableManagementModal() {
        const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
        const normRole = active && active.role ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : active.role) : '';
        if (!active || normRole !== 'Admin') {
            if (typeof showToast === 'function') showToast('Table layout settings are restricted to Store Admin.', 'warning');
            return;
        }
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
        const active = (typeof currentStaff !== 'undefined' && currentStaff) ? currentStaff : (typeof window !== 'undefined' ? window.currentStaff : null);
        const normRole = active && active.role ? (typeof normalizeRole === 'function' ? normalizeRole(active.role) : active.role) : '';
        if (!active || normRole !== 'Admin') {
            if (typeof showToast === 'function') showToast('Only Store Admin can save table layout settings.', 'warning');
            return;
        }
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
            try { localStorage.setItem('billnaw_table_count', String(count)); } catch(e) {}
        }

        if (typeof tablesInfo !== 'undefined' && tablesInfo) {
            for (let i = 1; i <= count; i++) {
                if (!tablesInfo[i]) {
                    tablesInfo[i] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
                }
            }
            // Prune vacant tables above the newly configured count so table count stays exact
            Object.keys(tablesInfo).forEach(k => {
                const num = parseInt(k, 10);
                if (!isNaN(num) && num > count) {
                    const hasOrder = tablesInfo[num] && Array.isArray(tablesInfo[num].items) && tablesInfo[num].items.length > 0;
                    if (!hasOrder) {
                        delete tablesInfo[num];
                    }
                }
            });
            if (typeof activeTable !== 'undefined' && activeTable > count && (!tablesInfo[activeTable] || !tablesInfo[activeTable].items?.length)) {
                activeTable = 1;
            }
        }

        if (typeof persistProfile === 'function') persistProfile();
        if (typeof persistTables === 'function') persistTables();
        if (typeof dispatchBackendStoreSync === 'function') {
            dispatchBackendStoreSync({ tables: tablesInfo, profile: shopProfile }, true);
        }

        toggleTablesVisibility(showTables);
        if (typeof renderTables === 'function') renderTables();
        if (typeof renderTablesView === 'function') renderTablesView();
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
            let lastAutoSubmitCode = '';
            let lastAutoSubmitAt = 0;

            const triggerCompleteDebounced = (code) => {
                const now = Date.now();
                if (code === lastAutoSubmitCode && now - lastAutoSubmitAt < 2500) {
                    return;
                }
                lastAutoSubmitCode = code;
                lastAutoSubmitAt = now;
                if (typeof onComplete === 'function') {
                    onComplete();
                }
            };

            inputs.forEach((input, index) => {
                input.addEventListener('input', () => {
                    const val = input.value.replace(/[^0-9]/g, '');
                    input.value = val ? val[0] : '';
                    if (input.value && index < inputs.length - 1) {
                        inputs[index + 1].focus();
                        inputs[index + 1].select();
                    }
                    const fullCode = inputs.map(i => i.value.trim()).join('');
                    if (fullCode.length === 6) {
                        triggerCompleteDebounced(fullCode);
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
                        if (digits.length === 6) {
                            triggerCompleteDebounced(digits);
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
            // Open synchronously (no 60ms delay) so PIN/profile overlays never flicker underneath
            if (typeof openShopAuthModal === 'function') openShopAuthModal(true);
            if (hasAuthParam) {
                try { window.history.replaceState({}, document.title, window.location.pathname); } catch(e) {}
            }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkStrictRootAuth);
    } else {
        checkStrictRootAuth();
    }

    // App Version & Update Manager (v3.0.0 Unified + Clean Local-Reset & Backend Resync)
    const CLIENT_APP_VERSION = '3.0.0';
    window.CLIENT_APP_VERSION = CLIENT_APP_VERSION;
    let appUpdateWorker = null;
    let _latestServerVersion = CLIENT_APP_VERSION;
    let _updatePopupDismissedThisSession = false;

    function _setUpdateInstallProgress(pct, stageTitle, stageSubtitle) {
        const overlay = document.getElementById('appUpdateInstallOverlay');
        if (!overlay) return;
        const bar = document.getElementById('updateInstallProgressBar');
        const pctEl = document.getElementById('updateInstallProgressPct');
        const titleEl = document.getElementById('updateInstallStageTitle');
        const subEl = document.getElementById('updateInstallStageSub');
        if (bar) bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
        if (pctEl) pctEl.innerText = `${Math.round(pct)}%`;
        if (titleEl && stageTitle) titleEl.innerText = stageTitle;
        if (subEl && stageSubtitle) subEl.innerText = stageSubtitle;
    }

    function showAppUpdateInstallOverlay(targetVer = CLIENT_APP_VERSION) {
        const verEl = document.getElementById('updateInstallTargetVersion');
        if (verEl) verEl.innerText = 'v' + targetVer;
        const popup = document.getElementById('appUpdatePopup');
        if (popup) popup.style.display = 'none';
        if (typeof window.setActiveAuthOverlay === 'function') {
            window.setActiveAuthOverlay('appUpdateInstallOverlay');
        } else {
            const ov = document.getElementById('appUpdateInstallOverlay');
            if (ov) {
                ov.style.zIndex = '1000050';
                ov.style.display = 'flex';
            }
        }
        _setUpdateInstallProgress(12, 'Preparing Billnaw POS v' + targetVer, 'Checking pending offline orders...');
    }
    window.showAppUpdateInstallOverlay = showAppUpdateInstallOverlay;

    function _hideAppUpdateInstallOverlay() {
        const ov = document.getElementById('appUpdateInstallOverlay');
        if (ov) ov.style.display = 'none';
    }

    function checkForAppUpdates(isManual = false) {
        if (isManual) _updatePopupDismissedThisSession = false;
        fetch('/api/version?t=' + Date.now(), { cache: 'no-store' })
            .then(res => res.json())
            .then(data => {
                const serverVer = (data && data.version) ? String(data.version) : CLIENT_APP_VERSION;
                _latestServerVersion = serverVer;

                // Fresh brand-new v3.0.0 installs (no stored version AND no legacy shop session) seed v3.0.0 cleanly to avoid false-positive prompts over #shopAuthModal.
                // Existing shops upgrading from v1/v2 (which already have shop auth/session or old version key) immediately see the v3.0.0 Update button!
                let storedVer = localStorage.getItem('billnaw_pos_version');
                if (!storedVer) {
                    const hasLegacyShopState = Boolean(
                        localStorage.getItem('billnaw_auth_token') ||
                        localStorage.getItem('billnaw_shop_session') ||
                        localStorage.getItem('billnaw_store_code')
                    );
                    if (!hasLegacyShopState) {
                        storedVer = CLIENT_APP_VERSION;
                        try { localStorage.setItem('billnaw_pos_version', CLIENT_APP_VERSION); } catch (_) {}
                    } else {
                        storedVer = '1.0.0';
                    }
                }

                const badge = document.getElementById('updateVersionBadge');
                if (badge) badge.innerText = 'v' + serverVer;
                const settingsBadge = document.getElementById('settingsAppVersionBadge');
                if (settingsBadge) settingsBadge.innerText = 'v' + storedVer;

                if (serverVer !== storedVer) {
                    const activeOv = (typeof window.getActiveAuthOverlay === 'function') ? window.getActiveAuthOverlay() : null;
                    const isBlockingAuthOpen = ['shopAuthModal', 'cloudSyncOverlay', 'appUpdateInstallOverlay', 'devicePairingOverlay'].includes(activeOv);
                    if (isManual || (!_updatePopupDismissedThisSession && !isBlockingAuthOpen)) {
                        const popup = document.getElementById('appUpdatePopup');
                        if (popup) popup.style.display = 'block';
                    }
                    if (isManual && typeof showToast === 'function') {
                        showToast(`Update v${serverVer} is ready! Tap "Update Now" to install cleanly.`, 'info');
                    }
                } else if (isManual) {
                    if (typeof showToast === 'function') {
                        showToast('You are running the latest Billnaw POS (v' + serverVer + ').', 'success');
                    }
                }
            })
            .catch(() => {
                if (isManual && typeof showToast === 'function') {
                    showToast('Unable to check for updates right now.', 'warning');
                }
            });
    }
    window.checkForAppUpdates = checkForAppUpdates;

    async function applyAppUpdate() {
        // Hard safety gate: never wipe local caches while offline so existing shops never lose unsynced bills
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            if (typeof showToast === 'function') {
                showToast('Please connect to the internet before installing v3.0.0 so pending bills sync safely.', 'warning');
            }
            return false;
        }

        let targetVer = _latestServerVersion || CLIENT_APP_VERSION;
        window._isApplyingAppUpdate = true;
        showAppUpdateInstallOverlay(targetVer);

        try {
            // Stage 1 (24%): Verify target version & drain BOTH debounced in-memory syncs AND offline sync queue
            _setUpdateInstallProgress(24, 'Backing up pending orders...', 'Flushing offline queue so no bills are lost.');
            try {
                const verRes = await fetch('/api/version?t=' + Date.now(), { cache: 'no-store' });
                if (verRes.ok) {
                    const verData = await verRes.json();
                    if (verData && verData.version) targetVer = String(verData.version);
                }
            } catch (_) {}

            let queueDrained = true;
            if (typeof window.flushPendingBackendSyncs === 'function') {
                queueDrained = await Promise.race([
                    window.flushPendingBackendSyncs().catch(() => false),
                    new Promise(resolve => setTimeout(() => resolve(false), 4500))
                ]);
            } else if (typeof window.flushOfflineSyncQueue === 'function') {
                await Promise.race([
                    window.flushOfflineSyncQueue().catch(() => false),
                    new Promise(resolve => setTimeout(resolve, 3500))
                ]);
            }

            // Double-check localStorage offline queue before wiping anything
            try {
                const rawQueue = localStorage.getItem('billnaw_offline_sync_queue');
                if (rawQueue) {
                    const parsedQ = JSON.parse(rawQueue);
                    if (parsedQ && typeof parsedQ === 'object' && Object.keys(parsedQ).length > 0) {
                        queueDrained = false;
                    }
                }
            } catch (_) {}

            if (!queueDrained) {
                window._isApplyingAppUpdate = false;
                _hideAppUpdateInstallOverlay();
                if (typeof showToast === 'function') {
                    showToast('Pending offline bills could not sync yet. Update paused to protect your bills — please retry when online.', 'error');
                }
                return false;
            }

            // Stage 2 (48%): Preserve verified shop auth & hardware bindings (Zero-Re-OTP for existing shops)
            _setUpdateInstallProgress(48, 'Securing shop session & printer bindings...', 'Preserving verified shop credentials for seamless resync.');
            const PRESERVE_KEYS = [
                'billnaw_auth_token', 'billnaw_auth_email', 'billnaw_auth_phone',
                'billnaw_auth_mode', 'billnaw_shop_session', 'billnaw_shop_name', 'billnaw_store_code',
                'billnaw_shop_code', 'billnaw_active_store_id', 'billnaw_active_user',
                'billnaw_last_device_email', 'billnaw_last_store_code',
                'billnaw_device_id', 'bongbhoj_device_id', 'billnaw_hardware_device_id',
                'billnaw_is_master', 'billnaw_device_status', 'billnaw_device_auth_timestamp',
                'billnaw_station_profile', 'billnaw_station_name',
                'billnaw_printers_config', 'pos_dual_printers',
                'billnaw_single_printer_mode', 'billnaw_master_print_hub', 'billnaw_kot_relay_mode',
                'billnaw_data_epoch', 'billnaw_app_data_epoch'
            ];
            const preservedSnapshot = {};
            const sessionAuthToken = (typeof sessionStorage !== 'undefined') ? sessionStorage.getItem('billnaw_auth_token') : null;
            try {
                PRESERVE_KEYS.forEach(k => {
                    const v = localStorage.getItem(k);
                    if (v !== null) preservedSnapshot[k] = v;
                });
                if (!preservedSnapshot.billnaw_auth_token && sessionAuthToken) {
                    preservedSnapshot.billnaw_auth_token = sessionAuthToken;
                }
            } catch (_) {}

            // Stage 3 (68%): Clean stale local business caches, IndexedDB stores & old SW Cache Storage
            _setUpdateInstallProgress(68, 'Downloading v' + targetVer + ' & clearing stale cache...', 'Removing old menu, staff & asset caches to prevent conflicts.');
            try {
                if (typeof idb !== 'undefined' && typeof idb.clear === 'function') {
                    const storesToClean = [
                        'cafe_menu', 'cafe_categories', 'cafe_history', 'cafe_tables',
                        'cafe_customers', 'cafe_expenses', 'cafe_staff', 'cafe_profile',
                        'cafe_logo', 'cafe_khata', 'cafe_raw_materials', 'cafe_sub_recipes',
                        'cafe_unsettled_orders', 'billnaw_devices', 'billnaw_sessions'
                    ];
                    await Promise.all(storesToClean.map(s => idb.clear(s).catch(() => {})));
                }
            } catch (_) {}

            try {
                if ('caches' in window && typeof caches.keys === 'function') {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k).catch(() => {})));
                }
            } catch (_) {}

            try {
                localStorage.clear();
                Object.entries(preservedSnapshot).forEach(([k, v]) => {
                    try { localStorage.setItem(k, v); } catch (_) {}
                });
                // Clear active staff shift & mark terminal locked so staff cleanly selects profile & enters 4-digit PIN after resync
                localStorage.removeItem('billnaw_active_staff');
                localStorage.removeItem('billnaw_current_session_id');
                localStorage.removeItem('billnaw_pin_verified_at');
                localStorage.setItem('billnaw_terminal_locked', 'true');
                localStorage.setItem('billnaw_pos_version', targetVer);
                localStorage.setItem('billnaw_pending_clean_resync', targetVer);
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.clear();
                    if (sessionAuthToken) sessionStorage.setItem('billnaw_auth_token', sessionAuthToken);
                }
            } catch (_) {}

            // Stage 4 (88%): Activate new v4.0.0 Service Worker & pre-warm bundle
            _setUpdateInstallProgress(88, 'Installing Billnaw POS v' + targetVer + '...', 'Activating updated application shell.');
            if (appUpdateWorker) {
                try {
                    appUpdateWorker.postMessage({ type: 'SKIP_WAITING', action: 'skipWaiting' });
                } catch (_) {}
            } else if ('serviceWorker' in navigator) {
                try {
                    const reg = await navigator.serviceWorker.getRegistration();
                    if (reg) {
                        await reg.update().catch(() => {});
                        if (reg.waiting) {
                            reg.waiting.postMessage({ type: 'SKIP_WAITING', action: 'skipWaiting' });
                        }
                    }
                } catch (_) {}
            }

            await new Promise(resolve => setTimeout(resolve, 450));
            _setUpdateInstallProgress(100, 'Update Installed!', 'Restarting into clean v' + targetVer + ' & syncing with cloud...');

            setTimeout(() => {
                const base = window.location.origin + window.location.pathname;
                window.location.replace(`${base}?v=${encodeURIComponent(targetVer)}&upgraded=1`);
            }, 450);
            return true;
        } catch (err) {
            console.warn('[AppUpdate] Upgrade fallback notice:', err);
            window._isApplyingAppUpdate = false;
            _hideAppUpdateInstallOverlay();
            if (typeof showToast === 'function') {
                showToast('Update interrupted. Please check your connection and try again.', 'warning');
            }
            return false;
        }
    }
    window.applyAppUpdate = applyAppUpdate;
    window.applyAppUpdateNow = applyAppUpdate;

    function dismissAppUpdatePopup() {
        _updatePopupDismissedThisSession = true;
        const popup = document.getElementById('appUpdatePopup');
        if (popup) popup.style.display = 'none';
    }
    window.dismissAppUpdatePopup = dismissAppUpdatePopup;

    // Auto-check for v3.0.0 updates shortly after boot so all existing shop devices see the Update prompt
    setTimeout(() => {
        try {
            if (!localStorage.getItem('billnaw_pending_clean_resync')) {
                checkForAppUpdates(false);
            }
        } catch (_) {}
    }, 2500);

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
