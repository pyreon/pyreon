import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { getNearestPackageName } from '../../utils/project-deps'
import { isTestFile } from '../../utils/file-roles'

/**
 * A framework error is "identified" if it starts with `[Pyreon]` OR the
 * more-specific `[@pyreon/<pkg>]` convention (`[@pyreon/state-tree] …`). Both
 * satisfy the rule's purpose — a user can grep their logs and know the error
 * came from the framework; the scoped form additionally names the package. We
 * accept either rather than force a churn of dozens of already-identified
 * messages down to the generic token.
 */
function hasFrameworkPrefix(message: string): boolean {
  // `[Pyreon Router] …` / `[Pyreon ISR] …` are the same scoped convention with a
  // space instead of a slash, and the repo uses them deliberately. They satisfy
  // the stated purpose exactly — identified AND package-named — so requiring the
  // literal `[Pyreon]` would force `[Pyreon] [Pyreon Router] …`, which is worse
  // for the reader than what it replaces.
  return /^\[(Pyreon[\]\s]|@pyreon\/)/.test(message)
}

export const noErrorWithoutPrefix: Rule = {
  meta: {
    id: 'pyreon/no-error-without-prefix',
    category: 'architecture',
    description: 'Require error messages to be prefixed with [Pyreon] or [@pyreon/<pkg>].',
    severity: 'warn',
    scope: 'monorepo',
    fixable: true,
    schema: { exemptPaths: 'string[]' },
  },
  create(context) {
    const filePath = context.getFilePath()

    // The `[Pyreon]` prefix is a FRAMEWORK-INTERNAL convention (so a user can
    // grep their logs and know an error came from the framework). It is
    // meaningless — and misleading — for a CONSUMER app's own errors
    // (`throw new Error('Save failed (500)')` is not a framework error). So the
    // rule fires ONLY when the file belongs to a `@pyreon/*` package; a consumer
    // app (any other package name) is never flagged, and the autofix can never
    // rewrite an application error to `[Pyreon] …`.
    const pkgName = getNearestPackageName(filePath)
    if (!pkgName || !pkgName.startsWith('@pyreon/')) return {}
    // Shared classifier, not a fourth inline copy: this one silently omitted
    // `/__tests__/`, which the shared helper covers.
    if (isTestFile(filePath)) return {}

    const callbacks: VisitorCallbacks = {
      ThrowStatement(node: any) {
        const arg = node.argument
        if (!arg || arg.type !== 'NewExpression') return
        const callee = arg.callee
        if (!callee || callee.type !== 'Identifier' || callee.name !== 'Error') return

        const args = arg.arguments
        if (!args || args.length === 0) return

        const firstArg = args[0]
        if (!firstArg) return

        if (firstArg.type === 'Literal' || firstArg.type === 'StringLiteral') {
          const value = firstArg.value as string
          if (typeof value === 'string' && !hasFrameworkPrefix(value)) {
            const argSpan = getSpan(firstArg)
            // Fix: add [Pyreon] prefix
            const quote = context.getSourceText()[argSpan.start]
            const fixedValue = `${quote}[Pyreon] ${value}${quote}`
            context.report({
              message:
                'Error message missing `[Pyreon]` prefix — all framework errors should be prefixed for identification.',
              span: getSpan(node),
              fix: { span: argSpan, replacement: fixedValue },
            })
          }
        }

        if (firstArg.type === 'TemplateLiteral') {
          const quasis = firstArg.quasis
          if (quasis && quasis.length > 0) {
            const first = quasis[0]
            const raw = first.value?.raw ?? first.value?.cooked ?? ''
            if (!hasFrameworkPrefix(raw)) {
              const argSpan = getSpan(firstArg)
              const source = context.getSourceText().slice(argSpan.start, argSpan.end)
              const fixed = source.replace(/^`/, '`[Pyreon] ')
              context.report({
                message:
                  'Error message missing `[Pyreon]` prefix — all framework errors should be prefixed for identification.',
                span: getSpan(node),
                fix: { span: argSpan, replacement: fixed },
              })
            }
          }
        }
      },
    }
    return callbacks
  },
}
