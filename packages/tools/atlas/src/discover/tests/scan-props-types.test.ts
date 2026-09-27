/**
 * How a props TYPE becomes controls. Each case is a way people ordinarily write
 * props, and each used to lose some or all of them: a nullish union member gave
 * up on the union, a quoted name was skipped, an inherited or intersected member
 * was never read. A lost prop is a missing control AND a missing variant axis.
 */
import { describe, expect, it } from 'vitest'
import { scanSource } from '../scan'

const controls = (code: string): [string, string][] =>
  (scanSource(code)[0]?.controls ?? []).map((c) => [c.name, c.kind])

describe('props type → controls', () => {
  it('strips null/undefined from a union and unwraps parentheses', () => {
    expect(
      controls(
        `export function A(props: { size?: 'sm' | 'md' | null; on?: (() => void) | undefined; b?: (boolean) }) { return null }`,
      ),
    ).toEqual([
      ['size', 'select'],
      ['on', 'reactive'],
      ['b', 'boolean'],
    ])
  })

  it('gives up on a union with a non-string member rather than guessing', () => {
    expect(controls(`export function A(props: { v: 'a' | 1 }) { return null }`)).toEqual([['v', 'unknown']])
  })

  it('reads a quoted name, and skips computed names and methods', () => {
    expect(controls("export function A(props: { 'aria-label': string; [k]: string; m(): void }) { return null }")).toEqual([
      ['aria-label', 'text'],
    ])
  })

  it('follows `extends`, and an own member overrides an inherited one', () => {
    const code = `interface Base { size: string; tone: string }\ninterface P extends Base { size: 'sm' | 'lg' }\nexport function A(props: P) { return null }`
    expect(controls(code)).toEqual([
      ['tone', 'text'],
      ['size', 'select'],
    ])
  })

  it('keeps its own members when a base cannot be resolved or is qualified', () => {
    expect(controls(`interface P extends Nowhere { x: string }\nexport function A(props: P) { return null }`)).toEqual([['x', 'text']])
    expect(controls(`interface P extends ns.Base { x: string }\nexport function A(props: P) { return null }`)).toEqual([['x', 'text']])
  })

  it('reads every part of an intersection, through aliases and parentheses', () => {
    const code = `type Base = { a: string }\ntype P = Base & { b: number } & Missing & (Paren)\ntype Paren = { c: boolean }\nexport function A(props: P) { return null }`
    expect(controls(code)).toEqual([
      ['a', 'text'],
      ['b', 'number'],
      ['c', 'boolean'],
    ])
    expect(controls(`export function A(props: { a: string } & { b: number }) { return null }`)).toEqual([
      ['a', 'text'],
      ['b', 'number'],
    ])
    expect(controls(`type Inner = { a: string }\ntype P = (Inner)\nexport function A(props: P) { return null }`)).toEqual([['a', 'text']])
  })

  it('terminates on an `extends` cycle', () => {
    const code = `interface P extends Q { a: string }\ninterface Q extends P { b: string }\nexport function A(props: P) { return null }`
    expect(controls(code)).toEqual([
      ['b', 'text'],
      ['a', 'text'],
    ])
  })
})
