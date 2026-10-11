import type { StubAugmentation } from '@pyreon/native-compiler/plugin-api'

export const RATE_SWIFT_STUBS = `public protocol PyreonScheduler: AnyObject {
  func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int
  func cancel(_ token: Int)
}
public final class TaskScheduler: PyreonScheduler {
  public init() {}
  public func schedule(after milliseconds: Int, _ work: @escaping () -> Void) -> Int { 0 }
  public func cancel(_ token: Int) {}
}
public final class PyreonDebounced<A> {
  public var action: (A) -> Void = { _ in }
  public init(delayMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {}
  public func callAsFunction(_ arg: A) {}
  public func cancel() {}
  public func flush() {}
}
public final class PyreonThrottled<A> {
  public var action: (A) -> Void = { _ in }
  public init(waitMs: Int, scheduler: PyreonScheduler = TaskScheduler(), action: @escaping (A) -> Void = { _ in }) {}
  public func callAsFunction(_ arg: A) {}
  public func cancel() {}
}`

export const RATE_KOTLIN_STUBS = `interface PyreonScheduler {
  fun schedule(milliseconds: Long, work: () -> Unit): Int
  fun cancel(token: Int)
}
class PyreonTaskScheduler : PyreonScheduler {
  override fun schedule(milliseconds: Long, work: () -> Unit): Int = 0
  override fun cancel(token: Int) {}
}
class PyreonDebounced<A>(delayMs: Long, scheduler: PyreonScheduler, action: (A) -> Unit) {
  operator fun invoke(arg: A) {}
  fun cancel() {}
  fun flush() {}
}
class PyreonThrottled<A>(waitMs: Long, scheduler: PyreonScheduler, action: (A) -> Unit) {
  operator fun invoke(arg: A) {}
  fun cancel() {}
}`

/** Append package stubs only when the generated program references a rate limiter. */
export const statefulStubs: StubAugmentation = {
  swift: (source) => (/\bPyreon(?:Debounced|Throttled)\b/.test(source) ? RATE_SWIFT_STUBS : ''),
  kotlin: (source) => (/\bPyreon(?:Debounced|Throttled)\b/.test(source) ? RATE_KOTLIN_STUBS : ''),
}
