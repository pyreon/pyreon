/**
 * The YAML reader against YAML 1.2, case by case.
 *
 * `fixtures/yaml-cases.json` is the 57-case micro-suite from the lathe input
 * audit, with each `expected` recorded from `yaml@2`'s DEFAULT parse -- the
 * reference YAML 1.2 core-schema reading. Against it the previous hand-written
 * reader diverged on 31 cases: 17 threw on valid YAML (multi-line plain
 * scalars, `- >-` sequence items, nested `- - 1`) and 14 returned a DIFFERENT
 * value without a word (a `# Heading` line inside a `|` block deleted,
 * paragraph breaks collapsed, `é` left literal, duplicate keys last-wins).
 * The silent ones are the dangerous ones: a spec that parses wrong generates a
 * client that is wrong, and nothing reports it.
 *
 * The reader is strict on purpose, so a handful of cases are EXPECTED to
 * differ from the permissive default. Each is listed in `POLICY` with the
 * reason, and the suite fails if a case diverges for any other reason -- or if
 * a listed divergence stops happening, which would mean the policy moved.
 */
import { describe, expect, it } from 'vitest'
import { parseYaml, YamlError } from '../input/yaml'
import { readFileSync } from 'node:fs'

interface Case {
  name: string
  source: string
  expected: unknown
  throws?: true
}

// Read as TEXT and parsed with `JSON.parse`: a bundler's JSON-module import
// turns the `__proto__` case's key into a prototype assignment, which would
// make the oracle itself wrong on exactly the case that checks this.
const cases = JSON.parse(
  readFileSync(new URL('./fixtures/yaml-cases.json', import.meta.url), 'utf8'),
) as Case[]

/** Deliberate departures from the default reading, and what happens instead. */
const POLICY: Record<string, { throws: RegExp } | { value: unknown }> = {
  // `.inf` / `.nan` have no JSON spelling; the JSON half of the reader cannot
  // produce them, so the YAML half refuses rather than inventing one.
  'number forms': { throws: /`\.inf` has no JSON form/ },
  // YAML 1.2's core schema leaves `<<` a literal key; the reader enables merge
  // keys, because a spec author who wrote one meant it to merge.
  'merge key': { value: { base: { x: 1 }, d: { x: 1 } } },
}

describe('YAML reader matches YAML 1.2 core on every audit case', () => {
  for (const c of cases) {
    it(c.name, () => {
      const policy = POLICY[c.name]
      if (policy && 'throws' in policy) {
        expect(() => parseYaml(c.source)).toThrow(policy.throws)
        return
      }
      if (c.throws) {
        expect(() => parseYaml(c.source)).toThrow(YamlError)
        return
      }
      const want = policy && 'value' in policy ? policy.value : c.expected
      // Compared as JSON TEXT, which is also how an own `__proto__` key survives.
      expect(JSON.stringify(parseYaml(c.source))).toBe(JSON.stringify(want))
    })
  }

  it('lists no policy entry for a case that does not exist', () => {
    const names = new Set(cases.map((c) => c.name))
    for (const k of Object.keys(POLICY)) expect(names.has(k), k).toBe(true)
  })
})
