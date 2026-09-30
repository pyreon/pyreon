import { detectPlain, transformPlain } from '@pyreon/compiler/plain'
import type { Rule, VisitorCallbacks } from '../../types'

/**
 * Surface every Plain Mode compile-time warning as a lint diagnostic.
 *
 * The plain pre-pass already detects its footguns — mutating a property of
 * SHALLOW state (no subscriber is notified), assigning to a `derived` value,
 * a `signalOf` it cannot lower, a `for (x of …)` head writing state, a rest
 * inside a nested props pattern. But it reports them as compiler WARNINGS in
 * the Vite terminal, while the running app is silently wrong: the classic
 * "it compiled, it rendered, it just doesn't update" failure. This rule runs
 * the SAME pre-pass (the light `@pyreon/compiler/plain` entry — no TypeScript
 * graph) and puts each warning in the editor and in CI at `error`, because
 * every one of them describes code that does not do what it says.
 *
 * There is exactly one source of truth: the rule reports what the compiler
 * decides, so it can never disagree with the build.
 */
export const plainModeFootgun: Rule = {
  meta: {
    id: 'pyreon/plain-mode-footgun',
    category: 'reactivity',
    description:
      'Report every Plain Mode compile-time warning (shallow-state mutation, write to derived, unlowerable signalOf, …) as an error.',
    severity: 'error',
    fixable: false,
    schema: { projectWide: 'boolean' },
  },
  create(context) {
    const code = context.getSourceText()
    const projectWide = context.getOptions().projectWide === true
    if (!projectWide && !detectPlain(code)) return {}
    const callbacks: VisitorCallbacks = {
      'Program:exit'() {
        let result
        try {
          result = transformPlain(code, context.getFilePath(), { force: projectWide })
        } catch {
          return
        }
        if (!result) return
        const lineStarts = [0]
        for (let i = 0; i < code.length; i++) if (code.charCodeAt(i) === 10) lineStarts.push(i + 1)
        for (const w of result.warnings) {
          const start = Math.min((lineStarts[w.line - 1] ?? 0) + w.column, code.length)
          const nl = code.indexOf('\n', start)
          context.report({
            message: w.message.replace(/^\[plain\] /, 'Plain Mode: '),
            span: { start, end: nl === -1 ? code.length : nl },
          })
        }
      },
    }
    return callbacks
  },
}
