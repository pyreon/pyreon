import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Regression test for the echarts-subpath externalization fix.
 *
 * Pre-fix: `vl_rolldown_build` from `@vitus-labs/tools-rolldown` auto-
 * externalizes packages listed in `dependencies` + `peerDependencies`,
 * but with EXACT string matching. The bare `echarts` package matched +
 * was externalized correctly, but the dynamic loader at `src/loader.ts`
 * uses subpath imports — `echarts/charts`, `echarts/components`,
 * `echarts/renderers`, `echarts/features`. Those subpath specifiers
 * never matched the bare `echarts` external entry, so they ended up
 * INSIDE the published `lib/` — bloating the npm artifact to ~9.2 MB.
 * (The lazy-loading shape was correct — consumer apps still tree-shake
 * — but every install paid the cost in bandwidth + disk.)
 *
 * Post-fix: `vl-tools.config.mjs` lists each subpath explicitly. The
 * built `lib/` ships ~464 KB total, ~23 KB of `.js`, with everything
 * resolved from the consumer's `node_modules/echarts` at runtime.
 *
 * Locks the contract via the published-bundle byte size — if a future
 * change reverts/breaks the externalization, lib/ jumps back to multi-
 * megabyte territory and this test fails.
 *
 * Threshold: 2.5 MB. The plot surface (eleven families, maps included)
 * sits at ~1.6 MB, leaving headroom for legitimate growth — fonts,
 * generated `.d.ts` chains, additional renderers.
 * Broken state was 9.2 MB (~20× over threshold), so the test fails
 * loudly the moment regression hits, with no false-positives from
 * normal package growth.
 */
describe('charts — bundle size regression (echarts subpath externalization)', () => {
  it('lib/ total stays under 2.5 MB (~1.6 MB with the plot surface; the pre-fix duplication was 9.2 MB)', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const libDir = join(here, '..', '..', 'lib')

    if (!existsSync(libDir)) {
      throw new Error(
        `[charts/bundle-size.test] lib/ does not exist at ${libDir}. ` +
          `This test requires the package to be built first. CI runs ` +
          `\`bun scripts/bootstrap.ts\` on install which rebuilds all packages; ` +
          `if you're running this locally without a fresh install, run ` +
          `\`bun run --filter=@pyreon/charts build\` first.`,
      )
    }

    let totalBytes = 0
    const stack: string[] = [libDir]
    while (stack.length > 0) {
      const cursor = stack.pop() as string
      for (const entry of readdirSync(cursor, { withFileTypes: true })) {
        const full = join(cursor, entry.name)
        if (entry.isDirectory()) {
          stack.push(full)
        } else if (entry.isFile()) {
          totalBytes += statSync(full).size
        }
      }
    }

    // 2.5 MB: the plot subpath ships eleven families with source maps
    // (~1.6 MB total, ~370 KB of .js); the 9.2 MB duplication bug this
    // guards against is still ~4x over the line.
    const CAP = 2.5 * 1024 * 1024
    expect(totalBytes).toBeLessThan(CAP)
  })
})
