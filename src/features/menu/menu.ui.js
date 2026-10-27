/**
 * src/features/menu/menu.ui.js
 * Feature UI Controller for Menu Catalog, Dish Cards & Proximity Steppers.
 * 
 * Strict Golden Rule: NEVER imports db-client.js or calls Firestore directly.
 * Flow: User Action -> UI Event -> Feature State -> menu.service.js.
 */

import { getMenuItems, saveMenuItem, toggleItemAvailability, MENU_CATEGORIES } from './menu.service.js';
import { formatRupees } from '../../shared/utils/currency.js';
import { showToast } from '../../shared/components/toast.js';

export class MenuUI {
  constructor(options = {}) {
    this.container = options.container || document.getElementById('menuCatalogContainer');
    this.categoriesContainer = options.categoriesContainer || document.getElementById('menuCategoriesContainer');
    this.items = [];
    this.activeCategory = 'All';
    this.onAddToCart = options.onAddToCart || null;
  }

  async loadItems(category = 'All') {
    this.activeCategory = category;
    const res = await getMenuItems(category);
    if (res.error) {
      showToast('Failed to load menu items.', 'error');
      return;
    }
    this.items = res.data || [];
    this.render();
  }

  async handleToggleAvailable(itemId, currentStatus) {
    const res = await toggleItemAvailability(itemId, !currentStatus);
    if (res.error) {
      showToast('Could not update dish availability.', 'error');
      return;
    }
    showToast(`Item ${res.data.is_available ? 'In Stock' : 'Out of Stock'}`, 'info');
    await this.loadItems(this.activeCategory);
  }

  renderCategories() {
    if (!this.categoriesContainer) return;
    const pillsHtml = MENU_CATEGORIES.map(cat => `
      <button type="button" class="category-pill ${cat === this.activeCategory ? 'pill-active' : ''}" data-category="${cat}">
        ${cat}
      </button>
    `).join('');

    this.categoriesContainer.innerHTML = pillsHtml;
    this.categoriesContainer.querySelectorAll('.category-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        this.loadItems(btn.dataset.category);
      });
    });
  }

  render() {
    this.renderCategories();
    if (!this.container) return;

    if (this.items.length === 0) {
      this.container.innerHTML = `<div class="menu-empty">No items found in this category.</div>`;
      return;
    }

    const cardsHtml = this.items.map(item => `
      <div class="dish-card ${item.is_available ? '' : 'dish-card-disabled'}" data-id="${item.id}">
        <div class="dish-card-img-wrapper">
          <img src="${item.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400'}" alt="${item.name}" class="dish-card-img" loading="lazy" />
          <div class="card-img-price-pill">${formatRupees(item.price_paise)}</div>
        </div>
        <div class="dish-card-details">
          <h4 class="dish-card-name">${item.name}</h4>
          <span class="dish-card-category">${item.category}</span>
          <div class="dish-card-footer">
            <button type="button" class="btn-add-to-cart ${item.is_available ? '' : 'disabled'}" data-action="add">
              + ADD
            </button>
          </div>
        </div>
      </div>
    `).join('');

    this.container.innerHTML = `<div class="menu-grid">${cardsHtml}</div>`;

    this.container.querySelectorAll('.btn-add-to-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.dish-card');
        const id = card?.dataset.id;
        const item = this.items.find(it => it.id === id);
        if (item && item.is_available && this.onAddToCart) {
          this.onAddToCart(item);
        }
      });
    });
  }
}
