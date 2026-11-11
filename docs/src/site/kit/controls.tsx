import type { VNodeChild } from '@pyreon/core'
import { For } from '@pyreon/core'
import { useClipboard } from '@pyreon/hooks'
import { font, motion, radius, text, weight } from '../theme'
import { el, focusRing, tone, txt, type LinkAttrs, type ButtonAttrs } from './bases'
import { isFileHref, useLinkClick } from './link'

const PillBase = el
  .config({ name: 'Pill' })
  .attrs<LinkAttrs & ButtonAttrs>({ tag: 'a', contentDirection: 'inline', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    height: 38,
    paddingLeft: 18,
    paddingRight: 18,
    borderRadius: radius.pill,
    fontFamily: font.sans,
    fontSize: text.ui.size,
    fontWeight: weight.medium,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    textDecoration: 'none',
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    color: tone(m, 'text'),
    backgroundColor: 'transparent',
    transition: `border-color ${motion.hover}, background-color ${motion.hover}, transform ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
  }))
  .variants((_t, m) => ({
    ghost: {},
    solid: {
      backgroundColor: tone(m, 'solidBg'),
      color: tone(m, 'solidText'),
      borderColor: tone(m, 'solidBg'),
      hover: { backgroundColor: tone(m, 'solidHover'), borderColor: tone(m, 'solidHover'), transform: 'translateY(-1px)' },
    },
  }))
  .sizes(() => ({
    md: {},
    lg: { height: 50, paddingLeft: 26, paddingRight: 26, fontSize: text.body.size },
  }))

/**
 * `.pill` — the only button shape on the site. variant: ghost | solid;
 * size: md (38px) | lg (50px). With `href` it is a link (internal paths go
 * through the router); without, a `<button>`.
 */
export function Pill(props: {
  href?: string | undefined
  variant?: 'ghost' | 'solid' | undefined
  size?: 'md' | 'lg' | undefined
  onClick?: (() => void) | undefined
  'aria-label'?: string | undefined
  children?: VNodeChild
}) {
  const click = useLinkClick()
  const href = props.href
  if (href === undefined) {
    return (
      <PillBase
        tag="button"
        type="button"
        variant={props.variant ?? 'ghost'}
        size={props.size ?? 'md'}
        aria-label={props['aria-label']}
        onClick={() => props.onClick?.()}
      >
        {props.children}
      </PillBase>
    )
  }
  return (
    <PillBase
      href={href}
      variant={props.variant ?? 'ghost'}
      size={props.size ?? 'md'}
      aria-label={props['aria-label']}
      data-allow-reload={isFileHref(href) ? '' : undefined}
      onClick={click(href, props.onClick)}
    >
      {props.children}
    </PillBase>
  )
}

const CmdBox = el
  .config({ name: 'InstallCommand' })
  .attrs({ contentDirection: 'inline', contentAlignY: 'center', gap: 14 })
  .theme((_t, m) => ({
    height: 50,
    maxWidth: '100%',
    minWidth: 0,
    paddingLeft: { xs: 14, sm: 22 },
    paddingRight: 8,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: tone(m, 'sheen'),
    fontFamily: font.mono,
    fontSize: { xs: 12, sm: text.ui.size },
    color: tone(m, 'text'),
  }))

const CmdText = txt
  .config({ name: 'InstallCommandText' })
  .attrs({ tag: 'code' })
  .theme(() => ({
    display: 'block',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'inherit',
    fontSize: 'inherit',
    color: 'inherit',
    backgroundColor: 'transparent',
    padding: 0,
    border: 'none',
  }))

const CmdPrompt = txt
  .config({ name: 'InstallCommandPrompt' })
  .attrs({ tag: 'span', 'aria-hidden': 'true' })
  .theme((_t, m) => ({ color: tone(m, 'accent'), marginRight: 8 }))

const CmdButton = el
  .config({ name: 'InstallCommandCopy' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 34,
    flexShrink: 0,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: 'none',
    backgroundColor: tone(m, 'line'),
    color: tone(m, 'mist'),
    fontFamily: font.mono,
    fontSize: 11.5,
    transition: `color ${motion.hover}`,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
  }))

/** `.cmd` — a shell command with a copy button (`useClipboard`). */
export function InstallCommand(props: { command: string }) {
  const { copy, copied } = useClipboard()
  return (
    <CmdBox>
      <CmdText title={props.command}>
        <CmdPrompt>$</CmdPrompt>
        {props.command}
      </CmdText>
      <CmdButton
        type="button"
        aria-label={() => (copied() ? `Copied: ${props.command}` : `Copy ${props.command}`)}
        onClick={() => void copy(props.command)}
      >
        <span aria-live="polite">{() => (copied() ? 'copied' : 'copy')}</span>
      </CmdButton>
    </CmdBox>
  )
}

/** `.p-api .chips span` — a mono tag. */
export const Chip = txt
  .config({ name: 'Chip' })
  .attrs({ tag: 'span' })
  .theme((_t, m) => ({
    display: 'inline-block',
    fontFamily: font.mono,
    fontSize: text.mono.size,
    lineHeight: 1.4,
    paddingTop: 7,
    paddingBottom: 7,
    paddingLeft: 12,
    paddingRight: 12,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    color: tone(m, 'mist'),
    backgroundColor: tone(m, 'sheen'),
    overflowWrap: 'anywhere',
  }))

const SegBox = el
  .config({ name: 'Segmented' })
  .attrs({ tag: 'fieldset', contentDirection: 'inline', gap: 2 })
  .theme((_t, m) => ({
    margin: 0,
    minWidth: 0,
    padding: 3,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.pill,
    flexWrap: 'wrap',
    maxWidth: '100%',
  }))

const SegButton = el
  .config({ name: 'SegmentedButton' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 30,
    paddingLeft: 12,
    paddingRight: 12,
    border: 'none',
    borderRadius: radius.pill,
    backgroundColor: 'transparent',
    color: tone(m, 'fog'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    transition: `color ${motion.hover}, background-color ${motion.hover}`,
    hover: { color: tone(m, 'text') },
    focus: focusRing(m),
    pressed: { backgroundColor: tone(m, 'line'), color: tone(m, 'text') },
  }))

/**
 * `.seg` — a segmented switch for the dark surfaces. Each option is a toggle
 * button with `aria-pressed`; the group is labelled. (Demos on the paper
 * surface may use `@pyreon/ui-components`' SegmentedControl instead.)
 */
export function Segmented<T extends string>(props: {
  options: readonly T[]
  value: () => T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <SegBox aria-label={props.label}>
      <For each={() => props.options} by={(o) => o}>
        {(o) => (
          <SegButton type="button" aria-pressed={() => (props.value() === o ? 'true' : 'false')} onClick={() => props.onChange(o)}>
            {o}
          </SegButton>
        )}
      </For>
    </SegBox>
  )
}
