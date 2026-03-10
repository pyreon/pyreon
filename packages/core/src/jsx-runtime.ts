/**
 * JSX automatic runtime.
 *
 * When tsconfig has `"jsxImportSource": "@pyreon/core"`, the TS/bundler compiler
 * rewrites JSX to imports from this file automatically:
 *   <div class="x" />  →  jsx("div", { class: "x" })
 */
import { Fragment, h } from "./h"
import type { ComponentFn, Props, VNode, VNodeChild } from "./types"

export { Fragment }

export function jsx(
  type: string | ComponentFn | symbol,
  props: Props & { children?: VNodeChild | VNodeChild[] },
  key?: string | number | null,
): VNode {
  const { children, ...rest } = props
  const propsWithKey = (key != null ? { ...rest, key } : rest) as Props

  if (typeof type === "function") {
    // Component: keep children in props.children so the component function can access them.
    // Children must NOT be spread as h() rest args because mountComponent only passes vnode.props.
    const componentProps = children !== undefined ? { ...propsWithKey, children } : propsWithKey
    return h(type, componentProps)
  }

  // DOM element or symbol (Fragment, ForSymbol): children go in vnode.children
  const childArray = children === undefined ? [] : Array.isArray(children) ? children : [children]
  return h(type, propsWithKey, ...(childArray as VNodeChild[]))
}

// jsxs is called when there are multiple static children — same signature
export const jsxs = jsx

// ─── JSX types ────────────────────────────────────────────────────────────────

type Booleanish = boolean | "true" | "false"
type StyleValue = string | Partial<CSSStyleDeclaration>

/** Common HTML attributes accepted by all Pyreon elements */
interface PyreonHTMLAttributes {
  // Identity
  id?: string
  class?: string | (() => string)
  className?: string | (() => string)
  style?: StyleValue | (() => StyleValue)
  // pyreon-specific directives
  "n-show"?: boolean | (() => boolean)
  // Accessible
  role?: string
  tabIndex?: number | (() => number)
  title?: string
  lang?: string
  dir?: "ltr" | "rtl" | "auto"
  hidden?: boolean | (() => boolean)
  draggable?: Booleanish
  // ARIA
  "aria-label"?: string | (() => string)
  "aria-hidden"?: Booleanish | (() => Booleanish)
  "aria-disabled"?: Booleanish | (() => Booleanish)
  "aria-expanded"?: Booleanish | (() => Booleanish)
  "aria-selected"?: Booleanish | (() => Booleanish)
  "aria-checked"?: Booleanish | "mixed" | (() => Booleanish | "mixed")
  "aria-current"?: Booleanish | "page" | "step" | "location" | "date" | "time"
  "aria-live"?: "off" | "assertive" | "polite"
  "aria-atomic"?: Booleanish
  "aria-busy"?: Booleanish
  "aria-controls"?: string
  "aria-describedby"?: string
  "aria-labelledby"?: string
  "aria-placeholder"?: string
  "aria-required"?: Booleanish | (() => Booleanish)
  "aria-invalid"?: Booleanish | "grammar" | "spelling"
  "aria-valuemin"?: number
  "aria-valuemax"?: number
  "aria-valuenow"?: number
  "aria-valuetext"?: string
  "aria-haspopup"?: Booleanish | "menu" | "listbox" | "tree" | "grid" | "dialog"
  "aria-posinset"?: number
  "aria-setsize"?: number
  "aria-level"?: number
  "aria-multiline"?: Booleanish
  "aria-multiselectable"?: Booleanish
  "aria-orientation"?: "horizontal" | "vertical"
  "aria-readonly"?: Booleanish | (() => Booleanish)
  "aria-sort"?: "none" | "ascending" | "descending" | "other"
  "aria-autocomplete"?: "none" | "inline" | "list" | "both"
  "aria-colcount"?: number
  "aria-colindex"?: number
  "aria-colspan"?: number
  "aria-rowcount"?: number
  "aria-rowindex"?: number
  "aria-rowspan"?: number
  // DOM lifecycle ref
  ref?: { current: unknown }
  // Key for list reconciliation
  key?: string | number
  // innerHTML
  innerHTML?: string
  dangerouslySetInnerHTML?: { __html: string }
  // Events
  onClick?: (e: MouseEvent) => void
  onDblClick?: (e: MouseEvent) => void
  onMouseDown?: (e: MouseEvent) => void
  onMouseUp?: (e: MouseEvent) => void
  onMouseEnter?: (e: MouseEvent) => void
  onMouseLeave?: (e: MouseEvent) => void
  onMouseMove?: (e: MouseEvent) => void
  onMouseOver?: (e: MouseEvent) => void
  onMouseOut?: (e: MouseEvent) => void
  onContextMenu?: (e: MouseEvent) => void
  onKeyDown?: (e: KeyboardEvent) => void
  onKeyUp?: (e: KeyboardEvent) => void
  onKeyPress?: (e: KeyboardEvent) => void
  onFocus?: (e: FocusEvent) => void
  onBlur?: (e: FocusEvent) => void
  onChange?: (e: Event) => void
  onInput?: (e: InputEvent) => void
  onSubmit?: (e: SubmitEvent) => void
  onReset?: (e: Event) => void
  onScroll?: (e: Event) => void
  onWheel?: (e: WheelEvent) => void
  onDragStart?: (e: DragEvent) => void
  onDragEnd?: (e: DragEvent) => void
  onDragOver?: (e: DragEvent) => void
  onDragEnter?: (e: DragEvent) => void
  onDragLeave?: (e: DragEvent) => void
  onDrop?: (e: DragEvent) => void
  onTouchStart?: (e: TouchEvent) => void
  onTouchEnd?: (e: TouchEvent) => void
  onTouchMove?: (e: TouchEvent) => void
  onPointerDown?: (e: PointerEvent) => void
  onPointerUp?: (e: PointerEvent) => void
  onPointerMove?: (e: PointerEvent) => void
  onPointerEnter?: (e: PointerEvent) => void
  onPointerLeave?: (e: PointerEvent) => void
  onPointerCancel?: (e: PointerEvent) => void
  onPointerOver?: (e: PointerEvent) => void
  onPointerOut?: (e: PointerEvent) => void
  onTransitionEnd?: (e: TransitionEvent) => void
  onAnimationStart?: (e: AnimationEvent) => void
  onAnimationEnd?: (e: AnimationEvent) => void
  onAnimationIteration?: (e: AnimationEvent) => void
  onLoad?: (e: Event) => void
  onError?: (e: Event | string) => void
  onAbort?: (e: Event) => void
  onSelect?: (e: Event) => void
  onCopy?: (e: ClipboardEvent) => void
  onCut?: (e: ClipboardEvent) => void
  onPaste?: (e: ClipboardEvent) => void
  // Catch-all for data-* and other arbitrary attributes
  [key: string]: unknown
}

