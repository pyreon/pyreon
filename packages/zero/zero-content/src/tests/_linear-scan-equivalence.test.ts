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
  // The verdict is about GROWTH, not about a wall-clock budget: a shared or
  // coverage-instrumented CI runner is several times slower than a laptop,
  // and a loaded one stretches wall-clock time with time spent waiting for a
  // core (the frontmatter cases spend most of their time in the YAML parser,
  // which is linear but not cheap — 285 ms wall-clock for 1e5 blank lines
  // under coverage on CI). So timings are this process's CPU time, not wall
  // time, and each case is timed at n and at 4n: a linear scan
  // grows ~4x, a quadratic one ~16x. A case passes when it either stays
  // under a generous absolute bound at 4n (the linear scans take a few ms;
  // the old regexes took seconds — 1.8 s for the blank-line sweep at 1e5,
  // 4.1 s for the `[` run) OR grows clearly sub-quadratically. Only an
  // input that is BOTH slow and super-linear fails, which is the regression
  // this guards. Each timing is the minimum of several runs, so one GC pause
  // or scheduler hiccup cannot fake growth.
  const N = 1e5
  const FAST_MS = 200
  const MAX_GROWTH = 8
  const SAMPLES = 3
  const time = (fn: () => unknown): number => {
    let best = Number.POSITIVE_INFINITY
    for (let i = 0; i < SAMPLES; i++) {
      const start = process.cpuUsage()
      fn()
      const used = process.cpuUsage(start)
      best = Math.min(best, (used.user + used.system) / 1000)
    }
    return best
  }

  it.each<[string, (n: number) => unknown]>([
    ['search: unclosed [ run', (n) => stripMarkdown('['.repeat(n))],
    ['search: [a]( run with no )', (n) => stripMarkdown('[a]('.repeat(n / 4))],
    ['search: unclosed < run', (n) => stripMarkdown('<'.repeat(n))],
    ['frontmatter: blank lines', (n) => parseFrontmatter(`---\n${'\n'.repeat(n)}x: 1\n---\n`)],
    ['frontmatter: CR line breaks', (n) => parseFrontmatter(`---\n${'\r'.repeat(n)}x: 1\n---\n`)],
    ['code meta: unclosed [ run', (n) => parseCodeFenceMeta('['.repeat(n))],
    ['code meta: unclosed { run', (n) => parseCodeFenceMeta('{'.repeat(n))],
    ['code meta: long key run with no =', (n) => parseCodeFenceMeta('a'.repeat(n))],
    ['code-group label: unclosed [ run', (n) => parseLabel('['.repeat(n))],
    ['directive normalize: blank lines', (n) => normalizeDirectiveFences(`${'\n'.repeat(n)}x`)],
    ['directive normalize: CR line breaks', (n) => normalizeDirectiveFences(`${'\r'.repeat(n)}x`)],
  ])('%s', (_name, fn) => {
    const small = N / 4
    fn(small) // warm
    const tSmall = time(() => fn(small))
    const tLarge = time(() => fn(N))
    // Floor the small timing at 0.05 ms so a sub-resolution reading cannot
    // turn timer granularity into "growth".
    const growth = tLarge / Math.max(tSmall, 0.05)
    const verdict = { tSmallMs: tSmall, tLargeMs: tLarge, growth }
    expect(
      tLarge < FAST_MS || growth < MAX_GROWTH,
      `slow AND super-linear: ${JSON.stringify(verdict)}`,
    ).toBe(true)
  })
})
