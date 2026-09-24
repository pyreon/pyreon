#!/usr/bin/env bun
/**
 * Gate: every feature documented in `docs/src/content/docs/zero.md` has a
 * REAL-BUILD test (an e2e spec or a verify-modes cell), or an explicit,
 * reasoned entry in the shrink-only allowlist.
 *
 * See `scripts/zero-feature-coverage.ts` for the registry and the rules.
 *
 *   bun scripts/check-zero-feature-coverage.ts
 *
 * The ratchet compares the allowlist against `origin/main`'s copy. When that
 * ref (or the file on it) is unavailable, the ratchet half SKIPS LOUDLY —
 * everything else still runs.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Coverage,
  NON_FEATURE_SECTIONS,
  ZERO_FEATURE_COVERAGE,
} from './zero-feature-coverage'

/** Resolved lazily — importing this module (tests) must not depend on its URL scheme. */
const root = (): string => fileURLToPath(new URL('..', import.meta.url))
const DOC = 'docs/src/content/docs/zero.md'
const ALLOWLIST = 'scripts/zero-feature-uncovered.json'
const VERIFY_MODES = 'scripts/verify-modes.ts'

/** `##`–`####` heading texts, in document order, outside fenced code. */
export function extractHeadings(markdown: string): string[] {
  const out: string[] = []
  let fence: string | null = null
  for (const line of markdown.split('\n')) {
    const f = /^\s*(`{3,}|~{3,})/.exec(line)
    if (f) {
      const marker = f[1] as string
      if (fence === null) fence = marker
      else if (marker.startsWith(fence[0] as string) && marker.length >= fence.length) fence = null
      continue
    }
    if (fence !== null) continue
    const h = /^#{2,4}\s+(.+?)\s*#*\s*$/.exec(line)
    if (h) out.push(h[1] as string)
  }
  return out
}

/**
 * The source text of each verify-modes MATRIX cell, keyed `example:mode`.
 * A cell starts at an `example: '…'` line; its `mode` is the first `mode:`
 * after it. Several cells may share a key, so values are arrays.
 */
export function verifyModesCells(source: string): Map<string, string[]> {
  const cells = new Map<string, string[]>()
  const start = source.indexOf('const MATRIX')
  if (start < 0) return cells
  const body = source.slice(start)
  const re = /^ {4}example: '([^']+)',/gm
  const starts: { idx: number; example: string }[] = []
  for (let m = re.exec(body); m; m = re.exec(body)) starts.push({ idx: m.index, example: m[1] as string })
  starts.forEach((s, i) => {
    const text = body.slice(s.idx, starts[i + 1]?.idx ?? body.length)
    const mode = /^ {4}mode: '([^']+)'/m.exec(text)?.[1]
    if (!mode) return
    const key = `${s.example}:${mode}`
    cells.set(key, [...(cells.get(key) ?? []), text])
  })
  return cells
}

export interface GateInput {
  headings: string[]
  registry: Record<string, Coverage>
  nonFeature: Record<string, string>
  allowlist: Record<string, string>
  /** Allowlist keys on the base ref, or `null` when unavailable. */
  baseAllowlist: string[] | null
  readFile: (repoPath: string) => string | null
  verifyModes: Map<string, string[]>
}

/** Pure gate logic — returns the list of problems (empty = pass). */
export function checkCoverage(input: GateInput): string[] {
  const problems: string[] = []
  const headings = new Set(input.headings)
  const dup = input.headings.filter((h, i) => input.headings.indexOf(h) !== i)
  for (const d of new Set(dup)) {
    problems.push(`duplicate heading "${d}" — headings are registry keys; make it unique`)
  }

  for (const h of headings) {
    const n = Number(h in input.registry) + Number(h in input.allowlist) + Number(h in input.nonFeature)
    if (n === 0) {
      problems.push(
        `documented feature "${h}" has no real-build test. Add an e2e spec or verify-modes cell and ` +
          `register it in scripts/zero-feature-coverage.ts (or, if it is doc structure, NON_FEATURE_SECTIONS).`,
      )
    } else if (n > 1) {
      problems.push(`"${h}" is listed in more than one of registry / allowlist / NON_FEATURE_SECTIONS`)
    }
  }

  for (const [label, keys] of [
    ['registry', Object.keys(input.registry)],
    ['allowlist', Object.keys(input.allowlist)],
    ['NON_FEATURE_SECTIONS', Object.keys(input.nonFeature)],
  ] as const) {
    for (const k of keys) {
      if (!headings.has(k)) problems.push(`${label} entry "${k}" no longer matches a heading in ${DOC}`)
    }
  }

  for (const [k, reason] of Object.entries(input.allowlist)) {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      problems.push(`allowlist entry "${k}" needs a reason explaining why it is uncovered`)
    }
  }

  for (const [feature, cov] of Object.entries(input.registry)) {
    if (cov.kind === 'e2e') {
      const text = input.readFile(cov.spec)
      if (text === null) problems.push(`"${feature}": spec ${cov.spec} does not exist`)
      else if (!text.includes(cov.evidence)) {
        problems.push(`"${feature}": ${cov.spec} no longer contains evidence "${cov.evidence}"`)
      }
    } else {
      const key = `${cov.example}:${cov.mode}`
      const cells = input.verifyModes.get(key)
      if (!cells) problems.push(`"${feature}": no verify-modes cell ${key}`)
      else if (!cells.some((c) => c.includes(cov.evidence))) {
        problems.push(`"${feature}": no verify-modes cell ${key} contains evidence "${cov.evidence}"`)
      }
    }
  }

  if (input.baseAllowlist !== null) {
    const base = new Set(input.baseAllowlist)
    for (const k of Object.keys(input.allowlist)) {
      if (!base.has(k)) {
        problems.push(
          `allowlist grew: "${k}" is not uncovered on origin/main. The allowlist can only shrink — ` +
            `add a real-build test instead.`,
        )
      }
    }
  }
  return problems
}

function readRepo(p: string): string | null {
  const abs = join(root(), p)
  return existsSync(abs) ? readFileSync(abs, 'utf-8') : null
}

/**
 * Allowlist keys on `origin/main`. `'no-ref'` when the ref itself is missing
 * (shallow clone, other remote) — distinct from `null`, which means the ref
 * exists but the file does not yet (the PR introducing it).
 */
function baseAllowlistKeys(): string[] | null | 'no-ref' {
  const ref = spawnSync('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { cwd: root() })
  if (ref.status !== 0) return 'no-ref'
  const r = spawnSync('git', ['show', `origin/main:${ALLOWLIST}`], { cwd: root(), encoding: 'utf-8' })
  if (r.status !== 0) return null
  return Object.keys((JSON.parse(r.stdout) as { uncovered: Record<string, string> }).uncovered)
}

function main(): void {
  const doc = readRepo(DOC)
  const vm = readRepo(VERIFY_MODES)
  const allow = readRepo(ALLOWLIST)
  if (doc === null || vm === null || allow === null) {
    console.error(`[check-zero-feature-coverage] missing input (${DOC}, ${VERIFY_MODES} or ${ALLOWLIST})`)
    process.exit(1)
  }
  const headings = extractHeadings(doc)
  if (headings.length === 0) {
    // An empty input set is a failure, never a vacuous pass.
    console.error(`[check-zero-feature-coverage] found no headings in ${DOC}`)
    process.exit(1)
  }
  const base = baseAllowlistKeys()
  if (base === 'no-ref') {
    // Fail-closed in CI: a missing ref must never read as "allowlist did not grow".
    if (process.env['CI']) {
      console.error('[check-zero-feature-coverage] origin/main is not available — the ratchet cannot run (fetch-depth: 0?)')
      process.exit(1)
    }
    console.warn('[check-zero-feature-coverage] SKIPPED the ratchet half: no origin/main ref in this clone.')
  } else if (base === null) {
    console.warn(`[check-zero-feature-coverage] ratchet: ${ALLOWLIST} is new on this branch — nothing to compare yet.`)
  }
  const baseAllowlist = base === 'no-ref' ? null : base
  const problems = checkCoverage({
    headings,
    registry: ZERO_FEATURE_COVERAGE,
    nonFeature: NON_FEATURE_SECTIONS,
    allowlist: (JSON.parse(allow) as { uncovered: Record<string, string> }).uncovered,
    baseAllowlist,
    readFile: readRepo,
    verifyModes: verifyModesCells(vm),
  })
  if (problems.length > 0) {
    console.error(`[check-zero-feature-coverage] ${problems.length} problem(s):`)
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  const covered = Object.keys(ZERO_FEATURE_COVERAGE).length
  const uncovered = Object.keys(JSON.parse(allow).uncovered).length
  console.log(
    `[check-zero-feature-coverage] ✓ ${headings.length} headings: ${covered} covered by a real build, ` +
      `${uncovered} allowlisted as uncovered, ${Object.keys(NON_FEATURE_SECTIONS).length} doc structure`,
  )
}

if (import.meta.main) main()
