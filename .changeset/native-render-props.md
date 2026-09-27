---
'@pyreon/native-compiler': minor
---

Render props, function-as-children and view slots now lower on iOS and Android.

A prop typed as a view (`children: VNodeChild`) or as a function returning one (`render: (item: Item) => VNodeChild`, or `=> unknown` when the component renders its result — the shape `@pyreon/lathe`'s generated `<Op>Data` components emit) becomes a generic `@ViewBuilder let render: (Item) -> RenderContent` on SwiftUI and `render: @Composable (Item) -> Unit` on Compose. Before, both targets typed it as a plain value (`(User?) -> Void` / a non-composable lambda) and the call site stringified the callback into a `Text`, so none of these compiled on iOS.

Call sites accept an inline arrow (children or prop form), a JSX-returning function declared in the file, or a render prop forwarded from the enclosing component; a component declared in another file is lowered from the callback's own shape. JSX-returning functions with annotated parameters are now emitted as `@ViewBuilder func` / `@Composable fun` and can be called in view position. An inline object parameter type is lifted to one declared struct, shared across components with the same shape. A component body's `return () => …` accessor unwraps to its view (it previously emitted a closure literal).

Named rather than emitted broken: a block-bodied render callback, a render-prop value the compiler cannot see into, a block-bodied accessor return, and — Swift only — an optional render prop.
