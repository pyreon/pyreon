/**
 * The first-party YAML reader.
 *
 * lathe parses OpenAPI without a YAML dependency, over a subset it
 * defines. That makes every mis-read silent in the worst possible way:
 * the spec parses, an IR is built, a client is GENERATED from it, and
 * the wrong types ship. Nobody sees a parse error — they see an endpoint
 * whose response type does not match the server.
 *
 * So the reader's most important behaviour is REFUSING. A YAML feature
 * outside the subset (an anchor, a merge key, an explicit tag) must
 * throw with a line number, never be skipped: skipping an anchor means
 * the schema it aliased is silently empty, and an empty schema generates
 * a client that validates nothing.
 *
 * Tab indentation is the sharpest of those. YAML forbids tabs outright,
 * and a reader that treats one as whitespace computes a different
 * indent than every other tool — so the same file means one thing to
 * lathe and another to the editor that wrote it.
 *
 * The quoting and comment rules matter for the same reason: `#` inside a
 * quoted string is data (a colour, a fragment URL, a format hint), and
 * stripping it truncates a value that then generates as a shorter enum
 * or a broken path.
 */
import { describe, expect, it } from 'vitest'
import { parseYaml, YamlError } from '../input/yaml'

const y = (s: string) => parseYaml(s)

describe('scalars are typed the way YAML types them', () => {
  it('reads the primitives', () => {
    expect(y('a: hello')).toEqual({ a: 'hello' })
    expect(y('a: 42')).toEqual({ a: 42 })
    expect(y('a: 4.5')).toEqual({ a: 4.5 })
    expect(y('a: -7')).toEqual({ a: -7 })
  })

  it('reads every spelling of the booleans and null', () => {
    // A `False` read as the STRING "False" is truthy, so a `required:
    // False` field generates as required.
    for (const t of ['true', 'True', 'TRUE']) expect(y(`a: ${t}`), t).toEqual({ a: true })
    for (const f of ['false', 'False', 'FALSE']) expect(y(`a: ${f}`), f).toEqual({ a: false })
    for (const n of ['null', 'Null', 'NULL', '~', '']) {
      expect(y(`a: ${n}`), JSON.stringify(n)).toEqual({ a: null })
    }
  })

  it('keeps a quoted number as a STRING', () => {
    // OpenAPI status-code keys and version strings are quoted for
    // exactly this reason; coercing `"200"` to 200 loses the key.
    expect(y('a: "42"')).toEqual({ a: '42' })
    expect(y("a: '3.0'")).toEqual({ a: '3.0' })
  })

  it('decodes escapes in DOUBLE quotes only', () => {
    // Single-quoted YAML is literal. Decoding there would corrupt a
    // Windows path or a regex pattern in a spec.
    expect(y('a: "x\\ny"')).toEqual({ a: 'x\ny' })
    expect(y('a: "x\\ty"')).toEqual({ a: 'x\ty' })
    expect(y('a: "x\\ry"')).toEqual({ a: 'x\ry' })
    expect(y('a: "x\\"y"')).toEqual({ a: 'x"y' })
    expect(y("a: 'x\\ny'")).toEqual({ a: 'x\\ny' })
  })

  it('THROWS on an unterminated quoted scalar', () => {
    // Silently taking the rest of the line would swallow the next key.
    expect(() => y('a: "unterminated')).toThrow(YamlError)
  })
})

describe('comments are stripped only where they are comments', () => {
  it('strips a trailing comment', () => {
    expect(y('a: value # trailing')).toEqual({ a: 'value' })
  })

  it('strips a whole-line comment', () => {
    expect(y('# leading\na: 1\n# trailing')).toEqual({ a: 1 })
  })

  it('KEEPS a # that is part of a value', () => {
    // A colour, a fragment, a `$ref`. Stripping it truncates the value
    // and the generated client points at nothing.
    expect(y('a: "#/components/schemas/User"')).toEqual({ a: '#/components/schemas/User' })
    expect(y('a: "#ff0000"')).toEqual({ a: '#ff0000' })
  })

  it('requires a SPACE before an unquoted trailing #', () => {
    // `a: v#1` is the value `v#1`, not `v`. YAML is specific about this
    // and so is a version string or an anchor-looking id.
    expect(y('a: v#1')).toEqual({ a: 'v#1' })
  })
})

