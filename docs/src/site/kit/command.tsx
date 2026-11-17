import { onMount, type VNodeChild } from '@pyreon/core'
import { useClipboard } from '@pyreon/hooks'
import { C } from './classes'

/**
 * The copy button of a command: "copy" → "copied", announced politely, with
 * a label that says what it copies. Plain markup (styled by `site-css.ts`),
 * so it can hydrate as a tiny island on its own (`CopyButtonIsland`) or render
 * inside a bigger island (the nav's mobile sheet).
 */
export function CopyButton(props: { text: string }) {
  const { copy, copied } = useClipboard()
  let button: HTMLElement | null = null
  // Marks the handler as attached (the server HTML shows the button before).
  onMount(() => {
    button?.setAttribute('data-hydrated', '')
    return undefined
  })
  return (
    <button
      type="button"
      class={C.copy}
      ref={(el: HTMLElement | null) => {
        button = el
      }}
      aria-label={() => (copied() ? `Copied: ${props.text}` : `Copy ${props.text}`)}
      onClick={() => void copy(props.text)}
    >
      <span aria-live="polite">{() => (copied() ? 'copied' : 'copy')}</span>
    </button>
  )
}

export default CopyButton

/**
 * A command as text with break opportunities where a reader expects a line
 * break: after a space (as always), after a `/` and before an `@version`.
 * `npm create @pyreon/zero@latest` wraps as `npm create` / `@pyreon/zero@latest`
 * and a longer package name as `@pyreon/multiplatform` / `@latest`, never in the
 * middle of a word. A component (not an array in a text slot) so hydration
 * adopts it inside an island.
 */
export function CommandText(props: { command: string }): VNodeChild {
  const parts = props.command.split(/(?<=\/)|(?<=\S)(?=@)/)
  return parts.flatMap((part, i) => (i === 0 ? [part] : [<wbr />, part]))
}

/**
 * The pill-shaped command line; `copy` is the button (an island on static
 * pages). The full command is always visible: where the pill is narrower than
 * the command (a phone, the footer column) it wraps onto a second line at a
 * `CommandText` break and the pill grows. The copy button copies `command`.
 */
export function CommandLine(props: { command: string; variant?: 'default' | 'hot' | undefined; copy: VNodeChild }) {
  return (
    <div class={props.variant === 'hot' ? `${C.cmd} ${C.cmdHot}` : C.cmd}>
      <code class={C.cmdText}>
        <span class={C.cmdPrompt} aria-hidden="true">
          $
        </span>
        <CommandText command={props.command} />
      </code>
      {props.copy}
    </div>
  )
}

/** A command inside an island: the copy button is part of the island. */
export function InlineCommand(props: { command: string; variant?: 'default' | 'hot' | undefined }) {
  return <CommandLine command={props.command} variant={props.variant} copy={<CopyButton text={props.command} />} />
}
