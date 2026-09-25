/**
 * Serialize a string as a JavaScript string literal for GENERATED module
 * source (virtual route / middleware / action-manifest modules).
 *
 * `JSON.stringify` alone is not a code sanitizer: it leaves U+2028 / U+2029
 * raw (legal inside a JSON string, line terminators in older JS engines and
 * tooling), and it leaves `<` / `>` raw, which matters the moment generated
 * code is inlined anywhere HTML parses it. `/` is deliberately NOT escaped:
 * these literals are import specifiers, and a readable `/abs/path` keeps
 * generated output byte-identical for every realistic path. Route file paths and
 * action ids come from the filesystem, so a path containing any of these
 * must still produce a literal that means exactly that path. Every escaped
 * form parses back to the original character, so the value is unchanged.
 * @internal
 */
export function jsStringLiteral(value: string): string {
  return JSON.stringify(value).replace(
    /[<>\u2028\u2029]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}
