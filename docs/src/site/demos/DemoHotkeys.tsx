import { For, onMount, onUnmount, Show } from '@pyreon/core'
import { formatCombo, getActiveScopes, parseShortcut, useHotkey, useHotkeyScope } from '@pyreon/hotkeys'
import { signal } from '@pyreon/reactivity'
import { font, motion, radius, text, weight } from '../theme'
import { el, focusRing, tone, txt, type ButtonAttrs } from '../kit/bases'
import { CodeBlock } from '../kit/code'
import { DemoGrid, DemoPanel, Meters } from '../kit/demo'
import { Eyebrow } from '../kit/type'

type Shortcut = { keys: string; label: string; scope?: 'editor'; how?: string }

const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'mod+k', label: 'Open command palette' },
  { keys: 'g i', label: 'Go to inbox', how: 'sequence' },
  { keys: '?', label: 'Show shortcuts' },
  { keys: 'mod+s', label: 'Save', scope: 'editor' },
  { keys: 'mod+z', label: 'Undo', scope: 'editor' },
  { keys: 'escape', label: 'Close' },
]

const SOURCE = `const box = () => boxEl   // keys fire only while focus is inside it
useHotkey('mod+k', openPalette, { target: box })
useHotkey('g i', goToInbox, { target: box })
useHotkey('?', showHelp, { target: box })
useHotkey('escape', close, { target: box })
useHotkey('mod+s', save, { target: box, scope: 'editor' })
useHotkey('mod+z', undo, { target: box, scope: 'editor' })

// while the toggle is on:
useHotkeyScope('editor')`

/** The label before mount (server render and hydration): no platform guess. */
function neutralLabel(keys: string): string {
  if (keys === 'g i') return 'G then I'
  if (keys === 'escape') return 'Esc'
  return keys.startsWith('mod+') ? `⌘/Ctrl ${keys.slice(4).toUpperCase()}` : keys.toUpperCase()
}

/** The label once mounted: the package's own platform-aware formatting. */
function platformLabel(keys: string): string {
  if (keys === 'g i' || keys === '?') return neutralLabel(keys)
  if (keys === 'escape') return 'Esc'
  return formatCombo(parseShortcut(keys))
}

const Box = el
  .config({ name: 'HkBox' })
  .attrs({ block: true, gap: 14, contentAlignX: 'block' })
  .theme((_t, m) => ({
    borderRadius: radius.note,
    focus: focusRing(m),
    extendCss: '&:focus-within { outline: 1px dashed currentColor; outline-offset: 6px; } &:focus-visible { outline-style: solid; }',
  }))

const Head = el
  .config({ name: 'HkHead' })
  .attrs({ block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 12 })
  .theme(() => ({ flexWrap: 'wrap' }))

const ScopeToggle = el
  .config({ name: 'HkScope' })
  .attrs<ButtonAttrs>({ tag: 'button', contentAlignY: 'center' })
  .theme((_t, m) => ({
    height: 34,
    paddingLeft: 14,
    paddingRight: 14,
    borderRadius: radius.pill,
    border: '1px solid',
    borderColor: tone(m, 'line2'),
    backgroundColor: 'transparent',
    color: tone(m, 'text'),
    fontFamily: font.mono,
    fontSize: text.mono.size,
    whiteSpace: 'nowrap',
    transition: `border-color ${motion.hover}, background-color ${motion.hover}`,
    hover: { borderColor: tone(m, 'lineHover') },
    focus: focusRing(m),
    pressed: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill') },
  }))

const Grid = el
  .config({ name: 'HkGrid' })
  .attrs({ tag: 'ul', block: true })
  .theme(() => ({
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))',
    gap: 8,
  }))

const Row = el
  .config({ name: 'HkRow' })
  .attrs({ tag: 'li', block: true, contentDirection: 'inline', contentAlignX: 'spaceBetween', contentAlignY: 'center', gap: 10 })
  .theme((_t, m) => ({
    paddingTop: 11,
    paddingBottom: 11,
    paddingLeft: 14,
    paddingRight: 14,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.note,
    fontSize: 14,
    color: tone(m, 'mist'),
    transition: 'border-color .2s, background-color .2s, color .2s, opacity .2s',
    extendCss: `@media (prefers-reduced-motion: reduce) { transition: none; } & small { color: ${tone(m, 'fog')}; font-size: 12px; } & kbd { font-family: ${font.mono}; font-size: 11.5px; color: ${tone(m, 'text')}; white-space: nowrap; padding: 3px 7px; border: 1px solid ${tone(m, 'line2')}; border-radius: 6px; }`,
  }))
  .states((_t, m) => ({
    idle: {},
    off: { opacity: 0.45 },
    hit: { borderColor: tone(m, 'currentBorder'), backgroundColor: tone(m, 'currentFill'), color: tone(m, 'text') },
  }))

const Out = txt
  .config({ name: 'HkOut' })
  .attrs({ tag: 'p' })
  .theme((_t, m) => ({
    margin: 0,
    padding: 14,
    minHeight: 20,
    border: '1px dashed',
    borderColor: tone(m, 'line2'),
    borderRadius: radius.note,
    fontFamily: font.mono,
    fontSize: 13,
    fontWeight: weight.regular,
    color: tone(m, 'mist'),
    overflowWrap: 'anywhere',
  }))

const Stack = el.config({ name: 'HkStack' }).attrs({ block: true, gap: 14, contentAlignX: 'block' })

