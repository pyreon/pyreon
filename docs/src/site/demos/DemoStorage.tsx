import { onMount } from '@pyreon/core'
import { useEventListener } from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { removeStorage, useStorage } from '@pyreon/storage'
import { DemoSurface, GlowCard } from '../kit/cards'
import { CodeBlock } from '../kit/code'
import { DemoGrid, PaperButton, PaperField, PaperHint, PaperLabel } from '../kit/demo'
import { CardNote, DemoStack, PaperActions, PaperSegmented } from '../kit/demo-parts'
import { Eyebrow } from '../kit/type'

/**
 * Storage demo (`storage.json` → demo): two real `useStorage` signals that
 * write this browser's `localStorage`. Reload the page and they come back;
 * open it in a second tab and the package's own `storage` listener moves
 * them there too. The right panel reads `localStorage` itself.
 *
 * The server has no `localStorage`, so the first render shows the defaults
 * (as the HTML did) and the stored values appear once mounted: hydration
 * adopts the server DOM, then the signals take over.
 */
const THEME_KEY = 'pyreon-demo-theme'
const NOTE_KEY = 'pyreon-demo-note'
const THEMES = ['light', 'dark', 'system'] as const
type Theme = (typeof THEMES)[number]

function readRaw(): string {
  try {
    const lines = [THEME_KEY, NOTE_KEY].flatMap((k) => {
      const v = localStorage.getItem(k)
      return v === null ? [] : [`${k}: ${v}`]
    })
    return lines.length ? lines.join('\n') : '(empty, defaults in use)'
  } catch {
    return '(localStorage is blocked in this browser)'
  }
}

export default function DemoStorage() {
  // `.remove()` resets a signal and releases it, so a consumer that keeps
  // using the key takes a fresh one afterwards: keep the current signal in a slot.
  const theme = signal(useStorage<Theme>(THEME_KEY, 'light'))
  const note = signal(useStorage(NOTE_KEY, ''))
  const mounted = signal(false)
  const raw = signal('(empty, defaults in use)')
  const external = signal('Open this page in a second tab to see cross-tab sync.')
  const refresh = () => raw.set(readRaw())

  onMount(() => {
    mounted.set(true)
    refresh()
  })
  useEventListener('storage', (e: StorageEvent) => {
    if (e.key === THEME_KEY || e.key === NOTE_KEY || e.key === null) {
      refresh()
      external.set('↻ updated from another tab')
    }
  })

  const currentTheme = (): Theme => (mounted() ? theme()() : 'light')
  const setTheme = (v: Theme) => {
    theme.peek().set(v)
    refresh()
  }
  const removeTheme = () => {
    theme.peek().remove()
    theme.set(useStorage<Theme>(THEME_KEY, 'light'))
    refresh()
  }
  const removeBoth = () => {
    removeStorage(THEME_KEY)
    removeStorage(NOTE_KEY)
    theme.set(useStorage<Theme>(THEME_KEY, 'light'))
    note.set(useStorage(NOTE_KEY, ''))
    refresh()
  }

  return (
    <DemoGrid>
      <DemoSurface aria-label="Storage demo">
        <PaperSegmented legend={`useStorage('${THEME_KEY}', 'light')`} options={THEMES} value={() => currentTheme()} onChange={setTheme} />
        <PaperLabel for="storage-note">{`useStorage('${NOTE_KEY}', '')`}</PaperLabel>
        <PaperField>
          <input
            id="storage-note"
            placeholder="Type something, then reload"
            autoComplete="off"
            value={() => (mounted() ? note()() : '')}
            onInput={(e: Event) => {
              note.peek().set((e.target as HTMLInputElement).value)
              refresh()
            }}
          />
        </PaperField>
        <PaperActions>
          <PaperButton type="button" onClick={removeTheme}>
            theme.remove()
          </PaperButton>
          <PaperButton type="button" onClick={removeBoth}>
            removeStorage(both keys)
          </PaperButton>
        </PaperActions>
        <PaperHint>Only this demo's two keys are touched; the rest of this site's storage stays as it is.</PaperHint>
      </DemoSurface>
      <GlowCard padding="compact">
        <DemoStack>
          <Eyebrow>localStorage, live</Eyebrow>
          <CodeBlock code={raw()} label="localStorage contents for the demo keys" />
          <CardNote aria-live="polite">{() => external()}</CardNote>
        </DemoStack>
      </GlowCard>
    </DemoGrid>
  )
}
