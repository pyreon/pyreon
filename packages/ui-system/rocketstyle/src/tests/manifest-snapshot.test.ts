import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — rocketstyle snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/rocketstyle — Multi-dimensional component styling — states, sizes, variants, custom dimensions, dark/light mode, all cached. useBooleans defaults to FALSE — dimension props take strings (state="primary"), not boolean shorthands. Historically the TYPE default said true while the runtime was false, so boolean props typechecked but were silently dropped; the runtime default (false) is now authoritative in both."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/rocketstyle — Multi-Dimensional Styling

      Multi-dimensional style composition for Pyreon components — the styling engine the \`@pyreon/ui-components\` library builds on. Organize styles by named DIMENSIONS (\`state\`, \`size\`, \`variant\`, plus custom ones) instead of flat boolean props: each dimension is a chainable definition method (\`.states({...})\`, \`.sizes({...})\`) that auto-generates the matching consumer prop. Base styles go through \`.theme()\`, dark/light values through the \`mode(light, dark)\` helper, raw CSS through \`.styles()\`. Built on \`@pyreon/attrs\` + \`@pyreon/styler\`; per-definition WeakMap caches (\`_rsMemo\` LRU 128/theme) keep per-mount cost near zero for same-definition components.

      \`\`\`typescript
      import rocketstyle from '@pyreon/rocketstyle'
      import { Element } from '@pyreon/elements'

      // 1. Create the factory (per app / design system). useBooleans: false is
      //    the DEFAULT — dimension props take STRING values (state="primary"),
      //    not boolean shorthands.
      const rs = rocketstyle()

      // 2. Wrap a base component — { name, component } are BOTH required
      //    (dev mode throws on a missing one). There is no rs('button') shorthand.
      const Button = rs({ name: 'Button', component: Element })
        .attrs({ tag: 'button' })                    // LAYOUT / default props → .attrs()
        .theme((t, mode, css) => ({                  // CSS → .theme(); mode is a HELPER fn
          borderRadius: 4,
          color: mode('#1a1a1a', '#e0e0e0'),         // light value, dark value
          backgroundColor: mode('#fff', '#333'),
          hover: { backgroundColor: mode('#f3f4f6', '#444') },   // nested pseudo-state
          disabled: { opacity: 0.5 },
        }))
        .states({
          primary: { backgroundColor: '#0d6efd', color: '#fff', hover: { backgroundColor: '#0b5ed7' } },
          danger: { backgroundColor: '#dc3545', color: '#fff', hover: { backgroundColor: '#bb2d3b' } },
        })
        .sizes({
          sm: { fontSize: 14, paddingX: 12, paddingY: 6 },
          lg: { fontSize: 18, paddingX: 20, paddingY: 10 },
        })

      // 3. Consume — dimension methods are PLURAL, props are SINGULAR strings
      <Button state="danger" size="lg">Delete</Button>

      // Multi-value dimension (built-in \`multiple\`) takes an array
      const Box = rs({ name: 'Box', component: Element })
        .multiple({ rounded: { borderRadius: 999 }, shadow: { boxShadow: '0 2px 8px rgba(0,0,0,0.15)' } })
      <Box multiple={['rounded', 'shadow']} />

      // Transform dimension (built-in \`modifiers\`) — value fns receive the
      // theme accumulated from all PRIOR dimensions (e.g. derive "outlined"
      // from the active state's colors)
      const OutlineButton = Button.modifiers({
        outlined: (t) => ({ color: t.backgroundColor, backgroundColor: 'transparent' }),
      })
      <OutlineButton state="danger" modifier="outlined" />   // red-on-transparent

      // Custom dimensions — override the map at factory init; each key
      // becomes a chain method, each propName becomes the consumer prop
      const rsBadge = rocketstyle({
        dimensions: { tones: 'tone', decorations: { propName: 'decoration', multi: true } },
      })
      const Badge = rsBadge({ name: 'Badge', component: 'span' })
        .tones({ info: { color: 'blue' }, warn: { color: 'orange' } })
      <Badge tone="warn" decoration={['pill']} />
      \`\`\`

      > **Note**: useBooleans defaults to FALSE — dimension props take strings (state="primary"), not boolean shorthands. Historically the TYPE default said true while the runtime was false, so boolean props typechecked but were silently dropped; the runtime default (false) is now authoritative in both.
      >
      > **Layout vs CSS split**: With Element-based bases, layout props go in \`.attrs()\` (\`tag\`, \`direction\`, \`alignX\`, \`alignY\`, \`gap\`, \`block\`) and visual CSS goes in \`.theme()\`. CSS property names follow the unistyle convention (\`borderWidthTop\`, not \`borderTopWidth\`).
      >
      > **Cache keys post-normalization**: The \`_rsMemo\` dimension-prop memo keys on RESOLVED dimension values (after boolean-shorthand normalization), not raw props — under \`useBooleans: true\`, keying on raw props would collide every boolean variant onto the first cached entry (a real shipped bug, since fixed). Cache capacity is LRU 128 entries per theme; real apps need ONE shared \`<PyreonUI>\` for the memo to span instances.
      >
      > **Component-swap reset**: \`.config({ component: NewBase })\` resets the \`attrs\` / \`priorityAttrs\` / \`filterAttrs\` / \`compose\` chains (prop-shape-coupled), while \`theme\` / \`styles\` / dimension chains survive (they target rendered CSS). This reset is rocketstyle-specific — the lower-level \`@pyreon/attrs\` \`.config()\` preserves its chains.
      >
      > **Introspection surface**: Every rocketstyle component carries \`IS_ROCKETSTYLE: true\`, \`displayName\`, \`meta\` (from \`.statics()\`), the read-only \`__rs_attrs\` accumulated attrs chain (used by \`@pyreon/connector-document\` to compute post-attrs props without mounting), plus \`getDefaultAttrs(props, theme, mode)\` and \`getStaticDimensions(theme)\` helpers.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(14)
    expect(record['rocketstyle/rocketstyle']!.notes).toContain('Factory')
    expect(record['rocketstyle/rocketstyle']!.mistakes?.split('\n').length).toBe(7)
    // The raw context export (backing Provider) is now documented.
    expect(record['rocketstyle/context']!.notes).toContain('reactive context')
  })
})
