/**
 * Exchange-aware market calendars (US / Europe / Asia) + next-open helpers.
 */
import type { MarketState, Quote } from '../../shared/types';
import { isCryptoSymbol } from '../../shared/cryptoMap';

export type CalendarId =
  | 'US' | 'LONDON' | 'EURONEXT' | 'XETRA' | 'TOKYO' | 'HONG_KONG' | 'CRYPTO';

export interface SessionWindow {
  start: number;
  end: number;
  state: MarketState;
}

export interface MarketCalendar {
  id: Exclude<CalendarId, 'CRYPTO'>;
  label: string;
  timeZone: string;
  sessions: SessionWindow[];
  regularOpen: number;
  regularClose: number;
}

function hm(h: number, m = 0): number {
  return h * 60 + m;
}

export const CALENDARS: Record<Exclude<CalendarId, 'CRYPTO'>, MarketCalendar> = {
  US: {
    id: 'US',
    label: 'US (NYSE/Nasdaq)',
    timeZone: 'America/New_York',
    sessions: [
      { start: hm(4, 0), end: hm(9, 30), state: 'PRE' },
      { start: hm(9, 30), end: hm(16, 0), state: 'REGULAR' },
      { start: hm(16, 0), end: hm(20, 0), state: 'POST' },
    ],
    regularOpen: hm(9, 30),
    regularClose: hm(16, 0),
  },
  LONDON: {
    id: 'LONDON',
    label: 'London (LSE)',
    timeZone: 'Europe/London',
    sessions: [{ start: hm(8, 0), end: hm(16, 30), state: 'REGULAR' }],
    regularOpen: hm(8, 0),
    regularClose: hm(16, 30),
  },
  EURONEXT: {
    id: 'EURONEXT',
    label: 'Euronext',
    timeZone: 'Europe/Paris',
    sessions: [{ start: hm(9, 0), end: hm(17, 30), state: 'REGULAR' }],
    regularOpen: hm(9, 0),
    regularClose: hm(17, 30),
  },
  XETRA: {
    id: 'XETRA',
    label: 'Xetra (Frankfurt)',
    timeZone: 'Europe/Berlin',
    sessions: [{ start: hm(9, 0), end: hm(17, 30), state: 'REGULAR' }],
    regularOpen: hm(9, 0),
    regularClose: hm(17, 30),
  },
  TOKYO: {
    id: 'TOKYO',
    label: 'Tokyo (TSE)',
    timeZone: 'Asia/Tokyo',
    sessions: [{ start: hm(9, 0), end: hm(15, 0), state: 'REGULAR' }],
    regularOpen: hm(9, 0),
    regularClose: hm(15, 0),
  },
  HONG_KONG: {
    id: 'HONG_KONG',
    label: 'Hong Kong (HKEX)',
    timeZone: 'Asia/Hong_Kong',
    sessions: [{ start: hm(9, 30), end: hm(16, 0), state: 'REGULAR' }],
    regularOpen: hm(9, 30),
    regularClose: hm(16, 0),
  },
};

const SUFFIX_MAP: Record<string, Exclude<CalendarId, 'CRYPTO'>> = {
  AS: 'EURONEXT', PA: 'EURONEXT', BR: 'EURONEXT',
  L: 'LONDON', LSE: 'LONDON',
  DE: 'XETRA', F: 'XETRA',
  T: 'TOKYO',
  HK: 'HONG_KONG',
};

const EXCHANGE_MAP: Array<{ match: RegExp; calendar: Exclude<CalendarId, 'CRYPTO'> }> = [
  { match: /^(NMS|NYQ|NGM|NCM|ASE|PCX|NYSE|NASDAQ|AMEX)/i, calendar: 'US' },
  { match: /NEW YORK|NASDAQ|NYSE/i, calendar: 'US' },
  { match: /^(LSE|LON)$/i, calendar: 'LONDON' },
  { match: /LONDON/i, calendar: 'LONDON' },
  { match: /^(AMS|PAR|BRU)/i, calendar: 'EURONEXT' },
  { match: /AMSTERDAM|PARIS|BRUSSELS|EURONEXT/i, calendar: 'EURONEXT' },
  { match: /^(GER|FRA|XETRA)/i, calendar: 'XETRA' },
  { match: /FRANKFURT|XETRA|BERLIN/i, calendar: 'XETRA' },
  { match: /^(JPX|TYO|TSE)$/i, calendar: 'TOKYO' },
  { match: /TOKYO|JAPAN/i, calendar: 'TOKYO' },
  { match: /^(HKG|HKSE)$/i, calendar: 'HONG_KONG' },
  { match: /HONG KONG/i, calendar: 'HONG_KONG' },
];

