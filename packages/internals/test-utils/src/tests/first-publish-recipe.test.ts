import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '../../../../../scripts')
const read = (f: string) => readFileSync(join(SCRIPTS, f), 'utf-8')

/**
 * The first publish of a new scoped package cannot go through OIDC — a trusted
 * publisher can only be attached to a package that already exists — so it has
 * to be run by hand. Both `publish.ts` and `check-published-state.ts` PRINT the
 * recipe for that, and the obvious one is wrong:
 *
 *   bun publish --access=public        # from the package directory
 *
 * `publish.ts` REWRITES each manifest before publishing — it resolves
 * `workspace:*` dependencies to real versions, strips the `bun` export
 * condition (which points at `src/index.ts`), and drops `src` from `files`.
 * A bare `bun publish` skips all of it, so the bootstrap tarball would carry
 * `workspace:*` deps — `npm i` then hard-fails with `EUNSUPPORTEDPROTOCOL`,
 * the 0.18.0 compiler incident `publish.ts` documents at its own call site —
 * plus a `bun` condition resolving to TypeScript source, and 83 files where a
 * real release ships 23.
 *
 * Measured on `@pyreon/lathe`, the package this was found on: bare
 * `npm pack --dry-run` → 83 files / 370.9 kB; through the script → 23 / 221.3 kB.
 *
 * These are STATIC assertions because the defect is documentation-shaped: the
 * alarm fired correctly and its instructions were wrong. A behavioural test
 * would have to actually publish.
 */
describe('first-publish bootstrap recipe', () => {
  const files = ['publish.ts', 'check-published-state.ts'] as const

  it.each(files)('%s does not tell anyone to run a bare `bun publish`', (f) => {
    const src = read(f)
    // The exact folklore this replaced. Matches the package-directory form in
    // either quoting; the script's OWN `bunx npm@<pin> publish` invocation uses
    // an argv array, so it cannot collide with this.
    expect(src).not.toMatch(/bun publish --access[= ]public/)
  })

  it.each(files)('%s points at the script that rewrites the manifest', (f) => {
    expect(read(f)).toMatch(/scripts\/publish\.ts --only=/)
  })

  it('publish.ts implements --only, so the recipe it prints is runnable', () => {
    const src = read('publish.ts')
    expect(src).toContain("process.argv.find((a) => a.startsWith('--only='))")
    // The filter itself. Without it `--only` parses and is ignored, and the
    // bootstrap would attempt every unpublished package in the repo.
    expect(src).toMatch(/if \(only && pkg\.name !== only\) continue/)
    expect(src).toMatch(/Usage:.*--only=/)
  })

  it('states WHY the bare form is wrong, not just that it is', () => {
    // A recipe that says "do X, not Y" without the reason gets re-derived back
    // to Y by the next person who finds Y more obvious — which is how it got
    // there. Both surfaces must name the consequence.
    for (const f of files) {
      const src = read(f)
      expect(src, f).toMatch(/workspace:\*/)
      expect(src.toLowerCase(), f).toContain('eunsupportedprotocol')
    }
  })
})
