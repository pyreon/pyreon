import { For, onMount, onUnmount, Show } from '@pyreon/core'
import { computed, effect, signal } from '@pyreon/reactivity'
import { useSearch } from '@pyreon/zero-content'
import { DocsGlyph as Glyph } from './glyph'
import { normalizeDocsPath, SIDEBAR, trailOf } from './nav'

/**
 * The ⌘K search dialog. Loaded on first open (`search.tsx`), so the search
 * runtime, MiniSearch and the index cost nothing until someone searches.
 *
 * Built on `@pyreon/zero-content`'s `useSearch()` (the index, debounce and
 * stale-result guard live there); this file is the docs' presentation:
 * results grouped by sidebar group with the product glyph, a combobox
 * (`aria-activedescendant`) driven by ↑ ↓ Enter, Escape to close and focus
 * back where it was.
 */

interface Hit {
  id: string
  url: string
  title: string
  description: string
  group: string
  productId: string | undefined
  /** Position in the flattened, grouped list (drives ↑ ↓ and aria-activedescendant). */
  index: number
}

interface RawResult {
  id: unknown
  url?: unknown
  title?: unknown
  description?: unknown
  anchors?: unknown
  terms?: unknown
}

const GROUP_ORDER = new Map<string, number>(SIDEBAR.map((g, i) => [g.group, i]))

/** Results → groups in sidebar order, each hit keeping its rank inside its group. Pure; exported for tests. */
export function groupHits(results: readonly RawResult[], linkOf: (r: RawResult) => string): { group: string; hits: Hit[] }[] {
  const groups = new Map<string, Hit[]>()
  for (const r of results) {
    const url = linkOf(r)
    const trail = trailOf(normalizeDocsPath(url))
    const group = trail?.group.group ?? 'Other'
    const hit: Hit = {
      id: String(r.id),
      url,
      title: String(r.title ?? r.id),
      description: typeof r.description === 'string' ? r.description : '',
      group,
      productId: trail?.productId,
      index: 0,
    }
    const list = groups.get(group)
    if (list) list.push(hit)
    else groups.set(group, [hit])
  }
  let index = 0
  return [...groups.entries()]
    .sort(([a], [b]) => (GROUP_ORDER.get(a) ?? 99) - (GROUP_ORDER.get(b) ?? 99))
    .map(([group, hits]) => ({ group, hits: hits.map((h) => ({ ...h, index: index++ })) }))
}

/** Heading deep link (the same rule as zero-content's own `<Search>`). */
function deepLink(r: RawResult): string {
  const url = String(r.url ?? '#')
  const anchors = Array.isArray(r.anchors) ? (r.anchors as { t: string; s: string }[]) : []
  const terms = Array.isArray(r.terms) ? (r.terms as string[]) : []
  let best: { t: string; s: string } | undefined
  let bestScore = 0
  for (const a of anchors) {
    let score = 0
    for (const term of terms) if (a.t.includes(term)) score++
    if (score > bestScore) {
      bestScore = score
      best = a
    }
  }
  return best ? `${url}#${best.s}` : url
}

