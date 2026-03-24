/**
 * JSX automatic runtime.
 *
 * When tsconfig has `"jsxImportSource": "@pyreon/core"`, the TS/bundler compiler
 * rewrites JSX to imports from this file automatically:
 *   <div class="x" />  →  jsx("div", { class: "x" })
 */
import { Fragment, h } from "./h"
import type { ClassValue } from "./style"
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
export type CSSProperties = { [K in keyof CSSStyleDeclaration]?: string | number }
export type StyleValue = string | CSSProperties

/** Event with typed currentTarget — used in element-specific event handlers. */
export type TargetedEvent<T extends Element, E extends Event = Event> = E & {
  readonly currentTarget: T
}

/** Common HTML attributes accepted by all Pyreon elements */
export interface PyreonHTMLAttributes<E extends Element = HTMLElement> {
  // Identity
  id?: string | undefined
  class?: ClassValue | (() => ClassValue) | undefined
  className?: ClassValue | (() => ClassValue) | undefined
  style?: StyleValue | (() => StyleValue) | undefined
  // Accessible
  role?: string | undefined
  tabIndex?: number | (() => number) | undefined
  title?: string | undefined
  lang?: string | undefined
  dir?: "ltr" | "rtl" | "auto" | undefined
  hidden?: boolean | (() => boolean) | undefined
  draggable?: Booleanish | undefined
  // ARIA
  "aria-label"?: string | (() => string) | undefined
  "aria-hidden"?: Booleanish | (() => Booleanish) | undefined
  "aria-disabled"?: Booleanish | (() => Booleanish) | undefined
  "aria-expanded"?: Booleanish | (() => Booleanish) | undefined
  "aria-selected"?: Booleanish | (() => Booleanish) | undefined
  "aria-checked"?: Booleanish | "mixed" | (() => Booleanish | "mixed") | undefined
  "aria-current"?: Booleanish | "page" | "step" | "location" | "date" | "time" | undefined
  "aria-live"?: "off" | "assertive" | "polite" | undefined
  "aria-atomic"?: Booleanish | undefined
  "aria-busy"?: Booleanish | undefined
  "aria-controls"?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-labelledby"?: string | undefined
  "aria-placeholder"?: string | undefined
  "aria-required"?: Booleanish | (() => Booleanish) | undefined
  "aria-invalid"?: Booleanish | "grammar" | "spelling" | undefined
  "aria-valuemin"?: number | undefined
  "aria-valuemax"?: number | undefined
  "aria-valuenow"?: number | undefined
  "aria-valuetext"?: string | undefined
  "aria-haspopup"?: Booleanish | "menu" | "listbox" | "tree" | "grid" | "dialog" | undefined
  "aria-posinset"?: number | undefined
  "aria-setsize"?: number | undefined
  "aria-level"?: number | undefined
  "aria-multiline"?: Booleanish | undefined
  "aria-multiselectable"?: Booleanish | undefined
  "aria-orientation"?: "horizontal" | "vertical" | undefined
  "aria-readonly"?: Booleanish | (() => Booleanish) | undefined
  "aria-sort"?: "none" | "ascending" | "descending" | "other" | undefined
  "aria-autocomplete"?: "none" | "inline" | "list" | "both" | undefined
  "aria-colcount"?: number | undefined
  "aria-colindex"?: number | undefined
  "aria-colspan"?: number | undefined
  "aria-rowcount"?: number | undefined
  "aria-rowindex"?: number | undefined
  "aria-rowspan"?: number | undefined
  // DOM lifecycle ref — object ref or callback ref
  ref?: { current: E | null } | ((el: E | null) => void) | undefined
  // Key for list reconciliation
  key?: string | number | undefined
  // Children — allows null, undefined, boolean in JSX children positions
  children?: VNodeChild | VNodeChild[]
  // innerHTML
  innerHTML?: string | undefined
  dangerouslySetInnerHTML?: { __html: string } | undefined
  // Events — typed currentTarget via generic E
  onClick?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onDblClick?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseDown?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseUp?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseEnter?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseLeave?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseMove?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseOver?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onMouseOut?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onContextMenu?: ((e: TargetedEvent<E, MouseEvent>) => void) | undefined
  onKeyDown?: ((e: TargetedEvent<E, KeyboardEvent>) => void) | undefined
  onKeyUp?: ((e: TargetedEvent<E, KeyboardEvent>) => void) | undefined
  onKeyPress?: ((e: TargetedEvent<E, KeyboardEvent>) => void) | undefined
  onFocus?: ((e: TargetedEvent<E, FocusEvent>) => void) | undefined
  onBlur?: ((e: TargetedEvent<E, FocusEvent>) => void) | undefined
  onChange?: ((e: TargetedEvent<E>) => void) | undefined
  onInput?: ((e: TargetedEvent<E, InputEvent>) => void) | undefined
  onBeforeInput?: ((e: TargetedEvent<E, InputEvent>) => void) | undefined
  onSubmit?: ((e: TargetedEvent<E, SubmitEvent>) => void) | undefined
  onReset?: ((e: TargetedEvent<E>) => void) | undefined
  onInvalid?: ((e: TargetedEvent<E>) => void) | undefined
  onScroll?: ((e: TargetedEvent<E>) => void) | undefined
  onWheel?: ((e: TargetedEvent<E, WheelEvent>) => void) | undefined
  onResize?: ((e: TargetedEvent<E>) => void) | undefined
  onDragStart?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onDragEnd?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onDragOver?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onDragEnter?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onDragLeave?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onDrop?: ((e: TargetedEvent<E, DragEvent>) => void) | undefined
  onTouchStart?: ((e: TargetedEvent<E, TouchEvent>) => void) | undefined
  onTouchEnd?: ((e: TargetedEvent<E, TouchEvent>) => void) | undefined
  onTouchMove?: ((e: TargetedEvent<E, TouchEvent>) => void) | undefined
  onPointerDown?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerUp?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerMove?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerEnter?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerLeave?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerCancel?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerOver?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onPointerOut?: ((e: TargetedEvent<E, PointerEvent>) => void) | undefined
  onTransitionEnd?: ((e: TargetedEvent<E, TransitionEvent>) => void) | undefined
  onAnimationStart?: ((e: TargetedEvent<E, AnimationEvent>) => void) | undefined
  onAnimationEnd?: ((e: TargetedEvent<E, AnimationEvent>) => void) | undefined
  onAnimationIteration?: ((e: TargetedEvent<E, AnimationEvent>) => void) | undefined
  onToggle?: ((e: TargetedEvent<E>) => void) | undefined
  onLoad?: ((e: TargetedEvent<E>) => void) | undefined
  onError?: ((e: TargetedEvent<E> | string) => void) | undefined
  onAbort?: ((e: TargetedEvent<E>) => void) | undefined
  onSelect?: ((e: TargetedEvent<E>) => void) | undefined
  onCopy?: ((e: TargetedEvent<E, ClipboardEvent>) => void) | undefined
  onCut?: ((e: TargetedEvent<E, ClipboardEvent>) => void) | undefined
  onPaste?: ((e: TargetedEvent<E, ClipboardEvent>) => void) | undefined
  // data-* and aria-* catch-all (typed attributes above catch typos)
  [key: `data-${string}`]: unknown
  [key: `aria-${string}`]: unknown
}

