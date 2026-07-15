/**
 * Compile-to-string SSR fast path (`ssrTemplate`) — vite-plugin RESOLVABILITY GATE.
 *
 * The default is AUTO: the plugin emits `_ssr(...)` for the SSR graph ONLY when
 * `@pyreon/runtime-server` is resolvable from the app (that package owns the
 * injected `_ssr`/`_esc` helpers, and `_ssr` returns an `instanceof`-branded
 * `RawHtml` the app's OWN `renderToString` must recognize). When it is NOT
 * resolvable, the plugin falls back to the h() SSR path — a default-on transform
 * must NEVER crash an app (see anti-patterns "A compiler transform that injects
 * a bare framework-package import into USER source"). Explicit `true`/`false`
 * override the probe.
 *
 * These lock the gate logic deterministically (the end-to-end proof is the
 * islands-showcase e2e — which degrades gracefully — vs ssr-showcase / ssr-node
 * — which take the fast path).
 */
import { describe, expect, it } from 'vitest'
import pyreonPlugin, { type PyreonPluginOptions } from '../index'

type ConfigHook = (c: { root: string }, e: { command: string }) => void
type TransformCtx = {
  warn: (msg: string) => void
  resolve: (id: string, importer?: string, o?: { skipSelf: boolean }) => Promise<{ id: string } | null>
}
type TransformHook = (
  this: TransformCtx,
  code: string,
  id: string,
  opts?: { ssr?: boolean },
) => Promise<{ code: string; map: null } | undefined>

const SSR_ELIGIBLE = `import { h } from "@pyreon/core"
export const Node = <div class="x">{data.name}</div>`

async function transform(
  opts: PyreonPluginOptions | undefined,
  { ssr, resolvable, command = 'serve' }: { ssr: boolean; resolvable: boolean; command?: string },
) {
  const plugin = pyreonPlugin(opts)
  ;(plugin.config as unknown as ConfigHook)({ root: '/app' }, { command })
  const warnings: string[] = []
  const hook = plugin.transform as TransformHook
  const out = await hook.call(
    {
      warn: (m) => warnings.push(m),
      resolve: async (id) =>
        id === '@pyreon/runtime-server' && resolvable
          ? { id: '/app/node_modules/@pyreon/runtime-server/src/index.ts' }
          : null,
    },
    SSR_ELIGIBLE,
    '/app/src/App.tsx',
    { ssr },
  )
  return { code: out?.code ?? '', warnings }
}

describe('ssrTemplate resolvability gate (vite-plugin)', () => {
  it('AUTO: runtime-server resolvable → fast path (_ssr emitted)', async () => {
    const { code, warnings } = await transform(undefined, { ssr: true, resolvable: true })
    expect(code).toContain('_ssr(')
    expect(code).toContain('@pyreon/runtime-server')
    expect(warnings.some((w) => /fast path is OFF/.test(w))).toBe(false)
  })

  it('AUTO: runtime-server NOT resolvable → h() fallback (no _ssr) + one warn', async () => {
    const { code, warnings } = await transform(undefined, { ssr: true, resolvable: false })
    expect(code).not.toContain('_ssr(')
    expect(warnings.some((w) => /fast path is OFF/.test(w) && /runtime-server/.test(w))).toBe(true)
  })

  it('explicit ssrTemplate:false → h() path even when resolvable', async () => {
    const { code, warnings } = await transform(
      { ssrTemplate: false },
      { ssr: true, resolvable: true },
    )
    expect(code).not.toContain('_ssr(')
    expect(warnings.some((w) => /fast path is OFF/.test(w))).toBe(false)
  })

  it('explicit ssrTemplate:true → fast path even when NOT resolvable (user override)', async () => {
    const { code } = await transform({ ssrTemplate: true }, { ssr: true, resolvable: false })
    expect(code).toContain('_ssr(')
  })

  it('client build (ssr:false) never emits _ssr regardless of resolvability', async () => {
    const { code } = await transform(undefined, { ssr: false, resolvable: true })
    expect(code).not.toContain('_ssr(')
  })

  it('build command suppresses the dev warn (still falls back to h())', async () => {
    const { code, warnings } = await transform(undefined, {
      ssr: true,
      resolvable: false,
      command: 'build',
    })
    expect(code).not.toContain('_ssr(')
    expect(warnings.some((w) => /fast path is OFF/.test(w))).toBe(false)
  })
})
