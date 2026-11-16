#!/usr/bin/env bun
/**
 * What of a workflow file can change what ONE of its jobs does.
 *
 * `native-surface-touched.ts` used to treat any edit to `native-validate.yml`
 * or `native-device.yml` as "run every lane": a one-line change to the Linux
 * `validate` job, to a decide job's comment or to the Android lane started the
 * macOS typecheck and the iOS UITests (~25 and ~70 macOS minutes) although
 * neither job's definition had changed. This module compares the part of the
 * workflow a lane is made of, at the base and at the head:
 *
 *   - the job's own block (its `if:`, `needs`, runner, steps, timeouts),
 *   - the top-level `env:`, `permissions:` and `defaults:` it inherits,
 *   - the repo files its block names: `scripts/…` and local actions.
 *
 * Comment-only edits do not count (a `#` line outside a block scalar).
 *
 * FAIL-CLOSED: a job that is missing on either side, a missing base file, an
 * indentation this reader does not recognise and any thrown error all read as
 * "changed". A wrong "unchanged" hides a gate behind a skipped required check;
 * a wrong "changed" costs one CI round.
 *
 * It reads the file as text because no YAML parser is available to the
 * scripts, and the workflows are written in one fixed shape (2-space `jobs:`
 * children). The test file pins that shape against the real workflows.
 */

/** Top-level keys that are inherited by every job. Everything else is not part of a job. */
const INHERITED_KEYS = new Set(['env', 'permissions', 'defaults'])

/** Matches a mapping line whose value starts a block scalar (`run: |`, `- |`, `key: >-`). */
const BLOCK_SCALAR = /(?::|-)\s+[|>][+-]?\d*\s*(?:#.*)?$/

/** Drop blank lines and full-line comments, except inside block scalars. */
export function normalize(lines: readonly string[]): string[] {
  const out: string[] = []
  let scalarIndent = -1
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    const indent = line.length - line.trimStart().length
    if (scalarIndent >= 0) {
      if (line === '' || indent > scalarIndent) {
        out.push(line)
        continue
      }
      scalarIndent = -1
    }
    if (line === '' || /^\s*#/.test(line)) continue
    out.push(line)
    if (BLOCK_SCALAR.test(line)) scalarIndent = indent
  }
  // Trailing blank lines inside a final scalar carry no behaviour.
  while (out.length > 0 && out[out.length - 1] === '') out.pop()
  return out
}

interface Sections {
  inherited: string[]
  jobs: Map<string, string[]>
}

/** Split into the inherited top-level sections and the `jobs:` children. */
export function sections(text: string): Sections {
  const lines = text.split(/\r?\n/)
  const inherited: string[] = []
  const jobs = new Map<string, string[]>()
  let top: string | null = null
  let job: string | null = null
  for (const line of lines) {
    const t = /^([A-Za-z_][\w-]*):/.exec(line)
    if (t) {
      top = t[1]!
      job = null
      if (INHERITED_KEYS.has(top)) inherited.push(line)
      continue
    }
    if (top === 'jobs') {
      const j = /^ {2}([A-Za-z_][\w-]*):\s*$/.exec(line)
      if (j) {
        job = j[1]!
        jobs.set(job, [line])
        continue
      }
      if (job !== null) jobs.get(job)!.push(line)
    } else if (top !== null && INHERITED_KEYS.has(top)) {
      inherited.push(line)
    }
  }
  return { inherited: normalize(inherited), jobs: new Map([...jobs].map(([k, v]) => [k, normalize(v)])) }
}

export interface LaneSurface {
  /** Canonical text: inherited sections, then each named job block. */
  text: string
  /** Repo paths the blocks name (`scripts/…`, `.github/actions/…`). */
  named: string[]
}

/** The surface of `jobIds`, or null when any of them is absent (fail-closed). */
export function laneSurface(text: string, jobIds: readonly string[]): LaneSurface | null {
  const s = sections(text)
  const parts: string[] = [...s.inherited]
  for (const id of jobIds) {
    const block = s.jobs.get(id)
    if (!block || block.length < 2) return null
    parts.push(...block)
  }
  const body = parts.join('\n')
  const named = new Set<string>()
  for (const m of body.matchAll(/(?<![\w./-])scripts\/[\w./-]+/g)) named.add(m[0].replace(/[.]+$/, ''))
  for (const m of body.matchAll(/uses:\s*\.\/(\.github\/actions\/[\w./-]+)/g)) named.add(m[1]!)
  return { text: body, named: [...named].sort() }
}

export interface LaneChange {
  changed: boolean
  reason: string
  /** Named repo paths of both sides, for the caller to match against changed files. */
  named: string[]
}

/**
 * Did the lane's definition change between base and head? `base === null`
 * means the file did not exist at the base; an Error means it could not be
 * read. Both, like a missing job, read as changed.
 */
export function laneChanged(
  head: string | Error,
  base: string | null | Error,
  jobIds: readonly string[],
): LaneChange {
  try {
    if (head instanceof Error) return { changed: true, reason: 'head unreadable (fail-closed)', named: [] }
    if (base instanceof Error) return { changed: true, reason: 'base unreadable (fail-closed)', named: [] }
    if (base === null) return { changed: true, reason: 'no base file (fail-closed)', named: [] }
    const h = laneSurface(head, jobIds)
    const b = laneSurface(base, jobIds)
    if (!h || !b) {
      return { changed: true, reason: `job ${jobIds.join('+')} not found (fail-closed)`, named: [] }
    }
    const named = [...new Set([...h.named, ...b.named])].sort()
    if (h.text !== b.text) {
      return { changed: true, reason: `job ${jobIds.join('+')} definition changed`, named }
    }
    return { changed: false, reason: `job ${jobIds.join('+')} definition unchanged`, named }
  } catch (err) {
    return { changed: true, reason: 'surface comparison failed (fail-closed): ' + String(err), named: [] }
  }
}
