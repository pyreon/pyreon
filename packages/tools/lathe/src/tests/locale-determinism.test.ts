/**
 * Output order must not depend on the host locale (audit F1).
 *
 * The published bin runs under node, which collates `localeCompare` by
 * `LC_ALL`. Under Danish collation `aa` is `å` and sorts after `z`, so the
 * same spec produced different files on two machines. Bun always reports
 * `en-US`, so the only way to see the divergence in-process is to install
 * the collation ourselves.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveConfig } from '../core/config'
import { generate } from '../core/generate'
import { byCodeUnit } from '../core/order'

const SPEC = JSON.stringify({
  openapi: '3.0.3',
  info: { title: 'L', version: '1' },
  servers: [{ url: 'https://a.test' }],
  paths: {
    '/a': { get: { operationId: 'aabList', tags: ['aa'], responses: { '204': { description: 'x' } } } },
    '/b': { get: { operationId: 'abList', tags: ['ab'], responses: { '204': { description: 'x' } } } },
    '/c': { get: { operationId: 'zList', tags: ['z'], responses: { '204': { description: 'x' } } } },
  },
  components: {
    schemas: {
      Aab: { type: 'object', properties: { aa: { type: 'string' }, ab: { type: 'string' } } },
      Ab: { type: 'object', properties: { z: { type: 'string' } } },
    },
  },
})

function run(): string {
  const cfg = resolveConfig({ input: 'x', plugins: ['schemas', 'client', 'queries', 'docs'] })
  return generate(SPEC, cfg)
    .files.map((f) => `--- ${f.path}\n${f.contents}`)
    .join('\n')
}

describe('generation is locale-independent', () => {
  it('byte-identical under a Danish collation', () => {
    const baseline = run()
    const original = String.prototype.localeCompare
    const danish = new Intl.Collator('da')
    // Sanity: the collation really does reorder `aa` — otherwise this test
    // could pass against a broken comparator.
    expect(['aab', 'ab'].sort(danish.compare)).toEqual(['ab', 'aab'])
    String.prototype.localeCompare = function (this: string, that: string) {
      return danish.compare(this, that)
    }
    try {
      expect(run()).toBe(baseline)
    } finally {
      String.prototype.localeCompare = original
    }
    // And the order is code-unit order.
    expect(baseline.indexOf('aabList')).toBeLessThan(baseline.indexOf('export const abList'))
  })

  it('byCodeUnit is code-unit order', () => {
    expect(['ab', 'aab', 'Z', 'z', 'å'].sort(byCodeUnit)).toEqual(['Z', 'aab', 'ab', 'z', 'å'])
    expect(byCodeUnit('a', 'a')).toBe(0)
  })

  it('no emitter or core module calls localeCompare', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..')
    const offenders: string[] = []
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const abs = join(dir, name)
        if (statSync(abs).isDirectory()) {
          if (name !== 'tests') walk(abs)
          continue
        }
        if (name.endsWith('.ts') && /\.localeCompare\(/.test(readFileSync(abs, 'utf8'))) offenders.push(abs)
      }
    }
    walk(root)
    expect(offenders).toEqual([])
  })
})
