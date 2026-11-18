/**
 * `no-imperative-effect-on-create` and `no-effect-in-mount` judge the same
 * `effect()` from two placements: at component setup, and inside `onMount`.
 * They must never send a user in a circle (#4397): for every effect body,
 * exactly ONE of the two placements is accepted by both rules.
 *
 * - An imperative body (DOM, browser globals, IO, scheduling) is flagged at
 *   setup and accepted inside `onMount`.
 * - A pure reactive body is accepted at setup and flagged inside `onMount`.
 */
import { describe, expect, it } from 'vitest'
import { lintFile } from '../runner'
import { noEffectInMount } from '../rules/lifecycle/no-effect-in-mount'
import { noImperativeEffectOnCreate } from '../rules/lifecycle/no-imperative-effect-on-create'

const A = 'pyreon/no-imperative-effect-on-create'
const B = 'pyreon/no-effect-in-mount'

function ruleIds(code: string): string[] {
  return lintFile('src/c.tsx', code, [noImperativeEffectOnCreate, noEffectInMount], {
    rules: { [A]: 'error', [B]: 'error' },
  }).diagnostics.map((d) => d.ruleId)
}

const atSetup = (body: string): string =>
  `export function C() { effect(() => { ${body} }); return null }`

const inMount = (body: string): string =>
  `export function C() { onMount(() => { effect(() => { ${body} }) }); return null }`

const imperative: Array<[string, string]> = [
  ['a reactive write to a browser global (the issue)', 'document.title = `Count: ${count()}`'],
  ['a reactive DOM call', 'if (open()) el.focus()'],
  ['a reactive storage write', "localStorage.setItem('k', String(count()))"],
  ['a reactive scheduling call', 'const id = setTimeout(() => tick(), delay())'],
]

const pure: Array<[string, string]> = [
  ['a signal-to-signal write', 'sum.set(a() + b())'],
  ['a logging subscription', 'console.log(count())'],
]

describe('effect placement: the two lifecycle rules agree (#4397)', () => {
  for (const [name, body] of imperative) {
    it(`${name}: flagged at setup, accepted inside onMount`, () => {
      expect(ruleIds(atSetup(body))).toEqual([A])
      expect(ruleIds(inMount(body))).toEqual([])
    })
  }
  for (const [name, body] of pure) {
    it(`${name}: accepted at setup, flagged inside onMount`, () => {
      expect(ruleIds(atSetup(body))).toEqual([])
      expect(ruleIds(inMount(body))).toEqual([B])
    })
  }

  it('the setup-time message names onMount for a reactive effect and useHead for the title', () => {
    const msg = lintFile('src/c.tsx', atSetup(imperative[0]![1]), [noImperativeEffectOnCreate], {
      rules: { [A]: 'error' },
    }).diagnostics[0]?.message
    expect(msg).toContain('onMount(() => { effect(')
    expect(msg).toContain('useHead')
  })
})
