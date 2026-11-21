import '@testing-library/jest-dom/vitest';

// jsdom has no ResizeObserver; Radix primitives (the checkbox) measure themselves with it.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (!('ResizeObserver' in globalThis)) globalThis.ResizeObserver = ResizeObserverStub;
