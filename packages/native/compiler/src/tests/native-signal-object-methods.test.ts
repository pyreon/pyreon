// The signal OBJECT's own methods — `theme.remove()`, `count.subscribe(fn)`, `.trigger()`, `.direct(fn)`, `.debug()`,
// a computed's `.dispose()` — called on the signal itself, are named on both targets.
//
// Natively a signal is a plain property holding the value (`@State`, `@AppStorage`, `mutableStateOf`, a computed
// property). Only `.set`, `.update` and `.peek` lower; every other signal method was reproduced verbatim against a
// `String` / `Int` (`Button("Reset") { theme.remove() }`) and the native build failed with ZERO warnings. Found during
// issue triage with a storage signal's `.remove()`; the whole signal API has the same shape.
import { describe, expect, it } from 'vitest'
import { transform, validateKotlin, validateSwiftWithStubs } from './first-party-plugins'
import { isKotlincAvailable, isSwiftcAvailable } from '../validate'

const both = ['swift', 'kotlin'] as const

const storage = (handler: string, decl = "useStorage('theme', 'light')") => `import { Stack, Text, Button } from '@pyreon/primitives'
import { useStorage, useSessionStorage } from '@pyreon/storage'
export function Prefs() {
  const theme = ${decl}
  return (
    <Stack>
      <Text>{theme()}</Text>
      <Button onPress={() => ${handler}}>Reset</Button>
    </Stack>
  )
}
`

/** The signal-method warnings, by the `name.method` each one starts with. */
function named(warnings: readonly string[]): string[] {
  return warnings.flatMap((w) => {
    const m = /^([\w$]+\.[\w$]+)\(\) has no native lowering: natively `/.exec(w)
    return m ? [m[1]!] : []
  })
}

describe("a storage signal's .remove()", () => {
  for (const target of both) {
    it(`${target}: a persisted scalar is named, with the reset that lowers`, () => {
      const r = transform(storage('theme.remove()'), { target })
      expect(named(r.warnings), r.warnings.join('\n')).toEqual(['theme.remove'])
      const w = r.warnings.find((x) => x.startsWith('theme.remove()'))!
      expect(w).toContain(`plain ${target === 'swift' ? 'Swift' : 'Kotlin'} property`)
      expect(w).toContain('to reset it, `.set(…)` its initial value')
    })
    it(`${target}: a persisted struct list and a session signal are named the same way`, () => {
      const list = transform(storage('theme.remove()', "useStorage<{ id: number }[]>('rows', [])").replace('{theme()}', '{theme().length}'), { target })
      expect(named(list.warnings), list.warnings.join('\n')).toEqual(['theme.remove'])
      const session = transform(storage('theme.remove()', "useSessionStorage('theme', 'light')"), { target })
      expect(named(session.warnings), session.warnings.join('\n')).toEqual(['theme.remove'])
    })
  }

  // The warning's claim, checked both ways: the emit it names does not build, and the advised rewrite does.
  it.skipIf(!isSwiftcAvailable())('swift: the named emit fails to typecheck; the advised .set(initial) typechecks', () => {
    const broken = validateSwiftWithStubs(transform(storage('theme.remove()'), { target: 'swift' }).code)
    expect(broken.ok).toBe(false)
    const fixed = validateSwiftWithStubs(transform(storage("theme.set('light')"), { target: 'swift' }).code)
    expect(fixed.ok, fixed.ok ? '' : String(fixed.error)).toBe(true)
  })
  it.skipIf(!isKotlincAvailable())('kotlin: the named emit fails to compile; the advised .set(initial) compiles', () => {
    const broken = validateKotlin(transform(storage('theme.remove()'), { target: 'kotlin' }).code)
    expect(broken.ok).toBe(false)
    const fixed = validateKotlin(transform(storage("theme.set('light')"), { target: 'kotlin' }).code)
    expect(fixed.ok, fixed.ok ? '' : String(fixed.error)).toBe(true)
  }, 180_000)
})

const core = `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal, computed, onMount } from '@pyreon/reactivity'
const shared = signal(0)
export function Sig() {
  const count = signal(0)
  const dbl = computed(() => count() * 2)
  onMount(() => {
    const off = count.subscribe(() => {})
    const stop = count.direct(() => {})
    return () => { off(); stop() }
  })
  return (
    <Stack>
      <Text>{dbl()}</Text>
      <Button onPress={() => count.trigger()}>t</Button>
      <Button onPress={() => { count.debug(); dbl.dispose(); shared.trigger() }}>d</Button>
    </Stack>
  )
}
`

describe('the rest of the core signal API', () => {
  for (const target of both) {
    it(`${target}: subscribe, direct, trigger, debug and a computed's dispose are each named once — module state too`, () => {
      const r = transform(core, { target })
      expect(named(r.warnings).sort(), r.warnings.join('\n')).toEqual(
        ['count.debug', 'count.direct', 'count.subscribe', 'count.trigger', 'dbl.dispose', 'shared.trigger'].sort(),
      )
    })
  }
})

describe('what lowers stays silent', () => {
  const ok = `import { Stack, Text, Button } from '@pyreon/primitives'
import { signal } from '@pyreon/reactivity'
export function Ok() {
  const items = signal<string[]>(['a'])
  const name = signal(' x ')
  const rows: string[] = ['r']
  const peeked = items.peek().length
  return (
    <Stack>
      <Text>{\`\${name().trim()} \${items().filter((i) => i !== 'b').length} \${peeked} \${rows.indexOf('r')}\`}</Text>
      <Button onPress={() => items.set([...items(), 'c'])}>set</Button>
      <Button onPress={() => items.update((xs) => xs.slice(1))}>update</Button>
    </Stack>
  )
}
`
  for (const target of both) {
    it(`${target}: .set / .update / .peek, and the VALUE's methods through a read, are not named`, () => {
      const r = transform(ok, { target })
      expect(named(r.warnings), r.warnings.join('\n')).toEqual([])
    })
  }
})
