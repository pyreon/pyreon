/**
 * AST utilities for Pyreon-specific pattern detection.
 * Works with ESTree / TS-ESTree AST from oxc-parser.
 */

/** Check if a node is a call expression to a specific function name */
export function isCallTo(node: any, name: string): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    node.callee.name === name
  )
}

/** Check if a node is a call to any of the given function names */
export function isCallToAny(node: any, names: Set<string>): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "Identifier" &&
    names.has(node.callee.name)
  )
}

/** Check if a node is a member expression call (e.g., obj.method()) */
export function isMemberCallTo(node: any, object: string, method: string): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.object?.type === "Identifier" &&
    node.callee.object.name === object &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === method
  )
}

/** Check if a node is a JSX element with a specific tag name */
export function isJSXElement(node: any, tagName: string): boolean {
  return (
    node.type === "JSXElement" &&
    node.openingElement?.name?.type === "JSXIdentifier" &&
    node.openingElement.name.name === tagName
  )
}

/** Get the tag name of a JSX element */
export function getJSXTagName(node: any): string | undefined {
  if (node.type === "JSXElement" && node.openingElement?.name) {
    const name = node.openingElement.name
    if (name.type === "JSXIdentifier") return name.name
    if (name.type === "JSXMemberExpression") {
      return `${name.object?.name ?? ""}.${name.property?.name ?? ""}`
    }
  }
  return undefined
}

/** Get a specific JSX attribute value from an element */
export function getJSXAttribute(node: any, attrName: string): any | undefined {
  if (node.type !== "JSXElement" && node.type !== "JSXOpeningElement") return undefined
  const opening = node.type === "JSXElement" ? node.openingElement : node
  for (const attr of opening.attributes ?? []) {
    if (attr.type === "JSXAttribute" && attr.name?.name === attrName) {
      return attr
    }
  }
  return undefined
}

/** Check if a JSX attribute exists on an element */
export function hasJSXAttribute(node: any, attrName: string): boolean {
  return getJSXAttribute(node, attrName) !== undefined
}

/** Check if a node is inside an arrow function or function expression */
export function isInsideFunction(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "ArrowFunctionExpression" ||
      a.type === "FunctionExpression" ||
      a.type === "FunctionDeclaration",
  )
}

/** Check if a node is inside a JSX expression container */
export function isInsideJSX(ancestors: any[]): boolean {
  return ancestors.some((a) => a.type === "JSXExpressionContainer")
}

/** Check if a node is a JSX expression container */
export function isJSXExpressionContainer(node: any): boolean {
  return node.type === "JSXExpressionContainer"
}

/** Check if a call expression is a .map() call */
export function isArrayMapCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "map"
  )
}

/** Check if an expression is a function (arrow or function expression) */
export function isFunction(node: any): boolean {
  return node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression"
}

/** Check if a node is a destructuring pattern */
export function isDestructuring(node: any): boolean {
  return node.type === "ObjectPattern" || node.type === "ArrayPattern"
}

/** Check if a variable declarator destructures a specific identifier */
export function isDestructuringOf(declarator: any, name: string): boolean {
  return (
    declarator.type === "VariableDeclarator" &&
    isDestructuring(declarator.id) &&
    declarator.init?.type === "Identifier" &&
    declarator.init.name === name
  )
}

/**
 * Check if a node is a conditional expression (ternary) that returns JSX.
 * Pattern: `condition ? <A/> : <B/>`
 */
export function isTernaryWithJSX(node: any): boolean {
  if (node.type !== "ConditionalExpression") return false
  return hasJSXChild(node.consequent) || hasJSXChild(node.alternate)
}

/** Check if a node contains or is a JSX element */
export function hasJSXChild(node: any): boolean {
  if (!node) return false
  if (node.type === "JSXElement" || node.type === "JSXFragment") return true
  if (node.type === "ParenthesizedExpression") return hasJSXChild(node.expression)
  return false
}

/** Check if an expression is a logical AND with JSX: `x && <Y/>` */
export function isLogicalAndWithJSX(node: any): boolean {
  return (
    node.type === "LogicalExpression" &&
    node.operator === "&&" &&
    hasJSXChild(node.right)
  )
}

/** Check if a node is a .peek() call on a signal */
export function isPeekCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "peek"
  )
}

/** Check if a node is a .set() call on a signal */
export function isSetCall(node: any): boolean {
  return (
    node.type === "CallExpression" &&
    node.callee?.type === "MemberExpression" &&
    node.callee.property?.type === "Identifier" &&
    node.callee.property.name === "set"
  )
}

/** Check if a node accesses a browser-only global */
export function isBrowserGlobal(node: any, globals: Set<string>): boolean {
  if (node.type === "Identifier" && globals.has(node.name)) return true
  if (
    node.type === "MemberExpression" &&
    node.object?.type === "Identifier" &&
    globals.has(node.object.name)
  ) {
    return true
  }
  return false
}

/** Get the byte span of an AST node */
export function getSpan(node: any): { start: number; end: number } {
  // OXC ESTree uses `start`/`end` byte offsets directly on nodes
  return { start: node.start, end: node.end }
}

/** Check if a node is inside a __DEV__ guard (if (__DEV__) { ... }) */
export function isInsideDevGuard(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "IfStatement" &&
      a.test?.type === "Identifier" &&
      a.test.name === "__DEV__",
  )
}

/** Check if a node is inside an onMount callback */
export function isInsideOnMount(ancestors: any[]): boolean {
  return ancestors.some(
    (a) =>
      a.type === "CallExpression" &&
      a.callee?.type === "Identifier" &&
      a.callee.name === "onMount",
  )
}

/** Check if a node is inside a typeof check (typeof window !== "undefined") */
export function isInsideTypeofGuard(ancestors: any[], globalName: string): boolean {
  return ancestors.some(
    (a) =>
      a.type === "IfStatement" &&
      a.test?.type === "BinaryExpression" &&
      a.test.left?.type === "UnaryExpression" &&
      a.test.left.operator === "typeof" &&
      a.test.left.argument?.type === "Identifier" &&
      a.test.left.argument.name === globalName,
  )
}
