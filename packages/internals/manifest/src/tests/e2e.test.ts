import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import flowManifest from '../../../../fundamentals/flow/src/manifest'
import {
  findManifests,
  regenerateLlmsFullTxt,
  regenerateLlmsTxt,
} from '../../../../../scripts/gen-docs-core'

// End-to-end pipeline coverage: real manifests walked from the real
// repo → real regenerateLlmsTxt → compared to the checked-in llms.txt.
// Unit tests cover renderLlmsTxtLine and regenerateLlmsTxt in isolation;
// this test asserts the COMPOSITION of the two plus findManifests
// produces the file that ships.

const SELF = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(dirname(SELF), '../../../../..')

// `findManifests(REPO_ROOT)` dynamically imports every manifest.ts in the
// monorepo (~50 files). On cold CI runners with no transform cache the
// per-import bun-side compilation cost adds up — locally these tests run
// in ~250ms but CI consistently hit the 5s default ceiling. 30s gives
// plenty of headroom while still failing fast on a genuine hang.
const FIND_MANIFESTS_TIMEOUT = 30_000

describe('gen-docs — end-to-end', () => {
  it(
    'regenerating from all real manifests yields the checked-in llms.txt byte-for-byte',
    async () => {
      const manifests = await findManifests(REPO_ROOT)
      const llmsTxtPath = join(REPO_ROOT, 'llms.txt')
      const current = readFileSync(llmsTxtPath, 'utf8')
      const { contents, missingEntries } = regenerateLlmsTxt(current, manifests)
      // If this fails, the generator and the checked-in file disagree.
      // Fix: `bun run gen-docs` and commit the result.
      expect(missingEntries).toEqual([])
      expect(contents).toBe(current)
    },
    FIND_MANIFESTS_TIMEOUT,
  )

  it('flow manifest produces a bullet that appears verbatim in llms.txt', async () => {
    const llmsTxtPath = join(REPO_ROOT, 'llms.txt')
    const current = readFileSync(llmsTxtPath, 'utf8')
    const { contents } = regenerateLlmsTxt(current, [
      { path: 'flow', manifest: flowManifest },
    ])
    expect(contents).toBe(current)
    expect(current).toContain(`- ${flowManifest.name} — ${flowManifest.tagline}`)
  })

  it(
    'regenerating from all real manifests yields the checked-in llms-full.txt byte-for-byte',
    async () => {
      const manifests = await findManifests(REPO_ROOT)
      const llmsFullPath = join(REPO_ROOT, 'llms-full.txt')
      const current = readFileSync(llmsFullPath, 'utf8')
      const { contents, missingEntries } = regenerateLlmsFullTxt(current, manifests)
      expect(missingEntries).toEqual([])
      expect(contents).toBe(current)
    },
    FIND_MANIFESTS_TIMEOUT,
  )
})

describe('gen-docs-core — no shebang', () => {
  // Regression guard: gen-docs-core.ts must NOT have a shebang. Tools
  // like Rolldown/Vite reject the `#!/usr/bin/env bun` line when this
  // file is bundled from downstream test files (like the flow snapshot
  // test). The CLI entry (gen-docs.ts) keeps its shebang; this file
  // stays clean so it's importable from any test runner.
  it('gen-docs-core.ts first line is not a shebang', () => {
    const corePath = resolve(SELF, '../../../../../../scripts/gen-docs-core.ts')
    const first = readFileSync(corePath, 'utf8').split('\n', 1)[0]!
    expect(first.startsWith('#!')).toBe(false)
  })

  it('render.ts first line is not a shebang', () => {
    const renderPath = resolve(SELF, '../../render.ts')
    const first = readFileSync(renderPath, 'utf8').split('\n', 1)[0]!
    expect(first.startsWith('#!')).toBe(false)
  })
})