describe('mappings and sequences nest', () => {
  it('reads a nested mapping', () => {
    expect(y('a:\n  b:\n    c: 1')).toEqual({ a: { b: { c: 1 } } })
  })

  it('reads a sequence of scalars', () => {
    expect(y('a:\n  - x\n  - y')).toEqual({ a: ['x', 'y'] })
  })

  it('reads a sequence of mappings', () => {
    // The shape of `parameters:` in every OpenAPI operation.
    expect(y('a:\n  - name: id\n    in: path\n  - name: q\n    in: query')).toEqual({
      a: [{ name: 'id', in: 'path' }, { name: 'q', in: 'query' }],
    })
  })

  it('reads a sequence whose item body starts on the NEXT line', () => {
    // `-` alone, then an indented mapping. Common in hand-written specs.
    expect(y('a:\n  -\n    name: id\n  -\n    name: q')).toEqual({
      a: [{ name: 'id' }, { name: 'q' }],
    })
  })

  it('reads a mapping nested under a sequence item', () => {
    expect(y('a:\n  - name: id\n    schema:\n      type: string')).toEqual({
      a: [{ name: 'id', schema: { type: 'string' } }],
    })
  })

  it('reads an empty document as null', () => {
    for (const s of ['', '\n\n', '# only a comment']) {
      expect(y(s), JSON.stringify(s)).toBeNull()
    }
  })

  it('reads a key with an empty value as null', () => {
    // `description:` with nothing after it. Reading it as `""` would
    // generate an empty description rather than none.
    expect(y('a:\nb: 1')).toEqual({ a: null, b: 1 })
  })
})

describe('document markers', () => {
  it('reads past a leading ---', () => {
    expect(y('---\na: 1')).toEqual({ a: 1 })
  })

  it('stops at a SECOND document rather than merging it', () => {
    // Merging would silently combine two specs into one.
    expect(y('a: 1\n---\nb: 2')).toEqual({ a: 1 })
  })

  it('stops at the ... end marker', () => {
    expect(y('a: 1\n...\nb: 2')).toEqual({ a: 1 })
  })
})

describe('flow collections', () => {
  it('reads inline sequences and mappings', () => {
    expect(y('a: [1, 2, 3]')).toEqual({ a: [1, 2, 3] })
    expect(y('a: {x: 1, y: 2}')).toEqual({ a: { x: 1, y: 2 } })
    expect(y('a: []')).toEqual({ a: [] })
    expect(y('a: {}')).toEqual({ a: {} })
  })

  it('reads nested and quoted flow content', () => {
    expect(y('a: [{x: 1}, {x: 2}]')).toEqual({ a: [{ x: 1 }, { x: 2 }] })
    expect(y('a: ["x, y", z]')).toEqual({ a: ['x, y', 'z'] })
  })

  it('THROWS on trailing characters after a flow collection', () => {
    // `[1,2] junk` is a typo; taking the array and dropping the rest
    // hides it.
    expect(() => y('a: [1, 2] junk')).toThrow(YamlError)
  })

  it('THROWS on a flow mapping missing its colon', () => {
    expect(() => y('a: {x 1}')).toThrow(YamlError)
  })
})

