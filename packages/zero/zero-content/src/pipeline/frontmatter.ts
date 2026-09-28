import { parse as parseYaml } from 'yaml'

// ─── Frontmatter split + parse ──────────────────────────────────────────────
//
// First-party replacement for `gray-matter`. The package used exactly one
// call — `matter(source)` → `{ data, content }` — and carried gray-matter's
// whole graph for it (section-matter, kind-of, extend-shallow,
// strip-bom-string, and js-yaml 3 with its argparse + esprima deps).
//
// The SPLIT reproduces gray-matter 4's rules exactly (characterized in
// `tests/frontmatter.test.ts`, which also differentially checks a corpus
// against gray-matter itself):
//
//   - A leading BOM is stripped.
//   - Frontmatter exists only when the source STARTS with `---` and the
//     next character is not another `-` (`----` is a thematic break).
//   - Text after the opening `---` on the same line is the LANGUAGE
//     (`---json`, `---yaml`); an absent one means YAML.
//   - The block ends at the first `\n---` (anywhere — a longer `\n----`
//     also closes it); with no closing delimiter the whole remainder is
//     frontmatter and the body is empty.
//   - One line terminator after the closing delimiter is dropped from the
//     body (`\r` then `\n`, each at most once).
//   - A block that is empty once `#` comment lines are removed yields `{}`.
//
// The PARSE is where this deliberately differs from gray-matter:
//
//   - YAML is read by `yaml` (YAML 1.2 core schema), plus the two YAML 1.1
//     features js-yaml's safe schema had that real frontmatter relies on:
//     timestamps (`date: 2024-01-15` stays a `Date`) and `<<` merge keys.
//     The remaining 1.1-isms js-yaml 3 applied — leading-zero octal
//     (`010` → 8), sexagesimal numbers (`1:30` → 90), `_` digit separators
//     (`1_000` → 1000) — now read as YAML 1.2 does (10, the string
//     `"1:30"`, the string `"1_000"`). Each is locked by a spec.
//   - `---js` / `---javascript` frontmatter is REFUSED. gray-matter
//     `eval`ed it, i.e. a content file could execute code at build time.
//   - Only `yaml`/`yml` and `json` are accepted; anything else throws
//     (gray-matter threw too, with an engine-registry message).
//   - A block that parses to a non-object (a bare scalar, a list) throws a
//     clear error. gray-matter handed it through as `data`, so a page's
//     frontmatter could silently be the STRING `"title"`; `null` (`~`)
//     reads as `{}`.
//   - C0 control characters (except TAB/LF/CR) and DEL are refused
//     anywhere in a YAML block, as js-yaml refused them in every value
//     position. Two edges move: such a character inside a `#` comment now
//     throws too (js-yaml skipped comments), and a DEL inside quotes throws
//     (js-yaml passed it through). C1 characters, U+FFFE and lone
//     surrogates, which js-yaml refused only UNQUOTED, are now accepted.
//   - No module-level cache. gray-matter memoized every input string it
//     ever saw in an unbounded object keyed by the whole file content.

export interface Frontmatter {
  /** Parsed frontmatter — always a plain object. */
  data: Record<string, unknown>
  /** The document body with the frontmatter block removed. */
  content: string
}

const DELIMITER = '---'
const CLOSE = `\n${DELIMITER}`

/**
 * Split `source` into its frontmatter block and body, and parse the block.
 * Throws on malformed YAML/JSON, an unsupported language, or a block that
 * is not an object.
 */
export function parseFrontmatter(source: string): Frontmatter {
  const str = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  if (!str.startsWith(DELIMITER) || str.charAt(DELIMITER.length) === '-') {
    return { data: {}, content: str }
  }

  let rest = str.slice(DELIMITER.length)
  const newline = rest.search(/\r?\n/)
  const languageRaw = newline === -1 ? rest : rest.slice(0, newline)
  const language = languageRaw.trim()
  if (language !== '') rest = rest.slice(languageRaw.length)

  let closeIndex = rest.indexOf(CLOSE)
  if (closeIndex === -1) closeIndex = rest.length
  const block = rest.slice(0, closeIndex)

  let content = ''
  if (closeIndex !== rest.length) {
    content = rest.slice(closeIndex + CLOSE.length)
    if (content[0] === '\r') content = content.slice(1)
    if (content[0] === '\n') content = content.slice(1)
  }

  if (block.replace(/^\s*#[^\n]+/gm, '').trim() === '') {
    return { data: {}, content }
  }
  return { data: parseBlock(block, language.toLowerCase()), content }
}

// C0 control characters other than TAB/LF/CR, and DEL. YAML's printable set
// excludes them; js-yaml (what gray-matter parsed with) refused a document
// containing one, while `yaml` accepts them inside quoted scalars and hands
// the raw byte through to the page — a NUL or ESC in a `<title>`. Keep the
// refusal, with a location, rather than inherit the leniency.
// oxlint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/

function rejectControlCharacters(block: string): void {
  const match = CONTROL_CHARACTER.exec(block)
  if (!match) return
  const before = block.slice(0, match.index)
  // `block` begins with the newline that ends the opening `---` line, so
  // this counts lines of the FILE (line 1 is the `---`).
  const line = before.split('\n').length
  const column = match.index - before.lastIndexOf('\n')
  const code = match[0].charCodeAt(0).toString(16).padStart(4, '0')
  throw new Error(
    `[@pyreon/zero-content] Frontmatter contains the control character U+${code.toUpperCase()} at line ${line}, column ${column} — remove it.`,
  )
}

function parseBlock(block: string, language: string): Record<string, unknown> {
  let value: unknown
  if (language === '' || language === 'yaml' || language === 'yml') {
    rejectControlCharacters(block)
    // The block of a CRLF file ends in a bare `\r` (the close delimiter is
    // matched on `\n---`), and `yaml` keeps that `\r` in the last plain
    // scalar — `title: X\r\n---` read as `"X\r"` (the CRLF corpus case).
    // js-yaml treated it as a line break. Normalise line endings first.
    value = parseYaml(block.replace(/\r\n?/g, '\n'), {
      schema: 'core',
      customTags: ['timestamp'],
      merge: true,
    })
  } else if (language === 'json') {
    value = JSON.parse(block)
  } else if (language === 'js' || language === 'javascript') {
    throw new Error(
      '[@pyreon/zero-content] JavaScript frontmatter (`---js`) is not supported — it would execute code from a content file. Use YAML or `---json`.',
    )
  } else {
    throw new Error(
      `[@pyreon/zero-content] Unsupported frontmatter language "${language}". Use YAML (the default) or \`---json\`.`,
    )
  }
  if (value === null || value === undefined) return {}
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(
      `[@pyreon/zero-content] Frontmatter must be a key/value mapping, got ${
        Array.isArray(value) ? 'a list' : `a ${typeof value}`
      }.`,
    )
  }
  return value as Record<string, unknown>
}
