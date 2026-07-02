import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — attrs snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/attrs — Chainable HOC factory — default props (.attrs), base swaps (.config), HOC composition (.compose), statics (.statics). 'priority' does NOT mean 'highest precedence' — priorityAttrs resolve FIRST (so later .attrs() callbacks can read them as input) but sit at the LOWEST precedence in the final merge: priorityAttrs < attrs < explicit props. @pyreon/rocketstyle uses the slot to seed structural base props the dimension layer can still override."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/attrs — Chainable HOC Factory

      Chainable HOC factory for Pyreon components. \`attrs({ name, component })\` wraps a component in an immutable builder that accumulates default props (\`.attrs()\`), reconfigures the base (\`.config()\`), composes named HOCs (\`.compose()\`), and attaches static metadata (\`.statics()\`). Every chain method returns a NEW component — the original is never mutated — and \`.attrs<P>()\` generics accumulate into the component's prop type. It is the chaining foundation \`@pyreon/rocketstyle\` builds on; use it directly for default-prop composition without the dimension-styling layer.

      \`\`\`typescript
      import attrs, { isAttrsComponent } from '@pyreon/attrs'
      import { Element } from '@pyreon/elements'

      // Factory takes { name, component } — BOTH required (dev mode throws)
      const Button = attrs({ name: 'Button', component: Element })
        // Object form — static default props
        .attrs({ tag: 'button', alignX: 'center', alignY: 'center' })
        // Callback form — receives the current resolved props; the generic
        // accumulates into the component's prop type
        .attrs<{ primary?: boolean }>(({ primary }) => ({
          backgroundColor: primary ? 'blue' : 'gray',
        }))

      // Defaults apply; explicit call-site props always win
      <Button label="Click me" />
      <Button tag="a" href="/x" label="Link" />      // tag: 'a' overrides the default

      // Strip internal control props before they reach the base / DOM
      const Card = attrs({ name: 'Card', component: Element })
        .attrs(({ elevated }) => ({ shadow: elevated ? 'lg' : 'none' }), { filter: ['elevated'] })

      // Swap the base — attrs' .config PRESERVES the accumulated chains
      // (unlike @pyreon/rocketstyle, which resets them on a component swap)
      const Anchor = Button.config({ component: 'a', name: 'Anchor' })

      // Named HOC composition — falsy value removes a previously composed HOC
      const Tracked = Button.compose({ withTracking: (C) => (props) => C(props) })
      const Untracked = Tracked.compose({ withTracking: null })

      // Static metadata lands on .meta
      const Tagged = Button.statics({ category: 'action' })
      Tagged.meta.category                            // 'action'

      // Introspection
      Button.getDefaultAttrs({})                      // resolved default props
      isAttrsComponent(Button)                        // true (IS_ATTRS marker)
      \`\`\`

      > **Note**: 'priority' does NOT mean 'highest precedence' — priorityAttrs resolve FIRST (so later .attrs() callbacks can read them as input) but sit at the LOWEST precedence in the final merge: priorityAttrs < attrs < explicit props. @pyreon/rocketstyle uses the slot to seed structural base props the dimension layer can still override.
      >
      > **Chains survive base swaps**: \`.config({ component })\` at this layer PRESERVES the accumulated chains and re-applies them to the new base — the chain-reset-on-swap behavior belongs to \`@pyreon/rocketstyle\`, one layer up. Reconciling the new base's prop shape is on the caller.
      >
      > **Type accumulation**: Each \`.attrs<P>()\` generic accumulates into the component's prop type; the type-only \`$$types\` (origin + extended), \`$$originTypes\`, and \`$$extendedTypes\` properties expose the accumulated shapes, and \`ExtractProps<typeof C>\` from \`@pyreon/core\` recovers the union for HOC forwarding.
      >
      > **Descriptor-safe forwarding**: The attrs HOC merges consumer props via \`mergeProps\` / \`removeUndefinedProps\` from \`@pyreon/core\` (descriptor copies), so compiler-emitted reactive getter props survive the chain. Any HOC you \`.compose()\` must do the same — a plain \`{ ...props }\` spread collapses reactive props to static values.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(7)
    expect(record['attrs/attrs']!.notes).toContain('Factory')
    expect(record['attrs/attrs']!.mistakes?.split('\n').length).toBe(6)
  })
})
