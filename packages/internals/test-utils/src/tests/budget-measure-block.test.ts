import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { bundleSha256, formatMeasureBlock, MEASURE_PREFIX } from '../../../../../scripts/check-bundle-budgets'

/**
 * `check-bundle-budgets` prints a machine-readable measurement block on every
 * run so a CI Build log and a local run of the same commit can be diffed line
 * by line. The contract: one env line (bun version + platform), one line per
 * package sorted by name with raw/gzip/sha256 of the pre-compression bytes,
 * failures listed rather than dropped, and a trailer with the count.
 */
describe('formatMeasureBlock', () => {
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')

  it('prints env, one sorted line per package, and a count trailer', () => {
    const lines = formatMeasureBlock(
      [
        { name: '@pyreon/z', raw: 10, gzip: 9, sha256: sha('z') },
        { name: '@pyreon/a', raw: 20, gzip: 15, sha256: sha('a'), repaired: true },
        { name: '@pyreon/broken', raw: 0, gzip: 0, failed: true },
        { name: '@pyreon/stub', raw: 38, gzip: 50, sha256: sha('s'), unmeasurable: 'shook away' },
      ],
      { bun: '1.4.4', platform: 'linux-x64' },
    )
    expect(lines).toEqual([
      `${MEASURE_PREFIX} env bun=1.4.4 platform=linux-x64`,
      `${MEASURE_PREFIX} @pyreon/a raw=20 gzip=15 sha256=${sha('a')} repaired`,
      `${MEASURE_PREFIX} @pyreon/broken failed`,
      `${MEASURE_PREFIX} @pyreon/stub raw=38 gzip=50 sha256=${sha('s')} unmeasurable`,
      `${MEASURE_PREFIX} @pyreon/z raw=10 gzip=9 sha256=${sha('z')}`,
      `${MEASURE_PREFIX} end count=4`,
    ])
  })

  it('hashes the exact bytes that are gzipped (UTF-8), not the gzip output', () => {
    const code = 'export const s="é"'
    expect(bundleSha256(code)).toBe(createHash('sha256').update(Buffer.from(code, 'utf8')).digest('hex'))
    expect(bundleSha256(code)).not.toBe(createHash('sha256').update(gzipSync(code, { level: 9 })).digest('hex'))
  })
})
