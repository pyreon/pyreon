/**
 * ESM-ONLY POLICY GATE.
 *
 * Pyreon publishes ESM and ONLY ESM. No CommonJS build, and — this is the part
 * that is easy to get wrong — no export condition that lets a CJS resolver load
 * us either.
 *
 * WHY A GATE AND NOT A SENTENCE. The tempting change is a `default` condition.
 * It looks free: the artifact stays ESM (Node >=22.12 can `require()` an ES
 * module), nothing is built twice, and `require('@pyreon/x')` starts working.
 * That last clause IS the violation. The policy is about who can consume us,
 * not about which files we emit, and "the build is still ESM" is exactly the
 * rationalisation this gate exists to stop — it was made once, in this repo, by
 * someone who had already been told the policy.
 *
 * A `require` condition is the same violation stated plainly.
 *
 * The known cost, so nobody re-opens this thinking it is free: we are absent
 * from any CJS-only toolchain. Concretely, the node half of
 * moltar/typescript-runtime-type-benchmarks runs under ts-node/CJS, so
 * `@pyreon/validate` cannot be measured there and our entry
 * (`contrib/moltar/`) is bun/deno only. That is the accepted price.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const BANNED = ['require', 'default'] as const

/**
 * The ONLY exemption, and it is not a Pyreon consumer story.
 *
 * `@pyreon/storybook` is a plugin loaded BY Storybook, whose preset loader
 * resolves through CJS. Without a `default` condition Storybook cannot load our
 * preset at all — the constraint belongs to the host tool, not to anyone
 * consuming Pyreon as a library. `src/tests/shipped-preset.test.ts` pins the
 * resolution, so removing the condition fails there loudly (verified: 3 specs).
 *
 * Adding to this list requires the same standard: an external tool that loads
 * our package through CJS and cannot be configured otherwise. "It would be
 * convenient for CJS users" is the case this gate exists to reject.
 */
const EXEMPT = new Set(['@pyreon/storybook'])

type Violation = { pkg: string; subpath: string; condition: string }

const manifests = (): string[] => {
  const out: string[] = []
  for (const cat of readdirSync(join(ROOT, 'packages'))) {
    const catDir = join(ROOT, 'packages', cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const pkg of readdirSync(catDir)) {
      const f = join(catDir, pkg, 'package.json')
      try {
        if (statSync(f).isFile()) out.push(f)
      } catch {
        /* no manifest here */
      }
    }
  }
  return out
}

const violations: Violation[] = []
let scanned = 0

for (const f of manifests()) {
  const d = JSON.parse(readFileSync(f, 'utf8')) as {
    name?: string
    private?: boolean
    exports?: Record<string, unknown>
  }
  if (d.private || !d.name) continue
  if (EXEMPT.has(d.name)) continue
  const exp = d.exports
  if (!exp || typeof exp !== 'object') continue
  scanned++
  for (const [subpath, val] of Object.entries(exp)) {
    if (!val || typeof val !== 'object') continue
    for (const cond of BANNED) {
      if (cond in (val as Record<string, unknown>)) {
        violations.push({ pkg: d.name, subpath, condition: cond })
      }
    }
  }
}

// An empty scan is a BROKEN gate, not a passing one — the repo has ~68
// published packages, and a resolver change that finds none must fail loudly
// rather than report success.
if (scanned === 0) {
  console.error('[check-esm-only] FAIL — scanned 0 published packages. The gate is broken.')
  process.exit(1)
}

if (violations.length > 0) {
  console.error(`[check-esm-only] FAIL — ${violations.length} CJS-enabling export condition(s):\n`)
  for (const v of violations) {
    console.error(`  ${v.pkg}  exports["${v.subpath}"].${v.condition}`)
  }
  console.error(
    '\nPyreon is ESM-ONLY. A `require` condition, and equally a `default` one,\n' +
      'lets a CommonJS resolver load the package — which is the thing the policy\n' +
      'forbids, regardless of the build staying ESM. Remove the condition.\n' +
      'If you are here because a CJS-only tool cannot consume us: that is the\n' +
      'known, accepted cost, not a bug to work around.',
  )
  process.exit(1)
}

console.log(`[check-esm-only] OK — ${scanned} published packages, all ESM-only (no require/default).`)
