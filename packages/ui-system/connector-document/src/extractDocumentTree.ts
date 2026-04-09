import { resolveStyles } from './resolveStyles'
import type { DocChild, DocNode, NodeType } from './types'

/** Marker interface: components with _documentType are extractable. */
export interface DocumentMarker {
  _documentType: NodeType
}

export interface ExtractOptions {
  /** Root font size for rem→px conversion. Default: 16. */
  rootSize?: number
  /** Include resolved styles from $rocketstyle. Default: true. */
  includeStyles?: boolean
}

type VNodeLike = {
  type: string | ((...args: any[]) => any)
  props: Record<string, any>
  children: unknown[]
}

function isVNode(value: unknown): value is VNodeLike {
  return value != null && typeof value === 'object' && 'type' in value && 'props' in value
}

function getDocumentType(fn: unknown): NodeType | undefined {
  if (typeof fn !== 'function') return undefined
  const meta = (fn as any).meta
  if (meta?._documentType) return meta._documentType as NodeType
  // Fallback: check directly on function (non-rocketstyle components)
  if ('_documentType' in fn) return (fn as any)._documentType as NodeType
  return undefined
}

function flattenChildren(children: unknown[]): unknown[] {
  const result: unknown[] = []
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child))
    } else if (typeof child === 'function') {
      // Reactive getter — call to resolve
      const resolved = child()
      if (Array.isArray(resolved)) {
        result.push(...flattenChildren(resolved))
      } else {
        result.push(resolved)
      }
    } else {
      result.push(child)
    }
  }
  return result
}

function extractChildren(children: unknown[], options: ExtractOptions): DocChild[] {
  const flat = flattenChildren(children)
  const result: DocChild[] = []

  for (const child of flat) {
    if (child == null || child === false || child === true) continue

    if (typeof child === 'string') {
      result.push(child)
      continue
    }

    if (typeof child === 'number') {
      result.push(String(child))
      continue
    }

    if (isVNode(child)) {
      const extracted = extractNode(child, options)
      if (Array.isArray(extracted)) {
        result.push(...extracted)
      } else if (extracted != null) {
        result.push(extracted)
      }
    }
  }

  return result
}

