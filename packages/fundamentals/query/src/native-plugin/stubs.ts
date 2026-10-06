/**
 * The compile-gate stubs the `@pyreon/query` lowering's emit needs beyond the SwiftUI / Compose stub
 * bundle: `PyreonQuery` (the keyed cache a `useQuery` declaration emits) and `PyreonStream` (what a
 * `useStream` declaration emits, with its SSE / NDJSON request and decoder types). They mirror the
 * REAL runtimes (`@pyreon/query/native`, `@pyreon/http/native`) exactly — a superset stub masks real
 * breakage, a narrower one manufactures it.
 *
 * Each is appended to the bundle only for an emit that names its runtime type (see
 * {@link queryStubs}); the compiler never reads them.
 */

import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const QUERY_SWIFT_STUBS = `// PyreonQuery — the cached data container a \`useQuery\` decl emits. Mirrors
// runtime-swift's PyreonQuery.swift: \`data\`/\`error\`/\`isPending\`/\`isFetching\`
// are private(set) (driven via begin/resolve/reject), \`isStale\` is a computed
// getter the emit's \`.task\` reads, and the init takes \`queryKey\` +
// defaulted \`staleSeconds\`. A superset stub would MASK a real mismatch, so
// the signatures track the runtime exactly.
public final class PyreonQueryCache {
  public static let shared = PyreonQueryCache()
  public init() {}
  public func invalidate(_ key: String) {}
  public func clearAll() {}
}
public final class PyreonQuery<T> {
  public private(set) var data: T?
  public private(set) var error: Error?
  public private(set) var isPending: Bool = false
  public private(set) var isFetching: Bool = false
  public private(set) var queryKey: String = ""
  public var isStale: Bool { true }
  public init(queryKey: String, staleSeconds: TimeInterval = 0, cache: PyreonQueryCache = .shared) {}
  public func setKey(_ key: String) {}
  public func begin() {}
  public func resolve(_ value: T) {}
  public func reject(_ failure: Error) {}
  public func load(_ fetcher: @escaping () throws -> T) {}
  public func refetch() {}
}
`

export const STREAM_SWIFT_STUBS = `// PyreonStream — what a \`useStream\` decl emits. Mirrors the REAL
// @pyreon/http/native/swift/PyreonStream.swift surface the emit touches: the
// @Observable result fields are private(set), the run methods are
// \`@MainActor async\`, the decoders are static factories returning throwing
// closures, and the reconnect struct's init is fully defaulted. ONE deliberate
// omission: the runtime's \`session: URLSession = .shared\` parameter. The emit
// never passes it, and naming URLSession here would need FoundationNetworking
// on Linux for EVERY stubbed file, not only the ones that fetch.
public struct PyreonSseMessage: Equatable, Sendable {
  public var type: String
  public var data: String
  public var id: String
  public var retry: Int?
  public init(type: String, data: String, id: String, retry: Int?) { self.type = type; self.data = data; self.id = id; self.retry = retry }
}
public struct PyreonStreamReconnect: Equatable, Sendable {
  public init(attempts: Int = 5, delay: Int = 1000, maxDelay: Int = 30_000, onEnd: Bool = false) {}
}
public struct PyreonSseOptions: Sendable {
  public init(events: [String]? = nil, lastEventId: String? = nil, reconnect: PyreonStreamReconnect? = PyreonStreamReconnect()) {}
}
public struct PyreonStreamRequest: Sendable {
  public init(method: String = "GET", url: String, headers: [String: String] = [:], body: Data? = nil) {}
}
public struct PyreonSseEvent<T> {
  public var type: String
  public var data: T
  public var id: String
  public init(type: String, data: T, id: String) { self.type = type; self.data = data; self.id = id }
}
public enum PyreonStreamDecode {
  public static func sseJSON<T: Decodable>(_ type: T.Type) -> (PyreonSseMessage) throws -> PyreonSseEvent<T> { fatalError() }
  public static func sseText() -> (PyreonSseMessage) throws -> PyreonSseEvent<String> { fatalError() }
  public static func ndjson<T: Decodable>(_ type: T.Type) -> (String) throws -> T { fatalError() }
}
public final class PyreonStream<E> {
  public private(set) var events: [E] = []
  public private(set) var latest: E?
  public private(set) var status: String = "idle"
  public private(set) var error: Error?
  public private(set) var restartTick: Int = 0
  public let maxEvents: Int
  public init(maxEvents: Int = 1000) { self.maxEvents = maxEvents }
  public func begin() {}
  public func push(_ event: E) {}
  public func fail(_ failure: Error) {}
  public func abort() {}
  public func restart() {}
  public func idle() {}
  @MainActor public func runSse(_ request: PyreonStreamRequest, options: PyreonSseOptions = PyreonSseOptions(), accept: String = "text/event-stream", onEvent: ((E) -> Void)? = nil, decode: @escaping (PyreonSseMessage) throws -> E) async {}
  @MainActor public func runNdjson(_ request: PyreonStreamRequest, accept: String = "application/x-ndjson", onEvent: ((E) -> Void)? = nil, decode: @escaping (String) throws -> E) async {}
}
`

