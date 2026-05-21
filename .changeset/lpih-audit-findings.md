---
'@pyreon/vite-plugin': patch
'@pyreon/reactivity': patch
---

LPIH followups round audit — three real bugs found + fixed in lockstep:

**1. Activation race in R1 auto-bridge (high impact)** — the injected `<script type="module">` used `import('@pyreon/reactivity').then(activate)`. Since `<script type="module">` tags execute in document order with `defer` semantics, dynamic-import-then resolves AFTER the module body completes — and the script body completed IMMEDIATELY since the `.then()` only registered a callback. Result: the app's entry script ran NEXT (document order), created its module-scope signals via `signal(0)` / `computed(...)`, those calls hit `_rdRegister` with `_active = false` (line 311 of `reactive-devtools.ts`), returned undefined → signals INVISIBLE to LPIH. The most common signal shape (top-of-file `const count = signal(0)`) was never tracked.

Fix: top-level `await` on the dynamic import + `.catch(() => null)` for silent fallback when `@pyreon/reactivity` isn't in the dep graph. Top-level await delays module completion, so the LPIH script body doesn't finish until activation does — the next `<script type="module">` (the app entry) waits, signals get registered correctly.

**2. Tmp file leak on `fs.writeFile` failure (low-medium impact)** — both `writeLpihCacheFile` (vite-plugin) AND `_writeToPath` (foundation `@pyreon/reactivity/lpih.ts`) had:
```ts
await fs.writeFile(tmp, ...)   // outside try — partial tmp leaks if this throws
try { await fs.rename(tmp, path) } catch { try { unlink(tmp) } catch {} }
```
If `fs.writeFile` itself threw (disk full, EIO, EACCES, transient FS), the partial tmp file leaked on disk with a unique PID+seq name — accumulating forever. Fix: single try/catch covering both writeFile + rename; cleanup runs on either path's failure (ENOENT on the writeFile-failed path is swallowed, original error surfaces).

Bisect-verifying THIS specific bug portably is hard (requires reliable disk-full or EIO reproduction), so the fix is structural — locked in by reading the diff. The companion `'cleans up tmp file when rename fails (rename onto a directory)'` test locks the pre-existing rename-failure path.

**3. String-region false-positives in `injectSignalNames` (medium impact)** — the regexes `(?:const|let)\s+(\w+)\s*=\s*(signal|computed|effect)\(` (R4+R8 bound) and `(?<![\w$.])effect\(` (R8 unbound) matched anywhere in source text, including INSIDE string literals / template literals / comments. User code like:
```ts
const docs = `effect(() => x)`
throw new Error("effect() must be called inside a component")
// TODO: replace effect(() => log()) with watch()
```
got `, { __sourceLocation: ... }` injected INTO the string/comment, corrupting runtime values and producing syntactically-broken docstrings.

Fix: new `_maskStringsAndComments(code)` pre-pass produces a same-length copy of `code` with strings/comments blanked to spaces (newlines preserved so line numbers don't shift). Regexes run against the masked version; args extraction reads from the original. Template-literal `${...}` interpolations are PRESERVED as code (their bodies can contain real `signal()` calls worth catching). Bisect-verified: disabling the masking pre-pass fails 5 of the new false-positive guard tests.

Test counts:
- vite-plugin: 154 → 173 (+19): 11 `_maskStringsAndComments` unit tests, 6 false-positive guards, 1 top-level-await structural test, 1 rename-failure tmp cleanup test
- reactivity: 377/377 unchanged (foundation tmp-leak fix doesn't add tests; bisect-verified structurally by reading the diff)
