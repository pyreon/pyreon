import { For, onMount, onUnmount } from '@pyreon/core'
import { useSortable } from '@pyreon/dnd'
import { computed, signal } from '@pyreon/reactivity'
import { font, motion, paper } from '../theme'
import { el } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel, PaperHint } from '../kit/demo'
import { Eyebrow } from '../kit/type'

interface Task {
  id: number
  title: string
}

const TASKS: Task[] = [
  { id: 1, title: 'Design review' },
  { id: 2, title: 'Ship onboarding' },
  { id: 3, title: 'Write release notes' },
  { id: 4, title: 'Fix Safari bug' },
]

const ListBox = el
  .config({ name: 'DemoDndList' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({
    minWidth: 0,
    extendCss: `
      & ul { display: grid; gap: 8px; margin: -8px -6px -14px; padding: 8px 6px 14px; list-style: none; overflow-y: auto; }
      & li {
        position: relative; display: grid; grid-template-columns: 20px minmax(0, 1fr) auto; align-items: center; gap: 10px;
        padding: 12px 14px; border: 1px solid ${paper.line}; border-radius: 10px; background: ${paper.field};
        font: 14px ${font.system}; color: ${paper.text}; cursor: grab; user-select: none; -webkit-user-select: none;
        transition: transform .15s, box-shadow .15s, border-color .15s;
      }
      & li:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }
      & li[data-lifted='true'] { border-color: ${paper.accent}; box-shadow: 0 8px 16px -10px ${motion.pulse.ring}; transform: scale(1.01); }
      & li[data-edge]::before {
        content: ''; position: absolute; left: 8px; right: 8px; height: 3px; border-radius: 2px; background: ${paper.accent};
      }
      & li[data-edge='top']::before { top: -6px; }
      & li[data-edge='bottom']::before { bottom: -6px; }
      & li i { font-style: normal; color: ${paper.fog}; letter-spacing: -2px; }
      & li span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      & li small { font: 11px ${font.mono}; color: ${paper.fog}; }
      @media (prefers-reduced-motion: reduce) { & li { transition: none; } & li[data-lifted='true'] { transform: none; } }
    `,
  }))

const Heard = el
  .config({ name: 'DemoDndHeard' })
  .attrs({ tag: 'p', block: true })
  .theme(() => ({ minHeight: 20, margin: 0, fontFamily: font.mono, fontSize: 12.5, lineHeight: 1.5, color: paper.fog }))

/**
 * Drag-and-drop demo (`dnd.json` → demo): a real `useSortable` from
 * `@pyreon/dnd`. Pointer drags go through pragmatic-drag-and-drop; the
 * keyboard path (Space to pick up, arrows to move, Space to drop, Escape to
 * cancel) and the screen-reader announcements are the package's own. The
 * line under the list mirrors the live region `@pyreon/a11y` writes those
 * announcements into, so a sighted reader sees what a screen reader says.
 */
export default function DemoDnd() {
  const tasks = signal(TASKS)
  const heard = signal('')

  const sortable = useSortable({
    items: () => tasks(),
    by: (t) => t.id,
    onReorder: (next) => tasks.set(next),
    label: (t) => t.title,
  })

  const json = computed(() => `[${tasks().map((t) => `\n  { id: ${t.id}, title: '${t.title}' }`).join(',')}\n]`)

  // Mirror the package's polite live region (created on the first announcement).
  let bodyObserver: MutationObserver | undefined
  let regionObserver: MutationObserver | undefined
  let list: HTMLElement | null = null
  onMount(() => {
    // Register the container once it is in the document. Its ref fires while
    // the element still belongs to the template's inert document (#4390), where
    // getComputedStyle is empty, and the drag library's auto-scroll then
    // warns that the list "appears not to be scrollable" (the ul is
    // overflow-y: auto so it can auto-scroll). Items register through their refs.
    sortable.containerRef(list)
    const watchRegion = (): boolean => {
      const region = document.querySelector<HTMLElement>('[data-pyreon-announcer="polite"]')
      if (!region) return false
      regionObserver = new MutationObserver(() => {
        const text = region.textContent ?? ''
        if (text) heard.set(text)
      })
      regionObserver.observe(region, { childList: true, characterData: true, subtree: true })
      return true
    }
    if (watchRegion()) return
    bodyObserver = new MutationObserver(() => {
      if (watchRegion()) bodyObserver?.disconnect()
    })
    bodyObserver.observe(document.body, { childList: true })
  })
  onUnmount(() => {
    sortable.containerRef(null)
    bodyObserver?.disconnect()
    regionObserver?.disconnect()
  })

  return (
    <DemoGrid>
      <DemoSurface>
        <ListBox>
          <ul
            ref={(n: HTMLElement | null) => {
              list = n
            }}
            aria-label="Tasks"
          >
            <For each={() => tasks()} by={(t) => t.id}>
              {(t) => (
                <li
                  ref={sortable.itemRef(t.id)}
                  data-lifted={() => (sortable.isActive(t.id) ? 'true' : undefined)}
                  data-edge={() => (sortable.isOverKey(t.id) ? (sortable.overEdge() ?? undefined) : undefined)}
                >
                  <i aria-hidden="true">⋮⋮</i>
                  <span>{t.title}</span>
                  <small aria-hidden="true">#{t.id}</small>
                </li>
              )}
            </For>
          </ul>
        </ListBox>
        <PaperHint>Escape cancels a keyboard move and puts the row back.</PaperHint>
        <Heard aria-hidden="true">{() => (heard() ? `Screen reader: “${heard()}”` : '')}</Heard>
      </DemoSurface>
      <DemoPanel note="The line under the list mirrors the live region the package announces into: that is what a screen reader hears.">
        <Eyebrow>tasks() · live signal</Eyebrow>
        <CodeBlock
          label="The tasks signal"
          // The compiler wraps this read in _rp(), so CodeBlock's {props.code} follows the signal.
          // pyreon-lint-disable-next-line pyreon/no-signal-in-props
          code={json()}
        />
      </DemoPanel>
    </DemoGrid>
  )
}
