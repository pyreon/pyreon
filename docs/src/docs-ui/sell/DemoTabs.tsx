import { onMount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export type DemoTab = 'preview' | 'code'

/**
 * The Preview / Code tabs of a docs live demo (an island, `DemoTabsIsland`).
 * The two panels are static HTML next to it (`LiveDemo.tsx`: the demo is its
 * own island, the code is build-time Shiki); the tabs show one and hide the
 * other by id (`<base>-preview`, `<base>-code`), the ids their
 * `aria-controls` name. ← → move between them (the ARIA tabs pattern).
 */
export default function DemoTabs(props: { base: string; label: string; tabs: DemoTab[]; pkg: string }) {
  const tab = signal<DemoTab>('preview')
  const select = (t: DemoTab) => {
    tab.set(t)
    for (const other of props.tabs) {
      const panel = document.getElementById(`${props.base}-${other}`)
      if (panel) panel.hidden = other !== t
    }
  }
  let list: HTMLElement | null = null
  onMount(() => {
    // The server shows Preview; keep the panels in step if that ever changes.
    select(tab.peek())
    list?.setAttribute('data-hydrated', '')
    return undefined
  })
  const onKey = (e: KeyboardEvent) => {
    if (props.tabs.length < 2 || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    e.preventDefault()
    const next = tab.peek() === 'preview' ? 'code' : 'preview'
    select(next)
    document.getElementById(`${props.base}-tab-${next}`)?.focus()
  }
  return (
    <div
      class="dx-demo__tabs"
      role="tablist"
      aria-label={props.label}
      ref={(el: HTMLElement | null) => {
        list = el
      }}
    >
      {props.tabs.map((t) => (
        <button
          type="button"
          role="tab"
          id={`${props.base}-tab-${t}`}
          class="dx-demo__tab"
          aria-selected={() => (tab() === t ? 'true' : 'false')}
          aria-controls={`${props.base}-${t}`}
          tabIndex={() => (tab() === t ? 0 : -1)}
          onClick={() => select(t)}
          onKeyDown={onKey}
        >
          {t === 'preview' ? 'Preview' : 'Code'}
        </button>
      ))}
      <span class="dx-demo__sp" />
      <span class="dx-live">
        <i aria-hidden="true" />
        live · {props.pkg}
      </span>
    </div>
  )
}
