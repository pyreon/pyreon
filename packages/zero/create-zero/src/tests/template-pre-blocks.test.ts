/**
 * A `<pre>` code block in a starter template renders with its line breaks.
 *
 * JSX drops a line break between children: a text run is trimmed at each
 * newline and whitespace-only lines vanish, in Pyreon as in every JSX
 * implementation, and `<pre>` gets no exception. The 0.53.0 starter wrote
 * its code samples one source line per code line, so the home and counter
 * pages rendered `state(0)const doubled = …` on one line. A line break inside
 * `<pre>` has to be a child: `{"\n"}` at the end of a line, or one template
 * literal holding the whole sample.
 *
 * Each block goes through the real compiler (`transformJSX`), which folds a
 * static `<pre>` into one `_tpl` HTML string, and the text is read back from
 * that string — what the browser and the SSR output show.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { transformJSX } from '@pyreon/compiler'
import { describe, expect, it } from 'vitest'

const TEMPLATES = resolve(import.meta.dirname, '../../templates')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name)
    if (statSync(abs).isDirectory()) return name === 'node_modules' ? [] : tsxFiles(abs)
    return name.endsWith('.tsx') ? [abs] : []
  })
}

function preBlocks(source: string): string[] {
  return [...source.matchAll(/<pre[\s>][\s\S]*?<\/pre>/g)].map((m) => m[0])
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** The text a static `<pre>` block renders: its `_tpl` HTML with tags stripped and entities decoded. */
function renderedText(block: string): string | undefined {
  const code = transformJSX(`export const C = () => (${block})`, 'block.tsx').code
  const literal = code.match(/_tpl\(("(?:[^"\\]|\\.)*")/)?.[1]
  if (literal === undefined) return undefined
  const html = JSON.parse(literal) as string
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&(\w+);/g, (m, n: string) => ENTITIES[n] ?? m)
}

const ROUTES = join(TEMPLATES, 'app/src/routes')
const read = (rel: string): string => readFileSync(join(ROUTES, rel), 'utf8')
const only = (rel: string): string => {
  const blocks = preBlocks(read(rel))
  expect(blocks, rel).toHaveLength(1)
  return blocks[0]!
}

describe('the app starter code samples keep their line breaks', () => {
  it('home: the terminal block', () => {
    expect(renderedText(only('index.tsx'))).toBe(
      ['# Create a new project in seconds', 'bun create @pyreon/zero my-app', 'cd my-app', 'bun install', 'bun run dev'].join('\n'),
    )
  })

  it('counter: the state / derived sample', () => {
    expect(renderedText(only('counter.tsx'))).toBe(
      [
        'let count = state(0)',
        'const doubled = derived(count * 2)',
        '',
        '// Write it like a normal variable:',
        'count++',
        '',
        '// …and every place that reads it updates ✓',
      ].join('\n'),
    )
  })

  it('posts: the loader sample', () => {
    expect(renderedText(only('posts/index.tsx'))).toBe(
      [
        '// Export a loader — runs on the server',
        'export async function loader(ctx) {',
        '  const posts = await db.posts.findMany()',
        '  return { posts }',
        '}',
        '',
        '// Access data in the component',
        'const data = useLoaderData()',
      ].join('\n'),
    )
  })

  it('dashboard: the guard and middleware sample', () => {
    expect(renderedText(only('(admin)/dashboard.tsx'))).toBe(
      [
        '// Navigation guard — protect routes',
        'export function guard() {',
        '  if (!isAuthenticated) {',
        '    return "/login" // redirect',
        '  }',
        '  return true // allow',
        '}',
        '',
        '// Per-route server middleware',
        'export const middleware = (req, next) => {',
        '  // logging, auth, rate limiting...',
        '  return next(req)',
        '}',
      ].join('\n'),
    )
  })
})

describe('every multi-line <pre> sample in every template renders on more than one line', () => {
  const cases = tsxFiles(TEMPLATES).flatMap((file) =>
    preBlocks(readFileSync(file, 'utf8')).map((block, i) => [`${relative(TEMPLATES, file)} #${i + 1}`, block] as const),
  )

  it('finds the template samples', () => {
    expect(cases.length).toBeGreaterThanOrEqual(7)
  })

  it.each(cases)('%s', (_name, block) => {
    const inner = block.replace(/^<pre[^>]*>/, '').replace(/<\/pre>$/, '').replace(/<\/?code>/g, '')
    const sourceLines = inner.split('\n').filter((l) => l.trim() !== '')
    // A single dynamic child (`{String(error)}`) or a one-line sample has no line break to lose.
    if (sourceLines.length < 2) return
    const literal = inner.trim().match(/^\{`([\s\S]*)`\}$/)
    if (literal) {
      expect(literal[1]).toContain('\n')
      return
    }
    const text = renderedText(block)
    expect(text, 'a static sample folds into the template').toBeDefined()
    expect(text!.split('\n').length, text).toBe(sourceLines.length)
  })
})
