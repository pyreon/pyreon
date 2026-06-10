import { For } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'
import { useVirtualizer } from '@pyreon/virtual'
import { canEdit } from '../state/permissions'
import { type BoardDoc, type Card, newCardId } from '../sync/board-doc'

const ROW_HEIGHT = 36

/**
 * The backlog — a large synced list rendered with @pyreon/virtual, to show
 * fine-grained sync AT SCALE: seed 1,000 cards (one CRDT transaction, synced to
 * every client + persisted), and the virtualizer only ever mounts the ~visible
 * rows. (Read-only here — drag + virtualization don't compose cleanly, since
 * dnd needs real DOM nodes the virtualizer doesn't render.)
 */
export function Backlog(props: { board: BoardDoc }) {
  const backlog = props.board.backlog
  const scrollEl = signal<HTMLElement | null>(null)

  const virtual = useVirtualizer<HTMLElement, HTMLElement>(() => ({
    count: backlog().length,
    getScrollElement: () => scrollEl(),
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  }))

  function seed1000(): void {
    const start = backlog().length
    const batch: Card[] = []
    for (let i = 0; i < 1000; i++) {
      batch.push({ id: newCardId(), title: `Backlog #${start + i + 1}`, label: 'none' })
    }
    backlog.push(...batch)
  }

  return (
    <div class="backlog">
      <div class="backlog-head">
        <strong>Backlog</strong>
        <span style="color:var(--muted);font-size:12px" data-testid="backlog-count">
          {() => `${backlog().length} cards`}
        </span>
        <button
          class="btn"
          onClick={seed1000}
          disabled={() => !canEdit()}
          data-testid="seed-backlog"
        >
          + 1,000 cards
        </button>
      </div>
      <div class="backlog-scroll" ref={(el) => scrollEl.set(el)} data-testid="backlog-scroll">
        <div style={() => `height:${virtual.totalSize()}px;position:relative`}>
          <For each={() => virtual.virtualItems()} by={(item) => item.index}>
            {(item) => (
              <div
                class="backlog-row"
                style={() =>
                  `position:absolute;top:0;left:0;width:100%;height:${item.size}px;transform:translateY(${item.start}px)`
                }
              >
                {() => backlog()[item.index]?.title ?? ''}
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  )
}
