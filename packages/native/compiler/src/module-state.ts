/**
 * Module-scope `signal()` / `computed()` — a file's SHARED reactive state.
 *
 * On the web a top-level `const count = signal(0)` is one value every component and helper in the file reads and
 * writes. It used to be skipped with a warning, and every read of it then failed the native build. It now lowers to
 * one observable singleton per file — Swift an `@Observable final class PyreonModuleState… { static let shared }`,
 * Kotlin an `object PyreonModuleState… { var count by mutableStateOf(…) }` — the same shape `defineStore` state takes,
 * so SwiftUI / Compose re-render whatever reads it. Every read and write of the name, in a component, a handler, a
 * helper or the state's own computeds, goes through that singleton (unless a local of the same name shadows it).
 *
 * The singleton's name carries the file's suffix (the one synthesized structs use), so two files of one app target
 * never declare the same type.
 */
import { synthStructSuffix } from './expr-utils'
import type { DeclIR, ModuleDeclIR } from './types'

/** Whether a module declaration is reactive module state rather than a plain binding. */
export function isModuleState(md: ModuleDeclIR): boolean {
  return md.reactive !== undefined
}

/** The module state as the component-shaped declarations inference already understands. */
export function moduleStateDecls(mds: readonly ModuleDeclIR[]): DeclIR[] {
  const out: DeclIR[] = []
  for (const md of mds) {
    if (md.reactive?.kind === 'signal') out.push({ kind: 'signal', name: md.name, type: md.type, initial: md.initial })
    else if (md.reactive?.kind === 'computed') out.push({ kind: 'computed', name: md.name, expr: md.initial })
  }
  return out
}

/** The per-file singleton's type name. */
export function moduleStateClassName(): string {
  return `PyreonModuleState${synthStructSuffix()}`
}

/** The names a component (or helper) binds itself, which shadow module state of the same name. */
export function shadowingNames(decls: readonly DeclIR[], props: readonly { name: string }[]): Set<string> {
  const out = new Set<string>()
  for (const d of decls) {
    const name = (d as { name?: unknown }).name
    if (typeof name === 'string') out.add(name)
  }
  for (const p of props) out.add(p.name)
  return out
}
