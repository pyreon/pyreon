import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when useTheme() is used but PyreonUI/ThemeProvider isn't imported.
 *
 * This is a heuristic — it checks if the file imports useTheme but not any provider.
 */
export const noThemeOutsideProvider: Rule = {
  meta: {
    id: "pyreon/no-theme-outside-provider",
    description: "Warn about useTheme() without PyreonUI/ThemeProvider in the component tree",
    category: "styling",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-theme-outside-provider",
  },

  create(context) {
    let hasUseThemeImport = false
    let hasProviderImport = false
    const useThemeCalls: any[] = []

    return {
      ImportDeclaration(node: any) {
        for (const spec of node.specifiers ?? []) {
          if (spec.type !== "ImportSpecifier") continue
          const name = spec.imported?.name
          if (name === "useTheme") hasUseThemeImport = true
          if (
            name === "PyreonUI" ||
            name === "ThemeProvider" ||
            name === "ThemeContext"
          ) {
            hasProviderImport = true
          }
        }
      },

      CallExpression(node: any) {
        if (isCallTo(node, "useTheme")) {
          useThemeCalls.push(node)
        }
      },

      "Program:exit"() {
        // Only warn if useTheme is imported but no provider is
        if (!hasUseThemeImport || hasProviderImport) return
        if (useThemeCalls.length === 0) return

        for (const node of useThemeCalls) {
          const span = getSpan(node)
          context.report({
            message:
              "`useTheme()` requires `PyreonUI` or `ThemeProvider` in the component tree. Ensure a provider wraps this component.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
