/**
 * check-multiplatform-tier — the ecosystem's multiplatform CONTRACT gate
 * (backlog item M6.2; runs in the validate-fast family).
 *
 * The framework advertises "one codebase → web + iOS + Android", but until
 * this gate nothing stopped a NEW package from silently defaulting to
 * web-only while the pitch stayed unqualified. The contract:
 *
 *   1. Every manifest declares `multiplatform: { tier, rationale? }` — the
 *      machine-readable half of the classification `docs/multiplatform.md` +
 *      `multiplatform-libraries.md` maintain in prose. (The TYPE makes the
 *      field required and makes `rationale` mandatory for `'web-only'`, so a
 *      manifest-bearing package cannot even typecheck without a story; this
 *      gate re-verifies at the VALUE level so a cast can't sneak past.)
 *   2. Every PUBLISHED package either HAS a manifest (and therefore a tier)
 *      or is on the explicit no-consumable-runtime-API exempt list below —
 *      so a brand-new published package with no manifest at all fails HERE,
 *      the case the type system structurally cannot see.
 *   3. The per-tier table in `docs/src/content/docs/multiplatform-libraries.md`
 *      (between the gen markers) must match the declarations — regenerate
 *      with `--write-table`. A declared contract nobody can read is not a
 *      contract.
 *
 * Usage:
 *   bun scripts/check-multiplatform-tier.ts                # verify (CI mode)
 *   bun scripts/check-multiplatform-tier.ts --write-table  # regen the docs table
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// Scripts import the internal manifest package by relative path, not the
// `@pyreon/manifest` specifier (same note as check-manifest-depth).
import { findManifests } from '../packages/internals/manifest/src'

// NOT `import.meta.dir` — that is Bun-only, and the pure policy functions
// here are imported by vitest (node) in test-utils.
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const TIERS = new Set(['shared', 'service-backend', 'web-only'])

/**
 * Published packages with NO consumable runtime API and therefore no
 * manifest — the same explicitly-exempt set CLAUDE.md documents for the
 * manifest pipeline (tooling / scaffolding / compat shims / source-shipping
 * native runtimes). Adding a package here instead of writing a manifest is a
 * DELIBERATE decision; a new published package that is neither here nor
 * manifest-bearing fails the gate.
 */
const NO_MANIFEST_EXEMPT = new Set([
  '@pyreon/cli',
  '@pyreon/zero-cli',
  '@pyreon/create-zero',
  '@pyreon/create-multiplatform',
  '@pyreon/meta',
  '@pyreon/typescript',
  '@pyreon/storybook',
  '@pyreon/vite-plugin',
  '@pyreon/react-compat',
  '@pyreon/preact-compat',
  '@pyreon/vue-compat',
  '@pyreon/solid-compat',
  '@pyreon/svelte-compat',
  // The PMTC toolchain itself: the compiler/CLI are build tools, and the four
  // runtime/router packages ship Swift/Kotlin SOURCE consumed by SPM/Gradle —
  // there is no TS API surface for a manifest to describe.
  '@pyreon/native-compiler',
  '@pyreon/native-cli',
  '@pyreon/native-runtime-swift',
  '@pyreon/native-router-swift',
  '@pyreon/native-runtime-kotlin',
  '@pyreon/native-router-kotlin',
])

interface PkgInfo {
  name: string
  dir: string
}

