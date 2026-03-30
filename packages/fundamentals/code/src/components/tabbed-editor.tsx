import type { VNodeChild } from '@pyreon/core'
import type { TabbedEditorProps } from '../types'
import { CodeEditor } from './code-editor'

/**
 * Tabbed code editor component — renders tab bar + editor.
 * Headless styling — the tab bar is a plain div with button tabs.
 * Consumers can style via CSS classes.
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
  const { instance } = props

  const containerStyle = `display: flex; flex-direction: column; width: 100%; height: 100%; ${props.style ?? ''}`

  const tabBarStyle =
    'display: flex; overflow-x: auto; background: #f1f5f9; border-bottom: 1px solid #e2e8f0; min-height: 34px; flex-shrink: 0;'

  return (
    <div class={`pyreon-tabbed-editor ${props.class ?? ''}`} style={containerStyle}>
      {() => {
        const tabs = instance.tabs()
        const activeId = instance.activeTabId()

        return (
          <div class="pyreon-tabbed-editor-tabs" style={tabBarStyle}>
            {tabs.map((tab) => {
              const id = tab.id ?? tab.name
              const isActive = id === activeId

              const tabStyle = `display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: none; background: ${isActive ? 'white' : 'transparent'}; border-bottom: ${isActive ? '2px solid #3b82f6' : '2px solid transparent'}; cursor: pointer; font-size: 13px; color: ${isActive ? '#1e293b' : '#64748b'}; white-space: nowrap; position: relative; font-family: inherit;`

              return (
                <button
                  type="button"
                  key={id}
                  class={`pyreon-tab ${isActive ? 'active' : ''} ${tab.modified ? 'modified' : ''}`}
                  style={tabStyle}
                  onClick={() => instance.switchTab(id)}
                >
                  <span>{tab.name}</span>
                  {tab.modified && (
                    <span
                      style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0;"
                      title="Modified"
                    />
                  )}
                  {tab.closable !== false && (
                    <span
                      style="font-size: 14px; line-height: 1; opacity: 0.5; cursor: pointer; padding: 0 2px; margin-left: 2px;"
                      title="Close"
                      onClick={(e: MouseEvent) => {
                        e.stopPropagation()
                        instance.closeTab(id)
                      }}
                    >
                      ×
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )
      }}
      <div style="flex: 1; min-height: 0;">
        <CodeEditor instance={instance.editor} />
      </div>
    </div>
  )
}
