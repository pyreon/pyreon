/**
 * The shared llms.txt checker. `gen-docs`, `@pyreon/zero`'s `aiPlugin` and
 * `@pyreon/zero-content`'s `seo.llms` all gate on it, so a checker that wrongly
 * passes lets a broken file ship from three places at once. The two scanners
 * replace regexes (ReDoS), so they are held to those regexes by a differential
 * test and to linear work by an operation count, not a wall clock.
 */
import {
  checkLlmsTxtShape,
  hasLinkLike,
  lighthouseLlmsTxtFailures,
  markdownLinkTargets,
} from '../llms-txt'
import { countStringOps } from '../string-ops'

const GOOD = [
  '# Pyreon',
  '',
  '> Signals-first UI framework.',
  '',
  'Prose before the first section is allowed.',
  '',
  '```ts',
  'const code = "allowed before any section"',
  '```',
  '',
  '## Docs',
  '',
  '- [Getting started](https://pyreon.dev/docs/getting-started): the first page',
  '- [API](https://pyreon.dev/docs/api)',
  '',
  '## Optional',
  '',
  '- [Full reference](https://pyreon.dev/llms-full.txt): everything',
].join('\n')

describe('checkLlmsTxtShape', () => {
  it('accepts the llmstxt.org shape: H1, summary, prose and code before the sections, link-list sections', () => {
    expect(checkLlmsTxtShape(GOOD)).toEqual([])
  })

  it('requires the H1 title on line 1', () => {
    expect(checkLlmsTxtShape(`\n${GOOD}`)).toContain('line 1 must be the H1 title (`# Name`)')
    expect(checkLlmsTxtShape('')).toEqual(['line 1 must be the H1 title (`# Name`)', 'the file has no Markdown links'])
  })

  it('refuses a second H1 and any heading other than `##`', () => {
    const problems = checkLlmsTxtShape(`${GOOD}\n# Again\n### Deep`)
    expect(problems).toEqual([
      'line 19: only one H1 and `##` section headings are allowed (found "# Again")',
      'line 20: only one H1 and `##` section headings are allowed (found "### Deep")',
    ])
  })

  it('refuses a code block inside a section, and checks nothing inside the block', () => {
    const problems = checkLlmsTxtShape(`${GOOD}\n\`\`\`\n### not a heading\n[x](http://inside.fence)\n\`\`\``)
    expect(problems).toEqual([
      'line 19: a code block inside "## Optional" (sections hold only link lists; put code in llms-full.txt)',
    ])
  })

  it('refuses a link that is not an absolute https URL, wherever it is', () => {
    const text = GOOD.replace('Prose before', 'See [home](/relative) — prose before').replace(
      'https://pyreon.dev/docs/api',
      'http://pyreon.dev/docs/api',
    )
    expect(checkLlmsTxtShape(text)).toEqual([
      'line 5: link target "/relative" must be an absolute https URL',
      'line 14: link target "http://pyreon.dev/docs/api" must be an absolute https URL',
    ])
  })

  it('refuses anything but `- [title](url): notes` entries inside a section', () => {
    const problems = checkLlmsTxtShape(`${GOOD}\nplain prose\n- /users/:id\n- [t](https://x.dev):no-space`)
    expect(problems).toEqual([
      'line 19: "## Optional" may only hold `- [title](url): notes` entries (found "plain prose")',
      'line 20: "## Optional" may only hold `- [title](url): notes` entries (found "- /users/:id")',
      'line 21: "## Optional" may only hold `- [title](url): notes` entries (found "- [t](https://x.dev):no-space")',
    ])
  })

  it('requires at least one Markdown link', () => {
    expect(checkLlmsTxtShape('# Name\n\n> Summary only.')).toEqual(['the file has no Markdown links'])
  })
})

