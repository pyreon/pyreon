// Round-2 follow-up — diagnostic warnings for three silent-drop
// shapes the audit found:
//
//   1. <Press> without `onPress` → renders a no-op clickable element
//   2. <Link prefetch={…}> on native → web-only optimization, ignored
//   3. <Stack/Inline/Layer align="<typo>"> → silent fallback to default
//
// All three are diagnostic-only (`result.warnings`). Emit shapes
// UNCHANGED. Same pattern as the original required-prop warnings
// (#1094) — surface the issue at compile time instead of letting it
// silently break on the device.

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('Round-2 follow-up — silent-drop diagnostic warnings', () => {
  describe('<Press> without onPress', () => {
    it('warns naming the tag + the missing handler', () => {
      const result = transform(
        `export function App() { return <Press>Click</Press> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('<Press>') && w.includes('onPress')),
      ).toBe(true)
    })

    it('does NOT warn when onPress IS provided (baseline)', () => {
      const result = transform(
        `export function App() { return <Press onPress={() => {}}>Click</Press> }`,
        { target: 'swift' },
      )
      expect(result.warnings.some((w) => w.includes('<Press>'))).toBe(false)
    })

    it('fires on Kotlin target too (target-independent)', () => {
      const result = transform(
        `export function App() { return <Press>Click</Press> }`,
        { target: 'kotlin' },
      )
      expect(
        result.warnings.some((w) => w.includes('<Press>') && w.includes('onPress')),
      ).toBe(true)
    })
  })

  describe('<Link prefetch={…}> on native', () => {
    it('warns that prefetch is a web-only optimization', () => {
      const result = transform(
        `export function App() { return <Link to="/x" prefetch="intent">Go</Link> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('<Link') && w.includes('prefetch')),
      ).toBe(true)
    })

    it('does NOT warn for a plain <Link to> (baseline)', () => {
      const result = transform(
        `export function App() { return <Link to="/x">Go</Link> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('prefetch')),
      ).toBe(false)
    })
  })

  describe('<Stack/Inline/Layer align="<typo>"> unknown literal value', () => {
    it('Stack with unknown align fires a warning naming the value', () => {
      const result = transform(
        `export function App() { return <Stack align="invalid"><Text>x</Text></Stack> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('<Stack') && w.includes('"invalid"'),
        ),
      ).toBe(true)
    })

    it('Inline with unknown align fires too', () => {
      const result = transform(
        `export function App() { return <Inline align="bogus"><Text>x</Text></Inline> }`,
        { target: 'kotlin' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('<Inline') && w.includes('"bogus"'),
        ),
      ).toBe(true)
    })

    it('Layer with unknown align fires too', () => {
      const result = transform(
        `export function App() { return <Layer align="weird"><Text>x</Text></Layer> }`,
        { target: 'swift' },
      )
      expect(
        result.warnings.some(
          (w) => w.includes('<Layer') && w.includes('"weird"'),
        ),
      ).toBe(true)
    })

    it('valid align values do NOT warn (baseline)', () => {
      for (const valid of ['start', 'center', 'end', 'stretch', 'top', 'bottom', 'leading', 'trailing']) {
        const result = transform(
          `export function App() { return <Stack align="${valid}"><Text>x</Text></Stack> }`,
          { target: 'swift' },
        )
        expect(
          result.warnings.some((w) => w.includes('unrecognized align')),
          `align="${valid}" should NOT fire the unrecognized-align warning`,
        ).toBe(false)
      }
    })

    it('non-literal align (e.g. signal) does NOT warn (parser can\'t validate dynamic values)', () => {
      const result = transform(
        `
        import { signal } from '@pyreon/reactivity'
        export function App() {
          const a = signal('center')
          return <Stack align={a}><Text>x</Text></Stack>
        }
        `,
        { target: 'swift' },
      )
      expect(
        result.warnings.some((w) => w.includes('unrecognized align')),
      ).toBe(false)
    })
  })

  it('emit shape UNCHANGED — warnings are diagnostic-only', () => {
    // Verification belt: confirm we didn't accidentally start
    // suppressing the existing emit. Each warned-on shape still
    // emits its respective broken/silent code; the warning is
    // additional context, not a replacement.
    const out = transform(
      `export function App() { return <Press>x</Press> }`,
      { target: 'swift' },
    ).code
    expect(out).toContain('Button(action:') // existing Press → Button emit
  })
})
