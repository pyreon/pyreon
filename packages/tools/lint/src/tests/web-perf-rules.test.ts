import { describe, expect, it } from 'vitest'
import { groupOf } from '../rules/groups'
import { allRules } from '../rules/index'
import { lintFile } from '../runner'

/**
 * The `web-perf` group — main-thread and teardown, on client-role files.
 *
 * The group's name says perf, but its subject is really "things that only go
 * wrong once a real browser is driving": a listener that blocks scrolling, a
 * rAF loop nothing can cancel, a socket closed before its handlers came off.
 * None of them are visible in a node test run, which is why they are static
 * rules rather than specs.
 *
 * `prefer-passive-listener` sat at 78% branches with no dedicated file.
 */

const cfg = {
  rules: {
    'pyreon/prefer-passive-listener': 'warn',
    'pyreon/no-unbounded-raf-loop': 'warn',
    'pyreon/no-close-before-handler-teardown': 'warn',
  },
} as never

const at = (src: string, file = 'src/widget.ts') =>
  lintFile(file, src, allRules, cfg).diagnostics
const only = (src: string, id: string, file?: string) =>
  at(src, file).filter((d) => d.ruleId === id)

describe('web-perf group wiring', () => {
  it('holds the seven client-side rules, all gated to client + shared', () => {
    const wp = allRules.filter((r) => groupOf(r.meta) === 'web-perf')
    expect(wp.map((r) => r.meta.id).sort()).toEqual([
      'pyreon/no-blocking-third-party-script',
      'pyreon/no-close-before-handler-teardown',
      'pyreon/no-layout-thrash',
      'pyreon/no-unbounded-raf-loop',
      'pyreon/prefer-passive-listener',
      'pyreon/require-abort-on-unmount',
      'pyreon/require-img-loading-hint',
    ])
    for (const r of wp) expect(r.meta.appliesTo, r.meta.id).toEqual(['client', 'shared'])
  })
})

describe('pyreon/prefer-passive-listener', () => {
  const ID = 'pyreon/prefer-passive-listener'

  it.each(['scroll', 'wheel', 'touchstart', 'touchmove', 'mousewheel'])(
    'fires on a bare %s listener',
    (evt) => {
      expect(only(`export const b = (el: any) => el.addEventListener('${evt}', fn)`, ID)).toHaveLength(1)
    },
  )

  it('stays silent with { passive: true } — the fix', () => {
    expect(
      only(`export const b = (el: any) => el.addEventListener('scroll', fn, { passive: true })`, ID),
    ).toEqual([])
  })

  it('respects an explicit { passive: false } as a stated decision', () => {
    // The rule catches the ABSENT decision, not a stated one. `passive:false`
    // is legitimate for a handler that must call preventDefault (a custom
    // gesture, a zoom surface), so overriding the author there would be
    // noise on correct code.
    expect(
      only(`export const b = (el: any) => el.addEventListener('scroll', fn, { passive: false })`, ID),
    ).toEqual([])
  })

  it('stays silent on an options object it cannot read', () => {
    expect(
      only(`export const b = (el: any, o: any) => el.addEventListener('scroll', fn, o)`, ID),
    ).toEqual([])
  })

  it('does not fire on events where passive is irrelevant', () => {
    expect(only(`export const b = (el: any) => el.addEventListener('click', fn)`, ID)).toEqual([])
  })

  it('does not fire on a computed event name it cannot read', () => {
    // Guessing at a dynamic event name would flag correct code; the rule
    // requires a string literal.
    expect(only(`export const b = (el: any, e: string) => el.addEventListener(e, fn)`, ID)).toEqual(
      [],
    )
  })
})

describe('pyreon/no-unbounded-raf-loop', () => {
  const ID = 'pyreon/no-unbounded-raf-loop'

  it('fires on a self-rescheduling loop with no captured id', () => {
    expect(
      only(
        `export function start() { requestAnimationFrame(function step() { tick(); requestAnimationFrame(step) }) }`,
        ID,
      ),
    ).toHaveLength(1)
  })

  it('stays silent when the id is captured and a canceller is returned', () => {
    expect(
      only(
        `export function start() { let id = 0\n  const step = () => { tick(); id = requestAnimationFrame(step) }\n  id = requestAnimationFrame(step)\n  return () => cancelAnimationFrame(id) }`,
        ID,
      ),
    ).toEqual([])
  })

  it('stays silent on a one-shot rAF', () => {
    expect(only(`export function paint() { requestAnimationFrame(() => draw()) }`, ID)).toEqual([])
  })
})

describe('pyreon/no-close-before-handler-teardown', () => {
  const ID = 'pyreon/no-close-before-handler-teardown'

  it('fires on close-then-detach and is silent on detach-then-close', () => {
    expect(
      only(`export const stop = (ws: any) => { ws.close()\n  ws.onmessage = null }`, ID),
    ).toHaveLength(1)
    expect(
      only(`export const stop = (ws: any) => { ws.onmessage = null\n  ws.close() }`, ID),
    ).toEqual([])
  })
})
