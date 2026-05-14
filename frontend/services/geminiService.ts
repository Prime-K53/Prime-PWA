import { GoogleGenAI } from "@google/genai";
import { OFFLINE_MODE } from "../constants";

const getClient = () => {
  if (OFFLINE_MODE) return null;
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || (process.env as any).VITE_GEMINI_API_KEY;
  if (!apiKey || apiKey === 'PLACEHOLDER_API_KEY') {
    throw new Error("Gemini API Key is not configured. Please add VITE_GEMINI_API_KEY to your .env.local file.");
  }
  return new GoogleGenAI({ apiKey });
};

const getResponseText = (response: any): string => {
    const t = response?.text;
    if (typeof t === 'string') return t;
    if (typeof t === 'function') return t() || "";
    const legacy = response?.response?.text;
    if (typeof legacy === 'function') return legacy() || "";
    if (typeof legacy === 'string') return legacy;
    return "";
};

const makeUserContents = (parts: any[]) => [{ role: 'user', parts }];

// Helper to extract MIME type from Base64 string
const getMimeType = (base64String: string, defaultType: string = 'image/jpeg'): string => {
    if (base64String.startsWith('data:')) {
        const match = base64String.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,/);
        if (match) return match[1];
    }
    if (base64String.startsWith('/9j/')) return 'image/jpeg';
    if (base64String.startsWith('iVBORw0KGgo')) return 'image/png';
    return defaultType;
};

const getCleanBase64 = (base64String: string): string => {
    return base64String.includes('base64,') ? base64String.split('base64,')[1] : base64String;
};

/**
 * Generator for streaming responses to handle long-form architectural docs
 */
export async function* streamSystemDoc(prompt: string) {
  if (OFFLINE_MODE) {
    yield "System documentation generation is unavailable in offline mode.";
    return;
  }
  try {
    const genAI = getClient();
    if (!genAI) throw new Error("AI Client unavailable");
    const result: any = await genAI.models.generateContentStream({
        model: 'gemini-1.5-pro',
        contents: prompt,
        config: {
            systemInstruction: "You are a Senior Software Architect and Database Engineer. Your output should be professional, technical, and formatted in Markdown."
        }
    });

    const stream: any = result?.stream ?? result;
    for await (const chunk of stream) {
        const chunkText = typeof chunk?.text === 'function' ? chunk.text() : (chunk?.text ?? "");
        yield chunkText || "";
    }
  } catch (error) {
    console.error("Gemini Streaming Error:", error);
    yield "Error generating stream. Check API key.";
  }
}

export const generateSystemDoc = async (prompt: string): Promise<string> => {
  if (OFFLINE_MODE) return "Documentation generation is disabled in offline mode.";
  try {
    const genAI = getClient();
    if (!genAI) throw new Error("AI Client unavailable");
    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-pro',
        contents: prompt,
        config: {
            systemInstruction: "You are a Senior Software Architect. Professional Markdown output required."
        }
    });
    return getResponseText(response) || "No response generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error generating documentation.";
  }
};

export const generateAIResponse = async (prompt: string, systemInstruction?: string): Promise<string> => {
  if (OFFLINE_MODE) return "AI services are currently offline. Please check your connection or switch to online mode for AI assistance.";
  
  try {
    const genAI = getClient();
    if (!genAI) throw new Error("AI Client unavailable");
    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: {
            systemInstruction: systemInstruction || "You are a helpful AI assistant for a business ERP system."
        }
    });
    return getResponseText(response) || "No response generated.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Unable to connect to AI service.";
  }
};