describe('quoting interacts with comment stripping and flow parsing', () => {
  it('keeps a # inside a quoted value even mid-line', () => {
    // The comment scanner has to know it is inside a quote. A `$ref`
    // truncated at its fragment points at the whole document.
    expect(y('a: "x #y" # real comment')).toEqual({ a: 'x #y' })
    expect(y("a: 'x #y' # real")).toEqual({ a: 'x #y' })
  })

  it('does not end a double-quoted value at an ESCAPED quote', () => {
    // `"a \" b"` is one value. Ending early swallows the rest as a
    // parse error on the following key.
    expect(y('a: "x \\" y" # c')).toEqual({ a: 'x " y' })
  })

  it('treats a backslash literally inside SINGLE quotes', () => {
    // Single-quoted YAML has no escapes, so `\"` is two characters and
    // does not extend the value.
    expect(y("a: 'x\\' # c")).toEqual({ a: 'x\\' })
  })

  it('keeps a # inside a flow collection value', () => {
    expect(y('a: ["#one", "#two"]')).toEqual({ a: ['#one', '#two'] })
  })

  it('keeps an escaped quote inside a flow collection', () => {
    expect(y('a: ["x \\" y"]')).toEqual({ a: ['x " y'] })
  })

  it('reads a value that is only whitespace as null', () => {
    // `description:   ` with trailing spaces. An empty string here
    // generates a blank description rather than none.
    expect(y('a:   \nb: 1')).toEqual({ a: null, b: 1 })
  })
})

describe('malformed structure is refused, not guessed at', () => {
  it('refuses a sequence item indented past its parent', () => {
    expect(() => y('a:\n  - x\n      - y')).toThrow(YamlError)
  })

  it('stops a mapping at a sibling sequence item', () => {
    // `- name: a` then a bare `- ` at the same indent starts the NEXT
    // item; folding it into the first merges two parameters into one.
    expect(y('a:\n  - x: 1\n  - x: 2')).toEqual({ a: [{ x: 1 }, { x: 2 }] })
  })

  it('reads a document that is a bare SEQUENCE', () => {
    expect(y('- a\n- b')).toEqual(['a', 'b'])
  })

  it('REFUSES a document that is a bare scalar', () => {
    // The reader is scoped to the OpenAPI subset, where the document is
    // always a mapping. Accepting a scalar would push the failure down
    // to `loadOpenApi`, which can only say "did not parse to an object"
    // — no line number, no offending text.
    let err: unknown
    try { y('just a string') } catch (e) { err = e }
    expect(err).toBeInstanceOf(YamlError)
    expect(String((err as Error).message)).toContain("key: value")
    expect(String((err as Error).message), 'and quotes what it found')
      .toContain('just a string')
  })
})

describe('what the reader REFUSES, by design', () => {
  // Each of these is a real YAML feature outside lathe's subset. Skipping
  // one produces a spec that parses into the WRONG shape — an anchor
  // silently resolving to nothing means a schema generates as empty, and
  // an empty schema validates nothing.
  for (const [label, src] of [
    ['an anchor', 'a: &anchor 1\nb: 1'],
    ['an alias', 'a: 1\nb: *anchor'],
    ['a merge key', 'a:\n  <<: *base\n  x: 1'],
    ['an explicit tag', 'a: !!str 1'],
  ] as Array<[string, string]>) {
    it(`refuses ${label} with a line number`, () => {
      let err: unknown
      try { y(src) } catch (e) { err = e }
      expect(err, label).toBeInstanceOf(YamlError)
      expect(String((err as Error).message), label).toMatch(/line \d+|:\d+/)
    })
  }

  it('refuses TAB indentation', () => {
    // YAML forbids tabs. A reader that treats one as whitespace computes
    // a different indent than the editor that wrote the file, so the
    // same bytes mean two different specs.
    let err: unknown
    try { y('a:\n\tb: 1') } catch (e) { err = e }
    expect(err).toBeInstanceOf(YamlError)
    expect(String((err as Error).message).toLowerCase()).toContain('tab')
  })

  it('refuses an unexpected indent rather than guessing', () => {
    expect(() => y('a: 1\n    b: 2')).toThrow(YamlError)
  })

  it('names the LINE in every refusal', () => {
    // The whole point of refusing rather than skipping: the author has
    // to be able to find it in a 4000-line spec.
    let err: unknown
    try { y('openapi: 3.0.0\ninfo:\n  title: t\npaths:\n  /x: !!weird 1') } catch (e) { err = e }
    expect(String((err as Error).message)).toMatch(/5|line/)
  })
})