/** Attributes specific to form inputs */
export interface InputAttributes extends PyreonHTMLAttributes<HTMLInputElement> {
  type?: string | (() => string) | undefined
  value?: string | number | (() => string | number) | undefined
  defaultValue?: string | number | undefined
  checked?: boolean | (() => boolean) | undefined
  defaultChecked?: boolean | undefined
  placeholder?: string | (() => string) | undefined
  disabled?: boolean | (() => boolean) | undefined
  readOnly?: boolean | undefined
  required?: boolean | (() => boolean) | undefined
  min?: string | number | undefined
  max?: string | number | undefined
  step?: string | number | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  pattern?: string | undefined
  multiple?: boolean | undefined
  name?: string | undefined
  accept?: string | undefined
  autoComplete?: string | undefined
  autoFocus?: boolean | undefined
  form?: string | undefined
  list?: string | undefined
  size?: number | undefined
  src?: string | (() => string) | undefined
  alt?: string | undefined
  width?: number | string | undefined
  height?: number | string | undefined
}

export interface AnchorAttributes extends PyreonHTMLAttributes<HTMLAnchorElement> {
  href?: string | (() => string) | undefined
  target?: "_blank" | "_self" | "_parent" | "_top" | string | undefined
  rel?: string | undefined
  download?: string | boolean | undefined
}

export interface ButtonAttributes extends PyreonHTMLAttributes<HTMLButtonElement> {
  type?: "button" | "submit" | "reset" | undefined
  disabled?: boolean | (() => boolean) | undefined
  name?: string | undefined
  value?: string | undefined
  form?: string | undefined
  formAction?: string | undefined
  formMethod?: string | undefined
  formEncType?: string | undefined
  formNoValidate?: boolean | undefined
  formTarget?: string | undefined
}