/** Attributes specific to form inputs */
interface InputAttributes extends PyreonHTMLAttributes {
  type?: string | (() => string)
  value?: string | number | (() => string | number)
  defaultValue?: string | number
  checked?: boolean | (() => boolean)
  defaultChecked?: boolean
  placeholder?: string | (() => string)
  disabled?: boolean | (() => boolean)
  readOnly?: boolean
  required?: boolean | (() => boolean)
  min?: string | number
  max?: string | number
  step?: string | number
  minLength?: number
  maxLength?: number
  pattern?: string
  multiple?: boolean
  name?: string
  accept?: string
  autoComplete?: string
  autoFocus?: boolean
  form?: string
  list?: string
  size?: number
  src?: string | (() => string)
  alt?: string
  width?: number | string
  height?: number | string
}

interface AnchorAttributes extends PyreonHTMLAttributes {
  href?: string | (() => string)
  target?: "_blank" | "_self" | "_parent" | "_top" | string
  rel?: string
  download?: string | boolean
}

interface ButtonAttributes extends PyreonHTMLAttributes {
  type?: "button" | "submit" | "reset"
  disabled?: boolean | (() => boolean)
  name?: string
  value?: string
  form?: string
  formAction?: string
  formMethod?: string
  formEncType?: string
  formNoValidate?: boolean
  formTarget?: string
}

interface TextareaAttributes extends PyreonHTMLAttributes {
  value?: string | (() => string)
  defaultValue?: string
  placeholder?: string | (() => string)
  disabled?: boolean | (() => boolean)
  readOnly?: boolean
  required?: boolean | (() => boolean)
  rows?: number
  cols?: number
  minLength?: number
  maxLength?: number
  name?: string
  autoFocus?: boolean
  form?: string
  wrap?: "hard" | "soft"
}

interface SelectAttributes extends PyreonHTMLAttributes {
  value?: string | string[] | (() => string | string[])
  defaultValue?: string | string[]
  disabled?: boolean | (() => boolean)
  required?: boolean | (() => boolean)
  multiple?: boolean
  name?: string
  size?: number
  form?: string
  autoFocus?: boolean
}

interface OptionAttributes extends PyreonHTMLAttributes {
  value?: string | number | (() => string | number)
  disabled?: boolean | (() => boolean)
  selected?: boolean | (() => boolean)
  label?: string
}

interface FormAttributes extends PyreonHTMLAttributes {
  action?: string
  method?: "get" | "post"
  encType?: string
  noValidate?: boolean
  target?: string
  name?: string
  autoComplete?: string
}

