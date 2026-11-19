/**
 * A value-change handler passed BY REFERENCE (`<Field onChangeText={save}>`, `<Toggle onChange={props.onToggle}>`).
 *
 * The four value-change events (`<Field onChangeText|onChange>`, `<Toggle onChange>`, `<Select onChange>`,
 * `<Tabs onChange>`) hand the new value to their handler. An inline arrow names that value (`(t) => …`), but a
 * reference does not, and the action emit calls a bare function reference with no arguments (right for
 * `onPress={save}`). So `onChangeText={save}` with `save(t: string)` emitted `save()` on both targets, which neither
 * swiftc nor kotlinc accepts (#4544).
 *
 * Passing the value unconditionally is not safe either: a zero-argument callback is a normal shape
 * (`<Toggle value={props.todo.done} onChange={props.onToggle} />` with `onToggle: () => void`). So the handler is
 * rewritten to the arrow `(newValue) => fn(newValue)` only when the callee is KNOWN to take a parameter: a function
 * declared in the component, a file-scope helper, or a function-typed prop. Every value-change emit then follows its
 * existing inline-arrow path, so both targets and all four primitives get one rule. Any other reference (a
 * zero-parameter function, an unknown arity) keeps the earlier no-argument call.
 */

import type { AttrIR, DeclIR, ExprIR, PropIR } from './types'

/** The parameter the rewritten arrow binds; used unless the referenced function has the same name. */
const VALUE_PARAM = 'newValue'

interface FunctionLike {
  readonly name: string
  readonly params: readonly unknown[]
}

/** The names among `fns` that take at least one parameter. */
export function namesTakingAValue(fns: readonly FunctionLike[]): Set<string> {
  return new Set(fns.filter((f) => f.params.length > 0).map((f) => f.name))
}

/**
 * The function names in a component's scope that take a value: the file-scope helpers that do, overridden by the
 * component's own props and declarations of the same name (a shadowing zero-parameter function or a non-function
 * binding removes the name).
 */
export function componentNamesTakingAValue(
  c: { readonly props: readonly PropIR[]; readonly decls: readonly DeclIR[] },
  helperNames: ReadonlySet<string>,
): Set<string> {
  const names = new Set(helperNames)
  const record = (name: string, takesValue: boolean): void => {
    if (takesValue) names.add(name)
    else names.delete(name)
  }
  for (const p of c.props) record(p.name, p.type.kind === 'function' && p.type.params.length > 0)
  for (const d of c.decls) {
    if ('name' in d && typeof d.name === 'string') {
      record(d.name, d.kind === 'function' && d.params.length > 0)
    }
  }

  return names
}

/** What a value-change handler passed by reference needs from the emitter's scope. */
export interface ValueHandlerScope {
  /** A function name in scope known to take at least one parameter. */
  readonly takesValue: (name: string) => boolean
  /** A signal (or other `.set`-able state) name in scope. */
  readonly isSignal: (name: string) => boolean
  /** The component's props binding (`props`), when it has one. */
  readonly propsParam: string | undefined
}

/**
 * Whether `handler` is a reference to something that takes the changed value: a known value-taking function (bare
 * or a member of the props binding), or a signal's setter (`draft.set`).
 */
function takesTheValue(handler: ExprIR, scope: ValueHandlerScope): boolean {
  if (handler.kind === 'identifier') return scope.takesValue(handler.name)
  if (handler.kind !== 'member' || handler.object.kind !== 'identifier') return false
  if (handler.object.name === scope.propsParam) return scope.takesValue(handler.property)

  return handler.property === 'set' && scope.isSignal(handler.object.name)
}

/**
 * The value-change event `attr` with a by-reference handler rewritten to pass the value
 * (`save` → `(newValue) => save(newValue)`, `draft.set` → `(newValue) => draft.set(newValue)`) when the reference
 * takes one. Any other handler, and an absent attribute, is returned unchanged.
 */
export function withValueArgument<A extends Extract<AttrIR, { kind: 'event' }> | undefined>(
  attr: A,
  scope: ValueHandlerScope,
): A {
  if (attr === undefined || !takesTheValue(attr.handler, scope)) return attr
  const h = attr.handler
  // A props member emits as the bare property name, so it must not collide with the parameter either.
  const callee = h.kind === 'identifier' ? h.name : h.kind === 'member' ? h.property : undefined
  const param = callee === VALUE_PARAM ? `${VALUE_PARAM}_` : VALUE_PARAM
  const handler: ExprIR = {
    kind: 'arrow',
    params: [param],
    body: { kind: 'call', callee: attr.handler, args: [{ kind: 'identifier', name: param }] },
  }

  return { ...attr, handler }
}
