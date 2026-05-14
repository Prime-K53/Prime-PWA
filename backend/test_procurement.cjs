const { api } = require('./services/api.ts');

async function testProcurement() {
  try {
    // Get existing purchases
    console.log('Getting existing purchases...');
    const purchases = await api.procurement.getPurchases();
    console.log('Existing purchases:', purchases.length);

    // Create a test purchase
    const testPurchase = {
      id: 'PO-TEST-001',
      supplierId: 'SUP-001',
      items: [{
        itemId: 'ITEM-001',
        name: 'Test Item',
        quantity: 10,
        cost: 100,
        receivedQty: 0
      }],
      total: 1000,
      status: 'Draft'
    };

    console.log('Creating purchase...');
    const result = await api.procurement.savePurchase(testPurchase);
    console.log('Purchase created:', result);

    // Approve the purchase
    console.log('Approving purchase...');
    const approveResult = await api.procurement.approvePurchase('PO-TEST-001');
    console.log('Purchase approved:', approveResult);

    // Get updated purchases
    const updatedPurchases = await api.procurement.getPurchases();
    console.log('Updated purchases count:', updatedPurchases.length);

  } catch (error) {
    console.error('Error:', error);
  }
}

testProcurement();
