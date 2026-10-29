// `<WebView grow>` — the sizing contract, shared by both emitters (#3956 item 5).
//
// An unsized web view is the size of an `<iframe>` with no CSS on every target:
// full width, 150 high (the CSS replaced-element default). `grow` takes the free
// space of the parent along its MAIN axis, the way `<Spacer>` does:
//
//   parent            iOS (runtime `grow:` arg)          Android (modifier)
//   <Stack> column    .vertical  → maxHeight .infinity   Modifier.weight(1f)
//   <Inline> row      .horizontal → maxWidth .infinity   Modifier.weight(1f)
//   anything else     .both                              Modifier.fillMaxSize()
//
// Why the PARENT has to be known at compile time: Compose's `weight` is an
// extension on `ColumnScope` / `RowScope`, so it only compiles as a DIRECT child
// of the Column / Row the parent lowered to — and SwiftUI's greedy frame must be
// restricted to the main axis, or a growing view in an `<Inline>` would take
// the row's whole height on iOS while Android kept 150. Both are facts about
// the emitted tree, not about runtime values.
//
// The `<Scroll>` exception. `weight` inside a scrolling Compose column (whose
// height constraint is infinite) measures the child to ZERO, while SwiftUI and
// the web keep it at its 150 ideal. There is no free space to fill there, so
// the honest answer on every target is the unsized default: the emitter drops
// `grow` and warns by name. That is only decidable when the `<Scroll>` is in
// the SAME component; a component rendered into a scroll elsewhere cannot be
// seen at compile time (documented on `WebViewProps.grow`).

/** The layout a JSX element's children are emitted into. */
export type LayoutParentKind = 'column' | 'row' | 'other'

interface ParentFrame {
  readonly kind: LayoutParentKind
  /** The element depth of the container whose children are being emitted. */
  readonly depth: number
}

/**
 * Tags that emit their children INLINE into the enclosing container's content
 * lambda / view builder (an `if`, an escape-hatch branch), so they neither own a
 * layout nor break a `ColumnScope`. Every other element is a boundary: its
 * children are not direct children of the outer Column / Row.
 */
const TRANSPARENT_TAGS: ReadonlySet<string> = new Set(['Show', 'NativeAndroid', 'NativeIOS', 'Web'])

/**
 * Per-emitter bookkeeping: which container a JSX element is a DIRECT child of,
 * and which scroll axes enclose it within the component being emitted. One
 * instance per emitter module, `reset()` with the rest of the per-file state.
 */
export class LayoutScopeTracker {
  private depth = 0
  private parent: ParentFrame | undefined
  private verticalScrolls = 0
  private horizontalScrolls = 0

  reset(): void {
    this.depth = 0
    this.parent = undefined
    this.verticalScrolls = 0
    this.horizontalScrolls = 0
  }

  /** Wrap the dispatch of one JSX element. Transparent tags do not deepen the tree. */
  element<T>(tag: string, run: () => T): T {
    if (TRANSPARENT_TAGS.has(tag)) return run()
    this.depth++
    try {
      return run()
    } finally {
      this.depth--
    }
  }

  /** Emit a container's children under the layout they become direct children of. */
  children<T>(kind: LayoutParentKind, run: () => T): T {
    const prev = this.parent
    this.parent = { kind, depth: this.depth }
    try {
      return run()
    } finally {
      this.parent = prev
    }
  }

  /** Emit a `<Scroll>`'s children: they are unbounded along `axis`. */
  scroll<T>(axis: 'vertical' | 'horizontal', kind: LayoutParentKind, run: () => T): T {
    if (axis === 'vertical') this.verticalScrolls++
    else this.horizontalScrolls++
    try {
      return this.children(kind, run)
    } finally {
      if (axis === 'vertical') this.verticalScrolls--
      else this.horizontalScrolls--
    }
  }

  /** The parent of the element currently being emitted (call from inside its emitter). */
  currentParent(): LayoutParentKind {
    const p = this.parent
    return p !== undefined && p.depth === this.depth - 1 ? p.kind : 'other'
  }

  /** Is the element being emitted inside a `<Scroll>` along `axis` (anywhere in this component)? */
  insideScroll(axis: 'vertical' | 'horizontal'): boolean {
    return axis === 'vertical' ? this.verticalScrolls > 0 : this.horizontalScrolls > 0
  }
}

/** How a `<WebView grow>` lowers on one target, decided from its parent. */
export type WebViewGrowAxis = 'vertical' | 'horizontal' | 'both'

export interface WebViewGrowLowering {
  /** The axis it grows along, or undefined when it keeps the unsized default. */
  readonly axis: WebViewGrowAxis | undefined
  /** A COLUMN / ROW parent — Compose can (and must) use `Modifier.weight`. */
  readonly weighted: boolean
  readonly warning: string | undefined
}

const NONE: WebViewGrowLowering = { axis: undefined, weighted: false, warning: undefined }

/**
 * Decide `grow` for one `<WebView>`-family element. `readStatic` reads a literal
 * or module-const attribute value; `tag` is the authored tag, for diagnostics.
 */
export function lowerWebViewGrow(
  attrs: readonly { kind: string; name?: string }[],
  readStatic: () => string | number | boolean | undefined,
  scope: LayoutScopeTracker,
  tag: string,
): WebViewGrowLowering {
  const present = attrs.some((a) => a.kind === 'attr' && a.name === 'grow')
  if (!present) return NONE
  const value = readStatic()
  if (value === false) return NONE
  if (value !== true) {
    return {
      ...NONE,
      warning: `<${tag} grow={…}>: \`grow\` decides the native layout at compile time (Compose \`Modifier.weight\` / a SwiftUI frame), so it must be a literal \`true\`/\`false\` (or a module-level const); keeping the unsized default (full width, 150 high).`,
    }
  }
  const parent = scope.currentParent()
  const axis: WebViewGrowAxis = parent === 'column' ? 'vertical' : parent === 'row' ? 'horizontal' : 'both'
  const scrolled =
    (axis !== 'horizontal' && scope.insideScroll('vertical')) || (axis !== 'vertical' && scope.insideScroll('horizontal'))
  if (scrolled) {
    return {
      ...NONE,
      warning: `<${tag} grow> inside a <Scroll> along the axis it would grow: a scroll container has no free space to fill (Compose's \`Modifier.weight\` measures to zero there), so \`grow\` is dropped and the view keeps the unsized default (150 high) on every target. Move it out of the <Scroll>, or remove \`grow\`.`,
    }
  }
  return { axis, weighted: parent !== 'other', warning: undefined }
}
