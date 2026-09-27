import { describe, expect, it } from 'vitest'
import { createRichTextEditor } from '../index'
import { htmlToJson, jsonToHtml } from '../html'

describe('pre-mount HTML content (no engine loaded)', () => {
  it('text / counts / isEmpty describe an HTML draft before mount', () => {
    const editor = createRichTextEditor({ content: '<p>Hello world</p><p>again</p>' })
    expect(editor.isEmpty()).toBe(false)
    expect(editor.text()).toBe('Hello world\n\nagain')
    expect(editor.characterCount()).toBe(16)
    expect(editor.wordCount()).toBe(3)
    expect(editor.json()).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'again' }] },
      ],
    })
  })

  it('html() follows a pre-mount json.set instead of the config string', () => {
    const editor = createRichTextEditor({ content: '<p>Hi</p>' })
    expect(editor.html()).toBe('<p>Hi</p>')
    editor.json.set({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Bye <now>' }] }],
    })
    expect(editor.html()).toBe('<p>Bye &lt;now&gt;</p>')
  })

  it('setContent(html) before mount updates json/text/html', () => {
    const editor = createRichTextEditor()
    editor.setContent('<h2>Title</h2><ul><li><p>one</p></li></ul>')
    expect(editor.text()).toBe('Title\n\none')
    expect(editor.wordCount()).toBe(2)
    expect(editor.html()).toBe('<h2>Title</h2><ul><li><p>one</p></li></ul>')
    editor.setContent({ type: 'doc', content: [] })
    expect(editor.isEmpty()).toBe(true)
  })

  it('readOnly is an alias for editable: false (explicit editable wins)', () => {
    expect(createRichTextEditor({ readOnly: true }).editable()).toBe(false)
    expect(createRichTextEditor({ readOnly: false }).editable()).toBe(true)
    expect(createRichTextEditor({ readOnly: true, editable: true }).editable()).toBe(true)
  })
})

describe('htmlToJson / jsonToHtml', () => {
  it('maps the StarterKit vocabulary and round-trips', () => {
    const html =
      '<h1>T</h1><p>a <strong>b</strong> <em>c</em> <a href="/x">l</a><br>d</p>' +
      '<blockquote><p>q</p></blockquote><ol><li><p>1</p></li></ol><pre><code>x  y</code></pre><hr>'
    expect(jsonToHtml(htmlToJson(html))).toBe(html)
  })

  it('covers every mapped block and mark', () => {
    const html =
      '<h2>a</h2><h3>b</h3><h4>c</h4><h5>d</h5><h6>e</h6>' +
      '<ul><li><p><b>1</b><i>2</i><s>3</s><del>4</del><u>5</u><code>6</code><a>7</a></p></li></ul>' +
      '<pre></pre><p> </p><section>loose</section>'
    expect(jsonToHtml(htmlToJson(html))).toBe(
      '<h2>a</h2><h3>b</h3><h4>c</h4><h5>d</h5><h6>e</h6>' +
        '<ul><li><p><strong>1</strong><em>2</em><s>3</s><s>4</s><u>5</u><code>6</code><a>7</a></p></li></ul>' +
        '<pre><code></code></pre><p></p><p>loose</p>',
    )
    // Trailing whitespace at the end of a block collapses away.
    expect(jsonToHtml(htmlToJson('<p>a </p><p><b> </b></p><p><b>c</b> </p>'))).toBe(
      '<p>a</p><p></p><p><strong>c</strong></p>',
    )
    // Comments are dropped; a trailing space in loose text is trimmed.
    expect(jsonToHtml(htmlToJson('x <b>y<!-- inline --></b> <!-- note -->'))).toBe('<p>x <strong>y</strong></p>')
    expect(jsonToHtml(htmlToJson('x '))).toBe('<p>x</p>')
    // A text node without `text` serializes as empty.
    expect(jsonToHtml({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text' }] }] })).toBe('<p></p>')
    // Unknown node / mark types serialize their content only; a heading with
    // no level falls back to h1.
    expect(
      jsonToHtml({
        type: 'doc',
        content: [
          { type: 'heading', content: [{ type: 'text', text: 'h' }] },
          { type: 'custom', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight' }] }] },
        ],
      }),
    ).toBe('<h1>h</h1>x')
  })

  it('wraps loose text and treats unknown wrappers as transparent', () => {
    expect(htmlToJson('Hello')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    })
    expect(jsonToHtml(htmlToJson('<div><p>a</p><p>b</p></div>'))).toBe('<p>a</p><p>b</p>')
  })

  it('escapes text and attributes when serializing', () => {
    expect(
      jsonToHtml({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: '<x>&', marks: [{ type: 'link', attrs: { href: '"><s>' } }] }],
          },
        ],
      }),
    ).toBe('<p><a href="&quot;&gt;&lt;s&gt;">&lt;x&gt;&amp;</a></p>')
  })

  it('falls back to a DOM-free scan without DOMParser', () => {
    const saved = globalThis.DOMParser
    ;(globalThis as { DOMParser?: unknown }).DOMParser = undefined
    try {
      const json = htmlToJson('<p>a &amp; <b>b</b></p><h2>c</h2>d<br>e &bogus; f & g<unclosed')
      expect(json.content?.map((b) => b.content?.[0]?.text)).toEqual(['a & b', 'c', 'd', 'e &bogus; f & g'])
    } finally {
      globalThis.DOMParser = saved
    }
  })
})
