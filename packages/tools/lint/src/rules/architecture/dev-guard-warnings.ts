import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan } from '../../utils/ast'
import { isPathExempt } from '../../utils/exempt-paths'
import { isTestFile } from '../../utils/file-roles'

export const devGuardWarnings: Rule = {
  meta: {
    id: 'pyreon/dev-guard-warnings',
    category: 'architecture',
    description: 'Require console.warn/error calls to be wrapped in `if (__DEV__)` guards.',
    severity: 'error',
    fixable: false,
    schema: { exemptPaths: 'string[]', devFlagNames: 'string[]' },
  },
  create(context) {
    // Skip test files — universal convention (`*.test.*` etc. exist in
    // every project this linter runs on and don't ship to production).
    if (isTestFile(context.getFilePath())) return {}

    // Configurable `exemptPaths` — projects opt out directories where the
    // rule's premise doesn't apply (server-only code where dev/prod is
    // `process.env.NODE_ENV`, or example / demo directories that ship
    // as documentation rather than production).
    if (isPathExempt(context)) return {}

    // Project-level additions to the built-in dev-flag name list. Merged
    // with the defaults so a custom flag like `__DEBUG__` still picks up
    // the built-in `__DEV__`/`IS_DEVELOPMENT`/etc. without restating them.
    const userFlagNames = context.getOptions().devFlagNames
    const extraFlagNames = Array.isArray(userFlagNames)
      ? userFlagNames.filter((n): n is string => typeof n === 'string')
      : []

    // Identifiers bound via `const X = <devFlag expression>` — e.g.
    // `const IS_DEVELOPMENT = import.meta.env.DEV === true`. These act as
    // the same dev-mode gate as the raw flag at their call sites.
    const devFlagBoundConsts = new Set<string>()
    function exprResolvesToDevFlag(expr: any): boolean {
      if (!expr) return false
      if (expr.type === 'ChainExpression') return exprResolvesToDevFlag(expr.expression)
      if (isDevFlag(expr)) return true
      // `import.meta.env.DEV === true` / `true === import.meta.env.DEV`
      if (
        expr.type === 'BinaryExpression' &&
        (expr.operator === '===' || expr.operator === '==')
      ) {
        return exprResolvesToDevFlag(expr.left) || exprResolvesToDevFlag(expr.right)
      }
      return false
    }

    // Conventional identifier names treated as dev-mode gates. Covers both
    // local `const __DEV__ = …` style and imported flags like `IS_DEV` /
    // `IS_DEVELOPMENT` from a package's shared utils module. The rule can't
    // follow cross-module imports to verify that the binding really resolves
    // to `import.meta.env.DEV`, so we fall back to the name convention —
    // consistent with how the existing `__DEV__` identifier works. Projects
    // can extend the list via the `devFlagNames` rule option.
    const DEV_FLAG_NAMES = new Set<string>([
      '__DEV__',
      'IS_DEV',
      'IS_DEVELOPMENT',
      'isDev',
      ...extraFlagNames,
    ])

    // Direct dev-mode flags this rule treats as guards.
    function isDevFlag(node: any): boolean {
      if (!node) return false
      if (node.type === 'ChainExpression') return isDevFlag(node.expression)
      // Conventional dev-flag identifier names.
      if (node.type === 'Identifier' && DEV_FLAG_NAMES.has(node.name)) return true
      // Const-bound dev flag, e.g. `const devMode = import.meta.env.DEV`.
      if (node.type === 'Identifier' && devFlagBoundConsts.has(node.name)) return true
      // `import.meta.env.DEV` (and `import.meta.env?.DEV` after ChainExpression unwrap)
      if (
        node.type === 'MemberExpression' &&
        node.property?.type === 'Identifier' &&
        node.property.name === 'DEV'
      ) {
        const obj = node.object
        if (
          obj?.type === 'MemberExpression' &&
          obj.property?.type === 'Identifier' &&
          obj.property.name === 'env' &&
          obj.object?.type === 'MetaProperty'
        )
          return true
      }
      return false
    }

    // Match `<flag>`, `<flag> && X`, `X && <flag>`, `<flag> === true`, etc.
    // `&&` only — `||` doesn't guarantee dev-only execution.
    function containsDevGuard(test: any): boolean {
      if (!test) return false
      if (isDevFlag(test)) return true
      if (test.type === 'LogicalExpression' && test.operator === '&&') {
        return containsDevGuard(test.left) || containsDevGuard(test.right)
      }
      // `flag === true` or `true === flag` — common after `?? === true` shape.
      if (
        test.type === 'BinaryExpression' &&
        (test.operator === '===' || test.operator === '==')
      ) {
        return isDevFlag(test.left) || isDevFlag(test.right)
      }
      return false
    }

    // Detects an early-return DEV guard at the head of a function body:
    //   `if (!__DEV__) return`  /  `if (!import.meta.env.DEV) return`
    // Everything after this in the function is implicitly dev-only.
    function isEarlyReturnDevGuard(node: any): boolean {
      if (!node || node.type !== 'IfStatement') return false
      const t = node.test
      const arg = t?.type === 'UnaryExpression' && t.operator === '!' ? t.argument : null
      if (!arg) return false
      if (!isDevFlag(arg)) return false
      const c = node.consequent
      if (c?.type === 'ReturnStatement') return true
      if (c?.type === 'BlockStatement' && c.body.length === 1 && c.body[0]?.type === 'ReturnStatement') return true
      return false
    }

    let devGuardDepth = 0
    let catchDepth = 0
    // For each function we enter, record whether its first statement is an
    // early-return DEV guard. If yes, the function's body is dev-only and
    // we treat it as one guard depth for the duration.
    const funcGuardStack: number[] = []
    function enterFunction(node: any) {
      const body = node?.body
      const stmts = body?.type === 'BlockStatement' ? body.body : null
      let guarded = 0
      if (stmts && stmts.length > 0 && isEarlyReturnDevGuard(stmts[0])) {
        guarded = 1
        devGuardDepth++
      }
      funcGuardStack.push(guarded)
    }
    function exitFunction() {
      const g = funcGuardStack.pop() ?? 0
      if (g > 0) devGuardDepth -= g
    }

    const callbacks: VisitorCallbacks = {
      VariableDeclaration(node: any) {
        for (const decl of node.declarations ?? []) {
          if (decl.id?.type === 'Identifier' && exprResolvesToDevFlag(decl.init)) {
            devFlagBoundConsts.add(decl.id.name)
          }
        }
      },
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,

      IfStatement(node: any) {
        if (containsDevGuard(node.test)) devGuardDepth++
      },
      'IfStatement:exit'(node: any) {
        if (containsDevGuard(node.test)) devGuardDepth--
      },
      // Conditional expression as a statement — `__DEV__ && console.warn(...)`
      // and `__DEV__ ? console.warn(...) : null` are equivalent dev-only hints.
      LogicalExpression(node: any) {
        if (node.operator === '&&' && containsDevGuard(node.left)) devGuardDepth++
      },
      'LogicalExpression:exit'(node: any) {
        if (node.operator === '&&' && containsDevGuard(node.left)) devGuardDepth--
      },
      ConditionalExpression(node: any) {
        if (containsDevGuard(node.test)) devGuardDepth++
      },
      'ConditionalExpression:exit'(node: any) {
        if (containsDevGuard(node.test)) devGuardDepth--
      },
      // `console.error` in a catch block is legitimate production error
      // reporting (the error already happened — surfacing it isn't a dev hint).
      // `console.warn` in catch is still flagged: warnings should be DEV-only.
      CatchClause() {
        catchDepth++
      },
      'CatchClause:exit'() {
        catchDepth--
      },
      CallExpression(node: any) {
        if (devGuardDepth > 0) return

        const callee = node.callee
        if (
          callee?.type === 'MemberExpression' &&
          callee.object?.type === 'Identifier' &&
          callee.object.name === 'console' &&
          callee.property?.type === 'Identifier' &&
          (callee.property.name === 'warn' || callee.property.name === 'error')
        ) {
          if (callee.property.name === 'error' && catchDepth > 0) return
          context.report({
            message: `\`console.${callee.property.name}()\` without \`__DEV__\` guard — dev warnings must be tree-shakeable in production. Wrap in \`if (__DEV__) { ... }\` (or \`__DEV__ && ...\`). Production error logging in \`catch\` blocks is exempt for \`console.error\`.`,
            span: getSpan(node),
          })
        }
      },
    }
    return callbacks
  },
}
