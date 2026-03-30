import type { Rule, VisitorCallbacks } from "../../types";
import { getSpan, isCallTo, isMemberCallTo } from "../../utils/ast";

export const noImperativeNavigateInRender: Rule = {
  meta: {
    id: "pyreon/no-imperative-navigate-in-render",
    category: "router",
    description:
      "Error when navigate() or router.push() is called at the top level of a component — causes infinite render loops.",
    severity: "error",
    fixable: false,
  },
  create(context) {
    // Track depth of component functions and safe callback wrappers
    // We detect components via VariableDeclarator with PascalCase name + ArrowFunctionExpression init,
    // or FunctionDeclaration with PascalCase name.
    // "Safe" = onMount/effect/onUnmount callbacks or JSX event handlers.
    let componentBodyDepth = 0;
    let safeDepth = 0;

    const callbacks: VisitorCallbacks = {
      FunctionDeclaration(node: any) {
        const name: string = node.id?.name ?? "";
        if (/^[A-Z]/.test(name)) {
          componentBodyDepth++;
        }
      },
      "FunctionDeclaration:exit"(node: any) {
        const name: string = node.id?.name ?? "";
        if (/^[A-Z]/.test(name)) {
          componentBodyDepth--;
        }
      },
      // For arrow functions, we use VariableDeclarator to detect component assignment
      VariableDeclarator(node: any) {
        const name: string = node.id?.name ?? "";
        if (/^[A-Z]/.test(name) && node.init?.type === "ArrowFunctionExpression") {
          componentBodyDepth++;
        }
      },
      "VariableDeclarator:exit"(node: any) {
        const name: string = node.id?.name ?? "";
        if (/^[A-Z]/.test(name) && node.init?.type === "ArrowFunctionExpression") {
          componentBodyDepth--;
        }
      },
      // Track safe callback boundaries: onMount(() => ...), effect(() => ...), etc.
      CallExpression(node: any) {
        if (componentBodyDepth <= 0) return;

        // Check if this is a safe wrapper entering
        if (isSafeWrapperCall(node)) {
          safeDepth++;
        }

        // Only report if we're in a component body and NOT inside a safe callback
        if (safeDepth > 0) return;

        if (isCallTo(node, "navigate") || isMemberCallTo(node, "router", "push")) {
          context.report({
            message:
              "Imperative navigation at the top level of a component — this runs on every render and causes infinite loops. Move inside `onMount`, `effect`, or an event handler.",
            span: getSpan(node),
          });
        }
      },
      "CallExpression:exit"(node: any) {
        if (componentBodyDepth <= 0) return;
        if (isSafeWrapperCall(node)) {
          safeDepth--;
        }
      },
    };
    return callbacks;
  },
};

function isSafeWrapperCall(node: any): boolean {
  const callee = node.callee;
  if (!callee || callee.type !== "Identifier") return false;
  const name: string = callee.name;
  return name === "onMount" || name === "effect" || name === "onUnmount";
}