function extractNode(vnode: VNodeLike, options: ExtractOptions): DocNode | DocChild[] | null {
  const { type, props, children } = vnode
  const includeStyles = options.includeStyles !== false
  const rootSize = options.rootSize ?? 16

  // Component function with _documentType marker (via .statics() or direct)
  const docType = getDocumentType(type)
  if (docType) {
    // ── _documentProps resolution ────────────────────────────────────
    //
    // Two paths to find _documentProps on a documentType vnode:
    //
    //   (A) **Pre-resolved on the JSX vnode itself** — used by
    //       test fixtures that hand-construct vnodes without
    //       going through rocketstyle. Less common in real usage.
    //
    //   (B) **Post-attrs result of calling the component** — the
    //       real-world path. When a real `DocDocument` (or any
    //       rocketstyle primitive with `.statics({ _documentType })`)
    //       is rendered via JSX, the JSX vnode's `props` are the
    //       USER-PROVIDED props (e.g. `{ title, author }`) — NOT
    //       `_documentProps`. The rocketstyle attrs HOC adds
    //       `_documentProps` to the wrapped component's vnode by
    //       running the `.attrs()` callback during invocation. To
    //       see the post-attrs result, we must CALL the component
    //       function and read from THAT vnode's props.
    //
    // We try path (A) first because mock-vnode tests rely on it
    // and we don't want to invoke component functions when we
    // don't have to. If path (A) yields no _documentProps, we
    // fall back to path (B) and call the component.
    //
    // **Function values in _documentProps are resolved at this
    // point** — primitives like DocDocument can store accessor
    // thunks (`() => string`) for reactive metadata, and the
    // export pipeline reads the LIVE value on each extraction.
    // See PR #197 for the original use case (resume builder).

    let rawDocProps: Record<string, unknown> | undefined
    let extractedFromCall: VNodeLike | null = null

    // Path A: pre-resolved on the JSX vnode (test fixtures)
    if (props._documentProps && typeof props._documentProps === 'object') {
      rawDocProps = props._documentProps as Record<string, unknown>
    } else if (typeof type === 'function') {
      // Path B: invoke the component to get the post-attrs vnode
      const mergedProps = { ...props }
      if (children && children.length > 0) {
        mergedProps.children = children.length === 1 ? children[0] : children
      }
      const result = (type as (p: Record<string, unknown>) => unknown)(mergedProps)
      if (isVNode(result)) {
        extractedFromCall = result
        const innerProps = (result as { props?: Record<string, unknown> }).props
        if (innerProps?._documentProps && typeof innerProps._documentProps === 'object') {
          rawDocProps = innerProps._documentProps as Record<string, unknown>
        }
      }
    }

    // Resolve function values (accessors) at extraction time
    const docProps: Record<string, unknown> = {}
    if (rawDocProps) {
      for (const [key, value] of Object.entries(rawDocProps)) {
        docProps[key] = typeof value === 'function' ? (value as () => unknown)() : value
      }
    }

    // Resolve styles from $rocketstyle. Look on the JSX vnode props
    // first; if the call result has its own $rocketstyle (because the
    // post-attrs vnode carries it down), use that as a fallback.
    const stylesSource =
      props.$rocketstyle ??
      (extractedFromCall as { props?: Record<string, unknown> } | null)?.props?.$rocketstyle
    const styles =
      includeStyles && stylesSource
        ? resolveStyles(stylesSource as Record<string, unknown>, rootSize)
        : undefined

    // Children: prefer the JSX vnode's children (the user-supplied
    // tree). The post-attrs call might wrap children in additional
    // styled elements that aren't part of the document tree.
    const docChildren = extractChildren(children ?? [], options)

    const node: DocNode = {
      type: docType,
      props: docProps,
      children: docChildren,
    }

    if (styles && Object.keys(styles).length > 0) {
      node.styles = styles
    }

    return node
  }

  // Component function WITHOUT _documentType — call it to get its VNode output
  if (typeof type === 'function') {
    const mergedProps = { ...props }
    if (children && children.length > 0) {
      mergedProps.children = children.length === 1 ? children[0] : children
    }

    const result = type(mergedProps)

    if (isVNode(result)) {
      return extractNode(result, options)
    }

    // The component returned a primitive or null
    if (typeof result === 'string') return [result]
    if (typeof result === 'number') return [String(result)]
    return null
  }

  // DOM element (string type like 'div', 'span') — transparent, extract children
  if (typeof type === 'string') {
    const docChildren = extractChildren(children ?? [], options)
    // If there's text content in the DOM element, collect it
    if (docChildren.length > 0) return docChildren
    return null
  }

  return null
}

/**
 * Walk a Pyreon VNode tree and extract a `DocNode` tree for `@pyreon/document`.
 *
 * For each VNode whose component has a `_documentType` marker:
 * 1. Read `_documentType` → `DocNode.type`
 * 2. Read `_documentProps` → `DocNode.props`
 * 3. Read `$rocketstyle` → `resolveStyles()` → `DocNode.styles`
 * 4. Recurse into children
 *
 * VNodes without `_documentType` are transparent — their children
 * are flattened into the parent's children list.
 */
export function extractDocumentTree(vnode: unknown, options: ExtractOptions = {}): DocNode {
  if (isVNode(vnode)) {
    const result = extractNode(vnode, options)
    if (result && !Array.isArray(result)) return result

    // Wrap loose children in a document node
    const children = Array.isArray(result) ? result : []
    return { type: 'document', props: {}, children }
  }

  // If passed a component function directly, call it
  if (typeof vnode === 'function') {
    const result = (vnode as () => unknown)()
    return extractDocumentTree(result, options)
  }

  return { type: 'document', props: {}, children: [] }
}
