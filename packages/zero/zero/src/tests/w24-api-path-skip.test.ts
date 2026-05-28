/**
 * W24 from chat audit — Zero's dev 404 handler skips `/api/*` paths so
 * user plugins registering their own dev API middleware (via
 * `configureServer`) aren't shadowed regardless of plugin order.
 *
 * The original 404 handler caught `Accept: wildcard` requests (curl, fetch
 * default) for any unmatched path, including `/api/*`. When a chat /
 * user-defined plugin registered `/api/history/<id>` etc. AFTER zero in
 * the plugin array, the Zero 404 returned 404 before the user middleware
 * saw the request.
 *
 * Vite middleware ordering is by registration time, and configureServer
 * hooks fire in plugin-array order — `enforce: 'pre'` doesn't reorder
 * configureServer. So the canonical fix is on Zero's side: skip
 * `/api/*` paths in the 404 handler so user middleware (registered
 * after Zero) always has a chance to handle them.
 *
 * Bisect-verify: revert the `pathname.startsWith('/api/')` skip in
 * `vite-plugin.ts:364` → this test fails with handler invoked.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('W24 — Zero dev 404 handler skips /api/* paths', () => {
  it('vite-plugin source contains the path-skip guard', () => {
    // Source-level lock — verifies the W24 fix line is present. Bisect
    // by removing the line → assertion fails. The runtime semantics are
    // exercised end-to-end by the chat example's smoke (without this
    // guard, /api/history/general returns 404 even with a registered
    // user middleware).
    const sourcePath = join(__dirname, '..', 'vite-plugin.ts')
    const source = readFileSync(sourcePath, 'utf8')

    // The path-skip line must be inside the 404 handler block,
    // alongside the existing static-asset + internal-path skips.
    expect(source).toContain(
      "if (pathname.startsWith(\"/api/\")) return next()",
    )

    // Companion: the W24 comment must remain so the rationale survives
    // future refactors.
    expect(source).toContain('W24 from chat audit')
  })

  it('the path-skip lives in the 404 handler block (not elsewhere)', () => {
    const sourcePath = join(__dirname, '..', 'vite-plugin.ts')
    const source = readFileSync(sourcePath, 'utf8')

    // Locate the 404 handler block — it has a distinctive comment.
    const handlerStart = source.indexOf(
      '// 404 handler — check if the requested path matches any route.',
    )
    expect(handlerStart).toBeGreaterThan(-1)

    // The path-skip must appear AFTER the handler-start comment AND
    // BEFORE the handle404() call.
    const handle404Call = source.indexOf('handle404(', handlerStart)
    const apiSkip = source.indexOf(
      "if (pathname.startsWith(\"/api/\")) return next()",
      handlerStart,
    )
    expect(apiSkip).toBeGreaterThan(handlerStart)
    expect(apiSkip).toBeLessThan(handle404Call)
  })
})
