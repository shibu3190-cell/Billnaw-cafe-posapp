import { KotUI } from "../src/features/kot/kot.ui.js";
import { TablesUI } from "../src/features/tables/tables.ui.js";
import { getTables } from "../src/features/tables/tables.service.js";

window.KotUI = KotUI;
window.TablesUI = TablesUI;

window.addEventListener('DOMContentLoaded', () => {
    const kotContainer = document.getElementById('kotCardsContainer');
    if (kotContainer) {
        window.kotUIInstance = new KotUI({ container: kotContainer });
        window.kotUIInstance.initEventListeners();
    }
    const tablesContainer = document.getElementById('tablesGridContainer');
    if (tablesContainer) {
        window.tablesUIInstance = new TablesUI({
            container: tablesContainer,
            onTableSelect: (table) => {
                if (table && typeof selectTable === 'function') {
                    const tableNum = parseInt(String(table.id).replace(/\D/g, ''), 10) || 1;
                    selectTable(tableNum);
                    if (typeof switchTab === 'function') switchTab('pos');
                }
            }
        });
    }

    // Auto-update KDS when KOT lifecycle events occur
    window.addEventListener('billnaw:kot-created', () => {
        const kdsView = document.getElementById('kds');
        if (kdsView && kdsView.classList.contains('active') && typeof window.renderKdsUI === 'function') {
            window.renderKdsUI();
        }
    });
    window.addEventListener('billnaw:kot-status-changed', () => {
        const kdsView = document.getElementById('kds');
        if (kdsView && kdsView.classList.contains('active') && typeof window.renderKdsUI === 'function') {
            window.renderKdsUI();
        }
    });
    window.addEventListener('billnaw:kot-cancelled', () => {
        const kdsView = document.getElementById('kds');
        if (kdsView && kdsView.classList.contains('active') && typeof window.renderKdsUI === 'function') {
            window.renderKdsUI();
        }
    });
});

window.renderKdsUI = async function() {
    const kotContainer = document.getElementById('kotCardsContainer');
    if (!window.kotUIInstance && kotContainer) {
        window.kotUIInstance = new KotUI({ container: kotContainer });
    }
    if (window.kotUIInstance) {
        window.kotUIInstance.container = kotContainer;
        window.kotUIInstance.initEventListeners();
        await window.kotUIInstance.loadKots();
    }
};

window.renderTablesFloorUI = function() {
    if (window.tablesUIInstance) {
        window.tablesUIInstance.container = document.getElementById('tablesGridContainer');
        window.tablesUIInstance.loadTables();
    }
};
