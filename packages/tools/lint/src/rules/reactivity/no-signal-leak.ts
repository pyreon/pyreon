import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'

export const noSignalLeak: Rule = {
  meta: {
    id: 'pyreon/no-signal-leak',
    category: 'reactivity',
    description: 'Warn about unused signal declarations (potential leaks).',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    const signalDecls = new Map<
      string,
      { span: { start: number; end: number }; declStart: number; declEnd: number }
    >()
    const identifierOccurrences = new Map<string, Array<{ start: number; end: number }>>()
    // Names that are EXPORTED are consumed by other modules — a per-file walker
    // can't see those usages, so it must not report them as "unused". The
    // canonical `export const counter = signal(0)` module-level store signal is
    // exactly this shape. (oxc passes no parent, so pre-mark via the export
    // node — same idiom other rules use.)
    const exportedNames = new Set<string>()

    const callbacks: VisitorCallbacks = {
      ExportNamedDeclaration(node: any) {
        // `export const x = signal(...)` — declaration form
        const decl = node.declaration
        if (decl && decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations ?? []) {
            if (d.id?.type === 'Identifier') exportedNames.add(d.id.name)
          }
        }
        // `export { x }` / `export { x as y }` — specifier form (local name)
        for (const spec of node.specifiers ?? []) {
          if (spec.local?.type === 'Identifier') exportedNames.add(spec.local.name)
        }
      },
      VariableDeclarator(node: any) {
        const init = node.init
        if (!init || !isCallTo(init, 'signal')) return
        const id = node.id
        if (!id || id.type !== 'Identifier') return
        signalDecls.set(id.name, {
          span: getSpan(node),
          declStart: id.start as number,
          declEnd: id.end as number,
        })
      },
      Identifier(node: any) {
        const name: string = node.name
        const existing = identifierOccurrences.get(name)
        if (existing) {
          existing.push({ start: node.start as number, end: node.end as number })
        } else {
          identifierOccurrences.set(name, [
            { start: node.start as number, end: node.end as number },
          ])
        }
      },
      'Program:exit'() {
        for (const [name, { span, declStart, declEnd }] of signalDecls) {
          if (exportedNames.has(name)) continue // consumed cross-module
          const occurrences = identifierOccurrences.get(name) ?? []
          // Filter out the declaration identifier itself
          const usages = occurrences.filter((o) => o.start !== declStart || o.end !== declEnd)
          if (usages.length === 0) {
            context.report({
              message: `Signal \`${name}\` is declared but never used — this may be a signal leak.`,
              span,
            })
          }
        }
      },
    }
    return callbacks
  },
}
