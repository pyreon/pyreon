import type { Span } from "../types";
import { BROWSER_GLOBALS } from "./imports";

/** Check if a node is a call expression to a specific function name. */
export function isCallTo(node: any, name: string): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === name
  );
}

/** Check if a node is a call expression to any of the given function names. */
export function isCallToAny(node: any, names: Set<string>): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    names.has(node.callee.name)
  );
}

/** Check if a node is a member call like `obj.method()`. */
export function isMemberCallTo(node: any, objectName: string, methodName: string): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === objectName &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === methodName
  );
}

/** Check if a node is a JSX element (opening or self-closing). */
export function isJSXElement(node: any): boolean {
  return node.type === "JSXElement" || node.type === "JSXFragment";
}

/** Get the tag name of a JSX element. */
export function getJSXTagName(node: any): string | null {
  if (node.type === "JSXElement") {
    const opening = node.openingElement;
    if (!opening) return null;
    const name = opening.name;
    if (name?.type === "JSXIdentifier") return name.name;
    if (name?.type === "JSXMemberExpression") {
      return `${name.object?.name ?? ""}.${name.property?.name ?? ""}`;
    }
  }
  return null;
}

/** Get a JSX attribute by name from an opening element. */
export function getJSXAttribute(openingElement: any, attrName: string): any | null {
  const attrs = openingElement.attributes ?? [];
  for (const attr of attrs) {
    if (
      attr.type === "JSXAttribute" &&
      attr.name?.type === "JSXIdentifier" &&
      attr.name.name === attrName
    ) {
      return attr;
    }
  }
  return null;
}

/** Check if a JSX opening element has an attribute. */
export function hasJSXAttribute(openingElement: any, attrName: string): boolean {
  return getJSXAttribute(openingElement, attrName) !== null;
}

/** Check if a node is inside a function (arrow or regular). */
export function isInsideFunction(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "FunctionDeclaration" ||
      a.type === "FunctionExpression" ||
      a.type === "ArrowFunctionExpression",
  );
}

/** Check if a node is inside JSX. */
export function isInsideJSX(ancestors: any[]): boolean {
  return ancestors.some((a) => a.type === "JSXElement" || a.type === "JSXFragment");
}

/** Check if a node is an array .map() call. */
export function isArrayMapCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "map"
  );
}

/** Check if a node is a function expression or arrow function. */
export function isFunction(node: any): boolean {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression"
  );
}

/** Check if a node is a destructuring pattern. */
export function isDestructuring(node: any): boolean {
  return node.type === "ObjectPattern" || node.type === "ArrayPattern";
}

/** Check if a node is a ternary with JSX in either branch. */
export function isTernaryWithJSX(node: any): boolean {
  if (node.type !== "ConditionalExpression") return false;
  return containsJSX(node.consequent) || containsJSX(node.alternate);
}

/** Check if a node contains JSX anywhere. */
function containsJSX(node: any): boolean {
  if (!node) return false;
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true;
  if (node.type === "ParenthesizedExpression") return containsJSX(node.expression);
  return false;
}

/** Check if a JSX element has JSX children. */
export function hasJSXChild(node: any): boolean {
  if (node.type !== "JSXElement") return false;
  return (node.children ?? []).some(
    (c: any) => c.type === "JSXElement" || c.type === "JSXFragment",
  );
}

/** Check if a node is a logical AND with JSX. */
export function isLogicalAndWithJSX(node: any): boolean {
  if (node.type !== "LogicalExpression" || node.operator !== "&&") return false;
  return containsJSX(node.right);
}

/** Check if a node is a .peek() call. */
export function isPeekCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "peek"
  );
}

/** Check if a node is a .set() call. */
export function isSetCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "set"
  );
}

/** Check if a node references a browser global. */
export function isBrowserGlobal(node: any): boolean {
  return node.type === "Identifier" && BROWSER_GLOBALS.has(node.name);
}

/** Get the span (byte offsets) of a node. */
export function getSpan(node: any): Span {
  return { start: node.start as number, end: node.end as number };
}

/** Check if a node is inside a `if (__DEV__)` guard. */
export function isInsideDevGuard(ancestors: any[]): boolean {
  return ancestors.some(
    (a) => a.type === "IfStatement" && a.test?.type === "Identifier" && a.test.name === "__DEV__",
  );
}

/** Check if a node is inside an onMount callback. */
export function isInsideOnMount(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "CallExpression" && a.callee?.type === "Identifier" && a.callee.name === "onMount",
  );
}

/** Check if a node is inside a typeof guard (e.g., `typeof window !== "undefined"`). */
export function isInsideTypeofGuard(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "IfStatement" &&
      a.test?.type === "BinaryExpression" &&
      a.test.left?.type === "UnaryExpression" &&
      a.test.left.operator === "typeof",
  );
}
