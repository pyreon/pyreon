import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";
import { HEAVY_PACKAGES } from "../../utils/imports";

export const noEagerImport: Rule = {
  meta: {
    id: "pyreon/no-eager-import",
    category: "performance",
    description: "Suggest lazy-loading heavy Pyreon packages (charts, code, document, flow).",
    severity: "info",
    fixable: false,
  },
  create(context) {
    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string;
        if (!source) return;
        if (HEAVY_PACKAGES.has(source)) {
          context.report({
            message: `Static import of \`${source}\` — consider using \`lazy()\` or dynamic \`import()\` to reduce initial bundle size.`,
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
