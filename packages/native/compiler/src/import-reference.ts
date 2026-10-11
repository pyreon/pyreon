import type { AstNode } from './call-lowering'

// ESTree nodes are read structurally, as in the parser.
type Node = any
interface ImportBinding {
  source: string
  imported: string
}
interface Scope {
  parent?: Scope
  vars: Scope
  bindings: Map<string, ImportBinding | undefined>
}

function scope(parent?: Scope, ownVars = false): Scope {
  const result = { parent, bindings: new Map() } as Scope
  result.vars = ownVars || !parent ? result : parent.vars
  return result
}

function bindPattern(node: Node, into: Scope): void {
  if (!node) return
  switch (node.type) {
    case 'Identifier':
      into.bindings.set(node.name, undefined)
      break
    case 'RestElement':
      bindPattern(node.argument, into)
      break
    case 'AssignmentPattern':
      bindPattern(node.left, into)
      break
    case 'TSParameterProperty':
      bindPattern(node.parameter, into)
      break
    case 'ArrayPattern':
      for (const item of node.elements) bindPattern(item, into)
      break
    case 'ObjectPattern':
      for (const property of node.properties)
        bindPattern(property.type === 'RestElement' ? property.argument : property.value, into)
      break
  }
}

/**
 * Resolve an identifier reference to its import without comparing spellings.
 * Build scopes once, then resolve after every declaration has been collected:
 * lexical declarations shadow throughout their scope, and `var` belongs to its
 * function even when declared in a nested block. Parameter defaults have their
 * own scope, outside body declarations. The query is intentionally for reference
 * nodes (for example a call's callee), not declaration or property-name nodes.
 */
export function createImportReferenceQuery(
  program: AstNode,
): (node: AstNode, source: string, imported: string) => boolean {
  const scopes = new WeakMap<object, Scope>()
  const root = scope(undefined, true)
  const children = (node: Node, current: Scope) => {
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type') continue
      if (Array.isArray(value)) for (const item of value) visit(item, current)
      else if (value && typeof value === 'object') visit(value, current)
    }
  }
  const visit = (node: Node, current: Scope): void => {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') return
    scopes.set(node, current)
    switch (node.type) {
      case 'ImportDeclaration':
        for (const specifier of node.specifiers) {
          const imported =
            specifier.type === 'ImportNamespaceSpecifier'
              ? '*'
              : specifier.type === 'ImportDefaultSpecifier'
                ? 'default'
                : (specifier.imported.name ?? specifier.imported.value)
          current.bindings.set(
            specifier.local.name,
            node.importKind === 'type' || specifier.importKind === 'type'
              ? undefined
              : { source: node.source.value, imported },
          )
        }
        return
      case 'VariableDeclaration':
        for (const declaration of node.declarations)
          bindPattern(declaration.id, node.kind === 'var' ? current.vars : current)
        children(node, current)
        return
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        if (node.type === 'FunctionDeclaration') bindPattern(node.id, current)
        const parameters = scope(current)
        bindPattern(node.id, parameters)
        for (const parameter of node.params) bindPattern(parameter, parameters)
        for (const parameter of node.params) visit(parameter, parameters)
        visit(node.body, scope(parameters, true))
        return
      }
      case 'ClassDeclaration':
      case 'ClassExpression': {
        if (node.type === 'ClassDeclaration') bindPattern(node.id, current)
        const inside = scope(current)
        bindPattern(node.id, inside)
        children(node, inside)
        return
      }
      case 'BlockStatement':
      case 'StaticBlock':
        children(node, scope(current, node.type === 'StaticBlock'))
        return
      case 'ForStatement':
      case 'ForInStatement':
      case 'ForOfStatement':
        children(node, scope(current))
        return
      case 'CatchClause': {
        const caught = scope(current)
        bindPattern(node.param, caught)
        children(node, caught)
        return
      }
      case 'SwitchStatement': {
        visit(node.discriminant, current)
        const cases = scope(current)
        for (const item of node.cases) visit(item, cases)
        return
      }
      case 'TSEnumDeclaration':
        bindPattern(node.id, current)
        break
    }
    children(node, current)
  }
  visit(program, root)
  return (node, source, imported) => {
    if (node.type !== 'Identifier' || typeof node.name !== 'string') return false
    for (let current = scopes.get(node); current; current = current.parent) {
      if (!current.bindings.has(node.name)) continue
      const binding = current.bindings.get(node.name)
      return binding?.source === source && binding.imported === imported
    }
    return false
  }
}
