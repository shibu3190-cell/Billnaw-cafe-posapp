// ============================================================
// 📦 JS/MARKETING_INVENTORY.JS - WhatsApp Hub, Inventory Telemetry & Voice-to-Billing Engine
// ============================================================

// --- 1. VOICE-TO-BILLING ENGINE WITH CONTEXTUAL RETENTION ---
let isVoiceListening = false;
let speechRecognizer = null;
let cachedVoiceBuffer = localStorage.getItem('bongbhoj_voice_buffer') || '';

// Spoken number word mapping for English/Hindi/Bengali common diner speech
const spokenNumberMap = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'ek': 1, 'do': 2, 'teen': 3, 'chaar': 4, 'paanch': 5,
    'chhe': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10,
    'half': 1, 'full': 1, 'single': 1, 'double': 2, 'triple': 3
};

function initVoiceEngine() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        try {
            speechRecognizer = new SpeechRecognition();
            speechRecognizer.continuous = false;
            speechRecognizer.interimResults = true;
            speechRecognizer.lang = 'en-IN';

            speechRecognizer.onstart = () => {
                isVoiceListening = true;
                updateVoiceIndicatorUI(true, "Listening... Speak your order (e.g. 'two fried rice, one espresso')");
            };

            speechRecognizer.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                const spokenText = (finalTranscript || interimTranscript).trim();
                if (spokenText) {
                    updateVoiceIndicatorUI(true, `Spoken: "${spokenText}"`);
                    cachedVoiceBuffer = spokenText;
                    localStorage.setItem('bongbhoj_voice_buffer', spokenText);
                }
                if (finalTranscript) {
                    parseAndPushVoiceOrder(finalTranscript);
                }
            };

            speechRecognizer.onerror = (err) => {
                console.warn("Speech recognition notice:", err.error);
                isVoiceListening = false;
                updateVoiceIndicatorUI(false, "Microphone permission restricted. Use quick voice simulation chips below.");
                showQuickVoicePills(true);
            };

            speechRecognizer.onend = () => {
                isVoiceListening = false;
                setTimeout(() => {
                    if (!isVoiceListening) updateVoiceIndicatorUI(false);
                }, 2500);
            };
        } catch (e) {
            console.warn("Speech recognition initialization error:", e);
        }
    }
}

function toggleVoiceBilling() {
    if (!speechRecognizer) {
        initVoiceEngine();
    }
    if (!speechRecognizer) {
        // In iframe environment where SpeechRecognition is unavailable
        showToast("Voice mode active. Tap any simulated spoken command or speech chip.");
        showQuickVoicePills(true);
        updateVoiceIndicatorUI(true, "Select or tap spoken diner phrase to add to Table ledger");
        return;
    }

    if (isVoiceListening) {
        try { speechRecognizer.stop(); } catch (e) {}
        isVoiceListening = false;
        updateVoiceIndicatorUI(false);
    } else {
        try {
            speechRecognizer.start();
        } catch (e) {
            // If starting fails (e.g. already started or blocked in iframe)
            showQuickVoicePills(true);
            updateVoiceIndicatorUI(true, "Microphone stream ready. Tap quick voice chips or speak.");
        }
    }
}
window.toggleVoiceBilling = toggleVoiceBilling;

function updateVoiceIndicatorUI(active, text) {
    const micIcon = document.querySelector('.mic-icon');
    const voiceFeedbackBar = document.getElementById('voiceFeedbackBanner');
    const voiceFeedbackText = document.getElementById('voiceFeedbackText');
    const mobileVoiceBtn = document.getElementById('mobileVoiceTriggerBtn');

    if (micIcon) {
        if (active) micIcon.classList.add('pulse-active');
        else micIcon.classList.remove('pulse-active');
    }
    if (mobileVoiceBtn) {
        if (active) mobileVoiceBtn.classList.add('pulse-active');
        else mobileVoiceBtn.classList.remove('pulse-active');
    }

    if (voiceFeedbackBar && voiceFeedbackText) {
        if (active) {
            voiceFeedbackBar.style.display = 'flex';
            voiceFeedbackText.innerText = text || "🎤 Listening for orders...";
        } else {
            if (text) {
                voiceFeedbackText.innerText = text;
                setTimeout(() => { voiceFeedbackBar.style.display = 'none'; }, 2000);
            } else {
                voiceFeedbackBar.style.display = 'none';
            }
        }
    }
}
window.updateVoiceIndicatorUI = updateVoiceIndicatorUI;

