/**
 * File-path classifiers used by lint rules that need to behave differently
 * for different layers of the codebase.
 *
 * Patterns intentionally do NOT start with `/` so they match both absolute
 * (`/Users/.../packages/zero/...`) and relative (`packages/zero/...`) paths —
 * different lint runners pass paths differently.
 */

// ─── Server-only packages ────────────────────────────────────────────────────
//
// Code that runs in Node (build-time plugins, CLI tools, server entries) where:
//   - `process` is always defined (so `typeof process` is fine)
//   - `__DEV__` / `import.meta.env.DEV` aren't conventionally available, and
//     dev/prod is `process.env.NODE_ENV` instead
//   - User-facing `console.error`/`console.warn` from CLI commands is the
//     intended UX, not a dev hint
//
// Architecture rules that target browser-runtime patterns
// (`pyreon/no-process-dev-gate`, `pyreon/dev-guard-warnings`, etc.) skip
// any file whose path matches one of these patterns.

export const SERVER_PACKAGE_PATTERNS = [
  'packages/zero/',
  'packages/core/server/',
  'packages/core/runtime-server/',
  'packages/tools/vite-plugin/',
  'packages/tools/cli/',
  'packages/tools/lint/',
  'packages/tools/mcp/',
  'packages/tools/storybook/',
  'packages/tools/typescript/',
  'scripts/',
]

export function isServerOnlyFile(filePath: string): boolean {
  return SERVER_PACKAGE_PATTERNS.some((pat) => filePath.includes(pat))
}

// ─── DOM-runtime packages ────────────────────────────────────────────────────
//
// `runtime-dom` IS the DOM renderer: its job is to call
// `document.createElement`, `addEventListener`, etc. directly. There is no
// SSR scenario for these files (`runtime-server` is the SSR equivalent),
// so SSR-safety rules like `pyreon/no-window-in-ssr` and
// `pyreon/no-raw-addeventlistener` would only flag the package for doing
// what it exists to do.
//
// User code (component packages, hooks, app code) that *does* run in SSR
// must still be flagged — that's the rule's whole point.

export const DOM_RUNTIME_PATTERNS = [
  'packages/core/runtime-dom/',
]

export function isDomRuntimeFile(filePath: string): boolean {
  return DOM_RUNTIME_PATTERNS.some((pat) => filePath.includes(pat))
}

// ─── Cleanup-wrapper foundation packages ─────────────────────────────────────
//
// Packages that *implement* the auto-cleanup hook wrappers the codebase
// encourages elsewhere. A rule like `pyreon/no-raw-addeventlistener` exists
// to push consumers toward `useEventListener()` — but `useEventListener()`
// itself has to call raw `el.addEventListener(...)` somewhere, and that
// somewhere is `@pyreon/hooks`. Same for `useInterval` / `setInterval`.
// `runtime-dom` also belongs here because it wires raw event delegation
// at the root container.
//
// Rules that target "prefer the cleanup-wrapper" patterns skip these
// packages so they don't flag the wrappers themselves.

export const CLEANUP_WRAPPER_FOUNDATION_PATTERNS = [
  'packages/core/runtime-dom/',
  'packages/fundamentals/hooks/',
]

export function isCleanupWrapperFoundation(filePath: string): boolean {
  return CLEANUP_WRAPPER_FOUNDATION_PATTERNS.some((pat) => filePath.includes(pat))
}

// ─── Test files ──────────────────────────────────────────────────────────────
//
// Rules that target patterns tests legitimately exercise (e.g. raw
// `setInterval` for time-based tests, duplicate store IDs to cover
// collision handling, submitting forms without validation to assert
// validation ran, direct `localStorage` probes, mutating store state
// to assert immutability protections, etc.) skip test files via this
// helper. Tests are where we *demonstrate* the anti-pattern to verify
// production code handles it — flagging them inside tests produces
// noise that masks real signal elsewhere.
//
// Rules where the pattern is wrong in any context (e.g. `<For>`
// without `by`, bare signal in JSX) do NOT use this — those
// legitimately apply to tests too.

export function isTestFile(filePath: string): boolean {
  return (
    filePath.includes('/tests/') ||
    filePath.includes('/test/') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  )
}
