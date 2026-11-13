import { useRoute } from '@pyreon/router'
import { C } from '../kit/classes'
import { SiteNavIsland } from '../kit/islands'

/**
 * The fixed `<header>` of the marketing shell. Everything in it is the nav
 * island (`SiteNav.tsx`): plain server HTML that hydrates at idle, carrying the
 * page's path as its only prop.
 */
export function SiteHeader() {
  const route = useRoute()
  return (
    <header class={C.header}>
      <SiteNavIsland path={route().path} />
    </header>
  )
}
