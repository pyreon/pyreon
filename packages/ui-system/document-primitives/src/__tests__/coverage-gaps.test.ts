import type { DocumentMarker } from '@pyreon/connector-document'
import { h } from '@pyreon/core'
import { initTestConfig, renderProps } from '@pyreon/test-utils'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { documentTheme } from '../theme'
import { extractDocNode } from '../useDocumentExport'

// Cold-import of a primitive pulls the rocketstyle + attrs + styler chain.
vi.setConfig({ testTimeout: 60_000 })

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

// Real-VNode helper mirroring useDocumentExport.test.ts.
const node = (
  type: string | ((...args: any[]) => any),
  props: Record<string, any> = {},
  children: unknown[] = [],
) => h(type as any, props, ...(children as any[])) as any

const docComponent = (docType: string) => {
  const fn = (props: any) => node('div', props, props.children ? [props.children] : [])
  ;(fn as any)._documentType = docType
  return fn as ((...args: any[]) => any) & DocumentMarker
}

// --------------------------------------------------------
// extractDocNode — mode-only var resolution (no theme)
// --------------------------------------------------------
//
// `buildResolveVar`: when `mode` is supplied but `theme` is NOT, the registry
// stays undefined (line 30 else) and the resolver returns the mode-resolved
// value WITHOUT the themeToCssVars rewrite (line 33 else `return afterMode`).
// Exercises the mode(a,b)-pair-only export path used when a doc is exported
// under cssVariables without a theme registry.
describe('extractDocNode — mode-only resolveVar (no theme)', () => {
  const Doc = docComponent('document')
  const Text = docComponent('text')

  it('resolves mode without a theme registry — plain values pass through', () => {
    const tree = extractDocNode(
      () => node(Doc, {}, [node(Text, { $rocketstyle: { color: '#445566' } }, ['x'])]),
      { mode: 'dark' },
    )
    // No registry rewrite (theme absent); a non-var literal is untouched by
    // resolveModeVar, so it survives the mode-only path verbatim.
    expect((tree.children[0] as any).styles.color).toBe('#445566')
  })

  it('defaults mode to light when only theme is absent and mode omitted is not this path', () => {
    // mode supplied (light) but theme absent → same registry-undefined branch.
    const tree = extractDocNode(
      () => node(Doc, {}, [node(Text, { $rocketstyle: { color: '#778899' } }, ['x'])]),
      { mode: 'light' },
    )
    expect((tree.children[0] as any).styles.color).toBe('#778899')
  })
})

// --------------------------------------------------------
// documentTheme — public default theme export
// --------------------------------------------------------
describe('documentTheme', () => {
  it('exposes the default document theme tokens', () => {
    expect(documentTheme.colors.primary).toBe('#4f46e5')
    expect(documentTheme.sizes.h1).toBe(32)
    expect(documentTheme.spacing.md).toBe(16)
  })
})

// --------------------------------------------------------
// DocHeading — non-numeric level falls back to 1
// --------------------------------------------------------
//
// `Number.parseInt(String(lvl).replace('h', ''), 10) || 1` — the `|| 1`
// fallback fires when the parsed level is NaN (a non-numeric `level` value).
describe('DocHeading — non-numeric level fallback', () => {
  it('falls back to level 1 when level is non-numeric', async () => {
    const DocHeading = (await import('../primitives/DocHeading')).default
    // `level="hx"` → replace('h','') → "x" → parseInt("x") → NaN → || 1.
    const result = renderProps(DocHeading, { level: 'hx', children: 'Hello' })
    expect(result._documentProps.level).toBe(1)
    // tag preserves the raw level string.
    expect(result.as).toBe('hx')
  })
})
