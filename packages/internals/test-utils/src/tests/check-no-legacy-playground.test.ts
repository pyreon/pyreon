import { describe, expect, it } from 'vitest'
import { scanFile } from '../../../../../scripts/check-no-legacy-playground'

describe('check-no-legacy-playground.scanFile', () => {
  it('finds top-level <Playground directives', () => {
    const md = `
# Title

<Playground title="X" code={\`...\`} />

Some text.
`
    const hits = scanFile(md)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.source).toContain('<Playground')
  })

  it('SKIPS <Playground inside fenced code blocks (deliberate prose example)', () => {
    const md = `
# Title

\`\`\`md
<Playground title="example showing what this looked like" />
\`\`\`

Body.
`
    const hits = scanFile(md)
    expect(hits).toHaveLength(0)
  })

  it('handles mixed: inside fence + outside fence', () => {
    const md = `
\`\`\`md
<Playground />
\`\`\`

<Playground real="yes" />
`
    const hits = scanFile(md)
    expect(hits).toHaveLength(1)
    expect(hits[0]!.source).toContain('real="yes"')
  })

  it('returns empty for clean files', () => {
    expect(scanFile('# Hello\n\nNo legacy here.\n')).toHaveLength(0)
  })

  it('preserves line numbers (1-indexed)', () => {
    const md = '# A\n\n## B\n\n<Playground />\n'
    const hits = scanFile(md)
    expect(hits[0]!.line).toBe(5)
  })
})
