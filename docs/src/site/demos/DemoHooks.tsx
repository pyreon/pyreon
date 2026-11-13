import { For, onMount } from '@pyreon/core'
import {
  useClipboard,
  useColorScheme,
  useDocumentVisibility,
  useIdle,
  useOnline,
  useTimeAgo,
  useToggle,
  useWindowResize,
} from '@pyreon/hooks'
import { signal } from '@pyreon/reactivity'
import { font, radius, text } from '../theme'
import { el, tone, txt } from '../kit/bases'
import { DemoSurface, GlowCard } from '../kit/cards'
import { PaperActions, PaperMono, PaperRow } from '../kit/demo-parts'
import { DemoGrid, PaperButton } from '../kit/demo'
import { Eyebrow } from '../kit/type'

/**
 * Hooks demo (`hooks.json` → demo): eight real `@pyreon/hooks` reading this
 * browser live (go offline, switch the OS colour scheme, resize, switch
 * tabs, stop moving for three seconds). Every listener they attach is
 * removed when the island unmounts; there is no cleanup code here.
 *
 * Values that exist only in a browser (window size, colour scheme, online,
 * visibility) render a neutral "…" until mount, so the first client render
 * matches the server HTML.
 *
 * The catalogue beside it lists every hook `@pyreon/hooks` exports (65,
 * checked against packages/fundamentals/hooks/src/index.ts).
 */
const CATALOGUE: readonly { group: string; hooks: readonly string[] }[] = [
  { group: 'state', hooks: ['useToggle', 'useCounter', 'usePrevious', 'useLatest', 'useControllableState'] },
  {
    group: 'DOM',
    hooks: ['useEventListener', 'useClickOutside', 'useFocus', 'useHover', 'useFocusTrap', 'useFocusReturn', 'useInertOthers', 'useElementSize', 'useWindowResize', 'useWindowScroll', 'useScrollLock', 'useIntersection', 'useInfiniteScroll'],
  },
  { group: 'responsive', hooks: ['useBreakpoint', 'useMediaQuery', 'useColorScheme', 'useSizeClass', 'useReducedMotion'] },
  { group: 'timing', hooks: ['useDebouncedValue', 'useDebouncedCallback', 'useThrottledCallback', 'useInterval', 'useTimeout', 'useTimeAgo'] },
  {
    group: 'device',
    hooks: [
      'useClipboard', 'useHaptics', 'useShare', 'useLinking', 'useNotifications', 'useBiometrics', 'useImagePicker', 'useFilePicker', 'useCamera', 'useAudioRecorder', 'useBluetooth', 'useWakeLock',
      'useSpeech', 'useDeviceMotion', 'useScreenOrientation', 'useSafeArea', 'useDeviceInfo', 'useKeyboard', 'useOnline', 'useAppState', 'useDocumentVisibility', 'useIdle', 'useDialog', 'useCrashReporter',
    ],
  },
  { group: 'data', hooks: ['useFetch', 'useAuth', 'useDatabase', 'useGeolocation', 'useMap', 'useWebSocket', 'useSecureStorage', 'usePush', 'usePayments'] },
  { group: 'composition', hooks: ['useMergedRef', 'useUpdateEffect', 'useIsomorphicLayoutEffect'] },
]
const TOTAL = CATALOGUE.reduce((n, g) => n + g.hooks.length, 0)

const Value = txt
  .config({ name: 'HookValue' })
  .attrs({ tag: 'b' })
  .theme(() => ({ fontFamily: font.mono, fontSize: 13, fontWeight: 600, extendCss: 'font-variant-numeric: tabular-nums;' }))

const Group = el.config({ name: 'HookGroup' }).attrs({ block: true, gap: 8 }).theme(() => ({ minWidth: 0, extendCss: '& > h3 { margin: 0; }' }))

const Chips = el
  .config({ name: 'HookChips' })
  .attrs({ tag: 'ul', block: true, contentDirection: 'inline', gap: 6 })
  .theme(() => ({ flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0 }))

