/**
 * Ambient type augmentation for test-side global probes and platform APIs
 * that TypeScript's standard `lib` either doesn't ship or marks read-only.
 *
 * Per the test-any reduction effort (audit at
 * `.claude/plans/test-any-reduction-audit.md`), this file absorbs the
 * `(document as any).startViewTransition`, `(window as any).__X`, and
 * `(globalThis as any).WebSocket` casts that recurred across 32 sites.
 *
 * Usage — opt in per package via `tsconfig.json` `types` field:
 *
 *   {
 *     "compilerOptions": {
 *       "types": ["node", "vitest/globals", "@pyreon/test-utils/globals"]
 *     }
 *   }
 *
 * Or import the file directly for one-off opt-in:
 *
 *   /// <reference types="@pyreon/test-utils/globals" />
 *
 * After opt-in, the casts collapse to plain reads / writes:
 *
 *   // Before:
 *   ;(document as any).startViewTransition = stub
 *   ;(window as any).__mutation = mutation
 *   ;(globalThis as any).WebSocket = MockWebSocketClass
 *
 *   // After:
 *   document.startViewTransition = stub
 *   window.__mutation = mutation
 *   globalThis.WebSocket = MockWebSocketClass as unknown as typeof WebSocket
 *
 * NOTE on the globalThis assignments: TS marks `WebSocket` / `EventSource`
 * / `indexedDB` on `Window` & `WorkerGlobalScope` as readonly, so even
 * with ambient types present a single `as unknown as typeof X` cast is
 * needed at the assignment site. The ambient still helps because the
 * READ sites (downstream `globalThis.WebSocket(...)` calls) typecheck
 * cleanly — the cast is contained to the one stubbing assignment.
 */

// ---------- View Transitions API ----------
// https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
// Chromium 111+, Safari 18+, Firefox doesn't ship yet (Mar 2025). TS lib
// doesn't have it as of TS 6.0 — so any test that stubs it needs an
// ambient. Mirrors @types/dom-view-transitions @ npm.

interface ViewTransition {
  readonly ready: Promise<void>
  readonly finished: Promise<void>
  readonly updateCallbackDone: Promise<void>
  skipTransition(): void
}

interface Document {
  startViewTransition?: (callback: () => void | Promise<void>) => ViewTransition
}

// ---------- Test-side probe globals (window.__pyreon_test_*) ----------
// Tests use these to expose intermediate state across the test boundary —
// e.g. capturing a mutation/query observer from a child and asserting on
// it from the test body. The convention is name-spaced under
// `__` prefix; we declare the union widely (`unknown`) and let the test
// body narrow at the read site.
//
// Existing names in use across the suite:
//   __mutation, __query, __refetch (from @pyreon/query tests)
//
// New code should prefer the typed approach: declare a per-file `interface
// Window { __myFlag: MyShape }` augmentation in the test file itself. This
// file declares the existing names as `unknown` so the migration of the
// existing sites compiles without per-site work.

interface Window {
  __mutation?: unknown
  __query?: unknown
  __refetch?: unknown
}

// Empty export to mark this as a module — required so the `declare global`
// (or implicit `interface X` augmentations above) attach to the global scope
// when consumed via `tsconfig.json` `types`.
export {}
