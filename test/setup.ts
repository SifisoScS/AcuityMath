import '@testing-library/jest-dom/vitest';

/**
 * jsdom implements neither of these, and both are called during a normal render
 * of the practice view — `speechSynthesis` by the read-aloud control and
 * `matchMedia` by the reduced-motion check. Without stubs the component throws
 * before the assertion is reached, and the failure names the missing API rather
 * than the behaviour under test.
 */
// Guarded because not every suite runs in a DOM. `suiteInventory` reads
// vitest's own configuration, which drags in esbuild, and esbuild refuses to
// run under jsdom — so that file declares the node environment and arrives here
// with no `window` at all.
const hasDom = typeof window !== 'undefined';

if (hasDom && !window.matchMedia) {
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

if (hasDom && !window.speechSynthesis) {
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
