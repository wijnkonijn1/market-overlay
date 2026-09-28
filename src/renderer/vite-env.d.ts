/// <reference types="vite/client" />
import type { MarketOverlayApi } from '../preload/index';

declare global {
  interface Window {
    marketOverlay: MarketOverlayApi;
  }
}
export {};
