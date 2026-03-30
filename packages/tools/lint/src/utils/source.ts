import type { SourceLocation } from '../types'

/**
 * Fast offset→line/column conversion using binary search over precomputed line starts.
 */
export class LineIndex {
  private lineStarts: number[]

  constructor(sourceText: string) {
    this.lineStarts = [0]
    for (let i = 0; i < sourceText.length; i++) {
      if (sourceText[i] === '\n') {
        this.lineStarts.push(i + 1)
      }
    }
  }

  /** Convert a byte offset to a 1-based line and 0-based column. */
  locate(offset: number): SourceLocation {
    let lo = 0
    let hi = this.lineStarts.length - 1

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if ((this.lineStarts[mid] as number) <= offset) {
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const line = lo // 1-based (lo points one past the found index)
    const column = offset - (this.lineStarts[line - 1] as number)
    return { line, column }
  }
}
