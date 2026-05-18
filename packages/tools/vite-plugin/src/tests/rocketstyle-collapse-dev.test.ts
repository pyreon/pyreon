import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// Collapse is BUILD-ONLY by design. The resolver freezes each site's class
// from a SEPARATE nested Vite-SSR module graph and caches it; in `vite dev`
// that frozen class would NOT react to the user's theme-source HMR edits —
// strictly worse than the normal mount, which IS reactive. So `command:
// 'serve'` keeps the normal rocketstyle mount, the resolver never boots,
// and the plugin surfaces the build-only contract ONCE via `this.info`.
//
// The resolver is mocked here with a deterministic stub (no Vite, no
// workspace `lib/`) PURELY so the bisect is faithful LOCALLY: with the
// `&& isBuild` gate removed, serve-mode transform would enter the collapse
// block, call the (stub) resolver, and emit `__rsCollapse(` — failing the
// `.not.toContain('__rsCollapse(')` assertion. The real-Vite-SSR resolver
// is exercised (unmocked) by the build-mode specs in the sibling
// `rocketstyle-collapse.test.ts`.
vi.mock('../rocketstyle-collapse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rocketstyle-collapse')>()
  return {
    ...actual,
    createCollapseResolver: vi.fn(async () => ({
      resolve: vi.fn(async () => ({
        templateHtml: '<button>Save</button>',
        lightClass: 'pyr-stub-light',
        darkClass: 'pyr-stub-dark',
        rules: ['.pyr-stub-light{color:red}', '.pyr-stub-dark{color:blue}'],
        key: 'stub-key',
      })),
      dispose: vi.fn(async () => {}),
    })),
  }
})

// Imported AFTER vi.mock (hoisted) so the plugin's lazy
// `import('./rocketstyle-collapse')` resolves to the stub.
const { default: pyreon } = await import('../index')
const { createCollapseResolver } = await import('../rocketstyle-collapse')

type Ctx = {
  warn: (msg: string) => void
  info: (msg: string) => void
  resolve: (id: string, importer?: string, opts?: { skipSelf: boolean }) => Promise<null>
  infos: string[]
}
type Plugin = ReturnType<typeof pyreon>

function makeCtx(): Ctx {
  const infos: string[] = []
  return { warn: () => {}, info: (m) => infos.push(m), resolve: async () => null, infos }
}
function configure(plugin: Plugin, command: 'serve' | 'build'): void {
  ;(plugin.config as unknown as (u: Record<string, unknown>, e: { command: string }) => void)(
    { root: '/tmp/does-not-matter' },
    { command },
  )
}
async function transform(
  plugin: Plugin,
  c: Ctx,
  code: string,
  id: string,
): Promise<{ code: string } | undefined> {
  const hook = plugin.transform as unknown as (
    this: Ctx,
    c: string,
    i: string,
    o?: { ssr?: boolean },
  ) => Promise<{ code: string } | undefined>
  return hook.call(c, code, id, { ssr: false })
}

const ID = join('/tmp', 'CollapseProbeDev.tsx')
const SRC = `
import { Button } from '@pyreon/ui-components'
export const Save = () => <Button state="primary" size="medium">Save</Button>`

describe('pyreon({ collapse }) — dev (serve) keeps the normal mount; build collapses', () => {
  it('command:serve → NO __rsCollapse, normal mount, resolver never even constructed, one-time dev info', async () => {
    const plugin = pyreon({ collapse: true })
    configure(plugin, 'serve')
    const c = makeCtx()

    const out1 = await transform(plugin, c, SRC, ID)
    // THE contract: dev keeps the normal rocketstyle mount. Bisect-load-
    // bearing — drop the `&& isBuild` gate and the (stub) resolver boots +
    // emits `__rsCollapse(` here, failing this line.
    expect(out1?.code).not.toContain('__rsCollapse(')
    expect(out1?.code).not.toContain('__rsSheet.injectRules(')
    // Resolver (a nested Vite SSR server in production) is NEVER even
    // constructed in serve mode — zero per-dev-process orphan server.
    expect(createCollapseResolver).not.toHaveBeenCalled()
    // One-time, actionable dev info so an opted-in `vite dev` consumer
    // isn't left wondering why nothing collapsed.
    expect(c.infos.filter((m) => m.includes('collapse is build-only'))).toHaveLength(1)

    // A SECOND transform must NOT re-emit the info (once per plugin instance).
    await transform(plugin, c, SRC, ID)
    expect(c.infos.filter((m) => m.includes('collapse is build-only'))).toHaveLength(1)

    // closeBundle is a guaranteed no-op in serve mode.
    await (plugin.closeBundle as unknown as () => Promise<void>)()
  })

  it('command:build (same source, stub resolver) → DOES collapse — proves the gate is the only difference', async () => {
    const plugin = pyreon({ collapse: true })
    configure(plugin, 'build')
    const c = makeCtx()

    const out = await transform(plugin, c, SRC, ID)
    // Same component, same props — only `command` differs. Build collapses.
    expect(out?.code).toContain('__rsCollapse(')
    expect(out?.code).toContain('__rsSheet.injectRules(')
    // No build-only dev info in build mode.
    expect(c.infos.filter((m) => m.includes('collapse is build-only'))).toHaveLength(0)

    await (plugin.closeBundle as unknown as () => Promise<void>)()
  })
})
