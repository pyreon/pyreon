/**
 * The active locale and time zone of the reactive entry.
 *
 * Resolution order for the locale: explicit `options.locale` → the nearest
 * `provideLocale` (owner-based context on the client, request-scoped on the
 * server) → the app default set by `setLocale` → `navigator.language` on the
 * client / the runtime default on the server. The time zone follows the same
 * order with `setTimeZone` / `provideTimeZone`, ending at the runtime zone.
 *
 * The app default is a signal, so a formatter read inside an effect, computed
 * or JSX accessor re-runs when it changes. The provided value is an accessor
 * (`createReactiveContext`), so a signal-backed provider is tracked as well.
 *
 * Per-request isolation: nothing here is written during a render. The app
 * default is client-only (`setLocale` is a warned no-op on the server) and the
 * provided value lives in the request-scoped context stack, so one request's
 * locale is never visible to another.
 */
import { createReactiveContext, provide, useContext } from '@pyreon/core'
import { getContextOwner, isServer, signal } from '@pyreon/reactivity'
import { programmerError, warnOnce } from './warn'

const LocaleContext = createReactiveContext<string | undefined>(undefined)
const ZoneContext = createReactiveContext<string | undefined>(undefined)

const appLocale = /* @__PURE__ */ signal<string | undefined>(undefined)
const appZone = /* @__PURE__ */ signal<string | undefined>(undefined)

/** Set once a `provideLocale` / `provideTimeZone` has ever run: until then the context lookup is skipped entirely. */
let localeProvided = false
let zoneProvided = false

let runtimeLocale: string | undefined
let runtimeZone: string | undefined

function runtimeDefaultLocale(): string {
  if (runtimeLocale === undefined) {
    runtimeLocale =
      !isServer && typeof navigator !== 'undefined' && typeof navigator.language === 'string' && navigator.language !== ''
        ? navigator.language
        : new Intl.DateTimeFormat().resolvedOptions().locale
  }
  return runtimeLocale
}

function runtimeDefaultZone(): string {
  return (runtimeZone ??= new Intl.DateTimeFormat().resolvedOptions().timeZone)
}

/** Test hook: forget the memoized runtime defaults and the provide flags. */
export function _resetLocaleState(): void {
  runtimeLocale = undefined
  runtimeZone = undefined
  localeProvided = false
  zoneProvided = false
  appLocale.set(undefined)
  appZone.set(undefined)
}

/** The active locale. A reactive read. */
export function locale(): string {
  if (localeProvided) {
    const provided = useContext(LocaleContext)()
    if (provided !== undefined) return provided
  }
  const app = appLocale()
  return app !== undefined ? app : runtimeDefaultLocale()
}

/**
 * The active zone as a formatter argument: `''` means "the runtime zone"
 * (what `Intl` uses when told nothing), so the hot path never builds a name.
 */
export function activeZone(): string {
  if (zoneProvided) {
    const provided = useContext(ZoneContext)()
    if (provided !== undefined) return provided
  }
  return appZone() ?? ''
}

/** The active IANA time zone. A reactive read. */
export function timeZone(): string {
  const z = activeZone()
  return z !== '' ? z : runtimeDefaultZone()
}

function canonicalLocale(tag: string, fn: string): string {
  try {
    const [canonical] = Intl.getCanonicalLocales(tag)
    if (canonical !== undefined) return canonical
  } catch {
    // fall through to the error below
  }
  throw programmerError(fn, `${JSON.stringify(tag)} is not a valid BCP 47 locale tag. Use a tag such as "en-US" or "cs" (underscores are not valid).`)
}

function checkedZone(zone: string, fn: string): string {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: zone })
    return zone
  } catch {
    throw programmerError(fn, `${JSON.stringify(zone)} is not an IANA time zone name. Use a name such as "Europe/Prague", "America/Los_Angeles" or "UTC".`)
  }
}

/** Set the app-level default locale (client). On the server this is a no-op with a dev warning: use `provideLocale`. */
export function setLocale(tag: string): void {
  if (isServer) {
    warnOnce('setLocale:server', '[Pyreon] setLocale() does nothing on the server (one process serves many requests). Call provideLocale() in the root component instead.')
    return
  }
  appLocale.set(canonicalLocale(tag, 'setLocale'))
}

/** Set the app-level default time zone (client). On the server this is a no-op with a dev warning: use `provideTimeZone`. */
export function setTimeZone(zone: string): void {
  if (isServer) {
    warnOnce('setTimeZone:server', '[Pyreon] setTimeZone() does nothing on the server (one process serves many requests). Call provideTimeZone() in the root component instead.')
    return
  }
  appZone.set(checkedZone(zone, 'setTimeZone'))
}

function constant(value: string): () => string {
  return () => value
}

function warnOutsideComponent(fn: string): void {
  if (process.env.NODE_ENV !== 'production' && !isServer && getContextOwner() === null) {
    warnOnce(`${fn}:outside`, `[Pyreon] ${fn}() was called outside a component, so it applies to the whole page for good. Call it in a component's setup to scope a subtree, or use ${fn === 'provideLocale' ? 'setLocale' : 'setTimeZone'}() for the app default.`)
  }
}

/** Scope a subtree to a locale: a tag, or an accessor (`() => i18n.locale()`) that is tracked. Call it in a component's setup. */
export function provideLocale(tag: string | (() => string)): void {
  warnOutsideComponent('provideLocale')
  const value = typeof tag === 'function' ? tag : constant(canonicalLocale(tag, 'provideLocale'))
  localeProvided = true
  provide(LocaleContext, value)
}

/** Scope a subtree to a time zone: a name, or an accessor that is tracked. Call it in a component's setup. */
export function provideTimeZone(zone: string | (() => string)): void {
  warnOutsideComponent('provideTimeZone')
  const value = typeof zone === 'function' ? zone : constant(checkedZone(zone, 'provideTimeZone'))
  zoneProvided = true
  provide(ZoneContext, value)
}