/** The bindings: real `useHotkey` calls, all scoped to the demo box. */
function Bindings(props: { box: () => HTMLElement | null; editorOn: () => boolean; onHit: (i: number) => void; onIgnored: (keys: string) => void }) {
  SHORTCUTS.forEach((s, i) => {
    useHotkey(s.keys, () => props.onHit(i), { target: props.box, ...(s.scope ? { scope: s.scope } : {}) })
  })
  // While the editor scope is off, keep ⌘S / ⌘Z inside the box from reaching
  // the browser (its save dialog) and say why nothing happened.
  useHotkey('mod+s, mod+z', (e) => props.onIgnored(e.key.toUpperCase()), { target: props.box, enabled: () => !props.editorOn() })
  return null
}

/** Mounted only while the toggle is on: the scope lives exactly as long as it. */
function EditorScope() {
  useHotkeyScope('editor')
  return null
}

/**
 * Hotkeys demo (`hotkeys.json` → demo): real `useHotkey` / `useHotkeyScope`
 * from `@pyreon/hotkeys`. Every binding targets the demo box (`target`), so
 * the shortcuts fire only while focus is inside it and never touch the
 * site's own keys. The editor toggle mounts a component that holds the
 * `editor` scope; unmounting it releases the scope.
 *
 * Teardown: a zero island is never unmounted on client-side navigation (its
 * hydration root is not disposed; reported with the products-b demos), so the
 * bindings and the scope live in children that this demo unmounts itself
 * once its root leaves the document. That runs the package's own cleanup.
 */
export default function DemoHotkeys() {
  const alive = signal(true)
  const ready = signal(false)
  const editorOn = signal(false)
  const hit = signal(-1)
  const fired = signal(0)
  const out = signal('Click here, then press a shortcut.')

  let root: HTMLElement | null = null
  let boxEl: HTMLElement | null = null
  let observer: MutationObserver | undefined
  let hitTimer: ReturnType<typeof setTimeout> | undefined

  const stop = () => {
    observer?.disconnect()
    if (hitTimer !== undefined) clearTimeout(hitTimer)
    alive.set(false)
  }
  onMount(() => {
    ready.set(true)
    observer = new MutationObserver(() => {
      if (!root?.isConnected) stop()
    })
    observer.observe(document.body, { childList: true, subtree: true })
  })
  onUnmount(stop)

  const onHit = (i: number) => {
    const s = SHORTCUTS[i]
    if (!s) return
    fired.update((n) => n + 1)
    out.set(`fired: ${s.keys}  →  ${s.label}${s.how ? `  (${s.how})` : ''}`)
    hit.set(i)
    if (hitTimer !== undefined) clearTimeout(hitTimer)
    // The highlight fades after half a second; cleared on teardown.
    // pyreon-lint-disable-next-line pyreon/no-raw-setinterval
    hitTimer = setTimeout(() => hit.set(-1), 500)
  }
  const onIgnored = (key: string) => out.set(`${platformLabel(`mod+${key.toLowerCase()}`)} ignored: the editor scope is off`)

  const toggleScope = () => {
    editorOn.set(!editorOn.peek())
    boxEl?.focus()
  }

  return (
    <div
      ref={(e: Element | null) => {
        root = e as HTMLElement | null
      }}
    >
      <DemoGrid>
        <DemoPanel>
          <Box
            tabIndex={0}
            aria-label="Hotkeys demo: focus here and press keys"
            ref={(e: Element | null) => {
              boxEl = e as HTMLElement | null
            }}
          >
            <Head>
              <Eyebrow>registered shortcuts</Eyebrow>
              <ScopeToggle type="button" aria-pressed={() => (editorOn() ? 'true' : 'false')} onClick={toggleScope}>
                {() => `editor scope: ${editorOn() ? 'on' : 'off'}`}
              </ScopeToggle>
            </Head>
            <Grid>
              <For each={SHORTCUTS.map((s, i) => ({ s, i }))} by={(e) => e.s.keys}>
                {(e) => (
                  // The compiler wraps this read in _rp(), so the row re-styles on a hit or a scope change.
                  // pyreon-lint-disable-next-line pyreon/no-signal-in-props
                  <Row state={hit() === e.i ? 'hit' : e.s.scope && !editorOn() ? 'off' : 'idle'}>
                    <span>
                      {e.s.label}
                      {e.s.scope ? <small> · editor</small> : null}
                    </span>
                    <kbd>{() => (ready() ? platformLabel(e.s.keys) : neutralLabel(e.s.keys))}</kbd>
                  </Row>
                )}
              </For>
            </Grid>
            <Out aria-live="polite">{() => out()}</Out>
          </Box>
        </DemoPanel>
        <DemoPanel note="Shortcuts are ignored while typing in a field, and a held key's auto-repeat can be skipped with ignoreRepeat.">
          <Stack>
            <CodeBlock code={SOURCE} label="The bindings behind the box" />
            <Meters
              label="Hotkey state"
              items={[
                { label: 'shortcuts fired', value: () => fired() },
                { label: 'active scopes', value: () => (ready() ? [...getActiveScopes()()].join(', ') || 'global' : 'global') },
              ]}
            />
          </Stack>
        </DemoPanel>
      </DemoGrid>
      <Show when={() => alive()}>
        <Bindings box={() => boxEl} editorOn={() => editorOn()} onHit={onHit} onIgnored={onIgnored} />
      </Show>
      <Show when={() => alive() && editorOn()}>
        <EditorScope />
      </Show>
    </div>
  )
}
