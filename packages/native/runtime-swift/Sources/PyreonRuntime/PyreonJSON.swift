// PyreonJSON — the serialization helper for the `<WebView>` live-data
// bridge. PMTC emits `PyreonJSON.encode(signal)` for `<WebView
// data={signal}>`; this encodes any Encodable value (PMTC-emitted structs
// are `Codable`) to a compact JSON string suitable for injecting into the
// hosted page as `window.__pyreonData`. Never throws into the view layer —
// returns the JSON literal `null` on the (practically unreachable) encode
// failure, which the page reads as "no data yet".

import Foundation

public enum PyreonJSON {
    public static func encode<T: Encodable>(_ value: T) -> String {
        guard let data = try? JSONEncoder().encode(value),
              let json = String(data: data, encoding: .utf8)
        else { return "null" }
        return json
    }
}
