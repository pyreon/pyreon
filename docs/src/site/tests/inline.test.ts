import { describe, expect, it } from 'vitest'
import { inlineText, parseInline } from '../kit/inline'

describe('parseInline — the content inline grammar', () => {
  it('splits code, dots and <small> out of text', () => {
    expect(parseInline('Use `signal()` {dot:ok} now<small>two runs</small>')).toEqual([
      { kind: 'text', value: 'Use ' },
      { kind: 'code', value: 'signal()' },
      { kind: 'text', value: ' ' },
      { kind: 'dot', tone: 'ok' },
      { kind: 'text', value: ' now' },
      { kind: 'small', value: 'two runs' },
    ])
  })

  it('reads the reference CSS spelling {dot:var(--warn)} as a tone', () => {
    expect(parseInline('{dot:var(--warn)}x')[0]).toEqual({ kind: 'dot', tone: 'warn' })
  })

  it('keeps a hex dot as a colour and drops an unknown dot instead of printing markup', () => {
    expect(parseInline('{dot:#4ADE80}')).toEqual([{ kind: 'dotColor', color: '#4ADE80' }])
    expect(parseInline('a{dot:purple}b')).toEqual([{ kind: 'text', value: 'ab' }])
  })

  it('never treats HTML as markup: only the three forms are special', () => {
    expect(parseInline('<b>x</b> & <script>')).toEqual([{ kind: 'text', value: '<b>x</b> & <script>' }])
  })

  it('leaves a lone backtick as text', () => {
    expect(parseInline('a ` b')).toEqual([{ kind: 'text', value: 'a ` b' }])
  })

  it('inlineText flattens to plain text', () => {
    expect(inlineText('Fast `signal()`{dot:ok}<small>one run</small>')).toBe('Fast signal() one run')
  })
})
