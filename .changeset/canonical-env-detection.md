---
'@pyreon/reactivity': minor
'@pyreon/core': minor
'@pyreon/router': patch
'@pyreon/hooks': patch
'@pyreon/url-state': patch
'@pyreon/elements': patch
'@pyreon/ui-core': patch
'@pyreon/styler': patch
'@pyreon/lint': patch
---

Add canonical runtime environment flags `isServer` / `isClient` to `@pyreon/reactivity` (re-exported from `@pyreon/core`).

`isServer` is `typeof document === 'undefined'` — the most reliable "is there a DOM" discriminator (more correct than `typeof window`, which misreports Deno and polyfilled Node). Plain runtime constants, evaluated once at module load: correct in every runtime with zero bundler configuration. Use them for small environment guards (module-level singletons, lazy globals, render output that differs server vs client); for heavy server-only code prefer a `/server` subpath export, and for DOM access inside a component prefer `onMount` / `effect` (which never run during SSR).

Internally, this replaces seven hand-rolled `typeof window` / `typeof document` env consts across `router`, `hooks`, `url-state`, `elements`, `ui-core`, and `styler` with the single primitive — removing the drift (the copies disagreed on `window` vs `document`) and the inconsistency. Behavior is unchanged in browsers and Node; the `window` → `document` switch is a strict improvement for Deno / Web Workers.

`@pyreon/lint`'s `no-window-in-ssr` rule now recognises an imported `isClient` / `isServer` (or `isBrowser` / `isSSR`) as an SSR guard — but only when imported from `@pyreon/reactivity` or `@pyreon/core`, so `if (isClient) window.x` / `if (isServer) return` / `if (!isClient) return` are clean while a same-named local `const isBrowser = true` or a foreign-source import stays flagged.
