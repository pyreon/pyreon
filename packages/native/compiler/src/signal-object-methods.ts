/**
 * Methods of the web's signal OBJECT that have no native lowering.
 *
 * Natively a `signal()` / `computed()` (and a persisted signal from a storage hook) is a plain property — `@State`,
 * `@AppStorage`, `mutableStateOf`, a computed property — read without parentheses and written with `=`. Its value
 * has no `.remove()`, `.subscribe()` or `.trigger()`, so a call to one of them on the signal itself was reproduced
 * verbatim against a `String` / `Int` and the native build failed, with no warning. `.set`, `.update` and `.peek` lower;
 * these are the rest of the signal API (`Signal` / `Computed` in `@pyreon/reactivity`, plus a storage signal's
 * `.remove()`), each named with what to write instead.
 */

const ADVICE: Readonly<Record<string, string>> = {
  remove:
    'to reset it, `.set(…)` its initial value — natively the stored entry is then overwritten with that value rather than deleted',
  trigger: 'write a new value with `.set(…)` instead of mutating the held value in place',
  subscribe: 'read the signal inside an `effect()`, which lowers and re-runs when it changes',
  direct: 'read the signal inside an `effect()`, which lowers and re-runs when it changes',
  debug: 'it has no native counterpart; remove the call (or keep it behind a `<Web>` escape hatch)',
  dispose: 'natively a computed is released with its component; remove the call',
}

/**
 * The warning for `name.method(…)` when `method` is a signal-object method with no native lowering, else `undefined`.
 * The caller says whether `name` is a signal or computed in scope; the value's own methods are reached through a read
 * (`name().method()`), which is a different expression.
 */
export function unloweredSignalMethodWarning(name: string, method: string, target: 'swift' | 'kotlin'): string | undefined {
  const advice = Object.hasOwn(ADVICE, method) ? ADVICE[method] : undefined
  if (advice === undefined) return undefined
  const lang = target === 'swift' ? 'Swift' : 'Kotlin'

  return (
    `${name}.${method}() has no native lowering: natively \`${name}\` is a plain ${lang} property holding the value, not a ` +
    `signal object, so the call is reproduced verbatim and the native build fails. On native, ${advice}.`
  )
}
