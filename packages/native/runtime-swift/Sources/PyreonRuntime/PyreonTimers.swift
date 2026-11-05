import Foundation

/// JavaScript's `setTimeout` / `setInterval` / `clearTimeout` / `clearInterval` for emitted code.
///
/// The compiler lowers each call to this enum, so a delayed write in a handler
/// (`setTimeout(() => toast.set(''), 2000)`) or a ticking interval started in
/// `onMount` and cleared by its cleanup runs the same way on iOS as in a browser.
/// The web's contract, kept here:
///
/// - the callback runs on the main thread (a browser's event loop is its one
///   thread), after at least `ms` milliseconds; a negative or non-finite delay
///   is 0;
/// - the id is a positive integer, never reused; clearing an id that already
///   fired, was cleared, or never existed (`0`, `nil`) does nothing, and
///   `clearTimeout` / `clearInterval` are interchangeable;
/// - a timeout forgets itself once it has run, so the table only holds pending
///   timeouts and live intervals — an interval lives until it is cleared, as on
///   the web.
///
/// Timers are scheduled in the run loop's `.common` modes, so they keep firing
/// while a scroll view is tracking a drag — a browser does not pause timers for
/// scrolling either.
public enum PyreonTimers {
    /// The table, behind one lock: the state is reached only through it, which is what makes it safe to share.
    private final class Table: @unchecked Sendable {
        let lock = NSLock()
        var nextId = 0
        var timers: [Int: Timer] = [:]
    }
    private static let table = Table()

    @discardableResult
    public static func setTimeout(_ ms: Double, _ fn: @escaping () -> Void) -> Int {
        schedule(ms, repeats: false, fn)
    }

    @discardableResult
    public static func setTimeout(_ ms: Int, _ fn: @escaping () -> Void) -> Int {
        schedule(Double(ms), repeats: false, fn)
    }

    @discardableResult
    public static func setInterval(_ ms: Double, _ fn: @escaping () -> Void) -> Int {
        schedule(ms, repeats: true, fn)
    }

    @discardableResult
    public static func setInterval(_ ms: Int, _ fn: @escaping () -> Void) -> Int {
        schedule(Double(ms), repeats: true, fn)
    }

    /// `clearTimeout(id)` / `clearInterval(id)`.
    public static func clear(_ id: Int?) {
        guard let id else { return }
        table.lock.lock()
        let timer = table.timers.removeValue(forKey: id)
        table.lock.unlock()
        timer?.invalidate()
    }

    /// The number of timers still scheduled — pending timeouts plus live intervals.
    public static var pendingCount: Int {
        table.lock.lock()
        defer { table.lock.unlock() }
        return table.timers.count
    }

    private static func schedule(_ ms: Double, repeats: Bool, _ fn: @escaping () -> Void) -> Int {
        let delay = ms.isFinite ? max(ms, 0) / 1000 : 0
        let table = self.table
        table.lock.lock()
        table.nextId += 1
        let id = table.nextId
        table.lock.unlock()
        // The callback runs on the main run loop, the one thread emitted code mutates view state from; the box only
        // carries it across the Sendable closure `Timer` takes.
        let box = Callback(fn)
        // A zero-interval repeating Timer would spin the run loop; browsers clamp a busy interval too.
        let timer = Timer(timeInterval: repeats ? max(delay, 0.001) : delay, repeats: repeats) { _ in
            if !repeats {
                table.lock.lock()
                table.timers.removeValue(forKey: id)
                table.lock.unlock()
            }
            box.fn()
        }
        table.lock.lock()
        table.timers[id] = timer
        table.lock.unlock()
        RunLoop.main.add(timer, forMode: .common)
        return id
    }

    private final class Callback: @unchecked Sendable {
        let fn: () -> Void
        init(_ fn: @escaping () -> Void) { self.fn = fn }
    }
}
