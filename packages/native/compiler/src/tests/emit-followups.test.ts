// Emit follow-ups from the device-CI arc (PR-C, 2026-06-10): condition-
// position accessor-arrow unwrap, store-chain computed inference, and
// the i18n two-arg t() dict/map argument lowering.
//
// Each describe block is independently bisect-verifiable against its
// fix site:
//   - arrow-unwrap → `unwrapAccessorArrow` + its call sites in
//     emit-swift.ts / emit-kotlin.ts
//   - store-chain inference → `resolveStoreReadType` in infer-type.ts +
//     the `_storeDefs` threading in emit-swift.ts
//   - i18n dict args → the `_i18nNames`-gated branch in both emitters'
//     call cases

import { describe, expect, it } from 'vitest'
import { transform } from '../index'

describe('condition-position accessor-arrow unwrap', () => {
  const SHOW_ARROW = `
    import { signal } from '@pyreon/reactivity'
    import { Show } from '@pyreon/core'
    import { Stack, Text } from '@pyreon/primitives'
    export function App() {
      const ready = signal<boolean>(false)
      return (
        <Stack>
          <Show when={() => ready()}>
            <Text>up</Text>
          </Show>
        </Stack>
      )
    }
  `

  it('Swift: <Show when={() => sig()}> unwraps to the condition body', () => {
    const out = transform(SHOW_ARROW, { target: 'swift' }).code
    // The canonical web reactive form — pre-fix this emitted
    // `if { ready } {` (a bare closure in `if` position, a swiftc
    // type error: "'() -> Bool' is not convertible to 'Bool'").
    expect(out).toContain('if ready {')
    expect(out).not.toContain('if { ready }')
  })

  it('Kotlin: <Show when={() => sig()}> unwraps to the condition body', () => {
    const out = transform(SHOW_ARROW, { target: 'kotlin' }).code
    // Pre-fix: `if ({ ready })` — a lambda is not a Boolean.
    expect(out).toContain('if (ready) {')
    expect(out).not.toContain('if ({ ready })')
  })

  it('parameterized arrows are NOT unwrapped (not accessors)', () => {
    // A one-param arrow in `when` would be a user error, but unwrapping
    // it would silently change meaning — leave it to the native
    // compiler to reject.
    const out = transform(
      `
      import { Show } from '@pyreon/core'
      import { Stack, Text } from '@pyreon/primitives'
      declare const pred: any
      export function App() {
        return <Stack><Show when={(x) => pred(x)}><Text>y</Text></Show></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).not.toContain('if pred(x) {')
  })

  it('Swift: disabled={() => expr} unwraps inside .disabled(...)', () => {
    const out = transform(
      `
      import { signal } from '@pyreon/reactivity'
      import { Stack, Button } from '@pyreon/primitives'
      export function App() {
        const busy = signal<boolean>(false)
        return <Stack><Button onPress={() => {}} disabled={() => busy()}>Go</Button></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    expect(out).toContain('.disabled(busy)')
    expect(out).not.toContain('.disabled({ busy })')
  })
})

describe('store-chain computed inference', () => {
  const STORE_COMPUTED = `
    import { defineStore } from '@pyreon/store'
    import { signal, computed } from '@pyreon/reactivity'
    import { Stack, Text } from '@pyreon/primitives'
    type Task = { id: number; title: string; done: boolean }
    const useApp = defineStore('app', () => {
      const tasks = signal<Task[]>([{ id: 1, title: 'x', done: false }])
      return { tasks }
    })
    export function App() {
      const remaining = computed(() => useApp().store.tasks().filter((t) => !t.done).length)
      const anyDone = computed(() => useApp().store.tasks().some((t) => t.done))
      return <Stack><Text>{remaining} open</Text></Stack>
    }
  `

  it('Swift: computed over a store read infers a concrete type (not Any)', () => {
    const out = transform(STORE_COMPUTED, { target: 'swift' }).code
    // Pre-fix: `private var remaining: Any { ... }` — compiles for
    // interpolation-only consumers but breaks arithmetic / any typed
    // position the moment the value flows further.
    expect(out).toContain('private var remaining: Int {')
    expect(out).toContain('private var anyDone: Bool {')
    expect(out).not.toContain(': Any {')
  })
})

describe('i18n two-arg t() — dict/map argument lowering', () => {
  const I18N_VALUES = `
    import { createI18n } from '@pyreon/i18n/core'
    import { signal } from '@pyreon/reactivity'
    import { Stack, Text } from '@pyreon/primitives'
    export function App() {
      const i18n = createI18n({
        locale: 'en',
        messages: { en: { greet: 'Hello {{name}}!', items_one: '{{count}} item', items_other: '{{count}} items' } },
      })
      const count = signal<number>(2)
      return (
        <Stack>
          <Text>{i18n.t('greet', { name: 'Ada' })}</Text>
          <Text>{i18n.t('items', { count: count() })}</Text>
        </Stack>
      )
    }
  `

  it('Swift: the values object lowers to a dictionary literal', () => {
    const out = transform(I18N_VALUES, { target: 'swift' }).code
    expect(out).toContain('i18n.t("greet", ["name": "Ada"])')
    expect(out).toContain('i18n.t("items", ["count": count])')
    // Pre-fix: `(name: "Ada")` — a single-field labeled tuple, a Swift
    // PARSE error (and no matching t() overload regardless).
    expect(out).not.toContain('(name: "Ada")')
  })

  it('Kotlin: the values object lowers to mapOf(...)', () => {
    const out = transform(I18N_VALUES, { target: 'kotlin' }).code
    expect(out).toContain('i18n.t("greet", mapOf("name" to "Ada"))')
    expect(out).toContain('i18n.t("items", mapOf("count" to count))')
    expect(out).not.toContain('(name = "Ada")')
  })

  it('non-i18n method named t() keeps the generic emit (conservative gate)', () => {
    const out = transform(
      `
      import { Stack, Text } from '@pyreon/primitives'
      declare const translator: any
      export function App() {
        return <Stack><Text>{translator.t('x', { a: 1 })}</Text></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    // `translator` is not a createI18n decl — the dict lowering must
    // not fire on arbitrary .t() members.
    expect(out).not.toContain('translator.t("x", ["a": 1])')
  })
})

describe('device-found fixes — testid queryability + Button testid', () => {
  // These three came from the FIRST locally-green UITest iteration:
  // the apps built, launched, and rendered, but the smokes failed on
  // element queryability — the class of bug only a real XCUITest run
  // can surface.

  it('Swift: container testid gains .accessibilityElement(children: .contain)', () => {
    const out = transform(
      `
      import { Stack, Text } from '@pyreon/primitives'
      export function App() {
        return <Stack data-testid="todo-app"><Text>hi</Text></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    // SwiftUI flattens plain layout containers out of the accessibility
    // tree — an identifier on a bare VStack is INVISIBLE to XCUITest
    // (app.otherElements["todo-app"] timed out against a perfectly
    // rendering app). `.contain` keeps children individually queryable.
    expect(out).toContain(
      '.accessibilityElement(children: .contain).accessibilityIdentifier("todo-app")',
    )
  })

  it('Swift: leaf testid does NOT gain the container semantic', () => {
    const out = transform(
      `
      import { Stack, Button } from '@pyreon/primitives'
      export function App() {
        return <Stack><Button onPress={() => {}} data-testid="go">Go</Button></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    // A Button IS an accessibility element — adding a container
    // semantic to it would break its tap targeting.
    expect(out).toContain('.accessibilityIdentifier("go")')
    expect(out).not.toContain('.accessibilityElement(children: .contain).accessibilityIdentifier("go")')
  })

  it('Swift: Button carries its data-testid (was silently dropped)', () => {
    const out = transform(
      `
      import { Stack, Button } from '@pyreon/primitives'
      export function App() {
        return <Stack><Button onPress={() => {}} data-testid="login-submit">Continue</Button></Stack>
      }
      `,
      { target: 'swift' },
    ).code
    // Pre-fix: label-based queries (app.buttons["Continue"]) worked,
    // identifier-based (app.buttons["login-submit"]) timed out.
    expect(out).toContain('Button("Continue") {')
    expect(out).toContain('.accessibilityIdentifier("login-submit")')
  })

  it('Kotlin: Button carries its data-testid via modifier = Modifier.testTag', () => {
    const out = transform(
      `
      import { Stack, Button } from '@pyreon/primitives'
      export function App() {
        return <Stack><Button onPress={() => {}} data-testid="login-submit">Continue</Button></Stack>
      }
      `,
      { target: 'kotlin' },
    ).code
    expect(out).toContain('modifier = Modifier.testTag("login-submit")')
  })
})
