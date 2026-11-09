// Smoke tests for PyreonInfiniteQuery — the Compose `useInfiniteQuery` state machine. Dependency-free `check(...)`
// harness; runs via `verify-kotlin.ts --service=PyreonInfiniteQuery`.

package com.pyreon.runtime

private fun queryWith(requests: MutableList<String>, next: (String) -> String?): PyreonInfiniteQuery<String> {
    val q = PyreonInfiniteQuery<String>(queryKey = "feed", initialParam = "0")
    q.requestPage = { requests.add(it) }
    q.getNextParam = next
    return q
}

fun testInfiniteStartRequestsTheInitialPageOnce() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { null }
    check(q.data.value == null) { "no data before the first page" }
    q.start()
    check(requests == listOf("0")) { "start requests the initial param" }
    check(q.isPending.value && q.isFetching.value) { "first page in flight is pending" }
    check(!q.isFetchingNextPage.value) { "the first page is not 'next page'" }
    q.start()
    check(requests.size == 1) { "start is a no-op while a page is in flight" }
}

fun testInfiniteResolveAppendsPagesInOrderAndTracksTheNextParam() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { page -> if (page == "p1") "c2" else null }
    q.start()
    q.resolve("p1", "0")
    check(!q.isPending.value && !q.isFetching.value) { "settled after the first page" }
    check(q.hasNextPage.value) { "p1 names a next param" }
    check(q.data.value!!.pages == listOf("p1")) { "first page stored" }
    q.fetchNextPage()
    check(requests == listOf("0", "c2")) { "fetchNextPage requests the param the last page named" }
    check(q.isFetchingNextPage.value && q.isFetching.value && !q.isPending.value) { "a later page is next-page, not pending" }
    q.resolve("p2", "c2")
    check(q.data.value!!.pages == listOf("p1", "p2")) { "pages append in fetch order" }
    check(q.data.value!!.pageParams == listOf("0", "c2")) { "each page remembers the param it was fetched with" }
    check(!q.hasNextPage.value) { "p2 names no next param" }
    q.fetchNextPage()
    check(requests.size == 2) { "fetchNextPage is a no-op when there is no next page" }
}

fun testInfiniteFetchNextPageIsANoOpWhileFetching() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { "more" }
    q.start()
    q.resolve("p1", "0")
    q.fetchNextPage()
    q.fetchNextPage()
    check(requests == listOf("0", "more")) { "a second call while in flight does not double-request" }
}

fun testInfiniteDropsAResponseForASupersededRequest() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { "more" }
    q.start()
    q.resolve("stale", "not-the-awaited-param")
    check(q.data.value == null) { "a response for another param is ignored" }
    check(q.isPending.value) { "still waiting for the real first page" }
    q.resolve("p1", "0")
    q.resolve("late", "0")
    check(q.data.value!!.pages == listOf("p1")) { "a duplicate answer for a settled request is ignored" }
}

fun testInfiniteRejectKeepsPagesAndRetriesTheSameParam() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { "more" }
    q.start()
    q.resolve("p1", "0")
    q.fetchNextPage()
    q.reject(RuntimeException("offline"))
    check(q.error.value?.message == "offline") { "error recorded" }
    check(!q.isFetching.value && !q.isFetchingNextPage.value) { "no longer fetching" }
    check(q.data.value!!.pages == listOf("p1")) { "loaded pages survive a failed next page" }
    check(q.hasNextPage.value) { "the next param is still known" }
    q.fetchNextPage()
    check(requests == listOf("0", "more", "more")) { "retry asks for the SAME param again" }
    check(q.error.value == null) { "error cleared when the retry starts" }
}

fun testInfiniteFirstPageFailureCanBeRetriedWithStart() {
    val requests = mutableListOf<String>()
    val q = queryWith(requests) { null }
    q.start()
    q.reject(RuntimeException("boom"))
    check(!q.isPending.value) { "a failed first page is no longer pending" }
    q.start()
    check(requests == listOf("0", "0")) { "start retries the initial page after a failure" }
}

fun testInfinitePageParamKeepsNullAndStringifiesTheRest() {
    check(pyreonPageParam(null) == null) { "null stays null" }
    check(pyreonPageParam(3) == "3") { "a number becomes its digits" }
    check(pyreonPageParam("abc") == "abc") { "a string is itself" }
}

fun main() {
    testInfiniteStartRequestsTheInitialPageOnce()
    testInfiniteResolveAppendsPagesInOrderAndTracksTheNextParam()
    testInfiniteFetchNextPageIsANoOpWhileFetching()
    testInfiniteDropsAResponseForASupersededRequest()
    testInfiniteRejectKeepsPagesAndRetriesTheSameParam()
    testInfiniteFirstPageFailureCanBeRetriedWithStart()
    testInfinitePageParamKeepsNullAndStringifiesTheRest()
    println("[PyreonInfiniteQueryTest] all smoke tests passed")
}
