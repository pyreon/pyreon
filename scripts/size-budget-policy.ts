/**
 * size-budget-policy — how a measured size is judged, for all three size gates
 * (`check-bundle-budgets`, `check-import-budgets`, `check-route-budgets`).
 *
 * Two questions, asked in two different places:
 *
 *   - **Did THIS change grow the entry?** Asked on a pull request (`pr` mode):
 *     the entry's size on the PR's merge commit is compared with its size on
 *     the commit it merges into. Growth above {@link growthAllowance} fails
 *     unless the PR changes that entry's ceiling, which is the explicit,
 *     reviewable acceptance.
 *   - **Is the entry over its ceiling?** Asked on the default branch (`main`
 *     mode: push and merge queue), where the sum of several merges is visible.
 *     On a pull request the ceiling fails only an entry the PR itself added
 *     bytes to; an entry that is over its ceiling on the base and that the PR
 *     did not grow is reported, not failed.
 *
 * A local run (`local` mode) has no base measurement and is not the default
 * branch, so it reports sizes against ceilings and fails only on a missing
 * ceiling. The build and measurement failures each gate reports are separate
 * from this policy and fail in every mode.
 *
 * Pure: no filesystem, argv or bundler, so any program can import and test it
 * (the reason `bundle-budget-policy.ts` is separate from its gate too).
 */

export type SizeMode = 'pr' | 'main' | 'local'

/**
 * Bytes two measurements of the same code may differ by.
 *
 * Every package inlines its own version string, and a release changes those
 * bytes without changing code: on `@pyreon/hooks` a plain version bump moved
 * `useEventListener` 596 → 597 B. Anything inside this band is "did not move".
 */
export const NOISE_BYTES = 4

/**
 * The same band for built routes, which is wider.
 *
 * A route's first-load JS is about ten chunks that import each other by
 * content-hashed file name. A zero build writes absolute route-module paths
 * into the client route table, so the same commit built in another directory
 * gets different hashes; the measurement strips the paths, but the hashed
 * names still compress differently. Measured on ssr-showcase, one commit in
 * two directories: 1 to 5 B per route. The base of a pull request is always
 * built in another directory than its head.
 */
export const ROUTE_NOISE_BYTES = 32

/** A pull request may grow an entry by this fraction of its base size … */
export const GROWTH_ALLOWANCE_FRACTION = 0.02
/** … and never by less than this, so a tiny entry is not held to a few bytes. */
export const GROWTH_ALLOWANCE_FLOOR_BYTES = 64

/** Headroom a ceiling gets over the measurement it was set from. */
export const CEILING_HEADROOM_FRACTION = 0.1

/** Bytes a pull request may add to an entry of `baseSize` without accepting it. */
export function growthAllowance(baseSize: number): number {
  return Math.max(GROWTH_ALLOWANCE_FLOOR_BYTES, Math.floor(baseSize * GROWTH_ALLOWANCE_FRACTION))
}

/**
 * The ceiling `--update` writes for a measurement.
 *
 * A function of the measured bytes only, so two people accepting the same
 * growth write the same number (hand-picked values for one entry have differed,
 * 17119 against 17500, and conflicted).
 */
export function ceilingFor(measured: number): number {
  return Math.ceil(measured * (1 + CEILING_HEADROOM_FRACTION))
}

export type CeilingAction = 'seed' | 'raise' | 'lower' | 'keep' | 'refused'

/**
 * What `--update` does to one entry.
 *
 * - no ceiling yet: seed it;
 * - named (`--update=<id>`): set it from the measurement, up or down. Naming
 *   the entry is the deliberate act, and it is how growth is accepted;
 * - not named and over its ceiling: raise it;
 * - not named and under: leave it byte-identical. An unscoped run never lowers,
 *   because a stale or partial `lib/` can only measure LOW (`refused` marks an
 *   entry whose ceiling a named update would lower).
 */
export function nextCeiling(
  previous: number | undefined,
  measured: number,
  named: boolean,
): { value: number; action: CeilingAction } {
  const target = ceilingFor(measured)
  if (previous === undefined) return { value: target, action: 'seed' }
  if (named) {
    if (target === previous) return { value: previous, action: 'keep' }
    return { value: target, action: target > previous ? 'raise' : 'lower' }
  }
  if (measured > previous) return { value: target, action: 'raise' }
  if (target < previous) return { value: previous, action: 'refused' }
  return { value: previous, action: 'keep' }
}

