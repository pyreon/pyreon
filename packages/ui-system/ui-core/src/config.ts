import type { StyledFunction } from '@pyreon/styler'
import { css, keyframes, styled } from '@pyreon/styler'
import type { HTMLTags } from './html'

/**
 * Describes the shape of the CSS-in-JS engine.
 * Pyreon uses @pyreon/styler directly — no connector abstraction needed.
 * This type is kept for API compatibility with downstream packages.
 */
export interface CSSEngineConnector {
  css: typeof css
  styled: typeof styled
  keyframes: typeof keyframes
}

interface PlatformConfig {
  component: string | HTMLTags
  textComponent: string | HTMLTags
  createMediaQueries?: (props: {
    breakpoints: Record<string, number>
    rootSize: number
    css: CSSEngineConnector['css']
  }) => Record<string, (...args: any[]) => any>
}

/**
 * Options for the opt-in CSS-variables theming mode.
 * `init({ cssVariables: true })` enables it with the defaults.
 */
export interface CssVariablesConfig {
  /** Custom-property prefix: `--<prefix>-<path>`. Default `'px'`. */
  prefix?: string
  /**
   * Attribute carrying the active mode (set on `<html>` by the root
   * `PyreonUI`, and on the `display: contents` wrapper of nested
   * inversed / explicit-mode providers). Default `'data-theme'`.
   */
  attribute?: string
}

/** Resolved (defaulted) view of the cssVariables config. */
export interface ResolvedCssVariablesConfig {
  enabled: boolean
  prefix: string
  attribute: string
}

type InitConfig = Partial<
  CSSEngineConnector &
    PlatformConfig & { cssVariables: boolean | CssVariablesConfig; styleExtraction: boolean }
>

/**
 * Configuration singleton that bridges the UI system with the CSS engine.
 * All packages reference config.css, config.styled, etc.
 *
 * In Pyreon, the engine is @pyreon/styler and is available immediately —
 * no lazy initialization or connector pattern needed.
 */
class Configuration {
  css = css
  styled: StyledFunction = styled
  keyframes = keyframes
  component: string | HTMLTags = 'div'
  textComponent: string | HTMLTags = 'span'
  createMediaQueries: PlatformConfig['createMediaQueries'] = undefined
  /**
   * Opt-in CSS-variables theming mode (the ui-system-wide switch).
   *
   * When enabled: `PyreonUI` autogenerates custom properties from the
   * theme JSON (unistyle's `themeToCssVars`) and injects the `:root`
   * block once; rocketstyle's `mode(a, b)` pairs become hashed var pairs
   * resolved by the `data-theme` attribute; theme resolution turns
   * mode-FREE and a dark/light flip is a single attribute write — no
   * re-resolution, no className churn.
   *
   * Set BEFORE the first render (app boot) — theme-resolution caches
   * assume the flag does not flip mid-session.
   */
  cssVariables: boolean | CssVariablesConfig = false

  /**
   * Opt-in Custom-Property Style Extraction for the default styled/Element
   * pipeline. When true, `PyreonUI` wires `@pyreon/styler`'s `setStyleExtraction`
   * (injecting unistyle's `cpseRewrite`) so non-reactive styled components emit a
   * value-agnostic CSS rule + per-instance inline custom properties (O(1) rules).
   * Off (default) = byte-identical classic path. Set BEFORE first render.
   */
  styleExtraction = false

  init = (props: InitConfig) => {
    if (props.css) this.css = props.css
    if (props.styled) this.styled = props.styled
    if (props.keyframes) this.keyframes = props.keyframes
    if (props.component) this.component = props.component
    if (props.textComponent) this.textComponent = props.textComponent
    if (props.createMediaQueries) this.createMediaQueries = props.createMediaQueries
    if (props.cssVariables !== undefined) this.cssVariables = props.cssVariables
    if (props.styleExtraction !== undefined) this.styleExtraction = props.styleExtraction
  }
}

const config = new Configuration()
const { init } = config

/**
 * Resolved view of `config.cssVariables` with defaults applied — the one
 * accessor every var-mode consumer (`PyreonUI`, rocketstyle's mode-pair
 * factory) reads, so defaulting lives in exactly one place.
 */
export function resolveCssVariables(): ResolvedCssVariablesConfig {
  const raw = config.cssVariables
  if (raw === false) return { enabled: false, prefix: 'px', attribute: 'data-theme' }
  const opts = raw === true ? {} : raw
  return {
    enabled: true,
    prefix: opts.prefix ?? 'px',
    attribute: opts.attribute ?? 'data-theme',
  }
}

/** Resolved view of `config.styleExtraction` — read by `PyreonUI` to wire
 * styler's CPSE hook. Defaulting lives in one place. */
export function resolveStyleExtraction(): boolean {
  return config.styleExtraction === true
}

export default config
export { init }
