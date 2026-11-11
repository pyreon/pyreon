import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

// `pyreon({ collapse })` is an explicit opt-in, so a build where NO site can
// collapse — because a module every site needs (`@pyreon/runtime-server`,
// core, styler, the provider or theme) does not load from the app, the
// resolver's Vite server never starts (both reported by the resolver's
// `unavailable()`), or the resolver itself fails to load — must say so once. Before, every case
// returned null per site and the build shipped the normal rocketstyle mount
// without a word, indistinguishable from "nothing was eligible".
//
// The resolver is stubbed (no nested Vite) so each case is deterministic;
// the real resolver's `unavailable()` is covered in rocketstyle-collapse.test.ts.
const state: { mode: 'unavailable' | 'load-fails' | 'healthy' } = { mode: 'healthy' }

vi.mock('../rocketstyle-collapse', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rocketstyle-collapse')>()
  return {
    ...actual,
    createCollapseResolver: vi.fn(async () => {
      if (state.mode === 'load-fails') throw new Error('chunk failed to load')
      return {
        resolve: vi.fn(async () => null),
        unavailable: vi.fn(() =>
          state.mode === 'unavailable'
            ? '[Pyreon] collapse is OFF for this build: Failed to load url @pyreon/runtime-server'
            : null,
        ),
        dispose: vi.fn(async () => {}),
      }
    }),
  }
})

const { default: pyreon } = await import('../index')

type Ctx = { warn: (m: string) => void; info: (m: string) => void; resolve: () => Promise<null> }
type Hook = (this: Ctx, c: string, i: string, o?: { ssr?: boolean }) => Promise<unknown>

const SRC = `
import { Button } from '@pyreon/ui-components'
export const Save = () => <Button state="primary" size="medium">Save</Button>`

async function buildTwice(mode: typeof state.mode): Promise<string[]> {
  state.mode = mode
  const plugin = pyreon({ collapse: true })
  ;(plugin.config as unknown as (u: Record<string, unknown>, e: { command: string }) => void)(
    { root: '/tmp/does-not-matter' },
    { command: 'build' },
  )
  const warnings: string[] = []
  const ctx: Ctx = { warn: (m) => warnings.push(m), info: () => {}, resolve: async () => null }
  const hook = plugin.transform as unknown as Hook
  await hook.call(ctx, SRC, join('/tmp', 'A.tsx'), { ssr: false })
  await hook.call(ctx, SRC, join('/tmp', 'B.tsx'), { ssr: false })
  await (plugin.closeBundle as unknown as () => Promise<void>)()
  return warnings.filter((w) => w.includes('collapse is OFF'))
}

describe('pyreon({ collapse }) — a build where nothing CAN collapse says so once', () => {
  it('warns once, naming the missing module, when a capability fails to load', async () => {
    const w = await buildTwice('unavailable')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('[Pyreon]')
    expect(w[0]).toContain('@pyreon/runtime-server')
  })

  it('warns once when the resolver itself fails to load', async () => {
    const w = await buildTwice('load-fails')
    expect(w).toHaveLength(1)
    expect(w[0]).toContain('[Pyreon] collapse is OFF')
  })

  it('stays silent when the resolver is healthy and a site merely bails', async () => {
    expect(await buildTwice('healthy')).toEqual([])
  })
})
