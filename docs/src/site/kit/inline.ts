/**
 * The tiny inline grammar content strings may carry (see content/types.ts):
 *
 *   `code`         → inline code
 *   {dot:ok}       → status dot (ok | warn | err); also {dot:var(--ok)}
 *                    (the reference CSS's spelling) and {dot:#RRGGBB}
 *   <small>…</small> → a secondary line (fact values)
 *
 * Parsed into tokens here (pure, unit-tested) and rendered by `renderInline`
 * in `type.tsx`. Content is never injected as HTML.
 */
export type InlineToken =
  | { kind: 'text'; value: string }
  | { kind: 'code'; value: string }
  | { kind: 'dot'; tone: 'ok' | 'warn' | 'err' }
  | { kind: 'dotColor'; color: string }
  | { kind: 'small'; value: string }

const TOKEN_RE = /(`[^`]+`|\{dot:[^}]+\}|<small>[\s\S]*?<\/small>)/g
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function parseInline(source: string): InlineToken[] {
  const out: InlineToken[] = []
  for (const part of source.split(TOKEN_RE)) {
    if (part === '') continue
    if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
      out.push({ kind: 'code', value: part.slice(1, -1) })
    } else if (part.startsWith('{dot:') && part.endsWith('}')) {
      const raw = part.slice(5, -1).trim()
      const v = /^var\(--(ok|warn|err)\)$/.exec(raw)?.[1] ?? raw
      if (v === 'ok' || v === 'warn' || v === 'err') out.push({ kind: 'dot', tone: v })
      else if (HEX_RE.test(v)) out.push({ kind: 'dotColor', color: v })
      // An unknown dot is dropped rather than shown as raw markup.
    } else if (part.startsWith('<small>') && part.endsWith('</small>')) {
      out.push({ kind: 'small', value: part.slice(7, -8) })
    } else {
      const prev = out[out.length - 1]
      if (prev?.kind === 'text') prev.value += part
      else out.push({ kind: 'text', value: part })
    }
  }
  return out
}

/** Plain text of an inline string (for aria-labels, titles, tests). */
export function inlineText(source: string): string {
  return parseInline(source)
    .map((t) => (t.kind === 'text' || t.kind === 'code' ? t.value : t.kind === 'small' ? ` ${t.value}` : ''))
    .join('')
    .trim()
}
