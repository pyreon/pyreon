// PyreonStream wire parsers + state machine — a standalone assertion program
// the co-source verify gate compiles with ../swift/PyreonStream.swift
// (-parse-as-library) and runs. Not shipped — lives under native/tests/.
//
// The byte-for-byte agreement with the WEB parser is proven separately, by
// execution, in @pyreon/native-compiler's native-stream-parser-parity test.
// This file locks the behaviours that need no oracle.

import Foundation

@main
struct PyreonStreamTests {
    static func check(_ cond: Bool, _ message: String) {
        if !cond { fatalError("PyreonStreamTests: \(message)") }
    }

    static func sse(_ chunks: [String]) -> [PyreonSseMessage] {
        var splitter = PyreonStreamLineSplitter()
        var parser = PyreonSseParser()
        var out: [PyreonSseMessage] = []
        for chunk in chunks {
            for b in Array(chunk.utf8) {
                if let line = splitter.push(b), let m = parser.line(line) { out.append(m) }
            }
        }
        return out
    }

    static func main() {
        // Multi-line data joins with \n; the event is named.
        let a = sse(["event: tick\ndata: a\ndata: b\n\n"])
        check(a == [PyreonSseMessage(type: "tick", data: "a\nb", id: "", retry: nil)], "multi-line data")

        // Comments skipped; default type is message.
        check(sse([": keep-alive\n\ndata: x\n\n"]).map(\.type) == ["message"], "comment + default type")

        // A CRLF split across chunks is ONE terminator.
        check(sse(["data: one\r", "\n\r", "\ndata: two\r\n\r\n"]).map(\.data) == ["one", "two"], "split CRLF")

        // Exactly one leading BOM is stripped.
        check(sse(["\u{FEFF}data: x\n\n"]).map(\.data) == ["x"], "BOM stripped")
        check(sse(["\u{FEFF}\u{FEFF}data: x\n\n"]).isEmpty, "a second BOM is content")

        // id: sticky, NUL ignored; retry: digits only, sticky.
        let ids = sse(["id: 1\ndata: a\n\ndata: b\n\nid: 2\u{0}x\ndata: c\n\nid\ndata: d\n\n"]).map(\.id)
        check(ids == ["1", "1", "1", ""], "id semantics: \(ids)")
        let retries = sse(["retry: 1x\ndata: a\n\nretry: 250\n\ndata: b\n\n"]).map(\.retry)
        check(retries == [nil, 250], "retry semantics: \(retries)")

        // One leading space dropped; a field without a colon has an empty value.
        check(sse(["data\ndata:  two spaces\nfoo: bar\n\n"]).map(\.data) == ["\n two spaces"], "space + no-colon")

        // No data → no dispatch; an unterminated trailing event is discarded.
        check(sse(["event: x\n\ndata: done\n\ndata: partial"]).map(\.data) == ["done"], "unterminated discarded")

        // A multi-byte character split across chunks decodes intact.
        do {
            var splitter = PyreonStreamLineSplitter()
            var parser = PyreonSseParser()
            var got: [PyreonSseMessage] = []
            let bytes = Array("data: héllo 🙂\n\n".utf8)
            for b in bytes { if let l = splitter.push(b), let m = parser.line(l) { got.append(m) } }
            check(got.map(\.data) == ["héllo 🙂"], "multi-byte")
        }

        // NDJSON: blank lines skipped (JS trim whitespace), numbers count every
        // line, and the unterminated tail is a value.
        do {
            var splitter = PyreonStreamLineSplitter()
            var lines = PyreonNdjsonLines()
            var got: [String] = []
            for b in Array("{\"a\":1}\n\n \u{00A0}\n{\"a\":2}\n{\"a\":3}".utf8) {
                if let l = splitter.push(b), let hit = lines.line(l) { got.append("\(hit.0):\(hit.1)") }
            }
            if let tail = splitter.finish(), let hit = lines.line(tail) { got.append("\(hit.0):\(hit.1)") }
            check(got == ["1:{\"a\":1}", "4:{\"a\":2}", "5:{\"a\":3}"], "ndjson lines: \(got)")
        }

        // Retry classification mirrors isRetryableStreamError.
        check(PyreonStreamPolicy.isRetryable(URLError(.networkConnectionLost)), "network retries")
        check(PyreonStreamPolicy.isRetryable(PyreonStreamError.badStatus(503)), "5xx retries")
        check(PyreonStreamPolicy.isRetryable(PyreonStreamError.badStatus(429)), "429 retries")
        check(!PyreonStreamPolicy.isRetryable(PyreonStreamError.badStatus(401)), "401 does not")
        check(!PyreonStreamPolicy.isRetryable(PyreonStreamError.decode("x")), "decode does not")

        // Backoff: base * 2^(n-1), capped; a clean end waits the base.
        check(PyreonStreamPolicy.wait(failed: true, base: 1000, failures: 1, maxDelay: 30_000) == 1000, "1st")
        check(PyreonStreamPolicy.wait(failed: true, base: 1000, failures: 3, maxDelay: 30_000) == 4000, "3rd")
        check(PyreonStreamPolicy.wait(failed: true, base: 1000, failures: 9, maxDelay: 30_000) == 30_000, "capped")
        check(PyreonStreamPolicy.wait(failed: false, base: 250, failures: 4, maxDelay: 100) == 250, "clean end")

        // Decoders.
        do {
            struct Row: Decodable, Equatable { var a: Int }
            let msg = PyreonSseMessage(type: "t", data: "{\"a\":7}", id: "9", retry: nil)
            let ev = try PyreonStreamDecode.sseJSON(Row.self)(msg)
            check(ev.data == Row(a: 7) && ev.type == "t" && ev.id == "9", "sseJSON")
            let bad = PyreonSseMessage(type: "t", data: "nope", id: "", retry: nil)
            var threw = false
            do { _ = try PyreonStreamDecode.sseJSON(Row.self)(bad) } catch { threw = !PyreonStreamPolicy.isRetryable(error) }
            check(threw, "a bad payload is a non-retryable decode error")
            check(try PyreonStreamDecode.sseText()(bad).data == "nope", "sseText")
            check(try PyreonStreamDecode.ndjson(Row.self)("{\"a\":1}") == Row(a: 1), "ndjson decode")
        } catch {
            check(false, "decoder threw: \(error)")
        }

        guard #available(iOS 17.0, macOS 14.0, *) else {
            print("[PyreonStreamTests] container checks skipped (needs @Observable)")
            return
        }
        // Container: bounded buffer, status vocabulary, abort/restart.
        let s = PyreonStream<Int>(maxEvents: 2)
        check(s.status == "idle", "starts idle")
        s.begin()
        check(s.status == "connecting", "begin connects")
        s.push(1)
        s.push(2)
        s.push(3)
        check(s.events == [2, 3], "bounded to maxEvents: \(s.events)")
        check(s.latest == 3 && s.status == "open", "latest + open")
        s.fail(PyreonStreamError.badStatus(500))
        check(s.status == "error" && s.error != nil, "fail")
        s.abort()
        check(s.status == "closed", "abort closes")
        let tick = s.restartTick
        s.restart()
        check(s.restartTick == tick + 1, "restart bumps the task key")

        print("[PyreonStreamTests] all checks passed")
    }
}
