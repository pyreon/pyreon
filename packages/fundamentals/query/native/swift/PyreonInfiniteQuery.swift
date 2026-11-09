// PyreonInfiniteQuery — the SwiftUI side of `useInfiniteQuery`: a paginated, cursor-driven fetch.
//
// `@pyreon/query` on the web wraps `@tanstack/query-core`, an npm library PMTC cannot compile, so — exactly as
// `PyreonQuery` reimplements the query state machine — this reimplements the INFINITE query state machine natively:
// an ordered list of pages, the parameter each was fetched with, and the parameter the next page needs.
//
// ## Result contract (mirrors the web `useInfiniteQuery`)
//
//     feed.data                // PyreonInfiniteData: .pages (in fetch order) + .pageParams; nil until the first page
//     feed.hasNextPage         // true while the last page named a next parameter
//     feed.isFetchingNextPage  // true while a page BEYOND the first is in flight
//     feed.isPending           // true while the FIRST page is in flight (no data yet)
//     feed.isFetching          // true whenever any page is in flight
//     feed.error               // last failure, nil on success
//     feed.fetchNextPage()     // request the next page (no-op unless hasNextPage and nothing is in flight)
//
// ## Scope — a state machine, NOT the async orchestrator
//
// Like `PyreonQuery`, the network call is not here. The compiler-emitted harness assigns `requestPage` (start the
// fetch for one parameter) and `getNextParam` (read the next parameter off a decoded page), then calls `start()`;
// the harness reports back through `resolve` / `reject`. That keeps the port synchronously unit-testable and the
// Kotlin twin one-for-one.
//
// ## What is NOT here (disclosed, not implied away)
//
// No cache shared across instances or screens (the web caches pages by key), no `staleTime`, no
// `fetchPreviousPage`/`maxPages`, no `refetch`. Page parameters are carried as STRINGS: a numeric cursor
// round-trips through `String(describing:)` into the URL template, which is where it is used.
//
// ## A response for a superseded request is dropped
//
// `inflight` names the parameter whose answer is awaited. A response carrying any other parameter (a slow
// answer arriving after a newer request) is ignored, so it can never append out of order or clobber newer state.

import Foundation
import Observation

/// What the web calls `InfiniteData`: the pages in fetch order and the parameter each was fetched with.
public struct PyreonInfiniteData<Page> {
    public let pages: [Page]
    public let pageParams: [String]

    public init(pages: [Page], pageParams: [String]) {
        self.pages = pages
        self.pageParams = pageParams
    }
}

/// A page parameter read off a decoded page field (`last.nextCursor`): `nil` stays `nil` (no next page), any other
/// value is carried as its description (a numeric cursor becomes the digits the URL needs).
public func pyreonPageParam<T>(_ value: T?) -> String? {
    value.map { String(describing: $0) }
}

@available(iOS 17.0, macOS 14.0, *)
@Observable
public final class PyreonInfiniteQuery<Page> {
    public private(set) var data: PyreonInfiniteData<Page>?
    public private(set) var error: Error?
    public private(set) var isPending: Bool = false
    public private(set) var isFetching: Bool = false
    public private(set) var isFetchingNextPage: Bool = false
    public private(set) var hasNextPage: Bool = false

    @ObservationIgnored public let queryKey: String
    @ObservationIgnored public let initialParam: String
    /// Start the network fetch for one page parameter; the harness reports back via `resolve` / `reject`.
    @ObservationIgnored public var requestPage: ((String) -> Void)?
    /// Read the next page's parameter off a decoded page; `nil` means there is no next page.
    @ObservationIgnored public var getNextParam: ((Page) -> String?)?

    @ObservationIgnored private var pages: [Page] = []
    @ObservationIgnored private var params: [String] = []
    @ObservationIgnored private var nextParam: String?
    @ObservationIgnored private var inflight: String?

    public init(queryKey: String, initialParam: String) {
        self.queryKey = queryKey
        self.initialParam = initialParam
    }

    /// Fetch the first page. Idempotent: a no-op while anything is in flight or once a page has loaded.
    public func start() {
        guard pages.isEmpty, !isFetching else { return }
        isFetching = true
        isPending = true
        error = nil
        request(initialParam)
    }

    /// Fetch the next page. A no-op unless the last page named a next parameter and nothing is in flight, so a
    /// scroll handler can call it freely.
    public func fetchNextPage() {
        guard hasNextPage, !isFetching, let param = nextParam else { return }
        isFetching = true
        isFetchingNextPage = true
        error = nil
        request(param)
    }

    /// A page arrived for `param`. Dropped when it is not the request being awaited (a superseded response).
    public func resolve(_ page: Page, param: String) {
        guard inflight == param else { return }
        inflight = nil
        pages.append(page)
        params.append(param)
        nextParam = getNextParam?(page)
        hasNextPage = nextParam != nil
        data = PyreonInfiniteData(pages: pages, pageParams: params)
        error = nil
        isFetching = false
        isFetchingNextPage = false
        isPending = false
    }

    /// The awaited request failed. Pages already loaded are kept, and `fetchNextPage()` / `start()` retry the same
    /// parameter (`nextParam` is untouched).
    public func reject(_ failure: Error) {
        inflight = nil
        error = failure
        isFetching = false
        isFetchingNextPage = false
        isPending = false
    }

    private func request(_ param: String) {
        inflight = param
        requestPage?(param)
    }
}
