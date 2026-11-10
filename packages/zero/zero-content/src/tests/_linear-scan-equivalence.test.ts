/**
 * Linear-time rewrites of the content regexes that were QUADRATIC on
 * adversarial markdown (an unclosed `[` / `<` / `{` run, a long `[\w-]` run
 * with no `=`, or `^\s*` under `m` sweeping thousands of blank lines).
 *
 * 1. Differential: each rewrite must produce EXACTLY what the regex it
 *    replaced produced, on seeded random markdown-shaped input (dense in the
 *    delimiters) and on every real doc page in the repo.
 * 2. Adversarial timing: each public entry point handles a 1e5-character
 *    attack input well under a generous bound. The old regexes took seconds.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import {
  firstDelimited,
  replaceDelimited,
  replaceMarkdownLinks,
  replaceQuotedPairs,
} from '../_shared/linear-scan'
import { parseCodeFenceMeta } from '../pipeline/code-meta'
import { parseFrontmatter } from '../pipeline/frontmatter'
import { normalizeDirectiveFences } from '../pipeline/parse'
import { parseLabel } from '../pipeline/remark-plugins/codegroup'
import { stripMarkdown } from '../search/index-builder'

// ─── The regexes as they were ──────────────────────────────────────────────
const OLD = {
  tag: (s: string) => s.replace(/<[^>]+>/g, ' '),
  link: (s: string) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'),
  bracket: (s: string) => s.replace(/\[[^\]]*\]/g, ''),
  brace: (s: string) => {
    const seen: string[] = []
    const out = s.replace(/\{([^}]*)\}/g, (_, body: string) => {
      seen.push(body)
      return `<${seen.length}>`
    })
    return { out, seen }
  },
  label: (s: string) => s.match(/\[([^\]]+)\]/)?.[1] ?? null,
  pairs: (s: string) => {
    const seen: string[] = []
    const out = s.replace(
      /([A-Za-z][\w-]*)=("([^"]*)"|'([^']*)')/g,
      (_, key: string, _q: string, dq?: string, sq?: string) => {
        seen.push(`${key}=${dq ?? sq ?? ''}`)
        return '#'
      },
    )
    return { out, seen }
  },
  commentOnly: (s: string) => s.replace(/^\s*#[^\n]+/gm, '').trim() === '',
  callout: (s: string) => s.replace(/^(\s*):::\s+([a-z][a-z0-9-]*)/gm, '$1:::$2'),
}

// The shipped form of the frontmatter comment-only check (inline in
// `parseFrontmatter`, which only exposes the verdict; mirrored here so the
// differential covers it — the timing cases below exercise the real one).
const NEW_COMMENT_ONLY = (s: string) =>
  s.replace(/^[^\S\n\r\u2028\u2029]*#[^\n]+/gm, '').trim() === ''

const NEW = {
  tag: (s: string) => replaceDelimited(s, '<', '>', 1, () => ' '),
  link: replaceMarkdownLinks,
  bracket: (s: string) => replaceDelimited(s, '[', ']', 0, () => ''),
  brace: (s: string) => {
    const seen: string[] = []
    const out = replaceDelimited(s, '{', '}', 0, (body) => {
      seen.push(body)
      return `<${seen.length}>`
    })
    return { out, seen }
  },
  label: (s: string) => firstDelimited(s, '[', ']', 1),
  pairs: (s: string) => {
    const seen: string[] = []
    const out = replaceQuotedPairs(s, (key, value) => {
      seen.push(`${key}=${value}`)
      return '#'
    })
    return { out, seen }
  },
  commentOnly: NEW_COMMENT_ONLY,
  callout: normalizeDirectiveFences,
}

// ─── Inputs ────────────────────────────────────────────────────────────────
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TOKENS = [
  '[', ']', '(', ')', '!', '<', '>', '{', '}', '"', "'", '=', '#', ':', ':::', '::: ', '-', '_', '*',
  ' ', '  ', '\t', '\n', '\n\n', '\r', '\r\n', '\u2028', '\u00a0',
  'a', 'Z', 'q9', 'title', 'filename', 'note', 'code-group', 'x_y-z', '1', '42', '1-3',
  '[link](/a)', '![img](b.png)', '<br>', '<div class="x">', '{1,3-5}', 'title="a.ts"', "k='v'", '# h',
  '  # comment', '::: tip', ':::warning', '[npm]',
]

function randomMarkdown(next: () => number, len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += TOKENS[Math.floor(next() * TOKENS.length)]
  return s
}

function realDocs(): string[] {
  const dir = path.resolve(__dirname, '../../../../../docs/src/content/docs')
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.mdx?$/.test(e.name)) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(dir)
  return out
}

describe('linear content scanners are exactly the regexes they replace', () => {
  const inputs: string[] = []
  const next = rng(0x5eed)
  for (let i = 0; i < 4000; i++) inputs.push(randomMarkdown(next, 1 + Math.floor(next() * 40)))
  const docs = realDocs()

  it('has a real-markdown corpus to compare on', () => {
    expect(docs.length).toBeGreaterThan(50)
  })

  for (const name of Object.keys(OLD) as Array<keyof typeof OLD>) {
    it(`${name}: identical on ${inputs.length} random inputs and every doc page`, () => {
      for (const s of [...inputs, ...docs, '', '[', '<>', '{}', '![](', 'a=', '\n#x']) {
        expect(NEW[name](s), JSON.stringify(s.slice(0, 200))).toEqual(OLD[name](s))
      }
    })
  }

  it('stripMarkdown is unchanged on every doc page', () => {
    // Rebuild the pre-fix pipeline from the old regexes and compare end to end.
    const oldStrip = (source: string): string => {
      let out = source
      if (out.startsWith('---')) {
        const m = out.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
        if (m) out = out.slice(m[0].length)
      }
      out = out.replace(/```[\s\S]*?```/g, ' ')
      out = out.replace(/`[^`]*`/g, ' ')
      out = OLD.tag(out)
      out = OLD.link(out)
      out = out.replace(/^#{1,6}\s+.*$/gm, '')
      out = out.replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
      return out.replace(/\s+/g, ' ').trim()
    }
    for (const s of [...docs, ...inputs.slice(0, 500)]) expect(stripMarkdown(s)).toBe(oldStrip(s))
  })
})

describe('content parsing stays linear on adversarial input', () => {
  const N = 1e5
  // Generous: the linear scans take a few ms; the old regexes took seconds
  // (1.8 s for the blank-line sweep, 4.1 s for the `[` run).
  const BOUND_MS = 200
  const time = (fn: () => unknown): number => {
    const start = performance.now()
    fn()
    return performance.now() - start
  }

  it.each([
    ['search: unclosed [ run', () => stripMarkdown('['.repeat(N))],
    ['search: [a]( run with no )', () => stripMarkdown('[a]('.repeat(N / 4))],
    ['search: unclosed < run', () => stripMarkdown('<'.repeat(N))],
    ['frontmatter: blank lines', () => parseFrontmatter(`---\n${'\n'.repeat(N)}x: 1\n---\n`)],
    ['frontmatter: CR line breaks', () => parseFrontmatter(`---\n${'\r'.repeat(N)}x: 1\n---\n`)],
    ['code meta: unclosed [ run', () => parseCodeFenceMeta('['.repeat(N))],
    ['code meta: unclosed { run', () => parseCodeFenceMeta('{'.repeat(N))],
    ['code meta: long key run with no =', () => parseCodeFenceMeta('a'.repeat(N))],
    ['code-group label: unclosed [ run', () => parseLabel('['.repeat(N))],
    ['directive normalize: blank lines', () => normalizeDirectiveFences(`${'\n'.repeat(N)}x`)],
    ['directive normalize: CR line breaks', () => normalizeDirectiveFences(`${'\r'.repeat(N)}x`)],
  ])('%s', (_name, fn) => {
    fn() // warm
    expect(time(fn)).toBeLessThan(BOUND_MS)
  })
})
