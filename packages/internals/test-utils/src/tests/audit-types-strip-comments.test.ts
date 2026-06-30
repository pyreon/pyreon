import { describe, expect, it } from 'vitest'
// Pure helpers from the audit-types script (guarded by `import.meta.main`,
// so importing here does NOT run the audit).
import { blankRanges, stripComments } from '../../../../../scripts/audit-types'

describe('audit-types stripComments (oxc comment-range strip)', () => {
  it('still removes real block + line comments', () => {
    const code = '/* mentions fieldX */\nconst a = 1 // also fieldX here\n'
    expect(stripComments(code, 't.ts')).not.toContain('fieldX')
  })

  it('PRESERVES code after a string literal containing /* and */ (the regression)', () => {
    // This is the vite-plugin.ts shape: a `/*` inside a string whose matching
    // `*/` (also in a string) sits past a real code reference. The old
    // string-blind regex deleted `perfAdvisor` between them → false 0-count.
    const code = [
      'const s = "/* not a comment */"',
      'const realRef = userConfig.perfAdvisor', // must survive
      'const t = "trailing */ marker"',
    ].join('\n')
    expect(stripComments(code, 't.ts')).toContain('perfAdvisor')
  })

  it('PRESERVES a regex literal that contains comment-like sequences', () => {
    const code = 'const r = /a\\/*b/g\nconst keepMe = 1\n'
    expect(stripComments(code, 't.ts')).toContain('keepMe')
  })

  it('blankRanges replaces ranges with equal-length spaces (offsets + token separation)', () => {
    const code = 'a/* x */b'
    const out = blankRanges(code, [{ start: 1, end: 8 }])
    expect(out).toBe('a       b') // 7 spaces — length preserved, tokens not merged
    expect(out.length).toBe(code.length)
    expect(out).not.toContain('ab')
  })

  it('CONTRAST — the old regex strip deleted the ref; the new strip keeps it', () => {
    const code = 'const s = "/*"\nconst ref = perfAdvisor\nconst t = "*/"\n'
    const oldStrip = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(oldStrip).not.toContain('perfAdvisor') // the bug this fix removes
    expect(stripComments(code, 't.ts')).toContain('perfAdvisor') // the fix
  })
})
