// PyreonNavigation — the runtime half of the `<Tabs>` and `<Split>` canonical
// primitives (`@pyreon/primitives`).
//
// PMTC lowers `<Tabs value onChange>` + its `<Tab>` children to
//
//   PyreonTabs(selection: $tab, items: [PyreonTabItem(...), ...]) { pyreonTab in
//     switch pyreonTab { case "feed": ...; default: EmptyView() }
//   }
//
// and `<Split sidebar showDetail onBack>detail</Split>` to
//
//   PyreonSplit(showDetail: ..., onBack: { ... }) { sidebar } detail: { detail }
//
// The structure lives here rather than in the emit so the per-OS branching
// (`#available`, size classes) is written once, typechecked against the real
// SDK, and kept out of every generated file.
//
// It lives in the ROUTER module (not PyreonRuntime) for one reason:
// `PyreonSplit` must know whether it is already inside a `NavigationStack`,
// and the only stack a Pyreon app has is the one `RouterProvider` creates —
// which publishes `\.pyreonRouter`. Nesting a second `NavigationStack` inside
// the router's breaks both (SwiftUI does not support nested stacks).

import SwiftUI

/// One entry of a `PyreonTabs` bar. `systemImage` is an SF Symbol, already
/// resolved from the canonical `<Icon>` name at compile time. `Value` is the
/// selection type — `String`, or the native enum PMTC emits for a
/// string-literal union (`type Section = 'feed' | 'me'`).
public struct PyreonTabItem<Value: Hashable>: Identifiable {
    public let value: Value
    public let label: String
    public let systemImage: String?
    public var id: Value { value }

    public init(value: Value, label: String, systemImage: String? = nil) {
        self.value = value
        self.label = label
        self.systemImage = systemImage
    }
}

/// `<Tabs>` → `TabView(selection:)`.
@available(iOS 17.0, macOS 14.0, *)
///
/// SwiftUI's `TabView` keeps every tab's view alive while another is shown, so
/// a tab's `@State`, scroll position and any `NavigationStack` inside it
/// survive switching away and back — the contract the web and Android
/// runtimes reproduce by hand.
///
/// On iOS 18+ it uses the `Tab` API with `.sidebarAdaptable`: a tab bar on
/// iPhone, and on iPad a tab bar the user can turn into a sidebar. iOS 17
/// keeps the classic `.tabItem` bar on every device.
public struct PyreonTabs<Value: Hashable, Content: View>: View {
    @Binding private var selection: Value
    private let items: [PyreonTabItem<Value>]
    private let content: (Value) -> Content

    public init(
        selection: Binding<Value>,
        items: [PyreonTabItem<Value>],
        @ViewBuilder content: @escaping (Value) -> Content
    ) {
        self._selection = selection
        self.items = items
        self.content = content
    }

    @ViewBuilder
    private func label(_ item: PyreonTabItem<Value>) -> some View {
        if let image = item.systemImage {
            Label(item.label, systemImage: image)
        } else {
            Text(item.label)
        }
    }

    public var body: some View {
        if #available(iOS 18.0, macOS 15.0, *) {
            TabView(selection: $selection) {
                ForEach(items) { item in
                    Tab(value: item.value) {
                        content(item.value)
                    } label: {
                        label(item)
                    }
                }
            }
            .tabViewStyle(.sidebarAdaptable)
        } else {
            TabView(selection: $selection) {
                ForEach(items) { item in
                    content(item.value)
                        .tabItem { label(item) }
                        .tag(item.value)
                }
            }
        }
    }
}

/// `<Split>` → `NavigationSplitView` in a regular-width window (two plain
/// panes when it is already inside the router's stack); in a compact
/// one, the sidebar with the detail pushed onto a navigation stack while
/// `showDetail` is true — the ROUTER's stack when there is one (no nesting),
/// else a `NavigationStack` of its own.
///
/// The compact half deliberately does NOT rely on `NavigationSplitView`'s own
/// collapsing: that collapses around a `List(selection:)` the split does not
/// own, while `showDetail` is the app's signal. Pushing the detail with
/// `navigationDestination(isPresented:)` gives the system back button and the
/// swipe-back gesture, and both route through `onBack` so the app's signal
/// stays the single source of truth.
@available(iOS 17.0, macOS 14.0, *)
public struct PyreonSplit<Sidebar: View, Detail: View>: View {
    @Environment(\.pyreonRouter) private var router
    private let showDetail: Bool
    private let onBack: () -> Void
    private let sidebar: Sidebar
    private let detail: Detail
    #if os(iOS)
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    #endif

    public init(
        showDetail: Bool,
        onBack: @escaping () -> Void,
        @ViewBuilder sidebar: () -> Sidebar,
        @ViewBuilder detail: () -> Detail
    ) {
        self.showDetail = showDetail
        self.onBack = onBack
        self.sidebar = sidebar()
        self.detail = detail()
    }

    private var isCompact: Bool {
        #if os(iOS)
        return horizontalSizeClass == .compact
        #else
        return false
        #endif
    }

    private var pushedDetail: some View {
        sidebar.navigationDestination(
            isPresented: Binding(
                get: { showDetail },
                set: { presented in if !presented && showDetail { onBack() } }
            )
        ) {
            detail
        }
    }

    public var body: some View {
        if isCompact {
            if router != nil {
                pushedDetail
            } else {
                NavigationStack { pushedDetail }
            }
        } else if router != nil {
            // Inside the router's stack a NavigationSplitView would be a
            // stack nested in a stack too; lay the two panes out directly.
            HStack(spacing: 0) {
                sidebar.frame(width: 320)
                Divider()
                detail.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else {
            NavigationSplitView {
                sidebar
            } detail: {
                detail
            }
        }
    }
}
