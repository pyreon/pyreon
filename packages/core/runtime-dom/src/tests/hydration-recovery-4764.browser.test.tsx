/**
 * Real-Chromium twin of `hydration-recovery-4764.test.tsx`: the browser's own
 * HTML parser builds the server DOM and its own DOM runs the recovery. The page
 * runs neither the compiler nor `renderToString`, so the cases carry the real
 * client emit and server HTML (`_hydration-recovery-4764-cases.ts`); the
 * happy-dom twin fails if either drifts.
 */
import { For, Fragment, h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { afterEach, describe, expect, it } from 'vitest'
import {
  _dispose2,
  _mountSlot,
  _ref,
  _setChild,
  _setChildAt,
  _tpl,
  disableHydrationWarnings,
  enableHydrationWarnings,
  hydrateRoot,
  mount,
  onHydrationMismatch,
} from '../index'
import {
  APPEND_REF_COMPILED,
  APPEND_REF_SERVER,
  CLEAR_REF_COMPILED,
  FOR_IN_RANGE_COMPILED,
  FOR_IN_RANGE_COMPILED_SERVER,
  FOR_IN_RANGE_H_SERVER,
} from './_hydration-recovery-4764-cases'

const RUNTIME = { _dispose2, _mountSlot, _ref, _setChild, _setChildAt, _tpl, For, Fragment, h }

function compiled(code: string, scope: Record<string, unknown>): () => unknown {
  const deps = { ...RUNTIME, ...scope }
  return new Function(...Object.keys(deps), `${code}\nreturn App`)(...Object.values(deps)) as () => unknown
}

/** `FOR_IN_RANGE_SRC` written for the h() path. */
const forInRangeH =
  (scope: { v: unknown; show: () => boolean; rows: () => number[] }) => () =>
    h(
      'div',
      null,
      scope.v as never,
      () =>
        scope.show()
          ? h(For as never, { each: () => scope.rows(), by: (r: number) => r }, (r: number) => h('li', null, String(r)))
          : null,
      h('span', null, 'after'),
    )

const hosts: HTMLElement[] = []

afterEach(() => {
  for (const el of hosts.splice(0)) el.remove()
})

function host(html = ''): HTMLElement {
  const el = document.createElement('div')
  document.body.appendChild(el)
  hosts.push(el)
  el.innerHTML = html
  return el
}

const shape = (el: Element) => el.innerHTML.replace(/<!--[^>]*-->/g, '')

function hydrateQuiet(el: Element, vnode: unknown): string[] {
  const errors: string[] = []
  const origError = console.error
  console.error = (...a: unknown[]) => {
    errors.push(a.map(String).join(' '))
  }
  disableHydrationWarnings()
  try {
    hydrateRoot(el, vnode as never)
  } finally {
    enableHydrationWarnings()
    console.error = origError
  }
  return errors
}

describe('#4764 in Chromium', () => {
  it('(1) a <For> with no block at its cursor stays inside its reactive range', () => {
    // h() client over the compiled server: the issue's crash.
    const el = host(FOR_IN_RANGE_COMPILED_SERVER)
    const show = signal(true)
    const rows = signal([1, 2])
    const errors = hydrateQuiet(el, h(forInRangeH({ v: [h('i', null, '1')], show, rows }) as never, null))
    expect(errors).toEqual([])
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
    rows.set([1, 2, 3])
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><li>3</li><span>after</span></div>')
    show.set(false)
    expect(shape(el)).toBe('<div><i>1</i><span>after</span></div>')
  })

  it('(2) an accessor after a divergent static array adopts its rows and keeps the trailing sibling', () => {
    const el = host(FOR_IN_RANGE_H_SERVER)
    const lis = [...el.querySelectorAll('li')]
    const span = el.querySelector('span')
    const rows = signal([1, 2])
    const errors = hydrateQuiet(el, h(forInRangeH({ v: [h('i', null, '1')], show: () => true, rows }) as never, null))
    expect(errors).toEqual([])
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
    const now = [...el.querySelectorAll('li')]
    expect(now[0]).toBe(lis[0])
    expect(now[1]).toBe(lis[1])
    expect(el.querySelector('span')).toBe(span)
    rows.set([2, 3])
    expect(shape(el)).toBe('<div><i>1</i><li>2</li><li>3</li><span>after</span></div>')
  })

  it('(3) a compiled literal slot sweeps the server nodes its value did not claim', () => {
    const el = host(FOR_IN_RANGE_COMPILED_SERVER)
    const rows = signal([1, 2])
    const scope = { v: [h('i', null, '1')], show: () => true, rows }
    const errors = hydrateQuiet(el, h(compiled(FOR_IN_RANGE_COMPILED, scope) as never, null))
    expect(errors).toEqual([])
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><span>after</span></div>')
    rows.set([1, 2, 3])
    expect(shape(el)).toBe('<div><i>1</i><li>1</li><li>2</li><li>3</li><span>after</span></div>')
  })

  it('(4) a ref that clears its element runs after the slot lines: a client mount does not throw', () => {
    const el = host()
    const errors: string[] = []
    const origError = console.error
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '))
    }
    try {
      mount(h(compiled(CLEAR_REF_COMPILED, { vArr: [h('b', null, '1'), h('i', null, '2')] }) as never, null), el)
    } finally {
      console.error = origError
    }
    expect(errors).toEqual([])
    expect(shape(el)).toBe('<p><span></span></p>')
  })

  it('(5) a ref that appends over an adopted range: no report, the fresh DOM, still live', () => {
    const el = host(APPEND_REF_SERVER)
    const b = el.querySelector('b')
    const on = signal(true)
    const reports: string[] = []
    const off = onHydrationMismatch((m) => reports.push(`${m.type}: ${String(m.expected)} vs ${String(m.actual)}`))
    try {
      hydrateRoot(el, h(compiled(APPEND_REF_COMPILED, { on }) as never, null))
    } finally {
      off()
    }
    expect(reports).toEqual([])
    expect(shape(el)).toBe('<p><span><s></s><b>on</b><u></u></span></p>')
    expect(el.querySelector('b')).toBe(b)
    on.set(false)
    expect(shape(el)).toBe('<p><span><s></s><i>off</i><u></u></span></p>')
  })
})