describe('lighthouseLlmsTxtFailures', () => {
  it('passes a file with an H1, a link and 50 characters', () => {
    expect(lighthouseLlmsTxtFailures(GOOD)).toEqual([])
  })

  it('reports each failing check, in the audit order', () => {
    expect(lighthouseLlmsTxtFailures('no title, no link')).toEqual([
      'File is missing a required H1 header (e.g., "# Title").',
      'File does not appear to contain any links.',
      'File is suspiciously short.',
    ])
    expect(lighthouseLlmsTxtFailures(`# T\n${'x'.repeat(60)}`)).toEqual(['File does not appear to contain any links.'])
    expect(lighthouseLlmsTxtFailures('  #  Title\n[a](b)')).toEqual(['File is suspiciously short.'])
  })

  it('a link split by a line terminator other than \\n is not a link (the audit regex stops at \\r, U+2028, U+2029)', () => {
    const pad = 'x'.repeat(60)
    for (const eol of ['\r', ' ', ' ']) {
      expect(lighthouseLlmsTxtFailures(`# T ${pad}\n[a${eol}](b)`), JSON.stringify(eol)).toEqual([
        'File does not appear to contain any links.',
      ])
    }
    expect(lighthouseLlmsTxtFailures(`# T ${pad}\r\n[a](b)\r\n`)).toEqual([])
  })
})

/** Deterministic PRNG (mulberry32), so a failing case reproduces. */
function rng(seed: number): () => number {
  let a = seed

  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomStrings(alphabet: string[], count: number, seed: number): string[] {
  const next = rng(seed)
  const out: string[] = []
  for (let n = 0; n < count; n++) {
    const len = Math.floor(next() * 24)
    let s = ''
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(next() * alphabet.length)]
    out.push(s)
  }

  return out
}

const LINK_CHARS = ['[', ']', '(', ')', '[', ']', '(', ')', 'a', 'b', ' ', ':']

describe('the scanners agree with the regexes they replace', () => {
  it('markdownLinkTargets === every capture of /\\[[^\\]]+\\]\\(([^)]+)\\)/g', () => {
    const ref = (line: string) => [...line.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((m) => m[1])
    for (const line of randomStrings(LINK_CHARS, 20_000, 1)) {
      expect(markdownLinkTargets(line), JSON.stringify(line)).toEqual(ref(line))
    }
  })

  it('hasLinkLike === /\\[.+\\]\\(.+\\)/ on one line', () => {
    const ref = /\[.+\]\(.+\)/
    for (const line of randomStrings(LINK_CHARS, 20_000, 2)) {
      expect(hasLinkLike(line), JSON.stringify(line)).toBe(ref.test(line))
    }
  })

  it('the links check of lighthouseLlmsTxtFailures === /\\[.+\\]\\(.+\\)/ on the whole file', () => {
    const ref = /\[.+\]\(.+\)/
    const noLinks = 'File does not appear to contain any links.'
    for (const text of randomStrings([...LINK_CHARS, '\n', '\r', ' ', ' '], 20_000, 3)) {
      expect(lighthouseLlmsTxtFailures(text).includes(noLinks), JSON.stringify(text)).toBe(!ref.test(text))
    }
  })
})

describe('the scanners do linear work', () => {
  // The inputs that make the replaced regexes retry from every `[`.
  const shapes: Record<string, (n: number) => string> = {
    'many [': (n) => '['.repeat(n),
    'many [ then ]': (n) => `${'['.repeat(n)}]`,
    'many [a] without (': (n) => '[a]'.repeat(n),
    'many [a]( without )': (n) => '[a]('.repeat(n),
    'many [a]() with an empty target': (n) => '[a]()'.repeat(n),
    'many [a](b) links': (n) => '[a](b)'.repeat(n),
    'many [] then ](': (n) => `${'[]'.repeat(n)}](`,
  }

  for (const [label, make] of Object.entries(shapes)) {
    it(`${label}: no regex, and the builtin-call count grows linearly`, () => {
      for (const scan of [markdownLinkTargets, hasLinkLike]) {
        const small = countStringOps(() => scan(make(1_000)))
        const large = countStringOps(() => scan(make(8_000)))
        expect(small.regexSources).toEqual([])
        expect(large.regexSources).toEqual([])
        // Quadratic work would grow 64x between the sizes; linear grows 8x.
        // Calls alone miss a cursor that re-searches from every position (n
        // calls, n² characters), so the characters indexOf reads count too.
        expect(large.stringCalls, `${scan.name}: ${small.stringCalls} → ${large.stringCalls}`).toBeLessThanOrEqual(
          8 * small.stringCalls + 8,
        )
        expect(
          large.indexOfScanned,
          `${scan.name}: ${small.indexOfScanned} → ${large.indexOfScanned} characters`,
        ).toBeLessThanOrEqual(8 * small.indexOfScanned + 64)
      }
    })
  }
})
