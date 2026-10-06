/**
 * JSX-VALUED attributes (`fallback={<Text/>}`) and what the native emitters do
 * with them.
 *
 * A JSX-valued attribute is a VIEW slot, and a view slot the emitter does not
 * read vanishes without a trace: the dedicated emitters look attrs up BY NAME
 * (`attrs.find(a => a.name === 'when')`), so an attribute nobody asks for is
 * simply never seen. `<Show when fallback={<Text>…</Text>}>` shipped that way —
 * the `if` branch was emitted, the `fallback` never read, `warnings: []`, and
 * the screen started EMPTY for the very state the fallback exists to cover.
 *
 * Two things live here so both emitters agree:
 *
 *  1. `SLOT_ATTRS` — the closed set of (builtin tag, JSX-valued attr) pairs an
 *     emitter CONSUMES. Anything else carrying a JSX value on a builtin tag is
 *     reported by `unconsumedSlotWarning` instead of vanishing. User components
 *     are exempt: their view-typed props lower as `@ViewBuilder` / `@Composable`
 *     parameters (render-slots.ts), which IS consumption.
 *  2. `classifyFallback` — the single reading of a `fallback` attribute, so
 *     `<Show>`, `<Suspense>` and `<ErrorBoundary>` accept and reject the same
 *     shapes and name them the same way.
 */

import type { AttrIR, ChildIR, ExprIR } from './types'

/** Builtin tag → the JSX-valued attributes its emitter reads. */
const SLOT_ATTRS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['Show', new Set(['fallback'])],
  ['Suspense', new Set(['fallback'])],
  ['ErrorBoundary', new Set(['fallback'])],
])

function isJsxValue(e: ExprIR): boolean {
  if (e.kind === 'jsx-element' || e.kind === 'jsx-fragment') return true
  // `fallback={() => <Text/>}` — an accessor returning a view.
  return e.kind === 'arrow' && e.params.length === 0 && (e.stmts === undefined || e.stmts.length === 0) && isJsxValue(e.body)
}

/**
 * The warning for a JSX-valued attribute no native emitter reads, or
 * `undefined` when the pair is consumed (or the value is not a view).
 */
export function unconsumedSlotWarning(tag: string, attr: AttrIR): string | undefined {
  if (attr.kind !== 'attr' || !isJsxValue(attr.value)) return undefined
  if (SLOT_ATTRS.get(tag)?.has(attr.name) === true) return undefined
  return (
    `<${tag} ${attr.name}={<…/>}>: the JSX-valued \`${attr.name}\` attribute has NO native (iOS/Android) lowering — it is DROPPED, ` +
    `so the view it describes never renders on device while the web build shows it. ` +
    `Place the view as a child of the element (or of a \`<Show>\`/ternary) instead, or use an explicit ` +
    `\`<NativeIOS>\` / \`<NativeAndroid>\` branch.`
  )
}

export type FallbackPlan =
  | { readonly kind: 'none' }
  /** `children` is what the else-branch emits: a fragment's own children (never the fragment as ONE child, which would stringify it), else the single element. */
  | { readonly kind: 'view'; readonly children: readonly ChildIR[] }
  | { readonly kind: 'unsupported'; readonly warning: string }

/**
 * Read a boundary's `fallback` attribute. A JSX element/fragment, or a
 * zero-arg accessor returning one, lowers; absent / `null` / `undefined` means
 * "no fallback"; anything else cannot be lowered to a static else-branch and is
 * NAMED rather than dropped.
 */
export function classifyFallback(tag: string, attrs: readonly AttrIR[]): FallbackPlan {
  const attr = attrs.find((a) => a.kind === 'attr' && a.name === 'fallback')
  if (attr === undefined || attr.kind !== 'attr') return { kind: 'none' }
  let v = attr.value
  if (v.kind === 'arrow' && v.params.length === 0 && (v.stmts === undefined || v.stmts.length === 0)) v = v.body
  if (v.kind === 'jsx-fragment') return { kind: 'view', children: v.children }
  if (v.kind === 'jsx-element') return { kind: 'view', children: [{ kind: 'expr', expr: v }] }
  if (v.kind === 'literal' && v.value === null) return { kind: 'none' }
  if (v.kind === 'identifier' && v.name === 'undefined') return { kind: 'none' }
  const shape =
    v.kind === 'identifier'
      ? `the binding \`${v.name}\``
      : v.kind === 'literal'
        ? `the literal ${JSON.stringify(v.value)}`
        : `a \`${v.kind}\` expression`
  return {
    kind: 'unsupported',
    warning:
      `<${tag} fallback={…}>: only a JSX literal (\`fallback={<Text>…</Text>}\`) or an accessor returning one lowers to native — ` +
      `${shape} is DROPPED, so the fallback never renders on device. Inline the JSX, or branch explicitly with a ternary / a second \`<Show>\`.`,
  }
}
