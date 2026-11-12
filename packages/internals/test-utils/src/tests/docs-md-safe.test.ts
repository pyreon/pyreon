import { describe, expect, it } from 'vitest'
import { escFlow } from '../../../../../docs/scripts/_md-safe'

/**
 * `escFlow` makes generated docs safe for the MDX-ish `@pyreon/zero-content`
 * pipeline: flow text is escaped, inline code spans stay raw. A span that
 * quotes backticks needs a longer fence (`` `` a `b` c `` ``); scanning only
 * single backticks escaped such a span's own text (`<For>` rendered as
 * `&lt;For&gt;` inside the code) and could leave the text after it raw.
 */
describe('escFlow', () => {
  it('escapes flow text and leaves single-backtick spans raw', () => {
    expect(escFlow('a <b> {c} `<d> {e}` f:g')).toBe('a &lt;b&gt; &#123;c&#125; `<d> {e}` f&#58;g')
  })

  it('leaves a double-backtick span that quotes backticks raw', () => {
    const src = 'throws a `` [Pyreon] <For> requires a `by` prop `` error; supply `by={item => item.id}`'
    expect(escFlow(src)).toBe(src)
  })

  it('escapes flow text between multi-backtick spans', () => {
    expect(escFlow('`` a`b `` <x> ``` c``d ``` {y}')).toBe('`` a`b `` &lt;x&gt; ``` c``d ``` &#123;y&#125;')
  })

  it('treats an unclosed backtick run as flow text', () => {
    expect(escFlow('`` <x>')).toBe('`` &lt;x&gt;')
  })
})
