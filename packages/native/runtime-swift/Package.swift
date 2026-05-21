// swift-tools-version:5.9
//
// Pyreon native Swift runtime — minimal SPM package that emitter-output
// links against on iOS. Per the PMTC plan (#764), the runtime is
// intentionally tiny: SwiftUI's `@State` / `@Observable` / computed
// properties ARE the reactive primitives, and the compiler emits onto
// them directly. This package exists to host the small adapter layer
// (token tables, ViewModifier base shapes) the emitter references.
//
// Phase 0 (this PR): scaffold + smoke tests proving the package builds
// + is consumable. The real surface (PyreonTokens populated from
// @pyreon/ui-theme, ViewModifier protocol for rocketstyle) lands in
// PRs 7a/7b per the Phase 0 roadmap.

import PackageDescription

let package = Package(
    name: "PyreonRuntime",
    platforms: [
        // iOS 17 = SwiftUI's `@Observable` macro. Pre-17 would need
        // ObservableObject + @Published shims; not worth the floor cost
        // for an experimental package. macOS 14 mirrored for parity.
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "PyreonRuntime",
            targets: ["PyreonRuntime"]
        ),
    ],
    targets: [
        .target(
            name: "PyreonRuntime",
            // No external deps — the runtime is meant to be a
            // 'minimum-additional-surface' package. SwiftUI is
            // implicitly available via the iOS platform.
            dependencies: []
        ),
        .testTarget(
            name: "PyreonRuntimeTests",
            dependencies: ["PyreonRuntime"]
        ),
    ]
)