export function resolveCalendarId(symbol: string, exchange?: string): CalendarId {
  if (isCryptoSymbol(symbol)) return 'CRYPTO';
  const upper = symbol.toUpperCase();
  const dot = upper.lastIndexOf('.');
  if (dot >= 0) {
    const suffix = upper.slice(dot + 1);
    if (SUFFIX_MAP[suffix]) return SUFFIX_MAP[suffix];
  }
  if (exchange) {
    for (const { match, calendar } of EXCHANGE_MAP) {
      if (match.test(exchange)) return calendar;
    }
  }
  return 'US';
}

export function getCalendar(symbol: string, exchange?: string): MarketCalendar | null {
  const id = resolveCalendarId(symbol, exchange);
  if (id === 'CRYPTO') return null;
  return CALENDARS[id];
}

export interface ZonedParts {
  weekday: string;
  hour: number;
  minute: number;
  year: number;
  month: number;
  day: number;
}

export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return {
    weekday: get('weekday'),
    hour,
    minute: Number(get('minute')),
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
  };
}

function isWeekend(weekday: string): boolean {
  return weekday === 'Sat' || weekday === 'Sun';
}

export function stateFromCalendar(cal: MarketCalendar, now = new Date()): MarketState {
  try {
    const z = getZonedParts(now, cal.timeZone);
    if (isWeekend(z.weekday)) return 'CLOSED';
    const mins = z.hour * 60 + z.minute;
    for (const s of cal.sessions) {
      if (mins >= s.start && mins < s.end) return s.state;
    }
    return 'CLOSED';
  } catch {
    return 'UNKNOWN';
  }
}

export function getMarketStateForSymbol(
  symbol: string,
  exchange?: string,
  quoteMarketState?: string | null,
  now = new Date()
): MarketState {
  if (isCryptoSymbol(symbol)) return 'CRYPTO_24_7';

  if (quoteMarketState) {
    const s = quoteMarketState.toUpperCase();
    if (s === 'REGULAR') return 'REGULAR';
    if (s === 'PRE' || s === 'PREPRE') return 'PRE';
    if (s === 'POST' || s === 'POSTPOST') return 'POST';
    if (s === 'CLOSED') return 'CLOSED';
  }

  const cal = getCalendar(symbol, exchange);
  if (!cal) return 'UNKNOWN';
  return stateFromCalendar(cal, now);
}

/** Prefer quote.marketState when present; else calendar. Crypto → CRYPTO_24_7 */
export function getMarketStateForSymbolAlias(
  symbol: string,
  exchange?: string,
  quoteMarketState?: string | null,
  now = new Date()
): MarketState {
  return getMarketStateForSymbol(symbol, exchange, quoteMarketState, now);
}

export function heuristicUsMarketState(now = new Date()): MarketState {
  return stateFromCalendar(CALENDARS.US, now);
}

export interface NextOpenInfo {
  at: number;
  iso: string;
  label: string;
  calendarId: CalendarId;
}

export function zonedLocalToUtc(
  year: number, month: number, day: number,
  hour: number, minute: number, timeZone: string
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const asLocalMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wantMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = wantMs - asLocalMs;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  return new Date(guess);
}

function findOpenOnOffset(cal: MarketCalendar, now: Date, dayOffset: number): Date | null {
  const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
  const z = getZonedParts(probe, cal.timeZone);
  if (isWeekend(z.weekday)) return null;
  const openUtc = zonedLocalToUtc(
    z.year, z.month, z.day,
    Math.floor(cal.regularOpen / 60), cal.regularOpen % 60,
    cal.timeZone
  );
  if (dayOffset === 0 && openUtc.getTime() <= now.getTime()) return null;
  return openUtc;
}

function formatNextOpenLabel(date: Date, cal: MarketCalendar): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: cal.timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    return `Opens ${formatted} ${cal.label.split(' ')[0]}`;
  } catch {
    return `Opens ${date.toISOString()}`;
  }
}

export function getNextOpenTime(
  symbol: string,
  exchange?: string,
  now = new Date()
): NextOpenInfo | null {
  if (isCryptoSymbol(symbol)) return null;
  const cal = getCalendar(symbol, exchange);
  if (!cal) return null;

  for (let dayOffset = 0; dayOffset <= 10; dayOffset++) {
    const candidate = findOpenOnOffset(cal, now, dayOffset);
    if (candidate && candidate.getTime() > now.getTime()) {
      return {
        at: candidate.getTime(),
        iso: candidate.toISOString(),
        label: formatNextOpenLabel(candidate, cal),
        calendarId: cal.id,
      };
    }
  }
  return null;
}

export function enrichQuoteWithNextOpen(quote: Quote): Quote {
  if (quote.type === 'crypto' || quote.marketState === 'CRYPTO_24_7') return quote;
  if (quote.marketState === 'REGULAR' || quote.marketState === 'PRE') return quote;
  const next = getNextOpenTime(quote.symbol, quote.exchange);
  if (!next) return quote;
  return {
    ...quote,
    nextOpenAt: next.at,
    nextOpenLabel: next.label,
  };
}

