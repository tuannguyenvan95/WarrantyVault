import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Declare window.ethereum so tests (and App.tsx) can access it without `as any`
declare global {
  interface Window {
    ethereum?: any;
  }
}

// Mock window.ethereum for MetaMask
Object.defineProperty(window, 'ethereum', {
  value: {
    request: vi.fn().mockResolvedValue([]),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
  writable: true,
  configurable: true,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});
