/**
 * Reading a spec document: JSON, or YAML 1.2.
 *
 * YAML is read by the `yaml` package (eemeli/yaml, ISC, zero dependencies),
 * configured STRICTLY. This file used to be a ~390-line hand-written reader
 * scoped to "the subset an OpenAPI document uses", on the argument that a full
 * parser imports risk. Measured against real specs, the argument ran the other
 * way: the narrow reader refused GitHub, Stripe, OpenAI, Twilio and
 * DigitalOcean outright (multi-line plain scalars, `- >-` sequence items, nested
 * `- - 1` sequences are the default output of every YAML dumper), and SILENTLY
 * corrupted the files it did open -- `#` lines and blank lines inside `|`
 * blocks dropped, chomping ignored, `\uXXXX` escapes left literal, duplicate
 * keys last-wins. 31 of 57 micro-cases diverged from YAML 1.2. The subset real
 * specs use is simply most of YAML.
 *
 * What stays is the POLICY the old reader was right about -- a document that is
 * subtly wrong is worse than one that does not open -- now enforced by options
 * and one tree walk instead of by an incomplete grammar:
 *
 *  - DUPLICATE KEYS throw (`uniqueKeys`). Last-wins silently discards a schema.
 *  - A MULTI-DOCUMENT stream throws, rather than quietly using the first.
 *  - CUSTOM TAGS (`!Ref`, `!include`) throw. `yaml` would keep the scalar and
 *    warn, which turns a tag the author meant to be expanded into a literal
 *    string. The YAML 1.2 core tags (`!!str`, `!!int`, …) are accepted: they
 *    only restate a type.
 *  - NON-JSON values throw: `.inf` / `.nan` (no JSON spelling) and a map or
 *    sequence used as a KEY. The IR is built from JSON-shaped data, and the
 *    JSON half of this reader cannot produce either.
 *  - A RECURSIVE alias (an alias inside its own anchor) throws. It would build
 *    a cyclic object, and every walk downstream would loop on it.
 *
 * ANCHORS, ALIASES AND MERGE KEYS ARE SUPPORTED. The old reader refused them
 * because it could not resolve them, and refusing was better than ignoring.
 * `yaml` resolves them exactly, they are valid YAML, and hand-maintained specs
 * use them to share parameter and error-response blocks -- refusing a correct
 * document is a bug, not a safety property. Expansion is bounded by
 * `maxAliasCount` (the "billion laughs" guard), and merge keys (`<<`) are
 * enabled so they merge rather than landing as a literal `"<<"` property.
 *
 * Every error carries a 1-based line number.
 */

import { isCollection, LineCounter, parseDocument, visit, type Node } from 'yaml'

export class YamlError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(`[Pyreon] lathe: YAML parse error on line ${line}: ${message}`)
    this.name = 'YamlError'
  }
}

/**
 * Alias expansions allowed per document before the reader refuses.
 *
 * Each alias can expand a whole subtree, so an adversarial document with a few
 * nested aliases can expand exponentially. 1000 is far above what any real
 * spec uses (they alias a handful of shared blocks) and far below what makes a
 * `lathe pull` of a hostile URL a memory problem.
 */
const MAX_ALIAS_COUNT = 1000

/** Parse a YAML document. Throws {@link YamlError} on anything not JSON-shaped. */
export function parseYaml(source: string): unknown {
  const lineCounter = new LineCounter()
  const doc = parseDocument(stripBom(source), {
    lineCounter,
    uniqueKeys: true,
    merge: true,
    prettyErrors: false,
    // `core` is YAML 1.2's default schema: `yes`/`no` stay strings, `0x1F` is
    // 31, `1e3` is 1000. No timestamps, no binary, no sets -- nothing that
    // is not JSON-shaped, which the walk below then enforces.
    schema: 'core',
  })
  const lineOf = (offset: number | undefined): number =>
    offset === undefined ? 1 : lineCounter.linePos(offset).line

  const first = doc.errors[0]
  if (first) {
    // The library's own wording for this one tells the reader to call a
    // different API, which is advice for a programmer holding `yaml`, not for
    // someone holding a spec.
    const message =
      first.code === 'MULTIPLE_DOCS'
        ? 'the file holds more than one YAML document (`---`); a spec is exactly one -- split the file.'
        : firstLine(first.message)
    throw new YamlError(message, lineOf(first.pos[0]))
  }
  for (const w of doc.warnings) {
    if (w.code === 'TAG_RESOLVE_FAILED') {
      throw new YamlError(
        `${firstLine(w.message)} -- custom tags are not expanded. Resolve them (or bundle the spec) before generating.`,
        lineOf(w.pos[0]),
      )
    }
  }

  visit(doc, {
    Pair(_key, pair) {
      const k = pair.key as Node | null
      if (k && isCollection(k)) {
        throw new YamlError('a mapping or sequence used as a KEY has no JSON form.', lineOf(k.range?.[0]))
      }
    },
    Scalar(_key, node) {
      if (typeof node.value === 'number' && !Number.isFinite(node.value)) {
        throw new YamlError(
          `\`${node.source ?? String(node.value)}\` has no JSON form -- quote it if a string was meant.`,
          lineOf(node.range?.[0]),
        )
      }
    },
    Alias(_key, alias, path) {
      const target = alias.resolve(doc)
      if (target && path.includes(target)) {
        throw new YamlError(
          `alias \`*${alias.source}\` refers to an anchor that contains it -- a recursive document has no JSON form.`,
          lineOf(alias.range?.[0]),
        )
      }
    },
  })

  try {
    return doc.toJS({ maxAliasCount: MAX_ALIAS_COUNT })
  } catch (err) {
    // `toJS` throws on excessive alias expansion. It carries no position, so
    // report the first alias -- the expansion necessarily starts at one.
    let aliasLine = 1
    visit(doc, {
      Alias(_k, a) {
        aliasLine = lineOf(a.range?.[0])
        return visit.BREAK
      },
    })
    throw new YamlError(err instanceof Error ? err.message : String(err), aliasLine)
  }
}

/** Read a spec from text, choosing JSON or YAML by content. */
export function parseSpecText(source: string): unknown {
  // A UTF-8 BOM (Windows editors, some CDNs) must go before BOTH branches:
  // `JSON.parse` rejects it as an unrecognised token.
  const text = stripBom(source)
  if (text.trimStart().startsWith('{')) return JSON.parse(text)
  return parseYaml(text)
}

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function firstLine(message: string): string {
  const nl = message.indexOf('\n')
  return nl === -1 ? message : message.slice(0, nl)
}
