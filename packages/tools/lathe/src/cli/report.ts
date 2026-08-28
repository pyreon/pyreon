/**
 * Terminal report.
 *
 * Two things it must never do: present a skipped check as a passing one, and
 * present a partial generation as a complete one. Both are the "silent filter"
 * failure this repo has hit repeatedly — an aggregate that quietly drops what
 * it could not handle reads as success.
 */

import type { GenerateResult } from '../core/generate'
import type { SurfaceChange } from '../core/surface'
import type { IrNote } from '../core/ir'
import type { VerifyReport } from '../verify/lower'

// Built rather than written literally: a raw ESC byte in source is invisible
// in diffs and review, and trivially lost to a well-meaning formatter.
const ESC = String.fromCharCode(27)
const paint =
  (code: string) =>
  (s: string): string =>
    `${ESC}[${code}m${s}${ESC}[0m`
const C = {
  dim: paint('2'),
  bold: paint('1'),
  green: paint('32'),
  yellow: paint('33'),
  red: paint('31'),
  cyan: paint('36'),
}

/** How many contract changes to print before summarising the rest. */
const MAX_CHANGES = 20

export function renderReport(
  result: GenerateResult,
  verify: VerifyReport,
  opts: {
    target: string
    output: string
    wrote: number
    /** Paths whose contents differ from disk. Everything else is unchanged. */
    changed?: ReadonlySet<string> | undefined
    /** The subset of `changed` that is NEW rather than updated. */
    created?: ReadonlySet<string> | undefined
    /** Contract changes vs the committed surface. */
    changes?: readonly SurfaceChange[] | undefined
    name?: string | undefined
    plugins: readonly string[]
    requestedPlugins: readonly string[]
  },
): string {
  const lines: string[] = []
  const { doc } = result
  lines.push('')
  // The project name leads when there is one, so a multi-project run is
  // readable as a list rather than as several unlabelled reports in a row.
  const label = opts.name ? `${C.bold(opts.name)} ${C.dim('/')} ` : ''
  lines.push(`${C.bold('lathe')} ${C.dim('/')} ${label}${doc.title} ${C.dim(doc.version)}`)
  lines.push(
    `  ${doc.models.length} models  ${doc.operations.length} operations  ${C.dim(`target=${opts.target}`)}`,
  )
  // Name what dependency expansion pulled in. A file set larger than the one
  // you selected is confusing exactly once, and only if nobody says why.
  const added = opts.plugins.filter((p) => !opts.requestedPlugins.includes(p))
  if (added.length > 0) {
    lines.push(
      `  ${C.dim(`plugins: ${opts.requestedPlugins.join(', ')} (+${added.join(', +')} - required by them)`)}`,
    )
  }
  lines.push('')

  // Mark each file by what actually HAPPENED to it. Every line used to carry a
  // green `+`, which reads as "created", directly above a count saying one file
  // was written — so the display contradicted itself on every run after the
  // first. `+` is new, `~` is updated, and an unchanged file is dimmed, which
  // makes "what did my spec edit move?" answerable at a glance.
  const changed = opts.changed
  for (const f of result.files) {
    const path = `${opts.output}/${f.path}`
    if (changed === undefined) {
      lines.push(`  ${C.green('+')} ${path}`)
    } else if (opts.created?.has(f.path)) {
      lines.push(`  ${C.green('+')} ${path}`)
    } else if (changed.has(f.path)) {
      lines.push(`  ${C.yellow('~')} ${path}`)
    } else {
      lines.push(`  ${C.dim(`· ${path}`)}`)
    }
  }
  lines.push('')
  lines.push(
    changed === undefined
      ? `  ${opts.wrote} file(s) written`
      : `  ${opts.wrote} of ${result.files.length} file(s) written` +
        (changed.size === 0 ? C.dim('  (everything already current)') : ''),
  )

  // The contract section. Placed BEFORE the native report because a breaking
  // change is the most consequential thing a run can tell you, and a reader
  // who stops early should have seen it.
  const changes = opts.changes ?? []
  if (changes.length > 0) {
    const breaking = changes.filter((c) => c.severity === 'breaking')
    lines.push('')
    lines.push(
      `  ${C.bold('contract')}  ${
        breaking.length > 0
          ? C.red(`${breaking.length} breaking`)
          : C.green('no breaking changes')
      }${C.dim(`  ${changes.length - breaking.length} additive`)}`,
    )
    for (const c of changes.slice(0, MAX_CHANGES)) {
      const mark = c.severity === 'breaking' ? C.red('!') : C.dim('+')
      lines.push(`    ${mark} ${C.dim(`[${c.code}]`)} ${c.subject} ${C.dim(c.detail)}`)
    }
    if (changes.length > MAX_CHANGES) {
      // Never truncate SILENTLY: a capped list that does not say it was capped
      // reads as a complete one.
      lines.push(`    ${C.dim(`… and ${changes.length - MAX_CHANGES} more (use --json for all)`)}`)
    }
  }

  if (opts.target === 'multiplatform') {
    const reaches = [...result.reach.values()]
    const ok = reaches.filter((r) => r.reach === 'web+native').length
    lines.push('')
    lines.push(`  ${C.bold('native reach')}  ${ok}/${reaches.length} operations`)
    // Group the web-only reasons so a 400-operation spec does not print 400
    // near-identical lines.
    const grouped = new Map<string, string[]>()
    for (const [id, r] of result.reach) {
      if (r.reach === 'web+native') continue
      const key = r.reason ?? 'unknown'
      const list = grouped.get(key)
      if (list) list.push(id)
      else grouped.set(key, [id])
    }
    for (const [reason, ids] of grouped) {
      lines.push(`    ${C.yellow('web-only')} ${ids.length} op(s): ${C.dim(preview(ids))}`)
      lines.push(`      ${C.dim(reason)}`)
    }
  }

  lines.push('')
  if (!verify.ran) {
    lines.push(`  ${C.yellow('verify SKIPPED')} ${C.dim(verify.reason ?? '')}`)
  } else {
    for (const f of verify.files) {
      const tag =
        f.verdict === 'lowers'
          ? C.green('lowers')
          : f.verdict === 'web-only'
            ? C.yellow('web-only')
            : C.red('BROKEN')
      const markers = f.markers.length > 0 ? C.dim(`  [${f.markers.join(' ')}]`) : ''
      lines.push(`  ${tag} ${f.path} ${C.dim(f.target)}${markers}`)
      for (const l of f.leaked) {
        lines.push(
          `      ${C.red('leaked')} ${l} ${C.dim('emitted verbatim; the native build will not link')}`,
        )
      }
      for (const w of f.warnings.slice(0, 2)) lines.push(`      ${C.dim(truncate(w, 120))}`)
    }
  }

  if (doc.notes.length > 0) {
    lines.push('')
    lines.push(`  ${C.bold('spec notes')} ${C.dim(`(${doc.notes.length})`)}`)
    for (const n of dedupeNotes(doc.notes).slice(0, 10)) {
      lines.push(`    ${C.cyan(n.code)} ${C.dim(n.at)}`)
      lines.push(`      ${truncate(n.message, 140)}`)
    }
    if (doc.notes.length > 10) lines.push(`    ${C.dim(`and ${doc.notes.length - 10} more`)}`)
  }
  lines.push('')
  return lines.join('\n')
}

/** Collapse repeats of the same code+message; keep the first location. */
function dedupeNotes(notes: readonly IrNote[]): IrNote[] {
  const seen = new Map<string, IrNote>()
  for (const n of notes) {
    const key = `${n.code}|${n.message}`
    if (!seen.has(key)) seen.set(key, n)
  }
  return [...seen.values()]
}

function preview(ids: string[]): string {
  return ids.length <= 3 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} +${ids.length - 3}`
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}...`
}
