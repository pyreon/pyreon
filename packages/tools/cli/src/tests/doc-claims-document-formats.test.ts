/**
 * The doc-claims gate rejects a docs page, README or manifest example that
 * calls `render(doc, '<format>')` with a format `@pyreon/document` does not
 * register (#4307): `render(tree, 'markdown')` was copied into two READMEs and
 * a manifest, and rejects at runtime because the format id is `'md'`.
 *
 * Bisect-verified: without the `findUnknownDocumentFormats` call in
 * `runDocClaimsGate`, the gate-level spec sees no finding.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documentFormatIds, findUnknownDocumentFormats, runDocClaimsGate } from '../doctor/gates/doc-claims'

let root = ''

const put = (rel: string, body: string): void => {
  const p = join(root, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, body)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pyreon-docformats-'))
  put(
    'packages/fundamentals/document/src/types.ts',
    "export type OutputFormat =\n  | 'html'\n  | 'pdf'\n  | 'md'\n  | 'google-chat'\n\nexport interface X {}\n",
  )
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const messages = (): string[] => findUnknownDocumentFormats(root).map((f) => f.message)

describe('document format ids in render() examples', () => {
  it('reads the format ids from the OutputFormat union', () => {
    expect([...documentFormatIds(root)]).toEqual(['html', 'pdf', 'md', 'google-chat'])
  })

  it('reports an unregistered format in docs pages, READMEs and manifests, with the line', () => {
    put('docs/src/content/docs/document.md', "# Doc\n\n```ts\nconst md = await render(tree, 'markdown')\n```\n")
    put('packages/ui-system/connector-document/README.md', 'x\n`await render(h(Doc, { a: [1, 2] }), "docxx")`\n')
    put('packages/ui-system/connector-document/src/manifest.ts', "export default { example: `render(docTree, 'markdown')` }\n")
    const found = findUnknownDocumentFormats(root)
    expect(found.map((f) => f.message)).toEqual([
      expect.stringContaining("docs/src/content/docs/document.md:4: `render(…, 'markdown')`"),
      expect.stringContaining("connector-document/README.md:2: `render(…, 'docxx')`"),
      expect.stringContaining("connector-document/src/manifest.ts:1: `render(…, 'markdown')`"),
    ])
    expect(found[0]!.fix).toContain("Use 'md'")
    expect(found[0]!.code).toBe('doc-claims/unknown-document-format')
  })

  it('reads a backtick-quoted literal format, but not an interpolated template', () => {
    put('docs/src/content/docs/tpl.md', 'await render(tree, `markdown`)\n')
    put('docs/src/content/docs/interp.md', 'await render(tree, `${fmt}`)\n')
    expect(messages()).toEqual([expect.stringContaining("tpl.md:1: `render(…, 'markdown')`")])
  })

  it('accepts built-in formats, formats registered in the same file, placeholders, methods and non-string formats', () => {
    put(
      'docs/src/content/docs/ok.md',
      [
        "await render(doc, 'pdf')",
        "await render(h(Doc, { title: 'a, b' }), 'google-chat')",
        "registerRenderer('thermal', thermal)",
        "await render(order, 'thermal')",
        "render(doc, '<format>') loads the engine on first use",
        "engine.render(node, 'whatever')",
        'render(doc, format)',
        "rerender(doc, 'nope')",
      ].join('\n'),
    )
    expect(messages()).toEqual([])
  })

  it('does not read non-manifest source, tests or build output', () => {
    put('packages/fundamentals/document/src/render.ts', "render(doc, 'markdown')\n")
    put('packages/fundamentals/document/src/tests/manifest.ts', "render(doc, 'markdown')\n")
    put('packages/fundamentals/document/lib/README.md', "render(doc, 'markdown')\n")
    expect(messages()).toEqual([])
  })

  it('is part of the doc-claims gate', async () => {
    put('scripts/check-doc-claims.ts', '// marker\n')
    put('packages/ui-system/connector-document/README.md', "render(docTree, 'markdown')\n")
    const result = await runDocClaimsGate({ cwd: root })
    expect(result.findings.map((f) => f.code)).toContain('doc-claims/unknown-document-format')
  })
})
