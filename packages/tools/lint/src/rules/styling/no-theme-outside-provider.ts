import type { Rule, VisitorCallbacks } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"
import { extractImportInfo } from "../../utils/imports"

export const noThemeOutsideProvider: Rule = {
  meta: {
    id: "pyreon/no-theme-outside-provider",
    category: "styling",
    description: "Warn when useTheme() is used without PyreonUI or ThemeProvider in the same file.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let hasProviderImport = false
    const themeCalls: Array<{ span: { start: number; end: number } }> = []

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node)
        if (!info) return
        if (
          info.specifiers.some((s) => s.imported === "PyreonUI" || s.imported === "ThemeProvider")
        ) {
          hasProviderImport = true
        }
      },
      CallExpression(node: any) {
        if (isCallTo(node, "useTheme")) {
          themeCalls.push({ span: getSpan(node) })
        }
      },
      "Program:exit"() {
        if (hasProviderImport) return
        for (const call of themeCalls) {
          context.report({
            message:
              "`useTheme()` without a `PyreonUI` or `ThemeProvider` import — the theme context may not be available.",
            span: call.span,
          })
        }
      },
    }
    return callbacks
  },
}
