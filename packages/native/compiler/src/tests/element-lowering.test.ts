import { afterEach, describe, expect, it } from 'vitest'
import { transform } from '../index'
import {
  findElementLowering,
  isElementLoweringTag,
  isStyleBasePrimitive,
  registerElementLowering,
  type ElementLowering,
} from '../element-lowering'
import { createEmitContext, type EmitContextBackend } from '../emit-context'
import type { JsxElementIR } from '../types'

const swift = (src: string) => transform(src, { target: 'swift' })
const kotlin = (src: string) => transform(src, { target: 'kotlin' })

const claimAll = () => true
const claimNone = () => false

describe('element lowering registry', () => {
  it('registers coolgrid and elements through the same API a plugin uses', () => {
    expect(findElementLowering('Row', claimAll)?.module).toBe('@pyreon/coolgrid')
    expect(findElementLowering('Col', claimAll)?.module).toBe('@pyreon/coolgrid')
    expect(findElementLowering('Element', claimAll)?.module).toBe('@pyreon/elements')
    expect(findElementLowering('Stack', claimAll)).toBeUndefined()
  })

  it('the guard decides: a refused (tag, module) is not claimed', () => {
    expect(findElementLowering('Row', claimNone)).toBeUndefined()
    const seen: Array<[string, string]> = []
    findElementLowering('Row', (tag, mod) => {
      seen.push([tag, mod])
      return false
    })
    expect(seen).toEqual([['Row', '@pyreon/coolgrid']])
  })

  it('rejects a second claim of one (module, tag) pair, allows the same tag from another module', () => {
    expect(() => registerElementLowering({ module: '@pyreon/coolgrid', tags: ['Row'] })).toThrow(
      /already registered/,
    )
    const off = registerElementLowering({ module: '@acme/grid', tags: ['Row'] })
    try {
      expect(findElementLowering('Row', (_t, mod) => mod === '@acme/grid')?.module).toBe('@acme/grid')
      expect(findElementLowering('Row', (_t, mod) => mod === '@pyreon/coolgrid')?.module).toBe(
        '@pyreon/coolgrid',
      )
    } finally {
      off()
    }
    expect(findElementLowering('Row', (_t, mod) => mod === '@acme/grid')).toBeUndefined()
  })

  it('only Element is a style base (Container/Row/Col were never)', () => {
    expect(isStyleBasePrimitive('Element')).toBe(true)
    expect(isStyleBasePrimitive('Row')).toBe(false)
    expect(isElementLoweringTag('Row')).toBe(true)
    expect(isElementLoweringTag('Stack')).toBe(false)
  })
})

describe('import guard through the full emit', () => {
  it('a Row imported from a user module is NOT claimed (both targets)', () => {
    const src = `import { Row } from './mine'
export function App() { return (<Row>Hi</Row>) }`
    expect(swift(src).code).not.toContain('HStack')
    expect(kotlin(src).code).not.toContain('Row(')
    expect(swift(src).code).toContain('Row {')
  })

  it('a same-named LOCAL component shadows the claim', () => {
    const src = `import { Col } from '@pyreon/coolgrid'
function Col(props: { children?: unknown }) { return <Text>x</Text> }
export function App() { return (<Col size={3}>Hi</Col>) }`
    expect(swift(src).code).not.toContain('containerRelativeFrame')
  })

  it('a sub-path import normalises to the package root and is claimed', () => {
    const src = `import { Row } from '@pyreon/coolgrid/grid'
export function App() { return (<Row>Hi</Row>) }`
    expect(swift(src).code).toContain('HStack')
  })

  it('a renamed import is not claimed (the tag is the local name)', () => {
    const src = `import { Row as R } from '@pyreon/coolgrid'
export function App() { return (<R>Hi</R>) }`
    expect(swift(src).code).not.toContain('HStack')
  })
})

describe('a third-party plugin claim via the same registry', () => {
  let off: (() => void) | undefined
  afterEach(() => {
    off?.()
    off = undefined
  })

  const banner: ElementLowering = {
    module: '@acme/ui',
    tags: ['Banner'],
    emit: {
      swift: (el, ctx) => {
        const id = ctx.staticAttr(el, 'id')
        ctx.warn('Banner: custom swift emit')
        return `AcmeBanner(id: ${ctx.stringLiteral(String(id))}) {\n${ctx.pad(ctx.indent + 2)}${ctx.emit({ ...el, tag: 'Stack' }, ctx.indent + 2)}\n${ctx.pad()}}`
      },
    },
  }
  const SRC = `import { Banner } from '@acme/ui'
export function App() { return (<Banner id="top"><Text>Hi</Text></Banner>) }`

  it('emits through the facade on the claiming target and falls through on the other', () => {
    off = registerElementLowering(banner)
    const sw = swift(SRC)
    expect(sw.code).toContain('AcmeBanner(id: "top") {')
    expect(sw.warnings).toContain('Banner: custom swift emit')
    // No `kotlin` function → the generic path (a component call) takes over.
    expect(kotlin(SRC).code).not.toContain('AcmeBanner')
  })

  it('is import-guarded: the same tag from another module is left alone', () => {
    off = registerElementLowering(banner)
    const other = SRC.replace('@acme/ui', './mine')
    expect(swift(other).code).not.toContain('AcmeBanner')
  })

  it('stops claiming after unregistering', () => {
    registerElementLowering(banner)()
    expect(swift(SRC).code).not.toContain('AcmeBanner')
  })

  it('a retag re-enters dispatch (the claim becomes a canonical Stack)', () => {
    off = registerElementLowering({
      module: '@acme/ui',
      tags: ['Panel'],
      retag: (el) => ({ ...el, tag: 'Stack' }),
    })
    const out = swift(`import { Panel } from '@acme/ui'
export function App() { return (<Panel><Text>Hi</Text></Panel>) }`)
    expect(out.code).toContain('VStack')
  })
})

describe('EmitContext', () => {
  const el: JsxElementIR = { kind: 'jsx-element', tag: 'X', attrs: [], children: [] }
  const calls: string[] = []
  const backend: EmitContextBackend = {
    emit: (e, indent) => {
      calls.push(`emit:${e.tag}@${indent}`)
      return 'out'
    },
    staticAttr: (_e, name) => (name === 'a' ? 'v' : undefined),
    stringLiteral: (v) => JSON.stringify(v),
    warn: (m) => {
      calls.push(`warn:${m}`)
    },
  }

  it('defaults indentation to the element and delegates to the backend', () => {
    const ctx = createEmitContext('kotlin', backend, 4)
    expect(ctx.target).toBe('kotlin')
    expect(ctx.pad()).toBe('    ')
    expect(ctx.pad(2)).toBe('  ')
    expect(ctx.emit(el)).toBe('out')
    expect(ctx.emit(el, 6)).toBe('out')
    expect(ctx.staticAttr(el, 'a')).toBe('v')
    expect(ctx.staticAttr(el, 'b')).toBeUndefined()
    expect(ctx.stringLiteral('q')).toBe('"q"')
    ctx.warn('w')
    expect(calls).toEqual(['emit:X@4', 'emit:X@6', 'warn:w'])
  })
})
