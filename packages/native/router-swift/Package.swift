// swift-tools-version:5.9
//
// @pyreon/native-router-swift — Phase C1 of the PMTC multiplatform
// router story.
//
// Implements @pyreon/router's API surface (RouterProvider / RouterView /
// Link / useNavigate / useParams) on top of SwiftUI's `NavigationStack`.
// The compiler-emitted Swift code references these symbols 1:1 — same
// API the web side ships, different runtime under it.
//
// Per the PMTC plan: SwiftUI's `NavigationStack` IS the routing
// primitive on iOS 16+. This package is the small adapter layer that
// matches @pyreon/router's component vocabulary so the SAME source
// compiles to web (history API) AND iOS (NavigationStack).

import PackageDescription

let package = Package(
    name: "PyreonRouter",
    platforms: [
        // iOS 16 = NavigationStack. Below 16 would need NavigationView
        // (deprecated, single-back-stack semantics, not worth shimming).
        // macOS 13 mirrored for parity.
        .iOS(.v16),
        .macOS(.v13),
    ],
    products: [
        .library(
            name: "PyreonRouter",
            targets: ["PyreonRouter"]
        ),
    ],
    targets: [
        .target(
            name: "PyreonRouter",
            // No external deps. SwiftUI is implicitly available via the
            // iOS platform. PyreonRuntime (sibling SwiftPM package) is
            // NOT depended-on — the router's API is orthogonal to the
            // reactivity / storage adapter helpers there.
            dependencies: []
        ),
        .testTarget(
            name: "PyreonRouterTests",
            dependencies: ["PyreonRouter"]
        ),
    ]
)
