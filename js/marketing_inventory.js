// ============================================================
// 📦 JS/MARKETING_INVENTORY.JS - WhatsApp Hub, Inventory Telemetry & Voice-to-Billing Engine
// ============================================================

// --- 1. VOICE-TO-BILLING ENGINE WITH CONTEXTUAL RETENTION (STRICTLY LAST 2 ITEMS) ---
let isVoiceListening = false;
let speechRecognizer = null;
let cachedVoiceBuffer = localStorage.getItem('bongbhoj_voice_buffer') || '';

// Persistent Voice Order History (strictly capped at 2 items)
let voiceLogHistory = [];
try {
    voiceLogHistory = JSON.parse(localStorage.getItem('billnaw_voice_history') || '[]');
    if (!Array.isArray(voiceLogHistory)) voiceLogHistory = [];
} catch (e) {
    voiceLogHistory = [];
}
if (voiceLogHistory.length === 0 || voiceLogHistory.some(v => v.text === 'two cold coffee' || v.text === 'one chicken biryani')) {
    voiceLogHistory = [
        { text: '2 Hot Chai', label: '2 Hot Chai', time: '12:30 PM' },
        { text: '2 Samosa', label: '2 Samosa', time: '12:35 PM' }
    ];
}
if (voiceLogHistory.length > 2) {
    voiceLogHistory = voiceLogHistory.slice(-2);
}

