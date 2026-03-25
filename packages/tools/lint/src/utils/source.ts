import type { SourceLocation, Span } from "../types"

/**
 * Line index for fast offset→line/column lookups.
 * Built once per file, O(1) lookups via binary search.
 */
export class LineIndex {
  /** Byte offsets where each line starts */
  private readonly lineStarts: number[]

  constructor(sourceText: string) {
    this.lineStarts = [0]
    for (let i = 0; i < sourceText.length; i++) {
      if (sourceText.charCodeAt(i) === 10) {
        this.lineStarts.push(i + 1)
      }
    }
  }

  /** Convert byte offset to 1-based line + 0-based column */
  getLocation(offset: number): SourceLocation {
    let lo = 0
    let hi = this.lineStarts.length - 1

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1
      if (this.lineStarts[mid] <= offset) {
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }

    const line = lo // 1-based (lo is the first line that starts AFTER offset)
    const column = offset - this.lineStarts[line - 1]
    return { line, column }
  }

  /** Get the text for a byte span */
  getSourceText(sourceText: string, span: Span): string {
    return sourceText.slice(span.start, span.end)
  }
}
