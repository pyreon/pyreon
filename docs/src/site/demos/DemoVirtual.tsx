import { For, onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'
import { font, paper } from '../theme'
import { el } from '../kit/bases'
import { DemoSurface } from '../kit/cards'
import { Pill } from '../kit/controls'
import { DemoGrid, DemoPanel, Meters, PaperHint } from '../kit/demo'

const COUNT = 100_000
const ROW = 40
const HEIGHT = 420
const NAMES = ['Ada', 'Grace', 'Linus', 'Margaret', 'Edsger', 'Barbara', 'Ken', 'Dennis']
const fmt = new Intl.NumberFormat('en-US')

const ListBox = el
  .config({ name: 'DemoVirtualBox' })
  .attrs({ block: true, contentAlignX: 'block', contentAlignY: 'top' })
  .theme(() => ({
    minWidth: 0,
    extendCss: `
      & .vt-box {
        height: ${HEIGHT}px; overflow: auto; position: relative; overscroll-behavior: contain;
        border: 1px solid ${paper.line}; border-radius: 12px; background: ${paper.field};
      }
      & .vt-box:focus-visible { outline: 2px solid ${paper.accent}; outline-offset: 2px; }
      & .vt-inner { position: relative; width: 100%; margin: 0; padding: 0; list-style: none; }
      & .vt-row {
        position: absolute; top: 0; left: 0; right: 0; height: ${ROW}px; box-sizing: border-box;
        display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 0 18px;
        border-bottom: 1px solid ${paper.line}; font: 14px ${font.system}; color: ${paper.text};
      }
      & .vt-row span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      & .vt-row b { font-weight: 500; font-variant-numeric: tabular-nums; }
    `,
  }))

/**
 * Virtual demo (`virtual.json` → demo): a real `useVirtualizer` from
 * `@pyreon/virtual` over 100,000 rows, rendered with a keyed `<For>`. The
 * counters are measured, not computed: a MutationObserver on the list counts
 * the row elements actually in the DOM and the rows the last scroll added or
 * removed. The scroller is focusable, so the arrow keys, Page Up/Down, Home
 * and End scroll it too.
 */
export default function DemoVirtual() {
  const scrollEl = signal<HTMLElement | null>(null)
  const inDom = signal(0)
  const changed = signal(0)
  let box: HTMLElement | null = null
  let inner: HTMLElement | null = null
  let observer: MutationObserver | undefined
  let pending = 0
  let frame = 0

  // Hand the scroller to the virtualizer only once it is in the document.
  // A ref fires while the element still belongs to the template's inert
  // document (no window), and @pyreon/virtual then attaches its scroll and
  // resize observers to nothing and never re-attaches. Registered BEFORE
  // useVirtualizer so this mount hook runs first.
  onMount(() => {
    scrollEl.set(box)
  })

  const { virtualItems, totalSize, instance } = useVirtualizer(() => ({
    count: COUNT,
    getScrollElement: () => scrollEl(),
    estimateSize: () => ROW,
    overscan: 5,
    // The server (and the first client render) lay out the top of the list.
    initialRect: { width: 0, height: HEIGHT },
  }))

  const countRows = () => (inner ? inner.querySelectorAll(':scope > .vt-row').length : 0)

  onMount(() => {
    inDom.set(countRows())
    if (!inner) return
    // One frame of mutation records is one scroll update (an add and a
    // remove can arrive in separate records).
    observer = new MutationObserver((records) => {
      for (const r of records) pending += r.addedNodes.length + r.removedNodes.length
      inDom.set(countRows())
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        changed.set(pending)
        pending = 0
      })
    })
    observer.observe(inner, { childList: true })
  })
  onUnmount(() => {
    observer?.disconnect()
    if (frame) cancelAnimationFrame(frame)
  })

  return (
    <DemoGrid>
      <DemoSurface>
        <ListBox>
          <section
            class="vt-box"
            // A scrollable region must be focusable to be keyboard-scrollable (axe scrollable-region-focusable).
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            aria-label="Orders, 100,000 rows. Use the arrow keys or Page Down to scroll."
            ref={(n: HTMLElement | null) => {
              box = n
            }}
          >
            <ul
              class="vt-inner"
              style={() => `height: ${totalSize()}px`}
              ref={(n: HTMLElement | null) => {
                inner = n
              }}
            >
              <For each={() => virtualItems()} by={(row) => row.index}>
                {(row) => (
                  <li
                    class="vt-row"
                    aria-posinset={row.index + 1}
                    aria-setsize={COUNT}
                    style={`transform: translateY(${row.start}px)`}
                  >
                    <span>
                      {NAMES[row.index % 8]} · order #{100_000 + row.index}
                    </span>
                    <b>${(row.index * 37) % 900 + 20}</b>
                  </li>
                )}
              </For>
            </ul>
          </section>
        </ListBox>
        <PaperHint>Scroll with the wheel or a finger, or focus the list and use the arrow keys, Page Down and End.</PaperHint>
      </DemoSurface>
      <DemoPanel note="Counted from the DOM by a MutationObserver: rows that stay in view are kept as they are, so a scroll touches only the rows entering and leaving.">
        <Meters
          label="Rows, measured"
          items={[
            { label: 'total rows', value: () => fmt.format(COUNT) },
            { label: 'rows in the DOM', value: () => inDom() },
            { label: 'rows added or removed by the last scroll step', value: () => changed() },
          ]}
        />
        <Pill onClick={() => instance.scrollToIndex(50_000, { align: 'center' })}>scrollToIndex(50000)</Pill>
      </DemoPanel>
    </DemoGrid>
  )
}
