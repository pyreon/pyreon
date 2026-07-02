import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — kinetic-presets snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(`"- @pyreon/kinetic-presets — 122 animation presets + 5 configurable factories + 5 composition utilities for @pyreon/kinetic. Tree-shaking is first-class: an internal #__NO_SIDE_EFFECTS__ annotation on the preset factory plus sideEffects: false means importing one named preset ships ~300 bytes — importing the \`presets\` map pins all 122."`)
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/kinetic-presets — Animation Presets

      The preset catalog for \`@pyreon/kinetic\`. Every preset is a plain \`Preset\` object — style-form fields (\`enterStyle\` / \`enterToStyle\` / \`enterTransition\` + leave siblings) and/or class-form fields (\`enter\` / \`enterFrom\` / \`enterTo\` + leave siblings) — passed straight to \`kinetic(...).preset(...)\`. 122 ready-made presets ship as named exports AND on the \`presets\` map (for dynamic selection by name); five factories (\`createFade\` / \`createSlide\` / \`createScale\` / \`createRotate\` / \`createBlur\`) generate parameterized variants; five utilities (\`compose\` / \`withDuration\` / \`withEasing\` / \`withDelay\` / \`reverse\`) transform presets without forking them. Zero dependencies, framework-agnostic — presets are plain objects.

      \`\`\`typescript
      import { kinetic } from '@pyreon/kinetic'
      import {
        fadeUp, bounceIn, presets,
        createFade, createScale,
        compose, withDuration, withEasing, withDelay, reverse,
      } from '@pyreon/kinetic-presets'

      // Use a preset directly (named export or via the presets map):
      const Hero = kinetic('div').preset(fadeUp)
      const Chosen = kinetic('div').preset(presets[userChoice]) // dynamic by name

      // Factories generate parameterized variants:
      const SlowFade = kinetic('div').preset(createFade({ direction: 'up', distance: 24, duration: 800 }))
      const Spring = kinetic('div').preset(createScale({ from: 0.8, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' }))

      // Composition utilities return new Preset objects and chain freely:
      const fancy = compose(createFade(), createScale({ from: 0.95 }))   // shallow style merge
      const slow = withDuration(fadeUp, 600, 400)                        // enter 600ms, leave 400ms
      const bouncy = withEasing(bounceIn, 'cubic-bezier(0.34, 1.56, 0.64, 1)')
      const delayed = withDelay(fadeUp, 150, 0)                          // enter delay 150ms
      const flipped = reverse(fadeUp)                                    // swap enter <-> leave

      // A preset is just an object — hand-craft your own:
      import type { Preset } from '@pyreon/kinetic-presets'
      const myPreset: Preset = {
        enterStyle: { opacity: 0, transform: 'translateY(20px) scale(0.95)' },
        enterToStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
        enterTransition: 'all 400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        leaveStyle: { opacity: 1, transform: 'translateY(0) scale(1)' },
        leaveToStyle: { opacity: 0, transform: 'translateY(-10px) scale(0.98)' },
        leaveTransition: 'all 250ms ease-in',
      }
      \`\`\`

      > **Note**: Tree-shaking is first-class: an internal #__NO_SIDE_EFFECTS__ annotation on the preset factory plus sideEffects: false means importing one named preset ships ~300 bytes — importing the \`presets\` map pins all 122.
      >
      > **compose() transition strings are last-wins**: Style objects shallow-merge (later preset wins per property) and class strings concatenate, but \`enterTransition\` / \`leaveTransition\` are REPLACED by the last preset that defines them — not comma-joined. The built-ins all use \`all <duration> <easing>\` shorthands, so the surviving transition still animates every merged property.
      >
      > **Timing utilities are style-form only**: \`withDuration\` / \`withEasing\` / \`withDelay\` rewrite the CSS transition STRINGS via regex — a class-form preset (Tailwind \`duration-300\` etc.) has no transition string to rewrite and passes through unchanged; edit the classes instead.
      >
      > **Framework-agnostic**: Zero dependencies and no Pyreon coupling — presets are plain objects; any runtime that accepts the same field shape can consume them. Pairs with \`@pyreon/kinetic\`'s \`.preset(...)\`.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(12)
    expect(record['kinetic-presets/presets']!.notes).toContain('122')
    expect(record['kinetic-presets/compose']!.notes).toContain('LAST-preset-wins')
    expect(record['kinetic-presets/withDuration']!.mistakes?.split('\n').length).toBe(2)
  })
})
