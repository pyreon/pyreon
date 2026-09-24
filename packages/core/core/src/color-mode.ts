/**
 * The light/dark mode in scope — one source every package reads.
 *
 * Before this, four packages each owned a mode: `<PyreonUI mode>` (ui-core),
 * `<ChartThemeProvider mode>` and `systemChartMode()` (charts),
 * `useColorScheme()` (hooks, OS only) and zero's `theme` signal. None read
 * another, so an app wrapped in `<PyreonUI mode="dark">` still drew light
 * charts unless it also wired `<ChartThemeProvider mode={useMode}>`, and a
 * zero theme toggle never reached a chart. It lives here, in core, because
 * every consumer already depends on core — putting it anywhere else would add
 * a dependency edge to each of them.
 *
 * Resolution, nearest first: a `<ColorModeProvider>` / `provideColorMode()`
 * above the component (`<PyreonUI>` calls it), else the page's scheme — the
 * CSS `color-scheme` `<html>` declares, when it names exactly one — else the
 * OS preference; light on the server.
 */
import { computed, isClient, signal } from '@pyreon/reactivity'
import type { Signal } from '@pyreon/reactivity'
import { nativeCompat } from './compat-marker'
import { createContext, provide, useContext } from './context'
import type { VNodeChild } from './types'

export type ColorMode = 'light' | 'dark'
/** A mode to provide: a fixed one, or `'system'` to follow the page and the OS. */
export type ColorModeInput = ColorMode | 'system'

let _system: Signal<ColorMode> | null = null

/**
 * The page's own mode as a signal: the scheme `<html>` declares, else the OS
 * preference (`prefers-color-scheme`); light on the server.
 *
 * One document-lifetime listener and observer on a module singleton, created
 * on first read — never per component. A theme toggle flips an attribute on
 * `<html>` (class / `data-theme` / style), and the observer re-reads the
 * declared scheme then.
 */
export function systemColorMode(): () => ColorMode {
  if (_system === null) {
    const s = signal<ColorMode>('light')
    _system = s
    if (isClient && typeof window.matchMedia === 'function') {
      // The scheme `<html>` declares through CSS `color-scheme` when it names
      // exactly one (`dark` / `light`, optionally `only …`); null otherwise. A
      // site with its own theme toggle states its scheme there (it is also
      // what makes native form controls and scrollbars match), and a component
      // should agree with the page it sits on rather than with an OS setting
      // the page overrode.
      const pageScheme = (): ColorMode | null => {
        const cs = getComputedStyle(document.documentElement).colorScheme.trim()
        if (cs === 'dark' || cs === 'only dark') return 'dark'
        if (cs === 'light' || cs === 'only light') return 'light'
        return null
      }
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      let osDark = mq.matches
      const update = (): void => s.set(pageScheme() ?? (osDark ? 'dark' : 'light'))
      update()
      // pyreon-lint-ignore pyreon/no-raw-addeventlistener
      mq.addEventListener('change', (e) => {
        osDark = e.matches
        update()
      })
      // Every environment with `matchMedia` has MutationObserver.
      new MutationObserver(update).observe(document.documentElement, { attributes: true })
    }
  }
  return _system
}

/**
 * A plain context holding an ACCESSOR, not a reactive context: its default
 * must itself be live (the system scheme can flip), and a reactive context's
 * default is a constant.
 */
const ColorModeContext = createContext<() => ColorMode>(() => systemColorMode()())

/**
 * The mode in scope, as an accessor. Call it inside an effect, a computed or
 * JSX to follow a flip; calling it once at setup reads it once.
 *
 * @example
 * const mode = useColorMode()
 * return <div class={() => (mode() === 'dark' ? 'is-dark' : 'is-light')} />
 */
export function useColorMode(): () => ColorMode {
  return useContext(ColorModeContext)
}

/**
 * Provide a mode to every component below the caller. `'system'` follows the
 * page and the OS; an accessor makes it reactive. Returns the resolved mode.
 *
 * @example
 * // in a layout component
 * const dark = signal(false)
 * provideColorMode(() => (dark() ? 'dark' : 'light'))
 */
export function provideColorMode(mode: ColorModeInput | (() => ColorModeInput)): () => ColorMode {
  const resolved = computed<ColorMode>(() => {
    const m = typeof mode === 'function' ? mode() : mode
    return m === 'system' ? systemColorMode()() : m
  })
  const read = (): ColorMode => resolved()
  provide(ColorModeContext, read)
  return read
}

export interface ColorModeProviderProps {
  /** `'light'`, `'dark'` or `'system'`, or an accessor over one. */
  mode: ColorModeInput | (() => ColorModeInput)
  children?: VNodeChild
}

function ColorModeProviderImpl(props: ColorModeProviderProps): VNodeChild {
  provideColorMode(() => {
    const m = props.mode
    return typeof m === 'function' ? m() : m
  })
  return props.children
}

/**
 * Sets the mode for a subtree — the component form of `provideColorMode`.
 * `<PyreonUI mode>` provides it too, so an app using the UI system needs
 * neither.
 *
 * @example
 * <ColorModeProvider mode="dark">
 *   <Chart data={rows} x="month"><Line y="revenue" /></Chart>
 * </ColorModeProvider>
 */
export const ColorModeProvider = /* @__PURE__ */ nativeCompat(ColorModeProviderImpl)
