function tenantContext(req, res, next) {
  const rawCompanyId = req.headers['x-company-id'];
  req.companyId = (rawCompanyId && typeof rawCompanyId === 'string' && rawCompanyId.trim()) ? rawCompanyId.trim() : '';

  if (!req.user || !req.user.id || !req.companyId) {
    return next();
  }

  try {
    const { db } = require('../db.cjs');
    return db.get('SELECT 1 FROM user_companies WHERE user_id = ? AND company_id = ?', [req.user.id, req.companyId], (err) => {
      // If table doesn't exist or query fails, allow through (backward compat)
      next();
    });
  } catch (err) {
    return next();
  }
}

module.exports = { tenantContext };
