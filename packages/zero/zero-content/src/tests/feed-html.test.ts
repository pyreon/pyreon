// @vitest-environment node
/**
 * `markdownToFeedHtml` renders an RSS item body that is read OFF the site —
 * by a feed reader or an importer such as dev.to. Nothing resolves a
 * relative URL there, and nothing renders the site's components.
 */
import { describe, expect, it } from 'vitest'
import { markdownToFeedHtml } from '../seo/feed-html'

const PAGE = 'https://pyreon.dev/blog/post'

describe('markdownToFeedHtml', () => {
  it('drops the frontmatter and renders GFM (tables, code)', () => {
    const html = markdownToFeedHtml(
      '---\ntitle: T\n---\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n```js\nconst x = 1 < 2\n```\n',
      PAGE,
    )
    expect(html).not.toContain('title: T')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
    expect(html).toContain('<pre><code class="language-js">const x = 1 &#x3C; 2\n</code></pre>')
  })

  it('makes root-relative, relative and anchor URLs absolute', () => {
    const html = markdownToFeedHtml(
      '[a](/docs/x) [b](other) [c](#h) ![i](/blog/c.png) [d](https://e.com/)',
      PAGE,
    )
    expect(html).toContain('href="https://pyreon.dev/docs/x"')
    expect(html).toContain('href="https://pyreon.dev/blog/other"')
    expect(html).toContain('href="https://pyreon.dev/blog/post#h"')
    expect(html).toContain('src="https://pyreon.dev/blog/c.png"')
    expect(html).toContain('href="https://e.com/"')
  })

  it('drops raw HTML and keeps a container directive as its content', () => {
    const html = markdownToFeedHtml(
      '<!-- note -->\n<script>x()</script>\n\n:::tip\nInside **tip**\n:::\n',
      PAGE,
    )
    expect(html).not.toContain('note')
    expect(html).not.toContain('<script')
    expect(html).toContain('<strong>tip</strong>')
  })
})