export const extractInvoiceData = async (imageBase64: string): Promise<any> => {
  if (OFFLINE_MODE) return null;
  try {
    const genAI = getClient();
    const mimeType = getMimeType(imageBase64, 'image/jpeg');
    const cleanBase64 = getCleanBase64(imageBase64);
    
    const prompt = `Extract invoice/purchase order data in JSON format for an ERP system. 
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
    
    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: makeUserContents([
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType } }
        ])
    });
    const text = getResponseText(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (error) {
    console.error("OCR Extraction Error:", error);
    return null;
  }
};

export const extractPaymentProofData = async (imageBase64: string): Promise<any> => {
  if (OFFLINE_MODE) return null;
  try {
    const genAI = getClient();
    const mimeType = getMimeType(imageBase64, 'image/jpeg');
    const cleanBase64 = getCleanBase64(imageBase64);

    const prompt = `Extract payment proof details in JSON: { "amount": number, "date": "YYYY-MM-DD", "description": "string", "category": "string" }`;

    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: makeUserContents([
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType } }
        ])
    });
    const text = getResponseText(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (error) {
    console.error("Payment Proof Extraction Error:", error);
    return null;
  }
};

export const extractDeliveryNoteData = async (fileBase64: string): Promise<any> => {
  if (OFFLINE_MODE) return null;
  try {
    const genAI = getClient();
    const mimeType = getMimeType(fileBase64, 'image/jpeg');
    const cleanBase64 = getCleanBase64(fileBase64);
    
    const prompt = `Extract delivery note details in JSON format for an ERP system.
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

    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: makeUserContents([
            { text: prompt },
            { inlineData: { data: cleanBase64, mimeType } }
        ])
    });
    const text = getResponseText(response);
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch (error) {
    console.error("DN Extraction Error:", error);
    return null;
  }
};

export const performOCR = async (images: string[], prompt?: string): Promise<string> => {
  if (OFFLINE_MODE) return "OCR services are unavailable in offline mode.";
  try {
    const genAI = getClient();
    
    const parts = images.map(img => ({ inlineData: { data: getCleanBase64(img), mimeType: getMimeType(img) } }));
    const response: any = await genAI.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: makeUserContents([{ text: prompt || "Extract all text from these images as accurately as possible." }, ...parts])
    });
    return getResponseText(response);
  } catch (error) {
    console.error("OCR Error:", error);
    return "Failed to perform OCR.";
  }
};

