import { describe, expect, it } from 'vitest'
import { makeScenario, type ComponentIntelligence } from '../../core'
import { contentPlugin } from '../content'

/**
 * An authored `Default` is the BASE of every derived scenario.
 *
 * A render-prop component (`children: (state) => …`) or a data-driven one
 * (`options`, `data`) renders nothing without what the author supplied, and
 * the variant generator only knows the axes. Measured on ui-components after
 * the authored scenarios landed: every `size=medium` / `size=large` of
 * PinInput, MultiSelect, Autocomplete and ComboboxStyled still failed
 * `empty-render`, because only the derived seed merged under them.
 */
const body = () => 'rendered'

const ci = (over: Partial<ComponentIntelligence>): ComponentIntelligence => ({
  name: 'PinInput',
  controls: [],
  axes: [],
  scenarios: [],
  tags: [],
  ...over,
})

const decorate = async (input: ComponentIntelligence) => contentPlugin().decorate!(input, { cwd: '.' })

describe('contentPlugin — the authored Default as the derived base', () => {
  it('merges the authored Default args UNDER every derived scenario', async () => {
    const out = await decorate(
      ci({
        content: { children: 'PinInput' },
        scenarios: [
          makeScenario({ component: 'PinInput', name: 'Default', args: { length: 4, children: body }, source: 'authored' }),
          makeScenario({ component: 'PinInput', name: 'size=medium', args: { size: 'medium' }, source: 'auto-variant' }),
        ],
      }),
    )
    const medium = out.scenarios.find((s) => s.name === 'size=medium')!
    // The seed's string child is REPLACED by the authored render prop, and the
    // authored length rides along; the variant's own axis value still wins.
    expect(medium.args).toEqual({ length: 4, children: body, size: 'medium' })
  })

  it('never lets one authored scenario inherit from another — each is a complete state', async () => {
    const out = await decorate(
      ci({
        scenarios: [
          makeScenario({ component: 'PinInput', name: 'Default', args: { length: 4, children: body }, source: 'authored' }),
          makeScenario({ component: 'PinInput', name: 'Masked', args: { mask: true }, source: 'authored' }),
        ],
      }),
    )
    expect(out.scenarios.find((s) => s.name === 'Masked')!.args).toEqual({ mask: true })
  })

  it('keeps a derived scenario\'s own value over the authored base, key by key', async () => {
    const out = await decorate(
      ci({
        scenarios: [
          makeScenario({ component: 'PinInput', name: 'Default', args: { length: 4 }, source: 'authored' }),
          makeScenario({ component: 'PinInput', name: 'Long', args: { length: 8 }, source: 'auto-edge' }),
        ],
      }),
    )
    expect(out.scenarios.find((s) => s.name === 'Long')!.args).toEqual({ length: 8 })
  })

  it('is a no-op with neither a seed nor an authored Default', async () => {
    const input = ci({ scenarios: [makeScenario({ component: 'PinInput', name: 'Default', source: 'auto-default' })] })
    expect(await decorate(input)).toBe(input)
  })
})
