/**
 * The plugin registry's cost attribution, and the SSR-parity oracle's
 * normalization.
 *
 * **Profiling.** `ATLAS_PROFILE=1` is the only place a scan's cost can be
 * attributed to the plugin that actually incurred it — the module's own
 * docblock records that guessing from the outside cost two wrong hypotheses,
 * 35 ms and 0 ms against a 75-second total. A profiler that records nothing,
 * or records under the wrong name, is worse than none: it turns a measurement
 * into a confident wrong answer, and the next person optimizes the thing it
 * pointed at.
 *
 * The flag is read into a module-level const so the hot path is one
 * already-false boolean per hook. That is the right trade and it is also why
 * the ON state needs a re-import to test at all — which is exactly the kind of
 * path that goes unexercised.
 *
 * **Normalization.** The parity check compares SSR output against a client
 * mount, and its whole value is in what it does NOT normalize away. Collapsing
 * whitespace inside text would hide "a  b" versus "a b", which is precisely
 * the corruption a real mismatch produces; the documented exemptions are
 * narrow on purpose, because every character this regex removes is a
 * divergence the oracle can no longer see.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPluginRegistry, emptyVerdict, pluginProfile, skipped } from '../registry'
import { normalizeHtml } from '../ssr-parity'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

/** A plugin whose hooks all record that they ran. */
const spyPlugin = (name: string, log: string[] = []) =>
  ({
    name,
    async discover() {
      log.push(`${name}.discover`)
      return []
    },
    async decorate(ci: unknown) {
      log.push(`${name}.decorate`)
      return ci
    },
    async verify() {
      log.push(`${name}.verify`)
      return {}
    },
    async graph() {
      log.push(`${name}.graph`)
    },
  }) as never

describe('the registry runs every plugin hook', () => {
  it('runs discover, decorate, verify and graph across all plugins', async () => {
    // The control for the profiling assertions below: a registry that runs
    // nothing profiles nothing, and both would look identical.
    const log: string[] = []
    const reg = createPluginRegistry([spyPlugin('a', log), spyPlugin('b', log)])
    await reg.runDiscover({} as never)
    await reg.runDecorate({ name: 'X' } as never, {} as never)
    await reg.runVerify({} as never)
    await reg.runGraph({} as never)
    expect(log).toEqual([
      'a.discover',
      'b.discover',
      'a.decorate',
      'b.decorate',
      'a.verify',
      'b.verify',
      'a.graph',
      'b.graph',
    ])
  })

  it('tolerates a plugin that implements only SOME hooks', async () => {
    // Most plugins implement one. Requiring all four would make the interface
    // hostile and every plugin mostly empty stubs.
    const reg = createPluginRegistry([{ name: 'partial' } as never])
    await expect(reg.runDiscover({} as never)).resolves.toEqual([])
    await expect(reg.runVerify({} as never)).resolves.toBeDefined()
    await expect(reg.runGraph({} as never)).resolves.toBeUndefined()
  })

  it('threads a decorated component through every plugin in order', async () => {
    // Decoration is a pipeline: each plugin sees the previous one's output.
    // Passing the ORIGINAL to each would silently drop all but the last.
    const reg = createPluginRegistry([
      { name: 'a', decorate: (ci: { tags: string[] }) => ({ ...ci, tags: [...ci.tags, 'a'] }) } as never,
      { name: 'b', decorate: (ci: { tags: string[] }) => ({ ...ci, tags: [...ci.tags, 'b'] }) } as never,
    ])
    const out = (await reg.runDecorate({ tags: [] } as never, {} as never)) as unknown as {
      tags: string[]
    }
    expect(out.tags).toEqual(['a', 'b'])
  })

  it('merges every plugin verdict rather than keeping the last', async () => {
    // Each plugin claims different checks. Overwriting would silently drop
    // every check but one, and the report would still say "verified".
    const reg = createPluginRegistry([
      { name: 'a', verify: () => ({ a11y: { status: 'pass' } }) } as never,
      { name: 'b', verify: () => ({ interaction: { status: 'pass' } }) } as never,
    ])
    const verdict = (await reg.runVerify({} as never)) as unknown as Record<
      string,
      { status?: string } | undefined
    >
    // The verdict starts from `emptyVerdict()`, so every check KEY is present
    // — what must not happen is one plugin's answer replacing another's.
    expect(verdict.a11y?.status, "the first plugin's check survives").toBe('pass')
    expect(verdict.interaction?.status, "and so does the second's").toBe('pass')
  })

  it('exposes the plugin list it was built from', () => {
    const plugins = [spyPlugin('a'), spyPlugin('b')]
    expect(createPluginRegistry(plugins).plugins).toBe(plugins)
  })
})

