/* ───────── System Documentation ───────── */

export const SYSTEM_DOC_SYSTEM_INSTRUCTION =
  "You are a Senior Software Architect and Database Engineer. Your output should be professional, technical, and formatted in Markdown.";

export const SYSTEM_DOC_SYSTEM_INSTRUCTION_SHORT =
  "You are a Senior Software Architect. Professional Markdown output required.";

/* ───────── General AI Assistant ───────── */

export const AI_ASSISTANT_SYSTEM_INSTRUCTION =
  "You are a helpful AI assistant for a business ERP system.";

/* ───────── Invoice / PO Extraction ───────── */

export const INVOICE_EXTRACTION_PROMPT = `Extract invoice/purchase order data in JSON format for an ERP system. 
Required fields: { 
  "number": "string (invoice/PO number)", 
  "date": "YYYY-MM-DD", 
  "clientName": "string (the name of the entity the document is addressed to or issued by)", 
  "supplierName": "string (alias for clientName, useful for POs)",
  "address": "string", 
  "items": [{ "desc": "string", "name": "string (alias for desc)", "qty": number, "price": number, "unitPrice": number (alias for price), "total": number }],
  "subtotal": number,
  "totalAmount": number,
  "reference": "string"
}`;

/* ───────── Payment Proof Extraction ───────── */

export const PAYMENT_PROOF_EXTRACTION_PROMPT = `Extract payment proof details in JSON: { "amount": number, "date": "YYYY-MM-DD", "description": "string", "category": "string" }`;

/* ───────── Delivery Note Extraction ───────── */

export const DELIVERY_NOTE_EXTRACTION_PROMPT = `Extract delivery note details in JSON format for an ERP system.
Required fields: { 
  "number": "string (delivery note ID)",
  "invoiceId": "string", 
  "clientName": "string (customer name)", 
  "date": "YYYY-MM-DD", 
  "address": "string", 
  "driverName": "string", 
  "vehicleNo": "string", 
  "trackingCode": "string", 
  "receivedBy": "string (name of person who received the goods)",
  "items": [{ "desc": "string", "qty": number }],
  "notes": "string"
}`;

/* ───────── OCR ───────── */

export const OCR_DEFAULT_PROMPT =
  "Extract all text from these images as accurately as possible.";

/* ───────── Restock Suggestions ───────── */

export const buildRestockPrompt = (inventoryData: any[], salesData: any[]) =>
  `Analyze this inventory and sales data. Suggest items that need restocking. 
Inventory: ${JSON.stringify(inventoryData.slice(0, 50))}
Recent Sales: ${JSON.stringify(salesData.slice(0, 50))}
Return JSON format: [{ "sku": "string", "name": "string", "reason": "string", "suggestedQty": number }]`;

/* ───────── Product Pricing ───────── */

export const buildPricingPrompt = (
  productName: string,
  totalCost: number,
  category: string,
  wastePercentage: number,
) =>
  `Analyze pricing for a product with the following details:
- Product Name: ${productName}
- Total Production Cost: ${totalCost}
- Category: ${category}
- Historical Waste: ${wastePercentage}%

Provide a suggested selling price, profit margin, reasoning for the suggestion (considering typical retail margins for this category), and bulk pricing tiers.
Return ONLY a JSON object: { "suggestedPrice": number, "margin": number, "reasoning": "string", "tiers": { "small": number, "medium": number, "large": number } }`;

/* ───────── Business Health Report ───────── */

export const BUSINESS_HEALTH_SYSTEM_INSTRUCTION =
  "You are a Chief Financial Officer and Strategic Business Consultant. Provide a deep, actionable, and professional business health analysis in Markdown format.";

export const buildBusinessHealthPrompt = (snapshot: any) =>
  `Analyze the current state of this business based on the following data snapshot:
${JSON.stringify(snapshot, null, 2)}

Please provide:
1. **Executive Summary**: Overall health status (Excellent/Good/Warning/Critical).
2. **Financial Analysis**: Revenue vs Expense trends and cash flow health.
3. **Inventory Efficiency**: Stock turnover risks and critical replenishment needs.
4. **Strategic Recommendations**: 3-5 actionable steps to improve profitability or efficiency.
5. **Risk Assessment**: Potential threats identified from the data.

Use professional language, clear headers, and bullet points.`;

/* ───────── Forecasting ───────── */

export const buildForecastingPrompt = (type: string, data: any) =>
  `Analyze this ${type} forecast data:
${JSON.stringify(data, null, 2)}

Provide:
1. **Key Insights**: What are the most important trends?
2. **Critical Warnings**: Any immediate risks (e.g., stockouts, cash deficits)?
3. **Recommendations**: Specific actions to take based on this forecast.

Format in clean Markdown.`;

export const FORECASTING_SYSTEM_INSTRUCTION =
  "You are a Supply Chain Analyst and Financial Controller. Analyze the provided forecast data and provide actionable insights.";

/* ───────── Expense Analysis ───────── */

export const buildExpenseAnalysisPrompt = (expenses: any[]) =>
  `Analyze these business expenses:
${JSON.stringify(expenses.slice(0, 100), null, 2)}

Provide:
1. **Spending Anomalies**: Any unusual patterns or suspicious entries?
2. **Cost Optimization**: Where can the business save money?
3. **Category Breakdown**: Which categories are growing too fast?
4. **Budget Health**: Overall assessment of spending discipline.

Format in clean Markdown with headers and bullet points.`;

