/**
 * Vite plugin contract: `transform` returns Pyreon JSX for `.md` /
 * `.mdx` inputs, passes through everything else.
 */
import { describe, expect, it } from 'vitest'
import content, { isMarkdownId } from '../plugin'

describe('content() Vite plugin', () => {
  it('has the expected name + `pre` ordering', () => {
    const plugin = content()
    expect(plugin.name).toBe('pyreon-zero-content')
    expect(plugin.enforce).toBe('pre')
  })

  it('transforms .md files into TSX modules', () => {
    const plugin = content()
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string; map: null } | null
    const result = transform.call({} as never, '# Title', '/abs/x.md')
    expect(result).not.toBeNull()
    expect(result!.code).toContain('export default function ContentPage()')
    expect(result!.code).toContain('<h1')
  })

  it('passes through non-markdown files (returns null)', () => {
    const plugin = content()
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => unknown
    expect(transform.call({} as never, '// js', '/abs/x.ts')).toBeNull()
    expect(transform.call({} as never, '<div/>', '/abs/x.tsx')).toBeNull()
    expect(transform.call({} as never, '{}', '/abs/x.json')).toBeNull()
  })

  it('transforms .mdx files (foundation; PR 3 makes them MDX-aware)', () => {
    const plugin = content()
    const transform = plugin.transform as (
      code: string,
      id: string,
    ) => { code: string } | null
    const result = transform.call({} as never, '# Title', '/abs/x.mdx')
    expect(result).not.toBeNull()
  })
})

describe('isMarkdownId', () => {
  it.each([
    ['/abs/x.md', true],
    ['/abs/x.mdx', true],
    ['/abs/x.MD', true],
    ['/abs/x.tsx', false],
    ['/abs/x.json', false],
    ['/abs/x.md?raw', true],   // query-suffixed imports still count
    ['/abs/x.md#anchor', true], // hash-suffixed imports still count
    ['/abs/x.markdown', false], // not a recognized extension
    ['/abs/x', false],
  ])('isMarkdownId(%j) === %j', (input, expected) => {
    expect(isMarkdownId(input)).toBe(expected)
  })
})
