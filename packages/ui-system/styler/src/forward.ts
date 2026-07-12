/**
 * HTML prop filtering. Prevents unknown props from being forwarded to DOM
 * elements (which causes warnings). Props starting with `$` are
 * transient (styling-only) and are always filtered out.
 */

// Common HTML attributes, event handlers, and ARIA/data attributes.
//
// Using a plain object with `key in HTML_PROPS` instead of `Set.has(key)`:
// V8 inlines `in` checks via hidden-class lookups (the object has a fixed
// shape at module load and never changes), which is meaningfully faster
// than going through the Set protocol on hot prop-filter paths. Measured
// upstream (vitus-labs `be471b19`): +19% on the 5-lookup mix benchmark
// (4 hits + 1 miss).
const HTML_PROPS_LIST = [
  // Core props
  'className',
  'class',
  'dangerouslySetInnerHTML',
  'htmlFor',
  // The STANDARD HTML attribute — must pass through alongside the React-compat
  // `htmlFor`, or a `<Label for="x">` on a styled/rocketstyle component silently
  // DROPS the `for` attribute, severing the label↔input a11y association (the
  // runtime + SSR both handle bare `for` on a native <label>; only this
  // allowlist forgot it).
  'for',
  'id',
  'key',
  'ref',
  'style',
  'tabIndex',
  'role',
  // Event handlers
  'onAbort',
  'onAnimationEnd',
  'onAnimationIteration',
  'onAnimationStart',
  'onBlur',
  'onChange',
  'onClick',
  'onCompositionEnd',
  'onCompositionStart',
  'onCompositionUpdate',
  'onContextMenu',
  'onCopy',
  'onCut',
  'onDoubleClick',
  'onDrag',
  'onDragEnd',
  'onDragEnter',
  'onDragLeave',
  'onDragOver',
  'onDragStart',
  'onDrop',
  'onError',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyPress',
  'onKeyUp',
  'onLoad',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseMove',
  'onMouseOut',
  'onMouseOver',
  'onMouseUp',
  'onPaste',
  'onPointerCancel',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerMove',
  'onPointerOut',
  'onPointerOver',
  'onPointerUp',
  'onScroll',
  'onSelect',
  'onSubmit',
  'onTouchCancel',
  'onTouchEnd',
  'onTouchMove',
  'onTouchStart',
  'onTransitionEnd',
  'onWheel',
  // HTML attributes
  'accept',
  'acceptCharset',
  'accessKey',
  'action',
  'allow',
  'allowFullScreen',
  'alt',
  'as',
  'async',
  'autoCapitalize',
  'autoComplete',
  'autoCorrect',
  'autoFocus',
  'autoPlay',
  'capture',
  'cellPadding',
  'cellSpacing',
  'charSet',
  'checked',
  'cite',
  'cols',
  'colSpan',
  'content',
  'contentEditable',
  'controls',
  'controlsList',
  'coords',
  'crossOrigin',
  'dateTime',
  'decoding',
  'default',
  'defaultChecked',
  'defaultValue',
  'defer',
  'dir',
  'disabled',
  'disablePictureInPicture',
  'disableRemotePlayback',
  'download',
  'draggable',
  'encType',
  'enterKeyHint',
  'fetchPriority',
  'form',
  'formAction',
  'formEncType',
  'formMethod',
  'formNoValidate',
  'formTarget',
  'frameBorder',
  'headers',
  'height',
  'hidden',
  'high',
  'href',
  'hrefLang',
  'httpEquiv',
  'inputMode',
  'integrity',
  'is',
  'label',
  'lang',
  'list',
  'loading',
  'loop',
  'low',
  'max',
  'maxLength',
  'media',
  'method',
  'min',
  'minLength',
  'multiple',
  'muted',
  'name',
  'noModule',
  'noValidate',
  'nonce',
  'open',
  'optimum',
  'pattern',
  'placeholder',
  'playsInline',
  'poster',
  'preload',
  'readOnly',
  'referrerPolicy',
  'rel',
  'required',
  'reversed',
  'rows',
  'rowSpan',
  'sandbox',
  'scope',
  'scoped',
  'scrolling',
  'selected',
  'shape',
  'size',
  'sizes',
  'slot',
  'span',
  'spellCheck',
  'src',
  'srcDoc',
  'srcLang',
  'srcSet',
  'start',
  'step',
  'summary',
  'target',
  'title',
  'translate',
  'type',
  'useMap',
  'value',
  'width',
  'wrap',
] as const

