import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'core',
  excludeBrowserTests: true,
  // Ratcheted to the MEASURED actual (98.48 / 92.11 / 95.23 / 99.66) by the
  // 92%+ campaign. The previous 95/94/86/92 was set when the CLIENT half of
  // the package was genuinely unreachable from node vitest; three suites
  // closed most of it under happy-dom rather than requiring real Chromium:
  //
  //   * the server-island CLIENT path — the marker's self-activation ref,
  //     the fragment fetch, the `data-pyreon-si` idempotency stamp shared by
  //     two activation paths, and all three failure modes. Previously ZERO
  //     coverage: `server-island.test.ts` runs under `node`, where
  //     `isClient` is false and the ref branch does not exist.
  //   * the island props codec against a MALFORMED `data-props` attribute —
  //     the least trustworthy input in the hydration path.
  //   * `prerender` when a handler throws, including the leak-class-I timer
  //     clear (observed via `getActiveResourcesInfo`, which reports timers;
  //     `_getActiveHandles` does not, and a spec written against it passes
  //     with the clear removed).
  //
  // The residual is the browser-only `island()` hydration scheduling in
  // client.ts, covered by islands.browser.test.tsx in real Chromium, plus
  // two arms the source itself documents as unreachable.
  coverageThresholds: {
    statements: 98,
    lines: 99,
    branches: 92,
    functions: 95,
  },
})
