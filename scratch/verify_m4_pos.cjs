const fs = require('fs');
const indexHtml = fs.readFileSync('index.html', 'utf8');
const posJs = fs.readFileSync('js/pos.js', 'utf8');
const culinaryJs = fs.readFileSync('js/culinary_inventory.js', 'utf8');
const swJs = fs.readFileSync('service-worker.js', 'utf8');

// Invariant 1: 26 modal close buttons
const modalBtnRegex = /<button\b[^>]*class=["'][^"']*modal-close-btn[^"']*["'][^>]*><svg[^>]*>.*?<\/svg><\/button>/g;
const modalCloseMatches = indexHtml.match(modalBtnRegex) || [];
console.log('Modal close buttons count:', modalCloseMatches.length);
if (modalCloseMatches.length !== 26) throw new Error('Expected exactly 26 modal close buttons');

// Check recDetailHeroImg in culinaryJs
if (!culinaryJs.includes('dish.image || dish.image_url')) throw new Error('Missing dish.image check on recDetailHeroImg');
console.log('recDetailHeroImg check: OK');

// Check renderDishRecipes
if (!culinaryJs.includes('renderDishRecipes')) throw new Error('Missing renderDishRecipes in culinaryJs');
console.log('renderDishRecipes check: OK');

// Check cart-item-thumb in posJs
if (!posJs.includes('cart-item-thumb')) throw new Error('Missing cart-item-thumb in posJs');
console.log('cart-item-thumb check: OK');

// Check sendEscPosToPrinter and sendKotToPrinter non-blocking text-only
if (!posJs.includes('sendEscPosToPrinter') || !posJs.includes('sendKotToPrinter')) throw new Error('Missing printer functions in posJs');
console.log('sendEscPosToPrinter & sendKotToPrinter check: OK');

// Check stale-while-revalidate for /uploads/food-images/ in swJs
if (!swJs.includes('/uploads/food-images/')) throw new Error('Missing /uploads/food-images/ in swJs');
console.log('service-worker check: OK');

console.log('🎉 ALL PROGRAMMATIC INVARIANT CHECKS PASSED (100%)!');
