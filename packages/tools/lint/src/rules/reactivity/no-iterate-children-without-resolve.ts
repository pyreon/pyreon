import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'

/**
 * Flag library / component code that iterates JSX children at the VNode
 * level — `cloneVNode(children, …)`, `Array.isArray(children) ? children
 * : [children].map(…)`, or reads `.props` on `children` — WITHOUT first
 * unwrapping the possible compiler-emitted accessor wrap.
 *
 * Background — the bug class
 *
 * The Pyreon vite-plugin's prop-inlining pass rewrites
 * `<Comp>{children}</Comp>` (where `children` is a local `const` derived
 * from a getter — typically `const children = childHolder.children`
 * after `splitProps`) as `Comp({ ..., children: () => h.children })`.
 * Receiving components see `props.children` as a FUNCTION instead of
 * the expected `VNode | VNode[]`.
 *
 * DOM-consuming code routes through `mountChild` which handles function
 * children correctly via `mountReactive`, so the wrap is invisible
 * there. Libraries that iterate children at the VNode level
 * (kinetic's StaggerRenderer / Stagger / GroupRenderer, elements'
 * Iterator) or `cloneVNode` them directly (kinetic's TransitionItem /
 * top-level Transition) are silently broken — the function spread
 * produces `{type: undefined}` and the DOM renders literal
 * `<undefined>` tags.
 *
 * PR #732 added a compiler carve-out that emits stable references bare
 * (no wrap) when the JSX parent is a component. That fixes the OUTER
 * pass-through pattern. CallExpression-shaped children (`{cloneVNode(x,
 * {style})}` inside a renderer's JSX) still wrap because they're not
 * stable references — and that's where the library-side bug surfaces.
 *
 * Detected shapes
 *
 *   1. `cloneVNode(EXPR, …)` where EXPR resolves through `.children`
 *      — ALWAYS risky. No safe variant.
 *
 *   2. `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)` where METHOD
 *      is `filter` / `map` / `forEach` / `reduce` / `every` / `some` —
 *      VNode-level iteration. Differs from the pass-through pattern
 *      `...(Array.isArray(EXPR) ? EXPR : [EXPR])` (spread into h() rest
 *      args) which is SAFE because mountChild handles function children.
 *
 *   3. `EXPR.props` reads where EXPR ends with `.children` — reads
 *      `function.props` (undefined) and silently breaks the merge-ref
 *      pattern (kinetic Transition.tsx).
 *
 * Acceptable mitigations (anywhere in the same OR ancestor function scope)
 *
 *   - `resolveChildren(EXPR)` call — marks `exprKey(EXPR)` as unwrapped.
 *   - `typeof EXPR === 'function' ? EXPR() : EXPR` ternary — marks
 *     `exprKey(EXPR)` as unwrapped.
 *   - `typeof EXPR === 'function'` guard anywhere — marks `exprKey(EXPR)`
 *     as unwrapped (covers `if (typeof X === 'function') return …`).
 *   - `const NAME = <mitigation expression>` — marks `NAME` as a
 *     safe-aliased identifier; downstream `NAME.METHOD(…)` is safe.
 *
 * Mitigation INHERITS through nested function scopes. Iterator's outer
 * Component unwraps `rawChildren` and a nested `renderChildren` arrow
 * does the `Array.isArray(children)` iteration — the inner scope sees
 * the outer's mitigation via inheritance, no false positive.
 *
 * Out of scope (deliberate)
 *
 *   - Pass-through patterns: `...(Array.isArray(EXPR) ? EXPR : [EXPR])`
 *     SpreadElement → mountChild handles function children via
 *     mountReactive. Filtered out at the call-site check by requiring
 *     a `.METHOD(…)` member access parent.
 *   - Different-prop-in-inner-component shape: if an outer component
 *     unwraps `props.children` and an INNER component-inline iterates
 *     `innerProps.children`, the rule treats the outer mitigation as
 *     covering the inner. False negative, but rare and benign — the
 *     inner is structurally distinct enough to warrant explicit
 *     handling anyway.
 *
 * History
 *
 *   - PR #731 — kinetic library-side fix for StaggerRenderer + TransitionItem.
 *   - PR #732 — compiler-side carve-out for stable references.
 *   - This rule (PR #?) — defense-in-depth + audit catch
 *     (3 vulnerable parallel sites found and fixed in the same PR:
 *     kinetic top-level Stagger.tsx, kinetic top-level Transition.tsx,
 *     elements Iterator).
 */

