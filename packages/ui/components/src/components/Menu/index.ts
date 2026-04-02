import { Element } from '@pyreon/elements'
import rocketstyle from '@pyreon/rocketstyle'

const Menu = rocketstyle({ useBooleans: true })({
  name: 'Menu',
  component: Element,
})
  .attrs({ tag: 'div' } as any)
  .theme({
    backgroundColor: '#ffffff',
    borderRadius: 8,
    boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
    padding: 4,
    minWidth: 160,
    zIndex: 50,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: '#e5e7eb',
  })

export const MenuItem = rocketstyle({ useBooleans: true })({
  name: 'MenuItem',
  component: Element,
})
  .attrs({ tag: 'button' } as any)
  .theme({
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 12,
    paddingRight: 12,
    fontSize: 14,
    borderRadius: 4,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
    backgroundColor: 'transparent',
    borderWidth: 0,
    ':hover': {
      backgroundColor: '#f3f4f6',
    },
  })

export default Menu
