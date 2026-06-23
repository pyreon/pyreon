// Control-flow statement lowering (subset widening).
//
// Multi-statement handler bodies routinely use `for`/`while`/`switch`; PMTC
// previously WARN-DROPPED every one (only `let`/`if`/`return`/`expr` parsed),
// so a handler with a loop or switch silently lost that logic on native.
// Now they lower to the near-1:1 native forms:
//
//   for (const x of xs) {}  -> Swift `for x in xs {}`   / Kotlin `for (x in xs) {}`
//   while (cond) {}         -> Swift `while cond {}`     / Kotlin `while (cond) {}`
//   switch (x) { case … }   -> Swift `switch x { case … default: }` (exhaustive)
//                              Kotlin `when (x) { … else -> }`
//
// (Body CONTENT is bounded by the existing expression subset — e.g. an
// assignment to a `let` is a separate gap; these tests use in-subset
// statements: signal `.set` calls.)

import { describe, expect, it } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, isKotlincAvailable, validateSwift, validateKotlin } from '../validate'

const app = (handlerBody: string) =>
  `import { Stack, Button } from '@pyreon/primitives'
function App() {
  const items = signal<string[]>(['a', 'b'])
  const status = signal('active')
  const count = signal(0)
  const run = () => {
${handlerBody}
  }
  return (<Stack><Button onPress={() => run()}>Go</Button></Stack>)
}`

describe('control-flow statement lowering', () => {
  it('Swift: for-of / while / switch emit native forms', () => {
    const out = transform(
      app(`    for (const it of items()) { count.set(count() + 1) }
    while (count() > 0) { count.set(count() - 1) }
    switch (status()) {
      case 'active': count.set(1); break
      case 'idle': case 'paused': count.set(2); break
      default: count.set(0)
    }`),
      { target: 'swift' },
    ).code
    expect(out).toContain('for it in items {')
    expect(out).toContain('while count > 0 {')
    expect(out).toContain('switch status {')
    expect(out).toContain('case "active":')
    // grouped labels share one case
    expect(out).toContain('case "idle", "paused":')
    expect(out).toContain('default:')
  })

  it('Kotlin: for-of / while / switch emit native forms', () => {
    const out = transform(
      app(`    for (const it of items()) { count.set(count() + 1) }
    while (count() > 0) { count.set(count() - 1) }
    switch (status()) {
      case 'active': count.set(1); break
      case 'idle': case 'paused': count.set(2); break
      default: count.set(0)
    }`),
      { target: 'kotlin' },
    ).code
    expect(out).toContain('for (it in items) {')
    expect(out).toContain('while (count > 0) {')
    expect(out).toContain('when (status) {')
    expect(out).toContain('"active" ->')
    expect(out).toContain('"idle", "paused" ->')
    expect(out).toContain('else ->')
  })

  it('Swift: a switch WITHOUT a default gets an exhaustive default appended', () => {
    const out = transform(
      app(`    switch (status()) {
      case 'active': count.set(1); break
    }`),
      { target: 'swift' },
    ).code
    // String discriminant → Swift requires an exhaustive default
    expect(out).toContain('switch status {')
    expect(out).toContain('default:')
  })

  it('a nested loop inside a switch case lowers', () => {
    const sw = transform(
      app(`    switch (status()) {
      case 'active':
        for (const it of items()) { count.set(count() + 1) }
        break
      default: count.set(0)
    }`),
      { target: 'swift' },
    ).code
    expect(sw).toContain('case "active":')
    expect(sw).toContain('for it in items {')
  })

  it.skipIf(!isSwiftcAvailable())('Swift: for / while / switch handler typechecks via swiftc', () => {
    const out = transform(
      app(`    for (const it of items()) { count.set(count() + 1) }
    while (count() > 0) { count.set(count() - 1) }
    switch (status()) {
      case 'active': count.set(1); break
      case 'idle': case 'paused': count.set(2); break
      default: count.set(0)
    }`),
      { target: 'swift' },
    ).code
    const res = validateSwift(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })

  it.skipIf(!isKotlincAvailable())('Kotlin: for / while / switch handler typechecks via kotlinc', () => {
    const out = transform(
      app(`    for (const it of items()) { count.set(count() + 1) }
    while (count() > 0) { count.set(count() - 1) }
    switch (status()) {
      case 'active': count.set(1); break
      case 'idle': case 'paused': count.set(2); break
      default: count.set(0)
    }`),
      { target: 'kotlin' },
    ).code
    const res = validateKotlin(out)
    expect(res.ok, res.error ?? '').toBe(true)
  })
})
