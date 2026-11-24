/**
 * Check `llms.txt` against the llmstxt.org shape: an H1 title (the only
 * required part), an optional `>` summary, optional prose or lists WITHOUT
 * headings, then `##`
 * sections that hold nothing but file-list entries
 * (`- [title](https://…)` with an optional `: notes`). Returns one message
 * per violation; an empty array means the file conforms.
 *
 * Shared by every generator of an `llms.txt` in the repo: `gen-docs`
 * (the file https://pyreon.dev/llms.txt serves; it refuses to write or pass
 * a file that fails this check) and the tests of `@pyreon/zero`'s
 * `aiPlugin` and `@pyreon/zero-content`'s `seo.llms`. Lighthouse's
 * `llms-txt` audit needs less (an H1 and one Markdown link); this is the
 * full llmstxt.org shape.
 */
export function checkLlmsTxtShape(contents: string): string[] {
  const problems: string[] = []
  const lines = contents.split('\n')
  if (!/^# \S/.test(lines[0] ?? '')) problems.push('line 1 must be the H1 title (`# Name`)')
  let section: string | null = null
  let inFence = false
  let links = 0
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`
    if (line.startsWith('```')) {
      inFence = !inFence
      if (inFence && section !== null) {
        problems.push(`${at}: a code block inside "## ${section}" (sections hold only link lists; put code in llms-full.txt)`)
      }

      return
    }
    if (inFence) return
    const heading = /^(#{1,6}) (.*)$/.exec(line)
    if (heading) {
      if (i === 0) return
      if (heading[1] === '##') section = heading[2]!
      else problems.push(`${at}: only one H1 and \`##\` section headings are allowed (found "${line}")`)

      return
    }
    for (const target of markdownLinkTargets(line)) {
      links++
      if (!target.startsWith('https://')) problems.push(`${at}: link target "${target}" must be an absolute https URL`)
    }
    if (section !== null && line.trim() !== '' && !/^- \[[^\]]+\]\([^)]+\)(: .+)?$/.test(line)) {
      problems.push(`${at}: "## ${section}" may only hold \`- [title](url): notes\` entries (found "${line.slice(0, 60)}")`)
    }
  })
  if (links === 0) problems.push('the file has no Markdown links')

  return problems
}

/**
 * The `(url)` part of every `[text](url)` in `line`, left to right: what
 * `/\[[^\]]+\]\(([^)]+)\)/g` matches. A scan with two forward-only cursors,
 * not that regex, which retries from every `[` and is quadratic on a line of
 * many `[` (CodeQL js/polynomial-redos).
 */
export function markdownLinkTargets(line: string): string[] {
  const targets: string[] = []
  let close = -1
  let i = line.indexOf('[')
  while (i !== -1) {
    if (close <= i) close = line.indexOf(']', i + 1)
    if (close === -1) break
    // `[^\]]+` needs one character before the first `]`; `\(([^)]+)\)` needs
    // `(`, one character that is not `)`, then the first `)`.
    if (close > i + 1 && line[close + 1] === '(') {
      const end = line.indexOf(')', close + 2)
      if (end === -1) break
      if (end > close + 2) {
        targets.push(line.slice(close + 2, end))
        i = line.indexOf('[', end + 1)
        continue
      }
    }
    i = line.indexOf('[', i + 1)
  }

  return targets
}

/**
 * Whether one line matches Lighthouse's `/\[.+\]\(.+\)/` (`.` stops at any
 * line terminator, so the audit's test is per line): a `[`, at least one character,
 * `](`, at least one character, `)`. The earliest `[`, then the earliest `](`
 * after it, leave the most room for the rest, so three `indexOf` calls decide
 * it in linear time.
 */
export function hasLinkLike(line: string): boolean {
  const open = line.indexOf('[')
  if (open === -1) return false
  const mid = line.indexOf('](', open + 2)
  if (mid === -1) return false

  return line.indexOf(')', mid + 3) !== -1
}

/**
 * What `.` refuses to match without the `s` flag: `\n`, `\r`, U+2028 and
 * U+2029. Splitting on `\n` alone let a `\r` (a classic-Mac line end, or one
 * inside a link) join two lines the audit's regex keeps apart.
 */
const LINE_TERMINATORS = /[\n\r\u2028\u2029]/

/**
 * The checks of Lighthouse 13.6's `llms-txt` audit, in the same order and with
 * the same results as the audit's own expressions
 * (`core/audits/agentic/llms-txt.js` in the lighthouse package: an H1 line, a
 * `[text](url)` link, at least 50 characters), so a test can tell whether a
 * file passes the audit without installing Lighthouse. Returns the audit's
 * failure messages; empty means the audit scores 1. Keep in step with the
 * version `docs/scripts/lighthouse.ts` pins.
 */
export function lighthouseLlmsTxtFailures(content: string): string[] {
  const errors: string[] = []
  if (!/^\s*#\s+.+/m.test(content)) errors.push('File is missing a required H1 header (e.g., "# Title").')
  if (!content.split(LINE_TERMINATORS).some(hasLinkLike)) errors.push('File does not appear to contain any links.')
  if (content.length < 50) errors.push('File is suspiciously short.')

  return errors
}
