/**
 * The `::: bench` block of a blog post: a short list of results, each a big
 * number and one line, with a link to the benchmarks page under it.
 *
 *     ::: bench
 *     - **2.6×** faster than React 19 building 10,000 rows
 *     - **17.2 KB** gzipped for the same app, against React's 69.6 KB
 *     :::
 *
 * Every item starts with its number in bold. `vite-plugins/blog.ts`
 * rewrites the block before `@pyreon/zero-content` compiles the post: a raw
 * `<div class="blog-bench">` around the untouched markdown list and a
 * markdown link to the benchmarks page, so the list keeps its inline markdown
 * (links, code) and the post's prose styles draw it (`views/prose.ts`,
 * `.blog-bench`). A feed reader gets the plain list and the link: the RSS
 * body drops raw HTML. (The link is markdown, not raw HTML: a raw `<p>` there
 * compiles to a `<p>` nested in a `<p>`.)
 *
 * Numbers in a bench block come from `BENCHMARKS.md`, as everywhere else on
 * the site; this only changes how a list the post already has is drawn.
 */

/** Where the footer link of every bench block goes. */
export const BENCH_HREF = '/benchmarks'

const OPEN = /^:::[ \t]*bench[ \t]*$/
const CLOSE = /^:::[ \t]*$/

/** The class name the prose styles and the tests read. */
export const BENCH_CLASS = 'blog-bench'

/**
 * Rewrite every `::: bench` block in a markdown source. Returns the source
 * unchanged when it has none. Throws (with the line) on a block that is not
 * closed, is empty, or has an item that does not start with a bold number.
 */
export function rewriteBenchBlocks(source: string, moreLabel: string, file = 'markdown'): string {
  if (!/^:::[ \t]*bench/m.test(source)) return source
  if (/[[\]<>{}&]/.test(moreLabel)) throw new Error(`[Pyreon] The bench link label "${moreLabel}" must not contain [ ] < > { } or &.`)
  const lines = source.split('\n')
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    if (!OPEN.test(line)) {
      out.push(line)
      continue
    }
    const start = i + 1
    let end = start
    while (end < lines.length && !CLOSE.test(lines[end] as string)) end++
    if (end >= lines.length) throw new Error(`[Pyreon] ${file}:${i + 1}: \`::: bench\` is not closed. Add a line with \`:::\` after its list.`)
    const body = lines.slice(start, end)
    const items = body.filter((l) => /^[-*+] /.test(l))
    if (items.length === 0) throw new Error(`[Pyreon] ${file}:${i + 1}: \`::: bench\` needs a list: one \`- **number** text\` line per result.`)
    for (const item of items) {
      if (!/^[-*+] \*\*[^*]+\*\* \S/.test(item)) {
        throw new Error(`[Pyreon] ${file}: a \`::: bench\` item must start with its number in bold, then the text: "${item}".`)
      }
    }
    out.push(
      `<div class="${BENCH_CLASS}" data-bench="">`,
      '',
      ...body,
      '',
      `[${moreLabel}](${BENCH_HREF})`,
      '',
      '</div>',
    )
    i = end
  }
  return out.join('\n')
}
