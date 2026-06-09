import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, FileText, Loader2, AlertTriangle, RefreshCw, Download } from 'lucide-react';
import type { DocType, FilePreviewDescriptor } from '../../../../stores/documentStore';
import type { PrimeDocData } from './schemas';
import { attachDocumentSecurity } from '../../../../utils/documentSecurity';
import { getStoredCompanyConfig, initializePrimePdfFonts } from './templateSettings';
import { hydrateCompanyPdfAssets } from '../../../../utils/companyAssetUtils';
import { NativePdfPreview } from './NativePdfPreview';
import { downloadPdfSource, getPdfErrorMessage, type PDFPreviewSource, resolvePdfFilePreviewSource } from './pdfPreviewUtils';
import { validateDocumentData } from './documentValidation';
import { getDeviceProfile } from '../../../../utils/documentPreview';

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  type?: DocType;
  data?: PrimeDocData | null;
  file?: FilePreviewDescriptor | null;
}

export const PreviewModal = ({ isOpen, onClose, type, data = null, file = null }: PreviewModalProps) => {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfSource, setPdfSource] = useState<PDFPreviewSource | null>(null);
  const [directPath, setDirectPath] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [genInfo, setGenInfo] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const rid = useRef(0);

  const previewTitle = React.useMemo(() => {
    if (file?.title) return file.title;
    if (type === 'FISCAL_REPORT' && data && 'reportName' in data) return String((data as any).reportName);
    if (type === 'SUBSCRIPTION') return 'Recurring Invoice Preview';
    if (type === 'POS_RECEIPT') return 'POS Receipt Preview';
    return 'Document Preview';
  }, [data, file?.title, type]);

  const generate = useCallback(async (id: number) => {
    if (!data && !file) { if (id === rid.current) setError('No document data to preview'); return; }

    try {
      if (file) {
        const src = await resolvePdfFilePreviewSource(file, abortRef.current?.signal);
        if (id !== rid.current) return;
        setPdfSource(src);
        return;
      }
      if (!data || !type) throw new Error('Missing document data or document type');

      console.log('[Preview Payload]', JSON.stringify({
        documentType: type,
        itemsLength: Array.isArray((data as any).items) ? (data as any).items.length : 'missing',
        hasCustomer: !!((data as any).clientName || (data as any).customerName),
        totalAmount: (data as any).totalAmount,
        documentNumber: (data as any).number || (data as any).invoiceNumber,
        dataKeys: Object.keys(data as any),
        timestamp: new Date().toISOString(),
      }));

      const semanticCheck = validateDocumentData(type, data);
      if (!semanticCheck.valid) {
        setError(semanticCheck.error || 'Document data validation failed');
        setPreparing(false);
        return;
      }

      setGenInfo('Preparing assets…');
      const config = await hydrateCompanyPdfAssets(getStoredCompanyConfig());
      await initializePrimePdfFonts();
      setGenInfo('Securing document…');
      const secured = await attachDocumentSecurity(data as any);
      setGenInfo('Generating PDF…');
      const start = Date.now();
      const { generatePrimeDocumentBlob } = await import('./generatePrimeDocumentBlob');
      const blob = await generatePrimeDocumentBlob(type, secured as PrimeDocData, config);
      const ms = Date.now() - start;
      setGenInfo(`Generated in ${ms}ms`);
      if (id !== rid.current) return;

      setPdfSource(blob);
    } catch (err: any) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (id !== rid.current) return;
      setError(getPdfErrorMessage(err));
    } finally {
      if (id === rid.current) setPreparing(false);
    }
  }, [data, file, type]);

  useEffect(() => {
    if (!isOpen) {
      rid.current += 1; abortRef.current?.abort(); abortRef.current = null;
      setPdfSource(null); setDirectPath(null); setError(null); setGenInfo(''); return;
    }
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    rid.current += 1; const id = rid.current;
    setPreparing(true); setError(null); setPdfSource(null); setDirectPath(null); setGenInfo('');
    const t = setTimeout(() => generate(id), 80);
    return () => { rid.current += 1; abortRef.current?.abort(); clearTimeout(t); };
  }, [isOpen, data, file, type, generate, retryKey]);

  useEffect(() => {
    if (!isOpen) return;
    const down = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [isOpen, onClose]);

  const handleRetry = () => { setError(null); setPreparing(true); setRetryKey((k) => k + 1); };
  const handleDownload = () => {
    if (pdfSource) downloadPdfSource(pdfSource, previewTitle).catch((e) => setError(getPdfErrorMessage(e)));
  };

  if (!isOpen) return null;

  const hasContent = pdfSource || directPath;

  const device = getDeviceProfile();
  const isTabletOrMobile = device.isTablet || device.isMobile;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#8d8880]/35 p-2 sm:p-3 md:p-4 backdrop-blur-[2px]">
      <div
        className="flex w-full flex-col overflow-hidden rounded-2xl border border-[#d7d1c7] bg-[#f3f0ea] shadow-2xl max-w-full sm:max-w-xl md:max-w-3xl lg:max-w-5xl"
        style={{ height: isTabletOrMobile ? '98vh' : 'min(90vh, 800px)' }}
      >
        {type !== 'ACCOUNT_STATEMENT' && type !== 'ACCOUNT_STATEMENT_SUMMARY' && (
        <div className="flex shrink-0 items-center justify-between border-b border-[#d7d1c7] bg-[#f6f3ee] px-5 py-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
              <FileText className="h-4 w-4" />
            </div>
            <div className="overflow-hidden">
              <h2 className="truncate text-sm font-bold text-slate-800">{previewTitle}</h2>
              {(genInfo || preparing) && (
                <p className="truncate text-[10px] text-slate-400">{genInfo || 'Initializing…'}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {hasContent && (
              <button 
                onClick={handleDownload}
                className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 transition-all hover:bg-blue-100 hover:text-blue-700"
              >
                <Download size={14}/>
                <span>Download</span>
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Close (Esc)">
              <X className="h-4 w-4" />
            </button>
          </div>
          </div>
        )}

        <div className="flex flex-1 flex-col overflow-hidden bg-[#b5b0a8]">
          {preparing ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-slate-900" />
                <p className="mt-3 text-sm font-semibold text-slate-800">Preparing document…</p>
                <p className="mt-1 text-xs text-slate-400">{genInfo || 'Initializing preview pipeline'}</p>
              </div>
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center p-6">
              <div className="w-full max-w-sm text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                   <AlertTriangle className="h-6 w-6" />
                </div>
                <p className="mt-3 text-sm font-bold text-slate-800">Preview failed</p>
                <p className="mt-1 text-xs text-slate-500">{error}</p>
                <button onClick={handleRetry} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </button>
              </div>
            </div>
          ) : pdfSource || directPath ? (
            <NativePdfPreview
              source={pdfSource}
              directPath={directPath}
              title={previewTitle}
              hideHeader={true}
              className="h-full"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-400">
              <div className="text-center">
                <FileText className="mx-auto h-10 w-10 opacity-40" />
                <p className="mt-2 text-sm">No document to preview</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default PreviewModal;