export const suggestRestock = async (inventoryData: any[], salesData: any[]): Promise<any> => {
    if (OFFLINE_MODE) {
        // Simple local logic: restock if stock < 10
        return inventoryData
            .filter(item => item.stock < 10)
            .map(item => ({
                sku: item.sku || item.id,
                name: item.name,
                reason: "Low stock (Offline Threshold)",
                suggestedQty: 50
            }));
    }

    try {
        const genAI = getClient();
        if (!genAI) throw new Error("AI Client unavailable");
        
        const prompt = `Analyze this inventory and sales data. Suggest items that need restocking. 
        Inventory: ${JSON.stringify(inventoryData.slice(0, 50))}
        Recent Sales: ${JSON.stringify(salesData.slice(0, 50))}
        Return JSON format: [{ "sku": "string", "name": "string", "reason": "string", "suggestedQty": number }]`;

        const response: any = await genAI.models.generateContent({ model: 'gemini-1.5-flash', contents: prompt });
        const text = getResponseText(response);
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch (error) {
        console.error("Restock Suggestion Error:", error);
        return [];
    }
};

export const suggestProductPricing = async (productName: string, totalCost: number, category: string, wastePercentage: number = 0): Promise<{
    suggestedPrice: number;
    margin: number;
    reasoning: string;
    tiers: { small: number; medium: number; large: number };
}> => {
    if (OFFLINE_MODE) {
        const basePrice = totalCost * 1.5;
        return {
            suggestedPrice: basePrice,
            margin: 33.3,
            reasoning: "Local calculation: Standard 50% markup applied (Offline Mode).",
            tiers: { small: basePrice, medium: basePrice * 0.95, large: basePrice * 0.9 }
        };
    }

    try {
        const genAI = getClient();
        if (!genAI) throw new Error("AI Client unavailable");
        const prompt = `Analyze pricing for a product with the following details:
        - Product Name: ${productName}
        - Total Production Cost: ${totalCost}
        - Category: ${category}
        - Historical Waste: ${wastePercentage}%
        
        Provide a suggested selling price, profit margin, reasoning for the suggestion (considering typical retail margins for this category), and bulk pricing tiers.
        Return ONLY a JSON object: { "suggestedPrice": number, "margin": number, "reasoning": "string", "tiers": { "small": number, "medium": number, "large": number } }`;

        const response: any = await genAI.models.generateContent({ model: 'gemini-1.5-flash', contents: prompt });
        const text = getResponseText(response);
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        return jsonMatch ? JSON.parse(jsonMatch[0]) : { suggestedPrice: totalCost * 1.5, margin: 33.3, reasoning: "Fallback", tiers: { small: totalCost * 1.5, medium: totalCost * 1.4, large: totalCost * 1.3 } };
    } catch (error) {
        console.error("AI Pricing Suggestion Error:", error);
        const basePrice = totalCost * 1.5;
        return {
            suggestedPrice: basePrice,
            margin: 33.3,
            reasoning: "Fallback suggestion based on standard 50% markup.",
            tiers: { small: basePrice, medium: basePrice * 0.95, large: basePrice * 0.9 }
        };
    }
};

/**
 * Generates a comprehensive Business Health Report using AI
 */
export const generateBusinessHealthReport = async (
    financeData: { invoices: any[], expenses: any[], income: any[], accounts: any[] },
    salesData: { sales: any[], customers: any[] },
    inventoryData: { inventory: any[] }
): Promise<string> => {
    if (OFFLINE_MODE) {
        // Return a deterministic local report based on data
        const totalSales = salesData.sales.reduce((sum, s) => sum + (s.totalAmount || s.total || 0), 0);
        const totalExpenses = financeData.expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
        const netProfit = totalSales - totalExpenses;
        const margin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0";
        
        return `# Offline Business Health Diagnostic

## Executive Summary
This report was generated locally in **OFFLINE MODE**. All analysis is based on your local database records.

## Financial Performance
- **Total Revenue:** ${totalSales.toLocaleString()}
- **Total Expenses:** ${totalExpenses.toLocaleString()}
- **Net Profit:** ${netProfit.toLocaleString()}
- **Profit Margin:** ${margin}%

## Strategic Insights
1. **Cash Flow:** Your net profit is ${netProfit > 0 ? 'positive' : 'negative'}. 
2. **Operations:** You have ${salesData.customers.length} customers and ${inventoryData.inventory.length} active inventory items.
3. **Recommendation:** ${netProfit > 0 ? 'Maintain current spending while exploring growth in top-selling categories.' : 'Review high-cost expense categories and optimize inventory turnover.'}

*Note: AI-powered deep analysis is disabled in offline mode to ensure data privacy and zero network overhead.*`;
    }

    try {
        const genAI = getClient();
        if (!genAI) throw new Error("AI Client unavailable");

        // Prepare data snapshots for AI (limited to avoid token limits)
        const snapshot = {
            summary: {
                totalInvoices: financeData.invoices.length,
                totalExpenses: financeData.expenses.length,
                totalCustomers: salesData.customers.length,
                inventoryItems: inventoryData.inventory.length
            },
            recentPerformance: {
                last10Invoices: financeData.invoices.slice(0, 10).map(i => ({ date: i.date, amount: i.totalAmount, status: i.status })),
                last10Expenses: financeData.expenses.slice(0, 10).map(e => ({ date: e.date, amount: e.amount, category: e.category }))
            },
            inventoryStatus: inventoryData.inventory.filter(i => i.stock <= i.minStockLevel).slice(0, 10).map(i => ({ name: i.name, stock: i.stock }))
        };

        const prompt = `Analyze the current state of this business based on the following data snapshot:
        ${JSON.stringify(snapshot, null, 2)}
        
        Please provide:
        1. **Executive Summary**: Overall health status (Excellent/Good/Warning/Critical).
        2. **Financial Analysis**: Revenue vs Expense trends and cash flow health.
        3. **Inventory Efficiency**: Stock turnover risks and critical replenishment needs.
        4. **Strategic Recommendations**: 3-5 actionable steps to improve profitability or efficiency.
        5. **Risk Assessment**: Potential threats identified from the data.
        
        Use professional language, clear headers, and bullet points.`;

        const response: any = await genAI.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: prompt,
            config: {
                systemInstruction: "You are a Chief Financial Officer and Strategic Business Consultant. Provide a deep, actionable, and professional business health analysis in Markdown format."
            }
        });
        return getResponseText(response) || "Failed to generate health report.";
    } catch (error) {
        console.error("Business Health Report AI Error:", error);
        return "## Error Generating Report\nUnable to reach AI services for business analysis. Please check your connectivity and API configuration.";
    }
};

