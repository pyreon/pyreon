/**
 * Input gate for every MCP tool that takes source code (`validate`,
 * `explain_reactivity`, `migrate_react`, `migrate_pyreon`, and the
 * `componentSource` of `diagnose` / `explain_error`).
 *
 * The detectors parse with an error-recovering parser, so on input they cannot
 * read they find nothing, and "nothing found" used to come back as a clean
 * verdict. The commonest case is an assistant passing its code still wrapped in
 * a markdown fence: three backticks are an (empty) template literal, so a
 * fenced block parses as a chain of tagged template literals, the code inside
 * becomes a string, and every detector skips it.
 *
 * Contract (shared by every tool that calls `prepareSnippet`):
 *   - Empty or whitespace-only input → `empty`; no verdict.
 *   - A filename with a non-JS/TS extension (`.vue`, `.svelte`, …) →
 *     `unsupported`; no verdict.
 *   - Input that is exactly ONE fenced block (backticks or tildes, language
 *     tag optional, surrounding blank lines allowed) → the fence is stripped,
 *     the content is checked, and `fence` says so. Line numbers then count from
 *     the first line inside the fence.
 *   - Input that starts with a fence but is not one block, or that fails to
 *     parse and contains fence lines (prose around code, several blocks) →
 *     `markdown`; nothing is guessed.
 *   - Anything that fails to parse → `syntax-error` with the parser's first
 *     error and its position. The code is returned too, because detectors that
 *     work on a partial tree may still report what they found; the verdict is
 *     the syntax error, never a pass.
 */
import { findSyntaxErrors, type SourceSyntaxError } from '@pyreon/compiler/analyze'

export interface FenceInfo {
  /** The info string after the opening fence (`tsx`), or `''`. */
  language: string
}

export type PreparedSnippet =
  | { kind: 'ok'; code: string; fence: FenceInfo | null }
  | { kind: 'syntax-error'; code: string; fence: FenceInfo | null; errors: SourceSyntaxError[] }
  | { kind: 'empty'; fence: FenceInfo | null }
  | { kind: 'markdown'; fenceLines: number; errors: SourceSyntaxError[] }
  | { kind: 'unsupported'; filename: string }

