import { Element } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'
import rocketstyle from '@pyreon/rocketstyle'
import { makeItResponsive, styles } from '@pyreon/unistyle'
import { Button, Title, Paragraph } from '@pyreon/ui-components'

// Standalone rocketstyle composition — assembled directly on top of
// `@pyreon/elements`' `Element` with no `el`/`txt`/`list` base from
// `@pyreon/ui-components`. Demonstrates the minimum a raw rocketstyle
// component needs to emit CSS:
//
//   1. `.theme()` / `.states()` / `.sizes()` — declare the dimension-
//      tuple → style-slice mapping. Rocketstyle resolves the active
//      slice and exposes it as `$rocketstyle` on the styled wrapper.
//   2. `.styles((css) => css`…`)` — read `$rocketstyle` and emit
//      actual CSS. WITHOUT this chain, rocketstyle's styled wrapper
//      runs with an empty CSS body and the `.theme()` values never
//      reach the DOM (the demo silently rendered as a transparent
//      block before this chain was added). `makeItResponsive` from
//      `@pyreon/unistyle` does the heavy lifting — kebab-cases keys,
//      adds unit suffixes, expands responsive arrays/objects.
//
// `el` from `@pyreon/ui-components` collapses (1) + (2) for the common
// case (responsive layout + pseudo-state CSS pre-baked). This demo
// stays explicit so the lower-level contract is visible.

const RsBadge = rocketstyle()({
  name: 'RsBadge',
  component: Element,
})
  .attrs({
    direction: 'inline',
    alignX: 'center',
    alignY: 'center',
    block: true,
  })
  .theme(() => ({
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 4,
    paddingBottom: 4,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 600,
    backgroundColor: '#3b82f6',
    color: '#ffffff',
  }))
  .states(() => ({
    success: { backgroundColor: '#10b981' },
    warning: { backgroundColor: '#f59e0b' },
    danger: { backgroundColor: '#ef4444' },
    info: { backgroundColor: '#06b6d4' },
  }))
  .sizes(() => ({
    small: { fontSize: 10, paddingLeft: 8, paddingRight: 8, paddingTop: 2, paddingBottom: 2 },
    medium: { fontSize: 12, paddingLeft: 12, paddingRight: 12, paddingTop: 4, paddingBottom: 4 },
    large: { fontSize: 14, paddingLeft: 16, paddingRight: 16, paddingTop: 6, paddingBottom: 6 },
  }))
  .styles(
    (css) => css`
      ${({ $rocketstyle }: { $rocketstyle: Record<string, unknown> }) =>
        css`
          ${makeItResponsive({ theme: $rocketstyle, styles, css })};
        `}
    `,
  )

const RsButton = rocketstyle()({
  name: 'RsButton',
  component: Element,
})
  .attrs({
    tag: 'button',
    direction: 'inline',
    alignX: 'center',
    alignY: 'center',
    block: false,
  })
  .theme(() => ({
    paddingLeft: 16,
    paddingRight: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderRadius: 6,
    backgroundColor: '#3b82f6',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    borderWidth: 0,
    transition: 'all 0.15s',
  }))
  .states(() => ({
    success: { backgroundColor: '#10b981' },
    danger: { backgroundColor: '#ef4444' },
  }))
  .sizes(() => ({
    small: { fontSize: 12, paddingLeft: 12, paddingRight: 12, paddingTop: 6, paddingBottom: 6 },
    medium: { fontSize: 14, paddingLeft: 16, paddingRight: 16, paddingTop: 8, paddingBottom: 8 },
    large: { fontSize: 16, paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12 },
  }))
  .styles(
    (css) => css`
      ${({ $rocketstyle }: { $rocketstyle: Record<string, unknown> }) =>
        css`
          ${makeItResponsive({ theme: $rocketstyle, styles, css })};
        `}
    `,
  )

export function RocketstyleDemo() {
  const state = signal<'success' | 'warning' | 'danger' | 'info' | undefined>(undefined)
  const size = signal<'small' | 'medium' | 'large'>('medium')

  return (
    <div>
      <Title size="h2" style="margin-bottom: 12px">Rocketstyle (raw API)</Title>
      <Paragraph style="margin-bottom: 24px">
        `@pyreon/rocketstyle` is the multi-dimensional styling engine powering all of `@pyreon/ui-components`. Here are standalone components built directly with `.theme()`, `.states()`, `.sizes()`, `.styles()` on top of `@pyreon/elements` — no `el`/`txt`/`list` wrappers.
      </Paragraph>

      <Title size="h3" style="margin-bottom: 12px">Rocketstyle Badge — all states</Title>
      <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;">
        <RsBadge>default</RsBadge>
        <RsBadge state="success">success</RsBadge>
        <RsBadge state="warning">warning</RsBadge>
        <RsBadge state="danger">danger</RsBadge>
        <RsBadge state="info">info</RsBadge>
      </div>

      <Title size="h3" style="margin-bottom: 12px">All sizes</Title>
      <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 24px;">
        <RsBadge size="small">small</RsBadge>
        <RsBadge size="medium">medium</RsBadge>
        <RsBadge size="large">large</RsBadge>
      </div>

      <Title size="h3" style="margin-bottom: 12px">Reactive dimension props</Title>
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        <Button
          state="secondary"
          variant={state() === undefined ? 'solid' : 'outline'}
          size="small"
          onClick={() => state.set(undefined)}
        >
          default
        </Button>
        <Button
          state="success"
          variant={state() === 'success' ? 'solid' : 'outline'}
          size="small"
          onClick={() => state.set('success')}
        >
          success
        </Button>
        <Button
          state="primary"
          variant={state() === 'info' ? 'solid' : 'outline'}
          size="small"
          onClick={() => state.set('info')}
        >
          info
        </Button>
        <Button
          state="danger"
          variant={state() === 'danger' ? 'solid' : 'outline'}
          size="small"
          onClick={() => state.set('danger')}
        >
          danger
        </Button>
      </div>
      <div style="display: flex; gap: 8px; margin-bottom: 16px;">
        <Button
          state="secondary"
          variant={size() === 'small' ? 'solid' : 'outline'}
          size="small"
          onClick={() => size.set('small')}
        >
          S
        </Button>
        <Button
          state="secondary"
          variant={size() === 'medium' ? 'solid' : 'outline'}
          size="small"
          onClick={() => size.set('medium')}
        >
          M
        </Button>
        <Button
          state="secondary"
          variant={size() === 'large' ? 'solid' : 'outline'}
          size="small"
          onClick={() => size.set('large')}
        >
          L
        </Button>
      </div>
      <RsBadge state={state()} size={size()}>
        Reactive: {state() ?? 'default'}/{size()}
      </RsBadge>

      <Title size="h3" style="margin-top: 32px; margin-bottom: 12px">Rocketstyle Button</Title>
      <div style="display: flex; gap: 8px; align-items: center;">
        <RsButton size="small">small</RsButton>
        <RsButton size="medium">medium</RsButton>
        <RsButton size="large">large</RsButton>
        <RsButton state="success">success</RsButton>
        <RsButton state="danger">danger</RsButton>
      </div>
    </div>
  )
}
