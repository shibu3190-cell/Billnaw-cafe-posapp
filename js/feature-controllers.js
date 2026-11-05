import { KotUI } from "../src/features/kot/kot.ui.js";
import { TablesUI } from "../src/features/tables/tables.ui.js";
import { getTables } from "../src/features/tables/tables.service.js";

window.KotUI = KotUI;
window.TablesUI = TablesUI;

window.addEventListener('DOMContentLoaded', () => {
    const kotContainer = document.getElementById('kotCardsContainer');
    if (kotContainer) {
        window.kotUIInstance = new KotUI({ container: kotContainer });
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
});

window.renderKdsUI = function() {
    if (window.kotUIInstance) {
        window.kotUIInstance.container = document.getElementById('kotCardsContainer');
        window.kotUIInstance.render();
    }
};

window.renderTablesFloorUI = function() {
    if (window.tablesUIInstance) {
        window.tablesUIInstance.container = document.getElementById('tablesGridContainer');
        window.tablesUIInstance.loadTables();
    }
};
