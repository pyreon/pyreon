/**
 * Lives in a NESTED directory (`components/forms/`) on purpose: the derived
 * catalog files it under the `Components/Forms` hierarchy path, which is what
 * the sidebar-tree e2e asserts. Its props also carry a NUMBER and a COLOR —
 * the two control kinds that used to degrade to text boxes.
 */
import type { VNodeChild } from '@pyreon/core'

export interface SearchFieldProps {
  placeholder?: string
  /** How many suggestions to show — a NUMBER control. */
  maxItems?: number
  /** Accent for the focus ring — the name makes it a COLOR control. */
  color?: string
}

export function SearchField(props: SearchFieldProps): VNodeChild {
  return (
    <input
      type="search"
      placeholder={props.placeholder ?? 'Search…'}
      data-max-items={String(props.maxItems ?? 5)}
      data-accent={props.color ?? '#3b82f6'}
    />
  )
}
