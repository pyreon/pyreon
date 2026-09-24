import Foundation

@main
struct PyreonChartWebViewTests {
    static func main() {
        let data = pyreonChartWebViewData(
            option: #"{"series":[{"data":[1,2]}]}"#,
            commands: #"[{"id":"restore","type":"restore"}]"#,
            loading: true,
            loadingOptions: #"{"text":"Loading"}"#)
        let envelope = try! JSONSerialization.jsonObject(with: Data(data.utf8)) as! [String: Any]
        precondition((envelope["__pyreonChartHost"] as? NSNumber)?.intValue == 1)
        precondition(((envelope["commands"] as? [Any])?.count) == 1)
        precondition(((envelope["loading"] as? [String: Any])?["visible"] as? Bool) == true)

        var selected: PyreonChartWebViewSelection?
        pyreonDispatchChartWebViewMessage(#"{"name":"A","value":42}"#, onSelect: { selected = $0 })
        precondition(selected?.name == "A")

        var event: PyreonChartWebViewEvent?
        pyreonDispatchChartWebViewMessage(
            #"{"__pyreonChartEvent":1,"name":"zoom","payload":{"start":10}}"#,
            onEvent: { event = $0 })
        precondition(event?.name == "zoom")
        precondition((event?.payload["start"] as? NSNumber)?.intValue == 10)

        var error: PyreonChartWebViewError?
        pyreonDispatchChartWebViewMessage(#"{"error":"failed"}"#, onError: { error = $0 })
        precondition(error?.message == "failed")

        print("PyreonChartWebViewTests: all checks passed")
    }
}
