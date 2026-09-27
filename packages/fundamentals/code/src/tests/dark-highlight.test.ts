/**
 * The dark theme carries its OWN token colours.
 *
 * The editor installs `defaultHighlightStyle` as a FALLBACK highlighter, and
 * that style targets a white background (keywords `#708`, strings `#a11`). With
 * only the chrome themed dark, every keyword and string in a dark editor
 * rendered near 2:1 against `#1e1e2e` — present and unreadable.
 */
import { defaultHighlightStyle, highlightingFor, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { tags } from '@lezer/highlight'
import { describe, expect, it } from 'vitest'
import { darkTheme, lightTheme } from '../themes'

const keywordClass = (theme: unknown) =>
  highlightingFor(
    EditorState.create({
      extensions: [theme as never, syntaxHighlighting(defaultHighlightStyle, { fallback: true })],
    }),
    [tags.keyword],
  )

describe('darkTheme token colours', () => {
  it('overrides the light fallback highlighter for keywords', () => {
    const fallback = defaultHighlightStyle.style([tags.keyword])
    expect(keywordClass(lightTheme)).toBe(fallback)
    const dark = keywordClass(darkTheme)
    expect(dark).toBeTruthy()
    expect(dark).not.toBe(fallback)
  })

  it('still carries the dark facet (the minimap and dark-aware features key on it)', () => {
    const state = EditorState.create({ extensions: [darkTheme] })
    // `EditorView.darkTheme` is the facet `EditorView.theme(…, { dark: true })` sets.
    return import('@codemirror/view').then(({ EditorView }) => {
      expect(state.facet(EditorView.darkTheme)).toBe(true)
    })
  })
})
