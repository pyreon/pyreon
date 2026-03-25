import type { StyledFunction } from "@pyreon/styler"
import { css, keyframes, styled } from "@pyreon/styler"
import type { HTMLTags } from "./html"

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
    css: CSSEngineConnector["css"]
  }) => Record<string, (...args: any[]) => any>
}

type InitConfig = Partial<CSSEngineConnector & PlatformConfig>

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
  component: string | HTMLTags = "div"
  textComponent: string | HTMLTags = "span"
  createMediaQueries: PlatformConfig["createMediaQueries"] = undefined

  init = (props: InitConfig) => {
    if (props.css) this.css = props.css
    if (props.styled) this.styled = props.styled
    if (props.keyframes) this.keyframes = props.keyframes
    if (props.component) this.component = props.component
    if (props.textComponent) this.textComponent = props.textComponent
    if (props.createMediaQueries) this.createMediaQueries = props.createMediaQueries
  }
}

const config = new Configuration()
const { init } = config

export default config
export { init }
