import { cx } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'

// ─── <APICard> — API signature card (PR-K audit H2) ───────────────────────
//
// Renders a heading + signature + short description block for a
// single API surface entry. Used as the inline structural block
// authors drop alongside a <PropTable> to lock the public surface.
//
// Example:
//
//     <APICard
//       name="getCollection"
//       signature="getCollection<K>(name: K, options?: GetCollectionOptions): Promise<Entry[]>"
//       summary="Read all entries from a content collection."
//     >
//       <PropTable rows={[...]} />
//     </APICard>

export interface APICardProps {
  /** API name (rendered as the card's heading). */
  name: string
  /** Optional signature line shown below the heading. */
  signature?: string
  /** One-line summary shown above any child slots. */
  summary?: string
  /** Stability hint: 'stable' | 'experimental' | 'deprecated'.
   *  Renders as a badge next to the name. */
  stability?: 'stable' | 'experimental' | 'deprecated'
  /** Optional `since` version string. */
  since?: string
  /** Optional anchor slug — used to deep-link to the card. Derives
   *  from `name` by default (lowercase + non-alnum → hyphen). */
  id?: string
  /** Child slot: typically a <PropTable> or extended explanation. */
  children?: VNodeChild
  /** Optional class name applied to the outer wrapper. */
  class?: string
}

/**
 * Derive a stable id from an API name. Pure — exported for testing.
 *
 * @internal exported for testing
 */
export function deriveApiId(name: string): string {
  // O(n) — no nested-quantifier regex. CodeQL flagged the previous
  // `/^-+|-+$/g` regex as polynomial ReDoS on `-`-heavy input.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  let start = 0
  let end = slug.length
  while (start < end && slug.charCodeAt(start) === 45) start++
  while (end > start && slug.charCodeAt(end - 1) === 45) end--
  return slug.slice(start, end)
}

export function APICard(props: APICardProps): VNodeChild {
  const id = props.id ?? deriveApiId(props.name)
  return (
    <section
      id={id}
      class={cx(['pyreon-apicard', props.class])}
    >
      <header class="pyreon-apicard__header">
        <h3 class="pyreon-apicard__name">
          <a href={`#${id}`} class="pyreon-apicard__anchor" aria-label={`Link to ${props.name}`}>
            #
          </a>
          {' '}
          <code>{props.name}</code>
        </h3>
        {props.stability && (
          <span
            class={`pyreon-apicard__stability pyreon-apicard__stability--${props.stability}`}
          >
            {props.stability}
          </span>
        )}
        {props.since && (
          <span class="pyreon-apicard__since">since v{props.since}</span>
        )}
      </header>
      {props.signature && (
        <pre class="pyreon-apicard__signature">
          <code>{props.signature}</code>
        </pre>
      )}
      {props.summary && (
        <p class="pyreon-apicard__summary">{props.summary}</p>
      )}
      {props.children !== undefined && (
        <div class="pyreon-apicard__body">{props.children}</div>
      )}
    </section>
  )
}
