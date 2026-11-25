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
// primitive on iOS. This package is the small adapter layer that
// matches @pyreon/router's component vocabulary so the SAME source
// compiles to web (history API) AND iOS (NavigationStack).

import PackageDescription

let package = Package(
    name: "PyreonRouter",
    platforms: [
        // iOS 17 / macOS 14: Pyreon's supported floor (the support matrix
        // on the stability page, held by scripts/check-support-matrix.ts),
        // the same as @pyreon/native-runtime-swift. The router's public
        // types already required it (`@available(iOS 17.0, macOS 14.0, *)`
        // for `@Observable`).
        .iOS(.v17),
        .macOS(.v14),
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
