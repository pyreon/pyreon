// ─── Code fence meta parser ────────────────────────────────────────────────
//
// Markdown code fences accept a "meta" string after the language token:
//
//     ```ts {1,3-5} showLineNumbers filename="config.ts"
//
// Mdast surfaces it as `Code.meta`. This module parses it into a typed
// shape so the JSX emitter (and downstream `<CodeBlock>`) can render
// line highlights, line numbers, copy buttons, and per-block filenames
// without duplicating string-parsing in every call site.
//
// Supported tokens (PR-H audit M1+M2+M3):
//
//   - `{1,3-5}` — line highlight ranges. Numbers + dash-separated ranges,
//     comma-separated; whitespace tolerated. Out-of-order ranges are
//     normalized + deduped. Invalid tokens are silently dropped (no
//     thrown errors — the rest of the meta still parses).
//
//   - `showLineNumbers` — bare token; toggles the line-number gutter.
//
//   - `noCopy` — bare token; opts out of the copy button (default on).
//
//   - `filename="config.ts"` (single OR double quotes) — visible header
//     above the rendered block.
//
//   - `title="Setup"` — alias for `filename` (some authors use either).
//
// Unknown tokens are preserved in the `unknown` array so the emitter
// can surface them as warnings instead of dropping them silently.

export interface CodeMeta {
  highlightLines: number[]
  showLineNumbers: boolean
  copyable: boolean
  filename: string | undefined
  unknown: string[]
}

/**
 * Parse a code-fence meta string into a typed shape. Pure function;
 * no allocations beyond the returned object.
 *
 * @internal exported for testing
 */
export function parseCodeFenceMeta(meta: string | null | undefined): CodeMeta {
  const result: CodeMeta = {
    highlightLines: [],
    showLineNumbers: false,
    copyable: true,
    filename: undefined,
    unknown: [],
  }
  if (!meta || meta.trim().length === 0) return result

  let remaining = meta.trim()

  // 0. Strip `[label]` brackets — consumed by the codegroup remark
  // plugin BEFORE this parser runs, but the Code node's `meta` field
  // is left intact (the codegroup plugin only reads it, never
  // mutates). Treating `[npm]` as an unknown token would surface a
  // warning for every tab inside a `:::code-group`.
  remaining = remaining.replace(/\[[^\]]*\]/g, '').trim()

  // 1. Highlight ranges in `{...}` form. Scan the meta for ALL
  // `{...}` groups and collect their numbers. Allowing multiple
  // groups (`{1} {3-5}`) is forgiving for authors who format
  // mid-edit; the dedupe step folds them.
  const rangeRe = /\{([^}]*)\}/g
  remaining = remaining.replace(rangeRe, (_, body: string) => {
    for (const token of body.split(',')) {
      const t = token.trim()
      if (t.length === 0) continue
      const dashIdx = t.indexOf('-')
      if (dashIdx >= 0) {
        const start = Number.parseInt(t.slice(0, dashIdx), 10)
        const end = Number.parseInt(t.slice(dashIdx + 1), 10)
        if (
          Number.isFinite(start)
          && Number.isFinite(end)
          && start >= 1
          && end >= start
        ) {
          for (let n = start; n <= end; n++) result.highlightLines.push(n)
        }
        continue
      }
      const n = Number.parseInt(t, 10)
      if (Number.isFinite(n) && n >= 1) result.highlightLines.push(n)
    }
    return ''
  })

  // 2. Quoted key=value pairs. Match BOTH single and double quotes.
  // The regex captures the key + the value (without quotes).
  const kvRe = /([A-Za-z][\w-]*)=("([^"]*)"|'([^']*)')/g
  remaining = remaining.replace(kvRe, (_, key: string, _qVal: string, dq?: string, sq?: string) => {
    const value = dq ?? sq ?? ''
    if (key === 'filename' || key === 'title') {
      result.filename = value
    } else {
      result.unknown.push(`${key}=${value}`)
    }
    return ''
  })

  // 3. Remaining bare tokens.
  for (const raw of remaining.split(/\s+/)) {
    const token = raw.trim()
    if (token.length === 0) continue
    if (token === 'showLineNumbers') {
      result.showLineNumbers = true
    } else if (token === 'noCopy') {
      result.copyable = false
    } else {
      result.unknown.push(token)
    }
  }

  // Dedupe + sort highlight lines so output is deterministic regardless
  // of the order author wrote them in.
  if (result.highlightLines.length > 1) {
    result.highlightLines = Array.from(new Set(result.highlightLines)).sort(
      (a, b) => a - b,
    )
  }
  return result
}
