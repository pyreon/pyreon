import { announce, LiveRegion, VisuallyHidden } from '@pyreon/a11y'
import { h } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * A real save-button pattern: `<LiveRegion visible>` shows AND announces
 * "Saving… → Saved" with zero manual wiring (just drive it with a
 * signal), and a fire-and-forget `announce()` call adds a SEPARATE
 * screen-reader-only confirmation. `<VisuallyHidden>` labels the icon-
 * only button for assistive tech. If you're on a screen reader, you'll
 * hear both; sighted readers see the visible status line update.
 */
export default function SaveButtonLiveRegion() {
  const status = signal<'idle' | 'saving' | 'saved'>('idle')

  const save = () => {
    status.set('saving')
    setTimeout(() => {
      status.set('saved')
      announce('Your changes were saved', { clearAfter: 3000 })
    }, 600)
  }

  return h('div', { class: 'row', style: { alignItems: 'center', gap: '10px' } },
    h('button', { onClick: save },
      '💾',
      h(VisuallyHidden, {}, 'Save changes'),
    ),
    h(LiveRegion, { visible: true, class: 'muted' }, () => {
      const s = status()
      return s === 'saving' ? 'Saving…' : s === 'saved' ? 'Saved' : ''
    }),
  )
}
