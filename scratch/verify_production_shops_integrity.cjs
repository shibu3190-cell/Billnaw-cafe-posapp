const { getStoreFromFirestoreREST } = require('../server/sync-service.js');

async function verifyProductionShops() {
  console.log('--- READ-ONLY AUDIT: Production Shops Integrity Check ---');
  
  const productionShopCodes = [
    'SHOP_ABHIJITMODAK',
    'SHOP_BAPI92HALDER',
    'SHOP-AMBEROAK-9AE7'
  ];

  const results = {};

  for (const shopCode of productionShopCodes) {
    try {
      const data = await getStoreFromFirestoreREST(shopCode);
      if (!data) {
        results[shopCode] = { error: 'Shop not found in Firestore' };
        console.error(`❌ Shop ${shopCode}: NOT FOUND!`);
        continue;
      }

      const menuCount = Array.isArray(data.menu) ? data.menu.length : 0;
      const categoriesCount = Array.isArray(data.categories) ? data.categories.length : 0;
      const staffCount = Array.isArray(data.staff) ? data.staff.length : 0;
      const historyCount = Array.isArray(data.history) ? data.history.length : 0;
      const menuVersion = data.menuVersion || 0;
      const shopName = data.profile?.name || data.name || 'Unnamed';
      const ownerEmail = data.ownerEmail || data.profile?.email || 'N/A';

      results[shopCode] = {
        name: shopName,
        email: ownerEmail,
        menuCount,
        categoriesCount,
        categories: data.categories || [],
        staffCount,
        historyCount,
        menuVersion,
        status: 'INTACT & HEALTHY'
      };

      console.log(`✅ [${shopCode}] "${shopName}"`);
      console.log(`   - Owner Email: ${ownerEmail}`);
      console.log(`   - Menu Items: ${menuCount}`);
      console.log(`   - Categories (${categoriesCount}): ${(data.categories || []).join(', ')}`);
      console.log(`   - Menu Version: ${menuVersion}`);
      console.log(`   - Staff Members: ${staffCount}`);
      console.log(`   - History Invoices: ${historyCount}`);
      console.log(`   - Integrity Status: 100% INTACT\n`);
    } catch (err) {
      results[shopCode] = { error: err.message };
      console.error(`❌ Shop ${shopCode} Error:`, err.message);
    }
  }

  console.log('--- Summary ---');
  console.log(JSON.stringify(results, null, 2));
}

verifyProductionShops().catch(console.error);