const SOURCE_EXTENSION = /\.[cm]?[jt]sx?$/i
/** A line that opens or closes a fence: 3+ backticks or tildes, optional info string. */
const FENCE_LINE = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*([^`\s]*)[^`]*$/

export function prepareSnippet(input: string, filename: string): PreparedSnippet {
  // A filename with an extension that is not JS/TS (`App.vue`, `Counter.svelte`)
  // is a different language; no extension at all is treated as a TSX snippet.
  const base = filename.split(/[\\/]/).pop() ?? filename
  if (base.includes('.') && !SOURCE_EXTENSION.test(base)) return { kind: 'unsupported', filename }

  if (input.trim() === '') return { kind: 'empty', fence: null }

  const lines = input.split(/\r?\n/)
  let first = 0
  let last = lines.length - 1
  while (first < last && lines[first]!.trim() === '') first++
  while (last > first && lines[last]!.trim() === '') last--
  const fenceLines = lines.filter((l) => FENCE_LINE.test(l)).length

  const open = FENCE_LINE.exec(lines[first]!)
  if (open) return prepareFenced({ lines, first, last, open, fenceLines }, filename)

  const errors = findSyntaxErrors(input, filename)
  if (errors.length === 0) return { kind: 'ok', code: input, fence: null }
  // Prose around a fenced block, or several blocks: do not guess which part is
  // the code. (A clean parse with a fence-looking line is real code, e.g. a
  // block comment holding markdown, so this only applies on failure.)
  if (fenceLines > 0) return { kind: 'markdown', fenceLines, errors }

  return { kind: 'syntax-error', code: input, fence: null, errors }
}

interface FencedInput {
  lines: readonly string[]
  /** Index of the first and last non-blank lines. */
  first: number
  last: number
  /** The opening fence match on `lines[first]`. */
  open: RegExpExecArray
  /** How many lines in the whole input look like fences. */
  fenceLines: number
}

/** Input whose first non-blank line opens a fence: one block is unwrapped, anything else is markdown. */
function prepareFenced(
  { lines, first, last, open, fenceLines }: FencedInput,
  filename: string,
): PreparedSnippet {
  // Exactly one fenced block: the closing line uses the same character, is at
  // least as long, carries no info string, and nothing between is a fence.
  const close = last > first ? FENCE_LINE.exec(lines[last]!) : null
  const marker = open[1]!
  const isSingleBlock =
    close !== null &&
    close[1]![0] === marker[0] &&
    close[1]!.length >= marker.length &&
    lines[last]!.trim() === close[1] &&
    fenceLines === 2
  if (!isSingleBlock) return { kind: 'markdown', fenceLines, errors: [] }
  const fence: FenceInfo = { language: open[2] ?? '' }
  const inner = lines.slice(first + 1, last).join('\n')
  if (inner.trim() === '') return { kind: 'empty', fence }
  const errors = findSyntaxErrors(inner, filename)

  return errors.length > 0
    ? { kind: 'syntax-error', code: inner, fence, errors }
    : { kind: 'ok', code: inner, fence }
}

function where(e: SourceSyntaxError): string {
  return `line ${e.line}, column ${e.column + 1}`
}

/**
 * The verdict text for a snippet that cannot be analysed, or `null` for `ok` /
 * `syntax-error`'s detector findings to follow. `action` names what the tool
 * would have done ("validated", "migrated", "analysed").
 */
export function describeUnreadable(
  prepared: Exclude<PreparedSnippet, { kind: 'ok' }>,
  filename: string,
  action: string,
): string {
  switch (prepared.kind) {
    case 'empty':
      return prepared.fence
        ? `✗ Nothing to check: the input is an empty markdown code fence. Nothing was ${action}.`
        : `✗ Nothing to check: the input is empty. Nothing was ${action}.`
    case 'unsupported':
      return `✗ Unsupported file type: "${prepared.filename}". This tool reads TypeScript and JavaScript source (.ts, .tsx, .js, .jsx); Vue, Svelte and other formats are not parsed, so nothing was ${action}.`
    case 'markdown': {
      const first = prepared.errors[0]
      return (
        `✗ The input is markdown, not source code: it has ${prepared.fenceLines} code-fence line${prepared.fenceLines === 1 ? '' : 's'} and is not a single fenced block${
          first ? ` and does not parse as code (${where(first)}: ${first.message})` : ''
        }. Nothing was ${action}. Pass only the source of one file; a single surrounding \`\`\` fence is stripped automatically, but prose or several blocks are not guessed at.`
      )
    }
    case 'syntax-error': {
      const first = prepared.errors[0]!
      const more = prepared.errors.length - 1
      return (
        `✗ Syntax error at ${where(first)}: ${first.message}\n` +
        `The code does not parse as ${parseModeLabel(filename)}, so it was not ${action}${
          more > 0 ? ` (${more} more syntax error${more === 1 ? '' : 's'} after this one)` : ''
        }. Fix the syntax and call the tool again.`
      )
    }
  }
}

function parseModeLabel(filename: string): string {
  const ext = /\.([cm]?[jt]sx?)$/i.exec(filename)?.[1]?.toLowerCase() ?? 'tsx'
  return `${ext.toUpperCase()} (${filename})`
}

/** The note appended when a single surrounding fence was stripped. */
export function fenceNote(fence: FenceInfo | null): string {
  if (!fence) return ''
  const tag = fence.language ? ` (\`\`\`${fence.language})` : ''
  return `\n\nNote: the input was wrapped in a markdown code fence${tag}; the fence was stripped and the code inside it was checked. Line numbers count from the first line inside the fence.`
}
