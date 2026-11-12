/**
 * Compose two single-source V3 source maps: `outer` maps C → B, `inner` maps
 * B → A, the result maps C → A.
 *
 * Every map this is used on comes from a positioned-edit transform (the JSX
 * transform, the Plain Mode pre-pass, the Vite plugin's passes), so a lookup
 * only needs the inner segment at or before a position on the same line,
 * which is what a stack-trace consumer does too: a decode, one binary search
 * per outer segment, and an encode. The native binary carries the same
 * algorithm (`native/src/sourcemap.rs` `compose`) and is used when present.
 *
 * An outer segment that lands on text the inner map does not cover (text the
 * inner transform generated) is dropped, as `remapping` drops it. Two
 * consecutive segments on a line that trace to the same position collapse to
 * the first.
 */
import { decode, encode, type SourceMapMappings, type SourceMapSegment } from '@jridgewell/sourcemap-codec'
import { loadNativeBinding } from './load-native'

const native = loadNativeBinding(import.meta.url)
const nativeCompose =
  native && typeof native.composeMappings === 'function' ? native.composeMappings : null

/** Returns the composed `mappings` string. */
export function composeMappings(outer: string, inner: string): string {
  if (nativeCompose) {
    try {
      const composed = nativeCompose(outer, inner)
      if (typeof composed === 'string') return composed
    } catch {
      // Fall through to the JS implementation, which is the oracle.
    }
  }
  return composeMappingsJS(outer, inner)
}

/** The JS implementation: the oracle the native one is tested against. */
export function composeMappingsJS(outer: string, inner: string): string {
  const innerLines = decode(inner)
  const outerLines = decode(outer)
  const out: SourceMapMappings = new Array(outerLines.length)
  for (let l = 0; l < outerLines.length; l++) {
    const segs = outerLines[l]!
    const line: SourceMapSegment[] = []
    let lastLine = -1
    let lastCol = -1
    for (const seg of segs) {
      if (seg.length === 1) continue
      const hit = lookup(innerLines[seg[2]!], seg[3]!)
      if (hit === null || hit.length === 1) continue
      const srcLine = hit[2]!
      const srcCol = hit[3]!
      if (srcLine === lastLine && srcCol === lastCol) continue
      lastLine = srcLine
      lastCol = srcCol
      line.push([seg[0], 0, srcLine, srcCol])
    }
    out[l] = line
  }
  return encode(out)
}

/** The last segment of `line` whose generated column is ≤ `col`. */
function lookup(line: SourceMapSegment[] | undefined, col: number): SourceMapSegment | null {
  if (!line || line.length === 0) return null
  let lo = 0
  let hi = line.length - 1
  if (line[0]![0] > col) return null
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (line[mid]![0] <= col) lo = mid
    else hi = mid - 1
  }
  return line[lo]!
}