// Build the lookup object once at module load. `null`-prototype keeps the
// object's hidden class lean and means `in` checks don't accidentally pick
// up `Object.prototype` keys.
const HTML_PROPS: Record<string, true> = Object.create(null)
for (const k of HTML_PROPS_LIST) HTML_PROPS[k] = true

/**
 * Filters props for HTML elements. Keeps valid HTML attrs, data-*, aria-*.
 * Rejects unknown props and $-prefixed transient props.
 */
export const filterProps = (props: Record<string, unknown>): Record<string, unknown> => {
  const filtered: Record<string, unknown> = {}

  for (const key in props) {
    // Skip transient props ($-prefixed) — used for styling-only props
    if (key.charCodeAt(0) === 36) continue // '$'

    // Skip `as` prop — handled separately by styled
    if (key === 'as') continue

    // Keep data-* and aria-* attributes
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      filtered[key] = props[key]
      continue
    }

    // Keep known HTML props — `in` against the null-prototype lookup
    // object beats `Set.has` on the hot DOM-filter path.
    if (key in HTML_PROPS) {
      filtered[key] = props[key]
    }
  }

  return filtered
}

/**
 * Build final props for a styled component in a single pass.
 * Combines className merging, ref injection, and prop filtering into one
 * allocation and one iteration.
 *
 * Copies own property DESCRIPTORS rather than values for forwarded
 * props — getter-shaped reactive props (compiler-emitted `_rp(() =>
 * signal())` converted to getters by `makeReactiveProps`) survive the
 * copy with their reactive subscription intact. A bare `result[key] =
 * rawProps[key]` fires the getter at setup time and stores a static
 * value, breaking signal-driven reactivity for any consumer that reads
 * `props.x` in a reactive scope downstream.
 */
export const buildProps = (
  rawProps: Record<string, any>,
  generatedCls: string,
  isDOM: boolean,
  customFilter?: (prop: string) => boolean,
): Record<string, any> => {
  const result: Record<string, any> = {}

  // Merge generated + user className.
  //
  // **Reactive contract** — when the user passes a signal-driven class
  // (`class={() => variant()}` via the compiler's `_rp(() => …)`
  // wrapping → `makeReactiveProps` getter descriptor), value-reading
  // `rawProps.class` here fires the getter ONCE at setup time, captures
  // the snapshot, and merges it into a STATIC string. Downstream
  // `applyProp` then sees a plain string and writes it once; the DOM
  // never updates on signal change.
  //
  // Detect getter-shaped class / className and wrap the merge in a
  // getter that re-reads + re-composes on every access. The string we
  // emit then carries the reactive subscription through to applyProp,
  // which DOES re-fire its renderEffect on getter access via the
  // descriptor it sees here. Static (data-descriptor) class still
  // takes the simple value-merge fast path.
  const classDesc =
    Object.getOwnPropertyDescriptor(rawProps, 'class') ??
    Object.getOwnPropertyDescriptor(rawProps, 'className')
  if (classDesc?.get) {
    const getUserCls = classDesc.get
    Object.defineProperty(result, 'class', {
      enumerable: true,
      configurable: true,
      get() {
        const uc = getUserCls.call(rawProps)
        if (generatedCls) return uc ? `${generatedCls} ${uc}` : generatedCls
        return uc ?? ''
      },
    })
  } else {
    const userCls = rawProps.class || rawProps.className
    if (generatedCls) {
      result.class = userCls ? `${generatedCls} ${userCls}` : generatedCls
    } else if (userCls) {
      result.class = userCls
    }
  }

  // Helper: copy a prop's OWN descriptor (preserves getters) into result.
  // Falls back to a no-op if the source has no own descriptor for the key.
  const copyDescriptor = (key: string): void => {
    const d = Object.getOwnPropertyDescriptor(rawProps, key)
    if (d) Object.defineProperty(result, key, d)
  }

  // Component target — forward all props except as/className/class and $-prefixed
  if (!isDOM) {
    for (const key in rawProps) {
      if (key === 'as' || key === 'className' || key === 'class') continue
      if (key.charCodeAt(0) === 36) continue // $-prefixed transient
      copyDescriptor(key)
    }
    return result
  }

  // DOM element with custom shouldForwardProp
  if (customFilter) {
    for (const key in rawProps) {
      if (key === 'as' || key === 'className' || key === 'class') continue
      if (customFilter(key)) copyDescriptor(key)
    }
    return result
  }

  // DOM element with default filtering
  for (const key in rawProps) {
    if (key === 'as' || key === 'className' || key === 'class') continue
    if (key.charCodeAt(0) === 36) continue // $-prefixed transient
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      copyDescriptor(key)
      continue
    }
    if (key in HTML_PROPS) copyDescriptor(key)
  }
  return result
}
