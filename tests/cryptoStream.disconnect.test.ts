import { EventEmitter } from 'events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

class FakeWebSocket extends EventEmitter {
  static CONNECTING = CONNECTING;
  static OPEN = OPEN;
  static CLOSING = CLOSING;
  static CLOSED = CLOSED;
  readyState = CONNECTING;
  terminateCalls = 0;
  closeCalls = 0;

  terminate() {
    this.terminateCalls += 1;
    this.readyState = CLOSED;
  }

  close() {
    this.closeCalls += 1;
    this.readyState = CLOSED;
  }
}

vi.mock('ws', () => ({
  default: FakeWebSocket,
  __esModule: true,
}));

describe('CryptoStream disconnect safety', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('disconnect while CONNECTING does not throw; double-disconnect and same-setSymbols reuse are safe', async () => {
    const { CryptoStream } = await import('../src/main/market/CryptoStream');
    const stream = new CryptoStream();

    stream.setSymbols(['BTC-USD']);
    expect(() => stream.disconnect()).not.toThrow();
    expect(() => stream.disconnect()).not.toThrow();

    stream.setSymbols(['BTC-USD']);
    expect(() => stream.setSymbols(['BTC-USD'])).not.toThrow();
    expect(() => stream.disconnect()).not.toThrow();
  });

  it('terminate is used for CONNECTING sockets', async () => {
    const { CryptoStream } = await import('../src/main/market/CryptoStream');
    const stream = new CryptoStream();
    stream.setSymbols(['ETH-USD']);
    // Access private ws via any for assertion
    const ws = (stream as unknown as { ws: FakeWebSocket | null }).ws;
    expect(ws).toBeTruthy();
    expect(ws!.readyState).toBe(CONNECTING);
    stream.disconnect();
    expect(ws!.terminateCalls).toBe(1);
    expect(ws!.closeCalls).toBe(0);
  });
});