export interface SizeEntry {
  /** `@pyreon/core`, `@pyreon/core::jsx`, `ssr-showcase:/about`. */
  id: string
  /** Measured gzipped bytes on the tree being judged. */
  size: number
  /** The entry's ceiling on the tree being judged. */
  ceiling: number | undefined
}

/** The same entry on the commit a pull request merges into. */
export interface BaseEntry {
  /** `undefined`: the entry does not exist, or could not be measured, there. */
  size: number | undefined
  ceiling: number | undefined
}

export type VerdictCode =
  | 'ok'
  | 'accepted'
  | 'missing-ceiling'
  | 'over-ceiling'
  | 'growth'
  | 'base-over-ceiling'
  | 'local-over-ceiling'

export interface Verdict {
  id: string
  code: VerdictCode
  /** A failing verdict fails the gate; a note is printed and passes. */
  fail: boolean
  size: number
  ceiling: number | undefined
  baseSize: number | undefined
  message: string
}

const pct = (part: number, whole: number): string =>
  whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : 'n/a'

/**
 * Judge one entry. `base` is required in `pr` mode (pass `undefined` sizes for
 * an entry that is new) and ignored otherwise.
 */
export function judgeEntry(mode: SizeMode, entry: SizeEntry, base?: BaseEntry, noise: number = NOISE_BYTES): Verdict {
  const { id, size, ceiling } = entry
  const baseSize = mode === 'pr' ? base?.size : undefined
  const make = (code: VerdictCode, fail: boolean, message: string): Verdict => ({
    id,
    code,
    fail,
    size,
    ceiling,
    baseSize,
    message,
  })

  if (ceiling === undefined) {
    return make(
      'missing-ceiling',
      true,
      `${id}: ${size} B has no ceiling. Seed it with --update and review the value.`,
    )
  }

  const over = size > ceiling + noise
  const overText = `${size} B is over its ceiling of ${ceiling} B by ${size - ceiling} B (${pct(size - ceiling, ceiling)})`

  if (mode === 'local') {
    return over
      ? make(
          'local-over-ceiling',
          false,
          `${id}: ${overText}. A local run does not judge this: CI fails a pull request that added to it, and the default branch while it stays over.`,
        )
      : make('ok', false, `${id}: ${size} B of ${ceiling} B`)
  }

  if (mode === 'main') {
    return over
      ? make(
          'over-ceiling',
          true,
          `${id}: ${overText}. Shrink it, or accept the size with --update=${id} in a pull request that says what the bytes bought.`,
        )
      : make('ok', false, `${id}: ${size} B of ${ceiling} B`)
  }

  // ── pr ──────────────────────────────────────────────────────────────────
  if (base === undefined || base.size === undefined) {
    // New on this pull request (or not measurable on the base): there is no
    // growth to judge, so the ceiling is the whole rule.
    return over
      ? make('over-ceiling', true, `${id}: new entry, ${overText}. Set its ceiling with --update=${id}.`)
      : make('ok', false, `${id}: new entry, ${size} B of ${ceiling} B`)
  }

  const growth = size - base.size
  const grew = growth > noise
  const ceilingChanged = base.ceiling === undefined || base.ceiling !== ceiling
  const delta = `${growth >= 0 ? '+' : ''}${growth} B (${base.size} → ${size} B)`

  if (over) {
    if (grew || ceilingChanged) {
      const why = grew
        ? `this change adds ${delta}`
        : `this change sets the ceiling below the measured size`
      return make(
        'over-ceiling',
        true,
        `${id}: ${overText}, and ${why}. Shrink it, or accept the size with --update=${id} and say in the PR what the bytes bought.`,
      )
    }
    return make(
      'base-over-ceiling',
      false,
      `${id}: ${overText} on the base already; this change does not add to it (${delta}), so it is not failed here. The default branch stays red until the entry shrinks or its ceiling is accepted.`,
    )
  }

  const allowance = growthAllowance(base.size)
  if (growth > allowance) {
    if (ceilingChanged) {
      return make(
        'accepted',
        false,
        `${id}: ${delta}, above the ${allowance} B allowance, accepted by this change's ceiling (${base.ceiling ?? 'none'} → ${ceiling} B)`,
      )
    }
    return make(
      'growth',
      true,
      `${id}: this change adds ${delta}, ${pct(growth, base.size)} against an allowance of ${allowance} B per pull request. ` +
        `Find what grew it. If the growth is intended, accept it with --update=${id} (sets the ceiling to ${ceilingFor(size)} B) and say in the PR what the bytes bought.`,
    )
  }

  return make('ok', false, `${id}: ${delta}, ${size} B of ${ceiling} B`)
}

