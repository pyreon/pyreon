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
    const docProps: Record<string, unknown> = {}

    // Extract document-specific props from _documentProps
    if (props._documentProps && typeof props._documentProps === 'object') {
      Object.assign(docProps, props._documentProps)
    }

    // Resolve styles from $rocketstyle
    const styles =
      includeStyles && props.$rocketstyle
        ? resolveStyles(props.$rocketstyle as Record<string, unknown>, rootSize)
        : undefined

    // Recurse into children
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
