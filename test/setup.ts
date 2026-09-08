import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither of these, and both are called during a normal render
 * of the practice view — `speechSynthesis` by the read-aloud control and
 * `matchMedia` by the reduced-motion check. Without stubs the component throws
 * before the assertion is reached, and the failure names the missing API rather
 * than the behaviour under test.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!window.speechSynthesis) {
  Object.defineProperty(window, 'speechSynthesis', {
    writable: true,
    value: {
      speak: () => {},
      cancel: () => {},
      getVoices: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
  });
}
