// Script to approve all pending expenses
// Run this in the browser console while the app is running

(async () => {
  try {
    // Get the FinanceContext from the app
    const financeContext = window.__CASCADE_FINANCE_CONTEXT__ ||
      // Try to find it from React devtools or similar
      (() => {
        const root = document.getElementById('root');
        if (!root) return null;

        // Find React fiber
        const reactKey = Object.keys(root).find(key => key.startsWith('__reactInternalInstance$') || key.startsWith('__reactFiber$'));
        if (!reactKey) return null;

        let fiber = root[reactKey];
        while (fiber) {
          if (fiber.memoizedProps && fiber.memoizedProps.children) {
            // Try to find FinanceProvider
            const findFinanceContext = (node) => {
              if (node.type && node.type.name === 'FinanceProvider') {
                return node.stateNode;
              }
              if (node.child) return findFinanceContext(node.child);
              if (node.sibling) return findFinanceContext(node.sibling);
              return null;
            };
            const provider = findFinanceContext(fiber);
            if (provider) return provider;
          }
          fiber = fiber.return;
        }
        return null;
      })();

    if (!financeContext) {
      console.error('Could not find FinanceContext. Make sure the app is running.');
      return;
    }

    // Get all expenses
    const expenses = financeContext.expenses || [];

    // Filter pending expenses
    const pendingExpenses = expenses.filter(exp => exp.status === 'Pending Approval');

    if (pendingExpenses.length === 0) {
      console.log('No pending expenses found.');
      return;
    }

    console.log(`Found ${pendingExpenses.length} pending expenses. Approving...`);

    // Approve each pending expense
    for (const expense of pendingExpenses) {
      try {
        await financeContext.approveExpense(expense.id);
        console.log(`Approved expense: ${expense.id} - ${expense.description}`);
      } catch (error) {
        console.error(`Failed to approve expense ${expense.id}:`, error);
      }
    }

    console.log('All pending expenses have been processed.');

    // Refresh the data
    await financeContext.fetchFinanceData();

    console.log('Data refreshed. Check the Financial Performance now.');

  } catch (error) {
    console.error('Error running script:', error);
  }
})();