interface ScopeFrame {
  risky: Array<{ kind: 'cloneVNode' | 'isArray' | 'props-access'; expr: string; node: any }>
  /** Source paths known to be unwrapped (`exprKey` of the source). */
  unwrappedSources: Set<string>
  /** Root identifiers known to alias the resolved value (e.g. `const child = …`). */
  safeIdents: Set<string>
}

/** Stable string key for an expression — covers Identifier and MemberExpression chains. */
function exprKey(node: any): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression' && !node.computed) {
    const objKey = exprKey(node.object)
    const propName = node.property?.name
    if (objKey && propName) return `${objKey}.${propName}`
  }
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return exprKey(node.expression)
  }
  return null
}

/** Root identifier of an expression chain — `props.x.y` → `'props'`. */
function rootIdent(node: any): string | null {
  if (!node) return null
  if (node.type === 'Identifier') return node.name
  if (node.type === 'MemberExpression') return rootIdent(node.object)
  if (
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSTypeAssertion' ||
    node.type === 'ParenthesizedExpression'
  ) {
    return rootIdent(node.expression)
  }
  return null
}

/** Path ends with `.children` (or IS bare `children`). */
function endsWithChildren(node: any): boolean {
  const key = exprKey(node)
  if (!key) return false
  return key === 'children' || key.endsWith('.children')
}

/** Array-iteration methods that read each element as a value (treats as VNode). */
const ITER_METHODS = new Set(['filter', 'map', 'forEach', 'reduce', 'every', 'some', 'find', 'findIndex', 'flatMap'])

/**
 * Match `Array.isArray(EXPR) ? EXPR : [EXPR]` where EXPR ends with
 * `.children`. Returns the EXPR's key on match, or null. Both legs must
 * be structurally bare — anything else (`: x.flatMap(…)`, `: x.slice()`)
 * isn't the bug shape.
 */
function matchArrayIsArrayChildrenTernary(
  cond: any,
): { key: string } | null {
  if (!cond || cond.type !== 'ConditionalExpression') return null
  const test = cond.test
  if (test?.type !== 'CallExpression') return null
  const testCallee = test.callee
  if (
    testCallee?.type !== 'MemberExpression' ||
    testCallee.object?.type !== 'Identifier' ||
    testCallee.object.name !== 'Array' ||
    testCallee.property?.name !== 'isArray'
  )
    return null
  const testArgs = test.arguments ?? []
  if (testArgs.length !== 1) return null
  const testArg = testArgs[0]
  if (!endsWithChildren(testArg)) return null
  const testArgKey = exprKey(testArg)
  if (!testArgKey) return null
  if (exprKey(cond.consequent) !== testArgKey) return null
  const alt = cond.alternate
  if (alt?.type !== 'ArrayExpression') return null
  const altElems = alt.elements ?? []
  if (altElems.length !== 1) return null
  if (exprKey(altElems[0]) !== testArgKey) return null
  return { key: testArgKey }
}