export interface TextareaAttributes extends PyreonHTMLAttributes<HTMLTextAreaElement> {
  value?: string | (() => string) | undefined
  defaultValue?: string | undefined
  placeholder?: string | (() => string) | undefined
  disabled?: boolean | (() => boolean) | undefined
  readOnly?: boolean | undefined
  required?: boolean | (() => boolean) | undefined
  rows?: number | undefined
  cols?: number | undefined
  minLength?: number | undefined
  maxLength?: number | undefined
  name?: string | undefined
  autoFocus?: boolean | undefined
  form?: string | undefined
  wrap?: "hard" | "soft" | undefined
}

export interface SelectAttributes extends PyreonHTMLAttributes<HTMLSelectElement> {
  value?: string | string[] | (() => string | string[]) | undefined
  defaultValue?: string | string[] | undefined
  disabled?: boolean | (() => boolean) | undefined
  required?: boolean | (() => boolean) | undefined
  multiple?: boolean | undefined
  name?: string | undefined
  size?: number | undefined
  form?: string | undefined
  autoFocus?: boolean | undefined
}

interface OptionAttributes extends PyreonHTMLAttributes<HTMLOptionElement> {
  value?: string | number | (() => string | number) | undefined
  disabled?: boolean | (() => boolean) | undefined
  selected?: boolean | (() => boolean) | undefined
  label?: string | undefined
}

export interface FormAttributes extends PyreonHTMLAttributes<HTMLFormElement> {
  action?: string | undefined
  method?: "get" | "post" | undefined
  encType?: string | undefined
  noValidate?: boolean | undefined
  target?: string | undefined
  name?: string | undefined
  autoComplete?: string | undefined
}

export interface ImgAttributes extends PyreonHTMLAttributes<HTMLImageElement> {
  src?: string | (() => string) | undefined
  alt?: string | (() => string) | undefined
  width?: number | string | (() => number | string) | undefined
  height?: number | string | (() => number | string) | undefined
  loading?: "lazy" | "eager" | undefined
  decoding?: "auto" | "async" | "sync" | undefined
  crossOrigin?: "anonymous" | "use-credentials" | undefined
  referrerPolicy?: string | undefined
  srcSet?: string | undefined
  sizes?: string | undefined
}

interface VideoAttributes extends PyreonHTMLAttributes<HTMLVideoElement> {
  src?: string | (() => string) | undefined
  width?: number | string | undefined
  height?: number | string | undefined
  controls?: boolean | undefined
  autoPlay?: boolean | undefined
  muted?: boolean | undefined
  loop?: boolean | undefined
  poster?: string | undefined
  preload?: "none" | "metadata" | "auto" | undefined
  playsInline?: boolean | undefined
  crossOrigin?: "anonymous" | "use-credentials" | undefined
}

interface AudioAttributes extends PyreonHTMLAttributes<HTMLAudioElement> {
  src?: string | (() => string) | undefined
  controls?: boolean | undefined
  autoPlay?: boolean | undefined
  muted?: boolean | undefined
  loop?: boolean | undefined
  preload?: "none" | "metadata" | "auto" | undefined
  crossOrigin?: "anonymous" | "use-credentials" | undefined
}

interface LabelAttributes extends PyreonHTMLAttributes<HTMLLabelElement> {
  htmlFor?: string | undefined
  for?: string | undefined
  form?: string | undefined
}

interface ThAttributes extends PyreonHTMLAttributes<HTMLTableCellElement> {
  colSpan?: number | undefined
  rowSpan?: number | undefined
  scope?: "col" | "row" | "colgroup" | "rowgroup" | undefined
  abbr?: string | undefined
  headers?: string | undefined
}

interface TdAttributes extends PyreonHTMLAttributes<HTMLTableCellElement> {
  colSpan?: number | undefined
  rowSpan?: number | undefined
  headers?: string | undefined
}

interface ColAttributes extends PyreonHTMLAttributes<HTMLTableColElement> {
  span?: number | undefined
}

interface IframeAttributes extends PyreonHTMLAttributes<HTMLIFrameElement> {
  src?: string | (() => string) | undefined
  width?: number | string | undefined
  height?: number | string | undefined
  allow?: string | undefined
  allowFullScreen?: boolean | undefined
  loading?: "lazy" | "eager" | undefined
  name?: string | undefined
  sandbox?: string | undefined
  referrerPolicy?: string | undefined
  title?: string | undefined
}

