import Foundation

public struct PyreonChartWebViewSelection {
    public let seriesName: String?
    public let seriesIndex: Int?
    public let name: String?
    public let dataIndex: Int?
    public let value: Any?
    public let componentType: String?
}

public struct PyreonChartWebViewEvent {
    public let name: String
    public let payload: [String: Any]
}

public struct PyreonChartWebViewError: Error {
    public let message: String
}

public func pyreonChartWebViewData(
    option: String,
    commands: String,
    loading: Bool,
    loadingOptions: String,
    group: String? = nil
) -> String {
    let decodedOption = pyreonChartDecode(option) ?? [:]
    let decodedCommands = pyreonChartDecode(commands) as? [Any] ?? []
    let decodedLoadingOptions = pyreonChartDecode(loadingOptions) as? [String: Any] ?? [:]
    var envelope: [String: Any] = [
        "__pyreonChartHost": 1,
        "option": decodedOption,
        "commands": decodedCommands,
        "loading": ["visible": loading, "options": decodedLoadingOptions],
    ]
    if let group, !group.isEmpty { envelope["group"] = group }
    guard let data = try? JSONSerialization.data(withJSONObject: envelope),
          let result = String(data: data, encoding: .utf8)
    else { return option }
    return result
}

public func pyreonDispatchChartWebViewMessage(
    _ message: String,
    onSelect: ((PyreonChartWebViewSelection) -> Void)? = nil,
    onEvent: ((PyreonChartWebViewEvent) -> Void)? = nil,
    onError: ((PyreonChartWebViewError) -> Void)? = nil
) {
    guard let raw = pyreonChartDecode(message) else {
        onSelect?(PyreonChartWebViewSelection(
            seriesName: nil, seriesIndex: nil, name: message, dataIndex: nil,
            value: nil, componentType: nil))
        return
    }
    guard let object = raw as? [String: Any] else { return }
    if let error = object["error"] {
        onError?(PyreonChartWebViewError(message: error as? String ?? String(describing: error)))
        return
    }
    if (object["__pyreonChartEvent"] as? NSNumber)?.intValue == 1 {
        onEvent?(PyreonChartWebViewEvent(
            name: object["name"] as? String ?? "",
            payload: object["payload"] as? [String: Any] ?? [:]))
        return
    }
    onSelect?(PyreonChartWebViewSelection(
        seriesName: object["seriesName"] as? String,
        seriesIndex: (object["seriesIndex"] as? NSNumber)?.intValue,
        name: object["name"] as? String,
        dataIndex: (object["dataIndex"] as? NSNumber)?.intValue,
        value: object["value"],
        componentType: object["componentType"] as? String))
}

private func pyreonChartDecode(_ json: String) -> Any? {
    guard let data = json.data(using: .utf8) else { return nil }
    return try? JSONSerialization.jsonObject(with: data, options: [.fragmentsAllowed])
}
