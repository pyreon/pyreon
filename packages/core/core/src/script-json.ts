// Inline-`<script>` JSON escaping — the single recipe every serializer that
// drops JSON into a `<script>` body shares (`@pyreon/head` for JSON-LD /
// speculation rules / import maps, `@pyreon/zero`'s `jsonLd()`). Pure string
// logic, zero deps — identical in the browser and Node.

/**
 * Neutralise JSON TEXT for the body of an inline `<script>` element.
 *
 * `JSON.stringify` does not escape `<`, so a value containing `</script`
 * closes the element, and `<!--` followed by `<script` puts the HTML tokenizer
 * in the script-data-double-escaped state with no slash involved. Rewriting
 * every `<` as `<` makes all three unformable, and U+2028 / U+2029 (legal
 * raw in JSON, line terminators in a classic script) are escaped too. Every
 * escape is a valid JSON escape that `JSON.parse` reads back to the original
 * character — unlike `<\/` / `<\!--`, of which `\!` is not a JSON escape and
 * makes the whole block unparseable. In valid JSON a `<` only appears inside a
 * string, so the result is still valid JSON with an identical value.
 *
 * Pass JSON text, not JavaScript source: `<` outside a string literal in
 * script CODE breaks every `<` operator.
 *
 * @example
 * const body = escapeJsonForScript(JSON.stringify(data))
 * const tag = `<script type="application/ld+json">${body}</script>`
 */
export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003C').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}
