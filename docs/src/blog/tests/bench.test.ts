import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import blogCopy from '../../site/content/pages/channels/blog.json'
import { BENCH_HREF, rewriteBenchBlocks } from '../bench'

const LABEL = 'Every result →'

describe('rewriteBenchBlocks', () => {
  it('wraps the list in the bench block and adds the link to the benchmarks page', () => {
    const out = rewriteBenchBlocks('Intro:\n\n::: bench\n- **2.6×** faster\n- **17.2 KB** gzipped\n:::\n\nAfter.\n', LABEL)
    expect(out).toBe(
      ['Intro:', '', '<div class="blog-bench" data-bench="">', '', '- **2.6×** faster', '- **17.2 KB** gzipped', '', `[${LABEL}](${BENCH_HREF})`, '', '</div>', '', 'After.', ''].join('\n'),
    )
  })

  it('leaves a source without a bench block alone, other containers included', () => {
    const src = '::: tip\n- **a** b\n:::\n'
    expect(rewriteBenchBlocks(src, LABEL)).toBe(src)
  })

  it('rejects an unclosed block, an empty one and an item without its number in bold', () => {
    expect(() => rewriteBenchBlocks('::: bench\n- **1×** a\n', LABEL, 'p.md')).toThrow(/p\.md:1: `::: bench` is not closed/)
    expect(() => rewriteBenchBlocks('::: bench\n:::\n', LABEL)).toThrow(/needs a list/)
    expect(() => rewriteBenchBlocks('::: bench\n- 2.6× faster\n:::\n', LABEL)).toThrow(/number in bold/)
    expect(() => rewriteBenchBlocks('::: bench\n- **1×** a\n:::\n', 'a [b]')).toThrow(/must not contain/)
  })

  it('every bench block in the posts is valid, with the label from the content set', () => {
    const dir = resolve(__dirname, '../../content/blog')
    let blocks = 0
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const src = readFileSync(resolve(dir, f), 'utf8')
      const out = rewriteBenchBlocks(src, blogCopy.bench.more, f)
      blocks += (out.match(/data-bench=""/g) ?? []).length
      expect(out, f).not.toMatch(/^:::[ \t]*bench/m)
    }
    expect(blocks).toBeGreaterThanOrEqual(3)
  })
})
