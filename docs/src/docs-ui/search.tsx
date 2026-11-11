import type { ComponentFn } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'

type DialogComponent = ComponentFn<{ open: () => boolean; onClose: () => void }>

/**
 * Docs search state for one layout: the open flag, the ⌘K / Ctrl+K / "/"
 * shortcut, and the dialog module, imported on the first open. Until then a
 * docs page carries none of the search code.
 */
export function useDocsSearch() {
  const open = signal(false)
  const Dialog = signal<DialogComponent | null>(null)
  let loading = false

  const show = () => {
    open.set(true)
    if (Dialog.peek() !== null || loading) return
    loading = true
    void import('./SearchDialog').then((m) => Dialog.set(m.default as DialogComponent))
  }
  const hide = () => open.set(false)

  useEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null
    const typing = !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (open.peek()) hide()
      else show()
    } else if (e.key === '/' && !typing && !open.peek()) {
      e.preventDefault()
      show()
    }
  })

  /** Mount once in the layout; renders nothing until the first open. */
  const Mount = () => (
    <>
      {() => {
        const D = Dialog()
        return D ? <D open={() => open()} onClose={hide} /> : null
      }}
    </>
  )

  return { open, show, hide, Mount }
}
