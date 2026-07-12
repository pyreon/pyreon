import { visit } from 'unist-util-visit'
import type { Root } from 'mdast'
import type { ContainerDirective } from 'mdast-util-directive'
import { escapeHtmlAttr as escapeAttr } from '../../_shared/html-escape'
import { extractDirectiveLabel } from './math-mermaid-details'

// ─── pyreon-remark-callout ────────────────────────────────────────────────
//
// Transforms `:::tip` / `:::warning` / `:::note` / `:::danger` /
// `:::info` container directives into `<Callout type="...">` JSX.
//
// Input (remark-directive parses `:::` into a ContainerDirective node):
//
//   :::tip
//   This is the tip body.
//   :::
//
// Output: a `mdxJsxFlowElement` or — for v1 simplicity — an `html` node
// containing the opening + closing `<Callout>` tags around the body.
//
// We rewrite as `html` nodes flanking the body content; the emit-jsx
// layer renders `html` nodes through verbatim (PR 1 wired this).
// PR 3's MDX integration will switch to proper `mdxJsxFlowElement`
// for full type-checked component props.

type CalloutType = 'tip' | 'warning' | 'note' | 'danger' | 'info'

const VALID_TYPES = new Set<CalloutType>(['tip', 'warning', 'note', 'danger', 'info'])
const VALID_TYPES_LIST: CalloutType[] = ['tip', 'warning', 'note', 'danger', 'info']

/**
 * Whether a directive name maps to a callout type. Exported for the
 * codegroup plugin which needs to distinguish callout containers from
 * its own.
 *
 * @internal
 */
export function isCalloutType(name: string): name is CalloutType {
  return VALID_TYPES.has(name as CalloutType)
}

/**
 * Optional collector for diagnostics surfaced during the callout pass.
 * The Vite plugin passes one in and pipes every message through
 * `this.warn(...)` so authors see actionable feedback (unknown name
 * with a "did you mean…?" hint; an unclosed `:::` fence heuristic).
 * Pre-fix (PR-A audit C9 + H6) both shapes failed silently.
 *
 * @internal
 */
export interface CalloutWarnings {
  push(message: string): void
}

interface RemarkCalloutOptions {
  /** Source markdown text — used by the unclosed-fence heuristic. */
  source?: string
  /** Diagnostics collector. */
  warnings?: CalloutWarnings
}

import { levenshtein } from '../../_shared/levenshtein'

/**
 * Levenshtein edit distance — case-sensitive variant for callout-name
 * typos (`:::warn` → `:::warning`). Thin re-export over the shared
 * `_shared/levenshtein` primitive so the validator + this plugin
 * share the same DP implementation; the case-sensitivity choice
 * stays explicit at the call site.
 *
 * @internal exported for testing
 */
export function calloutEditDistance(a: string, b: string): number {
  return levenshtein(a, b)
}

/**
 * Find the closest known callout type for a typo (`warn` →
 * `warning`). Returns `null` when no candidate is within edit
 * distance 3 — `warn` → `warning` is exactly 3 (insertions of
 * `i`, `n`, `g`) which is the prototypical typo we want to catch;
 * anything further turns into noise (`foobarbaz` to every known
 * type is ≥ 7).
 *
 * @internal exported for testing
 */
export function suggestCalloutType(name: string): string | null {
  let best: { name: string; dist: number; ref: string } | null = null
  for (const t of VALID_TYPES_LIST) {
    const d = calloutEditDistance(name, t)
    if (best === null || d < best.dist) best = { name: t, dist: d, ref: t }
  }
  if (best === null) return null
  // Accept either:
  //   - small absolute distance for short inputs (≤ 2), OR
  //   - ratio-bound for longer inputs (distance < 50% of longer string).
  //
  // The ratio bound is the key: `warn` (4) → `warning` (7) has distance
  // 3 / 7 ≈ 0.43, suggested. `qux` (3) → `tip` (3) has distance 3 / 3
  // = 1.0, NOT suggested. `foobarbaz` (9) → anything ≥ 6, NOT suggested.
  const longer = Math.max(name.length, best.ref.length)
  if (best.dist <= 2) return best.name
  if (longer > 0 && best.dist / longer < 0.5) return best.name
  return null
}

/**
 * Heuristic: when a callout's body spans many headings AND extends
 * near the file end, it's likely an unclosed `:::` fence — remark-
 * directive silently consumed every subsequent line into the
 * directive's `children`. Pre-fix (PR-A audit C9) the foot-gun ate
 * the rest of the file with no signal; now we warn.
 *
 * Thresholds (tunable):
 *   - body spans ≥ 2 headings — a real callout almost never does
 *   - OR child count ≥ 30 — wildly more than a typical callout
 *   - AND the directive's end line is within 3 of the source end
 *
 * Either signal alone is too noisy; the AND-of-both is the
 * conservative trigger we ship.
 *
 * @internal exported for testing
 */
