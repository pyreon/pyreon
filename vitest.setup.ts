/**
 * Vitest setup — runs before each test file across every workspace.
 *
 * ## localStorage shim for happy-dom + Node 22+
 *
 * Vitest 4.x's happy-dom adapter populates `globalThis` from the
 * happy-dom Window via a `populateGlobal()` helper that filters keys
 * via:
 *
 *   if (k in global) return keysArray.includes(k)
 *
 * `keysArray` is a hardcoded list of allowed Window keys (`addEventListener`,
 * `document`, `location`, ...). It does NOT include `localStorage` or
 * `sessionStorage`.
 *
 * Node 22+ ships an **experimental** `localStorage` global behind the
 * `--localstorage-file` flag. Without the flag, Node still defines the
 * getter on `globalThis` — so `'localStorage' in globalThis` returns
 * `true` even though `typeof globalThis.localStorage === 'undefined'`.
 * Vitest's filter sees the key as already-present and skips happy-dom's
 * installation. Result: every test reading the bare `localStorage`
 * global gets `undefined.clear()` → `TypeError`.
 *
 * `sessionStorage` is unaffected only because Node's experimental stub
 * for it happens to return a real (in-memory) `Storage` instance.
 *
 * Fix: instantiate happy-dom's own `Storage` class and install it on
 * `globalThis.localStorage`. (We can't read it off the happy-dom
 * Window because vitest sets `global.window = global` after population
 * — `window.localStorage` is the same lookup as `globalThis.localStorage`
 * and equally undefined.)
 *
 * Defensive `&& globalThis.localStorage === undefined` guard so we
 * never clobber a working install (real browsers, future Node defaults,
 * jsdom, etc.). No-op in non-happy-dom packages — `happy-dom` is
 * already a workspace dep so importing it is free in Node-env packages
 * too; we just don't install.
 *
 * Verified: vitest@4.1.6, happy-dom@20.9.0, Node ≥ 22.
 * Track upstream: vitest's `populateGlobal` should skip keys that are
 * `undefined` even when present in `globalThis`.
 */

import { Storage } from 'happy-dom'

if (typeof window !== 'undefined' && globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new Storage(),
    writable: true,
    configurable: true,
  })
}
