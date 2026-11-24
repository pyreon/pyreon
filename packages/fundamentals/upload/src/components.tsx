/* oxlint-disable jsx-a11y/prefer-tag-over-role -- the drop zone is a div with role=button, not a <button>: it holds your block content, which a button cannot, and it carries the full button contract (tabindex, Enter and Space, aria-*) */
import type { VNodeChild } from '@pyreon/core'
import { useIntake, type Intake, type IntakeOptions, type RejectedFile } from './intake'

export type { RejectedFile } from './intake'

/** Hidden from sight, still read by screen readers. Used by the default live region; pass your own `liveClass` to restyle it. */
const VISUALLY_HIDDEN = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'

/** What the render slots receive. */
export interface FileIntakeState {
  /** Files are being dragged over the zone (also over its children). */
  isOver(): boolean
  /** While dragging: `false` when the dragged files cannot be accepted, `true` when they can, `null` otherwise. */
  isValid(): boolean | null
  /** The files refused by the last drop, pick or paste, each with every reason (`code`, `message`, `params`). */
  rejections(): readonly RejectedFile[]
  clearRejections(): void
  /** What the live region announces. */
  announcement(): string
  /** Open the system file dialog. */
  open(): void
  /** Spread on an element of your own to place the live region yourself (set `live={false}` to drop the default one). */
  liveRegionProps: Record<string, unknown>
}

export interface FileIntakeProps extends IntakeOptions {
  /** Accessible name. Default "Upload files". When the zone shows text, make the label contain it (WCAG 2.5.3), or name the zone with `labelledby`. */
  label?: string
  /** The id of an element that names the zone (`aria-labelledby`); it replaces `label`. */
  labelledby?: string
  /** An upload is running: exposed as `aria-busy`. */
  busy?: boolean
  /** Class of the interactive element, for styling. State is also on `data-drag-over`, `data-drop-valid`, `data-disabled` and `data-has-rejections`. */
  class?: string
  /** Class of the live region. Without it the region is visually hidden but still announced. */
  liveClass?: string
  /** Render the default live region. Default true; with `false` place your own with `state.liveRegionProps`. */
  live?: boolean
  /** The content, or a function of the state. */
  children?: VNodeChild | ((state: FileIntakeState) => VNodeChild)
  /** Where to show the reasons for refused files, as a function of the list (for example a list under the zone). */
  rejected?: (rejections: readonly RejectedFile[]) => VNodeChild
}

function stateOf(intake: Intake): FileIntakeState {
  return {
    isOver: () => intake.drop.isOver(),
    isValid: () => intake.drop.isValid(),
    rejections: () => intake.rejections(),
    clearRejections: () => intake.clearRejections(),
    announcement: () => intake.announcement(),
    open: () => intake.picker.open(),
    liveRegionProps: {
      role: 'status',
      'aria-live': 'polite',
      'aria-atomic': 'true',
      'data-pyreon-live': '',
    },
  }
}

/** The hidden input. It is only the carrier of the system dialog; the visible control is the zone or the button. */
function Input(props: { intake: Intake; accept: () => readonly string[] | undefined; multiple: () => boolean; directories: () => boolean | undefined }): VNodeChild {
  const p = props.intake.picker.inputProps as { onChange: (e: Event) => void; onCancel: () => void; ref: (el: HTMLInputElement | null) => void }

  return (
    <input
      type="file"
      hidden
      tabIndex={-1}
      aria-hidden="true"
      multiple={(() => props.multiple()) as never}
      accept={(() => props.accept()?.join(',')) as never}
      {...(props.directories() === true ? ({ webkitdirectory: true } as Record<string, unknown>) : {})}
      onChange={p.onChange}
      {...({ onCancel: p.onCancel } as Record<string, unknown>)}
      ref={p.ref}
    />
  )
}

function LiveRegion(props: { intake: Intake; show: () => boolean; class: () => string | undefined }): VNodeChild {
  return (
    <>
      {() =>
        props.show() ? (
          <output aria-live="polite" aria-atomic="true" data-pyreon-live="" class={props.class()} style={props.class() === undefined ? VISUALLY_HIDDEN : undefined}>
            {() => props.intake.announcement()}
          </output>
        ) : null
      }
    </>
  )
}

function content(props: FileIntakeProps, state: FileIntakeState): VNodeChild {
  return typeof props.children === 'function' ? (props.children as (s: FileIntakeState) => VNodeChild)(state) : props.children
}

