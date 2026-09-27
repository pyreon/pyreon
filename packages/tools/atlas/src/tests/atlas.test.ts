import { inferControls } from '../core'
import { focusComponents } from '../verify/focus'
import { createAtlas, defineAtlas } from '../index'
import { a11yPlugin, defineAtlasPlugin, variantMatrixPlugin } from '../plugins'

describe('createAtlas', () => {
  it('runs the full pipeline: discover -> decorate -> verify -> graph', async () => {
    const graphHookSizes: number[] = []
    const atlas = createAtlas({
      cwd: '/tmp',
      preset: 'none',
      plugins: [
        defineAtlasPlugin({
          name: 'demo-discovery',
          discover: () => [
            {
              name: 'Button',
              controls: inferControls([
                { name: 'aria-label', type: 'string' },
                { name: 'state', type: { union: ['primary', 'secondary'] } },
              ]),
              axes: [{ name: 'state', values: ['primary', 'secondary'] }],
              reactivity: [],
              scenarios: [],
              tags: ['form'],
            },
          ],
        }),
        variantMatrixPlugin({ baseArgs: { 'aria-label': 'Go' } }),
        a11yPlugin(),
        defineAtlasPlugin({
          name: 'counter',
          graph: ({ graph }) => void graphHookSizes.push(graph.size()),
        }),
      ],
    })

    const graph = await atlas.build()

    expect(graph.size()).toBe(1)
    const button = graph.get('Button')!
    expect(button.scenarios).toHaveLength(2) // one per variant-matrix cell
    // every scenario got a verdict, and a11y passed (aria-label supplied via baseArgs)
    expect(button.scenarios.every((s) => s.verify?.a11y.status === 'pass')).toBe(true)
    expect(button.scenarios.every((s) => s.verify?.ok === true)).toBe(true)
    // the graph hook ran once against the fully-assembled graph
    expect(graphHookSizes).toEqual([1])
    expect(graph.toLlmsText()).toContain('## Button')
  })

  it('defaults cwd and plugins when omitted', async () => {
    const graph = await createAtlas().build()
    expect(graph.size()).toBe(0)
  })

  it('defineAtlas returns the config unchanged and drives createAtlas (preset none)', async () => {
    const config = defineAtlas({ preset: 'none', plugins: [] })
    expect(config.preset).toBe('none')
    const graph = await createAtlas(config).build()
    expect(graph.size()).toBe(0)
  })

  it('derives a verified catalog via the recommended plugin bundle', async () => {
    const discovery = defineAtlasPlugin({
      name: 'demo-discovery',
      discover: () => [
        {
          name: 'Button',
          controls: inferControls([
            { name: 'label', type: 'string' },
            { name: 'state', type: { union: ['primary', 'secondary', 'danger'] } },
            { name: 'disabled', type: 'boolean' },
          ]),
          axes: [{ name: 'state', values: ['primary', 'secondary', 'danger'] }],
          reactivity: [],
          scenarios: [],
          tags: [],
        },
      ],
    })

    // the simple config: just pass discovery — the recommended preset is default
    const graph = await createAtlas({ plugins: [discovery] }).build()
    const button = graph.get('Button')!

    // auto-categorized by name
    expect(button.tags).toContain('form')
    // variant matrix (3) + disabled state (1) + edge cases (2) = 6+ derived scenarios
    expect(button.scenarios.length).toBeGreaterThanOrEqual(6)
    // nothing enters the catalog unverified
    expect(button.scenarios.every((s) => s.verify !== undefined)).toBe(true)
    // fill-defaults made the primary variant renderable -> a11y passes
    const primary = button.scenarios.find((s) => s.variant?.state === 'primary')!
    expect(primary.verify?.a11y.status).toBe('pass')
    // the deliberately-empty edge case is correctly FLAGGED
    const empty = button.scenarios.find((s) => s.name === 'Empty')!
    expect(empty.verify?.a11y.status).toBe('fail')
    expect(empty.verify?.ok).toBe(false)
    // usage docs wrote a summary; the agent catalog renders
    expect(button.summary).toContain('Button —')
    expect(graph.toLlmsText()).toContain('## Button')
  })
})

describe('same-named components in one package (audit 2026-09)', () => {
  const card = (source: string) => ({
    name: 'Card',
    controls: [],
    axes: [],
    scenarios: [],
    tags: [],
    source,
  })

  it('get DISTINCT scenario ids — only the colliding names are qualified', async () => {
    const graph = await createAtlas({
      cwd: '/tmp',
      plugins: [
        defineAtlasPlugin({
          name: 'two-cards',
          discover: () => [card('proj/src/a/Card.tsx'), card('proj/src/b/Card.tsx'), { ...card('proj/src/Badge.tsx'), name: 'Badge' }],
        }),
      ],
    }).build()
    const ids = graph.scenarios().map((s) => s.id)
    expect(new Set(ids).size, 'no two scenarios share an id').toBe(ids.length)
    expect(ids).toContain('card-proj-src-a--default')
    expect(ids).toContain('card-proj-src-b--default')
    // A name that does not collide keeps its byte-identical id.
    expect(ids).toContain('badge--default')
    expect(graph.list().map((c) => c.name)).toEqual(['Card', 'Card', 'Badge'])
  })

  it('focus accepts the qualified key and refuses the bare name', async () => {
    const run = async (only: string) => {
      let outcome: unknown
      await createAtlas({
        cwd: '/tmp',
        preset: 'none',
        focus: (found) => {
          const out = focusComponents(found, only)
          outcome = out
          return out.kind === 'matched' ? out.components : []
        },
        plugins: [
          defineAtlasPlugin({
            name: 'two-cards',
            discover: () => [card('proj/src/a/Card.tsx'), card('proj/src/b/Card.tsx')],
          }),
        ],
      }).build()
      return outcome as ReturnType<typeof focusComponents>
    }
    const qualified = await run('Card@proj/src/b')
    expect(qualified.kind === 'matched' && qualified.components[0]?.source).toBe('proj/src/b/Card.tsx')
    // Used to resolve to the FIRST Card silently: its bare key matched exactly.
    expect((await run('Card')).kind).toBe('ambiguous')
  })
})
