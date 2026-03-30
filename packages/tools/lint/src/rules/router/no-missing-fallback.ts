import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";
import { extractImportInfo } from "../../utils/imports";

function isCatchAllPath(value: string): boolean {
  return value === "*" || value.endsWith("*");
}

function getPathValue(prop: any): string | null {
  const key = prop.key;
  if (!key) return null;
  const keyName = key.type === "Identifier" ? key.name : null;
  if (keyName !== "path") return null;
  const val = prop.value;
  if (val?.type === "Literal" && typeof val.value === "string") {
    return val.value;
  }
  return null;
}

function hasPathProperty(obj: any): boolean {
  if (!obj || obj.type !== "ObjectExpression") return false;
  for (const prop of obj.properties ?? []) {
    if (prop.type !== "Property") continue;
    if (getPathValue(prop) !== null) return true;
  }
  return false;
}

function hasCatchAllRoute(elements: any[]): boolean {
  for (const elem of elements) {
    if (!elem || elem.type !== "ObjectExpression") continue;
    for (const prop of elem.properties ?? []) {
      if (prop.type !== "Property") continue;
      const pathVal = getPathValue(prop);
      if (pathVal !== null && isCatchAllPath(pathVal)) return true;
    }
  }
  return false;
}

export const noMissingFallback: Rule = {
  meta: {
    id: "pyreon/no-missing-fallback",
    category: "router",
    description:
      'Warn when route config has no catch-all route (`path: "*"` or `path: "/:rest*"`).',
    severity: "warn",
    fixable: false,
  },
  create(context) {
    let importsRouter = false;
    let routeArraySpan: { start: number; end: number } | null = null;
    let foundCatchAll = false;

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const info = extractImportInfo(node);
        if (info && info.source === "@pyreon/router") {
          importsRouter = true;
        }
      },
      ArrayExpression(node: any) {
        if (!importsRouter) return;
        const elements = node.elements ?? [];
        const isRouteArray = elements.some((e: any) => hasPathProperty(e));
        if (!isRouteArray) return;

        if (!routeArraySpan) {
          routeArraySpan = getSpan(node);
        }
        if (hasCatchAllRoute(elements)) {
          foundCatchAll = true;
        }
      },
      "Program:exit"() {
        if (!importsRouter || !routeArraySpan || foundCatchAll) return;
        context.report({
          message:
            'Route config has no catch-all route — add a `{ path: "*", component: NotFound }` for unmatched URLs.',
          span: routeArraySpan,
        });
      },
    };
    return callbacks;
  },
};
