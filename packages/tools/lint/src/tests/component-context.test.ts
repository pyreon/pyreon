import { describe, expect, it } from 'vitest'
import {
  createComponentContextTracker,
  isComponentOrHookName,
} from '../utils/component-context'

describe('isComponentOrHookName', () => {
  it('recognises PascalCase components', () => {
    expect(isComponentOrHookName('App')).toBe(true)
    expect(isComponentOrHookName('MyComponent')).toBe(true)
    expect(isComponentOrHookName('A')).toBe(true)
  })

  it('recognises useXyz hooks', () => {
    expect(isComponentOrHookName('useState')).toBe(true)
    expect(isComponentOrHookName('useEffect')).toBe(true)
    expect(isComponentOrHookName('useCustom')).toBe(true)
  })

  it('rejects camelCase non-hook names', () => {
    expect(isComponentOrHookName('foo')).toBe(false)
    expect(isComponentOrHookName('use')).toBe(false) // bare "use" doesn't match `use[A-Z]`
    expect(isComponentOrHookName('usePlural')).toBe(true) // proper hook name
    expect(isComponentOrHookName('userName')).toBe(false) // "use" prefix but lowercase next char
  })

  it('rejects empty / nullish / non-identifier names', () => {
    expect(isComponentOrHookName('')).toBe(false)
    expect(isComponentOrHookName(null)).toBe(false)
    expect(isComponentOrHookName(undefined)).toBe(false)
  })
})

describe('createComponentContextTracker — depth counter', () => {
  it('starts at depth 0 → isInComponentOrHook() false', () => {
    const t = createComponentContextTracker()
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('FunctionDeclaration with component name pushes depth (L91-93)', () => {
    const t = createComponentContextTracker()
    const fnDecl = t.callbacks.FunctionDeclaration
    fnDecl?.({ id: { name: 'App' } })
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks['FunctionDeclaration:exit']?.({ id: { name: 'App' } })
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('FunctionDeclaration with hook name (use prefix) pushes depth', () => {
    const t = createComponentContextTracker()
    t.callbacks.FunctionDeclaration?.({ id: { name: 'useTheme' } })
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks['FunctionDeclaration:exit']?.({ id: { name: 'useTheme' } })
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('FunctionDeclaration with non-component name does NOT push depth', () => {
    const t = createComponentContextTracker()
    t.callbacks.FunctionDeclaration?.({ id: { name: 'helper' } })
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('VariableDeclarator + Arrow with component name pushes depth (L98-103)', () => {
    const t = createComponentContextTracker()
    const node = {
      id: { type: 'Identifier', name: 'App' },
      init: { type: 'ArrowFunctionExpression' },
    }
    t.callbacks.VariableDeclarator?.(node)
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks['VariableDeclarator:exit']?.(node)
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('VariableDeclarator with FunctionExpression also pushes depth', () => {
    const t = createComponentContextTracker()
    const node = {
      id: { type: 'Identifier', name: 'useFoo' },
      init: { type: 'FunctionExpression' },
    }
    t.callbacks.VariableDeclarator?.(node)
    expect(t.isInComponentOrHook()).toBe(true)
  })

  it('VariableDeclarator with non-arrow/function init does NOT push depth (L79-83)', () => {
    const t = createComponentContextTracker()
    t.callbacks.VariableDeclarator?.({
      id: { type: 'Identifier', name: 'App' },
      init: { type: 'NumericLiteral' },
    })
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('VariableDeclarator with non-Identifier id does NOT push depth (L77)', () => {
    const t = createComponentContextTracker()
    t.callbacks.VariableDeclarator?.({
      id: { type: 'ObjectPattern' },
      init: { type: 'ArrowFunctionExpression' },
    })
    expect(t.isInComponentOrHook()).toBe(false)
  })

  it('nesting components correctly stacks depth (multi-level)', () => {
    const t = createComponentContextTracker()
    t.callbacks.FunctionDeclaration?.({ id: { name: 'Outer' } })
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks.FunctionDeclaration?.({ id: { name: 'Inner' } })
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks['FunctionDeclaration:exit']?.({ id: { name: 'Inner' } })
    expect(t.isInComponentOrHook()).toBe(true)
    t.callbacks['FunctionDeclaration:exit']?.({ id: { name: 'Outer' } })
    expect(t.isInComponentOrHook()).toBe(false)
  })
})
