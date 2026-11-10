/**
 * Static-prop fold emit (runtime half: core `_pk` / `_pp`). Byte parity with
 * the native backend is in `native-equivalence.test.ts`; behaviour through a
 * real mount is in runtime-dom `static-prop-fold.test.tsx`.
 */
import { describe, expect, test } from 'vitest'
import { transformJSX_JS } from '../jsx'

const t = (src: string): string => transformJSX_JS(src, 'test.tsx').code

describe('static-prop fold emit', () => {
  test('arithmetic over a props member folds behind _pk with the _rp thunk as fallback', () => {
    expect(t('function Node(props) { return <Node depth={props.depth - 1} /> }')).toContain(
      'depth={_pk(props, "depth") ? (props.depth - 1) : _rp(() => props.depth - 1)}',
    )
  })

  test('several source keys are all checked, each once', () => {
    expect(t('const C = (props) => <R c={props.a ? props.a : props.b} />')).toContain(
      'c={_pk(props, "a") && _pk(props, "b") ? (props.a ? props.a : props.b) : _rp(() => props.a ? props.a : props.b)}',
    )
  })

  test('an exact pass-through forwards with _pp', () => {
    const out = t('const C = (props) => <R x={props.x} />')
    expect(out).toContain('x={_pp(props, "x")}')
    expect(out).toContain('import { _pp } from "@pyreon/core"')
  })

  test.each([
    ['a signal read', 'props.y + count()'],
    ['a deep member', 'props.o.k'],
    ['instanceof', 'props.s instanceof props.t'],
    ['in', '"k" in props.o'],
    ['optional chain', 'props?.z'],
    ['a BigInt literal', '1n + props.y'],
    ['an identifier', 'props.y + base'],
    ['a call', 'String(props.y)'],
  ])('%s keeps the _rp thunk', (_n, expr) => {
    expect(t(`const C = (props) => <R v={${expr}} />`)).toContain(`v={_rp(() => ${expr})}`)
  })

  test.each([
    ['a lowercase helper (its param may be a store proxy)', 'const row = (props) => <R v={props.y + 1} />'],
    ['a re-assigned props param', 'function C(props) { props = o; return <R v={props.y + 1} /> }'],
    ['a shadowed props name', 'function C(props) { const f = (props) => 1; return <R v={props.y + 1} /> }'],
    ['a class method', 'class X { render(props) { return <R v={props.y + 1} /> } }'],
  ])('%s is not fold-eligible', (_n, src) => {
    const out = t(src)
    expect(out).toContain('v={_rp(() => props.y + 1)}')
    expect(out).not.toContain('_pk(')
  })
})
