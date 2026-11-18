import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lint } from '../lint'

// oxc recovers from syntax errors and returns a partial program; the rules ran
// on it and a broken file came back "✓ no problems". A parse error is now a
// fatal per-file diagnostic (the ESLint convention).
describe('lint — a file that does not parse', () => {
  it('reports pyreon-lint/parse-error and runs no rules on it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-lint-parse-'))
    try {
      mkdirSync(join(dir, 'src'), { recursive: true })
      writeFileSync(join(dir, 'src', 'broken.tsx'), 'export const C = () => <div>\n')
      writeFileSync(join(dir, 'src', 'ok.ts'), 'export const x = 1\n')
      const result = lint({ paths: [dir] })
      const broken = result.files.find((f) => f.filePath.endsWith('broken.tsx'))
      expect(broken?.diagnostics).toHaveLength(1)
      expect(broken?.diagnostics[0]).toMatchObject({
        ruleId: 'pyreon-lint/parse-error',
        severity: 'error',
        loc: { line: 1 },
      })
      expect(broken?.diagnostics[0]?.message).toMatch(/^Parsing error: Unexpected token\. The file does not parse/)
      const ok = result.files.find((f) => f.filePath.endsWith('ok.ts'))
      expect(ok?.diagnostics ?? []).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
