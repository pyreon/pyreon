// ============================================================================
// `@pyreon/attrs` native FRONTEND — the chainable default-prop HOC onto native.
//
//   const Row = attrs({ name: 'Row', component: Element })
//     .attrs({ direction: 'rows', gap: 'md' })
//   // <Row padding={4}> → <Element direction='rows' gap='md' padding={4}>
//
// attrs is the composition foundation `@pyreon/rocketstyle` builds on: a
// `.attrs({ … })` chain accumulates DEFAULT props over a base component. This
// frontend captures (base, merged-default-attrs) and the emit rewrites each
// `<X …use-site>` to `<Base …defaults …use-site>` (use-site wins), then the base
// lowers via the canonical / Element path. Mirrors the styled(Prim) frontend —
// styled injects a `style`; attrs injects default attrs.
//
// SCOPE (v1): a base that is a CANONICAL primitive or `@pyreon/elements` Element;
// LITERAL default-attr values (theme tokens resolve like everywhere else). The
// callback form `.attrs((props) => ({ … }))` (dynamic, reads props) + `.config`
// (base swap) / `.statics` / `.compose` are walked-through / dropped — v1.
// ============================================================================

import { isCanonicalPrimitive } from './canonical-primitives'
import { isElementsPrimitive } from './elements-native'
import { resolveThemeToken, type ThemeTable } from './theme-native'
import type { AttrsComponentIR, ExprIR } from './types'

export type { AttrsComponentIR }

// oxc AST walked loosely, matching the sibling native frontends.
// oxlint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any

const TS_WRAPPERS = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion',
  'TSNonNullExpression',
  'TSInstantiationExpression',
  'ParenthesizedExpression',
])

function unwrap(node: AnyNode | undefined): AnyNode | undefined {
  let cur = node
  for (let i = 0; i < 20 && cur; i++) {
    if (!TS_WRAPPERS.has(cur.type)) return cur
    cur = cur.expression
  }
  return cur
}

/** Extract the `component:` field (a primitive identifier / string) from the
 *  head `attrs({ name, component })` config object. */
function readComponentField(cfg: AnyNode): string | null {
  if (!cfg || cfg.type !== 'ObjectExpression') return null
  for (const p of (cfg.properties as AnyNode[]) ?? []) {
    if (p.type !== 'Property' && p.type !== 'ObjectProperty') continue
    if (p.key?.name === 'component' || p.key?.value === 'component') {
      const v = unwrap(p.value)
      if (v?.type === 'Identifier') return v.name as string
      if (v?.type === 'Literal' && typeof v.value === 'string') return v.value as string
    }
  }
  return null
}

/**
 * Parse `const X = attrs({ name, component: Base }).attrs({ … })…` from a
 * var-declarator `init`. Returns null if it isn't an attrs chain over a
 * canonical / Element base (a warning is pushed for a non-primitive base).
 */
export function parseAttrsDefn(
  name: string,
  init: AnyNode | undefined,
  warnings: string[],
  theme: ThemeTable,
): AttrsComponentIR | null {
  // Walk the chain bottom-up, collecting `.attrs({ … })` objects (chain order).
  const attrObjs: AnyNode[] = []
  let cur: AnyNode | undefined = unwrap(init)
  let head: AnyNode | undefined
  while (cur && cur.type === 'CallExpression') {
    const callee = unwrap(cur.callee)
    if (callee?.type === 'Identifier' && callee.name === 'attrs') {
      head = cur // `attrs({ name, component })` — the base config
      break
    }
    if (callee?.type !== 'MemberExpression') return null
    const method = callee.property?.name as string | undefined
    if (method === 'attrs') attrObjs.unshift(unwrap((cur.arguments as AnyNode[])?.[0]))
    // .config / .statics / .compose — walked through (v1 ignores them).
    cur = unwrap(callee.object)
  }
  if (!head) return null

  const base = readComponentField(unwrap((head.arguments as AnyNode[])?.[0]))
  if (base === null) return null
  if (!isCanonicalPrimitive(base) && !isElementsPrimitive(base)) {
    warnings.push(
      `attrs({ component: ${base} }) on '${name}': only a CANONICAL @pyreon/primitives base ` +
        `(Stack/Text/Button/…) or @pyreon/elements Element lowers to native — '${base}' has no native ` +
        `primitive, so <${name}> was left unresolved.`,
    )
    return null
  }

  // Merge the default attrs across the chain (later `.attrs()` wins).
  const merged = new Map<string, ExprIR>()
  const dropped: string[] = []
  for (const obj of attrObjs) {
    if (!obj || obj.type !== 'ObjectExpression') {
      // A callback `.attrs((p) => …)` or non-literal — not lowered in v1.
      if (obj) dropped.push('(dynamic)')
      continue
    }
    for (const p of (obj.properties as AnyNode[]) ?? []) {
      if ((p.type !== 'Property' && p.type !== 'ObjectProperty') || p.computed) continue
      const key = p.key?.name ?? p.key?.value
      if (typeof key !== 'string') continue
      const v = unwrap(p.value)
      if (v?.type === 'Literal' && (typeof v.value === 'string' || typeof v.value === 'number')) {
        merged.set(key, { kind: 'literal', value: v.value })
      } else if (v?.type === 'UnaryExpression' && v.operator === '-' && v.argument?.type === 'Literal') {
        merged.set(key, { kind: 'literal', value: -Number(v.argument.value) })
      } else {
        const tok = resolveThemeToken(v, theme)
        if (tok !== null) merged.set(key, { kind: 'literal', value: tok })
        else dropped.push(key)
      }
    }
  }
  if (dropped.length > 0) {
    warnings.push(
      `attrs(...) '${name}': default attr value(s) [${dropped.join(', ')}] are dynamic / non-literal — ` +
        `only literal + theme-token default attrs lower to native (dropped).`,
    )
  }

  return {
    name,
    tag: base,
    defaultAttrs: [...merged.entries()].map(([n, value]) => ({ name: n, value })),
  }
}