export function looksUnclosed(
  directive: ContainerDirective,
  sourceLineCount: number,
): boolean {
  const endLine = directive.position?.end?.line ?? 0
  const nearEnd = sourceLineCount - endLine <= 3
  if (!nearEnd) return false
  const children = directive.children ?? []
  let headingCount = 0
  for (const c of children) if ((c as { type: string }).type === 'heading') headingCount++
  return headingCount >= 2 || children.length >= 30
}

export function remarkCallout(options: RemarkCalloutOptions = {}) {
  const sourceLineCount = options.source ? options.source.split('\n').length : 0
  const warnings = options.warnings ?? null

  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      if (node.type !== 'containerDirective') return
      const directive = node as ContainerDirective
      if (parent == null || index == null) return

      // (H6) Unknown directive name — suggest the closest callout
      // type. We only emit a "did you mean…?" hint for plausibly-
      // close typos; the codegroup plugin handles `code-group` and
      // doesn't want this warning either, so it explicitly registers
      // its own name AFTER this plugin runs (the visitor short-
      // circuits on `isCalloutType` so codegroup is left intact for
      // its own pass).
      if (!isCalloutType(directive.name)) {
        // Skip ones we know belong to other plugins — `code-group`
        // is the codegroup directive name; anything else is
        // unknown.
        if (directive.name !== 'code-group' && warnings) {
          const hint = suggestCalloutType(directive.name)
          warnings.push(
            hint
              ? `[@pyreon/zero-content] Unknown callout directive \`:::${directive.name}\` — did you mean \`:::${hint}\`?`
              : `[@pyreon/zero-content] Unknown callout directive \`:::${directive.name}\` — valid types: tip, warning, note, danger, info.`,
          )
        }
        return
      }

      // (C9) Unclosed-fence heuristic — surface the silent consumption
      // before the rest of the file becomes part of the callout body.
      if (sourceLineCount > 0 && looksUnclosed(directive, sourceLineCount)) {
        if (warnings) {
          warnings.push(
            `[@pyreon/zero-content] Suspected unclosed \`:::${directive.name}\` directive — the body spans ${
              directive.children.length
            } block(s) up to line ${directive.position?.end?.line ?? '?'}. Add a closing \`:::\` line.`,
          )
        }
      }

      const type = directive.name
      // Title resolution, in priority order:
      //   1. `{title="…"}` attribute — explicit, unambiguous.
      //   2. `[label]` bracket form (`:::warning[Title]`) — the natural
      //      convention shared with Starlight / Docusaurus / Astro.
      //      remark-directive surfaces the label as a `directiveLabel`
      //      first-child paragraph; we lift it to the title AND strip it
      //      from the body, or it would render twice (once as the title,
      //      once as leading body text — the pre-fix behaviour that made
      //      every `:::type[Title]` in the docs silently drop its title).
      let title = typeof directive.attributes?.title === 'string'
        ? directive.attributes.title
        : undefined
      let body = directive.children
      // A `[label]` always gets stripped from the body when present (or it
      // renders as leading body text). Its VALUE becomes the title only when
      // no explicit `{title="…"}` attribute overrides it — the attribute wins.
      const label = extractDirectiveLabel(directive)
      if (label !== undefined) {
        body = body.slice(1) // drop the directiveLabel paragraph
        if (title === undefined) title = label
      }

      const openTag = title
        ? `<Callout type="${type}" title="${escapeAttr(title)}">`
        : `<Callout type="${type}">`

      const openNode = { type: 'html' as const, value: openTag }
      const closeNode = { type: 'html' as const, value: '</Callout>' }

      // Replace the directive with: [openTag, ...body, closeTag].
      // remark-directive's children are already-parsed mdast — they'll
      // walk through the emit pipeline normally.
      parent.children.splice(index, 1, openNode, ...body, closeNode)
      return index + 2 + body.length
    })

    // Raw-leak diagnostic. `:::warning bare text` (a known type followed by
    // bare text rather than `[label]` / `{attrs}` / EOL) is NOT valid
    // remark-directive syntax — the opener is rejected and the whole line
    // ships to the page as the literal string `:::warning bare text`. It
    // produced ZERO diagnostics pre-fix (73 instances leaked across the docs).
    // The rejected opener lands as a PARAGRAPH whose first text child starts
    // with `:::type`, so scanning parsed paragraphs (not the raw source)
    // catches it precisely while skipping fenced code blocks — a ```` ```md ````
    // sample that shows `:::warning …` is a `code` node, never a paragraph,
    // so it is never flagged.
    if (warnings) {
      visit(tree, 'paragraph', (para) => {
        const first = (para.children as Array<{ type: string; value?: string }>)[0]
        if (!first || typeof first.value !== 'string') return
        const m = /^:::(tip|warning|note|danger|info)\b/.exec(first.value)
        if (!m) return
        warnings.push(
          `[@pyreon/zero-content] \`:::${m[1]}\` did not parse as a callout — a title must be \`:::${m[1]}[Title]\` (bracketed) or \`:::${m[1]}{title="Title"}\`. Bare text after the name is not valid directive syntax and ships as literal \`:::${m[1]}…\` text.`,
        )
      })
    }
  }
}

