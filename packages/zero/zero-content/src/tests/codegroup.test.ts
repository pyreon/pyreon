/**
 * pyreon-remark-codegroup — `:::code-group` container with [label] meta.
 *
 * The plugin transforms a remark-directive ContainerDirective named
 * `code-group` into a `<CodeGroup labels=[...]>` wrapper around the
 * contained code blocks, dropping the `:::` markers in the rendered
 * output. Label is extracted from each fence's `meta` (`bash [npm]` →
 * label `npm`).
 *
 * Tests cover: 1/2/3 tabs, label whitespace stripping, missing-label
 * code blocks (dropped from the group), empty group (whole block
 * dropped), label parser unit-level edge cases.
 */
import { describe, expect, it } from 'vitest'
import { compileMarkdown } from '../pipeline/parse'
import { parseLabel } from '../pipeline/remark-plugins/codegroup'

async function out(md: string): Promise<string> {
  const result = await compileMarkdown(md, '/abs/x.md', { highlight: false })
  return result.code
}

describe('pyreon-remark-codegroup — end-to-end', () => {
  it('wraps two labeled code blocks into a <CodeGroup labels=[...]> with both code fences', async () => {
    const md = `:::code-group
\`\`\`bash [npm]
npm install x
\`\`\`
\`\`\`bash [bun]
bun add x
\`\`\`
:::`
    const code = await out(md)
    expect(code).toContain('<CodeGroup labels={["npm","bun"]}>')
    expect(code).toContain('npm install x')
    expect(code).toContain('bun add x')
    expect(code).toContain('</CodeGroup>')
  })

  it('handles a single-tab code group', async () => {
    const md = `:::code-group
\`\`\`bash [npm]
npm install x
\`\`\`
:::`
    const code = await out(md)
    expect(code).toContain('<CodeGroup labels={["npm"]}>')
    expect(code).toContain('npm install x')
  })

  it('handles three tabs in order', async () => {
    const md = `:::code-group
\`\`\`bash [npm]
npm i x
\`\`\`
\`\`\`bash [bun]
bun add x
\`\`\`
\`\`\`bash [pnpm]
pnpm add x
\`\`\`
:::`
    const code = await out(md)
    expect(code).toContain('<CodeGroup labels={["npm","bun","pnpm"]}>')
  })

  it('drops code blocks without a [label] from the group', async () => {
    const md = `:::code-group
\`\`\`bash [npm]
labelled
\`\`\`
\`\`\`bash
nolabel
\`\`\`
:::`
    const code = await out(md)
    expect(code).toContain('<CodeGroup labels={["npm"]}>')
    expect(code).toContain('labelled')
    // unlabelled code block should NOT be inside the group
    expect(code).not.toContain('nolabel')
  })

  it('emits nothing for an empty :::code-group block', async () => {
    const md = `:::code-group
:::`
    const code = await out(md)
    expect(code).not.toContain('<CodeGroup')
  })

  it('leaves non-code-group directives alone (they go to other plugins)', async () => {
    const md = `:::tip
just a tip
:::`
    const code = await out(md)
    expect(code).not.toContain('<CodeGroup')
  })
})

describe('parseLabel — unit', () => {
  it.each([
    ['[npm]', 'npm'],
    ['[bun] {2}', 'bun'],
    ['extra [label] x', 'label'],
    ['[  spaced  ]', 'spaced'],
    ['', null],
    [undefined, null],
    [null, null],
    ['no brackets here', null],
    ['[]', null],
  ])('parseLabel(%j) === %j', (input, expected) => {
    expect(parseLabel(input)).toBe(expected)
  })
})
