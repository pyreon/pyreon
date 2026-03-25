import type { Rule } from "../../types"
import { getSpan, isCallTo } from "../../utils/ast"

/**
 * Warn when useStore() is used in SSR files without StoreRegistryProvider.
 */
export const noStoreOutsideProvider: Rule = {
  meta: {
    id: "pyreon/no-store-outside-provider",
    description: "Warn about useStore() in SSR without StoreRegistryProvider",
    category: "store",
    defaultSeverity: "warn",
    fixable: false,
    docs: "https://pyreon.dev/lint/no-store-outside-provider",
  },

  create(context) {
    let isServerFile = false
    let hasProvider = false

    return {
      ImportDeclaration(node: any) {
        const source = node.source?.value ?? ""
        if (source === "@pyreon/server" || source.includes("runtime-server")) {
          isServerFile = true
        }
        for (const spec of node.specifiers ?? []) {
          if (
            spec.type === "ImportSpecifier" &&
            (spec.imported?.name === "StoreRegistryProvider" ||
              spec.imported?.name === "setStoreRegistryProvider")
          ) {
            hasProvider = true
          }
        }
      },

      "Program:exit"() {
        // This is a simplified heuristic — just checks if the file uses stores in SSR context
      },

      CallExpression(node: any) {
        if (!isServerFile || hasProvider) return

        if (
          node.callee?.type === "Identifier" &&
          node.callee.name.startsWith("use") &&
          node.callee.name.endsWith("Store")
        ) {
          const span = getSpan(node)
          context.report({
            message:
              "Store hook in SSR context without `StoreRegistryProvider`. Stores will leak between requests. Use `setStoreRegistryProvider()` or `runWithRequestContext()` to isolate.",
            loc: context.getLocation(span.start),
            span,
          })
        }
      },
    }
  },
}
