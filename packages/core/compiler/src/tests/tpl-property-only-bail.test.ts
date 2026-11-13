/**
 * #4473: the template path could only bake a prop as an attribute or hand it
 * to `_setAttr`, so a prop the h() path writes as a DOM PROPERTY with no
 * content attribute under its own name became a dead attribute —
 * `innerHTML={html()}` wrote an `innerhtml` attribute instead of (sanitized)
 * content, and a literal was baked as `innerHTML="…"`. Each such prop bails its
 * element to h(). Both backends (native parity: `native-equivalence.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import { transformJSX_JS } from '../jsx'

const PROPERTY_ONLY = [
  'innerHTML',
  'textContent',
  'innerText',
  'defaultValue',
  'defaultChecked',
  'defaultSelected',
  'defaultMuted',
  'currentTime',
  'playbackRate',
  'defaultPlaybackRate',
  'volume',
  'srcObject',
  'acceptCharset',
  'httpEquiv',
]

describe('property-only props bail the template to h() (#4473)', () => {
  it.each(PROPERTY_ONLY)('%s: neither _setAttr nor a baked attribute', (name) => {
    const { code } = transformJSX_JS(
      `export const C = (p) => <section><div ${name}={p.x} /><p ${name}="lit" /></section>`,
      'c.tsx',
    )
    expect(code).not.toContain('_tpl(')
    expect(code).not.toContain(`_setAttr(`)
    expect(code).not.toContain(`${name}=\\"`)
  })

  it('the issue reproduction compiles to the h() path', () => {
    const { code } = transformJSX_JS(
      `import { signal } from '@pyreon/reactivity'\nexport const s = signal('<i>hi</i>')\nexport function C() { return <section><div innerHTML={s()} /></section> }`,
      'c.tsx',
    )
    expect(code).not.toContain('_setAttr(')
    expect(code).toContain('<div innerHTML={() => s()} />')
  })

  it('ordinary attributes and the existing DOM-property routes still template', () => {
    const { code } = transformJSX_JS(
      `export const C = (p) => <section><input value={p.v} checked={p.c} tabIndex={p.t} /></section>`,
      'c.tsx',
    )
    expect(code).toContain('_tpl(')
    expect(code).toContain('_setAttr(__e0, "tabIndex", p.t)')
  })
})
