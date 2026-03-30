import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";
import { extractImportInfo, type ImportInfo } from "../../utils/imports";

export const noChildrenAccess: Rule = {
  meta: {
    id: "pyreon/no-children-access",
    category: "jsx",
    description: "Inform about direct props.children access in renderer files.",
    severity: "info",
    fixable: false,
  },
  create(context) {
    const imports: ImportInfo[] = [];
    let isRendererFile = false;

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node);
        if (info) {
          imports.push(info);
          if (info.source === "@pyreon/runtime-server" || info.source === "@pyreon/runtime-dom") {
            isRendererFile = true;
          }
        }
      },
      MemberExpression(node: any) {
        if (!isRendererFile) return;
        if (
          node.object?.type === "Identifier" &&
          node.property?.type === "Identifier" &&
          node.property.name === "children"
        ) {
          context.report({
            message:
              "Direct `props.children` access in a renderer file — children are already merged via `mergeChildrenIntoProps`.",
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
