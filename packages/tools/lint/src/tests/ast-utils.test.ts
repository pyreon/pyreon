import { describe, expect, it } from 'vitest'
import {
  getJSXAttribute,
  getJSXTagName,
  getSpan,
  hasJSXAttribute,
  hasJSXChild,
  isArrayMapCall,
  isBrowserGlobal,
  isCallTo,
  isCallToAny,
  isDestructuring,
  isFunction,
  isInsideDevGuard,
  isInsideFunction,
  isInsideJSX,
  isInsideOnMount,
  isInsideTypeofGuard,
  isJSXElement,
  isLogicalAndWithJSX,
  isMemberCallTo,
  isPeekCall,
  isSetCall,
  isTernaryWithJSX,
} from '../utils/ast'

// Coverage gap closed in PR #323. The ast utils are pure node-shape
// predicates used by ~40 lint rules. Pinning their behavior here so
// a future refactor that touches the AST builder doesn't silently
// invalidate the rule layer.

const ident = (name: string) => ({ type: 'Identifier', name })
const callExpr = (callee: any, args: any[] = []) => ({
  type: 'CallExpression',
  callee,
  arguments: args,
})
const member = (object: any, property: any) => ({ type: 'MemberExpression', object, property })
const jsxIdent = (name: string) => ({ type: 'JSXIdentifier', name })
const jsxElement = (tag: string, attrs: any[] = [], children: any[] = []) => ({
  type: 'JSXElement',
  openingElement: { attributes: attrs, name: jsxIdent(tag) },
  children,
})
const jsxAttr = (name: string, value?: any) => ({
  type: 'JSXAttribute',
  name: jsxIdent(name),
  value,
})

describe('ast utils — call expression predicates', () => {
  it('isCallTo matches direct identifier calls', () => {
    expect(isCallTo(callExpr(ident('signal'), []), 'signal')).toBe(true)
    expect(isCallTo(callExpr(ident('signal'), []), 'computed')).toBe(false)
    expect(isCallTo(callExpr(member(ident('a'), ident('b'))), 'a')).toBe(false)
    expect(isCallTo({ type: 'BinaryExpression' }, 'signal')).toBe(false)
  })

  it('isCallToAny matches any of a name set', () => {
    const set = new Set(['signal', 'computed', 'effect'])
    expect(isCallToAny(callExpr(ident('signal')), set)).toBe(true)
    expect(isCallToAny(callExpr(ident('effect')), set)).toBe(true)
    expect(isCallToAny(callExpr(ident('useState')), set)).toBe(false)
  })

  it('isMemberCallTo matches `obj.method()` form', () => {
    const node = callExpr(member(ident('console'), ident('log')))
    expect(isMemberCallTo(node, 'console', 'log')).toBe(true)
    expect(isMemberCallTo(node, 'console', 'warn')).toBe(false)
    expect(isMemberCallTo(node, 'window', 'log')).toBe(false)
  })

  it('isArrayMapCall matches any `.map(...)` call', () => {
    expect(isArrayMapCall(callExpr(member(ident('items'), ident('map'))))).toBe(true)
    expect(isArrayMapCall(callExpr(member(ident('items'), ident('filter'))))).toBe(false)
    expect(isArrayMapCall(callExpr(ident('map')))).toBe(false)
  })

  it('isPeekCall and isSetCall match `obj.peek()` and `obj.set()`', () => {
    expect(isPeekCall(callExpr(member(ident('count'), ident('peek'))))).toBe(true)
    expect(isPeekCall(callExpr(member(ident('count'), ident('value'))))).toBe(false)
    expect(isSetCall(callExpr(member(ident('count'), ident('set'))))).toBe(true)
    expect(isSetCall(callExpr(member(ident('count'), ident('peek'))))).toBe(false)
  })
})

