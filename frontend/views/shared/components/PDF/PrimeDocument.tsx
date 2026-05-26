import React from 'react';
import { Document, Page, View, Text, Font, Image } from '@react-pdf/renderer';
import { docStyles as s } from './styles.ts';
import { PrimeDocData } from './schemas.ts';
import { CompanyConfig } from '../../../../types.ts';
import { resolvePdfLogoSource, resolvePdfQrCodeSource } from '../../../../utils/companyAssetUtils.ts';
import {
  getDefaultPaymentTermsLabel,
  getStoredCompanyConfig,
  resolvePrimeTemplateSettings,
} from './templateSettings.ts';

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

// Disable hyphenation
Font.registerHyphenationCallback(word => [word]);

const renderQrImage = (qrCodeDataUrl?: string | null, size: number = 52) => {
  const resolvedQrCode = resolvePdfQrCodeSource(qrCodeDataUrl);
  if (!resolvedQrCode) return null;

  return <Image src={resolvedQrCode} style={{ width: size, height: size }} />;
};

// Format amount helper
const formatAmount = (amount: number) => {
  return (amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const toTitleCase = (str: string) => {
  return str.toLowerCase().split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const formatDateOnly = (value?: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 'N/A';

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }

  const simpleDate = normalized.match(/^(\d{4}-\d{2}-\d{2})/);
  if (simpleDate) {
    const dateOnly = new Date(`${simpleDate[1]}T00:00:00`);
    if (!Number.isNaN(dateOnly.getTime())) {
      return dateOnly.toLocaleDateString();
    }
  }

  const beforeComma = normalized.split(',')[0]?.trim();
  return beforeComma || normalized;
};

const getStatusTone = (status?: string) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'paid' || normalized === 'active') {
    return { border: '#10b981', text: '#059669' };
  }

  if (normalized === 'partial' || normalized === 'partially paid' || normalized === 'partially_paid' || normalized === 'paused' || normalized === 'processing') {
    return { border: '#f59e0b', text: '#d97706' };
  }

  if (normalized === 'overdue') {
    return { border: '#dc2626', text: '#b91c1c' };
  }

  return { border: '#ef4444', text: '#dc2626' };
};

const formatSecurityTimestamp = (value?: string) => {
  const parsed = value ? new Date(value) : new Date();
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }

  return String(value || 'Unknown time');
};

import { StatementSummaryTemplate } from './StatementSummaryTemplate.tsx';

interface DocProps {
  type: 'INVOICE' | 'WORK_ORDER' | 'PO' | 'DELIVERY_NOTE' | 'QUOTATION' | 'RECEIPT' | 'SUPPLIER_PAYMENT' | 'POS_RECEIPT' | 'ACCOUNT_STATEMENT' | 'EXAMINATION_INVOICE' | 'ACCOUNT_STATEMENT_SUMMARY' | 'FISCAL_REPORT' | 'SALES_EXCHANGE' | 'ORDER' | 'SALES_ORDER' | 'SUBSCRIPTION';
  data: PrimeDocData;
  configOverride?: CompanyConfig | null;
}

const SecurityFooter = ({
  data,
  companyName,
  legalFooterLine1,
  legalFooterLine2,
  fontScale = 1,
}: {
  data: any;
  companyName: string;
  legalFooterLine1: string;
  legalFooterLine2: string;
  fontScale?: number;
}) => {
  const footerQrSize = 50;
  const documentNumber = String(
    data?.number
    || data?.invoiceNumber
    || data?.orderNumber
    || data?.receiptNumber
    || data?.paymentId
    || data?.exchangeNumber
    || data?.reportName
    || 'N/A'
  ).trim() || 'N/A';
  const createdBy = String(
    data?.createdByName
    || data?.createdBy
    || data?.created_by
    || data?.cashierName
    || 'System User'
  ).trim() || 'System User';
  const createdOn = formatSecurityTimestamp(
    data?.createdAtIso
    || data?.createdAt
    || data?.created_at
    || data?.date
  );
  const qrCodeDataUrl = resolvePdfQrCodeSource(String(data?.securityQrCodeDataUrl || '').trim());

  return (
    <View style={s.securityFooter} fixed>
      <View style={s.securityFooterText}>
        <Text style={[s.securityFooterLine, { fontSize: 10 * fontScale, lineHeight: 1.4 }]}>{legalFooterLine1}</Text>
        <Text style={[s.securityFooterLine, { marginTop: 2, fontSize: 10 * fontScale, lineHeight: 1.4 }]}>{legalFooterLine2}</Text>
      </View>

      <View
        style={[
          s.securityQrPanel,
          {
            width: footerQrSize,
            alignItems: 'flex-end',
            borderTopWidth: 0,
            borderRightWidth: 0,
            borderBottomWidth: 0,
            borderLeftWidth: 0,
            backgroundColor: 'transparent',
            paddingTop: 0,
            paddingRight: 0,
            paddingBottom: 0,
            paddingLeft: 0,
          },
        ]}
      >
        {!!qrCodeDataUrl ? (
          <Image src={qrCodeDataUrl} style={[s.securityQrImage, { width: footerQrSize, height: footerQrSize, marginBottom: 0 }]} />
        ) : null}
      </View>
    </View>
  );
};

const CleanInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: PrimeDocData;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data as any;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#5a9e96';

  let docTitle = 'INVOICE';
  if (type === 'QUOTATION') docTitle = 'QUOTATION';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'SALES ORDER';
  else if (type === 'PO') docTitle = 'PURCHASE ORDER';
  else if (type === 'SUBSCRIPTION') docTitle = 'RECURRING INVOICE';

  // Invoice Details
  const invoiceNumber = dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime().toString();
  const invoiceDate = dataAny.date || new Date().toLocaleDateString();
  const dueDate = dataAny.dueDate;
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || dataAny.proofOfDelivery?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || dataAny.proofOfDelivery?.address || dataAny.proofOfDelivery?.deliveryLocation || ''
  ).trim();
  const resolvedRecipientPhone = String(
    dataAny.phone || dataAny.customerPhone || dataAny.customer_phone || dataAny.schoolPhone || dataAny.school_phone || dataAny.vendorPhone || dataAny.vendor_phone || dataAny.supplierPhone || dataAny.supplier_phone || dataAny.recipientPhone || dataAny.recipient_phone || dataAny.proofOfDelivery?.receiverPhone || dataAny.proofOfDelivery?.recipientPhone || dataAny.proofOfDelivery?.phone || ''
  ).trim();

  // Financials
  const items = dataAny.items || [];
  const subtotal = dataAny.subtotal || 0;
  const amountPaid = dataAny.amountPaid || 0;
  const totalAmount = dataAny.totalAmount || subtotal;
  const tax = dataAny.tax || 0;
  const discount = dataAny.discount || 0;
  
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedWalletBalance = Number(dataAny?.walletBalance || 0);
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny?.totalAmount || 0) - Number(dataAny?.amountPaid || 0));

  const showPaymentTerms = templateSettings.showPaymentTerms;
  const paymentTermsLabel = String(dataAny?.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);
   
  const companyEnquiryLine = [companyName, companyAddress].filter(Boolean).join(', ');
  const companyFlatContact1 = `${companyEnquiryLine}, ${companyPhone}`;
  const legalFooterLine1 = showPaymentTerms
    ? `This is a computer-generated document. Payment terms: ${paymentTermsLabel}.`
    : 'This is a computer-generated document. For enquiries contact:';
  const legalFooterLine2 = `${companyFlatContact1}`;

  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
      
    return (
      <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#e0e0e0', minHeight: 24, alignItems: 'center', paddingVertical: 4 }}>
        <Text style={{ flex: 2, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155' }}>{formattedDesc}</Text>
        <Text style={{ width: 60, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{item.qty}</Text>
        <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toFixed(2)}</Text>
        <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, color: '#334155', textAlign: 'right' }}>{currency} {item.total.toFixed(2)}</Text>
      </View>
    );
  };

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ padding: 40, fontFamily: templateSettings.fontFamily }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 }}>
           <View style={{ flex: 1 }}>
              {!!logo ? (
                <Image src={logo} style={{ width: templateSettings.logoWidth, marginBottom: 10 }} />
              ) : (
                <Text style={{ fontSize: templateSettings.companyNameFontSize, fontWeight: 'bold', color: accentColor, marginBottom: 8 }}>{companyName}</Text>
              )}
              <Text style={{ fontSize: 9 * fontScale, color: '#64748b', lineHeight: 1.4 }}>{companyAddress}</Text>
              <Text style={{ fontSize: 9 * fontScale, color: '#64748b', marginTop: 2 }}>{companyPhone}</Text>
              {companyEmail !== 'N/A' && <Text style={{ fontSize: 9 * fontScale, color: '#64748b', marginTop: 2 }}>{companyEmail}</Text>}
           </View>
           <View style={{ flex: 1, alignItems: 'flex-end', textAlign: 'right' }}>
              <Text style={{ fontSize: 26 * fontScale, fontWeight: '300', color: '#1e293b', letterSpacing: 1.5 }}>{docTitle}</Text>
              <Text style={{ fontSize: 11 * fontScale, color: '#475569', marginTop: 8, fontWeight: 'bold' }}>{invoiceNumber}</Text>
           </View>
        </View>

        {/* Company and Client Info */}
        <View style={{ flexDirection: 'row', marginBottom: 30, gap: 30 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6, letterSpacing: 1 }}>Bill To</Text>
            <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b', marginBottom: 4 }}>{resolvedRecipientName || 'N/A'}</Text>
            {!!resolvedRecipientAddress && <Text style={{ fontSize: 10 * fontScale, color: '#475569', marginBottom: 3, lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
            {!!resolvedRecipientPhone && <Text style={{ fontSize: 10 * fontScale, color: '#475569' }}>{resolvedRecipientPhone}</Text>}
          </View>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 1 }}>Date</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold' }}>{invoiceDate}</Text>
            </View>
            {Boolean(templateSettings.showDueDate) && !!dueDate && (
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 3, letterSpacing: 1 }}>Due Date</Text>
                <Text style={{ fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold' }}>{dueDate}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            {!!dataAny.status && (
              <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 4, borderWidth: 1, borderColor: getStatusTone(dataAny.status).border, backgroundColor: getStatusTone(dataAny.status).border + '15' }}>
                <Text style={{ fontSize: 12 * fontScale, color: getStatusTone(dataAny.status).text, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>{dataAny.status.toUpperCase()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', backgroundColor: accentColor, borderRadius: 4, minHeight: 28, alignItems: 'center' }}>
            <Text style={{ flex: 2, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Item Description</Text>
            <Text style={{ width: 60, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Qty</Text>
            <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Unit Price</Text>
            <Text style={{ width: 100, paddingHorizontal: 8, fontSize: 10 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Amount</Text>
          </View>
          {items.map(renderRow)}
        </View>

        {/* Totals Section */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
          <View style={{ flex: 1.5, paddingRight: 40 }}>
             {/* Notes region */}
             {!!dataAny.notes && (
                <View>
                   <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Notes</Text>
                   <Text style={{ fontSize: 10 * fontScale, color: '#475569', lineHeight: 1.4 }}>{dataAny.notes}</Text>
                </View>
             )}
          </View>

          <View style={{ flex: 1, minWidth: 220 }}>
            <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
              <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Subtotal</Text>
              <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
            {discount > 0 && (
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Discount</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>-{currency} {discount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {tax > 0 && (
              <View style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Tax</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            
            {type !== 'INVOICE' && type !== 'ORDER' && type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: 1, borderColor: '#e2e8f0', marginTop: 4 }}>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b' }}>Total Amount</Text>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#1e293b', textAlign: 'right' }}>{currency} {(totalAmount).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 4, marginTop: (type === 'INVOICE' || type === 'ORDER') ? 4 : 0, borderTopWidth: (type === 'INVOICE' || type === 'ORDER') ? 1 : 0, borderColor: '#e2e8f0', paddingTop: (type === 'INVOICE' || type === 'ORDER') ? 8 : 4 }}>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#475569' }}>Amount Paid</Text>
                <Text style={{ flex: 1, fontSize: 10 * fontScale, color: '#1e293b', fontWeight: 'bold', textAlign: 'right' }}>{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            
            
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: accentColor + '15', marginTop: 8, borderRadius: 4, paddingHorizontal: 8 }}>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor }}>Balance Due</Text>
                <Text style={{ fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor, textAlign: 'right' }}>
                    {currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
            )}
            
            {type === 'SUBSCRIPTION' && (
              <View style={{ flexDirection: 'row', paddingVertical: 8, backgroundColor: accentColor + '15', marginTop: 8, borderRadius: 4, paddingHorizontal: 8 }}>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor }}>Recurring Total</Text>
                <Text style={{ flex: 1, fontSize: 11 * fontScale, fontWeight: 'bold', color: accentColor, textAlign: 'right' }}>
                    {currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Outstanding Balance Statement - shown on INVOICE only when totalCustomerOutstanding is available */}
        {type === 'INVOICE' && showInvoiceBalances && (dataAny?.totalCustomerOutstanding ?? null) !== null && (() => {
          const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
          const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
              <Text style={{ fontSize: 9 * fontScale, color: '#0369a1', lineHeight: 1.4 }}>
                {'Your overall outstanding balance is '}
                <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                {` as of ${todayStr}`}
              </Text>
            </View>
          );
        })()}

        {/* Footer info (Notes etc) */}
        <View style={{ marginTop: 40, flex: 1 }}>
          {Boolean(showPaymentTerms) && !!paymentTermsLabel && (
            <View style={{ marginBottom: 15 }}>
              <Text style={{ fontSize: 8 * fontScale, fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Payment Terms</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#475569', lineHeight: 1.4 }}>{paymentTermsLabel}</Text>
            </View>
          )}
          {(!config?.vat?.enabled) && (
            <View>
               <Text style={{ fontSize: 9 * fontScale, color: '#94a3b8', fontStyle: 'italic' }}>* Not VAT registered</Text>
            </View>
          )}
        </View>

        {/* Use the standard Security Footer at bottom */}
        <SecurityFooter
          data={dataAny}
          companyName={companyName}
          legalFooterLine1={legalFooterLine1}
          legalFooterLine2={legalFooterLine2}
          fontScale={fontScale}
        />
      </Page>
    </Document>
  );
};

const ModernInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: PrimeDocData;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data as any;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyPhone = config?.phone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#739F99';
  const dueDate = dataAny.dueDate;

  let docTitle = 'Invoice';
  if (type === 'QUOTATION') docTitle = 'Quotation Document';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'Sales Order';
  else if (type === 'PO') docTitle = 'Purchase Order';
  else if (type === 'SUBSCRIPTION') docTitle = 'Recurring Invoice';
  else if (type === 'INVOICE') docTitle = 'Invoice Service';
  else {
    const titleCased = type.toLowerCase().split(/[_\s]+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    docTitle = titleCased || 'Document';
  }

  const titleWords = docTitle.split(' ');
  const titleFirst = titleWords[0];
  const titleRest = titleWords.slice(1).join(' ');

  // Invoice Details
  const invoiceNumber = dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime().toString();
  const invoiceDate = dataAny.date || new Date().toLocaleDateString();
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || dataAny.proofOfDelivery?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || dataAny.proofOfDelivery?.address || dataAny.proofOfDelivery?.deliveryLocation || ''
  ).trim();

  // Financials
  const items = dataAny.items || [];
  const subtotal = dataAny.subtotal || 0;
  const amountPaid = dataAny.amountPaid || 0;
  const totalAmount = dataAny.totalAmount || subtotal;
  const tax = dataAny.tax || 0;
  const discount = dataAny.discount || 0;
  
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny?.totalAmount || 0) - Number(dataAny?.amountPaid || 0));
  const outstandingDisplay = showInvoiceBalances && type === 'INVOICE' ? resolvedOutstandingBalance : (totalAmount - amountPaid);
  const paymentTermsLabel = String(dataAny?.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);

  const qrCodeDataUrl = resolvePdfQrCodeSource(dataAny.securityQrCodeDataUrl);

  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
    
    const bgColor = i % 2 !== 0 ? '#F5F5F5' : 'transparent';
      
    return (
      <View key={i} style={{ flexDirection: 'row', backgroundColor: bgColor, minHeight: 28, alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4 }}>
        <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{formattedDesc}</Text>
        <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{item.qty}</Text>
        <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>
            {currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}
        </Text>
        <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>
            {currency} {item.total.toLocaleString('en-US', {minimumFractionDigits: 2})}
        </Text>
      </View>
    );
  };

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ paddingVertical: 45, paddingHorizontal: 40, fontFamily: templateSettings.fontFamily, backgroundColor: '#FFFFFF' }}>
        
{/* Centered Logo & Company Header */}
        <View style={{ alignItems: 'center', marginBottom: 1.5 }}>
          {!!logo ? (
             <Image src={logo} style={{ width: templateSettings.logoWidth }} />
           ) : (
             <Text style={{ color: '#222222', fontSize: templateSettings.logoWidth * 0.4, fontWeight: 'bold' }}>{companyName.charAt(0)}</Text>
           )}
        </View>

        {/* Invoice Huge Title */}
        <View style={{ alignItems: 'center', marginBottom: 2 }}>
          <Text style={{ fontSize: 48 * fontScale, color: '#111111' }}>
            <Text style={{ fontWeight: 'heavy' }}>{titleFirst}</Text>
            {!!titleRest && <Text style={{ fontStyle: 'italic', fontWeight: 'normal', color: '#333333' }}> {titleRest}</Text>}
          </Text>
        </View>

        {/* Info Row: Number / Date */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 30, marginBottom: 40 }}>
          <Text style={{ fontSize: 12 * fontScale, color: '#222222' }}>
            <Text style={{ fontWeight: 'bold' }}>{type === 'INVOICE' ? 'Invoice Number:' : 'Reference Number:'}</Text> {invoiceNumber}
          </Text>
          <Text style={{ fontSize: 12 * fontScale, color: '#222222' }}>
            <Text style={{ fontWeight: 'bold' }}>{type === 'INVOICE' ? 'Invoice Date:' : 'Date:'}</Text> {invoiceDate}
          </Text>
        </View>

        {/* Columns: Payment Info vs Bill To */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 30 }}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <View style={{ backgroundColor: accentColor, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', marginBottom: 12, minWidth: 150 }}>
              <Text style={{ color: '#ffffff', fontSize: 10 * fontScale, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>COMPANY INFO</Text>
            </View>
            {companyPhone !== 'N/A' && <Text style={{ fontSize: 11 * fontScale, color: '#333333', marginBottom: 3 }}>{companyPhone}</Text>}
            {companyEmail !== 'N/A' && <Text style={{ fontSize: 11 * fontScale, color: '#333333', marginBottom: 3 }}>{companyEmail}</Text>}
          </View>
          
          <View style={{ flex: 1 }}>
            <View style={{ backgroundColor: accentColor, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-end', marginBottom: 12, minWidth: 150 }}>
              <Text style={{ color: '#ffffff', fontSize: 10 * fontScale, fontWeight: 'bold', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 }}>BILL TO</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 12 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 4 }}>{resolvedRecipientName}</Text>
              {!!resolvedRecipientAddress && <Text style={{ fontSize: 11 * fontScale, color: '#333333', textAlign: 'right', lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
            </View>
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', backgroundColor: accentColor, paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center' }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Item Description</Text>
            <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Qty.</Text>
            <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff' }}>Unit Price</Text>
            <Text style={{ width: 110, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#ffffff', textAlign: 'right' }}>Amount</Text>
          </View>
          {items.map(renderRow)}
          
          {/* Total Payment Gray Row */}
          <View style={{ flexDirection: 'row', backgroundColor: '#D9DEDE', paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', marginTop: 4 }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#111111' }}>Total Payment</Text>
            <Text style={{ width: 60, paddingHorizontal: 4, fontSize: 11 * fontScale, color: '#111111' }}>-</Text>
            <Text style={{ width: 100, paddingHorizontal: 4, fontSize: 11 * fontScale, color: '#111111' }}>-</Text>
            <Text style={{ width: 100, paddingHorizontal: 4, fontSize: 11 * fontScale, fontWeight: 'bold', color: '#111111', textAlign: 'right' }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 15 }}>
          {/* Notes Bottom Left */}
          <View style={{ width: 200 }}>
             {!!dataAny.notes && (
                <View style={{ marginTop: 10 }}>
                   <Text style={{ fontSize: 12 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 6 }}>Notes:</Text>
                   <Text style={{ fontSize: 10 * fontScale, color: '#333333', lineHeight: 1.5 }}>{dataAny.notes}</Text>
                   <View style={{ width: '100%', height: 1, backgroundColor: '#111111', marginTop: 15 }} />
                </View>
             )}
          </View>

          {/* Totals Section */}
          <View style={{ width: 220 }}>
            {tax > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Tax</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {discount > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Discount</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>-{currency} {discount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            {amountPaid > 0 && (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingRight: 4 }}>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>Amount Paid</Text>
                <Text style={{ color: '#333333', fontSize: 11 * fontScale }}>-{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#Dce1e1', paddingVertical: 8, paddingHorizontal: 6, marginTop: 4 }}>
              <Text style={{ color: '#111111', fontWeight: 'bold', fontSize: 12 * fontScale }}>
                Balance Due
              </Text>
              <Text style={{ color: '#111111', fontWeight: 'bold', fontSize: 12 * fontScale }}>
                {currency} {(totalAmount - amountPaid).toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            </View>
            
          </View>
        </View>

        {/* Outstanding Balance Statement - variant 2 */}
        {type === 'INVOICE' && showInvoiceBalances && (dataAny?.totalCustomerOutstanding ?? null) !== null && (() => {
          const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
          const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
          return (
            <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
              <Text style={{ fontSize: 9 * fontScale, color: '#0369a1', lineHeight: 1.4 }}>
                {'Your overall outstanding balance is '}
                <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                {` as of ${todayStr}`}
              </Text>
            </View>
          );
        })()}

        {/* Footer info (QR and Signature) */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 40, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ marginRight: 15 }}>
               {renderQrImage(qrCodeDataUrl, 64) || <View style={{ width: 64, height: 64, backgroundColor: '#eeeeee' }} />}
            </View>
            <View style={{ justifyContent: 'center' }}>
              <Text style={{ fontWeight: 'bold', fontSize: 11 * fontScale, color: '#111111', marginBottom: 4 }}>More Info:</Text>
              {companyPhone !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#333333', marginBottom: 2 }}>{companyPhone}</Text>}
              {companyEmail !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#333333' }}>{companyEmail}</Text>}
            </View>
          </View>

          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <Text style={{ fontSize: 11 * fontScale, color: '#222222', marginBottom: 10 }}>{dueDate ? `Due Date: ${dueDate}` : `Date: ${invoiceDate}`}</Text>
            <View style={{ width: '100%', height: 40, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{fontFamily: templateSettings.fontFamily, fontStyle: 'italic', fontSize: 26, color: '#111111'}}>{companyName.split(' ')[0]}</Text>
            </View>
            <View style={{ width: '100%', height: 1.5, backgroundColor: '#444444', marginTop: 10, marginBottom: 8 }} />
          </View>
        </View>

      </Page>
    </Document>
  );
};

const ProfessionalInvoiceTemplate = ({
  type,
  data,
  config,
  templateSettings
}: {
  type: string;
  data: PrimeDocData;
  config: CompanyConfig | null;
  templateSettings: ReturnType<typeof resolvePrimeTemplateSettings>;
}) => {
  const dataAny = data as any;
  const fontScale = templateSettings.bodyFontSize / 12;

  // Company Details
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';
  const currency = config?.currencySymbol || 'K';
  
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const accentColor = templateSettings.accentColor || '#E8450A';

  let docTitle = 'INVOICE';
  if (type === 'QUOTATION') docTitle = 'QUOTATION';
  else if (type === 'ORDER' || type === 'SALES_ORDER') docTitle = 'SALES ORDER';
  else if (type === 'PO') docTitle = 'PURCHASE ORDER';
  else if (type === 'SUBSCRIPTION') docTitle = 'RECURRING INVOICE';

  // Invoice Details
  const invoiceNumber = dataAny.invoiceNumber || dataAny.orderNumber || dataAny.number || dataAny.quotationNumber || new Date().getTime().toString();
  const invoiceDate = dataAny.date || new Date().toLocaleDateString();
  const dueDate = dataAny.dueDate;
  
  const docTitleForMeta = `${docTitle} ${invoiceNumber}`;
  
  // Recipient Details
  const resolvedRecipientName = String(
    dataAny.clientName || dataAny.customerName || dataAny.customer_name || dataAny.schoolName || dataAny.school_name || dataAny.recipientName || dataAny.recipient_name || dataAny.vendorName || dataAny.vendor_name || dataAny.supplierName || dataAny.supplier_name || dataAny.proofOfDelivery?.receivedBy || dataAny.receivedBy || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address || dataAny.customerAddress || dataAny.customer_address || dataAny.billingAddress || dataAny.billing_address || dataAny.shippingAddress || dataAny.shipping_address || dataAny.schoolAddress || dataAny.school_address || dataAny.vendorAddress || dataAny.vendor_address || dataAny.supplierAddress || dataAny.supplier_address || dataAny.proofOfDelivery?.address || dataAny.proofOfDelivery?.deliveryLocation || ''
  ).trim();

  // Financials
  const items = dataAny.items || [];
  const subtotal = dataAny.subtotal || 0;
  const amountPaid = dataAny.amountPaid || 0;
  const totalAmount = dataAny.totalAmount || subtotal;
  const tax = dataAny.tax || 0;
  const discount = dataAny.discount || 0;
  
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedOutstandingBalance = Math.max(0, Number(dataAny?.totalAmount || 0) - Number(dataAny?.amountPaid || 0));
  const outstandingDisplay = showInvoiceBalances && type === 'INVOICE' ? resolvedOutstandingBalance : (totalAmount - amountPaid);
  
  const renderRow = (item: any, i: number) => {
    const isService = item.category === 'service' || item.type === 'service' || item.isService === true;
    let formattedDesc = item.desc || item.name;
    if (isService) {
      const totalPages = item.totalPages || item.pages || 0;
      const copies = item.copies || item.qty || 1;
      const itemName = item.name || item.desc || 'Service';
      if (totalPages > 0) {
        formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
      }
    }
      
    return (
      <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eeeeee', minHeight: 24, alignItems: 'center', paddingVertical: 5 }}>
        <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333' }}>{formattedDesc}</Text>
        <Text style={{ width: 50, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{item.qty}</Text>
        <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{currency} {(item.price || (item.qty ? item.total / item.qty : 0)).toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
        <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 10 * fontScale, color: '#333333', textAlign: 'right' }}>{currency} {item.total.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
      </View>
    );
  };

  return (
    <Document title={docTitleForMeta} author={companyName}>
      <Page size="A4" style={{ padding: 40, fontFamily: templateSettings.fontFamily, backgroundColor: '#ffffff' }}>
        {/* Top Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 30 }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {!!logo ? (
              <Image src={logo} style={{ width: templateSettings.logoWidth }} />
            ) : (
              <Text style={{ color: '#222222', fontSize: templateSettings.logoWidth * 0.4, fontWeight: 'bold' }}>{companyName.charAt(0)}</Text>
            )}
          </View>
          <View style={{ textAlign: 'right', alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 13 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 2 }}>{companyName}</Text>
            <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyAddress}</Text>
            <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyPhone}</Text>
            {companyEmail !== 'N/A' && <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{companyEmail}</Text>}
          </View>
        </View>

        {/* Main Row / Client Info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 25 }}>
          <View>
            <Text style={{ fontSize: 9 * fontScale, color: '#999999', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 4 }}>Client</Text>
            <Text style={{ fontSize: 14 * fontScale, fontWeight: 'bold', color: '#111111', marginBottom: 2 }}>{resolvedRecipientName}</Text>
            {!!resolvedRecipientAddress && <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{resolvedRecipientAddress}</Text>}
          </View>
          <View>
            <Text style={{ fontSize: 32 * fontScale, fontWeight: 'bold', color: '#cccccc', letterSpacing: 2 }}>{docTitle}</Text>
          </View>
        </View>

        {/* Due Row */}
        <View style={{ flexDirection: 'row', alignItems: 'stretch', marginBottom: 25 }}>
          <View style={{ backgroundColor: accentColor, paddingVertical: 12, paddingHorizontal: 16, flex: 1, justifyContent: 'center' }}>
            {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' ? (
              <Text style={{ fontSize: 16 * fontScale, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }}>
                {type === 'INVOICE' && showInvoiceBalances ? 'OUTSTANDING' : 'DUE'} — {currency} {outstandingDisplay.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            ) : (
              <Text style={{ fontSize: 16 * fontScale, fontWeight: 'bold', color: '#ffffff', letterSpacing: 1 }}>
                TOTAL — {currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}
              </Text>
            )}
          </View>
          <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: accentColor, paddingVertical: 10, paddingHorizontal: 14, minWidth: 160, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Date</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{invoiceDate}</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Ref #</Text>
              <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{invoiceNumber}</Text>
            </View>
            {!!dueDate && (
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                 <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Due</Text>
                 <Text style={{ fontSize: 10 * fontScale, color: '#444444' }}>{dueDate}</Text>
               </View>
            )}
          </View>
        </View>

        {/* Table representation */}
        <View style={{ marginBottom: 15 }}>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1.5, borderBottomColor: '#222222', paddingBottom: 6 }}>
            <Text style={{ flex: 2.2, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase' }}>Item Description</Text>
            <Text style={{ width: 50, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Qty</Text>
            <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Unit</Text>
            <Text style={{ width: 80, paddingHorizontal: 4, fontSize: 9 * fontScale, fontWeight: 'bold', color: '#666666', letterSpacing: 1, textTransform: 'uppercase', textAlign: 'right' }}>Price</Text>
          </View>
          {items.map(renderRow)}
        </View>

        {/* Totals Section */}
        <View style={{ alignSelf: 'flex-end', width: 220, marginBottom: 25 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
            <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Sub Total —</Text>
            <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>{currency} {subtotal.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          </View>
          {tax > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Tax —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>{currency} {tax.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          {discount > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Discount —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>-{currency} {discount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          {amountPaid > 0 && (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
              <Text style={{ color: '#999999', fontSize: 10 * fontScale }}>Amount Paid —</Text>
              <Text style={{ color: '#555555', fontSize: 10 * fontScale }}>-{currency} {amountPaid.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: '#dddddd' }}>
            <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>Total Grand —</Text>
            <Text style={{ color: accentColor, fontWeight: 'bold', fontSize: 12 * fontScale }}>{currency} {totalAmount.toLocaleString('en-US', {minimumFractionDigits: 2})}</Text>
          </View>
        </View>

        {/* Bottom Row */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 15, paddingTop: 20, borderTopWidth: 0.5, borderTopColor: '#eeeeee', flex: 1 }}>
          <View style={{ flex: 1 }}>
            {!!dataAny.notes && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 9 * fontScale, fontWeight: 'bold', color: '#999999', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 1 }}>Notes</Text>
                <Text style={{ fontSize: 10 * fontScale, color: '#444444', lineHeight: 1.4 }}>{dataAny.notes}</Text>
              </View>
            )}
            <View style={{ marginTop: 'auto' }}>
              <Text style={{ fontStyle: 'italic', fontSize: 15 * fontScale, color: '#555555', marginBottom: 4, fontFamily: templateSettings.fontFamily }}>{companyName}</Text>
              <Text style={{ fontWeight: 'bold', fontSize: 10 * fontScale, color: '#111111' }}>{companyName}</Text>
              <Text style={{ fontSize: 9 * fontScale, color: accentColor, letterSpacing: 1, textTransform: 'uppercase', marginTop: 2 }}>Authorized Signatory</Text>
            </View>
          </View>

          <View style={{ flex: 1, alignItems: 'flex-end', textAlign: 'right' }}>
             {templateSettings.showPaymentTerms && config?.transactionSettings?.defaultPaymentTermsDays !== undefined && (
               <View style={{ marginBottom: 12 }}>
                 <Text style={{ fontSize: 9 * fontScale, fontWeight: 'bold', color: '#999999', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>Payment Method / Terms</Text>
                 <Text style={{ fontSize: 9 * fontScale, color: '#666666', lineHeight: 1.6 }}>{getDefaultPaymentTermsLabel(config)}</Text>
               </View>
             )}
             
             <View>
               <Text style={{ fontSize: 9 * fontScale, color: '#aaaaaa', lineHeight: 1.5, maxWidth: 200, marginTop: 6 }}>
                 This is a computer-generated document. For enquiries contact:
               </Text>
               <Text style={{ fontSize: 9 * fontScale, color: '#aaaaaa', lineHeight: 1.5, maxWidth: 200, marginTop: 2 }}>
                 {`${companyName}, ${companyAddress}, ${companyPhone}`}
               </Text>
             </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export const PrimeDocument = ({ type, data, configOverride = null }: DocProps) => {
  const isFinancial = type === 'INVOICE' || type === 'PO' || type === 'QUOTATION' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'SUBSCRIPTION';
  const dataAny = data as any;
  const config = configOverride || getStoredCompanyConfig();
  const templateSettings = resolvePrimeTemplateSettings(config);

  if (isFinancial && templateSettings.engine === 'Clean') {
    return <CleanInvoiceTemplate type={type} data={data as PrimeDocData} config={config} templateSettings={templateSettings} />;
  }

  if (isFinancial && templateSettings.engine === 'Professional') {
    return <ProfessionalInvoiceTemplate type={type} data={data as PrimeDocData} config={config} templateSettings={templateSettings} />;
  }

  if (isFinancial && templateSettings.engine === 'Modern') {
    return <ModernInvoiceTemplate type={type} data={data as PrimeDocData} config={config} templateSettings={templateSettings} />;
  }

  const fontScale = templateSettings.bodyFontSize / 12;
  const showDueDate = templateSettings.showDueDate;
  const showPaymentTerms = templateSettings.showPaymentTerms;
  const paymentTermsLabel = String(dataAny?.paymentTerms || '').trim() || getDefaultPaymentTermsLabel(config);
  const companyName = config?.companyName || 'Prime Printing & Stationery';
  const companyAddress = config?.addressLine1 || 'Lilongwe, Malawi';

  // Format phone numbers if they are concatenated without separators
  const rawPhone = config?.phone || '';
  const formattedPhone = rawPhone.replace(/(\+265\s?\d{3}\s?\d{3}\s?\d{3})(?=\+265)/g, '$1 | ');
  const companyPhone = formattedPhone || 'N/A';
  const companyEmail = config?.email || 'N/A';

  const companyContact = `${formattedPhone} | ${config?.email || ''}`;
  const companyEnquiryLine = [companyName, companyAddress].filter(Boolean).join(', ');
  const companyFlatContact2 = `${companyEnquiryLine}, ${companyPhone}`;
  const legalFooterLine1 = showPaymentTerms
    ? `This is a computer-generated document. Payment terms: ${paymentTermsLabel}.`
    : 'This is a computer-generated document. For enquiries contact:';
  const legalFooterLine2 = `${companyFlatContact2}`;
  const currency = config?.currencySymbol || 'K';
  const logo = resolvePdfLogoSource(config, templateSettings.showCompanyLogo);
  const showInvoiceBalances = templateSettings.showOutstandingAndWalletBalances;
  const resolvedWalletBalance = Number(dataAny?.walletBalance || 0);
  const resolvedOutstandingBalance = Math.max(
    0,
    Number(dataAny?.totalAmount || 0) - Number(dataAny?.amountPaid || 0)
  );
  const pageStyle = {
    fontFamily: templateSettings.fontFamily,
    fontSize: templateSettings.bodyFontSize,
  };
  const brandTextStyle = {
    fontFamily: templateSettings.fontFamily,
    fontSize: templateSettings.companyNameFontSize,
    fontWeight: 'bold',
  };
  const titleStyle = {
    fontSize: 27.75 * fontScale,
  };
  const scaledFont = (size: number) => Number((size * fontScale).toFixed(2));
  const renderBrandMark = (alignment: 'left' | 'right' = 'right') => (
    !!logo
      ? (
        <Image
          src={logo}
          style={{
            width: templateSettings.logoWidth,
            marginBottom: alignment === 'right' ? 0 : 10,
          }}
        />
      )
      : (
        <Text
          style={[
            brandTextStyle,
            alignment === 'left' ? { marginBottom: 5 } : null,
          ]}
        >
          {companyName}
        </Text>
      )
  );

  const isRightAligned = ['INVOICE', 'QUOTATION', 'ORDER', 'SALES_ORDER', 'PO', 'DELIVERY_NOTE', 'EXAMINATION_INVOICE', 'SALES_EXCHANGE', 'SUBSCRIPTION'].includes(type);
  const recipientSectionEnabledTypes = ['INVOICE', 'PO', 'WORK_ORDER', 'DELIVERY_NOTE', 'QUOTATION', 'EXAMINATION_INVOICE', 'ORDER', 'SALES_ORDER', 'SUBSCRIPTION'];
  const resolvedRecipientName = String(
    dataAny.clientName
    || dataAny.customerName
    || dataAny.customer_name
    || dataAny.schoolName
    || dataAny.school_name
    || dataAny.recipientName
    || dataAny.recipient_name
    || dataAny.vendorName
    || dataAny.vendor_name
    || dataAny.supplierName
    || dataAny.supplier_name
    || dataAny.proofOfDelivery?.receivedBy
    || dataAny.receivedBy
    || ''
  ).trim();
  const resolvedRecipientAddress = String(
    dataAny.address
    || dataAny.customerAddress
    || dataAny.customer_address
    || dataAny.billingAddress
    || dataAny.billing_address
    || dataAny.shippingAddress
    || dataAny.shipping_address
    || dataAny.schoolAddress
    || dataAny.school_address
    || dataAny.vendorAddress
    || dataAny.vendor_address
    || dataAny.supplierAddress
    || dataAny.supplier_address
    || dataAny.proofOfDelivery?.address
    || dataAny.proofOfDelivery?.deliveryLocation
    || ''
  ).trim();
  const resolvedRecipientPhone = String(
    dataAny.phone
    || dataAny.customerPhone
    || dataAny.customer_phone
    || dataAny.schoolPhone
    || dataAny.school_phone
    || dataAny.vendorPhone
    || dataAny.vendor_phone
    || dataAny.supplierPhone
    || dataAny.supplier_phone
    || dataAny.recipientPhone
    || dataAny.recipient_phone
    || dataAny.proofOfDelivery?.receiverPhone
    || dataAny.proofOfDelivery?.recipientPhone
    || dataAny.proofOfDelivery?.phone
    || ''
  ).trim();
  const shouldRenderRecipientSection = Boolean(
    recipientSectionEnabledTypes.includes(type) || resolvedRecipientName || resolvedRecipientAddress || resolvedRecipientPhone
  );
  const recipientLabel = type === 'PO'
    ? 'To Vendor'
    : type === 'EXAMINATION_INVOICE'
      ? 'Customer'
      : 'Bill To:';
  const resolveConversionSourceNumber = (doc: any) => {
    if (!doc?.conversionDetails) return 'N/A';
    if (doc.conversionDetails.sourceNumber === 'N/A' && 'invoiceNumber' in doc) return doc.invoiceNumber;
    if (doc.conversionDetails.sourceNumber === 'N/A' && 'orderNumber' in doc) return doc.orderNumber;
    return doc.conversionDetails.sourceNumber || 'N/A';
  };

  if (type === 'SALES_EXCHANGE') {
    const d = data as any; // Cast for easier access to specialized fields
    const items = d.items || [];

    return (
      <Document title={`Sales Exchange - ${d.exchangeNumber}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>
          {!!d.isConverted && !!d.conversionDetails && (
            <View style={[s.conversionBox, { position: 'absolute', top: 40, right: 40, zIndex: 10 }]}>
              <Text style={s.conversionTitle}>Conversion History</Text>
              <Text>Converted from {d.conversionDetails.sourceType} {d.conversionDetails.sourceNumber}</Text>
              <Text>on {d.conversionDetails.date}</Text>
            </View>
          )}

          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Exchange Note</Text>
              <View style={s.infoText}>
                <Text>Exchange # : {d.exchangeNumber}</Text>
                <Text>Date : {d.date}</Text>
                <Text>Ref Invoice : {d.invoiceNumber}</Text>
              </View>
            </View>
            <View style={s.headerRight}>
              {renderBrandMark('right')}
            </View>
          </View>

          <View style={[s.billingSection, { marginTop: 20 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Customer</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{d.customerName}</Text>
              <Text style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>{resolvedRecipientAddress || 'N/A'}</Text>
              <Text style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>{resolvedRecipientPhone || 'N/A'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Reason for Exchange</Text>
              <Text style={{ fontSize: 11 }}>{d.reason}</Text>
            </View>
          </View>

          <View style={{ marginTop: 20 }}>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Item Description</Text>
              <Text style={[s.colQty, { width: 60 }]}>Returned</Text>
              <Text style={[s.colQty, { width: 60 }]}>Replaced</Text>
            </View>
            {items.map((item: any, i: number) => (
              <View key={i} style={s.row}>
                <Text style={[s.colDesc, { fontSize: 10 }]}>{item.desc || 'N/A'}</Text>
                <Text style={[s.colQty, { width: 60, fontSize: 10 }]}>{item.qtyReturned}</Text>
                <Text style={[s.colQty, { width: 60, fontSize: 10 }]}>{item.qtyReplaced}</Text>
                <Text style={[s.colTotal, { fontSize: 10, fontWeight: 'bold' }]}>
                  {currency} {formatAmount(item.priceDiff)}
                </Text>
              </View>
            ))}
          </View>

          {!!d.remarks && (
            <View style={{ marginTop: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 6, borderLeftWidth: 3, borderLeftColor: '#3b82f6' }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5, textTransform: 'uppercase', color: '#475569' }}>Remarks / Special Instructions:</Text>
              <Text style={{ fontSize: 10, color: '#1e293b', lineHeight: 1.5 }}>{d.remarks}</Text>
            </View>
          )}

          <View style={{ marginTop: 60 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ width: 180, alignItems: 'center' }}>
                <View style={{ width: '100%', borderTopWidth: 1, borderColor: '#000', marginBottom: 5 }} />
                <Text style={{ fontSize: 10 }}>Customer Signature</Text>
                <Text style={{ fontSize: 8, color: '#666' }}>I accept the replacement items</Text>
              </View>
              <View style={{ width: 180, alignItems: 'center' }}>
                <View style={{ width: '100%', borderTopWidth: 1, borderColor: '#000', marginBottom: 5 }} />
                <Text style={{ fontSize: 10 }}>Authorized Officer</Text>
                <Text style={{ fontSize: 8, color: '#666' }}>Exchange approved & processed</Text>
              </View>
            </View>
          </View>

          <SecurityFooter
            data={d}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated Sales Exchange Note. No signature is required if authorized digitally."
            legalFooterLine2={`All exchanges are subject to ${companyName} Return & Exchange Policy.`}
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }

  if (type === 'RECEIPT') {
    const rc = data as any;
    const isPartial = rc.paymentStatus === 'PARTIALLY PAID';
    const isOverpaid = rc.paymentStatus === 'OVERPAID';
    const overpaymentAmount = rc.overpaymentAmount || rc.walletDeposit || 0;
    const isFullyPaid = rc.paymentStatus === 'PAID' || (!isPartial && !isOverpaid);

    return (
      <Document title={`Payment Receipt - ${rc.receiptNumber}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>

          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Payment Receipt</Text>
              <View style={s.infoText}>
                <Text>Receipt # : {rc.receiptNumber}</Text>
                <Text>Date : {rc.date}</Text>
                <Text>Method : {rc.paymentMethod}</Text>
              </View>
            </View>
            <View style={s.headerRight}>
              {renderBrandMark('right')}
            </View>
          </View>

          {isOverpaid && (
            <View style={{ backgroundColor: '#fef2f2', padding: 10, borderRadius: 4, marginBottom: 15, borderLeftWidth: 4, borderLeftColor: '#ef4444' }}>
              <Text style={{ color: '#991b1b', fontSize: 12, fontWeight: 'bold', lineHeight: 1.4 }}>OVERPAYMENT NOTICE</Text>
              <Text style={{ color: '#b91c1c', fontSize: 12, lineHeight: 1.4 }}>
                This payment exceeds the invoice total. The excess has been credited to your wallet.
              </Text>
            </View>
          )}

          <View style={[s.billingSection, { marginTop: 0, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Received From</Text>
              <View style={s.recipientInfoText}>
                <Text style={s.recipientName}>{rc.customerName || 'N/A'}</Text>
                {resolvedRecipientAddress ? (
                  <Text style={s.recipientDetail}>{resolvedRecipientAddress}</Text>
                ) : null}
                {resolvedRecipientPhone ? (
                  <Text style={s.recipientPhone}>{resolvedRecipientPhone}</Text>
                ) : null}
              </View>
            </View>
            
            {/* PAID Stamp for fully paid receipts moved to right margin of same row */}
            {isFullyPaid && (
              <View style={{ marginTop: -5, marginLeft: -3 }}>
                <Text style={[s.paidStampText, { fontSize: 28.8, color: '#16a34a' }]}>PAID</Text>
              </View>
            )}
          </View>

          <View style={{ marginTop: 5, padding: 15, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
              {rc.narrative || `This receipt acknowledges payment of ${currency} ${formatAmount(rc.amountReceived)} received from ${rc.customerName}.`}
            </Text>
          </View>

          <View style={{ marginTop: 30 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 3 }}>Description</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Amount Paid</Text>
            </View>
            <View style={s.row}>
              <Text style={{ flex: 3 }}>Payment for Invoices: {(rc.appliedInvoices || []).join(', ')}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{currency} {formatAmount(rc.amountReceived)}</Text>
            </View>
          </View>


          <View style={[s.summaryContainer, { justifyContent: 'flex-end' }]}>
            <View style={{ width: 260 }}>
              <View style={[s.totalRow]}>
                <Text style={{ flex: 1, fontWeight: 'bold' }}>Amount Received</Text>
                <Text style={{ fontWeight: 'bold', textAlign: 'right' }}>{currency} {formatAmount(rc.amountReceived)}</Text>
              </View>

              {isPartial && (
                <View style={[s.totalRow]}>
                  <Text style={{ flex: 1, color: '#ef4444' }}>Outstanding Balance</Text>
                  <Text style={{ color: '#ef4444', textAlign: 'right' }}>{currency} {formatAmount(rc.balanceDue)}</Text>
                </View>
              )}

              {isOverpaid && overpaymentAmount > 0 && (
                <View style={[s.totalRow]}>
                  <Text style={{ flex: 1, color: '#10b981', fontWeight: 'bold' }}>Wallet Credit</Text>
                  <Text style={{ color: '#10b981', fontWeight: 'bold', textAlign: 'right' }}>{currency} {formatAmount(overpaymentAmount)}</Text>
                </View>
              )}
            </View>
          </View>

            <View style={s.footerContainer} wrap={false}>
              <Text style={[s.thankYouText, { fontSize: scaledFont(12) }]}>Thank you for choosing <Text style={{ fontWeight: 'bold', fontSize: scaledFont(14) }}>{companyName}</Text></Text>
              <View style={s.footerLine} />
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyAddress}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyContact}</Text>
            </View>

          <SecurityFooter
            data={rc}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated payment receipt. No signature required if digitally authorized."
            legalFooterLine2=""
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }

  if (type === 'SUPPLIER_PAYMENT') {
    const sp = data as any;
    return (
      <Document title={`Payment Voucher - ${sp.paymentId}`} author={companyName}>
        <Page size="A4" style={[s.page, pageStyle]}>
          <View style={s.headerSection}>
            <View style={s.headerLeft}>
              {renderBrandMark('left')}
            </View>
            <View style={s.headerLeft}>
              <Text style={[s.title, titleStyle]}>Payment Voucher</Text>
              <View style={s.infoText}>
                <Text>Voucher # : {sp.paymentId}</Text>
                <Text>Date : {sp.date}</Text>
                <Text>Method : {sp.paymentMethod}</Text>
              </View>
            </View>
          </View>

          <View style={[s.billingSection, { marginTop: 0, marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: 'bold', marginBottom: 5, fontSize: 10, textTransform: 'uppercase', color: '#64748b' }}>Paid To</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{sp.supplierName}</Text>
            </View>
          </View>

          <View style={{ marginTop: 5, padding: 15, backgroundColor: '#f8fafc', borderRadius: 8 }}>
            <Text style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
              {sp.narrative || `This voucher confirms payment of ${currency} ${formatAmount(sp.amountPaid)} to ${sp.supplierName}.`}
            </Text>
          </View>

          <View style={{ marginTop: 30 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 3 }}>Description</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Amount Paid</Text>
            </View>
            <View style={s.row}>
              <Text style={{ flex: 3 }}>Payment against Invoices: {(sp.appliedInvoices || []).join(', ')}</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>{currency} {formatAmount(sp.amountPaid)}</Text>
            </View>
          </View>

          <View style={s.summaryContainer}>
            <View style={s.summaryBox}>
              <View style={s.totalRow}>
                <Text>Total Paid</Text>
                <Text style={{ fontWeight: 'bold' }}>{currency} {formatAmount(sp.amountPaid)}</Text>
              </View>
            </View>
          </View>

            <View style={s.footerContainer} wrap={false}>
              <Text style={[s.thankYouText, { fontSize: scaledFont(12) }]}>Authorized by <Text style={{ fontWeight: 'bold', fontSize: scaledFont(14) }}>{companyName}</Text></Text>
              <View style={s.footerLine} />
              <Text style={[s.companyName, { fontSize: scaledFont(12) }]}>{companyName}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyAddress}</Text>
              <Text style={[s.footerDetail, { fontSize: scaledFont(12) }]}>{companyContact}</Text>
            </View>

          <View style={s.signatureBlock}>
            <View>
              <View style={s.sigLine} />
              <Text>Authorized Signatory</Text>
            </View>
            <View>
              <View style={s.sigLine} />
              <Text>Received By</Text>
            </View>
          </View>

          <SecurityFooter
            data={sp}
            companyName={companyName}
            legalFooterLine1="This is a computer-generated payment voucher."
            legalFooterLine2={`Issued securely by ${companyName}.`}
            fontScale={fontScale}
          />
        </Page>
      </Document>
    );
  }
if (type === 'POS_RECEIPT') {
  const r = data as any;

  const scale = 1;
  const baseFontSize = 7.6 * scale;
  const largeFontSize = 10 * scale;
  const smallFontSize = 6.4 * scale;
  const mediumFontSize = 8.4 * scale;

  return (
    <Document title={`Receipt - ${r.receiptNumber}`} author={companyName}>
      <Page size="A4" style={[s.page, pageStyle, { padding: 0, backgroundColor: '#f9fafb', fontFamily: templateSettings.fontFamily }]}>
        <View style={[s.posA4Wrapper, { width: 250 * scale, paddingVertical: 24 * scale, paddingHorizontal: 8 * scale }]}>
            <View style={{ alignItems: 'center', marginBottom: 12 * scale }}>
              <Text style={{ fontWeight: 'bold', fontSize: 14 * scale, textAlign: 'center', marginBottom: 3 * scale }}>{companyName}</Text>
              <Text style={{ fontSize: baseFontSize, textAlign: 'center', marginBottom: 2 * scale }}>{companyAddress}</Text>
              <Text style={{ fontSize: baseFontSize, textAlign: 'center' }}>{companyContact}</Text>
            </View>

            <View style={{ marginBottom: 12 * scale, borderBottomWidth: 1, borderBottomColor: '#000', borderBottomStyle: 'dashed', paddingBottom: 8 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Date:</Text>
                <Text style={{ fontSize: baseFontSize }}>{r.date}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Receipt #:</Text>
                <Text style={{ fontWeight: 'bold', fontSize: baseFontSize }}>{r.receiptNumber}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 * scale }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Cashier:</Text>
                <Text style={{ fontSize: baseFontSize }}>{r.cashierName}</Text>
              </View>
              {!!r.customerName && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: baseFontSize, color: '#666' }}>Customer:</Text>
                  <Text style={{ fontSize: baseFontSize }}>{r.customerName}</Text>
                </View>
              )}
            </View>

            <View style={s.paidStampSmallContainer}>
              <View style={s.paidStampSmallBox}>
                <Text style={[s.paidStampSmallText, { fontWeight: 'bold', fontSize: 18 * scale, letterSpacing: 2 * scale }]}>PAID</Text>
              </View>
            </View>

            <View style={{ marginBottom: 15 * scale }}>
              <View style={{ flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc', paddingBottom: 3 * scale, marginBottom: 5 * scale }}>
                <Text style={{ flex: 3, fontWeight: 'bold', fontSize: baseFontSize }}>Description</Text>
                <Text style={{ flex: 1, fontWeight: 'bold', fontSize: baseFontSize, textAlign: 'right' }}>Total</Text>
              </View>
              {r.items.map((item: any, i: number) => (
                <View key={i} style={{ marginBottom: 6 * scale }}>
                  <Text style={{ fontSize: mediumFontSize, fontWeight: 'normal' }}>{item.desc}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 * scale }}>
                    <Text style={{ fontSize: baseFontSize, color: '#444' }}>{item.qty} x {formatAmount(item.price)}</Text>
                    <Text style={{ fontSize: mediumFontSize }}>{formatAmount(item.total)}</Text>
                  </View>
                </View>
              ))}
            </View>

            <View style={{ borderTopWidth: 1, borderTopColor: '#000', borderTopStyle: 'dashed', paddingTop: 8 * scale, gap: 3 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: mediumFontSize }}>Subtotal</Text>
                <Text style={{ fontSize: mediumFontSize }}>{formatAmount(r.subtotal)}</Text>
              </View>
              {r.discount > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: mediumFontSize }}>Discount</Text>
                  <Text style={{ fontSize: mediumFontSize }}>-{formatAmount(r.discount)}</Text>
                </View>
              )}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 * scale, paddingTop: 4 * scale, borderTopWidth: 0.5, borderTopColor: '#eee' }}>
                <Text style={{ fontWeight: 'bold', fontSize: largeFontSize }}>TOTAL</Text>
                <Text style={{ fontWeight: 'bold', fontSize: largeFontSize }}>{currency} {formatAmount(r.totalAmount)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 12 * scale, borderTopWidth: 1, borderTopColor: '#000', borderTopStyle: 'dashed', paddingTop: 8 * scale, gap: 3 * scale }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Method</Text>
                <Text style={{ fontSize: baseFontSize }}>{r.paymentMethod}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Cash Tendered</Text>
                <Text style={{ fontSize: baseFontSize }}>{formatAmount(r.amountTendered)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: baseFontSize, color: '#666' }}>Change Given</Text>
                <Text style={{ fontWeight: 'bold', fontSize: baseFontSize }}>{formatAmount(r.changeGiven)}</Text>
              </View>
            </View>

            <View style={{ marginTop: 18 * scale, alignItems: 'center' }}>
              <Text style={{ fontWeight: 'bold', textAlign: 'center', fontSize: mediumFontSize }}>Thank you for your business!</Text>
              <Text style={{ textAlign: 'center', fontSize: smallFontSize, marginTop: 6 * scale, color: '#999', textTransform: 'uppercase', letterSpacing: 0.6 * scale }}>Powered by Prime ERP</Text>
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  if ((type === 'ACCOUNT_STATEMENT_SUMMARY' || type === 'ACCOUNT_STATEMENT') && 'finalBalance' in data) {
    return <StatementSummaryTemplate data={data as any} configOverride={config} />;
  }

  const isConverted = 'isConverted' in data && data.isConverted;
  const conversionDetails = isConverted && 'conversionDetails' in data ? (data as any).conversionDetails : null;
  const isFromOrder = conversionDetails?.sourceType === 'Order' || conversionDetails?.sourceType === 'JobOrder';
  const isFromQuotation = conversionDetails?.sourceType === 'Quotation';
  const isConvertedOrder = (type === 'INVOICE' || (type as string) === 'SALES_ORDER' || type === 'ORDER') && isConverted;

  let title: string;
  if (type === 'FISCAL_REPORT' && 'reportName' in data) {
    title = (data as any).reportName;
  } else if (type === 'INVOICE' || (isConvertedOrder && isFromOrder)) {
    title = 'Invoice';
  } else {
    switch (type as any) {
      case 'ORDER':
        title = 'Sales Invoice';
        break;
      case 'SALES_ORDER':
        title = 'Sales Order';
        break;
      case 'SUBSCRIPTION':
        title = 'Recurring Invoice';
        break;
      case 'QUOTATION':
        title = 'Quotation';
        break;
      case 'PO':
        title = 'Purchase Order';
        break;
      case 'EXAMINATION_INVOICE':
        title = 'Service Invoice';
        break;
      default:
        title = toTitleCase(type);
        break;
    }
  }

  return (
    <Document
      title={`${title} - ${'number' in data ? data.number : ('receiptNumber' in data ? data.receiptNumber : ('clientName' in data ? data.clientName : 'DOC'))}`}
      author={companyName}
      subject="ERP Generated Document"
      creator="Prime ERP System"
      keywords={`${type}, ERP, Business Document`}
    >
      <Page size="A4" style={[s.page, pageStyle]}>
        <View style={s.headerSection}>
          {isRightAligned ? (
            <>
              <View style={s.headerLeft}>
                <Text style={[s.title, titleStyle]}>{title}</Text>
                <View style={s.infoText}>
                  {type === 'INVOICE' ? (
                    <>
                      <Text>Invoice No. # {(('invoiceNumber' in data && (data as any).invoiceNumber) || ('number' in data ? (data as any).number : 'INV'))}</Text>
                      <Text>Invoice Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {data.dueDate}</Text>}
                      {isFromQuotation && <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Order Ref: {conversionDetails?.sourceNumber || 'N/A'}</Text>}
                      {isFromOrder && <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Original Order: {conversionDetails?.sourceNumber || 'N/A'}</Text>}
                    </>
                  ) : type === 'ORDER' ? (
                    <>
                      <Text>Invoice No. # INV-{('orderNumber' in data && (data as any).orderNumber) || ('number' in data ? (data as any).number : 'ORD')}</Text>
                      <Text>Invoice Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      <Text style={{ fontSize: 8, color: '#64748b', marginTop: 2 }}>Order Ref: {('orderNumber' in data && (data as any).orderNumber) || 'N/A'}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {data.dueDate}</Text>}
                    </>
                  ) : (type as string) === 'SALES_ORDER' ? (
                    <>
                      <Text>Sales Order No. # {('orderNumber' in data && (data as any).orderNumber) || ('number' in data ? (data as any).number : 'SO')}</Text>
                      <Text>Sales Order Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {data.dueDate}</Text>}
                    </>
                  ) : type === 'EXAMINATION_INVOICE' ? (
                    <>
                      <Text>Service Invoice No. # {'number' in data ? (data as any).number : 'INV'}</Text>
                      <Text>Service Invoice Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      {Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Due Date: {data.dueDate}</Text>}
                    </>
                  ) : type === 'SUBSCRIPTION' ? (
                    <>
                      <Text>Recurring Inv. No. # {'number' in data ? (data as any).number : 'SUB'}</Text>
                      <Text>Issue Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      {'billingPeriodStart' in data && 'billingPeriodEnd' in data && !!(data as any).billingPeriodStart && !!(data as any).billingPeriodEnd && (
                        <Text style={{ marginTop: 2 }}>Period: {(data as any).billingPeriodStart} to {(data as any).billingPeriodEnd}</Text>
                      )}
                      {'frequency' in data && !!(data as any).frequency && (
                        <Text>Frequency: {toTitleCase(String((data as any).frequency))}</Text>
                      )}
                      {'nextRunDate' in data && !!(data as any).nextRunDate && (
                        <Text style={{ marginTop: 2, fontWeight: 'bold' }}>Next Run: {(data as any).nextRunDate}</Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Text>{toTitleCase(type)} No. # {'number' in data ? (data as any).number : ('receiptNumber' in data ? (data as any).receiptNumber : 'STATEMENT')}</Text>
                      <Text>{toTitleCase(type)} Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                      {type === 'QUOTATION' && Boolean(showDueDate) && 'dueDate' in data && !!data.dueDate && <Text>Valid Until: {data.dueDate}</Text>}
                    </>
                  )}
                </View>
              </View>
              <View style={s.headerRight}>
                {renderBrandMark('right')}
              </View>
            </>
          ) : (
            <>
              <View style={s.headerLeft}>
                {renderBrandMark('left')}
                <Text style={[s.title, titleStyle]}>{title}</Text>
                <View style={s.infoText}>
                  <Text>{toTitleCase(type)} No. # {'number' in data ? (data as any).number : ('receiptNumber' in data ? (data as any).receiptNumber : 'STATEMENT')}</Text>
                  <Text>{toTitleCase(type)} Date: {'date' in data ? (data as any).date : 'N/A'}</Text>
                </View>
              </View>
              <View style={s.headerRight}>
              </View>
            </>
          )}
        </View>

        {/* Logo (Optional, keep if needed or remove if strictly following snippet) */}
        {/* <View style={{ position: 'absolute', top: 40, right: 40, textAlign: 'right' }}>
          <Text style={{ fontWeight: 'bold', fontSize: 13.5 }}>PRIME</Text>
          <Text style={{ fontWeight: 'bold', fontSize: 13.5 }}>LOGO</Text>
        </View> */}

        {/* RECIPIENT SECTION */}
        {shouldRenderRecipientSection && (
          <View style={[s.billingSection, s.recipientSectionTight, { alignItems: 'flex-start', justifyContent: 'space-between' }]}>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <Text style={{ width: 80, fontWeight: 'bold' }}>{recipientLabel}</Text>
              <View style={s.recipientInfoText}>
                <Text style={s.recipientName}>{resolvedRecipientName || 'N/A'}</Text>
                <Text style={s.recipientDetail}>{resolvedRecipientAddress || 'N/A'}</Text>
                <Text style={s.recipientPhone}>{resolvedRecipientPhone || 'N/A'}</Text>
              </View>
            </View>

            {/* Conversion Details Box */}
            {/* Conversion / Acceptance Details Box */}
            {('isConverted' in data && !!data.isConverted) && (('conversionDetails' in data && !!data.conversionDetails) || type === 'QUOTATION') && (
              <View style={[s.conversionBox, { marginLeft: 20 }]}>
                <Text style={s.conversionTitle}>{type === 'QUOTATION' ? 'Acceptance Details' : 'Conversion History'}</Text>
                {type === 'QUOTATION' && 'date' in data ? (
                  <>
                    <Text>Accepted on {formatDateOnly((data as any).date)} by {resolvedRecipientName || 'N/A'}</Text>
                  </>
                ) : 'conversionDetails' in data && data.conversionDetails ? (
                  <>
                    <Text>
                      Converted from {resolveConversionSourceNumber(data as any)} on {formatDateOnly((data as any).conversionDetails.date)} as accepted by {(data as any).conversionDetails.acceptedBy || resolvedRecipientName || 'N/A'}
                    </Text>
                  </>
                ) : null}
              </View>
            )}
          </View>
        )}

        {/* PAID Stamp for fully paid invoices */}
        {('status' in data && data.status === 'Paid') && type !== 'INVOICE' && type !== 'ORDER' && (type as string) !== 'SALES_ORDER' && (
          <View style={s.paidStampContainer}>
            <View style={s.paidStampBox}>
              <Text style={s.paidStampText}>PAID</Text>
            </View>
          </View>
        )}

        {/* TABLE SECTION */}
        {type !== 'DELIVERY_NOTE' && type !== 'WORK_ORDER' && type !== 'ACCOUNT_STATEMENT' && type !== 'EXAMINATION_INVOICE' && (
          <>
            {/* Case: INVOICE / PO */}
            {isFinancial && (
              <View style={s.tableSectionTight}>
                {/* 1. Restored Table Header with 2px border */}
                <View style={s.tableHeader}>
                  <Text style={s.colDesc}>Item Description</Text>
                  <Text style={s.colQty}>Qty</Text>
                  <Text style={s.colPrice}>Price</Text>
                  <Text style={s.colTotal}>Total</Text>
                </View>

                {/* 2. Item Rows with consistent 13px spacing */}
                {/* For Invoice, Order, Quotation: Service items show simplified format */}
                {/* For POS: All items show standard format */}
                {('items' in data ? (data as any).items : []).map((item: any, i: number) => {
                  // Check if this is a service-type item (category, type, or isService flag)
                  const isService = item.category === 'service' ||
                                   item.type === 'service' ||
                                   item.isService === true;
                  
                  // Check if current document type should use simplified service format
                  const useSimplifiedFormat = isService &&
                    (type === 'INVOICE' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'QUOTATION');
                  
                  // Format description based on item type and document type
                  let formattedDesc = item.desc;
                  if (useSimplifiedFormat) {
                    const totalPages = item.totalPages || item.pages || 0;
                    const copies = item.copies || item.qty || 1;
                    const itemName = item.name || item.desc || 'Service';
                    formattedDesc = `${itemName} (${totalPages} pages × ${copies} copies)`;
                  }
                  
                  return (
                    <View key={i} style={s.row}>
                      <Text style={s.colDesc}>{formattedDesc}</Text>
                      <Text style={s.colQty}>×{item.qty}</Text>
                      <Text style={s.colPrice}>{currency} {formatAmount(item.price)}</Text>
                      <Text style={s.colTotal}>{currency} {formatAmount(item.total)}</Text>
                    </View>
                  );
                })}

                {/* 3. The Masterpiece Summary Box (Restoring Source 1 Layout) */}
                <View
                  style={[
                    s.summaryContainer,
                    type === 'QUOTATION' ? { justifyContent: 'flex-end' } : null
                  ]}
                >
                  {/* Left Side: Invoice Status for INVOICE/ORDER types */}
                  {(type === 'INVOICE' || type === 'ORDER' || (type as string) === 'SALES_ORDER' || type === 'SUBSCRIPTION') && 'status' in data && !!data.status && (
                    <View style={s.summaryLeft}>
                      {/* INVOICE STATUS TITLE REMOVED */}
                      <View style={[s.statusBox, { borderLeftColor: getStatusTone(data.status).border }]}>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: getStatusTone(data.status).text }}>{data.status.toUpperCase()}</Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Right Side: Summary Values */}
                  <View style={s.summaryRight}>
                    <View style={s.summaryBox}>
                      <View style={s.summaryRow}>
                        <Text style={{ fontWeight: 'bold' }}>{type === 'QUOTATION' ? 'Quoted Amount' : 'Subtotal'}</Text>
                        <Text>{currency} {formatAmount('subtotal' in data ? data.subtotal : 0)}</Text>
                      </View>

                      {/* Total before payments - Hidden on Invoices, Orders, and Quotations */}
                      {type !== 'INVOICE' && type !== 'ORDER' && type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                        <View style={s.summaryRow}>
                          <Text style={{ fontWeight: 'bold' }}>Total Amount</Text>
                          <Text>{currency} {formatAmount('totalAmount' in data ? data.totalAmount : 0)}</Text>
                        </View>
                      )}

                      {/* Amount Paid - Hidden on Quotations */}
                      {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                        <View style={s.summaryRow}>
                          <Text style={{ flex: 1, fontWeight: 'bold' }}>Amount Paid</Text>
                          <Text style={{ textAlign: 'right' }}>{currency} {formatAmount('amountPaid' in data ? data.amountPaid : 0)}</Text>
                        </View>
                      )}


                      {/* Balance Due - Grand Highlight - Hidden on Quotations */}
                      {type !== 'QUOTATION' && type !== 'SUBSCRIPTION' && (
                        <View style={s.totalRow}>
                          <Text style={{ flex: 1 }}>Balance Due</Text>
                          <Text style={{ textAlign: 'right' }}>{currency} {formatAmount(('totalAmount' in data ? data.totalAmount : 0) - ('amountPaid' in data ? data.amountPaid : 0))}</Text>
                        </View>
                      )}

                      {/* Subscription Totals */}
                      {type === 'SUBSCRIPTION' && (
                        <View style={s.totalRow}>
                          <Text>Recurring Total</Text>
                          <Text>{currency} {formatAmount('totalAmount' in data ? data.totalAmount : 0)}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Outstanding Balance Statement - variant 3 */}
                {type === 'INVOICE' && showInvoiceBalances && (dataAny?.totalCustomerOutstanding ?? null) !== null && (() => {
                  const totalOutstanding = Number(dataAny.totalCustomerOutstanding || 0);
                  const todayStr = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
                  return (
                    <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }} wrap={false}>
                      <Text style={{ fontSize: 9 * fontScale, color: '#0369a1', lineHeight: 1.4 }}>
                        {'Your overall outstanding balance is '}
                        <Text style={{ fontWeight: 'bold' }}>{currency} {totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                        {` as of ${todayStr}`}
                      </Text>
                    </View>
                  );
                })()}

                  {/* Thank You Note */}
                  <View style={{ marginTop: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: scaledFont(12), color: '#334155' }}>
                      Thank you for choosing <Text style={{ fontWeight: 'bold' }}>{companyName}</Text>
                    </Text>
                  </View>

                {/* Quotation Note */}
                {type === 'QUOTATION' && (
                  <View style={{ marginTop: 15, padding: 8, backgroundColor: '#f0f9ff', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }}>
                    <Text style={{ fontSize: scaledFont(9), color: '#0369a1', lineHeight: 1.4 }}>
                      Note: Acceptance of this quotation converts it into a formal Sales Order subject to our standard terms and conditions.
                    </Text>
                  </View>
                )}

                {Boolean(showPaymentTerms) && !!paymentTermsLabel && (
                  <View
                    wrap={false}
                    style={{
                      marginTop: 14,
                      padding: 10,
                      backgroundColor: '#f8fafc',
                      borderRadius: 6,
                      borderLeftWidth: 3,
                      borderLeftColor: templateSettings.accentColor,
                    }}
                  >
                    <Text style={{ fontSize: scaledFont(9), fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                      Payment Terms
                    </Text>
                    <Text style={{ fontSize: scaledFont(10), color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
                      {paymentTermsLabel}
                      {showDueDate && dataAny?.dueDate ? ` | Due by ${formatDateOnly(dataAny.dueDate)}` : ''}
                    </Text>
                  </View>
                )}

                {/* Tax Note - Only show if VAT is NOT enabled */}
                {(!config?.vat?.enabled) && (
                  <View style={{ marginTop: 20, paddingTop: 10 }}>
                    <Text style={{ fontSize: scaledFont(9), color: '#64748b', fontStyle: 'italic' }}>* Not VAT registered</Text>
                  </View>
                )}
              </View>
            )}

            {/* Non-financial cases (original logic) */}
            {!isFinancial && (
              <>
                <View style={s.tableHeader}>
                  <Text style={s.colDesc}>Description / Instructions</Text>
                  <Text style={s.colQty}>Qty</Text>
                </View>

                {('items' in data ? data.items : []).map((item, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.colDesc}>{item.desc}</Text>
                    <Text style={s.colQty}>{item.qty}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}

        {/* WORK_ORDER Case */}
        {type === 'WORK_ORDER' && (
          <View style={{ marginTop: 20 }}>
            {/* Job Header Info */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, padding: 10, backgroundColor: '#f8fafc', borderRadius: 4, borderLeftWidth: 3, borderLeftColor: (data as any).priority === 'Critical' ? '#e11d48' : (data as any).priority === 'High' ? '#f59e0b' : '#3b82f6' }}>
              <View>
                <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Priority Level</Text>
                <Text style={{ fontSize: 14, fontWeight: 'bold', color: (data as any).priority === 'Critical' ? '#e11d48' : '#0f172a' }}>{(data as any).priority || 'Normal'}</Text>
              </View>
              {('technician' in data) && !!data.technician && (
                <View style={{ textAlign: 'right' }}>
                  <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Technician</Text>
                  <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{data.technician}</Text>
                </View>
              )}
            </View>

            {/* Technical Specifications Grid */}
            {('technicalSpecs' in data) && !!data.technicalSpecs && Object.keys(data.technicalSpecs).length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Technical Specifications</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {Object.entries(data.technicalSpecs).map(([key, value], i) => (
                    <View key={i} style={{ width: '30%', padding: 8, backgroundColor: '#fff', borderWidth: 0.5, borderColor: '#e2e8f0', borderRadius: 4 }}>
                      <Text style={{ fontSize: 8, color: '#94a3b8', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 2 }}>{key}</Text>
                      <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1e293b' }}>{value as any}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Production Instructions */}
            <View style={{ backgroundColor: '#f1f5f9', padding: 12, marginBottom: 20, borderRadius: 4 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5, color: '#475569', textTransform: 'uppercase' }}>Manufacturing Instructions:</Text>
              <Text style={{ fontSize: 11, color: '#334155', lineHeight: 1.4 }}>{('instructions' in data ? data.instructions : null) || "Standard operating procedure required. Ensure quality check before release."}</Text>
            </View>

            {/* Materials Checklist */}
            {('materialChecklist' in data) && Array.isArray(data.materialChecklist) && data.materialChecklist.length > 0 && (
              <View style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Materials Checklist</Text>
                <View style={{ borderTopWidth: 1, borderColor: '#e2e8f0' }}>
                  {data.materialChecklist.map((m, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 0.5, borderColor: '#f1f5f9' }}>
                      <View style={{ width: 12, height: 12, borderWidth: 1, borderColor: '#cbd5e1', marginRight: 10, borderRadius: 2 }} />
                      <Text style={{ fontSize: 10, color: '#334155' }}>{m}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Service Tasks */}
            <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 8, color: '#475569', textTransform: 'uppercase', letterSpacing: 1 }}>Production Checklist</Text>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Service / Process Details</Text>
              <Text style={s.colQty}>Completion</Text>
            </View>

            {('items' in data ? data.items : []).map((item, i) => (
              <View key={i} style={s.row}>
                <Text style={s.colDesc}>{item.desc}</Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 12, height: 12, borderWidth: 1, borderColor: '#000', marginRight: 5 }} />
                  <Text style={{ fontSize: 9 }}>Initial</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* DELIVERY_NOTE Case */}
        {type === 'DELIVERY_NOTE' && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 10 }}>
              DELIVERY ITEMS CHECKLIST
            </Text>
            <View style={s.tableHeader}>
              <Text style={s.colDesc}>Item Description</Text>
              <Text style={s.colQty}>Qty Shipped</Text>
            </View>

            {('items' in data ? data.items : []).map((item, i) => (
              <View key={i} style={s.row}>
                <Text style={s.colDesc}>{item.desc}</Text>
                <Text style={s.colQty}>{item.qty}</Text>
              </View>
            ))}

            {/* Receiver's Remarks Box */}
            <View style={s.remarksBox}>
              <Text style={s.remarksTitle}>Receiver's Remarks</Text>
              <Text style={{ fontSize: 9, color: '#666' }}>
                {'notes' in data && (data as any).notes
                  ? (data as any).notes
                  : 'proofOfDelivery' in data && (data as any).proofOfDelivery?.remarks
                    ? (data as any).proofOfDelivery.remarks
                    : 'proofOfDelivery' in data && (data as any).proofOfDelivery?.notes
                      ? (data as any).proofOfDelivery.notes
                      : 'Please note any discrepancies or comments regarding the delivery here...'}
              </Text>
            </View>
          </View>
        )}



        {/* Case: ACCOUNT_STATEMENT */}
        {type === 'ACCOUNT_STATEMENT' && 'transactions' in data && (
          <View style={{ marginTop: 20 }}>
            {/* Period Summary */}
            <View style={{ marginBottom: 20, padding: 10, backgroundColor: '#f8fafc', borderRadius: 4 }}>
              <Text style={{ fontSize: 10, color: '#64748b' }}>Statement Period:</Text>
              <Text style={{ fontSize: 12, fontWeight: 'bold' }}>{data.startDate} — {data.endDate}</Text>
            </View>

            {/* Ledger Table */}
            <View style={s.tableHeader}>
              <Text style={{ flex: 1.5 }}>Date</Text>
              <Text style={{ flex: 2 }}>Reference</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Debit ({currency})</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Credit ({currency})</Text>
              <Text style={{ flex: 1.5, textAlign: 'right' }}>Balance ({currency})</Text>
            </View>

            {data.transactions.map((txn, i) => (
              <View key={i} style={s.row}>
                <Text style={{ flex: 1.5 }}>{txn.date}</Text>
                <Text style={{ flex: 2 }}>{txn.reference}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{txn.debit > 0 ? formatAmount(txn.debit) : '-'}</Text>
                <Text style={{ flex: 1, textAlign: 'right' }}>{txn.credit > 0 ? formatAmount(txn.credit) : '-'}</Text>
                <Text style={{ flex: 1.5, textAlign: 'right', fontWeight: 'bold' }}>{formatAmount(txn.runningBalance)}</Text>
              </View>
            ))}

            {/* Summary Totals */}
            <View style={{ marginTop: 30, borderTopWidth: 2, borderColor: '#000', paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text>Total Debits:</Text>
                <Text>{currency} {formatAmount('totalInvoiced' in data ? (data as any).totalInvoiced : 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 }}>
                <Text>Total Credits:</Text>
                <Text>{currency} {formatAmount('totalReceived' in data ? (data as any).totalReceived : 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 5, padding: 8, backgroundColor: '#000', color: '#fff' }}>
                <Text style={{ fontWeight: 'bold' }}>TOTAL OUTSTANDING:</Text>
                <Text style={{ fontWeight: 'bold' }}>{currency} {formatAmount(data.finalBalance)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Case: FISCAL_REPORT */}
        {type === 'FISCAL_REPORT' && 'sections' in data && (
          <View style={{ marginTop: 20 }}>
            {/* Period Summary */}
            <View style={{ marginBottom: 20, padding: 12, backgroundColor: '#f8fafc', borderRadius: 8, borderLeftWidth: 4, borderLeftColor: '#2563eb' }}>
              <Text style={{ fontSize: 10, color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 }}>Report Period</Text>
              <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#0f172a' }}>{data.period}</Text>
            </View>

            {data.sections.map((section, idx) => (
              <View key={idx} style={{ marginBottom: 20 }}>
                <Text style={{ fontSize: 10, fontWeight: 'bold', color: '#1e293b', textTransform: 'uppercase', borderBottomWidth: 1, borderBottomColor: '#e2e8f0', paddingBottom: 4, marginBottom: 8 }}>
                  {section.title}
                </Text>
                {section.rows.map((row, rowIdx) => (
                  <View key={rowIdx} style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 6,
                    paddingHorizontal: 4,
                    backgroundColor: row.isTotal ? '#f1f5f9' : 'transparent',
                    borderTopWidth: row.isTotal ? 1 : 0,
                    borderColor: '#cbd5e1'
                  }}>
                    <View style={{ marginLeft: row.indent ? 15 : 0 }}>
                      <Text style={{ fontSize: row.isTotal ? 10 : 9, fontWeight: row.isTotal ? 'bold' : 'normal' }}>{row.label}</Text>
                      {!!row.subText && <Text style={{ fontSize: 7, color: '#64748b', marginTop: 1 }}>{row.subText}</Text>}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 20 }}>
                      {row.prevAmount !== undefined && (
                        <Text style={{ fontSize: 8, color: '#94a3b8', width: 60, textAlign: 'right' }}>
                          {data.currency}{formatAmount(row.prevAmount)}
                        </Text>
                      )}
                      <Text style={{ fontSize: row.isTotal ? 10 : 9, fontWeight: row.isTotal ? 'bold' : 'normal', width: 80, textAlign: 'right' }}>
                        {data.currency}{formatAmount(row.amount)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ))}

            {!!data.netPerformance && (
              <View style={{ marginTop: 20, padding: 12, backgroundColor: '#0f172a', borderRadius: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold' }}>{data.netPerformance.label}</Text>
                  <View style={{ flexDirection: 'row', gap: 20 }}>
                    {data.netPerformance.prevAmount !== undefined && (
                      <Text style={{ color: '#94a3b8', fontSize: 10, textAlign: 'right', width: 60 }}>
                        {data.currency}{formatAmount(data.netPerformance.prevAmount)}
                      </Text>
                    )}
                    <Text style={{ color: data.netPerformance.amount >= 0 ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 'bold', textAlign: 'right', width: 80 }}>
                      {data.currency}{formatAmount(data.netPerformance.amount)}
                    </Text>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}
        
        {/* Case: EXAMINATION_INVOICE */}
        {type === 'EXAMINATION_INVOICE' && (
          <View style={{ marginTop: 20 }}>
            <View style={s.tableHeader}>
              <Text style={{ flex: 3 }}>Class / Subject</Text>
              <Text style={{ flex: 1, textAlign: 'center' }}>Qty</Text>
              <Text style={{ flex: 1, textAlign: 'right' }}>Price</Text>
              <Text style={{ flex: 1.5, textAlign: 'right' }}>Total</Text>
            </View>

            {('items' in data ? (data as any).items : []).map((item: any, i: number) => (
              <View key={i} style={s.row}>
                <View style={{ flex: 3 }}>
                  <Text style={{ fontWeight: 'normal', fontSize: 12 }}>{item.desc}</Text>
                </View>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>{item.qty}</Text>
                <Text style={{ flex: 1, textAlign: 'right', fontSize: 12 }}>{formatAmount(item.price)}</Text>
                <Text style={{ flex: 1.5, textAlign: 'right', fontSize: 12 }}>{formatAmount(item.total)}</Text>
              </View>
            ))}

            <View style={s.summaryContainer}>
              {'status' in data && !!data.status && (
                <View style={s.summaryLeft}>
                  {/* INVOICE STATUS TITLE REMOVED */}
                  <View style={[s.statusBox, { borderLeftColor: getStatusTone(data.status).border }]}>
                    <Text style={{ fontSize: 16, fontWeight: 'bold', color: getStatusTone(data.status).text }}>
                      {data.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}

              <View style={s.summaryRight}>
                <View style={s.summaryBox}>
                  <View style={s.summaryRow}>
                    <Text style={{ fontWeight: 'bold' }}>Subtotal</Text>
                    <Text>{currency} {formatAmount(dataAny.preRoundingTotalAmount || dataAny.subtotal || 0)}</Text>
                  </View>

                  <View style={[s.summaryRow, { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 4, marginTop: 4 }]}>
                    <Text style={{ fontWeight: 'bold' }}>Grand Total</Text>
                    <Text>{currency} {formatAmount('totalAmount' in data ? (data as any).totalAmount : 0)}</Text>
                  </View>
                  <View style={s.summaryRow}>
                    <Text style={{ fontWeight: 'bold' }}>Amount Paid</Text>
                    <Text>{currency} {formatAmount('amountPaid' in data ? (data as any).amountPaid : 0)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text>Balance Due</Text>
                    <Text>
                      {currency} {formatAmount(('totalAmount' in data ? (data as any).totalAmount : 0) - ('amountPaid' in data ? (data as any).amountPaid : 0))}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

              <View style={{ marginTop: 15, alignItems: 'center' }}>
                <Text style={{ fontSize: scaledFont(12), color: '#334155' }}>
                  Thank you for choosing <Text style={{ fontWeight: 'bold' }}>{companyName}</Text>
                </Text>
              </View>

            {Boolean(showPaymentTerms) && !!paymentTermsLabel && (
              <View
                wrap={false}
                style={{
                  marginTop: 14,
                  padding: 10,
                  backgroundColor: '#f8fafc',
                  borderRadius: 6,
                  borderLeftWidth: 3,
                  borderLeftColor: templateSettings.accentColor,
                }}
              >
                <Text style={{ fontSize: scaledFont(9), fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                  Payment Terms
                </Text>
                <Text style={{ fontSize: scaledFont(10), color: '#334155', marginTop: 4, lineHeight: 1.45 }}>
                  {paymentTermsLabel}
                  {showDueDate && dataAny?.dueDate ? ` | Due by ${formatDateOnly(dataAny.dueDate)}` : ''}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* DYNAMIC FOOTER (Signatures for Delivery/Work Orders) */}
        {!isFinancial && type !== 'DELIVERY_NOTE' && type !== 'EXAMINATION_INVOICE' && (
          <View style={s.signatureBlock}>
            <View>
              <View style={s.sigLine} />
              <Text>Issued By (Prime)</Text>
            </View>
            <View>
              <View style={s.sigLine} />
              <Text>Received By (Client)</Text>
            </View>
          </View>
        )}

        {/* Delivery Signature Block */}
        {type === 'DELIVERY_NOTE' && (
          <View style={[s.signatureBlock, { marginTop: 40 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 5 }}>Logistics Details</Text>
              <Text style={{ fontSize: 9, marginBottom: 3 }}>Driver Name: {('driverName' in data ? data.driverName : '____________________')}</Text>
              <Text style={{ fontSize: 9 }}>Vehicle No: {('vehicleNo' in data ? data.vehicleNo : '____________________')}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              {Boolean(('signatureDataUrl' in data && (data as any).signatureDataUrl) || ('proofOfDelivery' in data && (data as any).proofOfDelivery?.signatureDataUrl)) ? (
                <View style={{ height: 40, width: 100, marginBottom: 5 }} />
              ) : (
                <View style={{ height: 45 }} />
              )}
              <View style={[s.sigLine, { width: 180 }]} />
              <Text style={{ fontSize: 9 }}>Received By: {('receivedBy' in data && (data as any).receivedBy) || ('proofOfDelivery' in data && (data as any).proofOfDelivery?.receivedBy) || ('conversionDetails' in data && data.conversionDetails?.acceptedBy) || '____________________'}</Text>
              <Text style={{ fontSize: 7, color: '#666' }}>Stamp & Signature</Text>
              {Boolean('conversionDetails' in data && (data as any).conversionDetails?.locationStamp) ? (
                <Text style={{ fontSize: 7, color: '#666', marginTop: 5 }}>
                  GPS: {(data as any).conversionDetails.locationStamp.lat.toFixed(4)}, {(data as any).conversionDetails.locationStamp.lng.toFixed(4)}
                </Text>
              ) : Boolean('proofOfDelivery' in data && (data as any).proofOfDelivery?.locationStamp) ? (
                <Text style={{ fontSize: 7, color: '#666', marginTop: 5 }}>
                  GPS: {(data as any).proofOfDelivery.locationStamp.lat.toFixed(4)}, {(data as any).proofOfDelivery.locationStamp.lng.toFixed(4)}
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Standard Receipt Signature */}


        {/* DYNAMIC CENTERED FOOTER (Movable) */}
        <View style={s.footerContainer} wrap={false}>
          <View style={s.footerLine} />
        </View>

        {/* STATIC LEGAL FOOTER (Fixed at the bottom of every page) */}
        <SecurityFooter
          data={dataAny}
          companyName={companyName}
          legalFooterLine1={legalFooterLine1}
          legalFooterLine2={legalFooterLine2}
          fontScale={fontScale}
        />
      </Page>
    </Document>
  );
};