interface ImgAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  alt?: string | (() => string)
  width?: number | string | (() => number | string)
  height?: number | string | (() => number | string)
  loading?: "lazy" | "eager"
  decoding?: "auto" | "async" | "sync"
  crossOrigin?: "anonymous" | "use-credentials"
  referrerPolicy?: string
  srcSet?: string
  sizes?: string
}

interface VideoAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  width?: number | string
  height?: number | string
  controls?: boolean
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  poster?: string
  preload?: "none" | "metadata" | "auto"
  playsInline?: boolean
  crossOrigin?: "anonymous" | "use-credentials"
}

interface AudioAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  controls?: boolean
  autoPlay?: boolean
  muted?: boolean
  loop?: boolean
  preload?: "none" | "metadata" | "auto"
  crossOrigin?: "anonymous" | "use-credentials"
}

interface LabelAttributes extends PyreonHTMLAttributes {
  htmlFor?: string
  for?: string
  form?: string
}

interface ThAttributes extends PyreonHTMLAttributes {
  colSpan?: number
  rowSpan?: number
  scope?: "col" | "row" | "colgroup" | "rowgroup"
  abbr?: string
  headers?: string
}

interface TdAttributes extends PyreonHTMLAttributes {
  colSpan?: number
  rowSpan?: number
  headers?: string
}

interface ColAttributes extends PyreonHTMLAttributes {
  span?: number
}

interface IframeAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  width?: number | string
  height?: number | string
  allow?: string
  allowFullScreen?: boolean
  loading?: "lazy" | "eager"
  name?: string
  sandbox?: string
  referrerPolicy?: string
  title?: string
}

interface LinkAttributes extends PyreonHTMLAttributes {
  href?: string | (() => string)
  rel?: string
  type?: string
  as?: string
  media?: string
  crossOrigin?: "anonymous" | "use-credentials"
  integrity?: string
  referrerPolicy?: string
}

interface MetaAttributes extends PyreonHTMLAttributes {
  name?: string
  content?: string | (() => string)
  httpEquiv?: string
  charset?: string
  property?: string
}

interface ScriptAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  type?: string
  async?: boolean
  defer?: boolean
  crossOrigin?: "anonymous" | "use-credentials"
  integrity?: string
  noModule?: boolean
  referrerPolicy?: string
}

interface SourceAttributes extends PyreonHTMLAttributes {
  src?: string | (() => string)
  type?: string
  srcSet?: string
  sizes?: string
  media?: string
}

interface ProgressAttributes extends PyreonHTMLAttributes {
  value?: number | (() => number)
  max?: number
}

interface MeterAttributes extends PyreonHTMLAttributes {
  value?: number | (() => number)
  min?: number
  max?: number
  low?: number
  high?: number
  optimum?: number
}

interface DetailsAttributes extends PyreonHTMLAttributes {
  open?: boolean | (() => boolean)
}

interface DialogAttributes extends PyreonHTMLAttributes {
  open?: boolean | (() => boolean)
}

interface OlAttributes extends PyreonHTMLAttributes {
  start?: number
  reversed?: boolean
  type?: "1" | "a" | "A" | "i" | "I"
}

