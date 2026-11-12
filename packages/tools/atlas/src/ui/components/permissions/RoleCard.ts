import { el } from '../../kit'

/** One role's render and verdict (`.at-role`); `violation` is the red card. */
export const RoleCard = el
  .attrs({ tag: 'section', contentDirection: 'rows', contentAlignX: 'block', gap: 8 })
  .theme((t) => ({
    minWidth: '0',
    padding: '10px',
    border: t.hairline,
    borderRadius: t.radius.panel,
    fontSize: t.size.small,
  }))
  .states((t) => ({
    violation: {
      extendCss: `border-color:color-mix(in srgb, ${t.danger} 50%, ${t.border});background:color-mix(in srgb, ${t.danger} 6%, transparent);`,
    },
    ok: {},
    unguarded: {},
    pending: {},
  }))