function showQuickVoicePills(show) {
    const pillsRow = document.getElementById('quickVoicePillsRow');
    if (pillsRow) {
        pillsRow.style.display = show ? 'flex' : 'none';
    }
}
window.showQuickVoicePills = showQuickVoicePills;

// Parse spoken phrases like "three fried rice", "2 cold coffee", "one espresso"
function parseAndPushVoiceOrder(phrase) {
    if (!phrase || !phrase.trim()) return;
    const cleanPhrase = phrase.toLowerCase().trim();
    let itemsAdded = 0;
    const addedSummary = [];

    // Check against menu items
    if (Array.isArray(menuItems) && menuItems.length > 0) {
        // Split by commas, 'and', 'plus', or line breaks
        const parts = cleanPhrase.split(/,|\band\b|\bplus\b|\btatha\b/i);

        parts.forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            // Extract numeric or word count
            let qty = 1;
            let dishNameCandidate = trimmed;

            // Check leading digit
            const digitMatch = trimmed.match(/^(\d+)\s*(.*)$/);
            if (digitMatch) {
                qty = parseInt(digitMatch[1], 10) || 1;
                dishNameCandidate = digitMatch[2].trim();
            } else {
                // Check leading word number
                const firstWordMatch = trimmed.match(/^([a-z]+)\s+(.*)$/i);
                if (firstWordMatch && spokenNumberMap[firstWordMatch[1].toLowerCase()]) {
                    qty = spokenNumberMap[firstWordMatch[1].toLowerCase()];
                    dishNameCandidate = firstWordMatch[2].trim();
                }
            }

            // Find matching menu item
            let matched = menuItems.find(m => m.name.toLowerCase() === dishNameCandidate);
            if (!matched) {
                matched = menuItems.find(m => dishNameCandidate.length >= 3 && m.name.toLowerCase().includes(dishNameCandidate));
            }
            if (!matched) {
                // Reverse search: does menu item name exist in candidate
                matched = menuItems.find(m => trimmed.includes(m.name.toLowerCase()));
            }

            if (matched) {
                // Add to active table ledger
                if (!tablesInfo[activeTable]) {
                    tablesInfo[activeTable] = { items: [], status: 'empty', savedTime: null, lastReminder: null };
                }
                const existing = tablesInfo[activeTable].items.find(i => i.id === matched.id);
                if (existing) {
                    existing.qty += qty;
                } else {
                    tablesInfo[activeTable].items.push({
                        id: matched.id,
                        name: matched.name,
                        price: matched.price,
                        qty: qty,
                        gstRate: matched.gstRate
                    });
                }
                tablesInfo[activeTable].status = 'saved';
                itemsAdded += qty;
                addedSummary.push(`${qty}x ${matched.name}`);
            }
        });
    }

    if (itemsAdded > 0) {
        persistTables();
        syncTableUI();
        updateCartUI();
        if (typeof syncMenuUIQuantities === 'function') syncMenuUIQuantities();
        const msg = `🎙️ Voice Order added to Table ${getTableName(activeTable)}: ${addedSummary.join(', ')}`;
        showToast(msg);
        updateVoiceIndicatorUI(true, `✓ Added: ${addedSummary.join(', ')}`);
        setTimeout(() => updateVoiceIndicatorUI(false), 3000);
    } else {
        showToast(`Could not recognize menu items in: "${phrase}". Try "2 Cold Coffee" or "1 Espresso"`);
        updateVoiceIndicatorUI(true, `Unrecognized: "${phrase}"`);
        setTimeout(() => updateVoiceIndicatorUI(false), 2500);
    }
}
window.parseAndPushVoiceOrder = parseAndPushVoiceOrder;