interface SvgAttributes extends PyreonHTMLAttributes {
  viewBox?: string
  xmlns?: string
  fill?: string | (() => string)
  stroke?: string | (() => string)
  "stroke-width"?: string | number
  "stroke-linecap"?: "butt" | "round" | "square"
  "stroke-linejoin"?: "miter" | "round" | "bevel"
  "fill-rule"?: "nonzero" | "evenodd"
  "clip-rule"?: "nonzero" | "evenodd"
  "clip-path"?: string
  d?: string
  cx?: string | number
  cy?: string | number
  r?: string | number
  rx?: string | number
  ry?: string | number
  x?: string | number
  y?: string | number
  x1?: string | number
  y1?: string | number
  x2?: string | number
  y2?: string | number
  width?: string | number
  height?: string | number
  transform?: string | (() => string)
  opacity?: string | number | (() => string | number)
  points?: string
  "font-size"?: string | number
  "text-anchor"?: "start" | "middle" | "end"
  "dominant-baseline"?: string
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      // Document structure
      html: PyreonHTMLAttributes
      head: PyreonHTMLAttributes
      body: PyreonHTMLAttributes
      title: PyreonHTMLAttributes
      base: PyreonHTMLAttributes
      meta: MetaAttributes
      link: LinkAttributes
      script: ScriptAttributes
      style: PyreonHTMLAttributes
      noscript: PyreonHTMLAttributes
      // Sections
      main: PyreonHTMLAttributes
      header: PyreonHTMLAttributes
      footer: PyreonHTMLAttributes
      nav: PyreonHTMLAttributes
      aside: PyreonHTMLAttributes
      section: PyreonHTMLAttributes
      article: PyreonHTMLAttributes
      address: PyreonHTMLAttributes
      h1: PyreonHTMLAttributes
      h2: PyreonHTMLAttributes
      h3: PyreonHTMLAttributes
      h4: PyreonHTMLAttributes
      h5: PyreonHTMLAttributes
      h6: PyreonHTMLAttributes
      hgroup: PyreonHTMLAttributes
      // Block text
      p: PyreonHTMLAttributes
      pre: PyreonHTMLAttributes
      blockquote: PyreonHTMLAttributes
      figure: PyreonHTMLAttributes
      figcaption: PyreonHTMLAttributes
      div: PyreonHTMLAttributes
      hr: PyreonHTMLAttributes
      // Inline text
      span: PyreonHTMLAttributes
      a: AnchorAttributes
      em: PyreonHTMLAttributes
      strong: PyreonHTMLAttributes
      small: PyreonHTMLAttributes
      s: PyreonHTMLAttributes
      cite: PyreonHTMLAttributes
      q: PyreonHTMLAttributes
      abbr: PyreonHTMLAttributes
      time: PyreonHTMLAttributes
      code: PyreonHTMLAttributes
      var: PyreonHTMLAttributes
      samp: PyreonHTMLAttributes
      kbd: PyreonHTMLAttributes
      mark: PyreonHTMLAttributes
      sub: PyreonHTMLAttributes
      sup: PyreonHTMLAttributes
      i: PyreonHTMLAttributes
      b: PyreonHTMLAttributes
      u: PyreonHTMLAttributes
      bdi: PyreonHTMLAttributes
      bdo: PyreonHTMLAttributes
      br: PyreonHTMLAttributes
      wbr: PyreonHTMLAttributes
      ruby: PyreonHTMLAttributes
      rt: PyreonHTMLAttributes
      rp: PyreonHTMLAttributes
      // Lists
      ul: PyreonHTMLAttributes
      ol: OlAttributes
      li: PyreonHTMLAttributes
      dl: PyreonHTMLAttributes
      dt: PyreonHTMLAttributes
      dd: PyreonHTMLAttributes
      // Forms
      form: FormAttributes
      label: LabelAttributes
      input: InputAttributes
      button: ButtonAttributes
      select: SelectAttributes
      datalist: PyreonHTMLAttributes
      optgroup: PyreonHTMLAttributes
      option: OptionAttributes
      textarea: TextareaAttributes
      output: PyreonHTMLAttributes
      progress: ProgressAttributes
      meter: MeterAttributes
      fieldset: PyreonHTMLAttributes
      legend: PyreonHTMLAttributes
      // Tables
      table: PyreonHTMLAttributes
      caption: PyreonHTMLAttributes
      colgroup: PyreonHTMLAttributes
      col: ColAttributes
      thead: PyreonHTMLAttributes
      tbody: PyreonHTMLAttributes
      tfoot: PyreonHTMLAttributes
      tr: PyreonHTMLAttributes
      th: ThAttributes
      td: TdAttributes
      // Media
      img: ImgAttributes
      video: VideoAttributes
      audio: AudioAttributes
      source: SourceAttributes
      track: PyreonHTMLAttributes
      picture: PyreonHTMLAttributes
      canvas: PyreonHTMLAttributes
      svg: SvgAttributes
      path: SvgAttributes
      circle: SvgAttributes
      ellipse: SvgAttributes
      line: SvgAttributes
      polyline: SvgAttributes
      polygon: SvgAttributes
      rect: SvgAttributes
      text: SvgAttributes
      tspan: SvgAttributes
      g: SvgAttributes
      defs: SvgAttributes
      use: SvgAttributes & { href?: string }
      symbol: SvgAttributes
      clipPath: SvgAttributes
      mask: SvgAttributes
      marker: SvgAttributes
      pattern: SvgAttributes
      linearGradient: SvgAttributes
      radialGradient: SvgAttributes
      stop: SvgAttributes & {
        offset?: string | number
        "stop-color"?: string
        "stop-opacity"?: string | number
      }
      // Interactive / embedding
      details: DetailsAttributes
      summary: PyreonHTMLAttributes
      dialog: DialogAttributes
      iframe: IframeAttributes
      embed: PyreonHTMLAttributes
      object: PyreonHTMLAttributes
      param: PyreonHTMLAttributes
      // Semantic / misc
      menu: PyreonHTMLAttributes
      menuitem: PyreonHTMLAttributes
      template: PyreonHTMLAttributes
      slot: PyreonHTMLAttributes
      portal: PyreonHTMLAttributes
      // Catch-all for custom elements and data-* attrs
      [tagName: string]: PyreonHTMLAttributes
    }
  }
}
