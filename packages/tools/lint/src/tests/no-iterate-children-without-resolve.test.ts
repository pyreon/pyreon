/**
 * Tests for `pyreon/no-iterate-children-without-resolve` — flags library /
 * component code that iterates `props.children` at the VNode level without
 * unwrapping a possible compiler-emitted accessor function.
 *
 * Detected anti-patterns (per-function scope):
 *   1. `cloneVNode(EXPR, …)` where EXPR ends with `.children`
 *   2. `Array.isArray(EXPR)` where EXPR ends with `.children`
 *   3. `EXPR.props` reads where EXPR ends with `.children`
 *
 * Acceptable mitigations (anywhere in the same function scope):
 *   - `resolveChildren(…)` call
 *   - `typeof X === 'function'` guard
 *
 * History: PR #731 + parallel top-level Stagger/Transition + Iterator
 * fixes. PR #732 added the compiler-side carve-out (skips wrap for
 * stable-reference component children). This rule is the defense-in-depth
 * layer for the CallExpression-shape that the compiler (correctly)
 * doesn't optimize.
 */
import { describe, expect, it } from 'vitest'
import type { LintConfig } from '../types'
import { noIterateChildrenWithoutResolve } from '../rules/reactivity/no-iterate-children-without-resolve'
import { lintFile } from '../runner'

const ON: LintConfig = {
  rules: { 'pyreon/no-iterate-children-without-resolve': 'error' },
}

function lint(source: string, filePath = 'src/Comp.tsx', config: LintConfig = ON) {
  return lintFile(filePath, source, [noIterateChildrenWithoutResolve], config)
}

function diagIds(result: ReturnType<typeof lintFile>): string[] {
  return result.diagnostics.map((d) => d.ruleId)
}

