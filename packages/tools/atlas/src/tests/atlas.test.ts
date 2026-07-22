import { inferControls } from '../core'
import { createAtlas } from '../index'
import { a11yPlugin, defineAtlasPlugin, variantMatrixPlugin } from '../plugins'

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
})
