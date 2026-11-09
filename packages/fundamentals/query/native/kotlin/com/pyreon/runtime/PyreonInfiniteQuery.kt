// PyreonInfiniteQuery — the Compose side of `useInfiniteQuery`: a paginated, cursor-driven fetch. One-for-one with the
// Swift twin (`PyreonInfiniteQuery.swift`, which carries the full contract and the list of what is NOT here).
//
// Compose `MutableState` fields are read `.value`:
//
//     feed.data.value                 // PyreonInfiniteData: .pages (fetch order) + .pageParams; null until the first page
//     feed.hasNextPage.value          // true while the last page named a next parameter
//     feed.isFetchingNextPage.value   // true while a page BEYOND the first is in flight
//     feed.isPending.value            // true while the FIRST page is in flight
//     feed.isFetching.value           // true whenever any page is in flight
//     feed.error.value                // last failure, null on success
//     feed.fetchNextPage()            // no-op unless hasNextPage and nothing is in flight
//
// A state machine, not the orchestrator: the compiler-emitted harness assigns `requestPage` and `getNextParam`, calls
// `start()`, and reports back through `resolve` / `reject`. A response for a superseded request is dropped (`inflight`).
// Free of `android.*`, so it compiles against the Compose-only kotlinc stubs and runs on a plain JVM.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** What the web calls `InfiniteData`: the pages in fetch order and the parameter each was fetched with. */
public class PyreonInfiniteData<Page>(
    public val pages: List<Page>,
    public val pageParams: List<String>,
)

/** A page parameter read off a decoded page field (`last.nextCursor`): null stays null, anything else is its string. */
public fun pyreonPageParam(value: Any?): String? = value?.toString()

public class PyreonInfiniteQuery<Page>(
    public val queryKey: String,
    public val initialParam: String,
) {
    public val data: MutableState<PyreonInfiniteData<Page>?> = mutableStateOf(null)
    public val error: MutableState<Throwable?> = mutableStateOf(null)
    public val isPending: MutableState<Boolean> = mutableStateOf(false)
    public val isFetching: MutableState<Boolean> = mutableStateOf(false)
    public val isFetchingNextPage: MutableState<Boolean> = mutableStateOf(false)
    public val hasNextPage: MutableState<Boolean> = mutableStateOf(false)

    /** Start the network fetch for one page parameter; the harness reports back via [resolve] / [reject]. */
    public var requestPage: ((String) -> Unit)? = null

    /** Read the next page's parameter off a decoded page; null means there is no next page. */
    public var getNextParam: ((Page) -> String?)? = null

    private val pages = mutableListOf<Page>()
    private val params = mutableListOf<String>()
    private var nextParam: String? = null
    private var inflight: String? = null

    /** Fetch the first page. Idempotent: a no-op while anything is in flight or once a page has loaded. */
    public fun start() {
        if (pages.isNotEmpty() || isFetching.value) return
        isFetching.value = true
        isPending.value = true
        error.value = null
        request(initialParam)
    }

    /** Fetch the next page. A no-op unless the last page named a next parameter and nothing is in flight. */
    public fun fetchNextPage() {
        val param = nextParam
        if (!hasNextPage.value || isFetching.value || param == null) return
        isFetching.value = true
        isFetchingNextPage.value = true
        error.value = null
        request(param)
    }

    /** A page arrived for [param]. Dropped when it is not the request being awaited (a superseded response). */
    public fun resolve(page: Page, param: String) {
        if (inflight != param) return
        inflight = null
        pages.add(page)
        params.add(param)
        nextParam = getNextParam?.invoke(page)
        hasNextPage.value = nextParam != null
        data.value = PyreonInfiniteData(pages.toList(), params.toList())
        error.value = null
        isFetching.value = false
        isFetchingNextPage.value = false
        isPending.value = false
    }

    /** The awaited request failed. Loaded pages are kept; [fetchNextPage] / [start] retry the same parameter. */
    public fun reject(failure: Throwable) {
        inflight = null
        error.value = failure
        isFetching.value = false
        isFetchingNextPage.value = false
        isPending.value = false
    }

    private fun request(param: String) {
        inflight = param
        requestPage?.invoke(param)
    }
}
