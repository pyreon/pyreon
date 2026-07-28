---
'@pyreon/native-compiler': patch
---

`const p = useParams()` then `p.id` failed on both native targets, silently.

The hook lowers to a native dictionary (`[String: String]`) / map, so the
natural JS property read emits `p.id` — which is not how either is accessed.
Both targets failed to type-check and nothing warned.

The destructured form has always worked, per key and with the Optional handled:

    const { id } = useParams()
    →  private var id: String { useParams(router: pyreonRouter)["id"] ?? "" }

That is why the matrix records `useParams` at R5 while this shape was broken:
the device-proven router-demo reaches params through `props.params.id`, so no
example exercised the hook's whole-object form. A capability can be genuinely
device-proven along one path and silently broken along another.

Warns rather than rewriting `.id` → `["id"]`. Member access is emitted from
everywhere in this compiler, and narrowing a codegen rewrite to exactly this
binding wants a reliably-green full suite to land safely; the destructure is
already the supported idiomatic shape, so the warning costs one line and
nothing in correctness. The tests include the measurements the warning is
derived from, so if the whole-object form ever compiles, the suite fails and
the warning goes.