/** One family's base data, as `size-base.ts` records it. */
export interface BaseFamily {
  /** `null`: nothing that can move these sizes changed, so base equals head. */
  sizes: Record<string, number> | null
  ceilings: Record<string, number>
}

/**
 * Judge every entry of one family.
 *
 * In `pr` mode `base` is mandatory: without a base measurement there is no
 * verdict, and a gate that passes when its input is missing is not a gate.
 */
export function judgeFamily(
  mode: SizeMode,
  entries: readonly SizeEntry[],
  base: BaseFamily | undefined,
  noise: number = NOISE_BYTES,
): Verdict[] {
  if (mode === 'pr' && base === undefined) {
    throw new Error(
      '[Pyreon] size gate: pr mode needs the base measurement. Run `bun scripts/size-base.ts` first and pass its output with --base=<file> or PYREON_SIZE_BASE.',
    )
  }
  return entries.map((entry) => {
    if (mode !== 'pr' || base === undefined) return judgeEntry(mode, entry, undefined, noise)
    const size = base.sizes === null ? entry.size : base.sizes[entry.id]
    return judgeEntry(mode, entry, { size, ceiling: base.ceilings[entry.id] }, noise)
  })
}

/** Reads the mode from `--mode=` or `PYREON_SIZE_MODE`; anything else is local. */
export function resolveSizeMode(args: readonly string[], env: Readonly<Record<string, string | undefined>>): SizeMode {
  const flag = args.find((a) => a.startsWith('--mode='))?.slice('--mode='.length)
  const raw = flag ?? env.PYREON_SIZE_MODE ?? 'local'
  if (raw === 'pr' || raw === 'main' || raw === 'local') return raw
  throw new Error(`[Pyreon] size gate: unknown mode "${raw}". Use pr, main or local.`)
}

/** The base file path from `--base=` or `PYREON_SIZE_BASE`. */
export function resolveBasePath(args: readonly string[], env: Readonly<Record<string, string | undefined>>): string | undefined {
  return args.find((a) => a.startsWith('--base='))?.slice('--base='.length) ?? (env.PYREON_SIZE_BASE || undefined)
}

/** The file `size-base.ts` writes and the three gates read. */
export interface SizeBaseFile {
  /** The commit the base was measured at. */
  ref: string
  bundle: BaseFamily
  imports: BaseFamily
  routes: BaseFamily
}

/**
 * Can a change to `path` move a built `lib/`, and with it a bundle or
 * minimal-import size? The list mirrors the bootstrap cache key (package
 * sources, manifests and tsconfigs, the root tsconfig, the bootstrap script,
 * the lockfile) plus the pinned bundler version. When no changed path matches,
 * the base tree builds to the same bytes as the head and is not rebuilt.
 */
export function movesLibSizes(path: string): boolean {
  if (path.startsWith('packages/')) return !path.endsWith('.md')
  return (
    path === 'bun.lock' ||
    path === 'package.json' ||
    path === '.bun-version' ||
    path === 'scripts/bootstrap.ts' ||
    /^tsconfig[^/]*\.json$/.test(path)
  )
}

/**
 * Can a change to `path` move a built route's first-load JS? Anything that
 * moves a `lib/`, or any example source (the size-judged cells are examples).
 */
export function movesRouteSizes(path: string): boolean {
  return movesLibSizes(path) || path.startsWith('examples/')
}

/** Verdict lines for a log: failures first, then notes; passing entries are counted. */
export function formatVerdicts(label: string, mode: SizeMode, verdicts: readonly Verdict[]): { lines: string[]; failed: number } {
  const failing = verdicts.filter((v) => v.fail)
  const notes = verdicts.filter((v) => !v.fail && v.code !== 'ok')
  const lines: string[] = []
  for (const v of failing) lines.push(`  ✗ ${v.message}`)
  for (const v of notes) lines.push(`  · ${v.message}`)
  const rule =
    mode === 'pr'
      ? `judged on this change's own growth (allowance ${GROWTH_ALLOWANCE_FRACTION * 100}% or ${GROWTH_ALLOWANCE_FLOOR_BYTES} B per entry)`
      : mode === 'main'
        ? 'judged against ceilings'
        : 'local run: ceilings reported, CI judges'
  lines.push(
    failing.length > 0
      ? `✗ ${label}: ${failing.length} of ${verdicts.length} entr${verdicts.length === 1 ? 'y' : 'ies'} failed, ${rule}.`
      : `✓ ${label}: ${verdicts.length} entr${verdicts.length === 1 ? 'y' : 'ies'}, ${rule}.`,
  )
  return { lines, failed: failing.length }
}