/**
 * A drop zone with no styling: a `role="button"` control that opens the file dialog on click, Enter and Space, takes dropped
 * files (and pasted ones with `paste`), judges them while dragging, and keeps the reasons for the files it refuses. The drag
 * state does not flicker over children (enter and leave are counted). `accept` ignores case. The zone is labelled
 * (`aria-label`), reports `aria-busy` and `aria-disabled`, leaves the tab order when disabled, and after every drop, pick or
 * refusal returns focus to itself. A visually hidden `<output>` (an implicit `role="status"`, polite and atomic) announces what was added and what was refused and
 * why; place it yourself with `live={false}` and `state.liveRegionProps`. Style it with `class` and the `data-` attributes.
 *
 * The server renders the static markup (the hidden input and an empty live region); hydration adds the behaviour.
 *
 * @example typeof FileDrop // => 'function'
 */
export function FileDrop(props: FileIntakeProps): VNodeChild {
  // `let` on purpose: the compiler inlines a `const` derived from props at every JSX use site, and `useIntake` allocates state,
  // so a `const` would make a separate intake for each use.
  // oxlint-disable-next-line prefer-const
  let intake = useIntake(props)
  const state = stateOf(intake)
  let zone: HTMLElement | null = null
  const drop = intake.drop.dropProps as Record<string, (e: DragEvent) => void>

  intake.afterIntake.current = () => zone?.focus()

  return (
    <div data-pyreon-upload="">
      <div
        ref={(el: HTMLElement | null) => {
          zone = el
        }}
        role="button"
        tabIndex={() => (props.disabled === true ? -1 : 0)}
        aria-label={() => (props.labelledby === undefined ? props.label || 'Upload files' : undefined)}
        aria-labelledby={() => props.labelledby}
        aria-disabled={() => (props.disabled === true ? 'true' : undefined)}
        aria-busy={() => (props.busy === true ? 'true' : undefined)}
        class={() => props.class}
        data-drag-over={() => (intake.drop.isOver() ? 'true' : undefined)}
        data-drop-valid={() => (intake.drop.isValid() === null ? undefined : String(intake.drop.isValid()))}
        data-disabled={() => (props.disabled === true ? '' : undefined)}
        data-has-rejections={() => (intake.rejections().length > 0 ? '' : undefined)}
        onDragEnter={drop.onDragEnter}
        onDragOver={drop.onDragOver}
        onDragLeave={drop.onDragLeave}
        onDrop={drop.onDrop}
        onPaste={props.paste === true ? (drop.onPaste as unknown as (e: ClipboardEvent) => void) : undefined}
        onClick={() => {
          if (props.disabled !== true) intake.picker.open()
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (props.disabled === true || e.repeat || (e.key !== 'Enter' && e.key !== ' ')) return
          e.preventDefault()
          intake.picker.open()
        }}
      >
        {content(props, state)}
      </div>
      <Input intake={intake} accept={() => props.accept} multiple={() => props.multiple !== false} directories={() => props.directories} />
      <LiveRegion intake={intake} show={() => props.live !== false} class={() => props.liveClass} />
      {(() => (props.rejected !== undefined && intake.rejections().length > 0 ? props.rejected(intake.rejections()) : null)) as never}
    </div>
  )
}

/**
 * A file picker button with no styling: a native `<button type="button">` that opens the file dialog (so Enter and Space work
 * as on any button), with the same rules, refusal reasons, live region and focus handling as `<FileDrop>`. The same file can be
 * picked twice. `children` is the label, or a function of the state.
 *
 * @example typeof FilePicker // => 'function'
 */
export function FilePicker(props: FileIntakeProps): VNodeChild {
  // `let` on purpose: see FileDrop.
  // oxlint-disable-next-line prefer-const
  let intake = useIntake(props)
  const state = stateOf(intake)
  let button: HTMLElement | null = null

  intake.afterIntake.current = () => button?.focus()

  return (
    <div data-pyreon-upload="">
      <button
        type="button"
        ref={(el: HTMLElement | null) => {
          button = el
        }}
        class={() => props.class}
        disabled={() => props.disabled === true}
        aria-label={() => props.label}
        aria-busy={() => (props.busy === true ? 'true' : undefined)}
        data-has-rejections={() => (intake.rejections().length > 0 ? '' : undefined)}
        onClick={() => intake.picker.open()}
      >
        {content(props, state)}
      </button>
      <Input intake={intake} accept={() => props.accept} multiple={() => props.multiple !== false} directories={() => props.directories} />
      <LiveRegion intake={intake} show={() => props.live !== false} class={() => props.liveClass} />
      {(() => (props.rejected !== undefined && intake.rejections().length > 0 ? props.rejected(intake.rejections()) : null)) as never}
    </div>
  )
}
