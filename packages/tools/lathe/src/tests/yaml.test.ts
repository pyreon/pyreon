import { parseSpecText, parseYaml, YamlError } from '../input/yaml'

describe('yaml', () => {
  it('reads the block shapes an OpenAPI document uses', () => {
    const v = parseYaml(`
info:
  title: "Petstore: the API"   # comment
  version: 1.0.0
servers:
  - url: https://api.example.com/v1
tags: [pets, public]
nested:
  schema: { type: integer, minimum: 1 }
`) as Record<string, unknown>
    const info = v.info as Record<string, unknown>
    const servers = v.servers as { url: string }[]
    const nested = v.nested as Record<string, unknown>
    expect(info.title).toBe('Petstore: the API')
    expect(servers[0]!.url).toBe('https://api.example.com/v1')
    expect(v.tags).toEqual(['pets', 'public'])
    expect(nested.schema).toEqual({ type: 'integer', minimum: 1 })
  })

  it('keeps a colon inside a quoted key and inside a URL value', () => {
    // The naive `split(':')` reader gets both of these wrong, and an OpenAPI
    // document contains one of each on almost every line.
    const v = parseYaml('a: https://x.com:8080/p\n"b:c": 1') as Record<string, unknown>
    expect(v.a).toBe('https://x.com:8080/p')
    expect(v['b:c']).toBe(1)
  })

  it('preserves newlines in a literal block scalar and folds a folded one', () => {
    const v = parseYaml('lit: |\n  one\n  two\nfold: >\n  three\n  four\n') as Record<string, string>
    // Clip chomping keeps the final newline -- YAML 1.2 8.1.1.2.
    expect(v.lit).toBe('one\ntwo\n')
    expect(v.fold).toBe('three four\n')
  })

  it('accepts a sequence indented at its key', () => {
    const v = parseYaml('items:\n- a\n- b') as Record<string, unknown>
    expect(v.items).toEqual(['a', 'b'])
  })

  it('reads a sequence of maps', () => {
    const v = parseYaml('ps:\n  - name: limit\n    in: query\n  - name: id\n    in: path') as {
      ps: { name: string; in: string }[]
    }
    expect(v.ps).toEqual([
      { name: 'limit', in: 'query' },
      { name: 'id', in: 'path' },
    ])
  })

  it('scans scalar types the way JSON does', () => {
    const v = parseYaml('a: 1\nb: 1.5\nc: true\nd: null\ne: ~\nf: text') as Record<string, unknown>
    expect(v).toEqual({ a: 1, b: 1.5, c: true, d: null, e: null, f: 'text' })
  })

  it('REFUSES an undefined alias, a custom tag and tab indentation', () => {
    // Each would otherwise produce a document that is subtly wrong everywhere
    // the construct was used — far worse than declining to open it.
    for (const bad of ['a: *x', 'a: !Custom 1', 'a:\n\tb: 1']) {
      expect(() => parseYaml(bad), bad).toThrow(YamlError)
    }
  })

  it('routes JSON text to JSON.parse', () => {
    expect(parseSpecText('{"a":[1,2]}')).toEqual({ a: [1, 2] })
  })

  it('accepts a UTF-8 BOM on the JSON path as well as the YAML one', () => {
    // Detection trimmed the BOM but `JSON.parse` was handed the untrimmed
    // text and rejected it as an unrecognised token.
    expect(parseSpecText('\uFEFF{"a":1}')).toEqual({ a: 1 })
    expect(parseSpecText('\uFEFFa: 1')).toEqual({ a: 1 })
  })

  it('reports the line number on a failure', () => {
    try {
      parseYaml('a: 1\nb: !Custom 2')
      expect.unreachable('should have thrown')
    } catch (err) {
      expect((err as YamlError).line).toBe(2)
      expect((err as Error).message).toContain('[Pyreon]')
    }
  })
})