export const QUERY_KOTLIN_STUBS = `// PyreonQuery — mirror of @pyreon/native-runtime-kotlin's PyreonQuery.kt.
// The cached data container a \`useQuery\` decl emits: MutableState fields
// (\`data\`/\`error\`/\`isPending\`/\`isFetching\` — the emit reads \`.value\`),
// an \`isStale\` getter the emit's LaunchedEffect guards on, and a ctor taking
// \`queryKey\` + defaulted \`staleMillis\`. Signatures track the runtime exactly.
class PyreonQuery<T>(queryKey: String, val staleMillis: Long = 0) {
  var queryKey: String = queryKey
    private set
  val data: MutableState<T?> = mutableStateOf(null)
  val error: MutableState<Throwable?> = mutableStateOf(null)
  val isPending: MutableState<Boolean> = mutableStateOf(false)
  val isFetching: MutableState<Boolean> = mutableStateOf(false)
  val isStale: Boolean get() = true
  fun setKey(key: String) {}
  fun begin() {}
  fun resolve(value: T) {}
  fun reject(e: Throwable) {}
  fun refetch() {}
}

`

export const STREAM_KOTLIN_STUBS = `// PyreonStream — mirror of @pyreon/http/native/kotlin/.../PyreonStream.kt, the
// surface a \`useStream\` decl emits: MutableState result fields (read
// \`.value\`), \`restartTick\` the DisposableEffect keys on, and start/stop.
// \`delay\`/\`maxDelay\` are Long and \`retry\` is Long? — as in the runtime. The
// optional \`transport\` parameter is omitted: the emit never passes it.
data class PyreonSseMessage(val type: String, val data: String, val id: String, val retry: Long?)
data class PyreonStreamReconnect(val attempts: Long = 5L, val delay: Long = 1000, val maxDelay: Long = 30_000, val onEnd: Boolean = false)
data class PyreonSseOptions(val events: List<String>? = null, val lastEventId: String? = null, val reconnect: PyreonStreamReconnect? = PyreonStreamReconnect())
data class PyreonStreamRequest(val method: String = "GET", val url: String, val headers: Map<String, String> = emptyMap(), val body: String? = null)
data class PyreonSseEvent<T>(val type: String, val data: T, val id: String)
// The main-looper executor (PyreonStreamAndroid.kt) the emit hands the container.
object PyreonStreamMain : java.util.concurrent.Executor {
  override fun execute(command: Runnable) {}
}
class PyreonStream<E>(val maxEvents: Long = 1000L, main: java.util.concurrent.Executor = java.util.concurrent.Executor { it.run() }) {
  val events: MutableState<List<E>> = mutableStateOf(emptyList())
  val latest: MutableState<E?> = mutableStateOf(null)
  val status: MutableState<String> = mutableStateOf("idle")
  val error: MutableState<Throwable?> = mutableStateOf(null)
  val restartTick: MutableState<Int> = mutableStateOf(0)
  fun begin() {}
  fun push(event: E) {}
  fun fail(failure: Throwable) {}
  fun abort() {}
  fun restart() {}
  fun stop() {}
  fun idle() {}
  fun startSse(request: PyreonStreamRequest, options: PyreonSseOptions = PyreonSseOptions(), accept: String = "text/event-stream", onEvent: ((E) -> Unit)? = null, decode: (PyreonSseMessage) -> E) {}
  fun startNdjson(request: PyreonStreamRequest, accept: String = "application/x-ndjson", onEvent: ((E) -> Unit)? = null, decode: (String) -> E) {}
}

`

export const queryStubs: StubAugmentation = {
  swift: (source) =>
    (/\bPyreonQuery\b/.test(source) ? QUERY_SWIFT_STUBS : '') +
    (/\bPyreonStream\b/.test(source) ? STREAM_SWIFT_STUBS : ''),
  kotlin: (source) =>
    (/\bPyreonQuery\b/.test(source) ? QUERY_KOTLIN_STUBS : '') +
    (/\bPyreonStream\b/.test(source) ? STREAM_KOTLIN_STUBS : ''),
}