const HookChip = txt
  .config({ name: 'HookChip' })
  .attrs({ tag: 'li' })
  .theme((_t, m) => ({
    paddingTop: 3,
    paddingBottom: 3,
    paddingLeft: 8,
    paddingRight: 8,
    border: '1px solid',
    borderColor: tone(m, 'line'),
    borderRadius: radius.pill,
    fontFamily: font.mono,
    fontSize: text.mono.size - 1,
    color: tone(m, 'mist'),
  }))
  .states((_t, m) => ({ idle: {}, live: { color: tone(m, 'accentText'), borderColor: tone(m, 'currentBorder') } }))

const Catalogue = el
  .config({ name: 'HookCatalogue' })
  .attrs({ block: true, gap: 16, contentAlignY: 'top' })
  .theme(() => ({ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }))

const LIVE = new Set(['useOnline', 'useColorScheme', 'useWindowResize', 'useDocumentVisibility', 'useIdle', 'useTimeAgo', 'useToggle', 'useClipboard'])

export default function DemoHooks() {
  const mounted = signal(false)
  onMount(() => {
    mounted.set(true)
  })
  const loaded = Date.now()

  const online = useOnline()
  const scheme = useColorScheme()
  const size = useWindowResize()
  const visibility = useDocumentVisibility()
  const idle = useIdle(3000)
  const ago = useTimeAgo(loaded)
  const toggle = useToggle(false)
  const { copy, copied } = useClipboard()

  // Browser-only values wait for mount so hydration matches the server HTML.
  const live = (read: () => string) => () => (mounted() ? read() : '…')

  const rows: readonly { hook: string; value: () => string }[] = [
    { hook: 'useOnline()', value: live(() => String(online())) },
    { hook: 'useColorScheme()', value: live(() => scheme()) },
    { hook: 'useWindowResize()', value: live(() => `${size().width} × ${size().height}`) },
    { hook: 'useDocumentVisibility()', value: live(() => visibility()) },
    { hook: 'useIdle(3000)', value: live(() => String(idle())) },
    { hook: 'useTimeAgo(loaded)', value: live(() => ago()) },
  ]

  return (
    <DemoGrid>
      <DemoSurface aria-label="Hooks reading this browser">
        {/* Not a live region: idle and time-ago change every few seconds. */}
        <div>
          <For each={rows} by={(r) => r.hook}>
            {(r) => (
              <PaperRow>
                <PaperMono>{r.hook}</PaperMono>
                <Value>{() => r.value()}</Value>
              </PaperRow>
            )}
          </For>
        </div>
        <PaperActions>
          <PaperButton type="button" aria-pressed={() => (toggle.value() ? 'true' : 'false')} onClick={toggle.toggle}>
            {() => `useToggle() · ${toggle.value() ? 'on' : 'off'}`}
          </PaperButton>
          <PaperButton type="button" onClick={() => void copy('bun add @pyreon/hooks')}>
            {() => (copied() ? 'copied: bun add @pyreon/hooks' : 'useClipboard().copy')}
          </PaperButton>
        </PaperActions>
      </DemoSurface>
      <GlowCard padding="compact">
        <Eyebrow>{`all hooks · ${TOTAL}`}</Eyebrow>
        <Catalogue tabIndex={0} aria-label={`All ${TOTAL} hooks by category`}>
          <For each={CATALOGUE} by={(g) => g.group}>
            {(g) => (
              <Group>
                <Eyebrow tag="h3">{`${g.group} · ${g.hooks.length}`}</Eyebrow>
                <Chips>
                  <For each={g.hooks} by={(h) => h}>
                    {(h) => <HookChip state={LIVE.has(h) ? 'live' : 'idle'}>{h}</HookChip>}
                  </For>
                </Chips>
              </Group>
            )}
          </For>
        </Catalogue>
      </GlowCard>
    </DemoGrid>
  )
}