/**
 * Analyzes forecasting data for inventory and cash flow
 */
export const analyzeForecastingData = async (
    type: 'Inventory' | 'CashFlow',
    data: any
): Promise<string> => {
    if (OFFLINE_MODE) return "Forecasting analysis is disabled in offline mode.";
    try {
        const genAI = getClient();

        const prompt = `Analyze this ${type} forecast data:
        ${JSON.stringify(data, null, 2)}
        
        Provide:
        1. **Key Insights**: What are the most important trends?
        2. **Critical Warnings**: Any immediate risks (e.g., stockouts, cash deficits)?
        3. **Recommendations**: Specific actions to take based on this forecast.
        
        Format in clean Markdown.`;

        const response: any = await genAI.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are a Supply Chain Analyst and Financial Controller. Analyze the provided forecast data and provide actionable insights."
            }
        });
        return getResponseText(response) || "No analysis available.";
    } catch (error) {
        console.error("Forecasting AI Analysis Error:", error);
        return "Error analyzing data. Please try again later.";
    }
};

/**
 * Analyzes expenses for anomalies and cost-saving opportunities
 */
export const analyzeExpenses = async (expenses: any[]): Promise<string> => {
    if (OFFLINE_MODE) return "Expense analysis is disabled in offline mode.";
    try {
        const genAI = getClient();
        const prompt = `Analyze these business expenses:
        ${JSON.stringify(expenses.slice(0, 100), null, 2)}
        
        Provide:
        1. **Spending Anomalies**: Any unusual patterns or suspicious entries?
        2. **Cost Optimization**: Where can the business save money?
        3. **Category Breakdown**: Which categories are growing too fast?
        4. **Budget Health**: Overall assessment of spending discipline.
        
        Format in clean Markdown with headers and bullet points.`;

        const response: any = await genAI.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are a Forensic Accountant and Cost Optimization Expert. Analyze the provided expense list and provide actionable insights."
            }
        });
        return getResponseText(response) || "No analysis available.";
    } catch (error) {
        console.error("Expense AI Analysis Error:", error);
        return "Error analyzing expenses. Please try again later.";
    }
};

/**
 * Answers a business question using the provided context data
 */
export const askBusinessQuestion = async (
    question: string,
    context: any
): Promise<string> => {
    if (OFFLINE_MODE) return "AI Q&A is unavailable in offline mode.";
    try {
        const genAI = getClient();
        const prompt = `Context Data:
        ${JSON.stringify(context, null, 2)}
        
        Question: ${question}
        
        Provide a concise, helpful answer. Use Markdown for formatting if needed.`;

        const response: any = await genAI.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: prompt,
            config: {
                systemInstruction: "You are an intelligent ERP Assistant. Answer the user's question accurately using the provided data context. If the data is missing, politely say you don't have enough information."
            }
        });
        return getResponseText(response) || "I'm sorry, I couldn't find an answer to that.";
    } catch (error) {
        console.error("AI Question Error:", error);
        return "Sorry, I'm having trouble accessing my intelligence right now.";
    }
};
