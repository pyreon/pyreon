import { h } from '@pyreon/core'
import attrs from '@pyreon/attrs'
import { Element } from '@pyreon/elements'
import { signal } from '@pyreon/reactivity'

// Each .attrs() call returns a BRAND NEW component — Button's own
// defaults are untouched by PrimaryButton/LargePrimaryButton layering
// on top of it. Mirrors the "Why attrs?" example on this page.
// `@pyreon/attrs` types Element's LAYOUT props (tag/alignX/alignY/...);
// arbitrary CSS-in-JS unistyle keys (backgroundColor, padding, ...) are a
// rocketstyle `.theme()` concern (see the Rocketstyle example on this
// page) — a bare `.attrs()` chain styles via the universal `style` prop.
const Button = attrs({ name: 'Button', component: Element })
  .attrs({ tag: 'button', alignX: 'center', alignY: 'center' })
  .attrs<{ primary?: boolean }>(({ primary }) => ({
    style: {
      padding: '10px',
      borderRadius: '6px',
      border: 'none',
      cursor: 'pointer',
      background: primary ? '#2196f3' : '#e5e7eb',
      color: primary ? '#ffffff' : '#1f2937',
    },
  }))

const PrimaryButton = Button.attrs({ primary: true })
// `style` merges shallowly per .attrs() call, like any prop — so a
// later layer that wants to ADJUST one CSS property while keeping the
// rest restates the whole object, same as spreading `{...base, ...}`.
const LargePrimaryButton = PrimaryButton.attrs({
  style: { padding: '16px', fontSize: '16px', borderRadius: '6px', border: 'none', cursor: 'pointer', background: '#2196f3', color: '#ffffff' },
})

/**
 * The live counterpart to the "Why attrs?" snippet above — a REAL
 * `.attrs()` chain over `@pyreon/elements`' `Element`, not pseudocode.
 * `count` proves the plain `Button` and its derived variants are three
 * independently-clickable components, not three renders of one.
 */
export default function ButtonVariantChain() {
  const count = signal(0)
  const bump = () => count.update((n) => n + 1)

  return h('div', { class: 'row', style: { gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
    h(Button, { onClick: bump, label: 'Button' }),
    h(PrimaryButton, { onClick: bump, label: 'PrimaryButton' }),
    h(LargePrimaryButton, { onClick: bump, label: 'LargePrimaryButton' }),
    h('span', { class: 'muted' }, () => 'clicks: ' + count()),
  )
}
