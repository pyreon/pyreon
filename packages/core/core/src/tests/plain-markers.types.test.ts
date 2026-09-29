import { derived, signalOf, state } from '../plain'
import type { Signal } from '@pyreon/reactivity'

// Type-level contract of the Plain Mode markers. The bodies throw at runtime
// (compile-time dialect), so every call sits inside a never-invoked function.
describe('plain marker types', () => {
  it('describe the POST-compile value semantics', () => {
    const check = (): void => {
      const n: number = state(0)
      const raw: { a: number } = state.raw({ a: 1 })
      const thunk: number = derived(() => n * 2)
      const expr: string = derived(`${n}`)
      const adopted: string = state.from(null as unknown as Signal<string>)
      const ro: number = derived.from(() => 1)
      const sig: Signal<number> = signalOf(n)
      void [raw, thunk, expr, adopted, ro, sig]
      // @ts-expect-error — derived thunk is typed by its RETURN, not as a function
      const bad: () => number = derived(() => 1)
      void bad
    }
    expect(typeof check).toBe('function')
  })

  it('throw with compiler guidance when the file was not compiled', () => {
    expect(() => signalOf(1)).toThrow(/signalOf\(\) from '@pyreon\/core\/plain' reached the runtime/)
    expect(() => state.from(null as never)).toThrow(/state\.from\(\)/)
    expect(() => derived.from(() => 1)).toThrow(/derived\.from\(\)/)
    // the usual cause is a test runner without the plugin — the message says so
    expect(() => state(0)).toThrow(/vitest needs the same plugin/)
  })
})
