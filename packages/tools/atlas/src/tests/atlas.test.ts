import { inferControls } from '../core'
import { createAtlas } from '../index'
import { a11yPlugin, defineAtlasPlugin, recommendedPlugins, variantMatrixPlugin } from '../plugins'

describe('createAtlas', () => {
  it('runs the full pipeline: discover -> decorate -> verify -> graph', async () => {
    const graphHookSizes: number[] = []
    const atlas = createAtlas({
      cwd: '/tmp',
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

    const graph = await createAtlas({ plugins: [discovery, ...recommendedPlugins()] }).build()
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
