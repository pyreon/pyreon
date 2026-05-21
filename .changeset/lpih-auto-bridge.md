---
'@pyreon/vite-plugin': minor
---

LPIH auto-bridge — zero-config Live Program Inlay Hints in dev (R1).

Closes the last queued recommendation from the LPIH foundation PR (#769). With this PR, **Vite users get LPIH for free**: the plugin auto-injects a browser-side bridge that activates devtools + polls `getFireSummaries()` every 250ms, and registers a `POST /__pyreon_lpih__` dev-server middleware that atomically writes the cache file the LSP auto-discovers (R2, #777).

End-to-end setup is now:

```ts
// vite.config.ts
import pyreon from '@pyreon/vite-plugin'
export default { plugins: [pyreon()] }  // that's it
```

```bash
# In your editor: run the LSP, see ghost text.
pyreon-lint --lsp
```

No `activateReactiveDevtools()` call, no `startLpihPolling()` call, no `PYREON_LPIH_CACHE` env var, no `.pyreon-lpih.json` config — the plugin wires all three layers automatically.

**New options surface:**
- `pyreon({ lpih: false })` — opt out (e.g. wiring `startLpihPolling()` manually from a non-browser runtime)
- `pyreon({ lpih: { intervalMs: 500 } })` — slower poll for low-CPU environments
- `pyreon({ lpih: { cachePath: '/abs/path.json' } })` — override the default `<projectRoot>/.pyreon-lpih.json`

**Architecture decision** (the "scope" question from the deferred report): the auto-bridge lives in `@pyreon/vite-plugin` because (a) the plugin is already the dev-injection point for HMR / signal names / source locations (R4), (b) it's the canonical dev-server for Pyreon apps, (c) it doesn't tie LPIH itself to Vite — non-Vite consumers retain the manual `@pyreon/reactivity/lpih` API. The plugin is a thin wrapper around the same primitives, not a re-implementation.

**Build-only**: production builds skip injection entirely (`transformIndexHtml` returns undefined in `command: 'build'`).

**Wire format**: browser POSTs `{ fires: [{ file, line, count, kind, lastFire, rate1s }] }` — byte-identical to the on-disk format `@pyreon/reactivity/lpih`'s `writeLpihCache` produces. The server-side `writeLpihCacheFile` re-validates shape (rejects bodies missing the `fires` array) before atomic-renaming to disk; a buggy or malicious client can't corrupt the file the LSP reads.

**Exposed surface** (`@internal`, for tests):
- `resolveLpihCachePath(projectRoot)` — returns `<projectRoot>/.pyreon-lpih.json`
- `writeLpihCacheFile(path, body)` — atomic-rename writer with shape validation
- `buildLpihClientScript(intervalMs)` — generates the `<script type="module">` body

**Bisect-verified-with-restore**: disabling both the `configureServer` LPIH gate AND the `transformIndexHtml` gate fails 7 of the 23 new R1 tests (registration + injection + interval + custom-path); restored → 23/23 (and 142/142 full vite-plugin suite). No `TEMP BISECT` remnants.

Test coverage (23 new specs in `lpih-auto-bridge.test.ts`):
- `resolveLpihCachePath` (2) — projectRoot → cache path resolution
- `writeLpihCacheFile` (5) — successful write, overwrite (atomic rename), malformed JSON rejection, shape-missing-fires rejection, no tmp leftovers
- `buildLpihClientScript` (6) — `<script type="module">` shape, interval embedding, imports, POST shape, beforeunload cleanup, payload shape
- `transformIndexHtml` (5) — injects in dev/`lpih:true`, NOT in `lpih:false`, NOT in build, respects custom interval, default 250ms
- `configureServer` (5) — middleware registered when `lpih:true`, NOT when `lpih:false`, rejects non-POST (405), writes valid POST to cache file, honours custom cache path

Companion test-isolation change: existing `dev-server.test.ts` fixture now passes `lpih: false` by default in `bootstrap()` because those tests cover SSR / watcher / debounce — LPIH adding a middleware would change their `middlewares.use` call count + first-element shape. LPIH-specific coverage lives in the new test file.

Docs updated at `docs/docs/lpih.md` — the Quick Start section is rewritten as "Vite users get it for free", with the manual `startLpihPolling()` recipe demoted to a "Manual setup (non-Vite consumers)" subsection.
