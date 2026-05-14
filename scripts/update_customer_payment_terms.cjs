const { dbService } = require('../services/db');

/**
 * Script to update customer payment terms based on their segment
 * This ensures all existing customers have appropriate payment terms set
 */
async function updateCustomerPaymentTerms() {
  try {
    console.log('Starting customer payment terms update...');
    
    // Fetch all customers
    const customers = await dbService.getAll('customers');
    console.log(`Found ${customers.length} customers to process...`);
    
    let updatedCount = 0;
    const managedPaymentTerms = new Set(['Net 7', 'Net 30', 'Net 365', 'Due on Receipt'].map(v => v.toLowerCase()));
    
    for (const customer of customers) {
      let newPaymentTerms = 'Net 30'; // default
      
      // Determine payment terms based on segment
      switch (customer.segment) {
        case 'Individual':
        case 'Government':
          newPaymentTerms = 'Net 7';
          break;
        case 'School Account':
          newPaymentTerms = 'Net 365';
          break;
        case 'Institution':
          newPaymentTerms = 'Net 30';
          break;
        default:
          newPaymentTerms = 'Net 30';
      }
      
      const currentTerms = String(customer.paymentTerms || '').trim();
      const hasCustomTerms = Boolean(currentTerms) && !managedPaymentTerms.has(currentTerms.toLowerCase());

      // Preserve custom terms and update only managed/empty terms.
      if (!hasCustomTerms && currentTerms !== newPaymentTerms) {
        customer.paymentTerms = newPaymentTerms;
        
        // Save the updated customer
        await dbService.put('customers', customer);
        updatedCount++;
        
        console.log(`Updated customer ${customer.name} (${customer.id}): ${newPaymentTerms}`);
      }
    }
    
    console.log(`Successfully updated ${updatedCount} customers.`);
    console.log('Customer payment terms update completed.');
  } catch (error) {
    console.error('Error updating customer payment terms:', error);
  }
}

// Run the function if this script is executed directly
if (require.main === module) {
  updateCustomerPaymentTerms();
}

module.exports = { updateCustomerPaymentTerms };
