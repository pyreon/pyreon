import { walkSubtree } from './ast'

/**
 * The file's signal bindings, as the accessor detectors see them.
 *
 * Mirror of `collectAccessorBindings` in `@pyreon/compiler`
 * (`pyreon-intercept.ts`, the TypeScript-AST collector behind
 * `accessor-uncalled-in-template` and `signal-write-as-call`), over oxc's AST so
 * a lint rule does not load the TypeScript compiler. Keep the two in step.
 *
 * - `signals`: `const x = signal(…)` / `const x = computed(…)`. The same
 *   declaration shape the JSX compiler tracks for signal auto-call (`const`
 *   only, identifier binding, a direct `signal`/`computed` call).
 * - `otherBound`: every name ALSO bound by something else in the file (another
 *   variable, a destructured name, a parameter, a function or class name, a
 *   catch or loop variable, an import). The collection is scope-blind, so such a
 *   name is AMBIGUOUS at a use site and the rules skip it: a missed case is
 *   acceptable, a wrong flag (or a wrong autofix) is not.
 */
export interface SignalBindings {
  signals: Set<string>
  otherBound: Set<string>
}

/** The child pattern(s) a binding pattern binds through, by pattern type. */
const SUB_PATTERNS: Record<string, (pattern: any) => any[]> = {
  ObjectPattern: (p) =>
    (p.properties ?? []).map((q: any) => (q.type === 'RestElement' ? q.argument : q.value)),
  ArrayPattern: (p) => p.elements ?? [],
  RestElement: (p) => [p.argument],
  AssignmentPattern: (p) => [p.left],
  TSParameterProperty: (p) => [p.parameter],
}

function addPatternNames(pattern: any, out: Set<string>): void {
  if (!pattern) return
  if (pattern.type === 'Identifier') out.add(pattern.name)
  else for (const sub of SUB_PATTERNS[pattern.type]?.(pattern) ?? []) addPatternNames(sub, out)
}

function isSignalFactoryCall(init: any): boolean {
  return (
    init?.type === 'CallExpression' &&
    init.callee?.type === 'Identifier' &&
    (init.callee.name === 'signal' || init.callee.name === 'computed')
  )
}

/** Names a non-variable node binds: function and class names, params, catch, imports. */
function otherBindingsOf(node: any): any[] {
  switch (node.type) {
    case 'FunctionDeclaration':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return [node.type === 'FunctionDeclaration' ? node.id : null, ...(node.params ?? [])]
    case 'ClassDeclaration':
      return [node.id]
    case 'CatchClause':
      return [node.param]
    case 'ImportSpecifier':
    case 'ImportDefaultSpecifier':
    case 'ImportNamespaceSpecifier':
      return [node.local]
  }

  return []
}

export function collectSignalBindings(program: any): SignalBindings {
  const signals = new Set<string>()
  const otherBound = new Set<string>()

  walkSubtree(program, (node) => {
    if (node.type !== 'VariableDeclaration') {
      for (const pattern of otherBindingsOf(node)) addPatternNames(pattern, otherBound)
      return
    }
    for (const decl of node.declarations ?? []) {
      const tracked =
        node.kind === 'const' && decl.id?.type === 'Identifier' && isSignalFactoryCall(decl.init)
      if (tracked) signals.add(decl.id.name)
      else addPatternNames(decl.id, otherBound)
    }
  })

  return { signals, otherBound }
}
