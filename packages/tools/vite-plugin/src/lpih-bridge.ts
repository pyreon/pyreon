/**
 * The LPIH auto-bridge's dev-server half: the cache-file path, the
 * `/__pyreon_lpih__` middleware that receives fire summaries from the browser,
 * the atomic cache write, and the head-injected client script. The plugin
 * wires them in `configureServer` / `transformIndexHtml`; tests reach them
 * through `@pyreon/vite-plugin/internal`.
 */
import { join as pathJoin } from 'node:path'
import type { ViteDevServer } from 'vite'
import type { PyreonLpihOptions } from './index'

// ── LPIH auto-bridge helpers ───────────────────────────────────────────────

/**
 * Resolve the LPIH cache-file path for a given project root. Matches the
 * convention `@pyreon/reactivity/lpih`'s `getDefaultLpihCachePath()` uses
 * AND the LSP auto-discovers (R2, #777): `<projectRoot>/.pyreon-lpih.json`.
 *
 * @internal
 */
export function resolveLpihCachePath(projectRoot: string): string {
  return pathJoin(projectRoot, '.pyreon-lpih.json')
}

/**
 * Register the LPIH dev-server middleware on a Vite server. Extracted from
 * `configureServer` so the `cachePath` option reference lives at module
 * scope (top-level helper) rather than inside the plugin's inline body —
 * keeps `scripts/audit-types.ts` happy regardless of how its comment-
 * stripping handles the long inline `configureServer` block.
 *
 * @internal
 */
export function registerLpihMiddleware(
  server: ViteDevServer,
  projectRoot: string,
  userCfg: PyreonLpihOptions,
): void {
  const cachePath = userCfg.cachePath ?? resolveLpihCachePath(projectRoot)
  server.middlewares.use('/__pyreon_lpih__', (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }
    // A plain POST is a CORS-simple request, so ANY site open in the
    // developer's browser could write this file (hint poisoning / DoS of the
    // LSP feature; `--host` widens it to the LAN). A browser always sends
    // `Origin` on a cross-site POST — require it to be the dev server's own.
    const origin = req.headers?.origin
    if (typeof origin === 'string') {
      let sameOrigin = false
      try {
        sameOrigin = new URL(origin).host === req.headers?.host
      } catch {
        sameOrigin = false
      }
      if (!sameOrigin) {
        res.statusCode = 403
        res.end('Forbidden')
        return
      }
    }
    let body = ''
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString()
      // Defensive cap — fire payloads are tiny (a few KB at most);
      // anything larger is malicious or buggy. Drop the request.
      if (body.length > 1024 * 1024) {
        res.statusCode = 413
        res.end('Payload Too Large')
        req.destroy()
      }
    })
    req.on('end', () => {
      void writeLpihCacheFile(cachePath, body)
        .then(() => {
          res.statusCode = 204
          res.end()
        })
        .catch((err: unknown) => {
          // Don't crash the dev server — log + return 500 so the
          // browser-side bridge can back off + retry next interval.
          // oxlint-disable-next-line no-console
          console.warn(
            '[pyreon] LPIH cache write failed:',
            err instanceof Error ? err.message : err,
          )
          res.statusCode = 500
          res.end('LPIH cache write failed')
        })
    })
  })
}

let _lpihSeq = 0

/**
 * Atomically write a LPIH cache file (tmp + rename), mirroring the
 * `@pyreon/reactivity/lpih:writeLpihCache` implementation. The payload
 * comes pre-serialized from the browser-side bridge — we validate the
 * outer shape (`{ fires: [...] }`) and reject malformed bodies to stop a
 * buggy client from corrupting the file the LSP reads.
 *
 * @internal
 */
