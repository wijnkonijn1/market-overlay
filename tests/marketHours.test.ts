import { describe, it, expect } from 'vitest';
import * as hours from '../src/main/market/marketHours';

describe('marketHours', () => {
  it('maps suffixes', () => {
    expect(hours.resolveCalendarId('AAPL')).toBe('US');
    expect(hours.resolveCalendarId('ASML.AS')).toBe('EURONEXT');
    expect(hours.resolveCalendarId('VOD.L')).toBe('LONDON');
    expect(hours.resolveCalendarId('SAP.DE')).toBe('XETRA');
    expect(hours.resolveCalendarId('7203.T')).toBe('TOKYO');
    expect(hours.resolveCalendarId('0700.HK')).toBe('HONG_KONG');
    expect(hours.resolveCalendarId('BTC-USD')).toBe('CRYPTO');
  });

  it('US open Tuesday', () => {
    expect(hours.getMarketStateForSymbol('AAPL', 'NMS', null, new Date('2024-06-04T15:00:00Z'))).toBe('REGULAR');
  });

  it('US closed Sunday', () => {
    expect(hours.getMarketStateForSymbol('AAPL', undefined, null, new Date('2024-06-02T15:00:00Z'))).toBe('CLOSED');
  });

  it('London open', () => {
    expect(hours.getMarketStateForSymbol('VOD.L', 'LSE', null, new Date('2024-06-04T10:00:00Z'))).toBe('REGULAR');
  });

  it('Tokyo closed + next open', () => {
    const now = new Date('2024-06-04T10:00:00Z');
    expect(hours.getMarketStateForSymbol('7203.T', undefined, null, now)).toBe('CLOSED');
    const next = hours.getNextOpenTime('7203.T', undefined, now);
    expect(next).not.toBeNull();
    expect(next!.at).toBeGreaterThan(now.getTime());
  });

  it('crypto 24/7', () => {
    expect(hours.getMarketStateForSymbol('BTC-USD')).toBe('CRYPTO_24_7');
    expect(hours.getNextOpenTime('BTC-USD')).toBeNull();
  });

  it('prefers quote state', () => {
    expect(hours.getMarketStateForSymbol('AAPL', 'NMS', 'PRE')).toBe('PRE');
  });
});
