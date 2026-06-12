import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { OFFLINE_MODE } from '../constants';

/**
 * Generates production-ready C# code for the WPF Native Port.
 * Uses gemini-3-pro-preview for advanced architectural reasoning.
 */
export const generateWpfFile = async (filePath: string, context: string): Promise<string> => {
  if (OFFLINE_MODE) {
    return `// Offline desktop mode: AI-assisted WPF synthesis is unavailable.\n// Requested file: ${filePath}\n// Context snapshot:\n// ${String(context || '').split('\n').join('\n// ')}`;
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const isXAML = filePath.toLowerCase().endsWith('.xaml');
    const isModel = filePath.toLowerCase().includes('model') && !filePath.toLowerCase().includes('viewmodel');
    const isData = filePath.toLowerCase().includes('data') || filePath.toLowerCase().includes('context') || filePath.toLowerCase().includes('persistence');
    const isHardware = filePath.toLowerCase().includes('driver') || filePath.toLowerCase().includes('hook');
    
    const prompt = `
      System: PrimeBOOKS ERP Native Windows Port
      File: ${filePath}
      Target Architecture: .NET 8.0, WPF, MVVM
      Pattern: CommunityToolkit.Mvvm (Source Generators)
      Database Strategy: Support both SQL Server (Production) and SQLite (Offline/Local)
      
      PERFORMANCE & SCALABILITY FOCUS:
      - For Data Access: Implement IQueryable Paging (Skip/Take). Avoid ToList() before filtering.
      - Use AsNoTracking() for read-only reports to reduce memory footprint.
      - For heavy logic: Implement Task-based background processing with CancellationToken support.
      - For XAML: Ensure UI Virtualization is enabled for DataGrids (VirtualizingStackPanel).
      
      Requirements:
      ${isData 
        ? '- Implement using Entity Framework Core 8. Include DbContext logic that handles Decimal-to-Double mapping for SQLite if required. Support both Sqlite and SqlServer providers via dependency injection or configuration. Prevent N+1 with .Include() or explicit projections.' 
        : isModel
            ? '- Use C# 12 Primary Constructors. Use standard POCO patterns. Ensure fields match the existing system state provided in context: ' + context
            : isXAML 
                ? '- Use Modern Windows 11 Fluent UI (Mica effect, rounded corners, Segoe UI Variable font). Use XAML Styles and ControlTemplates. Enable VirtualizingStackPanel.IsVirtualizing="True".'
                : isHardware
                    ? '- Implement using native Win32/System.Devices namespaces for USB/Serial communication. Include async/await patterns for non-blocking I/O.'
                    : '- Use [ObservableProperty] and [RelayCommand] attributes from CommunityToolkit.Mvvm. Implement IAsyncRelayCommand for all service calls. Handle loading states for UI feedback.'}
      
      Context Summary: ${context}
      
      Important: Return ONLY the raw C# or XAML code. No markdown formatting. No commentary. File-scoped namespaces mandatory.
    `;

    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 15000 }
      }
    });

    return response.text || "// AI Synthesis failed. Check connectivity.";
  } catch (error) {
    console.error("Native Generator Error:", error);
    return `// Porting Error: ${error instanceof Error ? error.message : "Unknown System Failure"}`;
  }
};