describe('ast utils — JSX predicates', () => {
  it('isJSXElement recognises JSXElement and JSXFragment', () => {
    expect(isJSXElement(jsxElement('div'))).toBe(true)
    expect(isJSXElement({ type: 'JSXFragment' })).toBe(true)
    expect(isJSXElement({ type: 'CallExpression' })).toBe(false)
  })

  it('getJSXTagName returns plain identifier name', () => {
    expect(getJSXTagName(jsxElement('div'))).toBe('div')
  })

  it('getJSXTagName returns dotted form for JSXMemberExpression', () => {
    const node = {
      type: 'JSXElement',
      openingElement: {
        name: { type: 'JSXMemberExpression', object: { name: 'My' }, property: { name: 'Comp' } },
      },
    }
    expect(getJSXTagName(node)).toBe('My.Comp')
  })

  it('getJSXTagName returns null for fragments and missing opening', () => {
    expect(getJSXTagName({ type: 'JSXFragment' })).toBeNull()
    expect(getJSXTagName({ type: 'JSXElement' })).toBeNull()
  })

  it('getJSXAttribute / hasJSXAttribute look up by name', () => {
    const opening = { attributes: [jsxAttr('class', 'a'), jsxAttr('id', 'x')] }
    expect(getJSXAttribute(opening, 'class')).toBeTruthy()
    expect(getJSXAttribute(opening, 'missing')).toBeNull()
    expect(hasJSXAttribute(opening, 'id')).toBe(true)
    expect(hasJSXAttribute(opening, 'no')).toBe(false)
  })

  it('hasJSXAttribute handles missing attributes array', () => {
    expect(hasJSXAttribute({}, 'x')).toBe(false)
  })

  it('hasJSXChild detects nested JSX elements', () => {
    const inner = jsxElement('span')
    const outer = jsxElement('div', [], [inner])
    expect(hasJSXChild(outer)).toBe(true)
  })

  it('hasJSXChild returns false for fragments', () => {
    expect(hasJSXChild({ type: 'JSXFragment' })).toBe(false)
  })

  it('hasJSXChild returns false when only text children', () => {
    expect(hasJSXChild(jsxElement('div', [], [{ type: 'JSXText' }]))).toBe(false)
  })

  it('isTernaryWithJSX detects JSX in either branch', () => {
    const ternary = (c: any, a: any) => ({ type: 'ConditionalExpression', consequent: c, alternate: a })
    expect(isTernaryWithJSX(ternary(jsxElement('a'), { type: 'NullLiteral' }))).toBe(true)
    expect(isTernaryWithJSX(ternary({ type: 'NullLiteral' }, jsxElement('b')))).toBe(true)
    expect(isTernaryWithJSX(ternary({ type: 'NullLiteral' }, { type: 'NullLiteral' }))).toBe(false)
    expect(isTernaryWithJSX({ type: 'BinaryExpression' })).toBe(false)
  })

  it('isTernaryWithJSX unwraps ParenthesizedExpression', () => {
    const ternary = {
      type: 'ConditionalExpression',
      consequent: { type: 'ParenthesizedExpression', expression: jsxElement('a') },
      alternate: { type: 'NullLiteral' },
    }
    expect(isTernaryWithJSX(ternary)).toBe(true)
  })

  it('isLogicalAndWithJSX detects `cond && <JSX />`', () => {
    expect(
      isLogicalAndWithJSX({ type: 'LogicalExpression', operator: '&&', right: jsxElement('div') }),
    ).toBe(true)
    expect(
      isLogicalAndWithJSX({ type: 'LogicalExpression', operator: '||', right: jsxElement('div') }),
    ).toBe(false)
    expect(
      isLogicalAndWithJSX({ type: 'LogicalExpression', operator: '&&', right: { type: 'NullLiteral' } }),
    ).toBe(false)
    expect(isLogicalAndWithJSX({ type: 'BinaryExpression' })).toBe(false)
  })
})

describe('ast utils — ancestor predicates', () => {
  it('isInsideFunction detects function ancestors', () => {
    expect(isInsideFunction([{ type: 'IfStatement' }, { type: 'FunctionDeclaration' }])).toBe(true)
    expect(isInsideFunction([{ type: 'ArrowFunctionExpression' }])).toBe(true)
    expect(isInsideFunction([{ type: 'FunctionExpression' }])).toBe(true)
    expect(isInsideFunction([{ type: 'IfStatement' }])).toBe(false)
  })

  it('isInsideJSX detects JSX ancestors', () => {
    expect(isInsideJSX([{ type: 'JSXElement' }])).toBe(true)
    expect(isInsideJSX([{ type: 'JSXFragment' }])).toBe(true)
    expect(isInsideJSX([{ type: 'IfStatement' }])).toBe(false)
  })

  it('isInsideDevGuard detects `if (__DEV__)` wrapping', () => {
    expect(
      isInsideDevGuard([{ type: 'IfStatement', test: { type: 'Identifier', name: '__DEV__' } }]),
    ).toBe(true)
    expect(
      isInsideDevGuard([{ type: 'IfStatement', test: { type: 'Identifier', name: 'something' } }]),
    ).toBe(false)
  })

  it('isInsideOnMount detects `onMount(() => …)` wrapping', () => {
    expect(
      isInsideOnMount([{ type: 'CallExpression', callee: { type: 'Identifier', name: 'onMount' } }]),
    ).toBe(true)
    expect(
      isInsideOnMount([{ type: 'CallExpression', callee: { type: 'Identifier', name: 'effect' } }]),
    ).toBe(false)
  })

  it('isInsideTypeofGuard detects `typeof X !== "undefined"` wrapping', () => {
    const guard = {
      type: 'IfStatement',
      test: {
        type: 'BinaryExpression',
        left: { type: 'UnaryExpression', operator: 'typeof' },
      },
    }
    expect(isInsideTypeofGuard([guard])).toBe(true)
    expect(isInsideTypeofGuard([{ type: 'IfStatement', test: { type: 'Identifier' } }])).toBe(false)
  })
})

describe('ast utils — misc', () => {
  it('isFunction recognises all function node types', () => {
    expect(isFunction({ type: 'FunctionDeclaration' })).toBe(true)
    expect(isFunction({ type: 'FunctionExpression' })).toBe(true)
    expect(isFunction({ type: 'ArrowFunctionExpression' })).toBe(true)
    expect(isFunction({ type: 'CallExpression' })).toBe(false)
  })

  it('isDestructuring recognises object and array patterns', () => {
    expect(isDestructuring({ type: 'ObjectPattern' })).toBe(true)
    expect(isDestructuring({ type: 'ArrayPattern' })).toBe(true)
    expect(isDestructuring({ type: 'Identifier' })).toBe(false)
  })

  it('isBrowserGlobal recognises window/document/etc.', () => {
    expect(isBrowserGlobal(ident('window'))).toBe(true)
    expect(isBrowserGlobal(ident('document'))).toBe(true)
    expect(isBrowserGlobal(ident('fooBar'))).toBe(false)
    expect(isBrowserGlobal({ type: 'CallExpression' })).toBe(false)
  })

  it('getSpan returns { start, end } from byte offsets', () => {
    expect(getSpan({ start: 12, end: 30 })).toEqual({ start: 12, end: 30 })
  })
})
