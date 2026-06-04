/**
 * pyreon-remark-callout — `:::tip` / `:::warning` / `:::note` /
 * `:::danger` / `:::info` container directives → `<Callout>`.
 *
 * Locks per-type emission, title attribute, body passthrough (children
 * still render as normal markdown), and that non-callout directives are
 * left alone for the codegroup plugin.
 */
import { describe, expect, it } from 'vitest'
import { compileMarkdown } from '../pipeline/parse'
import { isCalloutType } from '../pipeline/remark-plugins/callout'

async function out(md: string): Promise<string> {
  const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
  return result.code
}

describe('pyreon-remark-callout — per-type emission', () => {
  it.each([
    ['tip', '<Callout type="tip">'],
    ['warning', '<Callout type="warning">'],
    ['note', '<Callout type="note">'],
    ['danger', '<Callout type="danger">'],
    ['info', '<Callout type="info">'],
  ])('emits %s as %s', async (type, expected) => {
    const md = `:::${type}
body
:::`
    const code = await out(md)
    expect(code).toContain(expected)
    expect(code).toContain('</Callout>')
  })

  it('renders body children through the markdown pipeline', async () => {
    const md = `:::tip
A tip with **bold** and a [link](/x).
:::`
    const code = await out(md)
    expect(code).toContain('<strong>bold</strong>')
    expect(code).toContain('<a href={"/x"}>link</a>')
  })

  it('preserves multi-paragraph callout bodies', async () => {
    const md = `:::warning
First paragraph.

Second paragraph.
:::`
    const code = await out(md)
    expect(code).toContain('First paragraph')
    expect(code).toContain('Second paragraph')
    // Two <p> tags inside the callout
    const matches = code.match(/<p>/g)
    expect(matches && matches.length).toBeGreaterThanOrEqual(2)
  })

  it('passes title="..." through from the directive attributes', async () => {
    // remark-directive's attribute syntax is `:::tip{title="My title"}`
    const md = `:::tip{title="My title"}
body
:::`
    const code = await out(md)
    expect(code).toContain('<Callout type="tip" title="My title">')
  })

  it('escapes < and > in the title attribute (XSS-safety)', async () => {
    // remark-directive's attribute syntax. The escapeAttr helper
    // converts <, > to entities so the emitted JSX never has
    // un-escaped tags inside the attribute literal.
    const md = `:::tip{title="A<B>C"}
body
:::`
    const code = await out(md)
    expect(code).toContain('<Callout type="tip" title="A&lt;B&gt;C">')
  })

  it('leaves unknown directive names (passed to codegroup or skipped)', async () => {
    const md = `:::custom-thing
body
:::`
    const code = await out(md)
    expect(code).not.toContain('<Callout')
  })
})

describe('isCalloutType', () => {
  it.each([
    ['tip', true],
    ['warning', true],
    ['note', true],
    ['danger', true],
    ['info', true],
    ['hint', false],
    ['code-group', false],
    ['', false],
  ])('isCalloutType(%j) === %j', (input, expected) => {
    expect(isCalloutType(input)).toBe(expected)
  })
})
