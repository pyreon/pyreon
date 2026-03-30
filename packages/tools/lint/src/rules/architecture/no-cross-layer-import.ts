import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan } from "../../utils/ast";
import { isPyreonImport } from "../../utils/imports";

type PackageCategory = "core" | "fundamentals" | "tools" | "ui-system";

const CORE_PACKAGES = new Set([
  "@pyreon/reactivity",
  "@pyreon/core",
  "@pyreon/compiler",
  "@pyreon/runtime-dom",
  "@pyreon/runtime-server",
  "@pyreon/router",
  "@pyreon/head",
  "@pyreon/server",
]);

const UI_PACKAGES = new Set([
  "@pyreon/ui-core",
  "@pyreon/styler",
  "@pyreon/unistyle",
  "@pyreon/elements",
  "@pyreon/attrs",
  "@pyreon/rocketstyle",
  "@pyreon/coolgrid",
  "@pyreon/kinetic",
  "@pyreon/kinetic-presets",
  "@pyreon/connector-document",
  "@pyreon/document-primitives",
]);

function getImportCategory(source: string): PackageCategory | null {
  if (CORE_PACKAGES.has(source)) return "core";
  if (UI_PACKAGES.has(source)) return "ui-system";
  return null;
}

function getFileCategory(filePath: string): PackageCategory | null {
  if (filePath.includes("/packages/core/")) return "core";
  if (filePath.includes("/packages/ui-system/")) return "ui-system";
  if (filePath.includes("/packages/fundamentals/")) return "fundamentals";
  if (filePath.includes("/packages/tools/")) return "tools";
  return null;
}

export const noCrossLayerImport: Rule = {
  meta: {
    id: "pyreon/no-cross-layer-import",
    category: "architecture",
    description: "Prevent core packages from importing ui-system packages.",
    severity: "error",
    fixable: false,
  },
  create(context) {
    const filePath = context.getFilePath();
    const fileCategory = getFileCategory(filePath);
    if (fileCategory !== "core") return {};

    const callbacks: VisitorCallbacks = {
      ImportDeclaration(node: any) {
        const source = node.source?.value as string;
        if (!source || !isPyreonImport(source)) return;

        const importCategory = getImportCategory(source);
        if (importCategory === "ui-system") {
          context.report({
            message: `Core package importing ui-system package \`${source}\` — core packages must not depend on ui-system.`,
            span: getSpan(node),
          });
        }
      },
    };
    return callbacks;
  },
};
