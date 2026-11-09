// PyreonInfiniteQuery — the state machine behind `useInfiniteQuery`: pages in fetch order, the next parameter, and the
// guards (no double request, a superseded response is dropped, a failure keeps what loaded and retries the same
// parameter). Compiled with ../swift/PyreonInfiniteQuery.swift; run from PyreonQueryTests' `@main` chain.

import Foundation

@available(iOS 17.0, macOS 14.0, *)
private func makeQuery(_ requests: Box, next: @escaping (String) -> String?) -> PyreonInfiniteQuery<String> {
    let q = PyreonInfiniteQuery<String>(queryKey: "feed", initialParam: "0")
    q.requestPage = { requests.params.append($0) }
    q.getNextParam = next
    return q
}

private final class Box { var params: [String] = [] }

private struct Offline: Error {}

private func expect(_ cond: Bool, _ what: String) {
    if !cond { fatalError("PyreonInfiniteQueryTests: \(what)") }
}

func runPyreonInfiniteQueryTests() async {
    guard #available(iOS 17.0, macOS 14.0, *) else { return }

    do { // start requests the initial page once
        let r = Box()
        let q = makeQuery(r) { _ in nil }
        expect(q.data == nil, "no data before the first page")
        q.start()
        expect(r.params == ["0"], "start requests the initial param")
        expect(q.isPending && q.isFetching, "first page in flight is pending")
        expect(!q.isFetchingNextPage, "the first page is not 'next page'")
        q.start()
        expect(r.params.count == 1, "start is a no-op while a page is in flight")
    }

    do { // pages append in order; the next param follows the last page
        let r = Box()
        let q = makeQuery(r) { $0 == "p1" ? "c2" : nil }
        q.start()
        q.resolve("p1", param: "0")
        expect(!q.isPending && !q.isFetching, "settled after the first page")
        expect(q.hasNextPage, "p1 names a next param")
        expect(q.data?.pages == ["p1"], "first page stored")
        q.fetchNextPage()
        expect(r.params == ["0", "c2"], "fetchNextPage requests the param the last page named")
        expect(q.isFetchingNextPage && q.isFetching && !q.isPending, "a later page is next-page, not pending")
        q.resolve("p2", param: "c2")
        expect(q.data?.pages == ["p1", "p2"], "pages append in fetch order")
        expect(q.data?.pageParams == ["0", "c2"], "each page remembers the param it was fetched with")
        expect(!q.hasNextPage, "p2 names no next param")
        q.fetchNextPage()
        expect(r.params.count == 2, "fetchNextPage is a no-op when there is no next page")
    }

    do { // no double request while fetching
        let r = Box()
        let q = makeQuery(r) { _ in "more" }
        q.start()
        q.resolve("p1", param: "0")
        q.fetchNextPage()
        q.fetchNextPage()
        expect(r.params == ["0", "more"], "a second call while in flight does not double-request")
    }

    do { // a superseded response is dropped
        let r = Box()
        let q = makeQuery(r) { _ in "more" }
        q.start()
        q.resolve("stale", param: "not-the-awaited-param")
        expect(q.data == nil, "a response for another param is ignored")
        expect(q.isPending, "still waiting for the real first page")
        q.resolve("p1", param: "0")
        q.resolve("late", param: "0")
        expect(q.data?.pages == ["p1"], "a duplicate answer for a settled request is ignored")
    }

    do { // a failure keeps pages and retries the same param
        let r = Box()
        let q = makeQuery(r) { _ in "more" }
        q.start()
        q.resolve("p1", param: "0")
        q.fetchNextPage()
        q.reject(Offline())
        expect(q.error != nil, "error recorded")
        expect(!q.isFetching && !q.isFetchingNextPage, "no longer fetching")
        expect(q.data?.pages == ["p1"], "loaded pages survive a failed next page")
        expect(q.hasNextPage, "the next param is still known")
        q.fetchNextPage()
        expect(r.params == ["0", "more", "more"], "retry asks for the SAME param again")
        expect(q.error == nil, "error cleared when the retry starts")
    }

    do { // a failed first page is retried by start()
        let r = Box()
        let q = makeQuery(r) { _ in nil }
        q.start()
        q.reject(Offline())
        expect(!q.isPending, "a failed first page is no longer pending")
        q.start()
        expect(r.params == ["0", "0"], "start retries the initial page after a failure")
    }

    do { // parameter helper
        let none: String? = nil
        expect(pyreonPageParam(none) == nil, "nil stays nil")
        expect(pyreonPageParam(3) == "3", "a number becomes its digits")
        expect(pyreonPageParam("abc") == "abc", "a string is itself")
    }

    print("[PyreonInfiniteQueryTests] all assertions passed")
}