describe('per-hook cost attribution', () => {
  /** Re-import the registry under a chosen profiling environment. */
  const withProfile = async (on: boolean) => {
    vi.resetModules()
    vi.stubEnv('ATLAS_PROFILE', on ? '1' : '0')
    return import('../registry')
  }

  it('records NOTHING when profiling is off', async () => {
    // The default. A profiler that always runs costs a `performance.now()`
    // per hook on every scan for a measurement nobody asked for.
    const mod = await withProfile(false)
    const reg = mod.createPluginRegistry([spyPlugin('quiet')])
    await reg.runDiscover({} as never)
    await reg.runVerify({} as never)
    expect(mod.pluginProfile()).toEqual([])
  })

  it('attributes each hook to the plugin that ran it', async () => {
    // The whole point: a total is not attribution. Without the per-plugin
    // key the answer to "what is slow" is a number with nowhere to go.
    const mod = await withProfile(true)
    const reg = mod.createPluginRegistry([spyPlugin('alpha'), spyPlugin('beta')])
    await reg.runDiscover({} as never)
    await reg.runDecorate({ name: 'X' } as never, {} as never)
    await reg.runVerify({} as never)
    await reg.runGraph({} as never)
    const names = mod.pluginProfile().map((p) => p.name)
    expect(names).toContain('alpha.discover')
    expect(names).toContain('beta.verify')
    expect(names).toContain('alpha.decorate')
    expect(names).toContain('beta.graph')
  })

  it('ACCUMULATES calls rather than replacing the previous timing', async () => {
    // A per-hook entry that overwrites reports the cost of the LAST call, so
    // a plugin called once per component reads as fast no matter how slow the
    // scan is.
    const mod = await withProfile(true)
    const reg = mod.createPluginRegistry([spyPlugin('alpha')])
    await reg.runVerify({} as never)
    await reg.runVerify({} as never)
    await reg.runVerify({} as never)
    const entry = mod.pluginProfile().find((p) => p.name === 'alpha.verify')
    expect(entry?.calls, 'three calls counted').toBe(3)
    expect(entry?.ms).toBeGreaterThanOrEqual(0)
  })

  it('orders the report SLOWEST first', async () => {
    // The list is read top-down and acted on at the top. Any other order
    // makes the reader scan for the number instead of the name.
    const mod = await withProfile(true)
    const slow = {
      name: 'slow',
      verify: async () => {
        await new Promise((r) => setTimeout(r, 12))
        return {}
      },
    } as never
    const fast = { name: 'fast', verify: () => ({}) } as never
    const reg = mod.createPluginRegistry([slow, fast])
    await reg.runVerify({} as never)
    const report = mod.pluginProfile()
    const ms = report.map((p) => p.ms)
    expect(ms, 'descending').toEqual([...ms].sort((a, b) => b - a))
    expect(report[0]?.name).toContain('slow')
  })
})

describe('the skip and empty-verdict helpers', () => {
  it('builds a skip carrying its reason', () => {
    // A check that did not run must say why. "not run" with no reason is the
    // shape that makes a partially-verified run indistinguishable from a
    // fully-verified one.
    const s = skipped('no-dom', 'no DOM environment available')
    expect(s.status).toBe('skip')
    expect(JSON.stringify(s)).toContain('no DOM environment')
  })

  it('carries an optional FIX alongside the reason', () => {
    // The catalog-v2 contract: the fix travels with the finding, so the agent
    // reading it has the one thing to change.
    const s = skipped('no-dom', 'no DOM', 'run `atlas verify-browser`')
    expect(JSON.stringify(s)).toContain('verify-browser')
  })

  it('builds an empty verdict that claims nothing', () => {
    // The starting point every plugin merges into. Anything pre-populated
    // here would be a verdict nobody produced.
    const v = emptyVerdict()
    for (const value of Object.values(v)) {
      expect(value === undefined || (value as { status?: string }).status !== 'pass').toBe(true)
    }
  })

  it('reports an empty profile before anything runs', () => {
    expect(Array.isArray(pluginProfile())).toBe(true)
  })
})

describe('the SSR-parity oracle normalizes only what it must', () => {
  it('strips comments — the hydration markers are not content', () => {
    // SSR emits `<!--$-->` range markers a client mount has no reason to
    // produce. Comparing them would fail every single component.
    expect(normalizeHtml('<p><!--$-->hi<!--/$--></p>')).toBe('<p>hi</p>')
  })

  it('collapses whitespace BETWEEN tags', () => {
    // Formatting differs between the two renderers and means nothing.
    expect(normalizeHtml('<ul>\n  <li>a</li>\n  <li>b</li>\n</ul>')).toBe(
      '<ul><li>a</li><li>b</li></ul>',
    )
  })

  it('does NOT collapse whitespace inside TEXT', () => {
    // The load-bearing refusal. "a  b" against "a b" is exactly the text
    // corruption a real mismatch produces, and normalizing it away would make
    // the oracle blind to the class it exists to catch.
    expect(normalizeHtml('<p>a  b</p>'), 'inner spacing survives').toBe('<p>a  b</p>')
  })

  it('leaves ordinary markup alone', () => {
    // The control: a normalizer that rewrites everything reports parity for
    // trees that genuinely differ.
    const html = '<div class="x"><span>one</span><b>two</b></div>'
    expect(normalizeHtml(html)).toBe(html)
  })

  it('normalizes an empty string to an empty string', () => {
    expect(normalizeHtml('')).toBe('')
  })

  it('is IDEMPOTENT — normalizing twice changes nothing', () => {
    // The comparison runs it on both sides; a normalizer whose second pass
    // differs would report a mismatch between a tree and itself.
    const once = normalizeHtml('<ul>\n <li><!--c-->a</li>\n</ul>')
    expect(normalizeHtml(once)).toBe(once)
  })

  it('exempts `value`, and ONLY value', () => {
    // The documented exemption: the server can only express input state as an
    // attribute while the client sets a property, so `value` diverges by
    // construction. Every other attribute must still be compared — the
    // narrower the hole, the fewer real divergences it hides.
    const withValue = normalizeHtml('<input value="a" />')
    const withoutValue = normalizeHtml('<input />')
    expect(withValue).toBe(withoutValue)

    const checked = normalizeHtml('<input checked />')
    expect(checked, 'checked is NOT exempt').not.toBe(normalizeHtml('<input />'))
  })
})
