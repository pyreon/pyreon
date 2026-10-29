// PyreonMutation — the Compose side of `useMutation`, one-for-one with the
// Swift `PyreonMutation` (see that file for the full contract):
//
//     m.mutate(vars) / m.mutateAsync(vars)
//     m.data / m.error / m.status (+ isIdle / isPending / isSuccess / isError)
//     m.reset()
//
// ## Coroutine-free, transport-agnostic
//
// The container owns the STATE MACHINE and the callback order. The compiler
// builds the request at the CALL SITE (as an argument, so the values of the
// moment of the call are what is sent) and launches `run` / `runAsync` on the
// composable's `rememberCoroutineScope()` — the same scope an `async` handler
// launches on — with the send + decode as the `operation`. So this file needs
// no kotlinx-coroutines import (a `suspend` function is a language feature),
// verifies alone against the stub set, and unit-tests with a stub operation.
//
// ## Disposal
//
// When the composition leaves, the scope is cancelled: the suspended
// `operation` resumes with a `CancellationException`, which is re-thrown with
// NO state write and NO callback — the Swift twin skips them the same way
// through a weak capture. The blocking send itself runs to completion on its
// IO thread (it is not interrupted), so a request the server may already have
// committed is not torn mid-flight; the web never aborts a mutation either.

package com.pyreon.runtime

import androidx.compose.runtime.MutableState
import androidx.compose.runtime.mutableStateOf

/** The callbacks one layer (the `useMutation` options, or one `mutate` call) contributes. */
public class PyreonMutationCallbacks<T>(
    public val onSuccess: ((T) -> Unit)? = null,
    public val onError: ((Throwable) -> Unit)? = null,
    public val onSettled: ((T?, Throwable?) -> Unit)? = null,
)

/** Reactive mutation container — the Compose half of `useMutation`. */
public class PyreonMutation<T> {
    /** The latest successful mutation's result. */
    public val data: MutableState<T?> = mutableStateOf(null)

    /** The latest failed mutation's error. */
    public val error: MutableState<Throwable?> = mutableStateOf(null)

    /** `idle` -> `pending` -> `success` | `error`, as on the web. */
    public val status: MutableState<String> = mutableStateOf("idle")

    public val isIdle: MutableState<Boolean> = mutableStateOf(true)
    public val isPending: MutableState<Boolean> = mutableStateOf(false)
    public val isSuccess: MutableState<Boolean> = mutableStateOf(false)
    public val isError: MutableState<Boolean> = mutableStateOf(false)

    /** Which call owns the state; bumped by every run and by [reset]. */
    private var generation = 0

    /** Back to idle. A call still in flight settles without writing anything. */
    public fun reset() {
        generation += 1
        data.value = null
        error.value = null
        setStatus("idle")
    }

    /**
     * The web's `mutate(vars, callbacks)`, as the compiler emits it: [begin] on
     * the CALLING thread (the web flips to `pending` before its first await),
     * then this inside a coroutine launched on the composable's scope, with the
     * generation [begin] returned. Never throws a failure (the state carries
     * it); re-throws a cancellation.
     */
    public suspend fun <R> run(
        mine: Int,
        input: R,
        operation: suspend (R) -> T,
        options: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
        call: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
    ) {
        try {
            settle(mine, input, operation, options, call)
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            throw e
        } catch (_: Throwable) {
            // Captured in `error` (and handed to onError) by settle.
        }
    }

    /** The web's `mutateAsync(vars, callbacks)`: the result returned, a failure re-thrown. */
    public suspend fun <R> runAsync(
        input: R,
        operation: suspend (R) -> T,
        options: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
        call: PyreonMutationCallbacks<T> = PyreonMutationCallbacks(),
    ): T = settle(begin(), input, operation, options, call)

    private suspend fun <R> settle(
        mine: Int,
        input: R,
        operation: suspend (R) -> T,
        options: PyreonMutationCallbacks<T>,
        call: PyreonMutationCallbacks<T>,
    ): T {
        val value = try {
            operation(input)
        } catch (e: kotlin.coroutines.cancellation.CancellationException) {
            // Disposed: nothing is written and nothing runs.
            throw e
        } catch (e: Throwable) {
            fail(e, mine, options, call)
            throw e
        }
        succeed(value, mine, options, call)
        return value
    }

    /** Begin a run synchronously — what the web's `mutate` does before its first await. */
    public fun begin(): Int {
        generation += 1
        // TanStack's reducer clears `data` on `pending` and on `error`.
        data.value = null
        error.value = null
        setStatus("pending")
        return generation
    }

    private fun succeed(value: T, mine: Int, options: PyreonMutationCallbacks<T>, call: PyreonMutationCallbacks<T>) {
        options.onSuccess?.invoke(value)
        options.onSettled?.invoke(value, null)
        if (mine != generation) return
        data.value = value
        error.value = null
        setStatus("success")
        call.onSuccess?.invoke(value)
        call.onSettled?.invoke(value, null)
    }

    private fun fail(failure: Throwable, mine: Int, options: PyreonMutationCallbacks<T>, call: PyreonMutationCallbacks<T>) {
        options.onError?.invoke(failure)
        options.onSettled?.invoke(null, failure)
        if (mine != generation) return
        data.value = null
        error.value = failure
        setStatus("error")
        call.onError?.invoke(failure)
        call.onSettled?.invoke(null, failure)
    }

    private fun setStatus(next: String) {
        status.value = next
        isIdle.value = next == "idle"
        isPending.value = next == "pending"
        isSuccess.value = next == "success"
        isError.value = next == "error"
    }
}
