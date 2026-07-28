/**
 * The example's component LIBRARY — the thing Atlas catalogs.
 *
 * The workshop previously demonstrated only the workbench half: the demo
 * components were unexported `const`s holding rocketstyle chains, so
 * `atlas scan` on this example discovered exactly one component (the
 * `Workshop` shell itself) and the catalog it produced said nothing. The
 * example showed the UI and left the pipeline unexercised.
 *
 * These are ordinary exported function components with typed props — the shape
 * a real project has, and the shape discovery reads: it walks exported
 * PascalCase functions and turns their props type into controls, so a string
 * union becomes an enum control and an accessor becomes a reactive prop with no
 * annotation anywhere.
 *
 * They wrap the same rocketstyle bases the workbench renders, so what
 * `atlas scan` catalogs and what the canvas shows are the same components
 * rather than two parallel definitions that can drift.
 */
import type { VNodeChild } from '@pyreon/core'
import { DemoBadge, DemoButton, IconDot } from '../demo-catalog'

export interface ButtonProps {
  /** Visible text. Required — a button with no accessible name is a real a11y failure. */
  label: string
  variant?: 'solid' | 'soft' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  /** Renders a leading dot before the label. */
  icon?: boolean
  onClick?: () => void
}

/** The primary action trigger. */
export function Button(props: ButtonProps): VNodeChild {
  return (
    <DemoButton
      variant={(props.variant ?? 'solid') as never}
      size={(props.size ?? 'md') as never}
      onClick={props.onClick}
    >
      {props.icon ? <IconDot /> : null}
      {props.label}
    </DemoButton>
  )
}

export interface BadgeProps {
  label: string
  variant?: 'soft' | 'solid' | 'outline'
  dot?: boolean
}

/** Compact status and metadata label. */
export function Badge(props: BadgeProps): VNodeChild {
  return (
    <DemoBadge variant={(props.variant ?? 'soft') as never}>
      {props.dot ? <IconDot /> : null}
      {props.label}
    </DemoBadge>
  )
}
