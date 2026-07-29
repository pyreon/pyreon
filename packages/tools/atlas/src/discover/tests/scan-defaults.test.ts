/**
 * Prop DEFAULTS, read from the component body.
 *
 * Pyreon components do not destructure props, so there is no `({ size = 'md' })`
 * to read — the idiomatic default is a `??` at the use site. Getting this wrong
 * is not cosmetic: `required` is derived from it, and `required` drives both the
 * agent guide and the static a11y check.
 */
import { describe, expect, it } from 'vitest'
import { scanSource } from '../scan'

const control = (code: string, name: string, prop: string) => {
  const comp = scanSource(code).find((c) => c.name === name)!
  return comp.controls.find((c) => c.name === prop)!
}

describe('reading a default out of the body', () => {
  it('reads a `??` fallback', () => {
    const code = `
      export interface P { variant?: 'solid' | 'ghost' }
      export function Button(props: P) {
        return <b variant={props.variant ?? 'solid'} />
      }
    `
    expect(control(code, 'Button', 'variant').defaultValue).toBe('solid')
  })

  it('reads a `||` fallback too', () => {
    // An author writing `||` means the same thing, even though it also replaces
    // '' and 0. Reading only `??` would report half the ecosystem as defaultless.
    const code = `
      export interface P { size?: string }
      export const Card = (props: P) => <b size={props.size || 'md'} />
    `
    expect(control(code, 'Card', 'size').defaultValue).toBe('md')
  })

  it('reads numbers, booleans and negatives', () => {
    const code = `
      export interface P { count?: number; open?: boolean; offset?: number }
      export function Widget(props: P) {
        const c = props.count ?? 3
        const o = props.open ?? false
        const off = props.offset ?? -1
        return <b c={c} o={o} off={off} />
      }
    `
    expect(control(code, 'Widget', 'count').defaultValue).toBe(3)
    expect(control(code, 'Widget', 'open').defaultValue).toBe(false)
    expect(control(code, 'Widget', 'offset').defaultValue).toBe(-1)
  })

  it('takes the FIRST default when a prop is defaulted twice', () => {
    // Two defaults means there is no single answer. Reporting the one a reader
    // meets first beats inventing a resolution rule that depends on traversal
    // order.
    const code = `
      export interface P { tone?: string }
      export function Note(props: P) {
        const a = props.tone ?? 'info'
        const b = props.tone ?? 'warn'
        return <b a={a} b={b} />
      }
    `
    expect(control(code, 'Note', 'tone').defaultValue).toBe('info')
  })

  it('ignores a fallback that is not a literal', () => {
    // `props.x ?? computeIt()` has no knowable default. Recording the call
    // expression would put an unrenderable value in the controls panel.
    const code = `
      export interface P { label?: string }
      export function Tag(props: P) { return <b l={props.label ?? computeIt()} /> }
    `
    expect(control(code, 'Tag', 'label').defaultValue).toBeUndefined()
  })

  it('ignores a fallback on something that is not the props parameter', () => {
    const code = `
      export interface P { label?: string }
      export function Tag(props: P) {
        const other = { label: undefined }
        return <b l={other.label ?? 'not a prop default'} x={props.label} />
      }
    `
    expect(control(code, 'Tag', 'label').defaultValue).toBeUndefined()
  })
})

describe('what a default changes', () => {
  it('makes a NON-optional prop stop counting as required', () => {
    // The load-bearing consequence. `label: string` with a body default is
    // supplied by the component itself; reporting it as required makes the
    // agent guide demand it and the static a11y check fail a scenario that is
    // fine.
    const code = `
      export interface P { label: string }
      export function Button(props: P) { return <b>{props.label ?? 'Save'}</b> }
    `
    const ctrl = control(code, 'Button', 'label')
    expect(ctrl.defaultValue).toBe('Save')
    expect(ctrl.required).toBe(false)
  })

  it('leaves a genuinely required prop required', () => {
    const code = `
      export interface P { label: string }
      export function Button(props: P) { return <b>{props.label}</b> }
    `
    const ctrl = control(code, 'Button', 'label')
    expect(ctrl.defaultValue).toBeUndefined()
    expect(ctrl.required).toBe(true)
  })
})
