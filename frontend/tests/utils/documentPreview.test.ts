import { describe, expect, it } from 'vitest';
import { resolvePreviewMode } from '../../utils/documentPreview';

describe('resolvePreviewMode', () => {
  const desktop = {
    isAndroid: false,
    isDesktop: true,
    isIOS: false,
    isMobile: false,
    isTablet: false,
    isTouch: false,
  };

  const tablet = {
    isAndroid: false,
    isDesktop: false,
    isIOS: false,
    isMobile: false,
    isTablet: true,
    isTouch: true,
  };

  it('keeps PDF previews inline on desktop', () => {
    expect(resolvePreviewMode({
      device: desktop,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      publicUrl: 'https://example.com/invoice.pdf',
      sourceUrl: 'https://example.com/invoice.pdf',
    })).toBe('iframe');
  });

  it('keeps PDF previews inline on tablets instead of defaulting to Google viewer', () => {
    expect(resolvePreviewMode({
      device: tablet,
      fileName: 'invoice.pdf',
      mimeType: 'application/pdf',
      publicUrl: 'https://example.com/invoice.pdf',
      sourceUrl: 'https://example.com/invoice.pdf',
    })).toBe('iframe');
  });

  it('still uses Google viewer for word documents when a public URL exists', () => {
    expect(resolvePreviewMode({
      device: tablet,
      fileName: 'invoice.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      publicUrl: 'https://example.com/invoice.docx',
      sourceUrl: 'https://example.com/invoice.docx',
    })).toBe('google');
  });
});
