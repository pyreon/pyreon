// A JSX-returning helper CALLED as a function — `{row("a")}` where
// `const row = (x: string) => <Text>{x}</Text>`.
//
// The web supports this shape (the JS compiler recognises it as
// `jsxFnVars`/`isJsxHelperCall`). PMTC did not, and the failure was
// per-target and silent-in-the-worse-direction: Swift emitted
// `Text(verbatim: "\(row("a"))")` — a VIEW interpolated into a STRING, which
// COMPILES and renders the value's debug description — while Kotlin emitted
// `Text(text = "${row("a")}")` against a `fun row()` that takes no arguments,
// a hard build failure. One source, two different wrong answers, zero
// warnings.
//
// This module only DETECTS the shape and names it. Lowering it properly means
// emitting the helper as a view-returning function (`@ViewBuilder func` /
// `@Composable fun`) and calling it in view position — a real feature, and
// more than the surrounding fix should carry. What is NOT acceptable either
// way is interpolating a View into a string, so the emitters substitute an
// empty view and say so by name.

import type { ExprIR, ComponentIR, DeclIR, ModuleDeclIR } from './types'
import { exprContainsJsx } from './expr-utils'

/**
 * In-file bindings whose VALUE is a function that returns JSX: the file's
 * components, plus any `const x = (…) => <jsx/>` declared at component scope
 * (those lower to a plain closure, not a component, so `_componentNames`
 * cannot see them).
 */
export function collectJsxFnNames(
  components: readonly ComponentIR[],
  decls: readonly DeclIR[] = [],
  moduleDecls: readonly ModuleDeclIR[] = [],
): Set<string> {
  const names = new Set(components.map((c) => c.name))
  const add = (name: string, e: ExprIR | undefined): void => {
    if (e === undefined || e.kind !== 'arrow') return
    if (exprContainsJsx(e)) names.add(name)
  }
  for (const d of decls) if (d.kind === 'value') add(d.name, d.expr)
  // FILE-scope `const row = (x) => <Text/>` lives here, not in a component's
  // decls — and it is the spelling people actually write, so missing it left
  // the detector answering only for the function-declaration form.
  for (const md of moduleDecls) add(md.name, md.initial)
  return names
}

/**
 * The helper NAME when `e` is a call to one of `names`, else null. Only a
 * bare identifier callee — a method call is a different shape and never this
 * idiom.
 */
export function jsxHelperCallName(e: ExprIR, names: ReadonlySet<string>): string | null {
  const inner = e.kind === 'paren' ? e.inner : e
  if (inner.kind !== 'call') return null
  if (inner.callee.kind !== 'identifier') return null
  return names.has(inner.callee.name) ? inner.callee.name : null
}

/** The named warning. Same text on both targets — one shape, one remedy. */
export function jsxHelperCallWarning(name: string, target: 'swift' | 'kotlin'): string {
  const empty = target === 'swift' ? 'an EmptyView()' : 'nothing'
  return (
    `\`${name}(…)\` calls a JSX-returning helper as a FUNCTION. That works on the web, ` +
    `but PMTC has no lowering for it — a View cannot be interpolated into a string, so ` +
    `${empty} is emitted in its place. Render it as an ELEMENT instead ` +
    `(\`<${name} … />\`, with the helper taking a single props object: ` +
    `\`function ${name}(props: { … }) { return <…/> }\`).`
  )
}
