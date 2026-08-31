---
'@pyreon/query': patch
---

`useSubscription` now detaches a socket's handlers BEFORE calling `close()`,
in both its connect-supersede and disconnect paths.

`close()` only starts the closing handshake. The socket sits in `CLOSING` and a
frame that was already buffered can still be delivered — to a handler that is
still attached, which then writes into the scope the teardown has just
disposed. Detaching first removes the handler, so a later event has nothing to
call.

The old order was justified by a comment claiming the reverse: that nulling
first makes a queued message "fire a null handler and crash". That is not a
real JavaScript behaviour — assigning `null` to an event-handler IDL attribute
simply detaches it (verified: null the handler, dispatch the event, nothing
runs and nothing throws). The claim came from this repo's own anti-pattern
catalog, which asserted the wrong order and has been corrected in the same
change.

`@pyreon/hooks`' `useWebSocket` and this package's own `use-sse` already had it
right, with a correct rationale — so the framework disagreed with itself and
the catalog backed the wrong side.
