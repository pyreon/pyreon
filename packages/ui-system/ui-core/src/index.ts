import { name as __pkgName, version as __pkgVersion } from '../package.json' with { type: 'json' }
import { registerSingleton } from '@pyreon/reactivity'

// Singleton sentinel — fail-loud detection of duplicate @pyreon/ui-core
// instances in the same heap. See @pyreon/reactivity/singleton-sentinel for
// full rationale. Hardcoded version is acceptable here — it's a diagnostic
// aid, not a load-bearing identity check.
registerSingleton(__pkgName, __pkgVersion, import.meta.url)

import compose from './compose'
import config, { init } from './config'
import type { CoreContextValue } from './context'
import Provider, { context } from './context'
import hoistNonReactStatics from './hoistNonReactStatics'
import type { HTMLElementAttrs, HTMLTagAttrsByTag, HTMLTags, HTMLTextTags } from './html'
import { HTML_TAGS, HTML_TEXT_TAGS } from './html'
import type { IsEmpty } from './isEmpty'
import isEmpty from './isEmpty'
import isEqual from './isEqual'
import { isPyreonComponent } from './isPyreonComponent'
import type { PyreonUIProps, ThemeMode, ThemeModeInput } from './PyreonUI'
import { PyreonUI, useMode } from './PyreonUI'
import type { Render } from './render'
import render from './render'
import { resolveSlot } from './resolveSlot'
import type { BreakpointKeys, Breakpoints } from './types'
import useStableValue from './useStableValue'
import { get, merge, omit, pick, set, throttle } from './utils'

export type { CSSEngineConnector, CssVariablesConfig, ResolvedCssVariablesConfig } from './config'
export { resolveCssVariables } from './config'
export type { CssVariablesPrePaintOptions } from './cssVariablesPrePaint'
export { cssVariablesPrePaintScript } from './cssVariablesPrePaint'
// Theme type + the theme-engine registration seam. `@pyreon/unistyle` registers
// its engine via `setThemeEngine` so `<PyreonUI>` can use it without ui-core
// depending on unistyle (breaks the ui-core ↔ unistyle cycle).
export type { PyreonTheme, ThemeEngine } from './theme-engine'
export { getThemeEngine, setThemeEngine } from './theme-engine'

export type {
  BreakpointKeys,
  Breakpoints,
  CoreContextValue,
  HTMLElementAttrs,
  HTMLTagAttrsByTag,
  HTMLTags,
  HTMLTextTags,
  IsEmpty,
  PyreonUIProps,
  Render,
  ThemeMode,
  ThemeModeInput,
}

export {
  compose,
  config,
  context,
  get,
  HTML_TAGS,
  HTML_TEXT_TAGS,
  hoistNonReactStatics,
  init,
  isEmpty,
  isEqual,
  isPyreonComponent,
  merge,
  omit,
  Provider,
  PyreonUI,
  pick,
  render,
  resolveSlot,
  set,
  throttle,
  useMode,
  useStableValue,
}
