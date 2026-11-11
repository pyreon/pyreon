/**
 * Apply a `titleTemplate` to a page title — the one funnel the SSR serializer
 * (`serialize.ts`) and the client sync (`dom.ts`) share, so the server and the
 * client cannot disagree on the result.
 *
 * The title is inserted through a FUNCTION replacer. As a replacement STRING,
 * `String.prototype.replace` expands `$&`, `` $` ``, `$'` and `$$` in it, so a
 * user-supplied title such as a product name `Sale $' today` pulled the
 * template's text after `%s` into the title instead of printing the dollar
 * sign.
 */
export function applyTitleTemplate(
  title: string,
  template: string | ((title: string) => string) | undefined,
): string {
  if (!template) return title
  if (typeof template === 'function') return template(title)
  return template.replace(/%s/g, () => title)
}
