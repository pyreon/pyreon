import type { VNodeChild } from '@pyreon/core'

// ─── <Details> — collapsible disclosure section (PR-M audit M8) ───────────
//
// Thin wrapper around the native `<details>` / `<summary>` HTML
// elements. The `summary` prop renders the always-visible label;
// children render inside the collapsible body.
//
// Authored via the `:::details Label` block directive in markdown:
//
//     :::details Why?
//     The full explanation goes here.
//     :::
//
// Or directly in MDX / .tsx:
//
//     <Details summary="Why?">
//       The full explanation goes here.
//     </Details>

export interface DetailsProps {
  /** Always-visible label rendered inside `<summary>`. */
  summary?: string
  /** Whether the disclosure is open on initial render. */
  open?: boolean
  /** Optional class name on the outer wrapper. */
  class?: string
  /** Body content. */
  children?: VNodeChild
}

export function Details(props: DetailsProps): VNodeChild {
  return (
    <details
      class={() => `pyreon-details${props.class ? ' ' + props.class : ''}`}
      open={props.open ? true : undefined}
    >
      {props.summary !== undefined && (
        <summary class="pyreon-details__summary">{props.summary}</summary>
      )}
      <div class="pyreon-details__body">{props.children}</div>
    </details>
  )
}
