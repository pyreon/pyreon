import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { isCompiledByPyreon } from '../../utils/compiled-by-pyreon'

function isComponentTag(name: string): boolean {
  return name.length > 0 && name[0] === name[0]?.toUpperCase() && name[0] !== name[0]?.toLowerCase()
}

/**
 * Warn when a known signal/computed is called in a component prop position in
 * a file the Pyreon compiler does NOT lower (a test file under vitest's JSX
 * transform, a compat project, a foreign `@jsxImportSource`). There the prop is
 * evaluated once at mount, so `<Comp x={sig()} />` passes a snapshot.
 *
 * In a compiled file the premise is false: the compiler emits `x={_rpd(sig)}`,
 * a reactive prop, and `x={sig()}` is the taught form
 * (`pyreon/consistent-signal-read`). The rule used to fire there too, and the
 * repo carried `pyreon-lint-disable` comments explaining that the compiler
 * wraps the read, which is how a rule trains people to write the bare form.
 */
export const noSignalInProps: Rule = {
  meta: {
    id: 'pyreon/no-signal-in-props',
    category: 'reactivity',
    description:
      'Signal call in a component prop in a file the Pyreon compiler does not lower (tests, compat projects) — the value is captured once. Compiled files are exempt: there the compiler makes the prop reactive.',
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    // Callee resolution (two-pass). Collect the names bound to `signal()` /
    // `computed()` in this file; only report a `<Comp prop={x()}>` when `x` is
    // one of them. Without this the rule flagged ANY call to a bare identifier
    // in an uppercase-tag prop — `String(v)`, `t(key)` (i18n), `humanize(id)`,
    // `buildColumnRegistry(...)` — none of which are signals (the finding
    // measured 48/74 flags as non-signals). Reporting is deferred to
    // Program:exit so a signal declared anywhere in the file (before OR after
    // the JSX) is resolved.
    const signalBindings = new Set<string>()
    const candidates: Array<{ name: string; tagName: string; span: { start: number; end: number } }> =
      []

    const callbacks: VisitorCallbacks = {
      VariableDeclarator(node: any) {
        const init = node.init
        if (!init || !(isCallTo(init, 'signal') || isCallTo(init, 'computed'))) return
        if (node.id?.type === 'Identifier') signalBindings.add(node.id.name)
      },
      JSXExpressionContainer(node: any) {
        const expr = node.expression
        if (!expr || expr.type !== 'CallExpression') return
        const callee = expr.callee
        if (!callee || callee.type !== 'Identifier') return

        const source = context.getSourceText()
        const start = node.start as number

        let i = start - 1
        while (i >= 0 && source[i] !== '<' && source[i] !== '>') i--
        if (i < 0 || source[i] !== '<') return

        const tagStart = i + 1
        let tagEnd = tagStart
        while (tagEnd < source.length && /[\w.]/.test(source[tagEnd] ?? '')) tagEnd++
        const tagName = source.slice(tagStart, tagEnd)

        if (!tagName || !isComponentTag(tagName)) return

        candidates.push({ name: callee.name, tagName, span: getSpan(expr) })
      },
      'Program:exit'() {
        if (candidates.length === 0) return
        if (isCompiledByPyreon(context.getFilePath(), context.getSourceText())) return
        for (const c of candidates) {
          if (!signalBindings.has(c.name)) continue // not a signal — the compiler's job / a pure call
          context.report({
            message: `Signal \`${c.name}()\` called in <${c.tagName}> prop — this file is not lowered by the Pyreon compiler, so the value is captured once at mount. Pass an accessor (\`() => ${c.name}()\`) and read it inside the component.`,
            span: c.span,
          })
        }
      },
    }

    return callbacks
  },
}