export const EXPENSE_ANALYSIS_SYSTEM_INSTRUCTION =
  "You are a Forensic Accountant and Cost Optimization Expert. Analyze the provided expense list and provide actionable insights.";

/* ───────── Business Q&A ───────── */

export const buildBusinessQAPrompt = (question: string, context: any) =>
  `Context Data:
${JSON.stringify(context, null, 2)}

Question: ${question}

Provide a concise, helpful answer. Use Markdown for formatting if needed.`;

export const BUSINESS_QA_SYSTEM_INSTRUCTION =
  `You are an intelligent ERP Assistant. Answer the user's question accurately using the provided data context. If the data is missing, politely say you don't have enough information.`;

export const OFFLINE_AI_UNAVAILABLE =
  "AI services are currently offline. Please check your connection or switch to online mode for AI assistance.";

/* ───────── Dashboard Daily Brief ───────── */

export const buildDailyBriefPrompt = (data: {
  revenue: number; revenueTarget: number; unpaidInvoices: number; unpaidTotal: number;
  todaysCollection: number; expensesMonth: number; lowStockItems: number;
  activeJobs: number; customers: number; pendingOrders: number;
}) =>
  `Analyze this business snapshot and produce a concise 3-bullet summary (max 10 words per bullet):

Revenue: ${data.revenue} / target ${data.revenueTarget}
Unpaid invoices: ${data.unpaidInvoices} totaling ${data.unpaidTotal}
Today's collection: ${data.todaysCollection}
Monthly expenses: ${data.expensesMonth}
Low-stock items: ${data.lowStockItems}
Active jobs: ${data.activeJobs}
Total customers: ${data.customers}
Pending orders: ${data.pendingOrders}

Return JSON: { "bullets": ["bullet1", "bullet2", "bullet3"] }`;

/* ───────── Sales Opportunity Detection ───────── */

export const buildSalesOpportunityPrompt = (customers: any[], invoices: any[]) =>
  `Find customers ripe for follow-up. Rules:
- Inactive >30 days = opportunity
- Inactive >60 days = high-risk churn
- Has overdue payment = flag as "Payment Due"
- Top spender who hasn't ordered recently = upsell opportunity

Customers: ${JSON.stringify(customers.slice(0, 30))}
Invoices: ${JSON.stringify(invoices.slice(0, 30))}

Return JSON array: [{ "customerId": "string", "name": "string", "reason": "string", "type": "follow_up|churn_risk|payment_due|upsell" }]`;

/* ───────── Inventory Risk Detection ───────── */

export const buildInventoryRiskPrompt = (items: any[]) =>
  `Analyze these inventory items and flag risks:
- Items below reorderPoint or minStockLevel
- Items with stock < 10
- Items with zero stock
- Slow movers (stock > 100 with no recent sales)

Items: ${JSON.stringify(items.slice(0, 50))}

Return JSON array: [{ "sku": "string", "name": "string", "risk": "stockout|low_stock|zero_stock|overstock", "currentStock": number, "suggestedAction": "string" }]`;

/* ───────── Cash Flow Warning ───────── */

export const buildCashFlowWarningPrompt = (data: {
  pendingInvoicesTotal: number; upcomingExpensesTotal: number; currentBalance: number;
  pendingInvoicesCount: number; upcomingExpensesCount: number;
}) =>
  `Analyze this cash flow snapshot:
Pending invoices: ${data.pendingInvoicesCount} totaling ${data.pendingInvoicesTotal}
Upcoming expenses: ${data.upcomingExpensesCount} totaling ${data.upcomingExpensesTotal}
Current balance: ${data.currentBalance}

Return JSON: { "status": "healthy|warning|cautious", "projectedBalance": number, "message": "string (max 15 words)" }`;

/* ───────── Customer Insight ───────── */

export const buildCustomerInsightPrompt = (customer: any, invoices: any[], payments: any[]) =>
  `Analyze this customer and produce a concise insight:

Customer: ${JSON.stringify(customer)}
Recent Invoices: ${JSON.stringify(invoices.slice(0, 20))}
Recent Payments: ${JSON.stringify(payments.slice(0, 20))}

Return JSON: {
  "reliability": "high|medium|low",
  "totalSpent": number,
  "averageInvoice": number,
  "lastOrderDate": "string",
  "paymentPunctuality": "excellent|good|average|poor",
  "insight": "string (max 20 words)"
}`;

/* ───────── Supplier Scorecard ───────── */

export const buildSupplierScorecardPrompt = (supplier: any, purchases: any[], payments: any[]) =>
  `Score this supplier's performance:

Supplier: ${JSON.stringify(supplier)}
Recent Purchases: ${JSON.stringify(purchases.slice(0, 20))}
Supplier Payments: ${JSON.stringify(payments.slice(0, 20))}

Return JSON: {
  "score": number (0-100),
  "reliability": "excellent|good|average|poor",
  "totalSpend": number,
  "orderCount": number,
  "strengths": ["string"],
  "weaknesses": ["string"],
  "recommendation": "string (max 15 words)"
}`;

/* ───────── Document Summary ───────── */

export const buildDocumentSummaryPrompt = (docType: string, data: any) =>
  `Summarize this ${docType} in 2-3 sentences for a busy manager:

${JSON.stringify(data, null, 2)}

Return JSON: { "summary": "string (max 3 sentences)", "keyNumbers": ["string"], "status": "string" }`;
