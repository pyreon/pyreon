import Foundation

public struct PyreonFlowWebViewSelection {
    public let id: String
    public let data: Any?
}

public struct PyreonFlowWebViewViewport {
    public let x: Double
    public let y: Double
    public let zoom: Double
}

public struct PyreonFlowWebViewEvent {
    public let type: String
    public let id: String?
    public let data: Any?
    public let source: String?
    public let target: String?
    public let viewport: PyreonFlowWebViewViewport?
}

public struct PyreonFlowWebViewError: Error {
    public let message: String
}

/// Merge viewport commands into a graph without requiring the graph's native
/// model type to know about the private bridge field.
public func pyreonFlowWebViewData(graph: String, commands: String) -> String {
    guard let graphData = graph.data(using: .utf8),
          var object = try? JSONSerialization.jsonObject(with: graphData) as? [String: Any],
          let commandsData = commands.data(using: .utf8),
          let decodedCommands = try? JSONSerialization.jsonObject(with: commandsData) as? [Any]
    else { return graph }
    object["__pyreonFlowCommands"] = decodedCommands
    guard let merged = try? JSONSerialization.data(withJSONObject: object),
          let result = String(data: merged, encoding: .utf8)
    else { return graph }
    return result
}

/// Parse the web host's reverse channel once, then fan it out with the same
/// semantics as the TypeScript `FlowWebView` wrapper.
public func pyreonDispatchFlowWebViewMessage(
    _ message: String,
    onSelect: ((PyreonFlowWebViewSelection) -> Void)? = nil,
    onMessage: ((Any?) -> Void)? = nil,
    onEvent: ((PyreonFlowWebViewEvent) -> Void)? = nil,
    onError: ((PyreonFlowWebViewError) -> Void)? = nil
) {
    let payload: Any?
    if let data = message.data(using: .utf8), let decoded = try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed]) {
        payload = decoded
    } else {
        payload = message
    }
    onMessage?(pyreonFlowJSONValue(payload))
    guard let object = payload as? [String: Any] else {
        if let id = payload as? String { onSelect?(PyreonFlowWebViewSelection(id: id, data: nil)) }
        return
    }
    if (object["__pyreonFlowHostError"] as? NSNumber)?.intValue == 1 {
        let text = object["message"] as? String ?? "Flow host failed"
        onError?(PyreonFlowWebViewError(message: text))
        return
    }
    if let id = object["id"] as? String {
        let selection = PyreonFlowWebViewSelection(id: id, data: pyreonFlowJSONValue(object["data"]))
        onSelect?(selection)
    }
    let type = object["type"] as? String
    if type == nil, let id = object["id"] as? String {
        onEvent?(PyreonFlowWebViewEvent(type: "node-select", id: id, data: pyreonFlowJSONValue(object["data"]), source: nil, target: nil, viewport: nil))
        return
    }
    guard type == "edge-select" || type == "viewport-change" else { return }
    var viewport: PyreonFlowWebViewViewport?
    if let value = object["viewport"] as? [String: Any] {
        viewport = PyreonFlowWebViewViewport(
            x: (value["x"] as? NSNumber)?.doubleValue ?? 0,
            y: (value["y"] as? NSNumber)?.doubleValue ?? 0,
            zoom: (value["zoom"] as? NSNumber)?.doubleValue ?? 1)
    }
    onEvent?(PyreonFlowWebViewEvent(
        type: type!, id: object["id"] as? String, data: nil,
        source: object["source"] as? String, target: object["target"] as? String,
        viewport: viewport))
}

private func pyreonFlowJSONValue(_ value: Any?) -> Any? {
    if value == nil || value is NSNull { return nil }
    if let object = value as? [String: Any] {
        return object.mapValues { pyreonFlowJSONValue($0) as Any }
    }
    if let array = value as? [Any] { return array.map { pyreonFlowJSONValue($0) as Any } }
    return value
}
