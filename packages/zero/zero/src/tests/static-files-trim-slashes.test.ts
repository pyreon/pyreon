/**
 * `trimSlashes` replaced `replace(/^\/+|\/+$/g, '')` on `assetsDir`, which
 * CodeQL flagged as polynomial (`js/polynomial-redos`): the `\/+$` branch is
 * retried from every `/` of a run that does not end the string. The linear
 * scan must be semantically identical to the regex on ordinary input and stay
 * linear on the adversarial shape.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { listStaticFiles, trimSlashes } from '../adapters/static-files'

// The pre-fix implementation, kept as the oracle for ordinary inputs.
const regexTrim = (value: string): string => value.replace(/^\/+|\/+$/g, '')

describe('trimSlashes', () => {
  it('matches the previous regex on ordinary inputs', () => {
    const inputs = [
      '',
      '/',
      '//',
      'assets',
      '/assets',
      'assets/',
      '/assets/',
      '///assets///',
      'static/js',
      '/static/js/',
      'a//b',
      '//a//b//',
      'x',
      '/x/',
    ]
    for (const input of inputs) expect(trimSlashes(input), JSON.stringify(input)).toBe(regexTrim(input))
  })

  it('stays fast on a long leading slash run', () => {
    const adversarial = `${'/'.repeat(100_000)}x`
    const start = performance.now()
    const result = trimSlashes(adversarial)
    const elapsed = performance.now() - start
    expect(result).toBe('x')
    // Bound is generous so a loaded CI runner cannot flake it.
    expect(elapsed).toBeLessThan(100)
  })

  // The shape that is actually quadratic for the regex: `\/+$` is retried from
  // every `/` of the run and fails at `b` each time. Measured ~16s in V8 for
  // the old regex at this size; the scan is sub-millisecond.
  it('stays linear on a slash run that does not end the string', () => {
    const adversarial = `a${'/'.repeat(100_000)}b`
    const start = performance.now()
    expect(trimSlashes(adversarial)).toBe(adversarial)
    expect(performance.now() - start).toBeLessThan(100)
  })
})

describe('listStaticFiles — assetsDir normalization', () => {
  it('treats a slash-wrapped assetsDir the same as the bare name', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pyreon-static-trim-'))
    try {
      await mkdir(join(dir, 'static'), { recursive: true })
      await writeFile(join(dir, 'static', 'app-abc123.js'), '')
      await writeFile(join(dir, 'robots.txt'), '')
      expect(await listStaticFiles(dir, { assetsDir: '//static//' })).toEqual(['/robots.txt'])
      expect(await listStaticFiles(dir, { assetsDir: 'static' })).toEqual(['/robots.txt'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
