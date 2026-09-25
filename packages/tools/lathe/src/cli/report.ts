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
import { noteSeverity, type IrNote } from '../core/ir'
import type { VerifyReport } from '../verify/lower'

// Built rather than written literally: a raw ESC byte in source is invisible
// in diffs and review, and trivially lost to a well-meaning formatter.
const ESC = String.fromCharCode(27)

/**
 * The palette, or a no-op one.
 *
 * Colour is a decision about the DESTINATION, which the report cannot see: an
 * escape code is noise in a CI log, a file, a pipe into `grep`, and for anyone
 * who set `NO_COLOR`. It used to be unconditional. The bin decides (see
 * {@link shouldColor}); a library caller gets plain text unless it asks.
 */
function palette(color: boolean) {
  const paint =
    (code: string) =>
    (s: string): string =>
      color ? `${ESC}[${code}m${s}${ESC}[0m` : s
  return {
    dim: paint('2'),
    bold: paint('1'),
    green: paint('32'),
    yellow: paint('33'),
    red: paint('31'),
    cyan: paint('36'),
  }
}

/**
 * Whether output to `stream` should be coloured, by the de-facto conventions:
 * `NO_COLOR` (any value) disables, `FORCE_COLOR` (other than `0`) enables, a
 * `dumb` terminal disables, and otherwise only a TTY gets colour.
 */
export function shouldColor(
  stream: { isTTY?: boolean | undefined },
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0'
  if (env.TERM === 'dumb') return false
  return stream.isTTY === true
}

/** How many contract changes to print before summarising the rest. */
const MAX_CHANGES = 20
/** How many distinct loss notes to print before summarising the rest. */
const MAX_NOTES = 10

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
    /** Previously-generated files removed because this run no longer emits them. */
    removed?: readonly string[] | undefined
    name?: string | undefined
    plugins: readonly string[]
    requestedPlugins: readonly string[]
    /** Emit ANSI colour. Default `false`: the caller knows the destination. */
    color?: boolean | undefined
  },
): string {
  const C = palette(opts.color ?? false)
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
  // A removed file is part of what the run did to the tree, so it is listed
  // with the rest -- a deletion that only shows up in `git status` is the kind
  // of surprise that makes people distrust a generator.
  for (const r of opts.removed ?? []) lines.push(`  ${C.red('-')} ${opts.output}/${r}`)
  lines.push('')
  lines.push(
    changed === undefined
      ? `  ${opts.wrote} file(s) written`
      : `  ${opts.wrote} of ${result.files.length} file(s) written` +
        (opts.removed && opts.removed.length > 0 ? `, ${opts.removed.length} removed` : '') +
        (changed.size === 0 && (opts.removed?.length ?? 0) === 0 ? C.dim('  (everything already current)') : ''),
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
          : f.verdict === 'partial'
            ? C.yellow('partial')
            : f.verdict === 'web-only'
              ? C.yellow('web-only')
              : C.red('BROKEN')
      const markers = f.markers.length > 0 ? C.dim(`  [${f.markers.join(' ')}]`) : ''
      const compiled =
        f.compiled === undefined
          ? ''
          : 'skipped' in f.compiled
            ? C.dim('  (not compiled)')
            : f.compiled.ok
              ? C.dim('  compiled')
              : C.red('  does not compile')
      lines.push(`  ${tag} ${f.path} ${C.dim(f.target)}${markers}${compiled}`)
      for (const l of f.leaked) {
        lines.push(
          `      ${C.red('leaked')} ${l} ${C.dim('emitted verbatim; the native build will not link')}`,
        )
      }
      if (f.compiled && 'ok' in f.compiled) {
        for (const e of f.compiled.errors.slice(0, 2)) lines.push(`      ${C.red('error')} ${truncate(e, 120)}`)
      }
      // A BROKEN verdict's warnings are the diagnosis, so they are printed in
      // full: truncating one at 120 characters cut the actionable half
      // ("Give it the shape you expect: …") off every one of them.
      if (f.verdict === 'broken') {
        for (const w of f.warnings) lines.push(`      ${w}`)
      } else if (f.declarations.length > 0) {
        // Per DECLARATION (audit G2): which model lost what, not just "a warning".
        for (const d of f.declarations.filter((x) => x.verdict !== 'lowers').slice(0, 5)) {
          lines.push(`      ${C.yellow(d.verdict)} ${d.name}${C.dim(` — ${truncate(d.reasons[0] ?? '', 110)}`)}`)
        }
      } else {
        for (const w of f.warnings.slice(0, 2)) lines.push(`      ${C.dim(truncate(w, 120))}`)
        if (f.warnings.length > 2) {
          lines.push(`      ${C.dim(`… and ${f.warnings.length - 2} more warning(s) (use --json for all)`)}`)
        }
      }
    }
  }

  if (doc.notes.length > 0) {
    // LOSSES lead, CHOICES are summarised. Petstore 3 produced 17 notes and 16
    // were "used JSON over XML" -- listed under one heading at one weight, the
    // single real loss was the note nobody reached.
    const losses = doc.notes.filter((n) => noteSeverity(n) === 'loss')
    const choices = doc.notes.filter((n) => noteSeverity(n) === 'choice')
    lines.push('')
    lines.push(
      `  ${C.bold('spec notes')} ${C.dim(`(${doc.notes.length})`)}  ` +
        `${losses.length > 0 ? C.yellow(`${losses.length} lost`) : C.green('nothing lost')}` +
        `${C.dim(`  ${choices.length} choice(s)`)}`,
    )
    // The cap counts DISTINCT entries, because that is what is printed: the
    // "and N more" line used to subtract 10 from the RAW count after
    // de-duplicating, so it claimed notes were withheld that had been shown.
    const distinct = dedupeNotes(losses)
    for (const { note: n, count } of distinct.slice(0, MAX_NOTES)) {
      lines.push(`    ${C.cyan(n.code)} ${C.dim(n.at)}${count > 1 ? C.dim(`  (+${count - 1} more like it)`) : ''}`)
      lines.push(`      ${n.message}`)
    }
    if (distinct.length > MAX_NOTES) {
      lines.push(
        `    ${C.dim(`… and ${distinct.length - MAX_NOTES} more distinct loss(es) (use --json for all ${losses.length})`)}`,
      )
    }
    if (choices.length > 0) {
      const byCode = new Map<string, number>()
      for (const n of choices) byCode.set(n.code, (byCode.get(n.code) ?? 0) + 1)
      lines.push(
        `    ${C.dim(`choices: ${[...byCode].map(([code, n]) => `${code} x${n}`).join(', ')} (use --json for detail)`)}`,
      )
    }
  }
  lines.push('')
  return lines.join('\n')
}

/**
 * Collapse repeats of the same code+message; keep the first location and how
 * many were folded into it, so a collapsed entry still reports its weight.
 */
function dedupeNotes(notes: readonly IrNote[]): Array<{ note: IrNote; count: number }> {
  const seen = new Map<string, { note: IrNote; count: number }>()
  for (const n of notes) {
    const key = `${n.code}|${n.message}`
    const hit = seen.get(key)
    if (hit) hit.count++
    else seen.set(key, { note: n, count: 1 })
  }
  return [...seen.values()]
}

function preview(ids: string[]): string {
  return ids.length <= 3 ? ids.join(', ') : `${ids.slice(0, 3).join(', ')} +${ids.length - 3}`
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}...`
}
