/**
 * Shared MDX-safety helpers for the docs generators (gen-reference,
 * gen-troubleshooting). The `@pyreon/zero-content` pipeline is MDX-ish:
 * bare `<`, `{`, and `:name` in FLOW text are parsed as JSX / expressions /
 * directives and either break the build or silently drop content. These
 * helpers escape that in flow text while leaving inline `code` spans raw
 * (angle brackets etc. render fine inside code), and quote frontmatter.
 */

/** A fenced code block (raw — fenced code is not MDX-parsed). */
export const fence = (lang: string, body: string): string =>
  '```' + lang + '\n' + String(body).trimEnd() + '\n```'

/**
 * An inline code span as CommonMark defines it: a run of N backticks, then
 * content, then a run of exactly N backticks. A double-backtick span is how a
 * message that itself contains backticks is quoted
 * (`` `` [Pyreon] <For> requires a `by` prop `` ``). A single-backtick-only
 * scanner treats the inner backticks as span boundaries, so it escapes the
 * span's own text and leaves the text after it raw.
 */
const CODE_SPAN = /(?<!`)(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g

const escText = (s: string): string =>
  s
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/:(?=[A-Za-z])/g, '&#58;')

/**
 * Escape `<` `>` `{` `}` and bare `:name` in markdown FLOW text, leaving
 * inline code spans (any backtick-run length) untouched. `: ` and `://` are
 * not escaped (no letter follows), so prose colons and URLs survive.
 */
export const escFlow = (s: string): string => {
  const str = String(s ?? '')
  let out = ''
  let last = 0
  for (const m of str.matchAll(CODE_SPAN)) {
    out += escText(str.slice(last, m.index)) + m[0]
    last = m.index + m[0].length
  }
  return out + escText(str.slice(last))
}

/** YAML-safe double-quoted scalar (values may contain `:`, `@`, `"`). */
export const yaml = (s: string): string =>
  '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'
