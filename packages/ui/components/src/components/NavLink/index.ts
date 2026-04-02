import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const NavLink = rocketstyle({ useBooleans: true })({
  name: 'NavLink',
  component: Element,
})
  .attrs({ tag: 'a' } as any)
  .theme({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 14,
    borderRadius: 6,
    color: '#374151',
    textDecoration: 'none',
    transition: 'background-color 150ms, color 150ms',
    ':hover': {
      backgroundColor: '#f3f4f6',
    },
  })
  .states({
    active: {
      backgroundColor: '#eff6ff',
      color: '#1d4ed8',
      fontWeight: 500,
    },
  })

export default NavLink