export default function SearchDialog(props: { open: () => boolean; onClose: () => void }) {
  const state = useSearch({ debounceMs: 120, maxResults: 12, minQueryLength: 2 })
  const grouped = computed(() => groupHits(state.results() as unknown as RawResult[], deepLink))
  const flat = computed(() => grouped().flatMap((g) => g.hits))
  const activeIndex = signal(0)
  let dialog: HTMLDialogElement | null = null
  let input: HTMLInputElement | null = null

  // A native modal <dialog>: focus moves in, the page behind is inert, and
  // closing returns focus to whatever opened it. The index warms as soon as
  // the dialog exists (it only mounts on first open).
  onMount(() => {
    state.open.set(true)
    let opener: HTMLElement | null = null
    const sync = effect(() => {
      if (!dialog) return
      if (props.open() && !dialog.open) {
        opener = document.activeElement as HTMLElement | null
        dialog.showModal()
        input?.focus({ preventScroll: true })
        input?.select()
      } else if (!props.open() && dialog.open) {
        dialog.close()
        // Back to whatever opened it (a navigation away moves focus itself).
        if (opener?.isConnected) opener.focus()
      }
    })
    return () => sync.dispose()
  })
  onUnmount(() => state.close())

  const optionId = (i: number) => `dx-search-opt-${i}`
  const go = (hit: Hit | undefined) => {
    if (!hit) return
    props.onClose()
    // Docs pages are static documents: a result is a page load.
    window.location.assign(hit.url)
  }

  const onKey = (e: KeyboardEvent) => {
    const n = flat().length
    if (e.key === 'ArrowDown' && n > 0) {
      e.preventDefault()
      activeIndex.set((activeIndex.peek() + 1) % n)
    } else if (e.key === 'ArrowUp' && n > 0) {
      e.preventDefault()
      activeIndex.set((activeIndex.peek() - 1 + n) % n)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(flat()[activeIndex.peek()])
    } else if (e.key === 'Escape') {
      // One Escape closes, even with text in the field (a search input would
      // otherwise spend the first Escape clearing itself).
      e.preventDefault()
      props.onClose()
    }
  }

  const status = () => {
    const q = state.query().trim()
    if (q.length < 2) return 'Type at least two letters.'
    if (state.status() !== 'ready') return 'Searching…'
    const n = flat().length
    return n === 0 ? `Nothing in the docs reads "${q}" yet. Try a shorter word, or browse the sidebar.` : `${n} result${n === 1 ? '' : 's'}`
  }

  return (
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- pointer-only dismissal on the ::backdrop; the keyboard closes the modal dialog with Escape and its close button
    <dialog
      class="dx-sdlg"
      aria-label="Search the docs"
      ref={(el: HTMLDialogElement | null) => {
        dialog = el
        // Escape (the browser's cancel) and every other close path report
        // back. A listener, not `onClose`: the JSX types lack it (#4369).
        el?.addEventListener('close', () => props.onClose())
      }}
      onClick={(e: MouseEvent) => {
        // A click on the ::backdrop lands on the dialog element itself.
        if (e.target === dialog) props.onClose()
      }}
    >
      <div class="dx-sdlg__panel">
        <div class="dx-search-field">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input
            ref={(el: HTMLInputElement | null) => {
              input = el
            }}
            type="search"
            class="dx-search-input"
            placeholder="Search the docs"
            role="combobox"
            aria-expanded={() => (flat().length > 0 ? 'true' : 'false')}
            aria-controls="dx-search-results"
            aria-autocomplete="list"
            aria-activedescendant={() => (flat().length > 0 ? optionId(activeIndex()) : undefined)}
            value={() => state.query()}
            onInput={(e: Event) => {
              activeIndex.set(0)
              state.query.set((e.target as HTMLInputElement).value)
            }}
            onKeyDown={onKey}
          />
          <button type="button" class="dx-search-esc" onClick={() => props.onClose()}>
            Esc
          </button>
        </div>
        {/* oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox/listbox pattern: native <select>/<option> cannot hold links, glyphs and descriptions */}
        <div class="dx-search-results" id="dx-search-results" role="listbox" aria-label="Results">
          {/* A group re-renders when its hits change (its key carries them). */}
          <For each={() => grouped()} by={(g) => `${g.group}|${g.hits.map((h) => `${h.index}:${h.url}`).join(',')}`}>
            {(g) => (
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox/listbox pattern: native <select>/<option> cannot hold links, glyphs and descriptions
              <div role="group" aria-label={g.group} class="dx-search-group">
                <p class="dx-eyebrow" aria-hidden="true">
                  {g.group}
                </p>
                <For each={g.hits} by={(h) => `${h.index}:${h.url}`}>
                  {(h) => {
                    const i = h.index
                    return (
                      <a
                        id={optionId(i)}
                        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA combobox/listbox pattern: native <select>/<option> cannot hold links, glyphs and descriptions
                        role="option"
                        href={h.url}
                        class="dx-search-hit"
                        tabIndex={-1}
                        aria-selected={() => (activeIndex() === i ? 'true' : 'false')}
                        onMouseMove={() => activeIndex.set(i)}
                        onClick={(e: MouseEvent) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                          e.preventDefault()
                          go(h)
                        }}
                      >
                        <span class="dx-search-glyph">{h.productId ? <Glyph id={h.productId} size={16} /> : <span class="dx-search-dot" />}</span>
                        <span class="dx-search-text">
                          <span class="dx-search-title">{h.title}</span>
                          <Show when={() => h.description !== ''}>
                            <span class="dx-search-desc">{h.description}</span>
                          </Show>
                        </span>
                      </a>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
        </div>
        <output class="dx-search-status">{status}</output>
        <p class="dx-search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
          </span>
          <span>
            Ask your AI assistant: the <a href="/docs/mcp">MCP server</a> has <code>get_api</code>
          </span>
        </p>
      </div>
    </dialog>
  )
}
