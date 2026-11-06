// scratch/test_netlify_ai_suite.cjs
const assert = require('assert');

async function runAiTests() {
  console.log('Testing Netlify serverless AI endpoints suite...');
  const { handler } = await import('../netlify/functions/api.js');

  // 1. GET /api/gemini/status
  console.log('\n1. Testing GET /api/gemini/status...');
  const statusRes = await handler({
    httpMethod: 'GET',
    path: '/api/gemini/status',
    queryStringParameters: { clientId: 'BONGBHOJ-TERMINAL' }
  }, {});
  assert.strictEqual(statusRes.statusCode, 200, 'Gemini status must return 200');
  const statusData = JSON.parse(statusRes.body);
  assert.strictEqual(statusData.operational, true, 'Gemini must be operational');
  console.log('✅ Status result:', statusData);

  // 2. GET /api/ai/quota
  console.log('\n2. Testing GET /api/ai/quota...');
  const quotaRes = await handler({
    httpMethod: 'GET',
    path: '/api/ai/quota',
    queryStringParameters: { clientId: 'BONGBHOJ-TERMINAL' }
  }, {});
  assert.strictEqual(quotaRes.statusCode, 200);
  const quotaData = JSON.parse(quotaRes.body);
  assert.strictEqual(quotaData.tier, 'Pro');
  console.log('✅ Quota result:', quotaData);

  // 3. POST /api/generate-campaign
  console.log('\n3. Testing POST /api/generate-campaign...');
  const campRes = await handler({
    httpMethod: 'POST',
    path: '/api/generate-campaign',
    body: JSON.stringify({
      theme: 'weekend',
      storeName: 'Billnaw Cafe',
      discountPercent: 20,
      minOrder: 250
    })
  }, {});
  assert.strictEqual(campRes.statusCode, 200);
  const campData = JSON.parse(campRes.body);
  assert.ok(campData.campaignText || campData.text, 'Campaign must have text');
  console.log('✅ Campaign copy preview:', (campData.campaignText || campData.text).slice(0, 100));

  // 4. POST /api/generate-image
  console.log('\n4. Testing POST /api/generate-image...');
  const imgRes = await handler({
    httpMethod: 'POST',
    path: '/api/generate-image',
    body: JSON.stringify({
      itemName: 'Espresso',
      category: 'Hot Beverages',
      variation: 0
    })
  }, {});
  assert.strictEqual(imgRes.statusCode, 200);
  const imgData = JSON.parse(imgRes.body);
  assert.ok(imgData.imageUrl, 'Image must have imageUrl');
  console.log('✅ Image URL:', imgData.imageUrl);

  // 5. POST /api/food-images/generate
  console.log('\n5. Testing POST /api/food-images/generate...');
  const foodImgRes = await handler({
    httpMethod: 'POST',
    path: '/api/food-images/generate',
    body: JSON.stringify({
      dishName: 'Paneer Tikka',
      cuisine: 'Indian Starters',
      variation: 0
    })
  }, {});
  assert.strictEqual(foodImgRes.statusCode, 200);
  const foodImgData = JSON.parse(foodImgRes.body);
  assert.ok(foodImgData.imageUrl, 'Food image must have imageUrl');
  console.log('✅ Food Image URL:', foodImgData.imageUrl);

  // 6. GET /api/inventory/auto-fill
  console.log('\n6. Testing GET /api/inventory/auto-fill...');
  const autoRes = await handler({
    httpMethod: 'GET',
    path: '/api/inventory/auto-fill',
    queryStringParameters: { dish_name: 'Paneer Butter Masala', category: 'Main Course' }
  }, {});
  assert.strictEqual(autoRes.statusCode, 200);
  const autoData = JSON.parse(autoRes.body);
  assert.ok(autoData.auto_fill, 'Auto fill must exist');
  console.log('✅ Auto-fill gravy:', autoData.auto_fill.gravy_name);

  // 7. POST /api/extract-menu with text fallback
  console.log('\n7. Testing POST /api/extract-menu...');
  const extractRes = await handler({
    httpMethod: 'POST',
    path: '/api/extract-menu',
    body: JSON.stringify({
      extractedText: 'Masala Dosa - 90\nIdli Sambar - 60\nFilter Coffee - 40'
    })
  }, {});
  assert.strictEqual(extractRes.statusCode, 200);
  const extractData = JSON.parse(extractRes.body);
  assert.ok(extractData.categories && extractData.categories.length > 0, 'Categories must be extracted');
  console.log('✅ Extracted categories count:', extractData.categories.length);

  console.log('\n🎉 ALL NETLIFY SERVERLESS AI ENDPOINT TESTS PASSED 100%!');
}

runAiTests().catch(err => {
  console.error('❌ AI Test Failed:', err);
  process.exit(1);
});
