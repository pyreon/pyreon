import { defineNodeConfig } from '@pyreon/vitest-config'

export default defineNodeConfig({
  category: 'fundamentals',
  environment: 'happy-dom',
  // Statements/branches sit BELOW the 99 the rest of this config aspires to,
  // and that is recorded rather than hidden. `bun run test` for this package
  // exits 1 on main today at 98.08% — the package has been under its own floor
  // and nothing surfaced it, because the PR-time gate measures only directly
  // changed packages and this one is rarely touched.
  //
  // Ratcheted 98/90 -> 99/92 (measured 99.15 / 92.72) by the 92%+ campaign.
  // The lift is three suites over paths that had none: the layout engine
  // against MALFORMED graphs (dangling edges, cycles, self-loops, forests —
  // every algorithm, where the old tests only ever passed a well-formed one),
  // the `direction` option including the UP/LEFT axis flip (whose docstring
  // claims which algorithms honour it — now executable), and the edge API's
  // no-op guards, which are asserted through the UNDO STACK rather than the
  // edge list, because an unchanged edge list is what a broken guard also
  // produces. Set to the MEASURED actual so the gate is honest and ratchets
  // UP from here — never lower these to absorb a future drop.
  coverageThresholds: { statements: 99, branches: 92, functions: 100, lines: 99 },
  excludeBrowserTests: true,
  // edge-geometry.ts moved out of src/components/ (verbatim) so the instance
  // can memoize it per edge — same coverage story as components/**: its full
  // branch surface (measured handles, floating endpoints, waypoints) is only
  // driven by the real-Chromium suites (edge-render/handle-anchor browser
  // tests + the app-showcase flow e2e); happy-dom has no layout.
  coverageExclude: ['src/components/**', 'src/edge-geometry.ts'],
})
