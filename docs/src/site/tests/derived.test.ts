import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SITE_DERIVED_KEYS } from '../../../../packages/tools/cli/src/doctor/gates/doc-claims-site-counts'
import { allRules } from '../../../../packages/tools/lint/src/rules'
import { parseAntiPatterns } from '../../../../packages/tools/mcp/src/anti-patterns'
import mcpManifest from '../../../../packages/tools/mcp/src/manifest'
import derivedCounts from '../../../vite-plugins/derived-counts'
import { computeDerived, DERIVED_KEYS, derived, resolveDerived } from '../derived'

/**
 * The counts the site prints that are facts about the repository are computed when the site is built and written into
 * the content through `{{@key}}` placeholders (`src/site/derived.ts`). This file proves the resolver fails loudly and
 * that every count agrees with the thing it counts, read through the real packages and not through the same regexes.
 */
const REPO = resolve(__dirname, '../../../..')
const COUNTS = computeDerived(REPO)

describe('resolveDerived', () => {
  it('fills a placeholder with its count', () => {
    expect(resolveDerived('{{@productCount}} products, {{@antiPatternCount}} mistakes', COUNTS, 'x.json')).toBe(`${COUNTS.productCount} products, ${COUNTS.antiPatternCount} mistakes`)
  })

  it('leaves i18n examples alone: `{{count}}` is not a placeholder', () => {
    expect(resolveDerived('t("files", { count }) // {{count}} files', COUNTS, 'x.json')).toBe('t("files", { count }) // {{count}} files')
  })

  it('fails the build on an unknown key, naming the file and the known keys', () => {
    expect(() => resolveDerived('{{@productCunt}}', COUNTS, 'src/site/content/_nav.json')).toThrow(/_nav\.json: unknown derived count "\{\{@productCunt\}\}"\. Known keys: antiPatternCount/)
  })

  it('fails the build on a malformed marker', () => {
    expect(() => resolveDerived('{{@ productCount}', COUNTS, 'x.json')).toThrow(/malformed/)
  })

  it('refuses a count that could not be computed, instead of printing 0', () => {
    expect(() => resolveDerived('{{@mcpToolCount}}', { ...COUNTS, mcpToolCount: 0 }, 'x.json')).toThrow(/could not be computed/)
  })
})

describe('the build plugin', () => {
  const plugin = derivedCounts(() => COUNTS)
  const transform = (code: string, id: string) => (plugin.transform as unknown as (c: string, i: string) => { code: string } | null)(code, id)

  it('resolves a content JSON file and leaves other files alone', () => {
    expect(transform('{"a":"{{@productCount}} products"}', '/r/docs/src/site/content/_home.json')?.code).toBe(`{"a":"${COUNTS.productCount} products"}`)
    expect(transform('{"a":"{{@productCount}}"}', '/r/docs/src/other.json')).toBeNull()
  })

  it('throws for an unresolvable placeholder in a content file', () => {
    expect(() => transform('{"a":"{{@nope}}"}', '/r/docs/src/site/content/_home.json')).toThrow(/unknown derived count/)
  })
})

describe('every placeholder in the real content resolves', () => {
  const root = join(REPO, 'docs/src/site/content')
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), out)
      else if (e.name.endsWith('.json')) out.push(join(dir, e.name))
    }

    return out
  }

  it('resolves cleanly, and no marker is left', () => {
    let used = 0
    for (const file of walk(root)) {
      const text = readFileSync(file, 'utf8')
      used += text.match(/\{\{@/g)?.length ?? 0
      expect(resolveDerived(text, COUNTS, file)).not.toContain('{{@')
    }
    expect(used, 'the content uses placeholders').toBeGreaterThan(40)
  })

  it('the gate and the resolver know the same keys', () => {
    expect([...DERIVED_KEYS]).toEqual([...SITE_DERIVED_KEYS])
  })
})

describe('each count agrees with the thing it counts', () => {
  it('anti-patterns: the entries the MCP catalog parser finds', () => {
    expect(COUNTS.antiPatternCount).toBe(parseAntiPatterns(readFileSync(join(REPO, '.agents/rules/anti-patterns.md'), 'utf8')).length)
  })

  it('lint rules: the registry', () => {
    expect(COUNTS.lintRuleCount).toBe(allRules.length)
  })

  it('MCP tools: the manifest entries that are tools', () => {
    const api = (mcpManifest as unknown as { api: { signature: string }[] }).api
    expect(COUNTS.mcpToolCount).toBe(api.filter((a) => a.signature.startsWith('tool: ')).length)
  })

  it('products: one content file per id of the index', () => {
    const files = readdirSync(join(REPO, 'docs/src/site/content/products')).filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    expect(COUNTS.productCount).toBe(files.length)
  })

  it('packages: the one constant', () => {
    expect(COUNTS.packageCount).toBe((JSON.parse(readFileSync(join(REPO, 'docs/src/site/content/_counts.json'), 'utf8')) as { packages: number }).packages)
  })

  it('this checkout is what the plugin uses', () => {
    expect(derived()).toEqual(COUNTS)
  })
})

describe('a pull request that adds a catalog entry changes the number and nothing in the content', () => {
  it('counts one more entry in a copy of the tree, with the content untouched', () => {
    const copy = mkdtempSync(join(tmpdir(), 'pyreon-derived-'))
    const put = (rel: string) => {
      mkdirSync(dirname(join(copy, rel)), { recursive: true })
      cpSync(join(REPO, rel), join(copy, rel))
    }
    for (const rel of ['.agents/rules/anti-patterns.md', 'docs/src/site/content/products/_index.json', 'docs/src/site/content/_counts.json']) put(rel)
    const before = computeDerived(copy).antiPatternCount
    const catalog = join(copy, '.agents/rules/anti-patterns.md')
    writeFileSync(catalog, `${readFileSync(catalog, 'utf8')}\n- **A fake entry** added by a pull request.\n`)
    const sentence = 'a paged index of the whole catalog ({{@antiPatternCount}} entries in the catalog)'
    expect(computeDerived(copy).antiPatternCount).toBe(before + 1)
    expect(resolveDerived(sentence, computeDerived(copy), 'ai.json')).toBe(`a paged index of the whole catalog (${before + 1} entries in the catalog)`)
  })
})
