/**
 * Terminal report.
 *
 * Two things it must never do: present a skipped check as a passing one, and
 * present a partial generation as a complete one. Both are the "silent filter"
 * failure this repo has hit repeatedly — an aggregate that quietly drops what
 * it could not handle reads as success.
 */

import type { GenerateResult } from '../core/generate'
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

export function renderReport(
  result: GenerateResult,
  verify: VerifyReport,
  opts: { target: string; output: string; wrote: number; name?: string | undefined },
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
  lines.push('')

  for (const f of result.files) lines.push(`  ${C.green('+')} ${opts.output}/${f.path}`)
  lines.push('')
  lines.push(`  ${opts.wrote} file(s) written`)

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
