import {
  renderApiReferenceEntries,
  renderLlmsFullSection,
  renderLlmsTxtLine,
} from '@pyreon/manifest'
import manifest from '../manifest'

describe('gen-docs — connector-document snapshot', () => {
  it('renders to llms.txt bullet', () => {
    expect(renderLlmsTxtLine(manifest)).toMatchInlineSnapshot(
      `"- @pyreon/connector-document — Bridge between ui-system JSX trees and @pyreon/document — extracts a DocNode tree for multi-format export. Extraction is a snapshot — reactive accessor children and function-valued \`_documentProps\` are resolved (called) at extraction time, not subscribed; re-run \`extractDocumentTree\` after a signal change to export the live state."`,
    )
  })

  it('renders to llms-full.txt section', () => {
    expect(renderLlmsFullSection(manifest)).toMatchInlineSnapshot(`
      "## @pyreon/connector-document — UI ↔ Document Bridge

      The bridge between Pyreon's component layer and the \`@pyreon/document\` rendering pipeline. \`extractDocumentTree(vnode)\` walks a Pyreon JSX tree, finds components carrying a \`_documentType\` marker (the 18 \`@pyreon/document-primitives\`, or your own marked components), resolves their \`_documentProps\` and \`$rocketstyle\` CSS-in-JS styles, and produces a serializable \`DocNode\` tree that \`@pyreon/document\` renders to PDF, DOCX, XLSX, email, Markdown, and the other output formats. The hot path is fast: real rocketstyle primitives expose their accumulated \`.attrs()\` chain as \`__rs_attrs\`, and the extractor runs that chain directly — no styled-wrapper invocation, no dimension resolution.

      \`\`\`typescript
      import { extractDocumentTree, resolveStyles } from '@pyreon/connector-document'
      import { render } from '@pyreon/document'
      import { DocDocument, DocHeading, DocText } from '@pyreon/document-primitives'

      const vnode = (
        <DocDocument title="Q4 Report" author="Acme Inc.">
          <DocHeading level="h1">Summary</DocHeading>
          <DocText>Revenue was up 12%.</DocText>
        </DocDocument>
      )

      // Walk the JSX tree → format-agnostic DocNode tree
      const docTree = extractDocumentTree(vnode)
      const pdf = await render(docTree, 'pdf')      // Buffer
      const docx = await render(docTree, 'docx')    // Buffer
      const md = await render(docTree, 'markdown')  // string

      // Extraction is a SNAPSHOT — reactive accessors are resolved at extraction
      // time, not subscribed. Re-extract after a signal change for a fresh tree:
      const freshTree = extractDocumentTree(vnode)

      // Under init({ cssVariables: true }), inline var(--…) values via resolveVar:
      import { resolveModeVar } from '@pyreon/rocketstyle'
      import { resolveCssVarReferences, themeToCssVars } from '@pyreon/unistyle'
      const { registry } = themeToCssVars(theme)
      const tree = extractDocumentTree(vnode, {
        resolveVar: (v) => resolveCssVarReferences(resolveModeVar(v, mode), registry),
      })

      // Standalone style resolution — $rocketstyle theme object → document styles:
      const styles = resolveStyles({ fontSize: '1.5rem', color: '#222', padding: '12px 16px' }, 16)
      // → { fontSize: 24, color: '#222', padding: [12, 16] }
      \`\`\`

      > **Note**: Extraction is a snapshot — reactive accessor children and function-valued \`_documentProps\` are resolved (called) at extraction time, not subscribed; re-run \`extractDocumentTree\` after a signal change to export the live state.
      >
      > **Marker contract**: A component is extractable when it carries \`_documentType\` — via rocketstyle \`.statics()\` (read from \`.meta\`) or as a direct static on a plain function. Unmarked components and DOM elements are transparent: their children flatten into the parent.
      >
      > **Test with real primitives**: Mock vnodes that pre-attach \`_documentProps\` bypass the rocketstyle \`__rs_attrs\` fast path — the PR #197 silent-metadata-drop hid exactly there. Pair every mock-vnode test with a real-\`h()\` primitive test (see \`.claude/rules/test-environment-parity.md\`).
      >
      > **cssVariables mode**: Under \`init({ cssVariables: true })\`, \`$rocketstyle\` values are \`var(--…)\` strings that PDF/DOCX/email cannot evaluate — pass \`ExtractOptions.resolveVar\` (compose \`resolveModeVar\` + \`resolveCssVarReferences\`) to inline them at extraction time.
      "
    `)
  })

  it('renders to MCP api-reference entries', () => {
    const record = renderApiReferenceEntries(manifest)
    expect(Object.keys(record).length).toBe(10)
    expect(record['connector-document/extractDocumentTree']!.notes).toContain('DocNode')
    expect(record['connector-document/extractDocumentTree']!.mistakes?.split('\n').length).toBe(6)
  })
})
