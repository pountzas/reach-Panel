import { describe, expect, it } from 'vitest';
import {
  MAX_PREVIEW_DATA_URL_LENGTH,
  previewDataUrl,
} from './previewDataUrl';

describe('previewDataUrl', () => {
  it('accepts a valid jpeg data URL', () => {
    const url = 'data:image/jpeg;base64,/9j/4AAQ';
    expect(previewDataUrl(url)).toBe(url);
  });

  it('accepts a valid png data URL', () => {
    const url = 'data:image/png;base64,iVBORw0KGgo=';
    expect(previewDataUrl(url)).toBe(url);
  });

  it('rejects javascript: URLs', () => {
    expect(previewDataUrl('javascript:alert(1)')).toBeNull();
  });

  it('rejects https URLs', () => {
    expect(previewDataUrl('https://example.com/a.png')).toBeNull();
  });

  it('rejects file: URLs', () => {
    expect(previewDataUrl('file:///tmp/a.png')).toBeNull();
  });

  it('rejects oversized strings', () => {
    const oversized =
      'data:image/jpeg;base64,' + 'A'.repeat(MAX_PREVIEW_DATA_URL_LENGTH);
    expect(oversized.length).toBeGreaterThan(MAX_PREVIEW_DATA_URL_LENGTH);
    expect(previewDataUrl(oversized)).toBeNull();
  });

  it('rejects non-strings', () => {
    expect(previewDataUrl(null)).toBeNull();
    expect(previewDataUrl(undefined)).toBeNull();
    expect(previewDataUrl(42)).toBeNull();
    expect(previewDataUrl({ dataUrl: 'x' })).toBeNull();
  });

  it('rejects missing or empty values', () => {
    expect(previewDataUrl('')).toBeNull();
    expect(previewDataUrl('data:image/jpeg;base64,')).toBeNull();
  });
});
