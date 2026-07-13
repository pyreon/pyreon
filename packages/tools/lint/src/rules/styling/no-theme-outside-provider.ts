import type { Rule, VisitorCallbacks } from '../../types'
import { getSpan, isCallTo } from '../../utils/ast'
import { extractImportInfo } from '../../utils/imports'

const HOOK_NAME = /^use[A-Z]/

export const noThemeOutsideProvider: Rule = {
  meta: {
    id: 'pyreon/no-theme-outside-provider',
    category: 'styling',
    description:
      'Warn when useTheme() is used without a PyreonUI or ThemeProvider import in the same file. Opt-in — a consumer component legitimately reads theme from an ancestor <ThemeProvider> in another file (the whole point of context), so the same-file requirement is a false positive that a single-file AST walk cannot avoid.',
    // Opt-in: the provider is almost always in an ancestor at the app/table
    // root, in a DIFFERENT file — which is exactly how context is meant to be
    // used. A single-file walker cannot prove a provider is absent app-wide, so
    // firing on every cross-file `useTheme()` in `recommended` (and gating it as
    // an error under `strict`/`lib`) flags correct code. Available via
    // `best-practices` / explicit config for teams that co-locate providers.
    optIn: true,
    severity: 'warn',
    fixable: false,
  },
  create(context) {
    let hasProviderImport = false
    let hookDepth = 0
    // Each useTheme call records whether it was inside a hook implementation.
    // Hook files (e.g. `useThemeValue.ts`) legitimately call `useTheme()` to
    // re-export theme access — they delegate provider responsibility to the
    // consuming component, which is the place the rule actually targets.
    const themeCalls: Array<{ span: { start: number; end: number }; insideHook: boolean }> = []

    function declaratorIsHook(node: any): boolean {
      if (node?.id?.type !== 'Identifier') return false
      const init = node.init
      if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') return false
      return HOOK_NAME.test(node.id.name)
    }

    const callbacks: VisitorCallbacks = {
      // `function useFoo() { … }`
      FunctionDeclaration(node: any) {
        if (node.id?.name && HOOK_NAME.test(node.id.name)) hookDepth++
      },
      'FunctionDeclaration:exit'(node: any) {
        if (node.id?.name && HOOK_NAME.test(node.id.name)) hookDepth--
      },
      // `const useFoo = () => { … }` (oxc visitor doesn't pass parent, so
      // hook into the declarator — it brackets the inner function body).
      VariableDeclarator(node: any) {
        if (declaratorIsHook(node)) hookDepth++
      },
      'VariableDeclarator:exit'(node: any) {
        if (declaratorIsHook(node)) hookDepth--
      },
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (!info) return
        if (
          info.specifiers.some((s) => s.imported === 'PyreonUI' || s.imported === 'ThemeProvider')
        ) {
          hasProviderImport = true
        }
      },
      CallExpression(node: any) {
        if (isCallTo(node, 'useTheme')) {
          themeCalls.push({ span: getSpan(node), insideHook: hookDepth > 0 })
        }
      },
      'Program:exit'() {
        if (hasProviderImport) return
        for (const call of themeCalls) {
          // Inside a hook implementation? The hook delegates provider
          // responsibility to its caller — silence here.
          if (call.insideHook) continue
          context.report({
            message:
              '`useTheme()` without a `PyreonUI` or `ThemeProvider` import — the theme context may not be available.',
            span: call.span,
          })
        }
      },
    }
    return callbacks
  },
}