function recordVoiceHistory(phrase, label) {
    if (!phrase || !phrase.trim()) return;
    const clean = phrase.trim();
    const cleanLabel = label || clean;
    voiceLogHistory.push({
        text: clean,
        label: cleanLabel.charAt(0).toUpperCase() + cleanLabel.slice(1),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
    // STRICTLY LAST 2 ITEMS ONLY
    if (voiceLogHistory.length > 2) {
        voiceLogHistory = voiceLogHistory.slice(-2);
    }
    try {
        localStorage.setItem('billnaw_voice_history', JSON.stringify(voiceLogHistory));
    } catch (e) {}
    renderVoiceHistoryChips();
}
window.recordVoiceHistory = recordVoiceHistory;

function renderVoiceHistoryChips() {
    const container = document.getElementById('quickVoicePillsContainer') || document.getElementById('quickVoicePillsRow');
    if (!container) return;

    // Strict cap of 2 items
    const items = voiceLogHistory.slice(-2);
    const html = items.map(entry => {
        const escaped = entry.text.replace(/'/g, "\\'");
        return `<button type="button" class="quick-voice-chip" onclick="parseAndPushVoiceOrder('${escaped}')" title="Replay voice order: ${entry.text} (${entry.time || ''})"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 3px;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>"${entry.label || entry.text}"</button>`;
    }).join(' ');

    const inner = document.getElementById('quickVoicePillsContainer');
    if (inner) {
        inner.innerHTML = html;
    } else {
        container.innerHTML = `
            <span style="font-size: 11px; font-weight: 700; color: var(--text-dark); margin-right: 4px; display: inline-flex; align-items: center; gap: 4px;">
                <span class="icon-box" style="width: 20px; height: 20px; display: flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg></span> History (Last 2):
            </span>
            <div id="quickVoicePillsContainer" style="display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                ${html}
            </div>
        `;
    }
}
window.renderVoiceHistoryChips = renderVoiceHistoryChips;

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
        const parts = cleanPhrase.split(/,|\band\b|\bplus\b|\btatha\b/i);

        parts.forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            let qty = 1;
            let dishNameCandidate = trimmed;

            const digitMatch = trimmed.match(/^(\d+)\s*(.*)$/);
            if (digitMatch) {
                qty = parseInt(digitMatch[1], 10) || 1;
                dishNameCandidate = digitMatch[2].trim();
            } else {
                const firstWordMatch = trimmed.match(/^([a-z]+)\s+(.*)$/i);
                if (firstWordMatch && spokenNumberMap[firstWordMatch[1].toLowerCase()]) {
                    qty = spokenNumberMap[firstWordMatch[1].toLowerCase()];
                    dishNameCandidate = firstWordMatch[2].trim();
                }
            }

            let lookupName = dishNameCandidate.toLowerCase();
            if (/^(hot\s+)?(chai|tea)$/i.test(lookupName) || /\b(hot\s+)?(chai|tea)\b/i.test(lookupName)) {
                lookupName = 'tea';
            } else if (/^samosa(s)?$/i.test(lookupName) || /\bsamosa(s)?\b/i.test(lookupName)) {
                lookupName = 'samosa';
            } else if (/^(chicken\s+curry|chicken)$/i.test(lookupName)) {
                lookupName = 'chicken curry';
            } else if (/^(masala\s+coke|coke|cola)$/i.test(lookupName)) {
                lookupName = 'masala coke';
            }

            let matched = menuItems.find(m => m.name.toLowerCase() === lookupName);
            if (!matched) {
                matched = menuItems.find(m => m.name.toLowerCase() === dishNameCandidate.toLowerCase());
            }
            if (!matched) {
                matched = menuItems.find(m => dishNameCandidate.length >= 3 && m.name.toLowerCase().includes(dishNameCandidate.toLowerCase()));
            }
            if (!matched) {
                matched = menuItems.find(m => trimmed.toLowerCase().includes(m.name.toLowerCase()));
            }

            if (matched) {
                if (!tablesInfo[activeTable]) {
                    tablesInfo[activeTable] = { items: [], status: 'occupied', savedTime: Date.now(), lastReminder: null };
                }
                if (!tablesInfo[activeTable].savedTime) {
                    tablesInfo[activeTable].savedTime = Date.now();
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
                tablesInfo[activeTable].status = 'occupied';
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
        recordVoiceHistory(cleanPhrase, addedSummary.join(', '));
        setTimeout(() => updateVoiceIndicatorUI(false), 3000);
    } else {
        showToast(`Could not recognize menu items in: "${phrase}". Try "2 Hot Chai" or "2 Samosa"`);
        updateVoiceIndicatorUI(true, `Unrecognized: "${phrase}"`);
        setTimeout(() => updateVoiceIndicatorUI(false), 2500);
    }
}
window.parseAndPushVoiceOrder = parseAndPushVoiceOrder;

// --- 2. TELEMETRY INVENTORY DATA & DISH RECIPES ---
// Clean Zero-Stock Baseline: Real purchases and recipe consumption populate live inventory via culinary pipeline
const defaultInventoryData = [
    { id: 4, name: "Refined Sunflower Oil", category: "Pantry", stock: 0.0, minThreshold: 5.0, unit: "Litre", costPerUnit: 135, dailyUsage: "0 L/day", impactedDishes: ["Samosa", "Chicken Curry"], status: "low" },
    { id: 9, name: "Refined Wheat & All-Purpose Flour (Maida)", category: "Grains & Bakery", stock: 0.0, minThreshold: 5.0, unit: "kg", costPerUnit: 45, dailyUsage: "0 kg/day", impactedDishes: ["Samosa"], status: "low" },
    { id: 10, name: "Spiced Potatoes", category: "Produce", stock: 0.0, minThreshold: 5.0, unit: "kg", costPerUnit: 30, dailyUsage: "0 kg/day", impactedDishes: ["Samosa"], status: "low" },
    { id: 2, name: "Fresh Cow Milk (Dairy)", category: "Dairy", stock: 0.0, minThreshold: 5.0, unit: "Litre", costPerUnit: 64, dailyUsage: "0 L/day", impactedDishes: ["Tea"], status: "low" },
    { id: 5, name: "Premium CTC Tea Leaves", category: "Beverages", stock: 0.0, minThreshold: 2.0, unit: "kg", costPerUnit: 380, dailyUsage: "0 kg/day", impactedDishes: ["Tea"], status: "low" },
    { id: 8, name: "Granulated Sugar", category: "Pantry", stock: 0.0, minThreshold: 2.0, unit: "kg", costPerUnit: 44, dailyUsage: "0 kg/day", impactedDishes: ["Tea"], status: "low" },
    { id: 6, name: "Fresh Farm Poultry / Chicken", category: "Meat", stock: 0.0, minThreshold: 4.0, unit: "kg", costPerUnit: 240, dailyUsage: "0 kg/day", impactedDishes: ["Chicken Curry"], status: "low" },
    { id: 12, name: "Sliced Onions & Spices", category: "Produce", stock: 0.0, minThreshold: 3.0, unit: "kg", costPerUnit: 50, dailyUsage: "0 kg/day", impactedDishes: ["Chicken Curry"], status: "low" },
    { id: 15, name: "Cooking Oil / Gravy Base", category: "Gravy", stock: 0.0, minThreshold: 4.0, unit: "Litre", costPerUnit: 95, dailyUsage: "0 L/day", impactedDishes: ["Chicken Curry"], status: "low" },
    { id: 13, name: "Classic Cola Cans / Syrup", category: "Beverages", stock: 0.0, minThreshold: 10.0, unit: "units", costPerUnit: 20, dailyUsage: "0 units/day", impactedDishes: ["Masala Coke"], status: "low" },
    { id: 14, name: "Chaat Masala Blend", category: "Spices", stock: 0.0, minThreshold: 0.5, unit: "kg", costPerUnit: 300, dailyUsage: "0 kg/day", impactedDishes: ["Masala Coke"], status: "low" }
];

let inventoryTelemetryData = defaultInventoryData;

// Pre-configured default dish recipes for existing menu items (ingredientId: amountPerPortion)
const defaultDishRecipes = {
    "samosa": { 9: 0.04, 10: 0.05, 4: 0.015 },
    "tea": { 2: 0.08, 5: 0.005, 8: 0.008 },
    "chai": { 2: 0.08, 5: 0.005, 8: 0.008 },
    "hot chai": { 2: 0.08, 5: 0.005, 8: 0.008 },
    "chicken curry": { 6: 0.18, 12: 0.05, 15: 0.15 },
    "chicken": { 6: 0.18, 12: 0.05, 15: 0.15 },
    "masala coke": { 13: 1.0, 14: 0.005 },
    "coke": { 13: 1.0, 14: 0.005 },
    "cola": { 13: 1.0, 14: 0.005 },
    "espresso": { 1: 0.018 },
    "cappuccino": { 1: 0.02, 2: 0.18, 8: 0.015 },
    "cold coffee": { 1: 0.02, 2: 0.22, 8: 0.02 },
    "coffee": { 1: 0.02, 2: 0.15, 8: 0.015 },
    "masala chai": { 5: 0.005, 2: 0.08, 8: 0.008 },
    "lemon tea": { 5: 0.005, 8: 0.008 },
    "chicken biryani": { 6: 0.25, 3: 0.20, 4: 0.03 },
    "chicken rolls": { 6: 0.15, 9: 0.08, 4: 0.02 },
    "paneer roll": { 7: 0.12, 9: 0.08, 4: 0.02 },
    "paneer tikka": { 7: 0.18, 4: 0.02 },
    "paneer sandwich": { 7: 0.10, 9: 0.06, 4: 0.01 }
};

// Deduct inventory ingredients when an order is completed using dish recipes
function deductInventoryForOrder(order) {
    if (!order) return;
    if (window.culinaryInventory && typeof window.culinaryInventory.deductOrder === 'function') {
        window.culinaryInventory.deductOrder(order);
    }
}
window.deductInventoryForOrder = deductInventoryForOrder;

// --- 3. CATALOG EDITING CHIPS & PLATFORM TOGGLE HELPERS ---
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
    renderVoiceHistoryChips();
});
