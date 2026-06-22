/**
 * Shared MDX-safety helpers for the docs generators (gen-reference,
 * gen-troubleshooting). The `@pyreon/zero-content` pipeline is MDX-ish:
 * bare `<`, `{`, and `:name` in FLOW text are parsed as JSX / expressions /
 * directives and either break the build or silently drop content. These
 * helpers escape that in flow text while leaving inline `code` spans raw
 * (angle brackets etc. render fine inside code), and quote frontmatter.
 */

/** A fenced code block (raw — fenced code is not MDX-parsed). */
export const fence = (lang: string, body: string): string =>
  '```' + lang + '\n' + String(body).trimEnd() + '\n```'

/**
 * Escape `<` `>` `{` `}` and bare `:name` in markdown FLOW text, leaving
 * inline `` `code` `` spans untouched. `: ` and `://` are not escaped (no
 * letter follows), so prose colons and URLs survive.
 */
export const escFlow = (s: string): string =>
  String(s ?? '')
    .split(/(`[^`]*`)/g)
    .map((seg, i) =>
      i % 2 === 1
        ? seg
        : seg
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\{/g, '&#123;')
            .replace(/\}/g, '&#125;')
            .replace(/:(?=[A-Za-z])/g, '&#58;'),
    )
    .join('')

/** YAML-safe double-quoted scalar (values may contain `:`, `@`, `"`). */
export const yaml = (s: string): string =>
  '"' + String(s ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"'
