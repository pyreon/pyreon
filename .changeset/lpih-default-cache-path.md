---
'@pyreon/reactivity': minor
'@pyreon/lint': minor
---

LPIH: zero-config cache path convention. `startLpihPolling()` and `writeLpihCache()` now default to `<cwd>/.pyreon-lpih.json` when called with no path; the LSP server auto-discovers the same file by walking up from the source file to the nearest `package.json`. No env var required for the common case.

```ts
// Before (foundation PR):
import { startLpihPolling } from '@pyreon/reactivity/lpih'
startLpihPolling('/tmp/pyreon-lpih.json', 250)
// + set PYREON_LPIH_CACHE=/tmp/pyreon-lpih.json on the LSP

// Now (zero config):
import { startLpihPolling } from '@pyreon/reactivity/lpih'
startLpihPolling() // writes to <cwd>/.pyreon-lpih.json
// LSP auto-discovers; no env var needed
```

**`@pyreon/reactivity/lpih`**:

- `writeLpihCache(path?)` — `path` is now optional, defaults to `getDefaultLpihCachePath()` (which returns `<cwd>/.pyreon-lpih.json`)
- `startLpihPolling(path?, intervalMs?)` — same default; throws synchronously if no default can be resolved AND no path given (better than silently never writing)
- New export `getDefaultLpihCachePath(): string | null` — returns the resolved path or null in environments without `process.cwd()` (web workers, etc.)
- New export `LPIH_DEFAULT_FILENAME = '.pyreon-lpih.json'` — canonical filename constant

**`@pyreon/lint`** LSP:

- `_resolveLpihCachePath(filePath)` — new helper that resolves the cache path for a given source file. Priority: `PYREON_LPIH_CACHE` env (explicit override) → `<project-root>/.pyreon-lpih.json` discovered by walking up to nearest `package.json` (zero-config default) → `undefined` (LPIH inactive)
- `_findProjectRoot(filePath, maxDepth?)` — memoized walk-up helper. Caches results per-file for the LSP-process lifetime; cleared on `_resetOpenDocuments()`. Synchronous (one `existsSync` per level, typically <10 levels = negligible cost).
- `_LPIH_DEFAULT_FILENAME` — exported constant locked to `.pyreon-lpih.json` (matches `@pyreon/reactivity/lpih`'s `LPIH_DEFAULT_FILENAME` — a drift gate test in `lsp-lpih.test.ts` validates the agreement).

**Discovery priority** (matches across writer + reader):

1. `PYREON_LPIH_CACHE` env var on the LSP (explicit override) — unchanged
2. `<project-root>/.pyreon-lpih.json` (auto-discovered) — new default
3. No cache → LPIH inactive (degrades to static Reactivity-Lens hints only) — unchanged

**Multi-session safety**: each project gets its own cache file under its own `package.json` boundary. Two dev sessions in different projects can't collide silently (was a footgun with the previous shared `/tmp/pyreon-lpih.json` convention from the foundation docs).

**Tests**: +18 new tests across both packages (8 for the runtime default + 10 for LSP discovery), all green. Bisect-verified: removing the `_resolveLpihCachePath` wiring breaks the "auto-discover" LSP integration test.

**Docs**: `docs/docs/lpih.md` quickstart updated to the zero-config flow; `.gitignore` mention added; custom-path / env-override examples preserved at the bottom of the page.
