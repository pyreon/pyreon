/**
 * HTML prop filtering. Prevents unknown props from being forwarded to DOM
 * elements (which causes warnings). Props starting with `$` are
 * transient (styling-only) and are always filtered out.
 */

// Common HTML attributes, event handlers, and ARIA/data attributes
const HTML_PROPS = new Set([
  // Core props
  'className',
  'class',
  'dangerouslySetInnerHTML',
  'htmlFor',
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
])

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

    // Keep known HTML props
    if (HTML_PROPS.has(key)) {
      filtered[key] = props[key]
    }
  }

  return filtered
}

/**
 * Build final props for a styled component in a single pass.
 * Combines className merging, ref injection, and prop filtering into one
 * allocation and one iteration.
 */
export const buildProps = (
  rawProps: Record<string, any>,
  generatedCls: string,
  isDOM: boolean,
  customFilter?: (prop: string) => boolean,
): Record<string, any> => {
  const result: Record<string, any> = {}

  // Merge generated + user className
  const userCls = rawProps.class || rawProps.className
  if (generatedCls) {
    result.class = userCls ? `${generatedCls} ${userCls}` : generatedCls
  } else if (userCls) {
    result.class = userCls
  }

  // Component target — forward all props except as/className/class and $-prefixed
  if (!isDOM) {
    for (const key in rawProps) {
      if (key === 'as' || key === 'className' || key === 'class') continue
      if (key.charCodeAt(0) === 36) continue // $-prefixed transient
      result[key] = rawProps[key]
    }
    return result
  }

  // DOM element with custom shouldForwardProp
  if (customFilter) {
    for (const key in rawProps) {
      if (key === 'as' || key === 'className' || key === 'class') continue
      if (customFilter(key)) result[key] = rawProps[key]
    }
    return result
  }

  // DOM element with default filtering
  for (const key in rawProps) {
    if (key === 'as' || key === 'className' || key === 'class') continue
    if (key.charCodeAt(0) === 36) continue // $-prefixed transient
    if (key.startsWith('data-') || key.startsWith('aria-')) {
      result[key] = rawProps[key]
      continue
    }
    if (HTML_PROPS.has(key)) result[key] = rawProps[key]
  }
  return result
}