export const noIterateChildrenWithoutResolve: Rule = {
  meta: {
    id: 'pyreon/no-iterate-children-without-resolve',
    category: 'reactivity',
    description:
      'Library code that iterates `props.children` at the VNode level (`cloneVNode(children, …)`, `(Array.isArray(children) ? children : [children]).map/filter(…)`, or `children.props`) must first unwrap a possible compiler-emitted accessor function — call `resolveChildren(…)` or `typeof X === "function" ? X() : X` at the body entry. Without it, the Pyreon compiler\'s prop-inlining wrap silently produces `{type: undefined}` → `<undefined>` DOM tags.',
    severity: 'error',
    fixable: false,
  },
  create(context) {
    const stack: ScopeFrame[] = []

    /** Is the path `key` (or its root ident) covered by any scope's mitigation? */
    const isCovered = (key: string | null): boolean => {
      if (!key) return false
      const root = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
      for (const frame of stack) {
        if (frame.unwrappedSources.has(key)) return true
        if (frame.safeIdents.has(root)) return true
      }
      return false
    }

    const enter = () => {
      stack.push({ risky: [], unwrappedSources: new Set(), safeIdents: new Set() })
    }

    const exit = () => {
      const scope = stack.pop()
      if (!scope) return
      for (const site of scope.risky) {
        // Recheck mitigation at exit (sources/safeIdents may have been
        // added after the risky site visited but before scope-exit).
        if (isCoveredAfterExit(site.expr, scope)) continue
        const sourceHint =
          site.kind === 'cloneVNode'
            ? `cloneVNode(${site.expr}, …)`
            : site.kind === 'isArray'
              ? `(Array.isArray(${site.expr}) ? ${site.expr} : [${site.expr}]).METHOD(…)`
              : `${site.expr}.props`

        context.report({
          message:
            `Iterating children at the VNode level (\`${sourceHint}\`) without first ` +
            `unwrapping a compiler-emitted accessor function. The Pyreon vite-plugin's ` +
            `prop-inlining pass rewrites \`<Comp>{children}</Comp>\` as ` +
            `\`Comp({ children: () => x.children })\` — your code receives a FUNCTION ` +
            `instead of the expected \`VNode | VNode[]\`, and the spread/clone/iteration ` +
            `produces \`{type: undefined}\` → \`<undefined>\` DOM tags. ` +
            `Add at the function entry: ` +
            `\`const child = typeof ${site.expr} === 'function' ? ${site.expr}() : ${site.expr}\` ` +
            `(or import \`resolveChildren\` from \`@pyreon/kinetic/utils\` if depending on kinetic). ` +
            `Then use \`child\` instead of \`${site.expr}\` below.`,
          span: getSpan(site.node as { start: number; end: number }),
        })
      }
    }

    /** Same as isCovered, but checks the popped scope's sets too. */
    const isCoveredAfterExit = (key: string, popped: ScopeFrame): boolean => {
      const root = key.includes('.') ? key.slice(0, key.indexOf('.')) : key
      if (popped.unwrappedSources.has(key)) return true
      if (popped.safeIdents.has(root)) return true
      for (const frame of stack) {
        if (frame.unwrappedSources.has(key)) return true
        if (frame.safeIdents.has(root)) return true
      }
      return false
    }

    /** Detect the inline unwrap ternary: `typeof X === 'function' ? X() : X`. */
    const detectInlineUnwrap = (cond: any): string | null => {
      if (!cond || cond.type !== 'BinaryExpression') return null
      const isTypeofEq =
        (cond.operator === '===' || cond.operator === '==') &&
        ((cond.left?.type === 'UnaryExpression' && cond.left.operator === 'typeof') ||
          (cond.right?.type === 'UnaryExpression' && cond.right.operator === 'typeof'))
      if (!isTypeofEq) return null
      const typeofSide = cond.left?.type === 'UnaryExpression' ? cond.left : cond.right
      const litSide = cond.left?.type === 'UnaryExpression' ? cond.right : cond.left
      const litValue =
        (litSide?.type === 'Literal' && litSide.value) ||
        (litSide?.type === 'StringLiteral' && litSide.value)
      if (litValue !== 'function') return null
      return exprKey(typeofSide.argument)
    }

    const callbacks: VisitorCallbacks = {
      Program: enter,
      'Program:exit': exit,
      FunctionDeclaration: enter,
      'FunctionDeclaration:exit': exit,
      FunctionExpression: enter,
      'FunctionExpression:exit': exit,
      ArrowFunctionExpression: enter,
      'ArrowFunctionExpression:exit': exit,

      // Mitigation tracking — typeof guards (anywhere in scope).
      BinaryExpression(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return
        const key = detectInlineUnwrap(node)
        if (key) scope.unwrappedSources.add(key)
      },

      // Mitigation tracking — `const X = resolveChildren(EXPR)` /
      // `const X = typeof Y === 'function' ? Y() : Y`. Adds X to
      // safeIdents AND EXPR/Y to unwrappedSources.
      VariableDeclarator(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return
        if (node.id?.type !== 'Identifier') return
        const name = node.id.name
        const init = node.init
        if (!init) return

        // `const X = resolveChildren(EXPR)`
        if (
          init.type === 'CallExpression' &&
          init.callee?.type === 'Identifier' &&
          init.callee.name === 'resolveChildren' &&
          init.arguments?.length >= 1
        ) {
          scope.safeIdents.add(name)
          const sourceKey = exprKey(init.arguments[0])
          if (sourceKey) scope.unwrappedSources.add(sourceKey)
          return
        }

        // `const X = typeof Y === 'function' ? Y() : Y`
        if (init.type === 'ConditionalExpression') {
          const unwrappedKey = detectInlineUnwrap(init.test)
          if (unwrappedKey) {
            scope.safeIdents.add(name)
            scope.unwrappedSources.add(unwrappedKey)
          }
        }
      },

      CallExpression(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return

        const callee = node.callee
        const args = node.arguments ?? []

        // Mitigation: `resolveChildren(EXPR)` call (not bound to a var)
        // still marks EXPR as unwrapped — sometimes used for side-effect
        // chains. Standalone calls without binding aren't the canonical
        // shape but still count.
        if (
          callee?.type === 'Identifier' &&
          callee.name === 'resolveChildren' &&
          args.length >= 1
        ) {
          const sourceKey = exprKey(args[0])
          if (sourceKey) scope.unwrappedSources.add(sourceKey)
        }

        // Risky 1: `cloneVNode(EXPR, …)` where EXPR ends with `.children`.
        // Always reported; no safe variant.
        if (
          callee?.type === 'Identifier' &&
          callee.name === 'cloneVNode' &&
          args.length >= 1 &&
          endsWithChildren(args[0])
        ) {
          const key = exprKey(args[0]) ?? '<expr>'
          if (!isCovered(key)) {
            scope.risky.push({ kind: 'cloneVNode', expr: key, node: args[0] })
          }
        }

        // Risky 2: `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)` —
        // VNode iteration. Detect at the call site so we explicitly
        // require the iteration intent. Spread context (`...COND`)
        // doesn't have a METHOD member call, so it's naturally excluded
        // — no parent-pointer dance needed.
        if (
          callee?.type === 'MemberExpression' &&
          callee.property?.type === 'Identifier' &&
          ITER_METHODS.has(callee.property.name as string)
        ) {
          // Unwrap parens — oxc preserves source-level `()` as
          // `ParenthesizedExpression`. `(COND).filter(…)` parses with
          // `callee.object` being `ParenthesizedExpression` wrapping
          // the conditional, not the conditional directly.
          let obj = callee.object
          while (obj?.type === 'ParenthesizedExpression') obj = obj.expression
          if (obj?.type === 'ConditionalExpression') {
            const condInfo = matchArrayIsArrayChildrenTernary(obj)
            if (condInfo && !isCovered(condInfo.key)) {
              scope.risky.push({ kind: 'isArray', expr: condInfo.key, node: obj })
            }
          }
        }
      },

      // Risky 2: `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)` —
      // iteration. Detect at the OUTER member-call level so we can check
      // the conditional's shape AND the method name in one pass.
      // (Iteration-shape detection lives at the call-site CallExpression
      // visitor below — `(Array.isArray(EXPR) ? EXPR : [EXPR]).METHOD(…)`.
      // Detecting at the iteration-method call site avoids any AST-visit-
      // order dependency on parent context — the iteration intent is
      // explicit at the call.)

      // Risky 3: `EXPR.props` reads where EXPR ends with `.children`.
      // Pattern from Transition.tsx fix.
      MemberExpression(node: any) {
        const scope = stack[stack.length - 1]
        if (!scope) return
        if (node.computed) return
        if (node.property?.name !== 'props') return
        if (!endsWithChildren(node.object)) return
        const key = exprKey(node.object) ?? '<expr>'
        if (isCovered(key)) return
        scope.risky.push({ kind: 'props-access', expr: key, node })
      },

    }

    return callbacks
  },
}

// Expose for tests (read by the bisect harness if needed).
export const _internal = {
  exprKey,
  rootIdent,
  endsWithChildren,
  matchArrayIsArrayChildrenTernary,
  ITER_METHODS,
}