// --- 2. WHATSAPP MARKETING HUB ENGINE ---
const defaultWhatsAppTemplates = [
    {
        id: 'weekend_feast',
        title: '🍕 Weekend Special Feast',
        category: 'Discount Promo',
        headline: 'Weekend Foodie Celebration!',
        discountPercent: 15,
        minOrder: 499,
        validTill: 'This Sunday Midnight',
        customNote: 'Dine-in or Takeaway available at our cafe.',
        format: (storeName, data, customerName) => 
            `Namaste ${customerName || 'Food Lover'}! 🌟\n\n*${storeName}* invites you to our *Weekend Special Feast*! 🎉\n\nEnjoy a flat *${data.discountPercent}% OFF* on all orders above *₹${data.minOrder}*.\n\n📅 *Valid:* ${data.validTill}\n✨ *Note:* ${data.customNote}\n\nShow this message at billing to avail your discount. See you soon! ☕🍛`
    },
    {
        id: 'vip_loyalty',
        title: '⭐ VIP Customer Appreciation',
        category: 'Loyalty Reward',
        headline: 'A Special Treat for Our Loyal Regulars',
        discountPercent: 20,
        minOrder: 299,
        validTill: 'Next 7 Days',
        customNote: 'Exclusive reward reserved for our top patrons.',
        format: (storeName, data, customerName) => 
            `Hello ${customerName || 'Valued Guest'}! 💎\n\nThank you for being one of *${storeName}*'s most cherished patrons. We truly appreciate your visits!\n\nHere is an exclusive *${data.discountPercent}% OFF* voucher on your next order.\n\n🎁 *Valid:* ${data.validTill}\n🏷️ *Offer:* ${data.discountPercent}% Off on orders above ₹${data.minOrder}\n📍 *Store:* ${storeName}\n\nWe look forward to serving you again! ✨`
    },
    {
        id: 'evening_chai_snack',
        title: '☕ Evening Chai & Snack Combo',
        category: 'Combo Offer',
        headline: 'Warm Up with Our Evening Special',
        discountPercent: 10,
        minOrder: 199,
        validTill: 'Daily 4 PM - 7 PM',
        customNote: 'Pair your favourite hot tea/coffee with freshly fried savouries.',
        format: (storeName, data, customerName) => 
            `Evening cravings calling? ☕🥟\n\nDrop by *${storeName}* between *${data.validTill}* for our signature Chai, Coffee & Hot Snack combos!\n\nGet *${data.discountPercent}% OFF* on bill above ₹${data.minOrder}.\n\nBring along friends and enjoy the warm café vibes! 🌟`
    },
    {
        id: 'chef_launch',
        title: '📢 Chef\'s New Menu Launch',
        category: 'New Dishes',
        headline: 'Taste Our New Culinary Delights',
        discountPercent: 12,
        minOrder: 350,
        validTill: 'This Whole Week',
        customNote: 'Crafted with premium authentic regional recipes.',
        format: (storeName, data, customerName) => 
            `Exciting News from *${storeName}*! 👨‍🍳🔥\n\nWe have just refreshed our menu with exciting new signature items, authentic regional flavours, and freshly brewed specialties.\n\nBe the first to taste them with an introductory *${data.discountPercent}% OFF* (min order ₹${data.minOrder})!\n\nValid till: ${data.validTill}. Come dine with us today! 🍽️`
    }
];

let selectedWaTemplateId = 'weekend_feast';
let waCustomValues = JSON.parse(localStorage.getItem('bongbhoj_wa_custom_values') || 'null') || {
    discountPercent: 15,
    minOrder: 499,
    validTill: 'This Sunday',
    customNote: 'Show this message at the counter to claim discount.'
};

