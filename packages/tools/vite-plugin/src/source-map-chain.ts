/**
 * One source map for the whole `transform` hook.
 *
 * The hook runs several passes over a module: pre-passes on the source
 * (island names, the JSX auto-import, the inline-`<Defer>` rewrite), the JSX
 * compile, then dev-only passes on the compiled output (HMR signal rewrite,
 * signal debug names). Vite composes the maps of DIFFERENT plugins, but a
 * single hook must return one map from the text it received to the text it
 * returns. Returning only the compiler's map (or `null`) left every pass
 * around it unmapped: an auto-imported line pushed every frame one line down,
 * a debug-name insertion moved the columns after it.
 *
 * Each pass that moves text records a step with its own map; `map()` composes
 * them. Text appended at the very end (`append`) moves nothing and needs no
 * step. A step that changed the text without a map makes the chain
 * unmappable: `map()` then returns `null` rather than a map that lies.
 */
import { TraceMap, originalPositionFor, type EncodedSourceMap } from '@jridgewell/trace-mapping'
import { composeMappings } from '@pyreon/compiler'
import MagicString from 'magic-string'

/** A replacement on the current text; `start === end` is an insertion. */
export interface TextEdit {
  start: number
  end: number
  text: string
}

/** The fields of a V3 map this module reads (magic-string's and the compiler's). */
export interface SourceMapLike {
  version: number
  sources: string[]
  names: string[]
  mappings: string
  sourcesContent?: (string | null)[] | undefined
  file?: string | undefined
}

/**
 * Apply `edits` (disjoint, positions in `code`) through magic-string. The
 * text is the same as splicing them in by hand; the map is magic-string's
 * per-character one, so a column anywhere in untouched text still maps.
 */
export function applyEdits(code: string, edits: readonly TextEdit[]): MagicString {
  const s = new MagicString(code)
  const sorted = [...edits].sort((a, b) => a.start - b.start)
  for (const e of sorted) {
    if (e.start === e.end) s.appendLeft(e.start, e.text)
    else if (e.text === '') s.remove(e.start, e.end)
    else s.update(e.start, e.end, e.text)
  }
  return s
}

export class SourceMapChain {
  code: string
  readonly #sourcesContent: string
  readonly #id: string
  /** Step maps in the order they were applied (first = closest to the source). */
  readonly #steps: SourceMapLike[] = []
  #broken = false

  /**
   * `code` is the text the first step starts from. `sourcesContent` is the
   * text the map points into when that differs only position-for-position
   * (the same-length NODE_ENV fold): it defaults to `code`.
   */
  constructor(code: string, id: string, sourcesContent: string = code) {
    this.code = code
    this.#sourcesContent = sourcesContent
    this.#id = id
  }

  /** A pass that produced `next` from the current text with `map`. */
  step(next: string, map: SourceMapLike | null | undefined): void {
    if (next === this.code) return
    if (map) this.#steps.push(map)
    else this.#broken = true
    this.code = next
  }

  /** A pass expressed as edits on the current text. */
  edit(edits: readonly TextEdit[]): void {
    if (edits.length === 0) return
    const s = applyEdits(this.code, edits)
    this.step(s.toString(), s.generateMap({ hires: 'boundary', source: this.#id }))
  }

  /** Text added after everything else: no existing position moves. */
  append(text: string): void {
    this.code += text
  }

  /**
   * The original position of a (1-based line, 1-based column) in the current
   * text, in the same terms, or `null` when it does not map. Used to report
   * source positions from a pass that runs on compiled output.
   */
  originalPosition(line: number, col: number): { line: number; col: number } | null {
    if (this.#broken) return null
    let pos = { line, column: col - 1 }
    for (let i = this.#steps.length - 1; i >= 0; i--) {
      const traced = originalPositionFor(this.#traceMap(i), pos)
      if (traced.line === null || traced.column === null) return null
      pos = { line: traced.line, column: traced.column }
    }
    return { line: pos.line, col: pos.column + 1 }
  }

  readonly #traceMaps: TraceMap[] = []
  #traceMap(i: number): TraceMap {
    return (this.#traceMaps[i] ??= new TraceMap(this.#steps[i] as EncodedSourceMap))
  }

  /** One map from the hook's input to `code`, or `null` when nothing moved. */
  map(): SourceMapLike | null {
    if (this.#broken || this.#steps.length === 0) return null
    // Fold from the step nearest the output inwards.
    let mappings = this.#steps[this.#steps.length - 1]!.mappings
    for (let i = this.#steps.length - 2; i >= 0; i--) {
      mappings = composeMappings(mappings, this.#steps[i]!.mappings)
    }
    return {
      version: 3,
      sources: [this.#id],
      sourcesContent: [this.#sourcesContent],
      names: [],
      mappings,
    }
  }
}
