/**
 * The workbench app's page: which component ids become paths, and how user
 * input reaches the document.
 *
 * `atlas build` and `atlas dev` run the same zero app (see `dev/zero-app.ts`);
 * what they contribute to its page goes through `atlasDevPlugin`'s
 * `transformIndexHtml` and its `virtual:atlas/shell` module. Two of those
 * contributions are security-relevant and are guarded here:
 *
 *   * **A component id becomes a directory name.** The ids come from
 *     `componentKey`, which slugifies, so in practice they are safe — but
 *     the guard exists because "in practice" is not a property, and the
 *     failure mode is writing an `index.html` outside the output directory.
 *   * **`--title` is user input rendered into the page.** It reaches
 *     `<title>` (an HTML context) and a string literal in the shell module (a
 *     JS context), and the two need different escaping. The baked answers
 *     (component SOURCE) are user-shaped text injected into the same document.
 */
import { describe, expect, it } from 'vitest'
import { atlasDevPlugin, SHELL_ID } from '../../dev/plugin'
import { pageIds } from '../static'

const TEMPLATE = [
  '<!doctype html>',
  '<html lang="en">',
  '  <head>',
  '    <title>Atlas</title>',
  '  </head>',
  '  <body><div id="app"></div></body>',
  '</html>',
].join('\n')

function plugin(title: string | undefined, baked?: Parameters<typeof atlasDevPlugin>[0]['baked']) {
  return atlasDevPlugin({
    root: '/p',
    scanRoot: '/p/src',
    entries: [],
    ...(title !== undefined ? { title } : {}),
    ...(baked ? { baked } : {}),
  })
}

const page = (title: string | undefined, baked?: Parameters<typeof plugin>[1]): string =>
  plugin(title, baked).transformIndexHtml.handler(TEMPLATE)

describe('pageIds keeps only ids that are safe directory names', () => {
  it('keeps ordinary slugs, in order', () => {
    // The control: every "refuses X" spec below would pass against a filter
    // that dropped everything.
    const logs: string[] = []
    expect(pageIds(['button', 'core-card'], (m) => logs.push(m))).toEqual(['button', 'core-card'])
    expect(logs).toEqual([])
  })

  it('REFUSES an id that would escape the output directory, and says so', () => {
    const logs: string[] = []
    const kept = pageIds(['good', '../bad', 'a/b', 'a\\b', '.', '..', '', 'alsogood'], (m) => logs.push(m))
    expect(kept).toEqual(['good', 'alsogood'])
    expect(logs).toHaveLength(6)
    expect(logs[0]).toContain('unsafe id "../bad"')
  })
})

describe('the page title', () => {
  it('replaces the template title, defaulting to `Atlas`', () => {
    expect(page('Design System')).toContain('<title>Design System</title>')
    expect(page(undefined)).toContain('<title>Atlas</title>')
    expect(page('X').match(/<title>/g)).toHaveLength(1)
  })

  it('neutralises markup in a title', () => {
    // `--title` is user input rendered straight into an HTML context.
    const html = page('</title><script>alert(1)</script>')
    expect(html, 'no live script may be formed').not.toContain('<script>alert(1)</script>')
    expect(html, 'and the title element may not be closed early').not.toContain('</title><script')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes all five characters that matter, the ampersand first', () => {
    const line = page(`a & b < c > d " e ' f`).split('\n').find((l) => l.includes('<title>'))!
    for (const entity of ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;']) expect(line).toContain(entity)
    expect(line, 'no raw angle bracket survives inside the title').toMatch(/<title>[^<>]*<\/title>/)
    // Replacing `<` before `&` would turn a literal `&lt;` into `&amp;lt;`'s
    // double-escaped cousin.
    expect(page('&lt;')).toContain('<title>&amp;lt;</title>')
  })

  it('keeps `$` sequences literal — a string replacement would expand them', () => {
    // `String.replace` with a string expands `$&`, `$'` and `` $` ``; a title
    // or a baked answer carrying one used to splice parts of the document
    // into itself.
    expect(page("Cost $& Co $'")).toContain("<title>Cost $&amp; Co $&#39;</title>")
    const html = page('T', { inline: { source: { '': { source: "const a = '$&'; const b = \"$'\"" } } }, base: '/' })
    expect(html).toContain("$&")
    expect(html).toContain("$'")
    expect(html.match(/<\/head>/g)).toHaveLength(1)
  })
})

describe('the <head> lines', () => {
  it('a dev page carries the theme boot, the fonts and the routes flag — never baked answers', () => {
    const html = page('T')
    expect(html).toContain('pyreon-theme')
    expect(html).toContain('fonts.googleapis.com')
    expect(html).toContain('globalThis.__ATLAS_ROUTES__ = true')
    expect(html).not.toContain('__ATLAS_STATIC_RPC__')
    // Inside the head, before the body the deferred module script lives in.
    expect(html.indexOf('__ATLAS_ROUTES__')).toBeLessThan(html.indexOf('</head>'))
  })

  it('a build page carries the inline answers and where the per-component files live', () => {
    const html = page('T', { inline: { components: { '': ['Button'] } }, base: '/repo/' })
    expect(html).toContain('globalThis.__ATLAS_STATIC_RPC__ = {"components":{"":["Button"]}}')
    expect(html).toContain('globalThis.__ATLAS_STATIC_RPC_URL__ = "/repo/_atlas/rpc/"')
    expect(html.indexOf('__ATLAS_STATIC_RPC__')).toBeLessThan(html.indexOf('</head>'))
  })
})

describe('the shell module is valid JS for any title', () => {
  const shell = (title: string): string => {
    const p = plugin(title)
    return p.load(p.resolveId(SHELL_ID) as string) as string
  }

  it('embeds the title as a JS string literal, not raw', () => {
    // An unescaped quote or newline in the title is a syntax error and the
    // whole workbench fails to boot — from a value typed on the command line.
    const code = shell(`it's "quoted"\nand multiline`)
    expect(code).toBe(`export const title = ${JSON.stringify(`it's "quoted"\nand multiline`)}\n`)
  })

  it('a title containing a script-close sequence survives intact', () => {
    expect(shell('</script>')).toContain(JSON.stringify('</script>'))
  })
})
