/**
 * Per-counter behavioural tests for @pyreon/styler.
 */
import { resolve, StyleSheet } from '@pyreon/styler'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _disable, _reset } from '../counters'
import { install, perfHarness, uninstall } from '../harness'

beforeEach(() => {
  _reset()
  install()
})

afterEach(() => {
  uninstall()
  _reset()
  _disable()
})

describe('styler.resolve', () => {
  it('fires once per resolve() call', async () => {
    const strings = ['color: ', ';'] as unknown as TemplateStringsArray
    Object.assign(strings, { raw: ['color: ', ';'] })
    const outcome = await perfHarness.record('resolve-4', () => {
      resolve(strings, ['red'], {})
      resolve(strings, ['blue'], {})
      resolve(strings, ['green'], {})
      resolve(strings, ['purple'], {})
    })
    expect(outcome.after['styler.resolve']).toBe(4)
  })
})

describe('styler.sheet.insert / .hit', () => {
  it('fires insert on first call; hit on repeat of same CSS text', async () => {
    const sheet = new StyleSheet()
    const outcome = await perfHarness.record('insert-dup', () => {
      sheet.insert('color: red')
      sheet.insert('color: red') // dup — hits insertCache
      sheet.insert('color: red') // dup — hits insertCache
      sheet.insert('color: blue') // new
    })
    expect(outcome.after['styler.sheet.insert']).toBe(4)
    expect(outcome.after['styler.sheet.insert.hit']).toBe(2)
  })

  it('insert fires even for new CSS hashed the same way on a fresh sheet', async () => {
    const sheet = new StyleSheet()
    // Different CSS text but same className (only possible if hash collides —
    // here we just show the counter reflects UNIQUE insertCache keys).
    const outcome = await perfHarness.record('three-unique', () => {
      sheet.insert('a{}')
      sheet.insert('b{}')
      sheet.insert('c{}')
    })
    expect(outcome.after['styler.sheet.insert']).toBe(3)
    expect(outcome.after['styler.sheet.insert.hit']).toBeFalsy()
  })
})
