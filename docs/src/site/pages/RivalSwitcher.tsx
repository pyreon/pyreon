import { For } from '@pyreon/core'
import { el, focusRing, tone, type LinkAttrs } from '../kit/bases'
import { Wrap } from '../kit/layout'
import { useLinkClick } from '../kit/link'
import { Eyebrow } from '../kit/type'
import { font, radius } from '../theme'

/**
 * The strip at the foot of a page family (compare, why, migrate): every page
 * of the family, the current one marked with `aria-current="page"`.
 */
const Strip = el
  .config({ name: 'FamilySwitcher' })
  .attrs({ tag: 'nav', block: true })
  .theme((_t, m) => ({ borderTop: '1px solid', borderColor: tone(m, 'line'), paddingTop: 26, paddingBottom: 26 }))

const List = el
  .config({ name: 'FamilySwitcherList' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', contentAlignY: 'center', gap: 8 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const Item = el
  .config({ name: 'FamilySwitcherLink' })
  .attrs<LinkAttrs>({ tag: 'a' })
  .theme((_t, m) => ({
    display: 'inline-block',
    fontFamily: font.sans,
    fontSize: 13,
    color: tone(m, 'mist'),
    textDecoration: 'none',
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 14,
    paddingRight: 14,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.pill,
    hover: { color: tone(m, 'text'), borderColor: tone(m, 'line2') },
    focus: focusRing(m),
    extendCss: `&[aria-current='page'] { color: ${tone(m, 'text')}; border-color: ${tone(m, 'currentBorder')}; background: ${tone(m, 'currentFill')}; }`,
  }))

export function RivalSwitcher(props: { label: string; current: string; items: readonly { id: string; href: string; label: string }[] }) {
  const click = useLinkClick()
  return (
    <Strip aria-label={props.label}>
      <Wrap>
        <List>
          <li>
            <Eyebrow>{props.label}</Eyebrow>
          </li>
          <For each={props.items} by={(i) => i.id}>
            {(i) => (
              <li>
                <Item href={i.href} aria-current={i.id === props.current ? 'page' : undefined} onClick={click(i.href)}>
                  {i.label}
                </Item>
              </li>
            )}
          </For>
        </List>
      </Wrap>
    </Strip>
  )
}
