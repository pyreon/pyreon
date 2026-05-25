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
 * ## Why we hand-roll Storage instead of importing happy-dom
 *
 * Earlier versions of this file did `import { Storage } from 'happy-dom'`.
 * That works in happy-dom Node environments but **breaks every package's
 * browser tests** (run via `@vitest/browser` in real Chromium). happy-dom's
 * `AsyncTaskManager` module evaluates `process.nextTick.bind(process)` at
 * load time, and Vite's browser `process` polyfill doesn't include
 * `.nextTick` → `TypeError: Cannot read properties of undefined (reading
 * 'bind')` at module load. Every browser test in every package failed.
 *
 * The `Storage` interface is small + well-defined (W3C Web Storage spec).
 * Hand-rolling it has zero transitive dependencies and works cleanly in
 * any environment. The few packages whose tests dispatch
 * `StorageEvent` events do so manually via `window.dispatchEvent(new
 * StorageEvent('storage', { ... }))` — that's orthogonal to the Storage
 * implementation; standard Storage never auto-fires events in the
 * same-window.
 *
 * Defensive `&& globalThis.localStorage === undefined` guard so we
 * never clobber a working install (real browsers, future Node defaults,
 * jsdom, etc.). No-op in real-browser test environments.
 *
 * Verified: vitest@4.1.6, happy-dom@20.9.0, Node ≥ 22, @vitest/browser
 * in real Chromium.
 * Track upstream: vitest's `populateGlobal` should skip keys that are
 * `undefined` even when present in `globalThis`.
 */

class InMemoryStorage implements Storage {
  private _data = new Map<string, string>()
  get length(): number {
    return this._data.size
  }
  key(index: number): string | null {
    return Array.from(this._data.keys())[index] ?? null
  }
  getItem(key: string): string | null {
    return this._data.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this._data.set(key, String(value))
  }
  removeItem(key: string): void {
    this._data.delete(key)
  }
  clear(): void {
    this._data.clear()
  }
}

if (typeof window !== 'undefined' && globalThis.localStorage === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new InMemoryStorage(),
    writable: true,
    configurable: true,
  })
}