interface LinkAttributes extends PyreonHTMLAttributes<HTMLLinkElement> {
  href?: string | (() => string) | undefined
  rel?: string | undefined
  type?: string | undefined
  as?: string | undefined
  media?: string | undefined
  crossOrigin?: "anonymous" | "use-credentials" | undefined
  integrity?: string | undefined
  referrerPolicy?: string | undefined
}

interface MetaAttributes extends PyreonHTMLAttributes<HTMLMetaElement> {
  name?: string | undefined
  content?: string | (() => string) | undefined
  httpEquiv?: string | undefined
  charset?: string | undefined
  property?: string | undefined
}

interface ScriptAttributes extends PyreonHTMLAttributes<HTMLScriptElement> {
  src?: string | (() => string) | undefined
  type?: string | undefined
  async?: boolean | undefined
  defer?: boolean | undefined
  crossOrigin?: "anonymous" | "use-credentials" | undefined
  integrity?: string | undefined
  noModule?: boolean | undefined
  referrerPolicy?: string | undefined
}

interface SourceAttributes extends PyreonHTMLAttributes<HTMLSourceElement> {
  src?: string | (() => string) | undefined
  type?: string | undefined
  srcSet?: string | undefined
  sizes?: string | undefined
  media?: string | undefined
}

interface ProgressAttributes extends PyreonHTMLAttributes<HTMLProgressElement> {
  value?: number | (() => number) | undefined
  max?: number | undefined
}

interface MeterAttributes extends PyreonHTMLAttributes<HTMLMeterElement> {
  value?: number | (() => number) | undefined
  min?: number | undefined
  max?: number | undefined
  low?: number | undefined
  high?: number | undefined
  optimum?: number | undefined
}

interface DetailsAttributes extends PyreonHTMLAttributes<HTMLDetailsElement> {
  open?: boolean | (() => boolean) | undefined
}

interface DialogAttributes extends PyreonHTMLAttributes<HTMLDialogElement> {
  open?: boolean | (() => boolean) | undefined
}

interface OlAttributes extends PyreonHTMLAttributes<HTMLOListElement> {
  start?: number | undefined
  reversed?: boolean | undefined
  type?: "1" | "a" | "A" | "i" | "I" | undefined
}

interface CanvasAttributes extends PyreonHTMLAttributes<HTMLCanvasElement> {
  width?: number | string | undefined
  height?: number | string | undefined
}

export interface SvgAttributes extends PyreonHTMLAttributes<SVGElement> {
  viewBox?: string | undefined
  xmlns?: string | undefined
  fill?: string | (() => string) | undefined
  stroke?: string | (() => string) | undefined
  "stroke-width"?: string | number | undefined
  "stroke-linecap"?: "butt" | "round" | "square" | undefined
  "stroke-linejoin"?: "miter" | "round" | "bevel" | undefined
  "fill-rule"?: "nonzero" | "evenodd" | undefined
  "clip-rule"?: "nonzero" | "evenodd" | undefined
  "clip-path"?: string | undefined
  d?: string | undefined
  cx?: string | number | undefined
  cy?: string | number | undefined
  r?: string | number | undefined
  rx?: string | number | undefined
  ry?: string | number | undefined
  x?: string | number | undefined
  y?: string | number | undefined
  x1?: string | number | undefined
  y1?: string | number | undefined
  x2?: string | number | undefined
  y2?: string | number | undefined
  width?: string | number | undefined
  height?: string | number | undefined
  transform?: string | (() => string) | undefined
  opacity?: string | number | (() => string | number) | undefined
  points?: string | undefined
  "font-size"?: string | number | undefined
  "text-anchor"?: "start" | "middle" | "end" | undefined
  "dominant-baseline"?: string | undefined
}

declare global {
  namespace JSX {
    /** The type that JSX expressions evaluate to */
    type Element = import("./types").VNode

    /**
     * Valid JSX tag types — intrinsic strings + component functions.
     * Components may return VNode, null, strings, functions (reactive getters), etc.
     * (TS 5.1+ feature)
     */
    type ElementType = keyof IntrinsicElements | ((props: any) => import("./types").VNodeChild)

    /** Tells TS which prop name carries children in component calls */
    interface ElementChildrenAttribute {
      // biome-ignore lint/complexity/noBannedTypes: JSX spec requires {} for ElementChildrenAttribute
      children: {}
    }

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
      canvas: CanvasAttributes
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
      [tagName: string]: PyreonHTMLAttributes<any>
    }
  }
}