function selectWhatsAppTemplate(tplId) {
    selectedWaTemplateId = tplId;
    const tpl = defaultWhatsAppTemplates.find(t => t.id === tplId);
    if (tpl) {
        waCustomValues.discountPercent = tpl.discountPercent;
        waCustomValues.minOrder = tpl.minOrder;
        waCustomValues.validTill = tpl.validTill;
        waCustomValues.customNote = tpl.customNote;
    }
    renderWhatsAppHubUI();
}
window.selectWhatsAppTemplate = selectWhatsAppTemplate;

function updateWhatsAppCustomValue(key, val) {
    waCustomValues[key] = val;
    localStorage.setItem('bongbhoj_wa_custom_values', JSON.stringify(waCustomValues));
    renderWhatsAppPreviewBubble();
}
window.updateWhatsAppCustomValue = updateWhatsAppCustomValue;

function getGeneratedWhatsAppText(customerName) {
    const tpl = defaultWhatsAppTemplates.find(t => t.id === selectedWaTemplateId) || defaultWhatsAppTemplates[0];
    const storeName = shopProfile.name || "billnaw";
    return tpl.format(storeName, waCustomValues, customerName);
}
window.getGeneratedWhatsAppText = getGeneratedWhatsAppText;

function renderWhatsAppPreviewBubble() {
    const bubbleTextEl = document.getElementById('waBubbleMessageContent');
    const timeEl = document.getElementById('waBubbleTimeDisplay');
    if (bubbleTextEl) {
        const rawText = getGeneratedWhatsAppText('Aditi Roy');
        // Simple whatsapp markdown formatter (*bold* and newlines)
        const formatted = escapeHtml(rawText)
            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        bubbleTextEl.innerHTML = formatted;
    }
    if (timeEl) {
        timeEl.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}
window.renderWhatsAppPreviewBubble = renderWhatsAppPreviewBubble;

function renderWhatsAppHubUI() {
    const templatesListEl = document.getElementById('waTemplatesListContainer');
    const storeNamePreview = document.getElementById('waPreviewStoreName');
    if (storeNamePreview) storeNamePreview.innerText = shopProfile.name || "billnaw";

    if (templatesListEl) {
        templatesListEl.innerHTML = defaultWhatsAppTemplates.map(tpl => {
            const isSelected = tpl.id === selectedWaTemplateId;
            return `
                <div class="wa-template-card ${isSelected ? 'selected' : ''}" onclick="selectWhatsAppTemplate('${tpl.id}')">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <span class="wa-tpl-badge">${escapeHtml(tpl.category)}</span>
                        ${isSelected ? '<span style="color: var(--success); font-weight: 800; font-size: 14px;">✓ Selected</span>' : ''}
                    </div>
                    <div class="wa-tpl-title">${escapeHtml(tpl.title)}</div>
                    <div class="wa-tpl-desc">${escapeHtml(tpl.headline)} • ${tpl.discountPercent}% Off</div>
                </div>
            `;
        }).join('');
    }

    // Populate input values
    const discountInput = document.getElementById('waInputDiscount');
    const minOrderInput = document.getElementById('waInputMinOrder');
    const validTillInput = document.getElementById('waInputValidTill');
    const noteInput = document.getElementById('waInputNote');

    if (discountInput) discountInput.value = waCustomValues.discountPercent;
    if (minOrderInput) minOrderInput.value = waCustomValues.minOrder;
    if (validTillInput) validTillInput.value = waCustomValues.validTill;
    if (noteInput) noteInput.value = waCustomValues.customNote;

    renderWhatsAppPreviewBubble();
    renderWhatsAppCustomerBroadcastList();
}
window.renderWhatsAppHubUI = renderWhatsAppHubUI;

function renderWhatsAppCustomerBroadcastList() {
    const listEl = document.getElementById('waCustomerBroadcastList');
    if (!listEl) return;

    if (!customersList || customersList.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
                No customer contacts in directory yet. Add customers in the Customers tab to dispatch instant campaigns.
            </div>`;
        return;
    }

    listEl.innerHTML = customersList.slice(0, 15).map(cust => {
        const phone = (cust.phone || '').replace(/\D/g, '');
        const hasPhone = phone.length >= 10;
        const msgText = encodeURIComponent(getGeneratedWhatsAppText(cust.name));
        const waLink = hasPhone ? `https://wa.me/91${phone.slice(-10)}?text=${msgText}` : '#';

        return `
            <div class="wa-cust-row">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div class="customer-avatar" style="width: 32px; height: 32px; font-size: 11px;">
                        ${(cust.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style="font-weight: 700; font-size: 13px; color: var(--text-dark);">${escapeHtml(cust.name)}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${cust.phone || 'No Phone'} • <span style="color: var(--primary); font-weight: 600;">${cust.tier || 'Bronze'}</span></div>
                    </div>
                </div>
                <div>
                    ${hasPhone ? `
                        <a href="${waLink}" target="_blank" class="btn btn-success" style="padding: 6px 12px; font-size: 11px; border-radius: 16px; text-decoration: none; gap: 4px;">
                            💬 Send WhatsApp
                        </a>
                    ` : `
                        <button disabled class="btn btn-outline" style="padding: 6px 10px; font-size: 11px; opacity: 0.5;">No Phone</button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}
window.renderWhatsAppCustomerBroadcastList = renderWhatsAppCustomerBroadcastList;

function copyWhatsAppCampaignText() {
    const text = getGeneratedWhatsAppText('Customer');
    navigator.clipboard.writeText(text).then(() => {
        showToast("Campaign message copied to clipboard! Paste directly into WhatsApp groups or broadcast.");
    }).catch(() => {
        showToast("Copied campaign text.");
    });
}
window.copyWhatsAppCampaignText = copyWhatsAppCampaignText;


// --- 3. INVENTORY TELEMETRY & RAW INGREDIENTS ENGINE ---
let inventoryTelemetryData = JSON.parse(localStorage.getItem('bongbhoj_inventory_telemetry') || 'null') || [
    { id: 1, name: "Special Roast Coffee Beans", category: "Beverages", stock: 1.2, minThreshold: 3.0, unit: "kg", costPerUnit: 750, dailyUsage: "0.8 kg/day", impactedDishes: ["Espresso", "Cold Coffee", "Cappuccino"], status: "critical" },
    { id: 2, name: "Fresh Cow Milk (Dairy)", category: "Dairy", stock: 2.0, minThreshold: 5.0, unit: "Litre", costPerUnit: 64, dailyUsage: "6.5 L/day", impactedDishes: ["Masala Chai", "Cold Coffee", "Paneer Rolls"], status: "critical" },
    { id: 3, name: "Aromatic Basmati Rice", category: "Grains", stock: 3.5, minThreshold: 8.0, unit: "kg", costPerUnit: 110, dailyUsage: "4.0 kg/day", impactedDishes: ["Chicken Biryani", "Special Fried Rice"], status: "critical" },
    { id: 4, name: "Refined Sunflower Oil", category: "Pantry", stock: 6.0, minThreshold: 5.0, unit: "Litre", costPerUnit: 135, dailyUsage: "1.5 L/day", impactedDishes: ["Fried Rice", "Cutlets"], status: "low" },
    { id: 5, name: "Premium CTC Tea Leaves", category: "Beverages", stock: 4.5, minThreshold: 2.5, unit: "kg", costPerUnit: 380, dailyUsage: "0.5 kg/day", impactedDishes: ["Masala Chai", "Lemon Tea"], status: "good" },
    { id: 6, name: "Fresh Farm Chicken", category: "Meat", stock: 8.0, minThreshold: 4.0, unit: "kg", costPerUnit: 220, dailyUsage: "5.0 kg/day", impactedDishes: ["Chicken Biryani", "Chicken Rolls"], status: "good" },
    { id: 7, name: "Fresh Dairy Paneer", category: "Dairy", stock: 2.8, minThreshold: 2.0, unit: "kg", costPerUnit: 360, dailyUsage: "1.5 kg/day", impactedDishes: ["Paneer Rolls", "Paneer Sandwich"], status: "good" },
    { id: 8, name: "Refined White Sugar", category: "Pantry", stock: 9.0, minThreshold: 5.0, unit: "kg", costPerUnit: 44, dailyUsage: "1.2 kg/day", impactedDishes: ["Tea", "Coffee", "Mocktails"], status: "good" }
];

function persistInventoryTelemetry() {
    localStorage.setItem('bongbhoj_inventory_telemetry', JSON.stringify(inventoryTelemetryData));
}

function calculateLossAversionMetrics() {
    // Count critical and low items
    const criticalItems = inventoryTelemetryData.filter(i => i.stock <= i.minThreshold);
    // Approximate potential dinner revenue impact
    const estImpact = criticalItems.length * 1400; 
    return {
        criticalCount: criticalItems.length,
        potentialLoss: estImpact,
        itemsSummary: criticalItems.map(i => i.name).slice(0, 3).join(', ')
    };
}
window.calculateLossAversionMetrics = calculateLossAversionMetrics;

function renderInventoryTelemetryUI() {
    const container = document.getElementById('inventoryIngredientsList');
    const alertBanner = document.getElementById('inventoryLossAversionBanner');
    const alertText = document.getElementById('inventoryLossAlertText');

    const metrics = calculateLossAversionMetrics();

    if (alertBanner && alertText) {
        if (metrics.criticalCount > 0) {
            alertBanner.style.display = 'flex';
            alertText.innerHTML = `<strong>⚠️ ${metrics.criticalCount} Low Ingredients may impact tonight's top best-sellers (${metrics.itemsSummary})</strong>. Estimated <span style="color: var(--danger); font-weight: 800;">₹${metrics.potentialLoss.toLocaleString('en-IN')} potential sales at risk</span> if unstocked before dinner rush.`;
        } else {
            alertBanner.style.display = 'none';
        }
    }

    if (!container) return;

    container.innerHTML = inventoryTelemetryData.map(item => {
        const percent = Math.min(100, Math.round((item.stock / (item.minThreshold * 2.5)) * 100));
        let barColor = 'var(--success)';
        let badgeCls = 'stock-good';
        let statusLabel = 'Optimal';

        if (item.stock <= item.minThreshold * 0.7) {
            barColor = 'var(--danger)';
            badgeCls = 'stock-critical';
            statusLabel = 'CRITICAL LOW';
        } else if (item.stock <= item.minThreshold) {
            barColor = 'var(--warning)';
            badgeCls = 'stock-low';
            statusLabel = 'Below Safety Level';
        }

        return `
            <div class="inventory-item-card">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
                    <div>
                        <div style="font-size: 15px; font-weight: 700; color: var(--text-dark);">${escapeHtml(item.name)}</div>
                        <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(item.category)} • Usage: ${item.dailyUsage}</div>
                    </div>
                    <span class="stock-status-badge ${badgeCls}">${statusLabel}</span>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px;">
                    <div style="font-size: 20px; font-weight: 800; color: ${item.stock <= item.minThreshold ? 'var(--danger)' : 'var(--primary)'};">
                        ${item.stock} <span style="font-size: 13px; font-weight: 600; color: var(--text-muted);">${item.unit}</span>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">
                        Min Threshold: <strong>${item.minThreshold} ${item.unit}</strong>
                    </div>
                </div>

                <!-- Visual stock progress bar -->
                <div class="stock-bar-container">
                    <div class="stock-bar-fill" style="width: ${percent}%; background: ${barColor};"></div>
                    <div class="stock-bar-marker" style="left: ${Math.round((item.minThreshold / (item.minThreshold * 2.5)) * 100)}%;" title="Safety Threshold"></div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; font-size: 11px;">
                    <div style="color: var(--text-muted);">
                        Used in: <strong style="color: var(--primary);">${item.impactedDishes.join(', ')}</strong>
                    </div>
                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 11px; border-radius: 14px;" onclick="promptRestockIngredient(${item.id})">
                        ➕ Restock
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
window.renderInventoryTelemetryUI = renderInventoryTelemetryUI;

function promptRestockIngredient(id) {
    const item = inventoryTelemetryData.find(i => i.id === id);
    if (!item) return;
    const addAmt = prompt(`Add restock quantity for ${item.name} (${item.unit}):`, "5");
    if (addAmt && !isNaN(parseFloat(addAmt)) && parseFloat(addAmt) > 0) {
        item.stock = Math.round((item.stock + parseFloat(addAmt)) * 10) / 10;
        persistInventoryTelemetry();
        renderInventoryTelemetryUI();
        showToast(`Updated ${item.name} stock to ${item.stock} ${item.unit}`);
    }
}
window.promptRestockIngredient = promptRestockIngredient;

// Deduct inventory ingredients when an order is completed
function deductInventoryForOrder(order) {
    if (!order || !Array.isArray(order.rawItems)) return;
    order.rawItems.forEach(cartItem => {
        const dishName = (cartItem.name || '').toLowerCase();
        const qty = cartItem.qty || 1;

        // Smart deduction heuristics
        if (dishName.includes('coffee')) {
            const coffeeItem = inventoryTelemetryData.find(i => i.id === 1);
            if (coffeeItem) coffeeItem.stock = Math.max(0, Math.round((coffeeItem.stock - (0.02 * qty)) * 100) / 100);
            const milkItem = inventoryTelemetryData.find(i => i.id === 2);
            if (milkItem) milkItem.stock = Math.max(0, Math.round((milkItem.stock - (0.15 * qty)) * 100) / 100);
        }
        if (dishName.includes('tea') || dishName.includes('chai')) {
            const teaItem = inventoryTelemetryData.find(i => i.id === 5);
            if (teaItem) teaItem.stock = Math.max(0, Math.round((teaItem.stock - (0.01 * qty)) * 100) / 100);
            const milkItem = inventoryTelemetryData.find(i => i.id === 2);
            if (milkItem) milkItem.stock = Math.max(0, Math.round((milkItem.stock - (0.1 * qty)) * 100) / 100);
        }
        if (dishName.includes('biryani')) {
            const riceItem = inventoryTelemetryData.find(i => i.id === 3);
            if (riceItem) riceItem.stock = Math.max(0, Math.round((riceItem.stock - (0.25 * qty)) * 100) / 100);
            const chickItem = inventoryTelemetryData.find(i => i.id === 6);
            if (chickItem) chickItem.stock = Math.max(0, Math.round((chickItem.stock - (0.2 * qty)) * 100) / 100);
        }
        if (dishName.includes('rice')) {
            const riceItem = inventoryTelemetryData.find(i => i.id === 3);
            if (riceItem) riceItem.stock = Math.max(0, Math.round((riceItem.stock - (0.2 * qty)) * 100) / 100);
        }
    });
    persistInventoryTelemetry();
    renderInventoryTelemetryUI();
}
window.deductInventoryForOrder = deductInventoryForOrder;

// --- 4. CATALOG EDITING CHIPS & PLATFORM TOGGLE HELPERS ---
function applyPortionChip(size) {
    const input = document.getElementById('newItemName');
    if (!input) return;
    let val = input.value.trim();
    // Strip existing portion suffix
    val = val.replace(/\s*\((Half|Full|250g|500g|1kg|Regular)\)/gi, '').trim();
    if (size !== 'Regular') {
        val = val ? `${val} (${size})` : `(${size})`;
    }
    input.value = val;
    input.focus();
}
window.applyPortionChip = applyPortionChip;

function applyPriceChip(amt) {
    const input = document.getElementById('newItemPrice');
    if (input) {
        input.value = amt;
        input.focus();
    }
}
window.applyPriceChip = applyPriceChip;

function importFromPlatformModal() {
    showToast("📋 Swiggy / Zomato menu catalog sync ready.");
}
window.importFromPlatformModal = importFromPlatformModal;

// Initialize when ready
document.addEventListener('DOMContentLoaded', () => {
    initVoiceEngine();
});
