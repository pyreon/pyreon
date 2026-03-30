import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";
import { extractImportInfo } from "../../utils/imports";

export const noStoreOutsideProvider: Rule = {
  meta: {
    id: "pyreon/no-store-outside-provider",
    category: "store",
    description: "Warn when store hooks are used in SSR files without a provider import.",
    severity: "warn",
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath();
    const isServerFile =
      filePath.includes("server") ||
      filePath.includes(".server.") ||
      filePath.endsWith("server.ts") ||
      filePath.endsWith("server.tsx");

    if (!isServerFile) return {};

    let hasProviderImport = false;
    const storeHookCalls: Array<{ name: string; span: { start: number; end: number } }> = [];

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node);
        if (!info) return;
        if (
          info.specifiers.some(
            (s) =>
              s.imported === "setStoreRegistryProvider" || s.imported === "runWithRequestContext",
          )
        ) {
          hasProviderImport = true;
        }
      },
      CallExpression(node: any) {
        const callee = node.callee;
        if (!callee || callee.type !== "Identifier") return;
        const name: string = callee.name;
        if (name.endsWith("Store") && name.startsWith("use")) {
          storeHookCalls.push({ name, span: getSpan(node) });
        }
      },
      "Program:exit"() {
        if (hasProviderImport) return;
        for (const call of storeHookCalls) {
          context.report({
            message: `\`${call.name}()\` in a server file without a store registry provider — use \`runWithRequestContext()\` or \`setStoreRegistryProvider()\` for SSR isolation.`,
            span: call.span,
          });
        }
      },
    };
    return callbacks;
  },
};
