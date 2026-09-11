import { describe, expect, it } from 'vitest';
import { flagCodeForLanguage, languageDisplayCode } from './flagCodeForLanguage';

describe('flagCodeForLanguage', () => {
  it('uses ISO 3166-1 alpha-2 region when present', () => {
    expect(flagCodeForLanguage('en-US')).toBe('us');
    expect(flagCodeForLanguage('en-GB')).toBe('gb');
    expect(flagCodeForLanguage('el-GR')).toBe('gr');
    expect(flagCodeForLanguage('zh-CN')).toBe('cn');
  });

  it('skips 4-letter script subtags before region', () => {
    expect(flagCodeForLanguage('zh-Hans-CN')).toBe('cn');
  });

  it('falls back to primary-language map without a valid region', () => {
    expect(flagCodeForLanguage('en')).toBe('gb');
    expect(flagCodeForLanguage('el')).toBe('gr');
    expect(flagCodeForLanguage('en-419')).toBe('gb');
  });

  it('defaults empty or unknown primaries to gb', () => {
    expect(flagCodeForLanguage('')).toBe('gb');
    expect(flagCodeForLanguage('xx')).toBe('gb');
  });
});

describe('languageDisplayCode', () => {
  it('returns the primary subtag uppercased', () => {
    expect(languageDisplayCode('en-US')).toBe('EN');
    expect(languageDisplayCode('el')).toBe('EL');
  });
});
