import { createUniqueId, cx } from '@pyreon/core'
import type { VNodeChild } from '@pyreon/core'
import type { TabbedEditorProps } from '../types'
import { CodeEditor } from './code-editor'

interface TabBarPalette {
  bar: string
  border: string
  active: string
  text: string
  activeText: string
}

const LIGHT: TabBarPalette = {
  bar: '#f1f5f9',
  border: '#e2e8f0',
  active: 'white',
  text: '#64748b',
  activeText: '#1e293b',
}

const DARK: TabBarPalette = {
  bar: '#181825',
  border: '#313244',
  active: '#1e1e2e',
  text: '#7f849c',
  activeText: '#cdd6f4',
}

/**
 * Tabbed code editor component — renders tab bar + editor.
 * Headless styling — the tab bar is a plain div with button tabs.
 * Consumers can style via CSS classes.
 *
 * Follows the WAI-ARIA tabs pattern: `role="tablist"` / `role="tab"` with
 * `aria-selected`, a roving tabindex, ArrowLeft/ArrowRight/Home/End to move
 * between tabs, and Delete to close the focused tab. Each close control is a
 * real button beside its tab (never nested inside it — an interactive element
 * inside a `<button>` is invalid and unreachable by keyboard).
 *
 * @example
 * ```tsx
 * const editor = createTabbedEditor({
 *   tabs: [
 *     { name: 'index.ts', language: 'typescript', value: 'const x = 1' },
 *     { name: 'style.css', language: 'css', value: '.app { }' },
 *   ],
 *   theme: 'dark',
 * })
 *
 * <TabbedEditor instance={editor} style="height: 500px" />
 * ```
 */
export function TabbedEditor(props: TabbedEditorProps): VNodeChild {
  const uid = createUniqueId()
  const tabDomId = (index: number): string => `${uid}-tab-${index}`

  // Components run once, so the style string below captured `props.style` at
  // setup — `<TabbedEditor style={h()} />` never resized. It is an accessor now,
  // which the compiler binds reactively.
  const containerStyle = (): string =>
    `display: flex; flex-direction: column; width: 100%; height: 100%; ${props.style ?? ''}`

  // The bar follows the editor theme — a light bar above a dark editor was the
  // default look. A custom Extension theme keeps the light palette (restyle via
  // the `pyreon-tabbed-editor-tabs` / `pyreon-tab` classes).
  const palette = (): TabBarPalette => (props.instance.editor.theme() === 'dark' ? DARK : LIGHT)

  const activeTabDomId = (): string | undefined => {
    const activeId = props.instance.activeTabId()
    const index = props.instance.tabs().findIndex((t) => (t.id ?? t.name) === activeId)
    return index >= 0 ? tabDomId(index) : undefined
  }

  let tabList: HTMLElement | null = null

  const focusTab = (index: number): void => {
    const el = tabList?.querySelectorAll<HTMLElement>('[role="tab"]')[index]
    el?.focus()
  }

  const onTabKeyDown = (e: KeyboardEvent, index: number, id: string, closable: boolean): void => {
    const tabs = props.instance.tabs()
    const last = tabs.length - 1
    let next = -1
    if (e.key === 'ArrowRight') next = index === last ? 0 : index + 1
    else if (e.key === 'ArrowLeft') next = index === 0 ? last : index - 1
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = last
    else if (e.key === 'Delete' && closable) {
      e.preventDefault()
      props.instance.closeTab(id)
      queueMicrotask(() => focusTab(Math.min(index, props.instance.tabs().length - 1)))
      return
    }
    if (next < 0) return
    e.preventDefault()
    const target = tabs[next]
    if (!target) return
    props.instance.switchTab(target.id ?? target.name)
    // The tab bar re-renders on switch — focus after it settles.
    queueMicrotask(() => focusTab(next))
  }

  return (
    <div class={cx(['pyreon-tabbed-editor', props.class])} style={containerStyle()}>
      {() => {
        const tabs = props.instance.tabs()
        const activeId = props.instance.activeTabId()
        const p = palette()

        return (
          <div
            class="pyreon-tabbed-editor-tabs"
            role="tablist"
            aria-orientation="horizontal"
            ref={(el: Element | null) => {
              tabList = el as HTMLElement | null
            }}
            style={`display: flex; overflow-x: auto; background: ${p.bar}; border-bottom: 1px solid ${p.border}; min-height: 34px; flex-shrink: 0;`}
          >
            {tabs.map((tab, index) => {
              const id = tab.id ?? tab.name
              const isActive = id === activeId
              const closable = tab.closable !== false

              const tabStyle = `display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; background: ${isActive ? p.active : 'transparent'}; border-bottom: ${isActive ? '2px solid #3b82f6' : '2px solid transparent'}; cursor: pointer; font-size: 13px; color: ${isActive ? p.activeText : p.text}; white-space: nowrap; position: relative; font-family: inherit;`

              return (
                <div
                  key={id}
                  role="presentation"
                  class="pyreon-tab-item"
                  style="display: flex; align-items: center;"
                >
                  <button
                    type="button"
                    role="tab"
                    id={tabDomId(index)}
                    aria-selected={isActive ? 'true' : 'false'}
                    aria-controls={`${uid}-panel`}
                    tabIndex={isActive ? 0 : -1}
                    class={cx(['pyreon-tab', { active: isActive, modified: tab.modified }])}
                    style={tabStyle}
                    onClick={() => props.instance.switchTab(id)}
                    onKeyDown={(e: KeyboardEvent) => onTabKeyDown(e, index, id, closable)}
                  >
                    <span>{tab.name}</span>
                    {tab.modified && (
                      <span
                        style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"
                        title="Modified"
                        aria-label="Modified"
                        role="img"
                      />
                    )}
                  </button>
                  {closable && (
                    <button
                      type="button"
                      class="pyreon-tab-close"
                      aria-label={`Close ${tab.name}`}
                      title="Close"
                      tabIndex={-1}
                      style={`font-size: 14px; line-height: 1; opacity: 0.5; cursor: pointer; padding: 0 6px; border: none; background: transparent; color: ${p.text}; font-family: inherit;`}
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation()
                        props.instance.closeTab(id)
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )
      }}
      <div
        id={`${uid}-panel`}
        role="tabpanel"
        aria-labelledby={activeTabDomId()}
        style="flex: 1; min-height: 0;"
      >
        <CodeEditor instance={props.instance.editor} />
      </div>
    </div>
  )
}