/** Every published (non-private) package under packages/. */
export function listPublishedPackages(repoRoot: string): PkgInfo[] {
  const out: PkgInfo[] = []
  const packagesDir = join(repoRoot, 'packages')
  for (const category of readdirSync(packagesDir)) {
    const categoryDir = join(packagesDir, category)
    let entries: string[]
    try {
      entries = readdirSync(categoryDir)
    } catch {
      continue // a stray file, not a category dir
    }
    for (const pkg of entries) {
      const pkgJsonPath = join(categoryDir, pkg, 'package.json')
      if (!existsSync(pkgJsonPath)) continue
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
        name?: string
        private?: boolean
      }
      if (pkgJson.private === true || typeof pkgJson.name !== 'string') continue
      out.push({ name: pkgJson.name, dir: join(categoryDir, pkg) })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

interface TierRow {
  name: string
  tier: string
  rationale: string
  /**
   * Set when a web-only package still lowers part of its surface. Optional
   * because only `deriveWebOnlyPackages` consults it — `renderTierTable` does
   * not, and requiring it would make every caller supply a field it ignores.
   */
  nativeFrontend?: string
}

/**
 * Packages the compiler must warn about that have NO manifest to derive from.
 *
 * Both are PRIVATE (`@pyreon/ui-*`), so they never reach `findManifests` — but
 * a user importing a pre-built component into shared source is exactly the
 * case the warning exists for. PMTC compiles SOURCE, not npm packages, so an
 * imported component cannot lower; you re-author the pattern with primitives.
 *
 * This is the ONLY hand-maintained part of the set, and it is small and
 * closed by construction: a package with a manifest must never appear here
 * (the gate fails if one does), so it cannot silently absorb a package that
 * should have been derived.
 */
const WEB_ONLY_NO_MANIFEST = ['@pyreon/ui-components', '@pyreon/ui-primitives']

const WEB_ONLY_START = '// <gen:web-only-packages:start>'
const WEB_ONLY_END = '// <gen:web-only-packages:end>'

/**
 * Derive the set of packages the native compiler blanket-warns on.
 *
 * A package qualifies when it declares `tier: 'web-only'` AND does not
 * declare a `nativeFrontend` — i.e. nothing of it lowers. Deriving this
 * rather than hand-listing it is the whole point: the previous hand-written
 * list in `parse.ts` rotted in BOTH directions, and the code comments there
 * recorded each incident after the fact. A missing entry emits the call
 * verbatim and dies with `cannot find 'x' in scope` and no diagnostic; a
 * stale entry tells the user a working API is unusable.
 */
export function deriveWebOnlyPackages(rows: TierRow[]): string[] {
  const derived = rows.filter((r) => r.tier === 'web-only' && !r.nativeFrontend).map((r) => r.name)
  return [...new Set([...derived, ...WEB_ONLY_NO_MANIFEST])].sort()
}

/** Render the generated region that replaces the hand-written Set literal. */
export function renderWebOnlySet(names: string[]): string {
  const lines = names.map((n) => `  '${n}',`)
  return [
    WEB_ONLY_START,
    '// GENERATED — do not edit by hand. Derived from every package manifest\'s',
    '// `multiplatform` declaration (tier === \'web-only\' AND no `nativeFrontend`)',
    '// by `bun scripts/check-multiplatform-tier.ts --write-table`, which also',
    '// gates that this stays in sync. Edit the MANIFEST, not this list.',
    'const WEB_ONLY_PACKAGES: ReadonlySet<string> = new Set([',
    ...lines,
    '])',
    WEB_ONLY_END,
  ].join('\n')
}

const TABLE_START = '{/* gen:multiplatform-tiers:start */}'
const TABLE_END = '{/* gen:multiplatform-tiers:end */}'

/** Render the per-tier markdown table between the gen markers. */
export function renderTierTable(rows: TierRow[]): string {
  const byTier = (tier: string) => rows.filter((r) => r.tier === tier)
  const section = (title: string, tier: string): string => {
    const members = byTier(tier)
    const lines = members.map((r) => `| \`${r.name}\` | ${r.rationale || '—'} |`)
    return `### ${title} (${members.length})\n\n| Package | Why |\n| --- | --- |\n${lines.join('\n')}\n`
  }
  return [
    TABLE_START,
    '',
    '> Generated from each package manifest\'s `multiplatform` declaration by',
    '> `bun scripts/check-multiplatform-tier.ts --write-table` — edit the',
    '> manifests, not this table. The gate fails when they drift.',
    '',
    section('`shared` — the authoring surface lowers on every target', 'shared'),
    section('`service-backend` — one API, per-target runtime backends', 'service-backend'),
    section('`web-only` — architecturally coupled to the web platform', 'web-only'),
    TABLE_END,
  ].join('\n')
}

async function main(): Promise<number> {
  const writeTable = process.argv.includes('--write-table')
  const failures: string[] = []

  const manifests = await findManifests(REPO)
  const byName = new Map(manifests.map((m) => [m.manifest.name, m]))

  // 1 + value-level re-verification of the typed contract.
  const rows: TierRow[] = []
  for (const loaded of manifests) {
    const name = loaded.manifest.name
    const mp = (loaded.manifest as { multiplatform?: { tier?: unknown; rationale?: unknown } })
      .multiplatform
    if (!mp || typeof mp.tier !== 'string') {
      failures.push(
        `${name}: manifest declares NO multiplatform tier — add ` +
          `multiplatform: { tier: 'shared' | 'service-backend' | 'web-only', rationale? } ` +
          `(rationale REQUIRED for web-only).`,
      )
      continue
    }
    if (!TIERS.has(mp.tier)) {
      failures.push(`${name}: unknown multiplatform tier '${mp.tier}'.`)
      continue
    }
    if (mp.tier === 'web-only' && (typeof mp.rationale !== 'string' || mp.rationale.length === 0)) {
      failures.push(
        `${name}: tier 'web-only' requires a rationale — one sentence on what couples it ` +
          `to the web and the native consumption story (WebView bridge / <Web> branch / none).`,
      )
      continue
    }
    const nativeFrontend = (mp as { nativeFrontend?: unknown }).nativeFrontend
    if (nativeFrontend !== undefined && typeof nativeFrontend !== 'string') {
      failures.push(`${name}: multiplatform.nativeFrontend must be a string naming what lowers.`)
      continue
    }
    if (typeof nativeFrontend === 'string' && mp.tier !== 'web-only') {
      failures.push(
        `${name}: multiplatform.nativeFrontend is only meaningful on tier 'web-only' — ` +
          `a '${mp.tier}' package already lowers, so the field says nothing.`,
      )
      continue
    }
    rows.push({
      name,
      tier: mp.tier,
      rationale: typeof mp.rationale === 'string' ? mp.rationale : '',
      nativeFrontend: typeof nativeFrontend === 'string' ? nativeFrontend : '',
    })
  }

  // 2. Published packages must have a manifest or an explicit exemption.
  for (const pkg of listPublishedPackages(REPO)) {
    if (byName.has(pkg.name)) continue
    if (NO_MANIFEST_EXEMPT.has(pkg.name)) continue
    failures.push(
      `${pkg.name} is PUBLISHED but has neither a manifest (with a multiplatform tier) nor ` +
        `an entry in NO_MANIFEST_EXEMPT — every published package must declare its ` +
        `multiplatform story. Write the manifest (preferred) or exempt it with a rationale.`,
    )
  }
  // …and exemptions must not go stale (a manifest landed → drop the entry).
  for (const name of NO_MANIFEST_EXEMPT) {
    if (byName.has(name)) {
      failures.push(
        `${name} is in NO_MANIFEST_EXEMPT but HAS a manifest — remove the stale exemption.`,
      )
    }
  }

  // 3. The docs table must match the declarations.
  const docPath = join(REPO, 'docs/src/content/docs/multiplatform-libraries.md')
  const doc = readFileSync(docPath, 'utf8')
  const start = doc.indexOf(TABLE_START)
  const end = doc.indexOf(TABLE_END)
  const rendered = renderTierTable(rows)
  if (start === -1 || end === -1) {
    failures.push(
      `docs/src/content/docs/multiplatform-libraries.md is missing the ` +
        `${TABLE_START} / ${TABLE_END} markers — the declared tiers have no readable surface.`,
    )
  } else if (writeTable) {
    const next = doc.slice(0, start) + rendered + doc.slice(end + TABLE_END.length)
    writeFileSync(docPath, next)
    console.log(`[check-multiplatform-tier] table written (${rows.length} packages)`)
  } else {
    const current = doc.slice(start, end + TABLE_END.length)
    if (current !== rendered) {
      failures.push(
        `the tier table in multiplatform-libraries.md is STALE — a manifest's multiplatform ` +
          `declaration changed without regenerating it. Run: ` +
          `bun scripts/check-multiplatform-tier.ts --write-table`,
      )
    }
  }

  // 4. The native compiler's blanket web-only warn set must match the
  //    declarations. This is the half that shipped a real bug: seven web-only
  //    packages (validate / validation / url-state / feature / hotkeys / http /
  //    head) were absent from the hand-written list, so importing them into
  //    shared source produced NO diagnostic and a cryptic native build failure.
  const parsePath = join(REPO, 'packages/native/compiler/src/parse.ts')
  const parseSrc = readFileSync(parsePath, 'utf8')
  const wStart = parseSrc.indexOf(WEB_ONLY_START)
  const wEnd = parseSrc.indexOf(WEB_ONLY_END)
  const derivedNames = deriveWebOnlyPackages(rows)
  const renderedSet = renderWebOnlySet(derivedNames)
  // A manifest-bearing package must never be hand-listed — that would let the
  // hand list quietly outlive the derivation and re-open the rot.
  for (const name of WEB_ONLY_NO_MANIFEST) {
    if (byName.has(name)) {
      failures.push(
        `${name} is in WEB_ONLY_NO_MANIFEST but HAS a manifest — remove the hand entry so ` +
          `the tier declaration drives it.`,
      )
    }
  }
  if (wStart === -1 || wEnd === -1) {
    failures.push(
      `packages/native/compiler/src/parse.ts is missing the ${WEB_ONLY_START} / ` +
        `${WEB_ONLY_END} markers — the web-only warn set is no longer derived from the ` +
        `manifests, so it will drift silently.`,
    )
  } else if (writeTable) {
    const next =
      parseSrc.slice(0, wStart) + renderedSet + parseSrc.slice(wEnd + WEB_ONLY_END.length)
    writeFileSync(parsePath, next)
    console.log(`[check-multiplatform-tier] compiler web-only set written (${derivedNames.length})`)
  } else {
    const current = parseSrc.slice(wStart, wEnd + WEB_ONLY_END.length)
    if (current !== renderedSet) {
      failures.push(
        `the native compiler's WEB_ONLY_PACKAGES set is STALE — a manifest's multiplatform ` +
          `declaration changed without regenerating it. A package missing from that set ` +
          `emits verbatim and fails the native build with no diagnostic. Run: ` +
          `bun scripts/check-multiplatform-tier.ts --write-table`,
      )
    }
  }

  if (failures.length > 0) {
    console.error(`✗ check-multiplatform-tier: ${failures.length} failure(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    return 1
  }
  const counts = ['shared', 'service-backend', 'web-only']
    .map((t) => `${t}: ${rows.filter((r) => r.tier === t).length}`)
    .join(', ')
  console.log(
    `✓ check-multiplatform-tier: ${rows.length} manifests declare a tier (${counts}); ` +
      `${NO_MANIFEST_EXEMPT.size} published packages explicitly exempt; docs table in sync.`,
  )
  return 0
}

if (import.meta.main) {
  process.exit(await main())
}
