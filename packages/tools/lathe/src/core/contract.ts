/**
 * The contract diff as a PRODUCT — two inputs in, a report a reviewer reads.
 *
 * `surface.ts` owns WHAT counts as a change (and for whom). This module owns
 * everything around it that turns a list of classified changes into something
 * a person or a PR bot can act on:
 *
 *   - reading either side from a SPEC or from a committed `api-surface.json`,
 *     so `lathe diff main:openapi.yaml openapi.yaml` and a diff of two
 *     generated trees are the same command;
 *   - naming the generated SYMBOLS each change touches — "`field-removed`
 *     `Pet.tag`" is true and unhelpful; "…used by `getPet`, `usePet`,
 *     `listPets`" is where the reviewer should look;
 *   - rendering it breaking-first, as a terminal report, Markdown a PR comment
 *     can carry, GitHub annotations, or JSON.
 *
 * Pure: no filesystem, no process. The CLI and the MCP server both call it,
 * so they cannot disagree about what a diff says.
 */
import { loadOpenApi, openApiVersionProblem } from '../input/openapi'
import { parseSpecText } from '../input/yaml'
import { surfaceMetadata } from './generate'
import { byCodeUnit } from './order'
import { diffSurface, extractSurface, type ApiSurface, type SurfaceChange } from './surface'

/** One side of a diff, read from whichever kind of file it was. */
export interface ContractSide {
  surface: ApiSurface
  /** Where it came from, for the report header. */
  source: 'spec' | 'surface'
}

/**
 * Read one side of a diff from file TEXT: an OpenAPI 3.x spec (JSON or YAML)
 * or an `api-surface.json` written by `lathe generate`.
 *
 * Throws a `[Pyreon]` error naming the file and the fix when it is neither,
 * or when a surface was written by an incompatible Lathe — a diff computed
 * against a shape this code does not understand would be a confident lie.
 */
export function readContractSide(text: string, name: string): ContractSide {
  let parsed: unknown
  try {
    parsed = parseSpecText(text)
  } catch (err) {
    throw new Error(`[Pyreon] lathe diff: \`${name}\` is not JSON or YAML: ${(err as Error).message}`)
  }
  const o = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : undefined
  if (o && 'operations' in o && 'models' in o && !('openapi' in o) && !('swagger' in o)) {
    if (o.version !== 2) {
      throw new Error(
        `[Pyreon] lathe diff: \`${name}\` is an API surface of version ${String(o.version)}; this Lathe reads version 2. ` +
          'Regenerate it (`lathe generate`), or diff the SPECS instead.',
      )
    }
    return { surface: o as unknown as ApiSurface, source: 'surface' }
  }
  const problem = openApiVersionProblem(parsed)
  if (problem) throw new Error(problem.replace('[Pyreon] lathe:', `[Pyreon] lathe diff: \`${name}\`:`))
  const { doc } = loadOpenApi(text)
  // Named as the DEFAULT emitters would name them — a spec carries no record
  // of which plugins a project runs.
  return { surface: extractSurface(doc, surfaceMetadata(doc, { client: true, queries: true })), source: 'spec' }
}

/** A classified change plus the generated symbols it touches. */
export interface ContractChange extends SurfaceChange {
  /**
   * Operations (and their generated symbols, when the surface recorded them)
   * that this change reaches. For a model change: every operation whose
   * request or response reaches the model, transitively.
   */
  affects: readonly AffectedOperation[]
}

export interface AffectedOperation {
  id: string
  /** `endpoints/<module>.ts` — present when the surface came from a generation run. */
  module?: string | undefined
  /** `getPet`, `useGetPet`, … — present when the surface came from a generation run. */
  symbols: readonly string[]
}

export interface ContractDiff {
  before: { title: string }
  after: { title: string }
  breaking: number
  additive: number
  changes: readonly ContractChange[]
}

/** Diff two surfaces and attach what each change affects. */
export function contractDiff(before: ApiSurface, after: ApiSurface): ContractDiff {
  const changes = diffSurface(before, after)
  const reach = [modelReach(before), modelReach(after)]
  const opInfo = (id: string): AffectedOperation => {
    const op = after.operations[id] ?? before.operations[id]
    return { id, module: op?.module, symbols: op?.symbols ?? [] }
  }
  const out: ContractChange[] = changes.map((c) => {
    const root = c.subject.split('.')[0] as string
    let ids: string[]
    if (before.operations[root] !== undefined || after.operations[root] !== undefined) {
      ids = [root]
    } else {
      const set = new Set<string>()
      for (const r of reach) for (const id of r.get(root) ?? []) set.add(id)
      ids = [...set].sort(byCodeUnit)
    }
    return { ...c, affects: ids.map(opInfo) }
  })
  return {
    before: { title: before.title },
    after: { title: after.title },
    breaking: out.filter((c) => c.severity === 'breaking').length,
    additive: out.filter((c) => c.severity === 'additive').length,
    changes: out,
  }
}

/** Identifiers in a rendered type string. */
function names(rendered: string | undefined): string[] {
  return rendered ? (rendered.match(/[A-Za-z_$][\w$]*/g) ?? []) : []
}

/**
 * model → the operations that reach it, read from the surface ALONE (so it
 * works for a surface loaded from disk as well as one extracted fresh).
 * Model names appear verbatim in rendered types, so references are the
 * identifiers in those strings that name a model; reachability follows them.
 */
