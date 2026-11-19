/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the ARIA combobox and listbox pattern: a native <select> or <datalist> cannot hold grouped rows with highlighted text, subtitles and shortcuts */
import { For, onMount, Portal, provide, Show } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import { effect, isServer } from '@pyreon/reactivity'
import { lockScroll, showModal, trapTab } from './dialog'
import { createPalette } from './palette'
import type { Palette, PaletteOptions } from './palette-types'
import { CommandEmpty, CommandGroup, CommandLoading, groupKey, PaletteContext, usePalette } from './parts'
import { Virtual } from './virtual-list'

export { CommandEmpty, CommandGroup, CommandItem, CommandLoading, CommandShortcut, Highlight, usePalette } from './parts'
export type { CommandGroupProps, CommandItemProps, HighlightProps } from './parts'

/** Hidden from sight, still read by screen readers. */
const VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'

export interface CommandListProps {
  class?: string
  /** Render only the rows in view when there are more rows than this. Default 300. Rows must then have one height (`rowHeight`). */
  virtualizeAfter?: number
  /** The height of a row in px, for the windowed list. Default 40. */
  rowHeight?: number
  children?: VNodeChild
}

/** The listbox. Its groups and rows come from the palette; long lists are windowed. */
export function CommandList(props: CommandListProps): VNodeChild {
  const palette = usePalette()
  const threshold = props.virtualizeAfter ?? 300

  const rows = (): number => palette.results().length + palette.groups().filter((g) => g.title !== undefined).length
  let scroller: HTMLElement | null = null

  onMount(() => {
    const follow = effect(() => {
      const id = palette.activeId()
      if (id === null || scroller === null) return
      const at = palette.results().findIndex((r) => r.id === id)
      document.getElementById(palette.ids.option(at))?.scrollIntoView({ block: 'nearest' })
    })

    return () => follow.dispose()
  })

  return (
    <div
      class={props.class ?? 'pcmd-list'}
      style={`--pcmd-row: ${props.rowHeight ?? 40}px`}
      ref={(el: HTMLElement | null) => {
        scroller = el
      }}
      {...palette.listProps}
    >
      {props.children ?? (
        <Show when={() => rows() > threshold} fallback={<For each={() => palette.groups()} by={groupKey}>{(group) => <CommandGroup group={group} />}</For>}>
          <Virtual palette={palette} rowHeight={props.rowHeight ?? 40} />
        </Show>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- input and dialog

export function CommandInput(props: { class?: string }): VNodeChild {
  const palette = usePalette()

  return <input class={props.class ?? 'pcmd-input'} {...(palette.inputProps as Record<string, unknown>)} />
}

export interface CommandPaletteProps extends PaletteOptions {
  /** A palette you made with `createPalette`. Without one, the component makes its own from the other props. */
  palette?: Palette
  class?: string
  /** Class of the panel inside the dialog. */
  panelClass?: string
  virtualizeAfter?: number
  rowHeight?: number
  /** `ltr` or `rtl`. Default: the direction of the element that had focus when the palette opened. */
  dir?: 'ltr' | 'rtl'
  /** A layout of your own (built from `CommandInput`, `CommandList`, ...). Default: back button, input, close button, list, status. */
  children?: VNodeChild
}

function DefaultLayout(props: CommandPaletteProps): VNodeChild {
  const palette = usePalette()

  return (
    <>
      <div class="pcmd-header">
        <button type="button" class="pcmd-btn pcmd-back" hidden={() => palette.page().length === 0} aria-label={palette.messages.back} onClick={() => palette.back()}>
          <span aria-hidden="true">‹</span>
        </button>
        <CommandInput />
        <button type="button" class="pcmd-btn pcmd-close" aria-label={palette.messages.close} onClick={() => palette.close()}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <CommandList virtualizeAfter={props.virtualizeAfter ?? 300} rowHeight={props.rowHeight ?? 40} />
      <CommandEmpty />
      <CommandLoading />
    </>
  )
}

/** The modal dialog around the parts: shown as a native modal, the page behind inert, Tab kept inside, scroll locked. */
function PaletteDialog(props: CommandPaletteProps): VNodeChild {
  const palette = usePalette()
  let dialog: HTMLDialogElement | null = null

  onMount(() => {
    const el = dialog
    if (el === null) return undefined
    // The dialog is in <body>, away from where the palette was declared: it takes the direction of what had focus.
    el.dir = props.dir ?? getComputedStyle((document.activeElement as HTMLElement | null) ?? document.documentElement).direction
    const release = lockScroll()
    const hide = showModal(el)
    el.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    // The browser's own close (Escape, a form) tells the palette; the palette's close closes the dialog.
    const onClose = (): void => palette.close()
    const onCancel = (event: Event): void => {
      event.preventDefault()
      if (!palette.back()) palette.close()
    }
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- `close` and `cancel` are not in the JSX types (#4369); both are removed in the cleanup below
    el.addEventListener('close', onClose)
    // pyreon-lint-disable-next-line pyreon/no-raw-addeventlistener -- same
    el.addEventListener('cancel', onCancel)

    return () => {
      el.removeEventListener('close', onClose)
      el.removeEventListener('cancel', onCancel)
      hide()
      release()
    }
  })

  const onKeyDown = (event: KeyboardEvent): void => {
    if (dialog === null) return
    if (event.key === 'Escape') {
      // Handled here, not left to the browser: a cancelled native close is not reliable twice in a row without a click between.
      event.preventDefault()
      if (!palette.back()) palette.close()

      return
    }
    trapTab(dialog, event)
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer-only dismissal on the ::backdrop; the keyboard closes with Escape and the close button
    <dialog
      class={props.class ?? 'pcmd'}
      aria-label={() => palette.label()}
      ref={(el: HTMLDialogElement | null) => {
        dialog = el
      }}
      onKeyDown={onKeyDown}
      onClick={(event: MouseEvent) => {
        if (event.target === dialog) palette.close()
      }}
    >
      <div class={props.panelClass ?? 'pcmd-panel'}>
        {props.children ?? <DefaultLayout {...props} />}
        <output class="pcmd-live" style={VISUALLY_HIDDEN} aria-live="polite" aria-atomic="true">
          {() => palette.announcement()}
        </output>
      </div>
    </dialog>
  )
}

/**
 * The palette: a modal dialog with an input, grouped results, nested pages and an async state, opened by `mod+k` (or the
 * `hotkey` you give). Closed, it renders nothing, on the server and the client alike. Import `@pyreon/command/style.css` for
 * a default look, or style the `pcmd-*` classes and `data-*` attributes.
 */
export function CommandPalette(props: CommandPaletteProps): VNodeChild {
  // `let`, not `const`: the compiler inlines a `const` derived from props at every use, which would make a palette per use.
  // oxlint-disable-next-line prefer-const
  let palette = props.palette ?? createPalette(props)
  provide(PaletteContext, palette)

  // A function child: the dialog is only built while open, so nothing touches `document` on the server.
  return (() =>
    palette.isOpen() && !isServer ? (
      <Portal target={document.body}>
        <PaletteDialog {...props} />
      </Portal>
    ) : null) as unknown as VNodeChild
}

