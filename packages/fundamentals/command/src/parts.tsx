/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the rows are ARIA options inside the combobox's listbox */
import { createContext, Show, useContext } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { MatchRange } from './match'
import type { Palette, ResultGroup, ResultItem } from './palette-types'

export const PaletteContext = createContext<Palette | null>(null)

/** The palette of the nearest `<CommandPalette>`, for custom parts. */
export function usePalette(): Palette {
  const palette = useContext(PaletteContext)
  if (palette === null) throw new Error('[Pyreon] usePalette(): call it inside a <CommandPalette>, or pass the palette to the part you render')

  return palette
}

// ---------------------------------------------------------------- small parts

export interface HighlightProps {
  text: string
  ranges: readonly MatchRange[]
  /** Class of the `<mark>` around a matched run. Default `pcmd-mark`. */
  markClass?: string
}

/** A text with its matched runs in `<mark>`: the ranges of a result row. */
export function Highlight(props: HighlightProps): VNodeChild {
  const out: VNodeChild[] = []
  let at = 0
  for (const [start, end] of props.ranges) {
    if (start > at) out.push(props.text.slice(at, start))
    out.push(<mark class={props.markClass ?? 'pcmd-mark'}>{props.text.slice(start, end)}</mark>)
    at = end
  }
  if (at < props.text.length) out.push(props.text.slice(at))

  return <>{out}</>
}

/** The shortcut of a row, as keys. */
export function CommandShortcut(props: { shortcut?: string; class?: string; children?: VNodeChild }): VNodeChild {
  return <kbd class={props.class ?? 'pcmd-kbd'}>{props.children ?? props.shortcut}</kbd>
}

export function CommandEmpty(props: { class?: string; children?: VNodeChild }): VNodeChild {
  const palette = usePalette()

  const shown = (): boolean => palette.results().length === 0 && palette.status() !== 'loading' && palette.status() !== 'error' && (palette.query().trim() !== '' || palette.page().length > 0)

  return (
    <Show when={shown}>
      <div class={props.class ?? 'pcmd-empty'}>{props.children ?? palette.messages.noResults}</div>
    </Show>
  )
}

export function CommandLoading(props: { class?: string; children?: VNodeChild }): VNodeChild {
  const palette = usePalette()

  return (
    <Show when={() => palette.status() === 'loading'}>
      <div class={props.class ?? 'pcmd-loading'} aria-hidden="true">
        {props.children ?? palette.messages.loading}
      </div>
    </Show>
  )
}

// ---------------------------------------------------------------- rows

export interface CommandItemProps {
  item: ResultItem
  class?: string
  style?: string
  /** Replace the content of the row (the highlighted title, the subtitle, the shortcuts). */
  children?: VNodeChild
}

/** One row (`role="option"`), with the ARIA wiring and the pointer and click handling of the palette. */
export function CommandItem(props: CommandItemProps): VNodeChild {
  const palette = usePalette()
  const item = props.item
  const icon = item.command.icon as VNodeChild

  return (
    <div class={props.class ?? 'pcmd-item'} style={props.style} {...(palette.itemProps(item) as Record<string, unknown>)}>
      {props.children ?? (
        <>
          {icon === undefined ? null : <span class="pcmd-icon">{icon}</span>}
          <span class="pcmd-text">
            <span class="pcmd-title">
              <Highlight text={item.title} ranges={item.ranges} />
            </span>
            {item.subtitle === undefined ? null : (
              <span class="pcmd-subtitle">
                <Highlight text={item.subtitle} ranges={item.subtitleRanges} />
              </span>
            )}
            {item.enabled || item.disabledReason === undefined ? null : <span class="pcmd-reason">{item.disabledReason}</span>}
          </span>
          {item.shortcuts.map((s) => (
            <CommandShortcut shortcut={s} />
          ))}
          {item.hasPage ? (
            <span class="pcmd-chevron" aria-hidden="true">
              ›
            </span>
          ) : null}
        </>
      )}
    </div>
  )
}

export interface CommandGroupProps {
  group: ResultGroup
  class?: string
  headingClass?: string
  children?: VNodeChild
}

/** A group (`role="group"`) with its heading and its rows. */
export function CommandGroup(props: CommandGroupProps): VNodeChild {
  const palette = usePalette()
  const wiring = palette.groupProps(props.group)

  return (
    <div class={props.class ?? 'pcmd-group'} {...wiring.group}>
      {props.group.title === undefined ? null : (
        <div class={props.headingClass ?? 'pcmd-heading'} {...wiring.heading}>
          {props.group.title}
        </div>
      )}
      {props.children ?? props.group.items.map((item) => <CommandItem item={item} />)}
    </div>
  )
}

/** The key of a group or a row: everything that decides how it renders, so a changed one is drawn again. */
export const itemKey = (item: ResultItem): string => `${item.id}|${item.index}|${item.title}|${item.subtitle ?? ''}|${item.ranges.join(',')}|${item.subtitleRanges.join(',')}|${item.enabled}|${item.shortcuts.join('+')}`
export const groupKey = (group: ResultGroup): string => `${group.id ?? ''}|${group.title ?? ''}|${group.items.map(itemKey).join(';')}`
