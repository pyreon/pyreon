/**
 * The Setup-Frame Rule — contract lock.
 *
 * React forbids conditional hooks because it dispatches by CALL INDEX. Pyreon
 * has no index: components run once, so a hook is an ordinary call subject to
 * ordinary control flow. The real constraint is that a hook must run in the
 * SETUP FRAME (the synchronous component body), where the owner is active.
 *
 * This is a documented, user-facing DX claim (docs reactivity-rules.md,
 * "Where Hooks May Be Called"), so it needs a lock — otherwise a future change
 * to owner handling could silently make conditional `provide()` or looped
 * `effect()` stop working, and nothing would catch it.
 *
 * NOTE: this package applies no JSX transform — `.tsx` tests here build JSX
 * from a string via `transformJSX`, or call `h()` directly, as below.
 */
import { createContext, h, onMount, provide, useContext } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'
import { describe, expect, test } from 'vitest'
import { mount } from '../index'

const ModeCtx = createContext<string>('default')

describe('the setup-frame rule', () => {
  test('hooks in an if/else branch bind normally, including provide()', () => {
    const events: string[] = []

    const Child = () => h('span', { class: 'ctx' }, useContext(ModeCtx))
    const Panel = (props: { mode: 'a' | 'b' }) => {
      if (props.mode === 'a') {
        const draft = signal('draft-a')
        onMount(() => void events.push(`mount:${draft()}`))
        provide(ModeCtx, 'from-a')
      } else {
        onMount(() => void events.push('mount:b'))
        provide(ModeCtx, 'from-b')
      }
      return h('div', null, h(Child, null))
    }

    const hostA = document.createElement('div')
    mount(h(Panel, { mode: 'a' }), hostA)
    expect(hostA.querySelector('.ctx')!.textContent).toBe('from-a')
    expect(events).toContain('mount:draft-a')

    // The OTHER branch must work identically — a call-index framework would
    // have shifted every hook after the conditional here.
    const hostB = document.createElement('div')
    mount(h(Panel, { mode: 'b' }), hostB)
    expect(hostB.querySelector('.ctx')!.textContent).toBe('from-b')
    expect(events).toContain('mount:b')
  })

  test('hooks called in a LOOP each get their own reactive identity', () => {
    const runs: string[] = []
    const Rows = (props: { n: number }) => {
      const cells: ReturnType<typeof signal<number>>[] = []
      for (let i = 0; i < props.n; i++) {
        const cell = signal(i)
        cells.push(cell)
        effect(() => void runs.push(`eff${i}:${cell()}`))
      }
      // Writing ONE cell must re-run only ITS effect — proof each loop
      // iteration produced an independent signal, not a shared slot.
      cells[1]!.set(99)
      return h('div', null, String(cells.length))
    }

    const host = document.createElement('div')
    mount(h(Rows, { n: 3 }), host)

    expect(host.textContent).toBe('3')
    expect(runs.filter((r) => r.startsWith('eff'))).toEqual([
      'eff0:0',
      'eff1:1',
      'eff2:2',
      'eff1:99',
    ])
  })

  test('a hook count that DIFFERS between mounts of the same component is fine', () => {
    // The shape React's rules-of-hooks exists to forbid.
    const mounted: number[] = []
    const Var = (props: { n: number }) => {
      for (let i = 0; i < props.n; i++) onMount(() => void mounted.push(i))
      return h('div', null, 'ok')
    }
    mount(h(Var, { n: 1 }), document.createElement('div'))
    mount(h(Var, { n: 3 }), document.createElement('div'))
    expect(mounted).toEqual([0, 0, 1, 2])
  })

  test('a data-driven hook call per runtime item — the practical payoff', () => {
    // Discovered at runtime, not known statically: one hook per field.
    const fields = ['name', 'email', 'role']
    const Form = () => {
      const values = Object.fromEntries(fields.map((f) => [f, signal(`${f}-0`)]))
      values['email']!.set('email-1')
      return h('div', { class: 'out' }, fields.map((f) => values[f]!()).join(','))
    }
    const host = document.createElement('div')
    mount(h(Form, null), host)
    expect(host.querySelector('.out')!.textContent).toBe('name-0,email-1,role-0')
  })
})