export async function writeLpihCacheFile(path: string, body: string): Promise<void> {
  // Validate shape — must be a JSON object with `fires: array`. We re-
  // serialize so the on-disk format is stable regardless of how the
  // browser-side bridge encodes it.
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new Error('[Pyreon] LPIH bridge: payload is not valid JSON')
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { fires?: unknown }).fires)
  ) {
    throw new Error('[Pyreon] LPIH bridge: payload is missing `fires` array')
  }
  // Every entry must be a plain object — the wrapper shape alone let a
  // payload of arbitrary junk through to disk.
  for (const f of (parsed as { fires: unknown[] }).fires) {
    if (f === null || typeof f !== 'object' || Array.isArray(f)) {
      throw new Error('[Pyreon] LPIH bridge: `fires` entries must be objects')
    }
  }
  const fs = await import('node:fs/promises')
  const pid = typeof process !== 'undefined' && 'pid' in process ? process.pid : 0
  const tmp = `${path}.tmp.${pid}.${++_lpihSeq}`
  // Single try/catch covering BOTH writeFile AND rename. The previous
  // shape only guarded the rename — if `fs.writeFile` itself threw (disk
  // full, EIO, EACCES, transient FS error), the partial tmp file leaked
  // on disk with a unique PID+seq name (so no conflict, but it accumulated
  // forever). Audit caught this in the LPIH followups round.
  try {
    await fs.writeFile(tmp, JSON.stringify(parsed), 'utf8')
    await fs.rename(tmp, path)
  } catch (err) {
    // Best-effort cleanup; original error is more useful than unlink's.
    // Covers BOTH the writeFile-failed (tmp may not exist) and the
    // rename-failed (tmp exists, rename didn't move it) cases —
    // `fs.unlink` of a non-existent file throws ENOENT, which we swallow.
    try {
      await fs.unlink(tmp)
    } catch {
      /* swallow — original error is the user-facing one */
    }
    throw err
  }
}

/**
 * Build the `<script type="module">` body injected into the HTML head.
 * The script imports devtools activation + `getFireSummaries` from
 * `@pyreon/reactivity`, sets up a `setInterval` that POSTs every
 * `intervalMs` ms, and registers a `beforeunload` cleanup so the timer
 * doesn't outlive the page.
 *
 * Browser bundlers serve `@pyreon/reactivity` from the workspace via
 * Vite's normal module resolution — no virtual module needed.
 *
 * @internal
 */
export function buildLpihClientScript(intervalMs: number): string {
  // Note: the script body is intentionally compact — the goal is zero
  // visible payload in DevTools "Sources" while still being readable
  // when someone DOES go looking. `JSON.stringify` for `intervalMs` is
  // defense against `__proto__` / NaN / non-finite values reaching the
  // emitted JS as a literal.
  // CRITICAL — top-level await on the dynamic import. `<script type="module">`
  // tags execute in document order with `defer` semantics; the head-injected
  // LPIH script's body MUST fully evaluate (including this await) BEFORE the
  // body-injected app entry's module body runs. Otherwise activateReactiveDevtools()
  // would land AFTER the app has already created its module-scope signals,
  // and `_rdRegister` (gated on `if (!_active) return undefined`) would skip
  // them entirely — making the most common signal shape (top-of-file `const x = signal(0)`)
  // invisible to LPIH. With the `await`, the LPIH module doesn't complete
  // until activation finishes; the app's entry waits its turn.
  return `<script type="module">
  // Pyreon LPIH auto-bridge — POSTs fire summaries to /__pyreon_lpih__
  // so the LSP (pyreon-lint --lsp) sees live fire data. Dev-only.
  const __px = await import('@pyreon/reactivity').catch(() => null)
  if (__px) {
    __px.activateReactiveDevtools()
    const __pxGet = __px.getFireSummaries
    const __pxInterval = ${JSON.stringify(intervalMs)}
    const __pxPost = () => {
      const summaries = __pxGet()
      const payload = JSON.stringify({
        fires: summaries.map((s) => ({
          file: s.loc.file,
          line: s.loc.line,
          count: s.count,
          kind: s.kind,
          lastFire: s.lastFire,
          rate1s: s.rate1s,
        })),
      })
      fetch('/__pyreon_lpih__', { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } }).catch(() => {
        // Dev-server might be restarting; swallow + retry next interval.
      })
    }
    const __pxId = setInterval(__pxPost, __pxInterval)
    window.addEventListener('beforeunload', () => clearInterval(__pxId))
  }
  // If __px is null, @pyreon/reactivity isn't in the dep graph — stay silent,
  // LPIH is opt-in via the runtime API too. The dynamic-import catch returns
  // null instead of letting the rejection bubble so consumers without the
  // package don't see a console error.
</script>`
}