describe('pyreon/no-iterate-children-without-resolve', () => {
  // ── FIRES ────────────────────────────────────────────────────────────────
  describe('FIRES (vulnerable shapes without mitigation)', () => {
    it('cloneVNode(props.children, ...) without unwrap', () => {
      const result = lint(`
        const Transition = (props) => {
          return cloneVNode(props.children, { ref: mergedRef })
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('cloneVNode on a destructured-children-aliased binding without unwrap', () => {
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          return cloneVNode(own.children, { style: extraStyle })
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('(Array.isArray(props.children) ? props.children : [props.children]).filter(…) — iteration shape', () => {
      const result = lint(`
        const Iterator = (props) => {
          const childArray = (Array.isArray(props.children) ? props.children : [props.children]).filter(isVNode)
          return h('div', null, ...childArray)
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('variable-bound iteration: `const xs = (Array.isArray(X) ? X : [X]); xs.filter(…)`', () => {
      // Gap 2: bind the iteration-shape conditional to a variable, then
      // iterate later. The bug fires the same way as the inline form —
      // `[function].filter(…)` collapses to `[]`. Detection tracks the
      // binding via `boundIterationTargets` and flags the later
      // `NAME.METHOD(…)` call.
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          const xs = (Array.isArray(own.children) ? own.children : [own.children])
          const filtered = xs.filter(isVNode)
          return h('div', null, ...filtered)
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('variable-bound iteration: `const NAME = COND; NAME.map(...)` across statement boundaries', () => {
      // Same gap-2 shape with `.map(...)` and unparen'd binding.
      const result = lint(`
        const Iterator = (props) => {
          const [own] = splitProps(props, ['children'])
          const items = Array.isArray(own.children) ? own.children : [own.children]
          return h('ul', null, items.map((child) => h('li', null, child)))
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('variable-bound iteration with `resolveChildren` mitigation does NOT fire', () => {
      // The mitigation still works for the variable-bound shape because
      // it's checked against the underlying source path, not the binding.
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          const resolved = resolveChildren(own.children)
          const xs = (Array.isArray(resolved) ? resolved : [resolved])
          return h('div', null, ...xs.filter(isVNode))
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('iteration-pattern variable then `.filter()` later in the same scope', () => {
      // The risky shape is the `.METHOD(…)` call on a CONDITIONAL that
      // matches `Array.isArray(X) ? X : [X]`. Detection fires at the
      // inline `.METHOD(…)` call site — variable-bound + later-called
      // shapes are out of scope by construction (precision trade-off).
      // Library authors writing kinetic-shape code typically use the
      // inline form, which IS caught.
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          const childArray = (Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)
          return h('div', null, ...childArray)
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('reads .props on props.children (Transition shape)', () => {
      const result = lint(`
        const Transition = (props) => {
          const childProps = props.children.props ?? {}
          return h('div', { ...childProps })
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })
  })

  // ── DOES NOT FIRE ────────────────────────────────────────────────────────
  describe('DOES NOT FIRE (mitigation present)', () => {
    it('resolveChildren(…) call earlier in the same function', () => {
      const result = lint(`
        const Transition = (props) => {
          const child = resolveChildren(props.children)
          return cloneVNode(child, { ref: mergedRef })
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('inline typeof-function ternary unwrap', () => {
      const result = lint(`
        const Iterator = (props) => {
          const children = typeof props.children === 'function'
            ? props.children()
            : props.children
          if (Array.isArray(children)) {
            return children.map((c) => h('li', null, c))
          }
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('typeof guard somewhere in the function (even after risky use)', () => {
      // Per-function scope — mitigation anywhere in scope counts. The
      // canonical fix pattern unwraps at body entry, but this matches
      // any safe shape.
      const result = lint(`
        const Comp = (props) => {
          if (typeof props.children === 'function') return null
          return cloneVNode(props.children, { ref })
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('outer mitigation on `props.children` does NOT cover INNER inline-component\'s `innerProps.children`', () => {
      // Gap 3: mitigations track PER-SOURCE-PATH, not "any mitigation
      // anywhere in scope chain." Outer resolves `props.children` →
      // `unwrappedSources = {'props.children'}` + `safeIdents = {'child'}`.
      // Inner inline-defined component receives its OWN `innerProps` arg;
      // `innerProps.children` is a DIFFERENT source path that the outer
      // mitigation doesn't cover. Inner's `cloneVNode(innerProps.children, …)`
      // MUST be flagged — the function-shape bug fires per-prop-source,
      // not per-component-tree.
      const result = lint(`
        const Outer = (props) => {
          const child = resolveChildren(props.children)
          const Inner = (innerProps) => cloneVNode(innerProps.children, { ref })
          return Inner({})
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('mitigation inherits through nested function scope (Iterator shape)', () => {
      // The canonical Iterator pattern: outer Component unwraps at body
      // entry, inner helper arrow does the iteration. The whole chain
      // is safe — the inner uses the OUTER's resolved value via closure
      // capture, NOT a fresh prop. Tracked via inherited scope state.
      //
      // Trade-off: this also matches the rarer "Outer unwraps, Inner
      // takes its own props and iterates THOSE" shape. Accepting the
      // false negative for that case keeps the canonical Iterator
      // pattern false-positive-free.
      const result = lint(`
        const Iterator = (props) => {
          const children = typeof props.children === 'function'
            ? props.children()
            : props.children
          const renderChildren = () => {
            if (Array.isArray(children)) {
              return children.map((c) => h('li', null, c))
            }
            return null
          }
          return renderChildren()
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })
  })

  // ── DOES NOT FIRE (non-children patterns) ────────────────────────────────
  describe('DOES NOT FIRE (unrelated patterns)', () => {
    it('cloneVNode on a NON-children expression', () => {
      const result = lint(`
        const Wrapper = (props) => {
          const v = props.value
          return cloneVNode(v, { ref })
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('Array.isArray on a NON-children expression', () => {
      const result = lint(`
        const Comp = (props) => {
          if (Array.isArray(props.items)) {
            return props.items.map((x) => h('li', null, x))
          }
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('Reading .props on a non-children expression', () => {
      const result = lint(`
        const Comp = (props) => {
          const merged = (props.other.props ?? {})
          return h('div', merged)
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('Component passes children through to DOM element (mountChild handles function)', () => {
      // `<div>{props.children}</div>` is SAFE — mountChild's function
      // branch routes through mountReactive. No iteration, no clone, no
      // .props read — the bug class doesn't fire here.
      const result = lint(`
        const Wrapper = (props) => {
          return h('div', null, props.children)
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('spread pass-through via h() rest args is safe (mountChild handles function children)', () => {
      // `h(Fragment, null, ...(Array.isArray(props.children) ? props.children : [props.children]))`
      // The spread context flattens — h() passes each child to mountChild
      // which handles function children correctly via mountReactive.
      // This is `zero/zero/src/app.ts:DefaultLayout` and `styler/styled.tsx`
      // shape. Must NOT fire to avoid noise on framework infrastructure.
      const result = lint(`
        const DefaultLayout = (props) => {
          return h(Fragment, null, ...(Array.isArray(props.children) ? props.children : [props.children]))
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('IfStatement (not ConditionalExpression) iteration shape — not flagged', () => {
      // `if (Array.isArray(children)) return children` is a control-flow
      // statement, not the inline `? :` iteration shape. Used by framework
      // primitives (`Dynamic`, `Show`/`Switch`) that receive children via
      // direct h() rest args (no compiler wrap reaches them). Out of
      // scope by construction.
      const result = lint(`
        const Dynamic = (props) => {
          const { children, ...rest } = props
          if (Array.isArray(children)) {
            return h(props.component, rest, ...children)
          }
          return h(props.component, rest, children)
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('conditional with non-bare consequent (not the iteration shape) — not flagged', () => {
      // `Array.isArray(children) ? children.flatMap(…) : ...` is a
      // domain-specific transform, not the iteration-bug shape. The
      // consequent doing `.flatMap` already means iteration via the
      // first branch only — not the `[children]` fallback case the bug
      // depends on.
      const result = lint(`
        function normalizeChildren(children) {
          return Array.isArray(children) ? children.flatMap(normalizeChildren) : children
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })
  })

  // ── REAL-WORLD SHAPES (must FIRE without mitigation) ─────────────────────
  describe('FIRES on real-world bug shapes (PR #731 + audit findings)', () => {
    it('kinetic Stagger.tsx pattern (Array.isArray + isVNode filter)', () => {
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          const childArray = (Array.isArray(own.children) ? own.children : [own.children]).filter(isVNode)
          return h('div', null, ...childArray)
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('kinetic Transition.tsx pattern (childProps reads + cloneVNode)', () => {
      const result = lint(`
        const Transition = (props) => {
          const childProps = (props.children.props ?? {})
          const merged = mergeStyles(childProps.style, { display: 'none' })
          return cloneVNode(props.children, { ref, style: merged })
        }
      `)
      expect(diagIds(result)).toContain('pyreon/no-iterate-children-without-resolve')
    })

    it('FIXED kinetic Stagger after resolveChildren unwrap does NOT fire', () => {
      const result = lint(`
        const Stagger = (props) => {
          const [own] = splitProps(props, ['children'])
          const resolved = resolveChildren(own.children)
          const childArray = (Array.isArray(resolved) ? resolved : [resolved]).filter(isVNode)
          return h('div', null, ...childArray)
        }
      `)
      expect(diagIds(result)).not.toContain('pyreon/no-iterate-children-without-resolve')
    })
  })
})
