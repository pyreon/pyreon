/**
 * Recognising a COMPONENT for the `style` rules, and walking its subtree.
 *
 * A component is a PascalCase function that returns JSX, or an accessor of
 * JSX (`return () => <div/>`). The name is the same convention
 * `component-context.ts` uses; the JSX check is what keeps a PascalCase
 * factory or class-like helper (`function Point(x, y)`) out.
 */

import { visitorKeys } from 'oxc-parser'
import { unwrapExpression } from './padding'

const PASCAL = /^[A-Z]/

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])

export function isFunctionNode(node: any): boolean {
  return node != null && FUNCTION_TYPES.has(node.type)
}

/** Does this expression produce JSX — directly, through a branch, or as an accessor? */
export function isJsxish(expr: any): boolean {
  const n = unwrapExpression(expr)
  if (!n) return false
  if (n.type === 'JSXElement' || n.type === 'JSXFragment') return true
  if (n.type === 'ConditionalExpression') return isJsxish(n.consequent) || isJsxish(n.alternate)
  if (n.type === 'LogicalExpression') return isJsxish(n.right) || isJsxish(n.left)
  if (n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') {
    return n.body?.type === 'BlockStatement' ? returnsJsx(n.body) : isJsxish(n.body)
  }

  return false
}

/** Does any `return` in this block (not in a nested function) return JSX? */
function returnsJsx(block: any): boolean {
  let found = false
  walkOwnBody(block, (n) => {
    if (found) return false
    if (n.type === 'ReturnStatement' && isJsxish(n.argument)) found = true
    return undefined
  })

  return found
}

/**
 * Pre-order walk over `node`'s subtree that does NOT enter nested functions.
 * Return `false` from `visit` to skip a node's children.
 */
export function walkOwnBody(node: any, visit: (n: any) => boolean | void): void {
  walk(node, (n) => {
    if (n !== node && isFunctionNode(n)) return false
    return visit(n)
  })
}

function walk(node: any, visit: (n: any) => boolean | void): void {
  if (!node || typeof node.type !== 'string') return
  if (visit(node) === false) return
  const keys = visitorKeys[node.type]
  if (!keys) return
  for (const key of keys) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit)
    } else if (child && typeof child.type === 'string') {
      walk(child, visit)
    }
  }
}

/** The child nodes of `node`, in source order, by oxc's own visitor keys. */
export function childrenOf(node: any): any[] {
  const keys = visitorKeys[node?.type]
  if (!keys) return []
  const out: any[] = []
  for (const key of keys) {
    const child = node[key]
    if (Array.isArray(child)) {
      for (const item of child) if (item && typeof item.type === 'string') out.push(item)
    } else if (child && typeof child.type === 'string') {
      out.push(child)
    }
  }

  return out
}

export interface ComponentFunction {
  name: string
  fn: any
}

/**
 * Visitor callbacks that call `onComponent` once for every component function
 * in the file: `function Card() {}`, `export default function Card() {}`,
 * `const Card = () => …` and `const Card = function () {}`.
 */
export function onComponents(onComponent: (c: ComponentFunction) => void): {
  FunctionDeclaration(node: any): void
  VariableDeclarator(node: any): void
} {
  return {
    FunctionDeclaration(node: any) {
      const name = node.id?.name
      if (!name || !PASCAL.test(name) || !node.body) return
      if (!returnsJsx(node.body)) return
      onComponent({ name, fn: node })
    },
    VariableDeclarator(node: any) {
      if (node.id?.type !== 'Identifier' || !PASCAL.test(node.id.name)) return
      const init = unwrapExpression(node.init)
      if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') return
      const isComponent =
        init.body?.type === 'BlockStatement' ? returnsJsx(init.body) : isJsxish(init.body)
      if (!isComponent) return
      onComponent({ name: node.id.name, fn: init })
    },
  }
}

/** Is this node a nested component DEFINITION (its JSX belongs to it, not to the outer one)? */
export function isComponentDefinition(node: any): boolean {
  if (node.type === 'FunctionDeclaration') {
    return PASCAL.test(node.id?.name ?? '') && node.body != null && returnsJsx(node.body)
  }
  if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && PASCAL.test(node.id.name)) {
    const init = unwrapExpression(node.init)
    if (init?.type !== 'ArrowFunctionExpression' && init?.type !== 'FunctionExpression') return false
    return init.body?.type === 'BlockStatement' ? returnsJsx(init.body) : isJsxish(init.body)
  }

  return false
}