function modelReach(s: ApiSurface): Map<string, Set<string>> {
  const models = new Set([...Object.keys(s.models), ...Object.keys(s.aliases ?? {})])
  const refsOf = (strings: (string | undefined)[]): Set<string> => {
    const out = new Set<string>()
    for (const str of strings) for (const n of names(str)) if (models.has(n)) out.add(n)
    return out
  }
  const edges = new Map<string, Set<string>>()
  for (const [name, fields] of Object.entries(s.models)) edges.set(name, refsOf(Object.values(fields)))
  for (const [name, alias] of Object.entries(s.aliases ?? {})) edges.set(name, refsOf([alias.type, ...(alias.members ?? [])]))
  const reach = new Map<string, Set<string>>()
  for (const [id, op] of Object.entries(s.operations)) {
    const stack = [...refsOf([...Object.values(op.params), op.body, op.response, op.stream])]
    const seen = new Set<string>()
    while (stack.length > 0) {
      const m = stack.pop() as string
      if (seen.has(m)) continue
      seen.add(m)
      let set = reach.get(m)
      if (!set) {
        set = new Set()
        reach.set(m, set)
      }
      set.add(id)
      for (const next of edges.get(m) ?? []) stack.push(next)
    }
  }
  return reach
}

export type ContractFormat = 'text' | 'markdown' | 'github' | 'json'
export const CONTRACT_FORMATS: readonly ContractFormat[] = ['text', 'markdown', 'github', 'json']

/** How many affected operations to list per change before summarising. */
const MAX_AFFECTS = 6

function affectsLine(c: ContractChange, code: (s: string) => string): string {
  if (c.affects.length === 0) return ''
  const shown = c.affects.slice(0, MAX_AFFECTS).map((a) => {
    const syms = a.symbols.length > 0 ? a.symbols : [a.id]
    return syms.map(code).join(', ') + (a.module ? ` (${a.module})` : '')
  })
  const more = c.affects.length > MAX_AFFECTS ? `, and ${c.affects.length - MAX_AFFECTS} more` : ''
  return `${shown.join('; ')}${more}`
}

/** Markdown-table-safe cell. Backslash first, or the escape itself is reopened. */
function cell(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ')
}

/** Inline code that survives backticks inside the text. */
function mdCode(s: string): string {
  const fence = s.includes('`') ? '``' : '`'
  return `${fence}${fence.length > 1 ? ' ' : ''}${s}${fence.length > 1 ? ' ' : ''}${fence}`
}

/**
 * A GitHub workflow-command message: `%`, CR and LF are the escapes the
 * runner recognises, and a raw newline would END the command early.
 */
function ghEscape(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/** Render a diff. `github` = workflow annotations followed by the Markdown summary. */
export function renderContractDiff(diff: ContractDiff, format: ContractFormat): string {
  if (format === 'json') return `${JSON.stringify(diff, null, 2)}\n`
  if (format === 'markdown') return renderMarkdown(diff)
  if (format === 'github') {
    const lines = diff.changes.map(
      (c) =>
        `::${c.severity === 'breaking' ? 'error' : 'notice'} title=${ghEscape(`API ${c.severity}: ${c.code}`)}::${ghEscape(
          `${c.subject} — ${c.detail}${c.affects.length > 0 ? ` (affects ${affectsLine(c, (s) => s)})` : ''}`,
        )}`,
    )
    return `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`
  }
  return renderText(diff)
}

function headline(diff: ContractDiff): string {
  if (diff.changes.length === 0) return 'No contract changes.'
  return `${diff.breaking} breaking, ${diff.additive} additive`
}

function renderText(diff: ContractDiff): string {
  const lines = [`API contract: ${headline(diff)}`]
  for (const c of diff.changes) {
    lines.push(`  ${c.severity === 'breaking' ? 'BREAKING' : 'additive'}  ${c.code}  ${c.subject} — ${c.detail}`)
    const a = affectsLine(c, (s) => s)
    if (a) lines.push(`             affects ${a}`)
  }
  return `${lines.join('\n')}\n`
}

function renderMarkdown(diff: ContractDiff): string {
  const lines = [`### API contract: ${headline(diff)}`, '']
  if (diff.before.title !== diff.after.title) {
    lines.push(`${cell(diff.before.title)} → ${cell(diff.after.title)}`, '')
  }
  if (diff.changes.length === 0) {
    lines.push('Nothing a generated client depends on moved.', '')
    return `${lines.join('\n')}\n`
  }
  const section = (title: string, list: readonly ContractChange[], blurb: string): void => {
    if (list.length === 0) return
    lines.push(`#### ${title} (${list.length})`, '', blurb, '')
    lines.push('| Change | Subject | Detail | Generated code affected |', '| --- | --- | --- | --- |')
    for (const c of list) {
      lines.push(`| \`${c.code}\` | ${mdCode(c.subject)} | ${cell(c.detail)} | ${cell(affectsLine(c, mdCode)) || '—'} |`)
    }
    lines.push('')
  }
  section(
    'Breaking',
    diff.changes.filter((c) => c.severity === 'breaking'),
    'Existing, correct client code can now be wrong at RUNTIME — it still typechecks against the regenerated types.',
  )
  section(
    'Additive',
    diff.changes.filter((c) => c.severity === 'additive'),
    'Nothing existing breaks; new surface is available.',
  )
  lines.push('<sub>Generated by <code>lathe diff</code> — severities are from the client’s point of view.</sub>', '')
  return `${lines.join('\n')}\n`
}
